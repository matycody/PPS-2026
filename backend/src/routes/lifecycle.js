const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { computeStandings } = require('../services/standings');
const { decide } = require('../services/bracket');
const { knockoutChampion } = require('../services/champion');
const { savePlaces } = require('../services/podium');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];
const TEAM_SELECT = { id: true, name: true, logo: true };

function handleDbError(err, res) {
  console.error('[lifecycle]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// Pasa el torneo de borrador a activo. Exige estructura y partidos generados.
router.post('/:id/activate', ...admin, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { stages: true, teams: { select: { teamId: true } } },
    });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status !== 'DRAFT') return res.status(409).json({ error: 'Solo se activa un torneo en borrador' });
    if (t.teams.length < 2) return res.status(409).json({ error: 'Inscribí al menos 2 equipos' });
    if (!t.stages.length) return res.status(409).json({ error: 'Definí la estructura (zonas o llaves) antes de activar' });

    const counts = await prisma.match.groupBy({
      by: ['stageId'],
      where: { tournamentId: t.id },
      _count: { _all: true },
    });
    const withMatches = new Set(counts.filter((c) => c._count._all > 0).map((c) => c.stageId));
    const missing = t.stages
      .filter((s) => !withMatches.has(s.id))
      // En Liga y Liga+Copa las llaves se arman al terminar la liga
      .filter((s) => !(t.format !== 'CUP' && s.type === 'KNOCKOUT'))
      .map((s) => s.name);
    if (missing.length) {
      return res.status(409).json({ error: 'Faltan generar partidos (sorteo o llave) en: ' + missing.join(', ') });
    }

    const updated = await prisma.tournament.update({ where: { id: t.id }, data: { status: 'ACTIVE' } });
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Cierra el torneo: congela las tablas de las zonas y registra el campeón.
// Body: championId (opcional, para definirlo a mano), force (cerrar con partidos sin terminar)
router.post('/:id/close', ...admin, async (req, res) => {
  try {
    const b = req.body || {};
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { stages: true, teams: { select: { teamId: true } } },
    });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status !== 'ACTIVE') return res.status(409).json({ error: 'Solo se cierra un torneo activo' });

    const matches = await prisma.match.findMany({
      where: { tournamentId: t.id, hiddenAt: null },
      select: {
        id: true, stageId: true, round: true, slot: true, status: true, teamAId: true, teamBId: true, loserMatchId: true,
        sets: { select: { winnerTeamId: true } },
      },
    });
    const pending = matches.filter((m) => m.status !== 'FINISHED' && m.status !== 'CANCELLED');
    if (pending.length && b.force !== true) {
      return res.status(409).json({
        error: 'Hay ' + pending.length + ' partidos sin terminar. Finalizalos o cancelalos, o enviá force: true',
        pending: pending.length,
      });
    }

    let championId;
    if (b.championId !== undefined && b.championId !== null) {
      if (!t.teams.some((x) => x.teamId === b.championId)) {
        return res.status(400).json({ error: 'championId no es un equipo del torneo' });
      }
      championId = b.championId;
    } else {
      const byStage = new Map();
      for (const m of matches) {
        if (!byStage.has(m.stageId)) byStage.set(m.stageId, []);
        byStage.get(m.stageId).push(m);
      }
      championId = t.format === 'LEAGUE' ? null : knockoutChampion(t.stages, byStage);
    }

    // 2.º y 3.º puestos a mano (opcionales): equipos del torneo, sin repetir
    const second = b.secondId || null;
    const third = b.thirdId || null;
    const chosen = [championId, second, third].filter(Boolean);
    if ([second, third].some((x) => x && !t.teams.some((y) => y.teamId === x))) return res.status(400).json({ error: 'El 2.º y el 3.º tienen que ser equipos del torneo' });
    if (new Set(chosen).size !== chosen.length) return res.status(400).json({ error: 'Un equipo no puede ocupar dos puestos del podio' });

    const data = await computeStandings(t.id);
    const standings = [];
    let unresolvedTies = 0;
    for (const s of data.stages) {
      for (const r of s.rows) {
        if (r.tied) unresolvedTies++;
        standings.push({
          stageId: s.id,
          teamId: r.teamId,
          position: r.position,
          points: r.points,
          played: r.played,
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          setsFor: r.pointsFor, // se congelan los puntos de juego (PJ / PC)
          setsAgainst: r.pointsAgainst,
          tied: !!r.tied,
          zone: r.zone || null,
        });
      }
    }

    // Torneo solo de liga sin campeón definido a mano: líder único de la zona de mayor nivel
    if (!championId && (t.format === 'LEAGUE' || !t.stages.some((s) => s.type === 'KNOCKOUT' && !s.isPromotion))) {
      const leagues = t.stages.filter((s) => s.type === 'LEAGUE');
      const topPhase = Math.max(...leagues.map((s) => s.phase));
      const topTier = Math.min(...leagues.filter((s) => s.phase === topPhase).map((s) => s.tier ?? 1));
      const tops = leagues.filter((s) => s.phase === topPhase && (s.tier ?? 1) === topTier);
      if (tops.length === 1) {
        const first = standings.filter((x) => x.stageId === tops[0].id && x.position === 1);
        if (first.length === 1) championId = first[0].teamId;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.stageStanding.deleteMany({ where: { stage: { tournamentId: t.id } } });
      if (standings.length) await tx.stageStanding.createMany({ data: standings });
      await tx.tournament.update({ where: { id: t.id }, data: { status: 'FINISHED', championId: championId || null } });
      if (second || third) await savePlaces(tx, t.id, { second: second || undefined, third: third || undefined });
    });

    res.json({
      id: t.id,
      status: 'FINISHED',
      championId: championId || null,
      frozenRows: standings.length,
      unresolvedTies,
      pendingForced: pending.length,
    });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Podio a mano: campeón, 2.º y 3.º (cada uno: id = fijar, null = automático, sin enviar = no tocar). Solo en torneos terminados.
