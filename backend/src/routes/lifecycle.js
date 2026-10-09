const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { computeStandings } = require('../services/standings');
const { decide } = require('../services/bracket');

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
      // En Liga+Copa los playoffs se arman al terminar la liga
      .filter((s) => !(t.format === 'LEAGUE_CUP' && s.type === 'KNOCKOUT'))
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

function knockoutChampion(stages, matchesByStage) {
  const ko = stages.filter((s) => s.type === 'KNOCKOUT');
  if (!ko.length) return null;
  const top = Math.max(...ko.map((s) => s.phase));
  const last = ko.filter((s) => s.phase === top);
  if (last.length !== 1) return null;
  const ms = matchesByStage.get(last[0].id) || [];
  if (!ms.length) return null;
  const maxRound = Math.max(...ms.map((m) => m.round || 0));
  const final = ms.find((m) => m.round === maxRound && m.slot === 1);
  const res = final && final.status === 'FINISHED' ? decide(final) : null;
  return res ? res.winnerTeamId : null;
}

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
        id: true, stageId: true, round: true, slot: true, status: true, teamAId: true, teamBId: true,
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
      championId = knockoutChampion(t.stages, byStage);
    }

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
          setsFor: r.setsFor,
          setsAgainst: r.setsAgainst,
          tied: !!r.tied,
          zone: r.zone || null,
        });
      }
    }

    // Torneo solo de liga sin campeón definido a mano: líder único de la zona de mayor nivel
    if (!championId && !t.stages.some((s) => s.type === 'KNOCKOUT')) {
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
        id: true, name: true, phase: true, tier: true, promotions: true, relegations: true,
        standings: { orderBy: [{ position: 'asc' }], include: { team: { select: TEAM_SELECT } } },
      },
    });
    res.json({ tournament: t, stages });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;