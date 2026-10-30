const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const TYPES = ['TEAM', 'PLAYER', 'TOURNAMENT'];

function handleError(err, res) {
  console.error('[favorites]', err);
  return res.status(500).json({ error: 'Error interno' });
}

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.favorite.findMany({ where: { userId: req.user.id } });
    const teamIds = rows.filter((r) => r.targetType === 'TEAM').map((r) => r.targetId);
    const playerIds = rows.filter((r) => r.targetType === 'PLAYER').map((r) => r.targetId);

    const tournamentIds = rows.filter((r) => r.targetType === 'TOURNAMENT').map((r) => r.targetId);

    const [teams, players, tournaments] = await Promise.all([
      prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, logo: true } }),
      prisma.profile.findMany({ where: { id: { in: playerIds }, active: true }, select: { id: true, name: true, nickname: true, number: true } }),
      prisma.tournament.findMany({ where: { id: { in: tournamentIds }, pausedAt: null, deletedAt: null }, select: { id: true, name: true, branch: true, modality: true, year: true } }),
    ]);
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));

    res.json(
      rows
        .map((r) => {
          const target = (r.targetType === 'TEAM' ? teamMap : r.targetType === 'TOURNAMENT' ? tournamentMap : playerMap).get(r.targetId);
          return target ? { targetType: r.targetType, targetId: r.targetId, ...target } : null;
        })
        .filter(Boolean)
    );
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/', async (req, res) => {
  try {
    const { targetType, targetId } = req.body;
    if (!TYPES.includes(targetType) || !targetId) {
      return res.status(400).json({ error: 'targetType (TEAM, PLAYER o TOURNAMENT) y targetId son obligatorios' });
    }

    const id = String(targetId);
    const exists =
      targetType === 'TEAM'
        ? await prisma.team.findUnique({ where: { id } })
        : targetType === 'TOURNAMENT'
          ? await prisma.tournament.findUnique({ where: { id } })
          : await prisma.profile.findFirst({ where: { id, isPlayer: true, active: true } });
    if (!exists) return res.status(404).json({ error: 'No encontrado' });

    await prisma.favorite.upsert({
      where: { userId_targetType_targetId: { userId: req.user.id, targetType, targetId: String(targetId) } },
      update: {},
      create: { userId: req.user.id, targetType, targetId: String(targetId) },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/:type/:id', async (req, res) => {
  try {
    await prisma.favorite.deleteMany({
      where: { userId: req.user.id, targetType: req.params.type, targetId: req.params.id },
    });
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
