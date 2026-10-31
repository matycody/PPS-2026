const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const canPublish = [authenticate, requireRole('ADMIN')]; // luego: permiso para redactores delegados

const LIST_SELECT = {
  id: true, title: true, summary: true, imageUrl: true, teamId: true, authorName: true, publishedAt: true, updatedAt: true,
  team: { select: { id: true, name: true, logo: true } },
};

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseBody(b, partial) {
  const out = {};
  const errors = [];
  if (!partial || b.title !== undefined) {
    const t = clean(b.title, 140);
    if (t.length < 3) errors.push('El título necesita al menos 3 letras');
    out.title = t;
  }
  if (!partial || b.body !== undefined) {
    const t = clean(b.body, 20000);
    if (t.length < 10) errors.push('El texto de la noticia es muy corto');
    out.body = t;
  }
  if (b.summary !== undefined) out.summary = clean(b.summary, 280) || null;
  if (b.imageUrl !== undefined) {
    const u = clean(b.imageUrl, 500);
    if (u && !/^https:\/\//i.test(u)) errors.push('La imagen tiene que ser un enlace https');
    out.imageUrl = u || null;
  }
  if (b.teamId !== undefined) out.teamId = b.teamId || null;
  return { out, errors };
}

// Listado público. ?teamId=a,b (noticias de esos equipos) · ?before=ISO (paginado) · ?limit
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const where = { deletedAt: null };
    if (req.query.teamId) where.teamId = { in: String(req.query.teamId).split(',').slice(0, 20) };
    if (req.query.before) {
      const d = new Date(String(req.query.before));
      if (!Number.isNaN(d.getTime())) where.publishedAt = { lt: d };
    }
    const rows = await prisma.news.findMany({ where, select: LIST_SELECT, orderBy: { publishedAt: 'desc' }, take: limit });
    res.json(rows);
  } catch (err) {
    console.error('[news]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await prisma.news.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { ...LIST_SELECT, body: true } });
    if (!row) return res.status(404).json({ error: 'Noticia no encontrada' });
    res.json(row);
  } catch (err) {
    console.error('[news]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/', canPublish, async (req, res) => {
  try {
    const { out, errors } = parseBody(req.body ?? {}, false);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    if (out.teamId && !(await prisma.team.findUnique({ where: { id: out.teamId }, select: { id: true } }))) {
      return res.status(400).json({ error: 'Equipo inexistente' });
    }
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, profile: { select: { name: true } } } });
    const authorName = me?.profile?.name || (me?.email ? me.email.split('@')[0] : 'Organización');
    const row = await prisma.news.create({ data: { ...out, authorId: req.user.id, authorName: authorName.slice(0, 80) }, select: { ...LIST_SELECT, body: true } });
    res.status(201).json(row);
  } catch (err) {
    console.error('[news]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.patch('/:id', canPublish, async (req, res) => {
  try {
    const { out, errors } = parseBody(req.body ?? {}, true);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    if (out.teamId && !(await prisma.team.findUnique({ where: { id: out.teamId }, select: { id: true } }))) {
      return res.status(400).json({ error: 'Equipo inexistente' });
    }
    const found = await prisma.news.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true } });
    if (!found) return res.status(404).json({ error: 'Noticia no encontrada' });
    const row = await prisma.news.update({ where: { id: found.id }, data: out, select: { ...LIST_SELECT, body: true } });
    res.json(row);
  } catch (err) {
    console.error('[news]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.delete('/:id', canPublish, async (req, res) => {
  try {
    const r = await prisma.news.updateMany({ where: { id: req.params.id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!r.count) return res.status(404).json({ error: 'Noticia no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[news]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
