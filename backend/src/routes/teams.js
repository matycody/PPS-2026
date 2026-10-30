const express = require('express');
const prisma = require('../db');
const { VENUE_SELECT } = require('../lib/venue');
const { authenticate, requireRole } = require('../middleware/auth');
const { activeSuspensions } = require('../services/sanctions');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const BRANCHES = ['MIXED', 'MALE', 'FEMALE'];
// Sexo -> ramas permitidas
const ALLOWED = { M: ['MIXED', 'MALE'], F: ['MIXED', 'FEMALE'] };
const MODALITIES = ['FOAM', 'CLOTH'];

// Sin dato = las dos modalidades. Con dato: al menos una y todas validas.
function parseModalities(raw) {
  if (raw === undefined) return [...MODALITIES];
  const modalities = [...new Set(raw || [])];
  if (!modalities.length || modalities.some((m) => !MODALITIES.includes(m))) return null;
  return modalities;
}

function parseBranches(raw) {
  const branches = [...new Set(raw || [])];
  if (!branches.length || branches.some((b) => !BRANCHES.includes(b))) return null;
  return branches;
}

function handleDbError(err, res) {
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'El jugador ya tiene equipo activo en esa rama' });
  }
  console.error('[teams]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// Escudos propios por rama: { MALE: url, FEMALE: url } (solo las que tienen)
const branchLogos = (branches) => Object.fromEntries(branches.filter((b) => b.logo).map((b) => [b.branch, b.logo]));

// Crear equipo
router.post('/', ...admin, async (req, res) => {
  try {
    const { name, logo } = req.body;
    const branches = parseBranches(req.body.branches);
    const modalities = parseModalities(req.body.modalities);
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
    if (!branches) return res.status(400).json({ error: 'Ramas invÃ¡lidas (MIXED, MALE, FEMALE)' });
    if (!modalities) return res.status(400).json({ error: 'Modalidades invalidas (FOAM, CLOTH)' });

    const team = await prisma.team.create({
      data: {
        name: String(name).trim(),
        logo: logo || null,
        branches: { create: branches.map((branch) => ({ branch })) },
        modalities: { create: modalities.map((modality) => ({ modality })) },
      },
      include: { branches: true },
    });
    res.status(201).json(team);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Listado (pÃºblico)
router.get('/', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      include: { branches: true, modalities: true },
      orderBy: { name: 'asc' },
    });
    res.json(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        logo: t.logo,
        branchLogos: branchLogos(t.branches),
        branches: t.branches.map((b) => b.branch),
        modalities: t.modalities.map((m) => m.modality),
      }))
    );
  } catch (err) {
    handleDbError(err, res);
  }
});

// Detalle con plantel activo (pÃºblico: solo nombre, sin DNI ni mail ni foto)
router.get('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        branches: true,
        modalities: true,
        players: {
          where: { to: null, profile: { active: true } },
          include: { profile: { select: { id: true, name: true, nickname: true, number: true, showNickname: true, showNumber: true } } },
        },
      },
    });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const sus = await activeSuspensions(team.players.map((p) => p.profile.id)).catch(() => new Map());

    res.json({
      id: team.id,
      name: team.name,
      logo: team.logo,
      branchLogos: branchLogos(team.branches),
      nickname: team.nickname,
      city: team.city,
      foundedYear: team.foundedYear,
      branches: team.branches.map((b) => b.branch),
      modalities: team.modalities.map((m) => m.modality),
      roster: team.players.map((p) => ({
        profileId: p.profile.id,
        name: p.profile.name,
        nickname: p.profile.showNickname ? p.profile.nickname : null,
        number: p.profile.showNumber ? p.profile.number : null,
        branch: p.branch,
        coach: p.isCoach,
        suspension: sus.get(p.profile.id) || null,
      })),
    });
  } catch (err) {
    handleDbError(err, res);
  }
});

// ───────────── Posiciones del equipo ─────────────
// Por cada torneo que juega (visible): la tabla de SU zona (no las de otras zonas) y su camino a los playoffs.
const POS_TEAM = { id: true, name: true, logo: true };

