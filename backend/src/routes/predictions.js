const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { oddsForMatches } = require('../services/odds');
const { VOID_TEXT, PICKS, OPEN_STATUSES, verdict, blockedReason, bonusFrom, freezePredictions, BLOCK_OWN, BLOCK_ASSIGNED } = require('../services/prode');

const router = express.Router();
router.use(authenticate);

function handleError(err, res) {
  console.error('[predictions]', err);
  return res.status(500).json({ error: 'Error interno' });
}

const matchSelect = {
  id: true, status: true, hiddenAt: true, modality: true, branch: true, scheduledAt: true, timeSet: true, tournamentId: true,
  teamAId: true, teamBId: true, closingOdds: true, round: true, stage: { select: { type: true, isPromotion: true } },
  tournament: { select: { id: true, name: true } },
  teamA: { select: { id: true, name: true, logo: true } },
  teamB: { select: { id: true, name: true, logo: true } },
  sets: { select: { winnerTeamId: true } },
};

// Cuotas de cada partido: abiertos = las de hoy; cerrados = las del cierre (si no se guardaron, se guardan ahora)
async function oddsOf(matches) {
  const live = await oddsForMatches(matches);
  const out = new Map();
  for (const m of matches) {
    if (m.status === 'SCHEDULED') { out.set(m.id, live.get(m.id)); continue; }
    if (m.closingOdds) { out.set(m.id, m.closingOdds); continue; }
    const o = live.get(m.id);
    await prisma.match.update({ where: { id: m.id }, data: { closingOdds: o } }).catch(() => {});
    out.set(m.id, o);
  }
  return out;
}

const isOpen = (m) => !m.hiddenAt && OPEN_STATUSES.includes(m.status) && !!m.teamAId && !!m.teamBId;

// Partidos que ya cerraron pero cuyas predicciones no se congelaron (p. ej. partidos habilitados antes de esta función)
async function ensureFrozen(rows) {
  const ids = [...new Set(rows.filter((r) => !r.closedAt && r.match.status !== 'SCHEDULED').map((r) => r.matchId))];
  if (!ids.length) return rows;
  await Promise.all(ids.map((id) => freezePredictions(id)));
  return prisma.prediction.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: { match: { select: matchSelect } } });
}

// Lo que ve el usuario de un partido: cuotas, puntos que ganaría (base × bonus), su elección y el bonus vigente.
// Mientras el partido está abierto la base es flotante; al cerrar queda lo congelado en la predicción.
function view(m, odds, mp, votes, blocked, voided = null) {
  const now = bonusFrom(m.scheduledAt);
  const mine = mp ? (mp.closedAt ? { mult: mp.bonus } : bonusFrom(m.scheduledAt, mp.pickedAt)) : null;
  const o = {};
  for (const k of PICKS) {
    const base = odds[k].pts;
    const isMine = mp && mp.pick === k;
    const mult = isMine ? mine.mult : now.mult;
    o[k] = { ...odds[k], base, pts: isMine && mp.closedAt ? mp.points : Math.round(base * mult), bonus: mult };
  }
  o.drawAllowed = odds.drawAllowed;
  return {
    open: isOpen(m),
    blocked: blocked ?? (voided ? voided : null),
    voided,
    pick: mp?.pick ?? null,
    points: mp ? o[mp.pick].pts : null,
    closedAt: mp?.closedAt ?? null,
    odds: o,
    bonus: { mult: now.mult, next: now.next, inDays: now.inDays, mine: mine?.mult ?? null },
    votes: { ...votes, total: votes.A + votes.DRAW + votes.B },
    result: mp ? verdict(mp, m) : null,
  };
}

async function context(userId, profileId, ids) {
  const [mine, groups, ownTeams, assigned] = await Promise.all([
    prisma.prediction.findMany({ where: { userId, matchId: { in: ids } } }),
    prisma.prediction.groupBy({ by: ['matchId', 'pick'], where: { matchId: { in: ids }, voidedAt: null }, _count: { _all: true } }),
    profileId ? prisma.playerTeam.findMany({ where: { profileId, to: null }, select: { teamId: true } }) : [],
    prisma.matchAssignment.findMany({ where: { matchId: { in: ids }, OR: [{ userId }, ...(profileId ? [{ profileId }] : [])] }, select: { matchId: true } }),
  ]);
  const own = new Set(ownTeams.map((t) => t.teamId));
  const asg = new Set(assigned.map((a) => a.matchId));
  const myPick = new Map(mine.filter((p) => !p.voidedAt).map((p) => [p.matchId, p]));
  const voided = new Map(mine.filter((p) => p.voidedAt).map((p) => [p.matchId, VOID_TEXT[p.voidReason] ?? 'Tu predicción no es válida.']));
  const votes = new Map();
  for (const g of groups) {
    const v = votes.get(g.matchId) ?? { A: 0, DRAW: 0, B: 0 };
    v[g.pick] = g._count._all;
    votes.set(g.matchId, v);
  }
  return {
    pick: (id) => myPick.get(id),
    voided: (id) => voided.get(id) ?? null,
    votes: (id) => votes.get(id) ?? { A: 0, DRAW: 0, B: 0 },
    blocked: (m) => (own.has(m.teamAId) || own.has(m.teamBId) ? BLOCK_OWN : asg.has(m.id) ? BLOCK_ASSIGNED : null),
  };
}

