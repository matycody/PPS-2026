const crypto = require('crypto');
const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { computeStandings } = require('../services/standings');
const { decide, matchResult, shuffleWith, buildSpecs, standardEntrants, validateSpecs } = require('../services/bracket');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const DAY_MS = 24 * 60 * 60 * 1000;
const TEAM_SELECT = { id: true, name: true, logo: true };
const PAIRINGS = ['fold', 'adjacent'];

function handleDbError(err, res) {
  console.error('[bracket]', err);
  return res.status(500).json({ error: 'Error interno' });
}

function parseDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function findStage(tournamentId, stageId) {
  return prisma.stage.findFirst({
    where: { id: stageId, tournamentId },
    include: { tournament: true },
  });
}

// Se puede rehacer la llave solo si nada se habilitó, jugó ni asignó
async function replaceable(stageId) {
  const matches = await prisma.match.findMany({ where: { stageId }, select: { id: true, status: true } });
  if (matches.some((m) => m.status !== 'SCHEDULED')) return { ok: false, count: matches.length };
  const ids = matches.map((m) => m.id);
  if (ids.length) {
    const [a, s, c] = await Promise.all([
      prisma.matchAssignment.count({ where: { matchId: { in: ids } } }),
      prisma.matchSet.count({ where: { matchId: { in: ids } } }),
      prisma.clockAction.count({ where: { matchId: { in: ids } } }),
    ]);
    if (a || s || c) return { ok: false, count: ids.length };
  }
  return { ok: true, count: ids.length };
}

// Valida stage/torneo para modificar la llave. Devuelve { stage, existing } o responde el error.
async function prepare(req, res, { allowExisting }) {
  const stage = await findStage(req.params.id, req.params.stageId);
  if (!stage) {
    res.status(404).json({ error: 'Etapa no encontrada' });
    return null;
  }
  if (stage.tournament.status === 'FINISHED') {
    res.status(409).json({ error: 'El torneo finalizó' });
    return null;
  }
  if (stage.type !== 'KNOCKOUT') {
    res.status(409).json({ error: 'La llave es solo para etapas de eliminación directa (KNOCKOUT)' });
    return null;
  }
  const rep = await replaceable(stage.id);
  if (!rep.ok) {
    res.status(409).json({ error: 'Hay partidos habilitados, jugados o con asignaciones: no se puede rehacer ni eliminar la llave' });
    return null;
  }
  if (rep.count && !allowExisting) {
    res.status(409).json({ error: 'La etapa ya tiene llave: enviá replace: true para rehacerla o eliminala antes' });
    return null;
  }
  return { stage, existing: rep.count };
}

async function enrolledSet(tournamentId) {
  const rows = await prisma.tournamentTeam.findMany({ where: { tournamentId }, select: { teamId: true } });
  return new Set(rows.map((r) => r.teamId));
}

async function persist(stage, specs, directOrder) {
  const t = stage.tournament;
  const ids = new Map(specs.map((s) => [s.ref, crypto.randomUUID()]));
  const rows = new Map(
    specs.map((s) => [
      s.ref,
      {
        id: ids.get(s.ref),
        tournamentId: t.id,
        stageId: stage.id,
        round: s.round,
        slot: s.slot,
        court: s.court ?? null,
        branch: t.branch,
        modality: t.modality,
        scheduledAt: s.scheduledAt ?? null,
        teamAId: s.a && s.a.teamId ? s.a.teamId : null,
        teamBId: s.b && s.b.teamId ? s.b.teamId : null,
        nextMatchId: null,
        nextSide: null,
        loserMatchId: null,
        loserSide: null,
      },
    ]),
  );
  const direct = [];
  for (const s of specs) {
    for (const side of ['a', 'b']) {
      const src = s[side];
      if (!src) continue;
      const sideCode = side.toUpperCase();
      if (src.winnerOf) Object.assign(rows.get(src.winnerOf), { nextMatchId: ids.get(s.ref), nextSide: sideCode });
      if (src.loserOf) Object.assign(rows.get(src.loserOf), { loserMatchId: ids.get(s.ref), loserSide: sideCode });
      if (src.teamId) direct.push({ teamId: src.teamId, entryRound: s.round });
    }
  }
  const rank = new Map((directOrder || []).map((id, i) => [id, i + 1]));
  direct.sort((x, y) => (rank.get(x.teamId) ?? 1e9) - (rank.get(y.teamId) ?? 1e9));
  const stageTeams = direct.map((d, i) => ({
    stageId: stage.id,
    teamId: d.teamId,
    seed: rank.get(d.teamId) ?? i + 1,
    entryRound: d.entryRound,
  }));

  await prisma.$transaction(
    async (tx) => {
      await tx.match.deleteMany({ where: { stageId: stage.id } });
      await tx.stageTeam.deleteMany({ where: { stageId: stage.id } });
      await tx.stageTeam.createMany({ data: stageTeams });
      for (const c of chunks([...rows.values()], 1000)) await tx.match.createMany({ data: c });
    },
    { timeout: 60000 },
  );
}

