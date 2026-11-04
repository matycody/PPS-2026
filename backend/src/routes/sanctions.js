const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { publicName, activeSuspensions, baseWhere } = require('../services/sanctions');

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
        ...(req.query.tournamentId ? { match: { tournamentId: String(req.query.tournamentId) } } : {}),
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

// Suspendidos vigentes (admin): quién está afuera, por cuántas fechas y con qué alcance. ?tournamentId filtra por torneo.
// Incluye las sanciones de torneo sin partido (match: null).
const PROFILE_SEL = { id: true, name: true, nickname: true, showNickname: true, number: true };
const byTournament = (tid) => (tid ? [{ OR: [{ tournamentId: tid }, { sanction: { match: { tournamentId: tid } } }] }] : []);
const shapeStandalone = (r) => ({
  id: r.id,
  standalone: true,
  kind: 'STANDALONE',
  reason: r.reason,
  createdAt: r.createdAt,
  tournamentId: r.tournamentId,
  modality: r.modality,
  categories: r.categories,
  player: r.profile ? { id: r.profile.id, name: publicName(r.profile), number: r.profile.number } : null,
  match: null,
  suspension: { id: r.id, fechas: r.fechas, sameDay: r.sameDay, scope: r.scope, note: r.note, createdAt: r.createdAt },
});
router.get('/active', async (req, res) => {
  try {
    const tid = req.query.tournamentId ? String(req.query.tournamentId) : null;
    const rows = await prisma.playerSuspension.findMany({
      where: { ...baseWhere, AND: [...baseWhere.AND, ...byTournament(tid)] },
      include: { profile: { select: PROFILE_SEL }, sanction: { include: include } },
    });
    const state = await activeSuspensions(rows.map((r) => r.profileId));
    const items = rows.filter((r) => state.has(r.profileId)).map((r) => ({ ...(r.sanction ? shape({ ...r.sanction, profile: r.profile, suspension: r }) : shapeStandalone(r)), state: state.get(r.profileId) }));
    res.json({ items });
  } catch (err) {
    handle(err, res);
  }
});

// Sanciones de jugadores de un torneo sin partido (ej. tirar la pelota a otro partido a propósito para perjudicarlo)
router.get('/standalone', async (req, res) => {
  try {
    const rows = await prisma.playerSuspension.findMany({
      where: { sanctionId: null, revokedAt: null, ...(req.query.tournamentId ? { tournamentId: String(req.query.tournamentId) } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { profile: { select: PROFILE_SEL } },
    });
    const tours = await prisma.tournament.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tournamentId).filter(Boolean))] } }, select: { id: true, name: true, edition: true } });
    const tn = new Map(tours.map((t) => [t.id, t]));
    res.json({ items: rows.map((r) => ({ ...shapeStandalone(r), tournament: tn.get(r.tournamentId) ?? null })) });
  } catch (err) {
    handle(err, res);
  }
});

// { tournamentId (opcional), profileId, categories: ['FOAM:MIXED','CLOTH:MALE',...], fechas: 0..20, sameDay, reason (obligatorio) }
router.post('/standalone', async (req, res) => {
  try {
    const b = req.body || {};
    const fechas = Number(b.fechas ?? 0);
    const sameDay = Boolean(b.sameDay);
    const scope = 'ALL';
    const reason = b.reason ? String(b.reason).trim().slice(0, 200) : '';
    const note = b.note ? String(b.note).trim().slice(0, 300) : null;
    if (!reason) return res.status(400).json({ error: 'El motivo es obligatorio' });
    const categories = [...new Set(Array.isArray(b.categories) ? b.categories.map(String) : [])];
    if (!categories.length) return res.status(400).json({ error: 'Elegí al menos una modalidad y rama donde rige' });
    if (categories.some((c) => !/^(FOAM|CLOTH):(MIXED|MALE|FEMALE)$/.test(c))) return res.status(400).json({ error: 'Modalidad o rama inválida' });
    if (!Number.isInteger(fechas) || fechas < 0 || fechas > 20) return res.status(400).json({ error: 'Fechas inválidas (0 a 20)' });
    if (fechas === 0 && !sameDay) return res.status(400).json({ error: 'Indicá cuántas fechas o el resto de la jornada' });
    const [t, p] = await Promise.all([
      b.tournamentId ? prisma.tournament.findUnique({ where: { id: String(b.tournamentId) }, select: { id: true } }) : Promise.resolve(null),
      prisma.profile.findUnique({ where: { id: String(b.profileId || '') }, select: { id: true } }),
    ]);
    if (b.tournamentId && !t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (!p) return res.status(404).json({ error: 'Jugador no encontrado' });
    const row = await prisma.playerSuspension.create({
      data: { profileId: p.id, tournamentId: t?.id ?? null, modality: categories[0].split(':')[0], categories, reason, fechas, sameDay, scope, note, sourceAt: new Date(), decidedById: req.user.id },
    });
    res.status(201).json({ id: row.id });
  } catch (err) {
    handle(err, res);
  }
});

router.delete('/standalone/:id', async (req, res) => {
  try {
    const row = await prisma.playerSuspension.findFirst({ where: { id: req.params.id, sanctionId: null, revokedAt: null }, select: { id: true } });
    if (!row) return res.status(404).json({ error: 'Sanción no encontrada' });
    await prisma.playerSuspension.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
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

// Sanciones a equipos (quita de puntos) de todos los torneos; ?tournamentId filtra por torneo
router.get('/team-penalties', async (req, res) => {
  try {
    const rows = await prisma.teamPenalty.findMany({
      where: req.query.tournamentId ? { stage: { tournamentId: String(req.query.tournamentId) } } : {},
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        team: { select: { id: true, name: true, logo: true } },
        stage: { select: { id: true, name: true, tier: true, tournament: { select: { id: true, name: true, edition: true, status: true, branch: true, modality: true } } } },
      },
    });
    res.json({
      items: rows.map((r) => ({
        id: r.id, kind: r.kind, points: r.points, missing: r.missing, reason: r.reason, createdAt: r.createdAt,
        team: r.team,
        stage: { id: r.stage.id, name: r.stage.name, tier: r.stage.tier },
        tournament: r.stage.tournament,
      })),
    });
  } catch (err) {
    handle(err, res);
  }
});

module.exports = router;