// Partidos abiertos para predecir (alimentan Calendario, Torneos, Favoritos y Destacados), con su estado para el usuario
router.get('/open', async (req, res) => {
  try {
    const matches = await prisma.match.findMany({
      where: { hiddenAt: null, status: 'SCHEDULED', teamAId: { not: null }, teamBId: { not: null } },
      select: matchSelect,
      orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }],
      take: 300,
    });
    const ids = matches.map((m) => m.id);
    const { id: userId, profileId } = req.user;
    const [ctx, odds] = await Promise.all([context(userId, profileId, ids), oddsOf(matches)]);
    res.json(matches.map((m) => {
      const { sets, stage, closingOdds, ...rest } = m;
      return { ...rest, prode: view(m, odds.get(m.id), ctx.pick(m.id), ctx.votes(m.id), ctx.blocked(m), ctx.voided(m.id)) };
    }));
  } catch (err) {
    handleError(err, res);
  }
});

// Varios partidos a la vez (para las listas): { [matchId]: estado del prode }
router.get('/matches', async (req, res) => {
  try {
    const ids = [...new Set(String(req.query.ids || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 100);
    if (!ids.length) return res.json({});
    const { id: userId, profileId } = req.user;
    const matches = await prisma.match.findMany({ where: { id: { in: ids }, hiddenAt: null }, select: matchSelect });
    const [ctx, odds] = await Promise.all([context(userId, profileId, ids), oddsOf(matches)]);
    const out = {};
    for (const m of matches) out[m.id] = view(m, odds.get(m.id), ctx.pick(m.id), ctx.votes(m.id), ctx.blocked(m), ctx.voided(m.id));
    res.json(out);
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/match/:matchId', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.matchId }, select: matchSelect });
    if (!match || match.hiddenAt) return res.status(404).json({ error: 'Partido no encontrado' });
    const { id: userId, profileId } = req.user;
    const [ctx, odds, blocked] = await Promise.all([context(userId, profileId, [match.id]), oddsOf([match]), blockedReason(req.user, match)]);
    res.json(view(match, odds.get(match.id), ctx.pick(match.id), ctx.votes(match.id), blocked, ctx.voided(match.id)));
  } catch (err) {
    handleError(err, res);
  }
});

// Crear o cambiar la predicción (hasta que el partido se habilita). Repetir la misma elección no cambia nada;
// cambiarla reinicia el reloj del bonus.
router.post('/', async (req, res) => {
  try {
    const { matchId, pick } = req.body;
    if (!matchId || !PICKS.includes(pick)) return res.status(400).json({ error: 'matchId y pick (A, DRAW o B) son obligatorios' });
    const match = await prisma.match.findUnique({ where: { id: String(matchId) }, select: matchSelect });
    if (!match || match.hiddenAt) return res.status(404).json({ error: 'Partido no encontrado' });
    if (!isOpen(match)) return res.status(409).json({ error: 'Las predicciones de este partido ya cerraron (se habilitó, empezó o los equipos no están definidos)' });
    const blocked = await blockedReason(req.user, match);
    if (blocked) return res.status(403).json({ error: blocked });
    const odds = (await oddsForMatches([match])).get(match.id);
    if (pick === 'DRAW' && !odds.drawAllowed) return res.status(400).json({ error: 'En llaves, playoffs y ascenso/descenso no hay empate' });
    const where = { userId_matchId: { userId: req.user.id, matchId: match.id } };
    const prev = await prisma.prediction.findUnique({ where });
    if (prev?.voidedAt) return res.status(403).json({ error: VOID_TEXT[prev.voidReason] ?? 'Tu predicción de este partido no es válida' });
    const base = odds[pick].pts;
    if (prev && prev.pick === pick) return res.json({ matchId: match.id, pick, points: Math.round(base * bonusFrom(match.scheduledAt, prev.pickedAt).mult) });
    const now = new Date();
    const mult = bonusFrom(match.scheduledAt, now).mult;
    const points = Math.round(base * mult); // provisorio: al cerrar se recalcula con la base de ese momento
    const row = await prisma.prediction.upsert({
      where,
      create: { userId: req.user.id, matchId: match.id, pick, points, pickedAt: now },
      update: { pick, points, pickedAt: now },
    });
    res.json({ matchId: row.matchId, pick: row.pick, points: row.points });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/match/:matchId', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.matchId }, select: matchSelect });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (!isOpen(match)) return res.status(409).json({ error: 'Ya no se puede cambiar la predicción de este partido' });
    await prisma.prediction.deleteMany({ where: { userId: req.user.id, matchId: match.id } });
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Posiciones: por torneo (?tournamentId=) o general del año (?year=, por defecto el actual). Gana quien más puntos suma; desempata por aciertos.
async function buildRanking({ tournamentId, year }) {
  const y = Number(year) || new Date().getFullYear();
  const where = {
    match: {
      hiddenAt: null,
      status: 'FINISHED',
      ...(tournamentId ? { tournamentId: String(tournamentId) } : { finishedAt: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) } }),
    },
  };
  let rows = await prisma.prediction.findMany({
    where,
    include: {
      match: { select: matchSelect },
      user: { select: { id: true, username: true, photo: true, profile: { select: { nickname: true, showNickname: true } } } },
    },
  });
  const frozen = await ensureFrozen(rows);
  if (frozen !== rows) {
    const byId = new Map(frozen.map((r) => [r.id, r]));
    rows = rows.map((r) => ({ ...r, ...(byId.get(r.id) ? { points: byId.get(r.id).points, closedAt: byId.get(r.id).closedAt } : {}) }));
  }
  const by = new Map();
  for (const r of rows) {
    const v = verdict(r, r.match);
    if (v !== 'HIT' && v !== 'MISS') continue;
    if (!by.has(r.userId)) {
      const p = r.user.profile;
      by.set(r.userId, { userId: r.userId, name: (p?.showNickname && p.nickname) || r.user.username || 'Usuario', photo: r.user.photo ?? null, points: 0, hits: 0, played: 0 });
    }
    const e = by.get(r.userId);
    e.played++;
    if (v === 'HIT') { e.hits++; e.points += r.points; }
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.hits - a.hits || a.played - b.played).map((e, i) => ({ position: i + 1, ...e }));
}

router.get('/ranking', async (req, res) => {
  try {
    const ranking = (await buildRanking(req.query)).map((e) => ({ ...e, isMe: e.userId === req.user.id }));
    res.json({ top: ranking.slice(0, 50), me: ranking.find((e) => e.isMe) ?? null, total: ranking.length });
  } catch (err) {
    handleError(err, res);
  }
});

// Mis predicciones con su resultado, puntos ganados, racha y posición en la general del año
router.get('/me', async (req, res) => {
  try {
    let rows = await prisma.prediction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { match: { select: matchSelect } },
    });
    rows = await ensureFrozen(rows);
    const odds = await oddsForMatches(rows.filter((r) => isOpen(r.match)).map((r) => r.match));
    let total = 0;
    let hits = 0;
    let settled = 0;
    const list = rows.filter((r) => !r.match.hiddenAt).map((r) => {
      const result = verdict(r, r.match);
      const earned = result === 'HIT' ? r.points : 0;
      if (result === 'HIT' || result === 'MISS') settled++;
      if (result === 'HIT') hits++;
      total += earned;
      const { sets, hiddenAt, closingOdds, ...m } = r.match;
      const o = odds.get(r.matchId);
      const points = !r.closedAt && o ? Math.round(o[r.pick].pts * bonusFrom(m.scheduledAt, r.pickedAt).mult) : r.points; // abiertas: lo que valdría hoy
      return { matchId: r.matchId, pick: r.pick, points, result, earned, voidReason: r.voidedAt ? VOID_TEXT[r.voidReason] ?? 'Tu predicción no es válida.' : null, voidedAt: r.voidedAt, cuota: r.cuota ?? o?.[r.pick]?.cuota ?? null, bonus: r.bonus ?? bonusFrom(m.scheduledAt, r.pickedAt).mult, closed: !!r.closedAt, match: m };
    });
    // racha: aciertos seguidos contando desde el último partido resuelto
    const resolved = list.filter((p) => p.result === 'HIT' || p.result === 'MISS').sort((a, b) => new Date(b.match.scheduledAt ?? 0) - new Date(a.match.scheduledAt ?? 0));
    let streak = 0;
    for (const p of resolved) { if (p.result === 'HIT') streak++; else break; }
    const ranking = await buildRanking({});
    const pos = ranking.find((e) => e.userId === req.user.id);
    res.json({ total, hits, settled, streak, position: pos?.position ?? null, players: ranking.length, predictions: list });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
