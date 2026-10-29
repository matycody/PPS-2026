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

// Resumen de un vistazo para la organización: actividad de los últimos 30 días y estado general
const TZ = 'America/Argentina/Buenos_Aires';
const dayOf = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const SECTIONS = [
  ['matches', 'Partidos', /^\/matches/],
  ['tournaments', 'Torneos', /^\/tournaments/],
  ['teams', 'Equipos', /^\/teams/],
  ['people', 'Personas', /^\/(profiles|player-requests)/],
  ['users', 'Usuarios', /^\/(users|me)/],
];
const DAYS = 30;

router.get('/summary', async (req, res) => {
  try {
    const since = new Date(Date.now() - DAYS * 864e5);
    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since }, status: { lt: 400 } },
      select: { createdAt: true, actorId: true, actorEmail: true, path: true, label: true },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });

    const perDay = {};
    for (let i = DAYS - 1; i >= 0; i--) perDay[dayOf(Date.now() - i * 864e5)] = 0;
    const today = dayOf(Date.now());
    const weekAgo = Date.now() - 7 * 864e5;
    const sections = Object.fromEntries(SECTIONS.map(([k]) => [k, 0]));
    const actors = new Map();
    const actors7 = new Set();
    let week = 0;
    for (const l of logs) {
      const d = dayOf(l.createdAt);
      if (d in perDay) perDay[d]++;
      const sec = SECTIONS.find(([, , re]) => re.test(l.path));
      if (sec) sections[sec[0]]++;
      const who = l.actorId || l.actorEmail || '?';
      const a = actors.get(who) || { email: l.actorEmail, n: 0 };
      a.n++;
      actors.set(who, a);
      if (l.createdAt.getTime() >= weekAgo) { week++; actors7.add(who); }
    }

    const [matchGroups, users, teams, tournaments] = await Promise.all([
      prisma.match.groupBy({ by: ['status'], where: { hiddenAt: null }, _count: true }),
      prisma.user.count({ where: { active: true } }),
      prisma.team.count(),
      prisma.tournament.groupBy({ by: ['status'], _count: true }),
    ]);
    const mc = Object.fromEntries(matchGroups.map((g) => [g.status, g._count]));
    const tc = Object.fromEntries(tournaments.map((g) => [g.status, g._count]));

    res.json({
      days: DAYS,
      total: logs.length,
      today: perDay[today] || 0,
      week,
      avgPerDay: Math.round((logs.length / DAYS) * 10) / 10,
      activePeople7d: actors7.size,
      perDay: Object.entries(perDay).map(([day, n]) => ({ day, n })),
      sections: SECTIONS.map(([k, label]) => ({ key: k, label, n: sections[k] })),
      topActors: [...actors.values()].sort((a, b) => b.n - a.n).slice(0, 5),
      last: logs[0] ? { at: logs[0].createdAt, label: logs[0].label, by: logs[0].actorEmail } : null,
      state: {
        users,
        teams,
        tournamentsActive: tc.ACTIVE || 0,
        tournamentsTotal: Object.values(tc).reduce((a, b) => a + b, 0),
        matchesLive: mc.LIVE || 0,
        matchesPending: (mc.SCHEDULED || 0) + (mc.READY || 0),
        matchesFinished: mc.FINISHED || 0,
      },
    });
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