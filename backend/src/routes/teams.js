const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const BRANCHES = ['MIXED', 'MALE', 'FEMALE'];
// Sexo -> ramas permitidas
const ALLOWED = { M: ['MIXED', 'MALE'], F: ['MIXED', 'FEMALE'] };

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

// Crear equipo
router.post('/', ...admin, async (req, res) => {
  try {
    const { name, logo } = req.body;
    const branches = parseBranches(req.body.branches);
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
    if (!branches) return res.status(400).json({ error: 'Ramas invÃ¡lidas (MIXED, MALE, FEMALE)' });

    const team = await prisma.team.create({
      data: {
        name: String(name).trim(),
        logo: logo || null,
        branches: { create: branches.map((branch) => ({ branch })) },
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
      include: { branches: true },
      orderBy: { name: 'asc' },
    });
    res.json(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        logo: t.logo,
        branches: t.branches.map((b) => b.branch),
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
        players: {
          where: { to: null, profile: { active: true } },
          include: { profile: { select: { id: true, name: true, nickname: true, number: true } } },
        },
      },
    });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    res.json({
      id: team.id,
      name: team.name,
      logo: team.logo,
      branches: team.branches.map((b) => b.branch),
      roster: team.players.map((p) => ({
        profileId: p.profile.id,
        name: p.profile.name,
        nickname: p.profile.nickname,
        number: p.profile.number,
        branch: p.branch,
      })),
    });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Editar nombre, logo y ramas
router.patch('/:id', ...admin, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: { branches: true },
    });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const data = {};
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
      data.name = String(req.body.name).trim();
    }
    if (req.body.logo !== undefined) data.logo = req.body.logo || null;

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

    ops.push(prisma.team.update({ where: { id: team.id }, data, include: { branches: true } }));
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
      prisma.favorite.deleteMany({ where: { targetType: 'TEAM', targetId: team.id } }),
      prisma.team.delete({ where: { id: team.id } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;