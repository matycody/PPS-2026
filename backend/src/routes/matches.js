const express = require('express');
const prisma = require('../db');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../services/matchAccess');
const { notifyMatch } = require('../services/notify');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const BRANCHES = ['MIXED', 'MALE', 'FEMALE'];
const MODALITIES = ['FOAM', 'CLOTH'];
const STATUSES = ['SCHEDULED', 'READY', 'LIVE', 'FINISHED', 'CANCELLED'];
const MAX_REFEREES = 6;

const teamSelect = { id: true, name: true, logo: true };
const baseInclude = {
  tournament: { select: { id: true, name: true } },
  teamA: { select: teamSelect },
  teamB: { select: teamSelect },
  sets: { orderBy: { number: 'asc' } },
};
const adminInclude = {
  ...baseInclude,
  assignments: {
    include: {
      profile: { select: { id: true, name: true, nickname: true, number: true } },
      user: { select: { id: true, email: true } },
    },
  },
};

function parseDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined = inválida
}

// Puntos por set: en Foam el ganador suma 1; en Cloth el ganador suma 2 y un empate suma 1 a cada equipo
function score(match) {
  const win = match.modality === 'CLOTH' ? 2 : 1;
  let a = 0;
  let b = 0;
  for (const s of match.sets) {
    if (!s.winnerTeamId) {
      if (match.modality === 'CLOTH') {
        a += 1;
        b += 1;
      }
    } else if (s.winnerTeamId === match.teamAId) a += win;
    else if (s.winnerTeamId === match.teamBId) b += win;
  }
  return { teamA: a, teamB: b };
}

function serialize(match, isAdmin) {
  const out = {
    id: match.id,
    tournament: match.tournament,
    court: match.court,
    branch: match.branch,
    modality: match.modality,
    status: match.status,
    scheduledAt: match.scheduledAt,
    readyAt: match.readyAt,
    finishedAt: match.finishedAt,
    teamA: match.teamA,
    teamB: match.teamB,
    sets: match.sets.map((s) => ({ number: s.number, winnerTeamId: s.winnerTeamId, draw: s.winnerTeamId === null })),
    score: score(match),
  };
  if (isAdmin) {
    out.readyBy = match.readyBy;
    out.assignments = (match.assignments || []).map((a) => ({
      id: a.id,
      function: a.function,
      profile: a.profile,
      user: a.user,
    }));
  }
  return out;
}

// Resultado de un set: { winnerTeamId } o { draw: true } (empate, solo en Cloth)
function parseSetResult(match, body) {
  if (body && body.draw === true) {
    if (match.modality !== 'CLOTH') {
      return { status: 409, error: 'El empate solo existe en Cloth' };
    }
    return { winnerTeamId: null };
  }
  const winnerTeamId = body && body.winnerTeamId;
  if (![match.teamAId, match.teamBId].includes(winnerTeamId)) {
    return { status: 400, error: 'El ganador debe ser uno de los equipos del partido (en Cloth también se puede enviar { "draw": true })' };
  }
  return { winnerTeamId };
}

function fetchMatch(id, isAdmin) {
  return prisma.match.findUnique({ where: { id }, include: isAdmin ? adminInclude : baseInclude });
}

function handleError(err, res) {
  if (err.code === 'P2002') return res.status(409).json({ error: 'Registro duplicado (reintentá)' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'No encontrado' });
  console.error('[matches]', err);
  return res.status(500).json({ error: 'Error interno' });
}

async function validateTeams(teamAId, teamBId, branch) {
  if (teamAId && teamAId === teamBId) return 'Los equipos deben ser distintos';
  const ids = [teamAId, teamBId].filter(Boolean);
  if (!ids.length) return null;
  const teams = await prisma.team.findMany({ where: { id: { in: ids } }, include: { branches: true } });
  if (teams.length !== ids.length) return 'Equipo no encontrado';
  if (teams.some((t) => !t.branches.some((b) => b.branch === branch))) {
    return 'Un equipo no tiene esa rama';
  }
  return null;
}

// Jugadores con equipo ACTUAL (cualquier rama) entre los equipos del partido
function refereeConflicts(profileIds, teamIds) {
  if (!profileIds.length || !teamIds.length) return [];
  return prisma.playerTeam.findMany({
    where: { profileId: { in: profileIds }, teamId: { in: teamIds }, to: null },
    include: { profile: { select: { name: true } } },
  });
}