function sets2score(m) {
  const win = m.modality === 'CLOTH' ? 2 : 1;
  let a = 0;
  let b = 0;
  for (const st of m.sets) {
    if (!st.winnerTeamId) {
      if (m.modality === 'CLOTH') { a += 1; b += 1; }
    } else if (st.winnerTeamId === m.teamAId) a += win;
    else if (st.winnerTeamId === m.teamBId) b += win;
  }
  return { teamA: a, teamB: b };
}

router.get('/:id/posiciones', async (req, res) => {
  try {
    const teamId = req.params.id;
    const { computeStandings } = require('../services/standings');
    const { phasesFor } = require('../services/matchPhase');

    const tts = await prisma.tournamentTeam.findMany({
      where: { teamId, tournament: { status: { not: 'DRAFT' }, pausedAt: null, deletedAt: null } },
      include: { tournament: { select: { id: true, name: true, year: true, edition: true, branch: true, modality: true, format: true, status: true } } },
    });

    const items = await Promise.all(tts.map(async ({ tournament: t }) => {
      const stages = await prisma.stage.findMany({
        where: { tournamentId: t.id },
        include: { teams: { where: { teamId }, select: { teamId: true } } },
      });
      const zone = stages.find((s) => s.type === 'LEAGUE' && s.teams.length) ?? null;
      const koIds = stages.filter((s) => s.type === 'KNOCKOUT').map((s) => s.id);

      let rows = [];
      let zoneDone = false;
      if (zone) {
        const data = await computeStandings(t.id, zone.id);
        const z = data && data.stages[0];
        rows = z ? z.rows.map((r) => ({ position: r.position, tied: r.tied, team: r.team, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, points: r.points, setDiff: r.setDiff, form: r.form })) : [];
        const own = await prisma.match.findMany({ where: { stageId: zone.id, hiddenAt: null }, select: { status: true } });
        zoneDone = own.length > 0 && own.every((x) => x.status === 'FINISHED' || x.status === 'CANCELLED');
      }
      const mine = rows.find((r) => r.team.id === teamId) ?? null;

      // Playoffs
      let qualification = null;
      let playoffs = [];
      if (zone && koIds.length) {
        const ko = await prisma.match.findMany({
          where: { stageId: { in: koIds }, hiddenAt: null },
          include: { sets: true },
        });
        const spots = [...new Set(ko.flatMap((m) => [m.teamAFrom, m.teamBFrom]).filter((f) => f && f.stageId === zone.id).map((f) => f.position))].sort((x, y) => x - y);
        if (spots.length && mine) {
          qualification = { position: mine.position, zoneName: zone.name, done: zoneDone, inSpot: spots.includes(mine.position), maxSpot: spots[spots.length - 1] };
        }
        const byId = new Map(ko.map((m) => [m.id, m]));
        const real = ko.filter((m) => m.teamAId === teamId || m.teamBId === teamId).sort((x, y) => (x.round ?? 0) - (y.round ?? 0));
        let entry = real[0] ?? null;
        if (!entry && !zoneDone && mine) {
          entry = ko.find((m) => [m.teamAFrom, m.teamBFrom].some((f) => f && f.stageId === zone.id && f.position === mine.position)) ?? null;
        }
        const chain = [];
        let cur = entry;
        while (cur && chain.length < 4) {
          chain.push(cur);
          const sc = sets2score(cur);
          const over = cur.status === 'FINISHED';
          const won = over && ((cur.teamAId === teamId && sc.teamA > sc.teamB) || (cur.teamBId === teamId && sc.teamB > sc.teamA));
          if (over && !won && cur.loserMatchId && byId.get(cur.loserMatchId) && chain.length < 3) {
            chain.push(byId.get(cur.loserMatchId));
            break;
          }
          if (over && !won) break;
          cur = cur.nextMatchId ? byId.get(cur.nextMatchId) ?? null : null;
        }
        if (chain.length) {
          const full = await prisma.match.findMany({
            where: { id: { in: chain.map((m) => m.id) } },
            include: { tournament: { select: { id: true, name: true } }, venue: { select: VENUE_SELECT }, teamA: { select: POS_TEAM }, teamB: { select: POS_TEAM }, sets: { orderBy: { number: 'asc' } } },
          });
          const phases = await phasesFor(full.map((m) => m.id)).catch(() => new Map());
          const order = new Map(chain.map((m, i) => [m.id, i]));
          playoffs = full
            .sort((x, y) => order.get(x.id) - order.get(y.id))
            .map((m) => ({
              id: m.id, tournament: m.tournament, court: m.court, venue: m.venue ?? null, branch: m.branch, modality: m.modality, status: m.status,
              scheduledAt: m.scheduledAt, finishedAt: m.finishedAt, statusReason: m.statusReason ?? null,
              originalScheduledAt: m.originalScheduledAt ?? null,
              teamA: m.teamA, teamB: m.teamB,
              sets: m.sets.map((st) => ({ number: st.number, winnerTeamId: st.winnerTeamId, draw: st.winnerTeamId === null })),
              score: sets2score(m), phase: phases.get(m.id) ?? null,
            }));
        }
      }
      return { tournament: t, zone: zone ? { id: zone.id, name: zone.name } : null, zoneDone, rows, qualification, playoffs };
    }));

    items.sort((a, b) => (b.tournament.status === 'ACTIVE') - (a.tournament.status === 'ACTIVE') || b.tournament.year - a.tournament.year);
    res.json(items);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Editar nombre, logo y ramas
router.patch('/:id', ...admin, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: { branches: true, modalities: true },
    });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const data = {};
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
      data.name = String(req.body.name).trim();
    }
    if (req.body.logo !== undefined) data.logo = req.body.logo || null;

    // Datos del banner público del equipo
    for (const [key, max] of [['nickname', 40], ['city', 60]]) {
      if (req.body[key] === undefined) continue;
      const v = req.body[key] === null ? '' : String(req.body[key]).trim();
      if (Array.from(v).length > max) return res.status(400).json({ error: key + ' no puede tener más de ' + max + ' caracteres' });
      data[key] = v === '' ? null : v;
    }
    if (req.body.foundedYear !== undefined) {
      const y = req.body.foundedYear;
      if (y === null || y === '') data.foundedYear = null;
      else if (!Number.isInteger(Number(y)) || Number(y) < 1900 || Number(y) > new Date().getFullYear()) {
        return res.status(400).json({ error: 'Año de fundación inválido' });
      } else data.foundedYear = Number(y);
    }

    const ops = [];
    if (req.body.branches !== undefined) {
      const next = parseBranches(req.body.branches);
      if (!next) return res.status(400).json({ error: 'Ramas invÃ¡lidas' });

      const current = team.branches.map((b) => b.branch);
      const removed = current.filter((b) => !next.includes(b));
      const added = next.filter((b) => !current.includes(b));

      if (removed.length) {
        const busy = await prisma.playerTeam.count({
          where: { teamId: team.id, branch: { in: removed }, to: null },
        });
        if (busy) {
          return res.status(409).json({ error: 'No podÃ©s quitar una rama con jugadores activos' });
        }
        ops.push(prisma.teamBranch.deleteMany({ where: { teamId: team.id, branch: { in: removed } } }));
      }
      if (added.length) {
        ops.push(
          prisma.teamBranch.createMany({ data: added.map((branch) => ({ teamId: team.id, branch })) })
        );
      }
    }

    if (req.body.modalities !== undefined) {
      const nextM = parseModalities(req.body.modalities);
      if (!nextM) return res.status(400).json({ error: 'Modalidades invalidas (FOAM, CLOTH)' });
      const currentM = team.modalities.map((m) => m.modality);
      const removedM = currentM.filter((m) => !nextM.includes(m));
      const addedM = nextM.filter((m) => !currentM.includes(m));

      if (removedM.length) {
        const pending = await prisma.match.count({
          where: {
            hiddenAt: null,
            modality: { in: removedM },
            status: { in: ['SCHEDULED', 'READY', 'LIVE'] },
            OR: [{ teamAId: team.id }, { teamBId: team.id }],
          },
        });
        if (pending) return res.status(409).json({ error: 'No podes quitar una modalidad con partidos pendientes' });
        ops.push(prisma.teamModality.deleteMany({ where: { teamId: team.id, modality: { in: removedM } } }));
      }
      if (addedM.length) {
        ops.push(prisma.teamModality.createMany({ data: addedM.map((modality) => ({ teamId: team.id, modality })) }));
      }
    }

    ops.push(prisma.team.update({ where: { id: team.id }, data, include: { branches: true, modalities: true } }));
    const results = await prisma.$transaction(ops);
    res.json(results[results.length - 1]);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Asignar jugador a un equipo en una rama (si ya tenÃ­a otro en esa rama: traspaso)
router.post('/:id/players', ...admin, async (req, res) => {
  try {
    const { profileId, branch } = req.body;
    if (!BRANCHES.includes(branch)) return res.status(400).json({ error: 'Rama invÃ¡lida' });

    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: { branches: true },
    });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });
    if (!team.branches.some((b) => b.branch === branch)) {
      return res.status(409).json({ error: 'El equipo no tiene esa rama' });
    }

    const profile = await prisma.profile.findUnique({ where: { id: String(profileId) } });
    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });
    if (!profile.active || !profile.isPlayer) {
      return res.status(409).json({ error: 'El perfil no es un jugador activo' });
    }
    if (!profile.sex) return res.status(409).json({ error: 'El jugador no tiene sexo cargado' });
    if (!ALLOWED[profile.sex].includes(branch)) {
      return res.status(409).json({ error: 'Rama no permitida para el sexo del jugador' });
    }

    const current = await prisma.playerTeam.findFirst({
      where: { profileId: profile.id, branch, to: null },
    });
    if (current && current.teamId === team.id) {
      return res.status(409).json({ error: 'Ya estÃ¡ en este equipo en esa rama' });
    }

    const now = new Date();
    const ops = [];
    if (current) {
      ops.push(prisma.playerTeam.update({ where: { id: current.id }, data: { to: now } }));
    }
    ops.push(
      prisma.playerTeam.create({
        data: { profileId: profile.id, teamId: team.id, branch, from: now },
      })
    );
    const results = await prisma.$transaction(ops);
    res.status(201).json({ ...results[results.length - 1], transfer: Boolean(current) });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Sacar jugador del equipo en una rama: DELETE /teams/:id/players/:profileId?branch=MIXED