function roundLabel(round, maxRound) {
  const d = maxRound - round;
  if (d === 0) return 'Final';
  if (d === 1) return 'Semifinales';
  if (d === 2) return 'Cuartos de final';
  if (d === 3) return 'Octavos de final';
  return 'Ronda ' + round;
}

async function view(stageId) {
  const matches = await prisma.match.findMany({
    where: { stageId, hiddenAt: null },
    orderBy: [{ round: 'asc' }, { slot: 'asc' }],
    select: {
      id: true,
      round: true,
      slot: true,
      status: true,
      court: true,
      scheduledAt: true,
      teamAId: true,
      teamBId: true,
      nextMatchId: true,
      nextSide: true,
      loserMatchId: true,
      loserSide: true,
      teamA: { select: TEAM_SELECT },
      teamB: { select: TEAM_SELECT },
      sets: { select: { number: true, winnerTeamId: true }, orderBy: { number: 'asc' } },
    },
  });
  const feeds = new Map();
  const feed = (target, side, from, kind) => {
    if (!target) return;
    if (!feeds.has(target)) feeds.set(target, {});
    feeds.get(target)[side] = { matchId: from, kind };
  };
  for (const m of matches) {
    feed(m.nextMatchId, m.nextSide, m.id, 'WINNER');
    feed(m.loserMatchId, m.loserSide, m.id, 'LOSER');
  }
  const maxRound = matches.reduce((n, m) => Math.max(n, m.round || 0), 0);
  const rounds = new Map();
  for (const m of matches) {
    const f = feeds.get(m.id) || {};
    const score = matchResult(m);
    const res = m.status === 'FINISHED' ? decide(m) : null;
    const thirdPlace = !!(f.A && f.A.kind === 'LOSER' && f.B && f.B.kind === 'LOSER');
    if (!rounds.has(m.round)) rounds.set(m.round, { round: m.round, name: roundLabel(m.round, maxRound), matches: [] });
    rounds.get(m.round).matches.push({
      id: m.id,
      slot: m.slot,
      kind: thirdPlace ? 'THIRD_PLACE' : 'MATCH',
      status: m.status,
      court: m.court,
      scheduledAt: m.scheduledAt,
      teamA: m.teamA,
      teamB: m.teamB,
      setsA: score ? score.setsA : 0,
      setsB: score ? score.setsB : 0,
      winnerTeamId: res ? res.winnerTeamId : null,
      nextMatchId: m.nextMatchId,
      nextSide: m.nextSide,
      loserMatchId: m.loserMatchId,
      loserSide: m.loserSide,
      feeds: { A: f.A || null, B: f.B || null },
    });
  }
  return { stageId, totalMatches: matches.length, rounds: [...rounds.values()] };
}

// Equipos de origen para el armado automático, en orden de siembra
async function sourceTeams(stage, b, enrolled) {
  if (b.teamIds !== undefined) {
    if (!Array.isArray(b.teamIds) || b.teamIds.some((x) => typeof x !== 'string')) {
      return { error: 'teamIds debe ser una lista de ids' };
    }
    return { ids: b.teamIds, label: 'teamIds' };
  }
  if (b.fromStandings !== undefined) {
    if (!Array.isArray(b.fromStandings) || !b.fromStandings.length) {
      return { error: 'fromStandings debe ser una lista [{ stageId, top }]' };
    }
    const srcIds = b.fromStandings.map((f) => f && f.stageId).filter((x) => typeof x === 'string');
    const pend = await prisma.match.count({
      where: { stageId: { in: srcIds }, hiddenAt: null, status: { notIn: ['FINISHED', 'CANCELLED'] } },
    });
    if (pend && b.force !== true) {
      return { error: 'Las zonas de origen tienen ' + pend + ' partidos sin terminar (force: true para armar igual)' };
    }
    const data = await computeStandings(stage.tournamentId);
    const picked = [];
    for (const [order, f] of b.fromStandings.entries()) {
      const top = Number(f && f.top);
      if (!f || typeof f.stageId !== 'string' || !Number.isInteger(top) || top < 1) {
        return { error: 'Cada elemento de fromStandings necesita stageId y top (entero desde 1)' };
      }
      const zone = data.stages.find((s) => s.id === f.stageId);
      if (!zone) return { error: 'Zona de liga no encontrada en fromStandings: ' + f.stageId };
      zone.rows.slice(0, top).forEach((r, i) => picked.push({ id: r.team.id, rank: i, order }));
    }
    picked.sort((x, y) => x.rank - y.rank || x.order - y.order);
    return { ids: picked.map((p) => p.id), label: 'fromStandings' };
  }
  const staged = await prisma.stageTeam.findMany({ where: { stageId: stage.id }, select: { teamId: true, seed: true } });
  if (staged.length) {
    staged.sort((a, c) => (a.seed ?? 1e9) - (c.seed ?? 1e9) || a.teamId.localeCompare(c.teamId));
    return { ids: staged.map((x) => x.teamId), label: 'stage' };
  }
  return { ids: [...enrolled], label: 'torneo' };
}