async function loadWithPerms(req, res) {
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) {
    res.status(404).json({ error: 'Partido no encontrado' });
    return null;
  }
  const perms = await getPermissions(req.user, match);
  return { match, perms };
}

// ───────────── Alta, listado y detalle ─────────────

router.post('/', ...admin, async (req, res) => {
  try {
    const { tournamentId, branch, modality } = req.body;
    const court = Number(req.body.court);
    const teamAId = req.body.teamAId || null;
    const teamBId = req.body.teamBId || null;
    const scheduledAt = parseDate(req.body.scheduledAt);

    const errors = [];
    if (!tournamentId) errors.push('Torneo obligatorio');
    if (!Number.isInteger(court) || court < 1) errors.push('Cancha inválida');
    if (!BRANCHES.includes(branch)) errors.push('Rama inválida');
    if (!MODALITIES.includes(modality)) errors.push('Modalidad inválida');
    if (scheduledAt === undefined) errors.push('Fecha inválida');
    if (errors.length) return res.status(400).json({ errors });

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

    const teamError = await validateTeams(teamAId, teamBId, branch);
    if (teamError) return res.status(409).json({ error: teamError });

    const match = await prisma.match.create({
      data: { tournamentId, court, branch, modality, scheduledAt, teamAId, teamBId },
    });
    await notifyMatch(req.app.get('io'), match.id);
    res.status(201).json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// Público: ?tournamentId=&status=LIVE,FINISHED&branch=&court=&teamId=&from=&to=&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const { tournamentId, status, branch, court, teamId, from, to } = req.query;
    const where = {};
    if (tournamentId) where.tournamentId = String(tournamentId);
    if (status) {
      const list = String(status).split(',').filter((s) => STATUSES.includes(s));
      if (list.length) where.status = { in: list };
    }
    if (BRANCHES.includes(branch)) where.branch = branch;
    if (court && Number.isInteger(Number(court))) where.court = Number(court);
    if (teamId) where.OR = [{ teamAId: String(teamId) }, { teamBId: String(teamId) }];

    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (fromD || toD) where.scheduledAt = { ...(fromD ? { gte: fromD } : {}), ...(toD ? { lte: toD } : {}) };

    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const offset = Number(req.query.offset) || 0;

    const matches = await prisma.match.findMany({
      where,
      include: baseInclude,
      orderBy: [{ scheduledAt: 'asc' }, { court: 'asc' }],
      take: limit,
      skip: offset,
    });
    res.json(matches.map((m) => serialize(m, false)));
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const isAdmin = Boolean(req.user && req.user.roles.includes('ADMIN'));
    const match = await fetchMatch(req.params.id, isAdmin);
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    res.json(serialize(match, isAdmin));
  } catch (err) {
    handleError(err, res);
  }
});

router.patch('/:id', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { assignments: true },
    });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (!['SCHEDULED', 'READY'].includes(match.status)) {
      return res.status(409).json({ error: 'Solo se edita un partido Programado o Habilitado' });
    }

    const b = req.body;
    const data = {};
    if (b.court !== undefined) {
      const court = Number(b.court);
      if (!Number.isInteger(court) || court < 1) return res.status(400).json({ error: 'Cancha inválida' });
      data.court = court;
    }
    if (b.branch !== undefined) {
      if (!BRANCHES.includes(b.branch)) return res.status(400).json({ error: 'Rama inválida' });
      data.branch = b.branch;
    }
    if (b.modality !== undefined) {
      if (!MODALITIES.includes(b.modality)) return res.status(400).json({ error: 'Modalidad inválida' });
      data.modality = b.modality;
    }
    if (b.scheduledAt !== undefined) {
      const d = parseDate(b.scheduledAt);
      if (d === undefined) return res.status(400).json({ error: 'Fecha inválida' });
      data.scheduledAt = d;
    }
    if ('teamAId' in b) data.teamAId = b.teamAId || null;
    if ('teamBId' in b) data.teamBId = b.teamBId || null;

    const next = { ...match, ...data };
    const teamError = await validateTeams(next.teamAId, next.teamBId, next.branch);
    if (teamError) return res.status(409).json({ error: teamError });

    const refereeIds = match.assignments
      .filter((a) => a.function === 'REFEREE' && a.profileId)
      .map((a) => a.profileId);
    const conflicts = await refereeConflicts(
      refereeIds,
      [next.teamAId, next.teamBId].filter(Boolean)
    );
    if (conflicts.length) {
      return res.status(409).json({
        error: 'Un árbitro asignado pertenece a uno de los equipos: ' + conflicts.map((c) => c.profile.name).join(', '),
      });
    }

    await prisma.match.update({ where: { id: match.id }, data });
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/cancel', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (['FINISHED', 'CANCELLED'].includes(match.status)) {
      return res.status(409).json({ error: 'El partido ya está finalizado o cancelado' });
    }
    await prisma.match.update({ where: { id: match.id }, data: { status: 'CANCELLED' } });
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// ───────────── Ciclo de vida ─────────────

