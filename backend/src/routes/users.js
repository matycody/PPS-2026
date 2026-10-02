const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

const ROLES = ['ADMIN', 'REFEREE', 'PLAYER'];

const activeAdmins = () =>
  prisma.user.count({ where: { active: true, roles: { has: 'ADMIN' } } });

// Impide dejar el sistema sin admins activos
async function isLastAdmin(user) {
  return user.active && user.roles.includes('ADMIN') && (await activeAdmins()) <= 1;
}

function handleError(err, res) {
  console.error('[users]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// ?q=texto&role=ADMIN&active=true
router.get('/', async (req, res) => {
  try {
    const { q, role, active } = req.query;
    const where = {};
    if (q) where.email = { contains: String(q).toLowerCase() };
    if (ROLES.includes(role)) where.roles = { has: role };
    if (active !== undefined) where.active = active === 'true';

    const users = await prisma.user.findMany({
      where,
      orderBy: { email: 'asc' },
      select: { id: true, email: true, roles: true, active: true, profileId: true, createdAt: true },
    });
    res.json(users);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/promote', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!user.active) return res.status(409).json({ error: 'El usuario está desactivado' });
    if (user.roles.includes('ADMIN')) return res.status(409).json({ error: 'Ya es admin' });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { roles: { set: [...user.roles, 'ADMIN'] } },
    });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/demote', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!user.roles.includes('ADMIN')) return res.status(409).json({ error: 'No es admin' });
    if (await isLastAdmin(user)) {
      return res.status(409).json({ error: 'El último admin no puede ser degradado' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { roles: { set: user.roles.filter((r) => r !== 'ADMIN') } },
    });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

// Baja lógica
router.delete('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (await isLastAdmin(user)) {
      return res.status(409).json({ error: 'El último admin no puede ser eliminado' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/:id/reactivate', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { active: true } });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
