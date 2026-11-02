const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { POINTS_PER_HIT, PICKS, OPEN_STATUSES, verdict, blockedReason } = require('../services/prode');

const router = express.Router();
router.use(authenticate);

function handleError(err, res) {
  console.error('[predictions]', err);
  return res.status(500).json({ error: 'Error interno' });
}

const matchSelect = {
  id: true, status: true, hiddenAt: true, modality: true, branch: true, scheduledAt: true, tournamentId: true,
  teamAId: true, teamBId: true,
  teamA: { select: { id: true, name: true, logo: true } },
  teamB: { select: { id: true, name: true, logo: true } },
  sets: { select: { winnerTeamId: true } },
};

const isOpen = (m) => !m.hiddenAt && OPEN_STATUSES.includes(m.status) && !!m.teamAId && !!m.teamBId;

// Estado del prode de un partido para el usuario: si puede predecir, qué eligió y cómo votó el resto
router.get('/match/:matchId', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.matchId }, select: matchSelect });
    if (!match || match.hiddenAt) return res.status(404).json({ error: 'Partido no encontrado' });
    const [mine, all, blocked] = await Promise.all([
      prisma.prediction.findUnique({ where: { userId_matchId: { userId: req.user.id, matchId: match.id } } }),
      prisma.prediction.groupBy({ by: ['pick'], where: { matchId: match.id }, _count: { _all: true } }),
      blockedReason(req.user, match),
    ]);
    const votes = { A: 0, DRAW: 0, B: 0 };
    for (const g of all) votes[g.pick] = g._count._all;
    res.json({
      open: isOpen(match),
      blocked, // texto si no puede predecir este partido
      pick: mine?.pick ?? null,
      points: POINTS_PER_HIT,
      votes: { ...votes, total: votes.A + votes.DRAW + votes.B },
      result: mine ? verdict(mine, match) : null,
    });
  } catch (err) {
    handleError(err, res);
  }
});

// Crear o cambiar la predicción (hasta que el partido empiece)
router.post('/', async (req, res) => {
  try {
    const { matchId, pick } = req.body;
    if (!matchId || !PICKS.includes(pick)) return res.status(400).json({ error: 'matchId y pick (A, DRAW o B) son obligatorios' });
    const match = await prisma.match.findUnique({ where: { id: String(matchId) }, select: matchSelect });
    if (!match || match.hiddenAt) return res.status(404).json({ error: 'Partido no encontrado' });
    if (!isOpen(match)) return res.status(409).json({ error: 'Ya no se puede predecir este partido (empezó, terminó o los equipos no están definidos)' });
    const blocked = await blockedReason(req.user, match);
    if (blocked) return res.status(403).json({ error: blocked });
    const row = await prisma.prediction.upsert({
      where: { userId_matchId: { userId: req.user.id, matchId: match.id } },
      create: { userId: req.user.id, matchId: match.id, pick, points: POINTS_PER_HIT },
      update: { pick, points: POINTS_PER_HIT },
    });
    res.json({ matchId: row.matchId, pick: row.pick, points: row.points });
  } catch (err) {
    handleError(err, res);
  }
});

// Quitar la predicción (también hasta que el partido empiece)
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

// Mis predicciones con su resultado y los puntos ganados
router.get('/me', async (req, res) => {
  try {
    const rows = await prisma.prediction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { match: { select: matchSelect } },
    });
    let total = 0;
    let hits = 0;
    let settled = 0;
    const list = rows.filter((r) => !r.match.hiddenAt).map((r) => {
      const result = verdict(r, r.match);
      const earned = result === 'HIT' ? r.points : 0;
      if (result === 'HIT' || result === 'MISS') settled++;
      if (result === 'HIT') hits++;
      total += earned;
      const { sets, hiddenAt, ...m } = r.match;
      return { matchId: r.matchId, pick: r.pick, points: r.points, result, earned, match: m };
    });
    res.json({ total, hits, settled, predictions: list });
  } catch (err) {
    handleError(err, res);
  }
});

// Ranking (global o de un torneo). Muestra apodo si es público, si no el usuario; nunca el nombre real ni el mail.
router.get('/ranking', async (req, res) => {
  try {
    const where = { match: { hiddenAt: null, status: 'FINISHED', ...(req.query.tournamentId ? { tournamentId: String(req.query.tournamentId) } : {}) } };
    const rows = await prisma.prediction.findMany({
      where,
      include: {
        match: { select: matchSelect },
        user: { select: { id: true, username: true, photo: true, profile: { select: { nickname: true, showNickname: true } } } },
      },
    });
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
    const ranking = [...by.values()].sort((a, b) => b.points - a.points || b.hits - a.hits || a.played - b.played)
      .map((e, i) => ({ position: i + 1, ...e, isMe: e.userId === req.user.id }));
    res.json({ top: ranking.slice(0, 50), me: ranking.find((e) => e.isMe) ?? null, total: ranking.length });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