router.post('/:id/ready', authenticate, async (req, res) => {
  try {
    const ctx = await loadWithPerms(req, res);
    if (!ctx) return;
    if (!ctx.perms.isAdmin && !ctx.perms.isTable) return res.status(403).json({ error: 'Sin permiso' });
    if (!ctx.perms.canReady) return res.status(409).json({ error: 'Solo se habilita un partido Programado' });

    await prisma.match.update({
      where: { id: ctx.match.id },
      data: { status: 'READY', readyAt: new Date(), readyBy: req.user.id },
    });
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(ctx.match.id, ctx.perms.isAdmin), ctx.perms.isAdmin));
  } catch (err) {
    handleError(err, res);
  }
});

// Revertir habilitación: solo antes de que arranque el reloj (READY)
router.post('/:id/unready', authenticate, async (req, res) => {
  try {
    const ctx = await loadWithPerms(req, res);
    if (!ctx) return;
    if (!ctx.perms.isAdmin && !ctx.perms.isTable) return res.status(403).json({ error: 'Sin permiso' });
    if (!ctx.perms.canUnready) return res.status(409).json({ error: 'Solo se revierte un partido Habilitado (sin reloj iniciado)' });

    await prisma.match.update({
      where: { id: ctx.match.id },
      data: { status: 'SCHEDULED', readyAt: null, readyBy: null },
    });
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(ctx.match.id, ctx.perms.isAdmin), ctx.perms.isAdmin));
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/finish', authenticate, async (req, res) => {
  try {
    const ctx = await loadWithPerms(req, res);
    if (!ctx) return;
    if (!(ctx.perms.isAdmin && ctx.perms.isTable)) {
      return res.status(403).json({ error: 'Solo un admin asignado como mesa puede finalizar' });
    }
    if (!ctx.perms.canFinish) return res.status(409).json({ error: 'El partido no está Habilitado ni En vivo' });

    await prisma.match.update({
      where: { id: ctx.match.id },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(ctx.match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// ───────────── Asignaciones (solo admin) ─────────────

router.post('/:id/assignments', ...admin, async (req, res) => {
  try {
    const fn = req.body.function;
    if (!['REFEREE', 'TABLE'].includes(fn)) {
      return res.status(400).json({ error: 'function inválida (REFEREE o TABLE)' });
    }

    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { assignments: true },
    });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (['FINISHED', 'CANCELLED'].includes(match.status)) {
      return res.status(409).json({ error: 'El partido ya terminó' });
    }

    let data;
    if (fn === 'REFEREE') {
      const profile = await prisma.profile.findUnique({ where: { id: String(req.body.profileId) } });
      if (!profile || !profile.active || !profile.isReferee) {
        return res.status(409).json({ error: 'El perfil no es un árbitro activo' });
      }
      const refs = match.assignments.filter((a) => a.function === 'REFEREE');
      if (refs.length >= MAX_REFEREES) {
        return res.status(409).json({ error: 'Máximo ' + MAX_REFEREES + ' árbitros por partido' });
      }
      const conflicts = await refereeConflicts([profile.id], [match.teamAId, match.teamBId].filter(Boolean));
      if (conflicts.length) {
        return res.status(409).json({ error: 'No puede arbitrar un partido de un equipo al que pertenece' });
      }
      data = { matchId: match.id, function: 'REFEREE', profileId: profile.id };
    } else {
      const user = await prisma.user.findUnique({ where: { id: String(req.body.userId) } });
      if (!user || !user.active) return res.status(409).json({ error: 'Usuario no encontrado o inactivo' });
      data = { matchId: match.id, function: 'TABLE', userId: user.id };
    }

    const created = await prisma.matchAssignment.create({ data });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya está asignado a este partido' });
    handleError(err, res);
  }
});

router.delete('/:id/assignments/:assignmentId', ...admin, async (req, res) => {
  try {
    const result = await prisma.matchAssignment.deleteMany({
      where: { id: req.params.assignmentId, matchId: req.params.id },
    });
    if (!result.count) return res.status(404).json({ error: 'Asignación no encontrada' });
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// ───────────── Sets y resultado ─────────────

router.post('/:id/sets', authenticate, async (req, res) => {
  try {
    const ctx = await loadWithPerms(req, res);
    if (!ctx) return;
    const { match, perms } = ctx;
    if (!perms.canAddSets) return res.status(403).json({ error: 'Sin permiso para agregar sets en este momento' });
    if (!match.teamAId || !match.teamBId) {
      return res.status(409).json({ error: 'Definí los dos equipos del partido antes de cargar sets' });
    }
    const result = parseSetResult(match, req.body);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const winnerTeamId = result.winnerTeamId;

    const last = await prisma.matchSet.aggregate({ where: { matchId: match.id }, _max: { number: true } });
    const number = (last._max.number || 0) + 1;

    const [set] = await prisma.$transaction([
      prisma.matchSet.create({ data: { matchId: match.id, number, winnerTeamId } }),
      prisma.matchResultLog.create({
        data: {
          matchId: match.id,
          editedBy: req.user.id,
          oldValue: 'null',
          newValue: JSON.stringify({ number, winnerTeamId }),
        },
      }),
    ]);
    await notifyMatch(req.app.get('io'), req.params.id);
    res.status(201).json(set);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch('/:id/sets/:number', authenticate, async (req, res) => {
  try {
    const ctx = await loadWithPerms(req, res);
    if (!ctx) return;
    const { match, perms } = ctx;
    if (!perms.canEditResult) return res.status(403).json({ error: 'Sin permiso para editar el resultado' });

    const result = parseSetResult(match, req.body);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const winnerTeamId = result.winnerTeamId;
    const number = Number(req.params.number);
    const set = await prisma.matchSet.findUnique({
      where: { matchId_number: { matchId: match.id, number } },
    });
    if (!set) return res.status(404).json({ error: 'Set no encontrado' });

    const [updated] = await prisma.$transaction([
      prisma.matchSet.update({ where: { id: set.id }, data: { winnerTeamId } }),
      prisma.matchResultLog.create({
        data: {
          matchId: match.id,
          editedBy: req.user.id,
          oldValue: JSON.stringify({ number, winnerTeamId: set.winnerTeamId }),
          newValue: JSON.stringify({ number, winnerTeamId }),
        },
      }),
    ]);
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/:id/sets/:number', authenticate, async (req, res) => {
  try {
    const ctx = await loadWithPerms(req, res);
    if (!ctx) return;
    const { match, perms } = ctx;
    if (!perms.canEditResult) return res.status(403).json({ error: 'Sin permiso para editar el resultado' });

    const number = Number(req.params.number);
    const set = await prisma.matchSet.findUnique({
      where: { matchId_number: { matchId: match.id, number } },
    });
    if (!set) return res.status(404).json({ error: 'Set no encontrado' });

    await prisma.$transaction([
      prisma.matchSet.delete({ where: { id: set.id } }),
      prisma.matchResultLog.create({
        data: {
          matchId: match.id,
          editedBy: req.user.id,
          oldValue: JSON.stringify({ number, winnerTeamId: set.winnerTeamId }),
          newValue: 'null',
        },
      }),
    ]);
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Registro de ediciones: solo admin
router.get('/:id/result-log', ...admin, async (req, res) => {
  try {
    const logs = await prisma.matchResultLog.findMany({
      where: { matchId: req.params.id },
      orderBy: { editedAt: 'desc' },
      include: { editor: { select: { id: true, email: true } } },
    });
    res.json(logs);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
