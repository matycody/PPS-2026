const express = require('express');
const prisma = require('../db');
const { phasesFor } = require('../services/matchPhase');
const { formsFor } = require('../services/teamForm');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../services/matchAccess');
const { notifyMatch } = require('../services/notify');
const { ExtraMatchError, assertTournamentOpen, planStanding, placeInFixture } = require('../services/extraMatch');
const { getMatch } = require('../timers/matchManager');
const { setsWithScore } = require('../services/scoreTimeline');
const { editorLabel, setResultLabel, buildLogData, logEntry, describeClockAction } = require('../services/resultLog');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const BRANCHES = ['MIXED', 'MALE', 'FEMALE'];
const MODALITIES = ['FOAM', 'CLOTH'];
const STATUSES = ['SCHEDULED', 'READY', 'LIVE', 'FINISHED', 'CANCELLED', 'SUSPENDED'];
const MAX_REFEREES = 6;
const BRANCH_LABEL = { MIXED: 'Mixto', MALE: 'Masculino', FEMALE: 'Femenino' };
const MODALITY_LABEL = { FOAM: 'Foam', CLOTH: 'Cloth' };

// Motivo que ve el público (suspensión o cancelación). undefined = no vino, null = borrar, false = inválido
function parseReason(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (s.length > 300) return false;
  return s || null;
}

const { VENUE_SELECT } = require('../lib/venue');
const teamSelect = { id: true, name: true, logo: true };
const baseInclude = {
  tournament: { select: { id: true, name: true } },
  venue: { select: VENUE_SELECT },
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
      team: { select: { id: true, name: true, logo: true } },
    },
  },
};

// Sede opcional: undefined = no vino, null = sin sede. Devuelve { venueId } o { error }
async function resolveVenue(v) {
  if (v === undefined) return {};
  if (v === null || v === '') return { venueId: null };
  const venue = await prisma.venue.findUnique({ where: { id: String(v) }, select: { id: true, name: true, deletedAt: true } });
  if (!venue || venue.deletedAt) return { error: 'La sede no existe' };
  return { venueId: venue.id, venueName: venue.name };
}

function parseDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined = inválida
}