// Armado automático de la llave.
// Body: teamIds (orden de siembra) | fromStandings [{stageId, top}] | (por defecto equipos de la etapa o del torneo)
//   shuffle (sorteo; default false), keepTop (cantidad de cabezas de serie que no se sortean)
//   entryRounds { teamId: ronda } para escalera/ingresos tardíos; pairing 'fold'|'adjacent'
//   thirdPlace (partido por el tercer puesto), dates [por ronda] o startDate + intervalDays, replace
router.post('/:id/stages/:stageId/bracket', ...admin, async (req, res) => {
  try {
    const b = req.body || {};
    const ctx = await prepare(req, res, { allowExisting: b.replace === true });
    if (!ctx) return;
    const { stage } = ctx;

    const enrolled = await enrolledSet(stage.tournamentId);
    const src = await sourceTeams(stage, b, enrolled);
    if (src.error) return res.status(400).json({ error: src.error });
    let ids = src.ids;
    if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Hay equipos repetidos' });
    const missing = ids.filter((x) => !enrolled.has(x));
    if (missing.length) return res.status(400).json({ error: 'Equipos no inscriptos en el torneo: ' + missing.join(', ') });

    if (b.shuffle === true) {
      const keepTop = b.keepTop === undefined ? 0 : Number(b.keepTop);
      if (!Number.isInteger(keepTop) || keepTop < 0 || keepTop > ids.length) {
        return res.status(400).json({ error: 'keepTop inválido' });
      }
      ids = [...ids.slice(0, keepTop), ...shuffleWith(ids.slice(keepTop), (n) => crypto.randomInt(n))];
    }

    let entrants;
    if (b.entryRounds !== undefined) {
      const er = b.entryRounds;
      if (!er || typeof er !== 'object' || Array.isArray(er)) {
        return res.status(400).json({ error: 'entryRounds debe ser un objeto { teamId: ronda }' });
      }
      const extra = Object.keys(er).filter((k) => !ids.includes(k));
      if (extra.length) return res.status(400).json({ error: 'entryRounds incluye equipos fuera de la llave: ' + extra.join(', ') });
      entrants = ids.map((teamId) => ({ teamId, entryRound: er[teamId] === undefined ? 1 : Number(er[teamId]) }));
    } else {
      entrants = standardEntrants(ids);
    }

    const pairing = b.pairing === undefined ? (b.entryRounds !== undefined ? 'adjacent' : 'fold') : b.pairing;
    if (!PAIRINGS.includes(pairing)) return res.status(400).json({ error: 'pairing inválido (fold o adjacent)' });

    const built = buildSpecs(entrants, { pairing, thirdPlace: b.thirdPlace === true });
    if (built.error) return res.status(400).json({ error: built.error });
    const specs = built.specs;

    let dates = null;
    if (b.dates !== undefined) {
      if (!Array.isArray(b.dates)) return res.status(400).json({ error: 'dates debe ser una lista (una fecha por ronda)' });
      dates = b.dates.map(parseDate);
      if (dates.some((d) => d === undefined)) return res.status(400).json({ error: 'Fecha inválida en dates' });
    }
    const startDate = parseDate(b.startDate);
    if (startDate === undefined) return res.status(400).json({ error: 'startDate inválida' });
    const intervalDays = b.intervalDays === undefined ? 7 : Number(b.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 60) {
      return res.status(400).json({ error: 'intervalDays inválido (entero de 1 a 60)' });
    }
    for (const s of specs) {
      const i = s.round - 1;
      if (dates && i < dates.length) s.scheduledAt = dates[i];
      else if (startDate) s.scheduledAt = new Date(startDate.getTime() + i * intervalDays * DAY_MS);
    }

    await persist(stage, specs, ids);
    res.status(201).json(await view(stage.id));
  } catch (err) {
    handleDbError(err, res);
  }
});

// Llave manual. Body: { matches: [{ ref, round, slot, a, b, scheduledAt?, court? }] }
// a / b: null (a definir) | { teamId } | { winnerOf: ref } | { loserOf: ref }
router.put('/:id/stages/:stageId/bracket', ...admin, async (req, res) => {
  try {
    const ctx = await prepare(req, res, { allowExisting: true });
    if (!ctx) return;
    const enrolled = await enrolledSet(ctx.stage.tournamentId);
    const checked = validateSpecs(req.body && req.body.matches, enrolled);
    if (checked.error) return res.status(400).json({ error: checked.error });
    await persist(ctx.stage, checked.specs, null);
    res.status(201).json(await view(ctx.stage.id));
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:id/stages/:stageId/bracket', ...admin, async (req, res) => {
  try {
    const ctx = await prepare(req, res, { allowExisting: true });
    if (!ctx) return;
    await prisma.$transaction([
      prisma.match.deleteMany({ where: { stageId: ctx.stage.id } }),
      prisma.stageTeam.deleteMany({ where: { stageId: ctx.stage.id } }),
    ]);
    res.json({ ok: true, deletedMatches: ctx.existing });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Llave por rondas (pública)
router.get('/:id/stages/:stageId/bracket', async (req, res) => {
  try {
    const stage = await findStage(req.params.id, req.params.stageId);
    if (!stage) return res.status(404).json({ error: 'Etapa no encontrada' });
    res.json(await view(stage.id));
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;