const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { publicName, activeSuspensions } = require('../services/sanctions');

// Departamento de sanciones: evaluacion de rojas y suspensiones (solo ADMIN)
const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

const handle = (err, res) => {
  console.error('[sanctions]', err);
  res.status(500).json({ error: 'Error interno' });
};

const shape = (r) => ({
  id: r.id,
  kind: r.kind,
  side: r.side,
  reason: r.reason,
  createdAt: r.createdAt,
  player: r.profile ? { id: r.profile.id, name: publicName(r.profile), number: r.profile.number } : null,
  match: {
    id: r.match.id,
    scheduledAt: r.match.scheduledAt,
    branch: r.match.branch,
    modality: r.match.modality,
    teamA: r.match.teamA?.name || null,
    teamB: r.match.teamB?.name || null,
    tournament: r.match.tournament?.name || null,
  },
  suspension: r.suspension && !r.suspension.revokedAt
    ? { id: r.suspension.id, fechas: r.suspension.fechas, sameDay: r.suspension.sameDay, scope: r.suspension.scope, note: r.suspension.note, createdAt: r.suspension.createdAt }
    : null,
});

const include = {
  profile: { select: { id: true, name: true, nickname: true, showNickname: true, number: true } },
  match: { select: { id: true, scheduledAt: true, branch: true, modality: true, teamA: { select: { name: true } }, teamB: { select: { name: true } }, tournament: { select: { name: true } } } },
  suspension: true,
};

// Rojas: ?status=pending (sin evaluar) | decided (evaluadas)
router.get('/reds', async (req, res) => {
  try {
    const decided = req.query.status === 'decided';
    const rows = await prisma.matchSanction.findMany({
      where: {
        kind: 'RED',
        revokedAt: null,
        profileId: { not: null },
        suspension: decided ? { is: { revokedAt: null } } : { is: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include,
    });
    res.json({ items: rows.map(shape) });
  } catch (err) {
    handle(err, res);
  }
});

// Cantidad de rojas pendientes de evaluar (para el aviso del menu)
router.get('/reds/count', async (_req, res) => {
  try {
    const count = await prisma.matchSanction.count({ where: { kind: 'RED', revokedAt: null, profileId: { not: null }, suspension: { is: null } } });
    res.json({ count });
  } catch (err) {
    handle(err, res);
  }
});

// Suspendidos vigentes (admin): quién está afuera, por cuántas fechas y con qué alcance
router.get('/active', async (_req, res) => {
  try {
    const rows = await prisma.playerSuspension.findMany({
      where: { revokedAt: null, OR: [{ fechas: { gt: 0 } }, { sameDay: true }], sanction: { revokedAt: null, kind: 'RED' } },
      include: { profile: { select: { id: true, name: true, nickname: true, showNickname: true, number: true } }, sanction: { include: include } },
    });
    const state = await activeSuspensions(rows.map((r) => r.profileId));
    const items = rows.filter((r) => state.has(r.profileId)).map((r) => ({ ...shape({ ...r.sanction, profile: r.profile, suspension: r }), state: state.get(r.profileId) }));
    res.json({ items });
  } catch (err) {
    handle(err, res);
  }
});

// Cargar la decision: { fechas: 0..20, sameDay: bool, scope: 'MODALITY'|'ALL', note? } (0 y false = sin suspension)
router.put('/:id/suspension', async (req, res) => {
  try {
    const fechas = Number(req.body.fechas ?? 0);
    const sameDay = Boolean(req.body.sameDay);
    const scope = req.body.scope === 'ALL' ? 'ALL' : 'MODALITY';
    const note = req.body.note ? String(req.body.note).trim().slice(0, 300) : null;
    if (!Number.isInteger(fechas) || fechas < 0 || fechas > 20) return res.status(400).json({ error: 'Fechas inválidas (0 a 20)' });
    const sanction = await prisma.matchSanction.findUnique({ where: { id: req.params.id } });
    if (!sanction || sanction.kind !== 'RED' || sanction.revokedAt) return res.status(404).json({ error: 'Roja no encontrada' });
    if (!sanction.profileId) return res.status(400).json({ error: 'La roja no tiene jugador identificado' });
    const data = { fechas, sameDay, scope, note, decidedById: req.user.id, revokedAt: null };
    const row = await prisma.playerSuspension.upsert({
      where: { sanctionId: sanction.id },
      create: { sanctionId: sanction.id, profileId: sanction.profileId, ...data },
      update: data,
    });
    res.json({ id: row.id, fechas, sameDay, scope, note });
  } catch (err) {
    handle(err, res);
  }
});

// Deshacer la decision (la roja vuelve a pendiente)
router.delete('/:id/suspension', async (req, res) => {
  try {
    await prisma.playerSuspension.deleteMany({ where: { sanctionId: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    handle(err, res);
  }
});

module.exports = router;
