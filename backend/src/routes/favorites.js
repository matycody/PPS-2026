const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const TYPES = ['TEAM', 'PLAYER'];

function handleError(err, res) {
  console.error('[favorites]', err);
  return res.status(500).json({ error: 'Error interno' });
}

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.favorite.findMany({ where: { userId: req.user.id } });
    const teamIds = rows.filter((r) => r.targetType === 'TEAM').map((r) => r.targetId);
    const playerIds = rows.filter((r) => r.targetType === 'PLAYER').map((r) => r.targetId);

    const [teams, players] = await Promise.all([
      prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, logo: true } }),
      prisma.profile.findMany({ where: { id: { in: playerIds }, active: true }, select: { id: true, name: true, nickname: true, number: true } }),
    ]);
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const playerMap = new Map(players.map((p) => [p.id, p]));

    res.json(
      rows
        .map((r) => {
          const target = r.targetType === 'TEAM' ? teamMap.get(r.targetId) : playerMap.get(r.targetId);
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
      return res.status(400).json({ error: 'targetType (TEAM o PLAYER) y targetId son obligatorios' });
    }

    const exists =
      targetType === 'TEAM'
        ? await prisma.team.findUnique({ where: { id: String(targetId) } })
        : await prisma.profile.findFirst({ where: { id: String(targetId), isPlayer: true, active: true } });
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
