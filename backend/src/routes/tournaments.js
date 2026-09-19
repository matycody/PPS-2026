const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

function parseDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined = inválida
}

function handleDbError(err, res) {
  console.error('[tournaments]', err);
  return res.status(500).json({ error: 'Error interno' });
}

router.post('/', ...admin, async (req, res) => {
  try {
    const { name } = req.body;
    const startsAt = parseDate(req.body.startsAt);
    const endsAt = parseDate(req.body.endsAt);
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
    if (startsAt === undefined || endsAt === undefined) return res.status(400).json({ error: 'Fecha inválida' });
    if (startsAt && endsAt && startsAt > endsAt) {
      return res.status(400).json({ error: 'La fecha de inicio es posterior a la de fin' });
    }
    const t = await prisma.tournament.create({ data: { name: String(name).trim(), startsAt, endsAt } });
    res.status(201).json(t);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Público
router.get('/', async (req, res) => {
  try {
    res.json(await prisma.tournament.findMany({ orderBy: { startsAt: 'desc' } }));
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(t);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.patch('/:id', ...admin, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    const data = {};
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
      data.name = String(req.body.name).trim();
    }
    if (req.body.startsAt !== undefined) {
      const d = parseDate(req.body.startsAt);
      if (d === undefined) return res.status(400).json({ error: 'Fecha inválida' });
      data.startsAt = d;
    }
    if (req.body.endsAt !== undefined) {
      const d = parseDate(req.body.endsAt);
      if (d === undefined) return res.status(400).json({ error: 'Fecha inválida' });
      data.endsAt = d;
    }
    const s = 'startsAt' in data ? data.startsAt : t.startsAt;
    const e = 'endsAt' in data ? data.endsAt : t.endsAt;
    if (s && e && s > e) {
      return res.status(400).json({ error: 'La fecha de inicio es posterior a la de fin' });
    }

    res.json(await prisma.tournament.update({ where: { id: t.id }, data }));
  } catch (err) {
    handleDbError(err, res);
  }
});

// Solo si no tiene partidos (no se borra historial)
router.delete('/:id', ...admin, async (req, res) => {
  try {
    const matches = await prisma.match.count({ where: { tournamentId: req.params.id } });
    if (matches) {
      return res.status(409).json({ error: 'El torneo tiene partidos: no se puede eliminar' });
    }
    await prisma.tournament.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Torneo no encontrado' });
    handleDbError(err, res);
  }
});

module.exports = router;