function fmtDate(d) {
  if (!d) return 'sin fecha';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return pad(dt.getDate()) + '/' + pad(dt.getMonth() + 1) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
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
    venue: match.venue ?? null,
    branch: match.branch,
    modality: match.modality,
    status: match.status,
    scheduledAt: match.scheduledAt,
    readyAt: match.readyAt,
    finishedAt: match.finishedAt,
    statusReason: match.statusReason ?? null,
    originalScheduledAt: match.originalScheduledAt ?? null,
    teamA: match.teamA,
    teamB: match.teamB,
    sets: setsWithScore(match),
    score: score(match),
  };
  if (isAdmin) {
    out.readyBy = match.readyBy;
    out.hiddenAt = match.hiddenAt;
    out.assignments = (match.assignments || []).map((a) => ({
      id: a.id,
      function: a.function,
      profile: a.profile,
      user: a.user,
      team: a.team,
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

// Datos mínimos para armar frases del registro de ediciones
function loadForLabel(matchId) {
  return prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      court: true,
      teamAId: true,
      teamBId: true,
      teamA: { select: { name: true } },
      teamB: { select: { name: true } },
    },
  });
}

function handleError(err, res) {
  if (err instanceof ExtraMatchError) return res.status(err.status).json({ error: err.message });
  if (err.code === 'P2002') return res.status(409).json({ error: 'Registro duplicado (reintentá)' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'No encontrado' });
  console.error('[matches]', err);
  return res.status(500).json({ error: 'Error interno' });
}

function assertVisible(match) {
  if (match.hiddenAt) return { status: 409, error: 'El partido está oculto: restauralo antes de operarlo' };
  return null;
}

async function validateTeams(teamAId, teamBId, branch, modality) {
  if (teamAId && teamAId === teamBId) return 'Los equipos deben ser distintos';
  const ids = [teamAId, teamBId].filter(Boolean);
  if (!ids.length) return null;
  const teams = await prisma.team.findMany({ where: { id: { in: ids } }, include: { branches: true, modalities: true } });
  if (teams.length !== ids.length) return 'Equipo no encontrado';
  if (teams.some((t) => !t.branches.some((b) => b.branch === branch))) {
    return 'Un equipo no tiene esa rama';
  }
  if (modality && teams.some((t) => !t.modalities.some((m) => m.modality === modality))) {
    return 'Un equipo no juega esa modalidad';
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
  const vis = assertVisible(match);
  if (vis) {
    res.status(vis.status).json({ error: vis.error });
    return null;
  }
  const perms = await getPermissions(req.user, match);
  return { match, perms };
}

// ───────────── Alta, listado y detalle ─────────────

router.post('/', ...admin, async (req, res) => {
  try {
    const tournamentId = req.body.tournamentId || null; // sin torneo = partido suelto
    const { branch, modality } = req.body;
    const court = req.body.court === undefined || req.body.court === null || req.body.court === '' ? null : Number(req.body.court);
    const teamAId = req.body.teamAId || null;
    const teamBId = req.body.teamBId || null;
    const scheduledAt = parseDate(req.body.scheduledAt);

    const errors = [];
    // torneo opcional
    if (court !== null && (!Number.isInteger(court) || court < 1)) errors.push('Cancha inválida');
    if (!BRANCHES.includes(branch)) errors.push('Rama inválida');
    if (!MODALITIES.includes(modality)) errors.push('Modalidad inválida');
    if (scheduledAt === undefined) errors.push('Fecha inválida');
    if (errors.length) return res.status(400).json({ errors });

    if (tournamentId) {
      // Un torneo en curso admite partidos nuevos (la organización decide); no uno finalizado ni pausado
      await assertTournamentOpen(tournamentId);
    }

    const teamError = await validateTeams(teamAId, teamBId, branch, modality);
    if (teamError) return res.status(409).json({ error: teamError });
    const ven = await resolveVenue(req.body.venueId);
    if (ven.error) return res.status(400).json({ error: ven.error });

    // countsInStandings: el partido suma a la tabla de una zona (y aparece en su fixture). Sin eso queda en "Fuera del fixture"
    const plan = req.body.countsInStandings === true
      ? await planStanding({ tournamentId, stageId: req.body.stageId, matchdayId: req.body.matchdayId, teamAId, teamBId })
      : null;

    const match = await prisma.$transaction(async (tx) => {
      const place = plan ? await placeInFixture(tx, plan, scheduledAt) : {};
      return tx.match.create({
        data: { tournamentId, court, branch, modality, scheduledAt, teamAId, teamBId, venueId: ven.venueId ?? null, ...place },
      });
    });
    await notifyMatch(req.app.get('io'), match.id);
    res.status(201).json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// Público: ?tournamentId=&status=LIVE,FINISHED&branch=&court=&teamId=&from=&to=&limit=&offset=&hidden=true (solo admin)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const isAdmin = Boolean(req.user && req.user.roles.includes('ADMIN'));
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
    if (fromD || toD) {
      const range = { scheduledAt: { ...(fromD ? { gte: fromD } : {}), ...(toD ? { lte: toD } : {}) } };
      // includeUndated=true: los partidos sin fecha (scheduledAt null) también entran (ej. torneos de un solo día)
      where.AND = [req.query.includeUndated === 'true' ? { OR: [range, { scheduledAt: null }] } : range];
    }

    if (isAdmin && req.query.hidden === 'true') {
      where.hiddenAt = { not: null };
      where.hiddenByPause = false; // los ocultos por pausar un torneo no son "eliminados": vuelven al reanudarlo
    } else {
      where.hiddenAt = null;
    }

    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const offset = Number(req.query.offset) || 0;

    const matches = await prisma.match.findMany({
      where,
      include: baseInclude,
      orderBy: [{ scheduledAt: 'asc' }, { court: 'asc' }],
      take: limit,
      skip: offset,
    });
    const phases = await phasesFor(matches.map((m) => m.id)).catch((e) => { console.error('[phase]', e.message); return new Map(); });
    const rows = matches.map((m) => ({ ...serialize(m, false), phase: phases.get(m.id) ?? null }));
    const forms = await formsFor(rows).catch((e) => { console.error('[form]', e.message); return new Map(); });
    res.json(rows.map((m) => ({ ...m, form: forms.get(m.id) ?? null })));
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const isAdmin = Boolean(req.user && req.user.roles.includes('ADMIN'));
    const match = await fetchMatch(req.params.id, isAdmin);
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (match.hiddenAt && !isAdmin) return res.status(404).json({ error: 'Partido no encontrado' });
    const phases = await phasesFor([match.id]).catch((e) => { console.error('[phase]', e.message); return new Map(); });
    const one = { ...serialize(match, isAdmin), phase: phases.get(match.id) ?? null };
    const forms = await formsFor([one]).catch((e) => { console.error('[form]', e.message); return new Map(); });
    res.json({ ...one, form: forms.get(one.id) ?? null });
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
    const vis = assertVisible(match);
    if (vis) return res.status(vis.status).json({ error: vis.error });
    if (!['SCHEDULED', 'READY'].includes(match.status)) {
      return res.status(409).json({ error: 'Solo se edita un partido Programado o Habilitado' });
    }

    const b = req.body;
    const data = {};
    if (b.court !== undefined) {
      const court = b.court === null || b.court === '' ? null : Number(b.court);
      if (court !== null && (!Number.isInteger(court) || court < 1)) return res.status(400).json({ error: 'Cancha inválida' });
      data.court = court;
    }
    const ven = await resolveVenue(b.venueId);
    if (ven.error) return res.status(400).json({ error: ven.error });
    if (b.venueId !== undefined) data.venueId = ven.venueId;
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

    // Asignar el partido a un torneo (o sacarlo): solo si todavía no es parte de una zona o llave
    if ('tournamentId' in b) {
      const target = b.tournamentId || null;
      if (target !== match.tournamentId) {
        if (match.stageId) {
          return res.status(409).json({ error: 'Un partido del fixture o de las llaves no se puede mover a otro torneo' });
        }
        if (target) await assertTournamentOpen(target);
        data.tournamentId = target;
      }
    }

    const next = { ...match, ...data };
    const teamError = await validateTeams(next.teamAId, next.teamBId, next.branch, next.modality);
    if (teamError) return res.status(409).json({ error: teamError });

    // Sumar a la tabla de una zona (y entrar a su fixture). Es de un solo sentido: un partido del fixture no se saca de la tabla
    let plan = null;
    if (b.countsInStandings === true) {
      if (match.stageId) return res.status(409).json({ error: 'El partido ya suma a la tabla' });
      plan = await planStanding({
        tournamentId: next.tournamentId, stageId: b.stageId, matchdayId: b.matchdayId, teamAId: next.teamAId, teamBId: next.teamBId,
      });
    } else if (b.countsInStandings === false && match.stageId) {
      return res.status(409).json({ error: 'Un partido del fixture no se saca de la tabla: cancelalo u ocultalo' });
    }

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

    // Nombres de equipos (antes y después), para describir el cambio en el registro de ediciones
    const idsForNames = [...new Set([match.teamAId, match.teamBId, next.teamAId, next.teamBId].filter(Boolean))];
    const teamsForLabel = idsForNames.length
      ? await prisma.team.findMany({ where: { id: { in: idsForNames } }, select: { id: true, name: true } })
      : [];
    const nameOf = (id) => (id ? ((teamsForLabel.find((t) => t.id === id) || {}).name || 'equipo eliminado') : 'sin equipo');

    const changes = [];
    if (data.court !== undefined && data.court !== match.court) {
      changes.push('cancha: ' + (match.court ?? 'sin asignar') + ' → ' + (data.court ?? 'sin asignar'));
    }
    if (data.venueId !== undefined && data.venueId !== match.venueId) {
      changes.push('sede: ' + (ven.venueName ?? 'sin sede'));
    }
    if (data.branch !== undefined && data.branch !== match.branch) {
      changes.push('rama: ' + BRANCH_LABEL[match.branch] + ' → ' + BRANCH_LABEL[data.branch]);
    }
    if (data.modality !== undefined && data.modality !== match.modality) {
      changes.push('modalidad: ' + MODALITY_LABEL[match.modality] + ' → ' + MODALITY_LABEL[data.modality]);
    }
    if (data.scheduledAt !== undefined) {
      const before = match.scheduledAt ? match.scheduledAt.getTime() : null;
      const after = data.scheduledAt ? data.scheduledAt.getTime() : null;
      if (before !== after) changes.push('fecha: ' + fmtDate(match.scheduledAt) + ' → ' + fmtDate(data.scheduledAt));
    }
    if ('teamAId' in data && data.teamAId !== match.teamAId) {
      changes.push('equipo A: ' + nameOf(match.teamAId) + ' → ' + nameOf(data.teamAId));
    }
    if ('teamBId' in data && data.teamBId !== match.teamBId) {
      changes.push('equipo B: ' + nameOf(match.teamBId) + ' → ' + nameOf(data.teamBId));
    }

    if (data.tournamentId !== undefined) {
      const names = await prisma.tournament.findMany({
        where: { id: { in: [match.tournamentId, data.tournamentId].filter(Boolean) } }, select: { id: true, name: true },
      });
      const tn = (id) => (id ? ((names.find((x) => x.id === id) || {}).name || 'torneo') : 'amistoso');
      changes.push('torneo: ' + tn(match.tournamentId) + ' → ' + tn(data.tournamentId));
    }
    if (plan) changes.push('suma a la tabla de ' + plan.stage.name);

    await prisma.$transaction(async (tx) => {
      const place = plan ? await placeInFixture(tx, plan, next.scheduledAt) : {};
      await tx.match.update({ where: { id: match.id }, data: { ...data, ...place } });
    });

    if (changes.length) {
      const label = {
        id: match.id,
        court: next.court,
        teamAId: next.teamAId,
        teamBId: next.teamBId,
        teamA: { name: nameOf(next.teamAId) },
        teamB: { name: nameOf(next.teamBId) },
      };
      const editorLbl = await editorLabel(req.user);
      await prisma.matchResultLog.create({
        data: buildLogData(label, req.user.id, editorLbl, 'MATCH_EDIT', 'Editó el partido (' + changes.join(', ') + ')'),
      });
    }

    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// Programación masiva de una jornada: cancha y horario de varios partidos de una sola vez (todo o nada).
// Body: { turnMinutes (10 a 240, opcional), items: [{ matchId, court (int | null), scheduledAt (ISO | null) }] }
const DEFAULT_TURN_MIN = 40; // por defecto cada partido ocupa 40 minutos (2 tiempos de 20); la organización puede cambiarlo
const MAX_BULK = 500;
router.post('/bulk-schedule', ...admin, async (req, res) => {
  try {
    const items = req.body && req.body.items;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No hay partidos para programar' });
    if (items.length > MAX_BULK) return res.status(400).json({ error: 'Máximo ' + MAX_BULK + ' partidos por vez' });
    const turnMin = req.body.turnMinutes === undefined ? DEFAULT_TURN_MIN : Number(req.body.turnMinutes);
    if (!Number.isInteger(turnMin) || turnMin < 10 || turnMin > 240) return res.status(400).json({ error: 'Duración del turno inválida (10 a 240 minutos)' });
    const TURN_MS = turnMin * 60 * 1000;

    const plan = new Map();
    for (const it of items) {
      const id = it && it.matchId ? String(it.matchId) : '';
      if (!id || plan.has(id)) return res.status(400).json({ error: 'Partido repetido o inválido' });
      const court = it.court === null || it.court === undefined || it.court === '' ? null : Number(it.court);
      if (court !== null && (!Number.isInteger(court) || court < 1)) return res.status(400).json({ error: 'Cancha inválida' });
      const at = parseDate(it.scheduledAt);
      if (at === undefined) return res.status(400).json({ error: 'Fecha inválida' });
      const ven = await resolveVenue(it.venueId);
      if (ven.error) return res.status(400).json({ error: ven.error });
      plan.set(id, { court, scheduledAt: at, ...(it.venueId !== undefined ? { venueId: ven.venueId, venueName: ven.venueName ?? null } : {}) });
    }

    const matches = await prisma.match.findMany({
      where: { id: { in: [...plan.keys()] } },
      include: { teamA: { select: { id: true, name: true } }, teamB: { select: { id: true, name: true } } },
    });
    if (matches.length !== plan.size) return res.status(404).json({ error: 'Algún partido no existe' });
    const blocked = matches.filter((m) => m.hiddenAt || !['SCHEDULED', 'READY'].includes(m.status));
    if (blocked.length) {
      return res.status(409).json({ error: 'Solo se programan partidos Programados o Habilitados (' + blocked.length + ' no cumplen)' });
    }

    // Estado final de los partidos tocados + los demás partidos activos de esos mismos días
    const finalOf = (m) => ({ ...m, ...plan.get(m.id) });
    const touched = matches.map(finalOf);
    const times = touched.map((m) => m.scheduledAt).filter(Boolean).map((d) => d.getTime());
    let others = [];
    if (times.length) {
      const lo = new Date(Math.min(...times) - TURN_MS);
      const hi = new Date(Math.max(...times) + TURN_MS);
      others = await prisma.match.findMany({
        where: {
          id: { notIn: [...plan.keys()] },
          hiddenAt: null,
          status: { in: ['SCHEDULED', 'READY', 'LIVE'] },
          scheduledAt: { gte: lo, lte: hi },
        },
        include: { teamA: { select: { id: true, name: true } }, teamB: { select: { id: true, name: true } } },
      });
    }

    const timed = touched.filter((m) => m.scheduledAt);
    const pool = [...timed, ...others];
    const label = (m) => (m.teamA ? m.teamA.name : '¿?') + ' vs ' + (m.teamB ? m.teamB.name : '¿?');
    const problems = [];
    for (const a of timed) {
      for (const b of pool) {
        if (a === b || (b.scheduledAt && plan.has(b.id) && b.id < a.id)) continue; // cada par una sola vez
        if (!b.scheduledAt || Math.abs(a.scheduledAt.getTime() - b.scheduledAt.getTime()) >= TURN_MS) continue;
        if (a.court && b.court && a.court === b.court && (!a.venueId || !b.venueId || a.venueId === b.venueId)) {
          problems.push('Cancha ' + a.court + ' ocupada a las ' + fmtDate(a.scheduledAt) + ': ' + label(a) + ' y ' + label(b));
        }
        const ids = [a.teamAId, a.teamBId].filter(Boolean);
        const shared = [b.teamAId, b.teamBId].filter((t) => t && ids.includes(t));
        if (shared.length) {
          const t = [a.teamA, a.teamB, b.teamA, b.teamB].find((x) => x && x.id === shared[0]);
          problems.push((t ? t.name : 'Un equipo') + ' juega dos partidos a la vez (' + fmtDate(a.scheduledAt) + ')');
        }
      }
    }
    if (problems.length) {
      return res.status(409).json({ error: 'Hay choques de horario', errors: [...new Set(problems)].slice(0, 20) });
    }

    const editorLbl = await editorLabel(req.user);
    const changed = [];
    const ops = [];
    for (const m of matches) {
      const next = plan.get(m.id);
      const sameCourt = next.court === m.court;
      const sameVenue = next.venueId === undefined || next.venueId === m.venueId;
      const before = m.scheduledAt ? m.scheduledAt.getTime() : null;
      const after = next.scheduledAt ? next.scheduledAt.getTime() : null;
      if (sameCourt && sameVenue && before === after) continue;
      const parts = [];
      if (!sameCourt) parts.push('cancha: ' + (m.court ?? 'sin asignar') + ' → ' + (next.court ?? 'sin asignar'));
      if (before !== after) parts.push('fecha: ' + fmtDate(m.scheduledAt) + ' → ' + fmtDate(next.scheduledAt));
      if (!sameVenue) parts.push('sede: ' + (next.venueName ?? 'sin sede'));
      ops.push(prisma.match.update({
        where: { id: m.id },
        data: { court: next.court, scheduledAt: next.scheduledAt, ...(next.venueId !== undefined ? { venueId: next.venueId } : {}) },
      }));
      ops.push(prisma.matchResultLog.create({
        data: buildLogData(
          { id: m.id, court: next.court, teamAId: m.teamAId, teamBId: m.teamBId, teamA: m.teamA, teamB: m.teamB },
          req.user.id, editorLbl, 'MATCH_EDIT', 'Programó la jornada (' + parts.join(', ') + ')'
        ),
      }));
      changed.push(m.id);
    }
    if (ops.length) await prisma.$transaction(ops);
    for (const id of changed) await notifyMatch(req.app.get('io'), id);
    res.json({ updated: changed.length, unchanged: matches.length - changed.length });
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/cancel', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    const vis = assertVisible(match);
    if (vis) return res.status(vis.status).json({ error: vis.error });
    if (['FINISHED', 'CANCELLED'].includes(match.status)) {
      return res.status(409).json({ error: 'El partido ya está finalizado o cancelado' });
    }
    const reason = parseReason(req.body?.reason);
    if (reason === false) return res.status(400).json({ error: 'El motivo admite hasta 300 caracteres' });
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'CANCELLED', ...(reason !== undefined ? { statusReason: reason } : {}) },
    });

    const label = await loadForLabel(match.id);
    const editorLbl = await editorLabel(req.user);
    await prisma.matchResultLog.create({
      data: buildLogData(label, req.user.id, editorLbl, 'MATCH_CANCEL', 'Canceló el partido' + (reason ? ': ' + reason : '')),
    });

    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// ───────────── Ocultar y eliminar (solo admin) ─────────────
// Solo se puede ocultar antes de Habilitar (SCHEDULED) o después de Finalizado/Cancelado.
// Un partido oculto no aparece para nadie más que el admin (con ?hidden=true). Es reversible.
// Purgar (borrado definitivo) exige que esté oculto primero, y no se puede deshacer.

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

// ───────────── Suspender y reprogramar un partido (solo admin) ─────────────
// Suspender no toca la fecha del torneo: el partido sigue en su jornada y se juega más adelante.
router.post('/:id/suspend', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    const vis = assertVisible(match);
    if (vis) return res.status(vis.status).json({ error: vis.error });
    if (!['SCHEDULED', 'READY'].includes(match.status)) {
      return res.status(409).json({ error: 'Solo se suspende un partido Programado o Habilitado (no uno en juego)' });
    }
    const reason = parseReason(req.body?.reason);
    if (reason === false) return res.status(400).json({ error: 'El motivo admite hasta 300 caracteres' });

    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: 'SUSPENDED',
        readyAt: null,
        readyBy: null,
        statusReason: reason ?? null,
        originalScheduledAt: match.originalScheduledAt ?? match.scheduledAt,
      },
    });

    const label = await loadForLabel(match.id);
    const editorLbl = await editorLabel(req.user);
    await prisma.matchResultLog.create({
      data: buildLogData(label, req.user.id, editorLbl, 'MATCH_SUSPEND', 'Suspendió el partido' + (reason ? ': ' + reason : '')),
    });

    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// Reprograma un partido suspendido: nueva fecha (obligatoria), cancha y motivo opcionales. Vuelve a Programado.
router.post('/:id/reschedule', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    const vis = assertVisible(match);
    if (vis) return res.status(vis.status).json({ error: vis.error });
    if (match.status !== 'SUSPENDED') {
      return res.status(409).json({ error: 'Solo se reprograma un partido Suspendido' });
    }
    const b = req.body || {};
    const when = parseDate(b.scheduledAt);
    if (!when) return res.status(400).json({ error: 'La nueva fecha y hora es obligatoria' });
    const data = { status: 'SCHEDULED', scheduledAt: when };
    if (b.court !== undefined) {
      const court = b.court === null || b.court === '' ? null : Number(b.court);
      if (court !== null && (!Number.isInteger(court) || court < 1)) return res.status(400).json({ error: 'Cancha inválida' });
      data.court = court;
    }
    const reason = parseReason(b.reason);
    if (reason === false) return res.status(400).json({ error: 'El motivo admite hasta 300 caracteres' });
    if (reason !== undefined) data.statusReason = reason;

    await prisma.match.update({ where: { id: match.id }, data });

    const label = await loadForLabel(match.id);
    const editorLbl = await editorLabel(req.user);
    await prisma.matchResultLog.create({
      data: buildLogData(label, req.user.id, editorLbl, 'MATCH_RESCHEDULE', 'Reprogramó el partido: ' + fmtDate(match.originalScheduledAt ?? match.scheduledAt) + ' → ' + fmtDate(when)),
    });

    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

// Edita solo el motivo visible (suspendido, cancelado o reprogramado)
router.patch('/:id/reason', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    const vis = assertVisible(match);
    if (vis) return res.status(vis.status).json({ error: vis.error });
    if (!['SUSPENDED', 'CANCELLED'].includes(match.status) && !match.originalScheduledAt) {
      return res.status(409).json({ error: 'El partido no está suspendido, cancelado ni reprogramado' });
    }
    const reason = parseReason(req.body?.reason);
    if (reason === undefined || reason === false) {
      return res.status(400).json({ error: 'Motivo inválido (hasta 300 caracteres)' });
    }
    await prisma.match.update({ where: { id: match.id }, data: { statusReason: reason } });
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/finish', authenticate, async (req, res) => {
  try {
    const ctx = await loadWithPerms(req, res);
    if (!ctx) return;
    if (!ctx.perms.isAdmin) {
      return res.status(403).json({ error: 'Solo la organización puede finalizar' });
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

// ───────────── Ocultar y eliminar (solo admin) ─────────────
// Solo se puede ocultar antes de Habilitar (SCHEDULED) o después de Finalizado/Cancelado.
// Un partido oculto no aparece para nadie más que el admin (con ?hidden=true). Es reversible.
// Purgar (borrado definitivo) exige que esté oculto primero, y no se puede deshacer.

router.post('/:id/hide', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (match.hiddenAt) return res.status(409).json({ error: 'El partido ya está oculto' });
    if (!['SCHEDULED', 'FINISHED', 'CANCELLED'].includes(match.status)) {
      return res.status(409).json({ error: 'Solo se puede ocultar un partido Programado, Finalizado o Cancelado' });
    }

    await prisma.match.update({ where: { id: match.id }, data: { hiddenAt: new Date() } });

    const label = await loadForLabel(match.id);
    const editorLbl = await editorLabel(req.user);
    await prisma.matchResultLog.create({
      data: buildLogData(label, req.user.id, editorLbl, 'MATCH_HIDE', 'Ocultó el partido'),
    });

    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/restore', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (!match.hiddenAt) return res.status(409).json({ error: 'El partido no está oculto' });

    await prisma.match.update({ where: { id: match.id }, data: { hiddenAt: null } });

    const label = await loadForLabel(match.id);
    const editorLbl = await editorLabel(req.user);
    await prisma.matchResultLog.create({
      data: buildLogData(label, req.user.id, editorLbl, 'MATCH_RESTORE', 'Restauró el partido'),
    });

    await notifyMatch(req.app.get('io'), req.params.id);
    res.json(serialize(await fetchMatch(match.id, true), true));
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/:id/purge', ...admin, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (!match.hiddenAt) {
      return res.status(409).json({ error: 'Primero hay que ocultarlo antes de eliminarlo definitivamente' });
    }

    const label = await loadForLabel(match.id);
    const editorLbl = await editorLabel(req.user);
    const logCreate = logEntry(label, req.user.id, editorLbl, 'MATCH_PURGE', 'Eliminó definitivamente el partido');

    await prisma.$transaction([
      prisma.clockAction.deleteMany({ where: { matchId: match.id } }),
      prisma.matchSet.deleteMany({ where: { matchId: match.id } }),
      prisma.matchAssignment.deleteMany({ where: { matchId: match.id } }),
      prisma.match.delete({ where: { id: match.id } }),
      logCreate,
    ]);

    res.json({ ok: true });
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
    const vis = assertVisible(match);
    if (vis) return res.status(vis.status).json({ error: vis.error });
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
      // TABLE: exactamente uno de userId (solo admin), profileId (jugador o árbitro) o teamId (equipo)
      const given = ['userId', 'profileId', 'teamId'].filter((k) => req.body[k]);
      if (given.length !== 1) {
        return res.status(400).json({ error: 'Para la mesa, mandá exactamente uno: userId, profileId o teamId' });
      }

      if (req.body.userId) {
        const user = await prisma.user.findUnique({ where: { id: String(req.body.userId) } });
        if (!user || !user.active) return res.status(409).json({ error: 'Usuario no encontrado o inactivo' });
        if (!user.roles.includes('ADMIN')) {
          return res.status(409).json({ error: 'Por cuenta directa, la mesa solo puede ser un admin' });
        }
        if (user.profileId) {
          const conflicts = await refereeConflicts([user.profileId], [match.teamAId, match.teamBId].filter(Boolean));
          if (conflicts.length) {
            return res.status(409).json({ error: 'No puede ser mesa de un partido de un equipo al que pertenece' });
          }
        }
        data = { matchId: match.id, function: 'TABLE', userId: user.id };
      } else if (req.body.profileId) {
        const profile = await prisma.profile.findUnique({ where: { id: String(req.body.profileId) } });
        if (!profile || !profile.active || !(profile.isPlayer || profile.isReferee)) {
          return res.status(409).json({ error: 'El perfil no es un jugador ni un árbitro activo' });
        }
        const conflicts = await refereeConflicts([profile.id], [match.teamAId, match.teamBId].filter(Boolean));
        if (conflicts.length) {
          return res.status(409).json({ error: 'No puede ser mesa de un partido de un equipo al que pertenece' });
        }
        data = { matchId: match.id, function: 'TABLE', profileId: profile.id };
      } else {
        const teamId = String(req.body.teamId);
        if (teamId === match.teamAId || teamId === match.teamBId) {
          return res.status(409).json({ error: 'El equipo no puede ser mesa de su propio partido' });
        }
        const team = await prisma.team.findUnique({ where: { id: teamId } });
        if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });
        const alreadyTeamTable = match.assignments.some((a) => a.function === 'TABLE' && a.teamId);
        if (alreadyTeamTable) {
          return res.status(409).json({ error: 'El partido ya tiene un equipo asignado como mesa' });
        }
        data = { matchId: match.id, function: 'TABLE', teamId: team.id };
      }
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

    const label = await loadForLabel(match.id);
    const description = 'Agregó el set ' + number + ': ' + setResultLabel(label, winnerTeamId);
    const editorLbl = await editorLabel(req.user);
    const logCreate = logEntry(label, req.user.id, editorLbl, 'SET_ADD', description);

    // Momento en que se decidió el set (queda registrado): tiempo y segundos jugados de ese tiempo (cada tiempo dura 20:00)
    const engine = getMatch(match.id);
    const half = engine ? engine.matchHalf : null;
    const matchSecond = engine ? Math.max(0, 20 * 60 - engine.matchTimeLeft) : null;

    const [set] = await prisma.$transaction([
      prisma.matchSet.create({ data: { matchId: match.id, number, winnerTeamId, half, matchSecond } }),
      logCreate,
    ]);
    // Al cargar el ganador del set, el reloj de set vuelve a 3:00 y queda en pausa
    // hasta que el árbitro o la mesa inicie el set siguiente (no toca el reloj del partido)
    if (engine) engine.reset('set');
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

    const label = await loadForLabel(match.id);
    const description =
      'Editó el set ' + number + ': ahora ' + setResultLabel(label, winnerTeamId) +
      ' (antes ' + setResultLabel(label, set.winnerTeamId) + ')';
    const editorLbl = await editorLabel(req.user);
    const logCreate = logEntry(label, req.user.id, editorLbl, 'SET_EDIT', description);

    const [updated] = await prisma.$transaction([
      prisma.matchSet.update({ where: { id: set.id }, data: { winnerTeamId } }),
      logCreate,
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

    const label = await loadForLabel(match.id);
    const description = 'Eliminó el set ' + number + ' (' + setResultLabel(label, set.winnerTeamId) + ')';
    const editorLbl = await editorLabel(req.user);
    const logCreate = logEntry(label, req.user.id, editorLbl, 'SET_DELETE', description);

    await prisma.$transaction([
      prisma.matchSet.delete({ where: { id: set.id } }),
      logCreate,
    ]);
    await notifyMatch(req.app.get('io'), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Registro de ediciones y del reloj, en una sola línea de tiempo legible (solo admin)
router.get('/:id/result-log', ...admin, async (req, res) => {
  try {
    const [logs, actions] = await Promise.all([
      prisma.matchResultLog.findMany({ where: { matchId: req.params.id }, orderBy: { editedAt: 'desc' } }),
      prisma.clockAction.findMany({ where: { matchId: req.params.id }, orderBy: { at: 'desc' } }),
    ]);

    const userIds = [...new Set(actions.map((a) => a.userId))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, profileId: true } })
      : [];
    const profileIds = users.map((u) => u.profileId).filter(Boolean);
    const profiles = profileIds.length
      ? await prisma.profile.findMany({ where: { id: { in: profileIds } }, select: { id: true, nickname: true, name: true } })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const labelMap = new Map(
      users.map((u) => {
        const p = u.profileId ? profileMap.get(u.profileId) : null;
        return [u.id, p ? p.nickname || p.name : u.email];
      })
    );

    const clockEntries = actions.map((a) => {
      let detail = {};
      try {
        detail = a.detail ? JSON.parse(a.detail) : {};
      } catch (e) {
        detail = {};
      }
      return {
        at: a.at,
        by: labelMap.get(a.userId) || 'Desconocido',
        type: 'CLOCK_' + a.action,
        description: describeClockAction(a.action, detail),
      };
    });

    const logEntries = logs.map((l) => ({
      at: l.editedAt,
      by: l.editorLabel,
      type: l.type,
      description: l.description,
    }));

    const timeline = [...logEntries, ...clockEntries].sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json(timeline);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
