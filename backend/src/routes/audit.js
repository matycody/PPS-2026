const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

function fail(res, err) {
  console.error('[audit]', err);
  res.status(500).json({ error: 'Error interno' });
}

// Equipos con sus jugadores actuales (para elegir a quien auditar)
router.get('/roster', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        logo: true,
        players: {
          where: { to: null, profile: { active: true } },
          select: {
            profile: {
              select: { id: true, name: true, nickname: true, number: true, user: { select: { id: true, email: true } } },
            },
          },
        },
      },
    });
    res.json(
      teams.map((t) => {
        const seen = new Set();
        const players = [];
        for (const p of t.players) {
          if (seen.has(p.profile.id)) continue; // un jugador en dos ramas del mismo equipo se muestra una vez
          seen.add(p.profile.id);
          players.push({
            profileId: p.profile.id,
            name: p.profile.name,
            nickname: p.profile.nickname,
            number: p.profile.number,
            userId: p.profile.user ? p.profile.user.id : null,
            email: p.profile.user ? p.profile.user.email : null,
          });
        }
        players.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        return { id: t.id, name: t.name, logo: t.logo, players };
      })
    );
  } catch (err) {
    fail(res, err);
  }
});

// ?user=<userId> &profile=<profileId> (movimientos de una persona) &q=texto &before=<ISO> &limit=100
router.get('/', async (req, res) => {
  try {
    const { q, user, profile, before } = req.query;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const and = [];
    if (user || profile) {
      const or = [];
      if (user) or.push({ actorId: String(user) }, { targetId: { contains: String(user) } });
      if (profile) or.push({ targetId: { contains: String(profile) } });
      and.push({ OR: or });
    }
    if (before && !Number.isNaN(Date.parse(before))) and.push({ createdAt: { lt: new Date(before) } });
    if (q) {
      and.push({
        OR: [
          { actorEmail: { contains: String(q), mode: 'insensitive' } },
          { label: { contains: String(q), mode: 'insensitive' } },
        ],
      });
    }
    const list = await prisma.auditLog.findMany({ where: { AND: and }, orderBy: { createdAt: 'desc' }, take: limit });
    res.json(list);
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;