router.put('/:id/podium', ...admin, async (req, res) => {
  try {
    const b = req.body || {};
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { teams: { select: { teamId: true } } } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status !== 'FINISHED') return res.status(409).json({ error: 'El podio se edita cuando el torneo está terminado (antes se elige al cerrarlo)' });
    const norm = (v) => (v === undefined ? undefined : v || null);
    const first = norm(b.firstId);
    const second = norm(b.secondId);
    const third = norm(b.thirdId);
    for (const x of [first, second, third]) {
      if (x && !t.teams.some((y) => y.teamId === x)) return res.status(400).json({ error: 'El podio solo admite equipos del torneo' });
    }
    const { podiums } = require('../services/podium');
    const final = {
      first: first === undefined ? t.championId : first,
      second: second === undefined ? (await podiums([{ id: t.id, championId: t.championId }])).get(t.id)?.manual.second ?? null : second,
      third: third === undefined ? (await podiums([{ id: t.id, championId: t.championId }])).get(t.id)?.manual.third ?? null : third,
    };
    const chosen = Object.values(final).filter(Boolean);
    if (new Set(chosen).size !== chosen.length) return res.status(400).json({ error: 'Un equipo no puede ocupar dos puestos del podio' });
    await prisma.$transaction(async (tx) => {
      if (first !== undefined) await tx.tournament.update({ where: { id: t.id }, data: { championId: first } });
      await savePlaces(tx, t.id, { second, third });
    });
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Tabla final congelada (pública): lo que quedó registrado al cerrar el torneo
router.get('/:id/final-standings', async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, year: true, edition: true, status: true, champion: { select: TEAM_SELECT } },
    });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status !== 'FINISHED') return res.status(409).json({ error: 'El torneo todavía no finalizó' });
    const stages = await prisma.stage.findMany({
      where: { tournamentId: t.id, standings: { some: {} } },
      orderBy: [{ phase: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, phase: true, tier: true, promotions: true, relegations: true, playoffPositions: true,
        standings: { orderBy: [{ position: 'asc' }], include: { team: { select: TEAM_SELECT } } },
      },
    });
    res.json({ tournament: t, stages });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;