router.delete('/:id/players/:profileId', ...admin, async (req, res) => {
  try {
    const { branch } = req.query;
    if (!BRANCHES.includes(branch)) return res.status(400).json({ error: 'Rama invÃ¡lida' });

    const result = await prisma.playerTeam.updateMany({
      where: { teamId: req.params.id, profileId: req.params.profileId, branch, to: null },
      data: { to: new Date() },
    });
    if (!result.count) return res.status(404).json({ error: 'El jugador no estÃ¡ en ese equipo/rama' });
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Designar (profileId) o quitar (profileId: null) al DT del equipo. Uno solo por equipo; es solo una marca visual.
router.put('/:id/coach', ...admin, async (req, res) => {
  try {
    const profileId = req.body && req.body.profileId ? String(req.body.profileId) : null;
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });
    if (profileId) {
      const member = await prisma.playerTeam.findFirst({ where: { teamId: team.id, profileId, to: null } });
      if (!member) return res.status(409).json({ error: 'El jugador no está en el plantel actual del equipo' });
    }
    const ops = [prisma.playerTeam.updateMany({ where: { teamId: team.id, to: null }, data: { isCoach: false } })];
    if (profileId) {
      ops.push(prisma.playerTeam.updateMany({ where: { teamId: team.id, profileId, to: null }, data: { isCoach: true } }));
    }
    await prisma.$transaction(ops);
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Eliminar equipo: solo si no tiene partidos (no se borra historial)
router.delete('/:id', ...admin, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const inMatches = await prisma.match.count({
      where: { OR: [{ teamAId: team.id }, { teamBId: team.id }] },
    });
    if (inMatches) {
      return res.status(409).json({ error: 'El equipo tiene partidos: no se puede eliminar' });
    }

    await prisma.$transaction([
      prisma.playerTeam.deleteMany({ where: { teamId: team.id } }),
      prisma.teamBranch.deleteMany({ where: { teamId: team.id } }),
      prisma.teamModality.deleteMany({ where: { teamId: team.id } }),
      prisma.favorite.deleteMany({ where: { targetType: 'TEAM', targetId: team.id } }),
      prisma.team.delete({ where: { id: team.id } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;