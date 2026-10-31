const express = require('express');
const crypto = require('crypto');
const sharp = require('sharp');
const prisma = require('../db');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../services/matchAccess');
const storage = require('../services/storage');
const { readSheet } = require('../services/sheetReader');
const { loadRoster, publicRoster, buildProposal } = require('../services/sheetMatch');

const router = express.Router();
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };

const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '12mb' });
const imageBody = (req, res, next) => rawImage(req, res, (err) => {
  if (err) return res.status(err.status === 413 ? 413 : 400).json({ error: 'Imagen inválida o mayor a 12 MB' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Enviá la foto (JPG, PNG o WebP) como cuerpo' });
  next();
});

function fail(res, err) {
  console.error('[sheets]', err);
  res.status(500).json({ error: 'Error interno' });
}

// Mesa asignada (o admin) del partido
async function loadForTable(req, res) {
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match || match.hiddenAt) { res.status(404).json({ error: 'Partido no encontrado' }); return null; }
  if (match.status === 'CANCELLED') { res.status(409).json({ error: 'El partido está cancelado' }); return null; }
  const perms = await getPermissions(req.user, match);
  if (!perms.isAdmin && !(perms.isTable && !perms.tableLockedBy)) { res.status(403).json({ error: 'Solo la mesa del partido puede cargar la planilla' }); return null; }
  return match;
}

// Subir la foto: se guarda el original SIEMPRE, se lee con IA y se devuelve una propuesta para que la mesa confirme
router.post('/:id/sheet/photo', authenticate, imageBody, async (req, res) => {
  try {
    const match = await loadForTable(req, res);
    if (!match) return;
    let meta;
    try { meta = await sharp(req.body).metadata(); } catch { return res.status(400).json({ error: 'La imagen no es un JPG, PNG o WebP válido' }); }
    if (!EXT[meta.format]) return res.status(400).json({ error: 'La imagen no es un JPG, PNG o WebP válido' });

    const id = crypto.randomUUID();
    const mime = 'image/' + meta.format;
    const path = match.id + '/' + id + '.' + EXT[meta.format];
    await storage.uploadSheet(path, req.body, mime);
    let sheet = await prisma.matchSheet.create({
      data: {
        id, matchId: match.id, kind: 'PRE', imagePath: path, mime, bytes: req.body.length,
        sha256: crypto.createHash('sha256').update(req.body).digest('hex'), uploadedById: req.user.id,
      },
    });

    const roster = await loadRoster(match);
    let proposal = null;
    let aiError = null;
    try {
      const { data, model } = await readSheet(req.body);
      sheet = await prisma.matchSheet.update({ where: { id }, data: { provider: 'gemini', aiModel: model, extracted: data } });
      proposal = await buildProposal(match, data, roster);
    } catch (e) {
      aiError = String(e.message || e).slice(0, 300);
      console.warn('[sheets] lectura falló:', aiError);
      await prisma.matchSheet.update({ where: { id }, data: { aiError } });
    }
    res.status(201).json({
      sheetId: sheet.id,
      imageUrl: await storage.signedSheetUrl(path),
      aiError, // si falla, la mesa marca a mano con la foto a la vista
      proposal,
      roster: publicRoster(roster),
    });
  } catch (err) { fail(res, err); }
});

// Confirmar: la mesa decide quién juega. Body: { players: [{ profileId, present }] }
router.post('/:id/sheet/:sheetId/confirm', authenticate, async (req, res) => {
  try {
    const match = await loadForTable(req, res);
    if (!match) return;
    const sheet = await prisma.matchSheet.findFirst({ where: { id: req.params.sheetId, matchId: match.id } });
    if (!sheet) return res.status(404).json({ error: 'Planilla no encontrada' });
    if (sheet.status !== 'PENDING') return res.status(409).json({ error: 'Esta planilla ya fue confirmada' });

    const list = Array.isArray(req.body?.players) ? req.body.players : [];
    const roster = await loadRoster(match);
    const byId = new Map(roster.map((r) => [r.profileId, r]));
    const seen = new Set();
    const rows = [];
    for (const p of list) {
      const r = byId.get(String(p?.profileId));
      if (!r) return res.status(400).json({ error: 'Hay un jugador que no pertenece a ninguno de los dos equipos' });
      if (seen.has(r.profileId)) continue;
      seen.add(r.profileId);
      rows.push({ matchId: match.id, profileId: r.profileId, teamId: r.teamId, present: p.present === true, sheetId: sheet.id });
    }
    if (!rows.length) return res.status(400).json({ error: 'No hay jugadores para confirmar' });

    await prisma.$transaction([
      prisma.matchSheet.updateMany({ where: { matchId: match.id, status: 'CONFIRMED' }, data: { status: 'SUPERSEDED' } }),
      prisma.matchAttendance.deleteMany({ where: { matchId: match.id } }),
      prisma.matchAttendance.createMany({ data: rows }),
      prisma.matchSheet.update({
        where: { id: sheet.id },
        data: {
          status: 'CONFIRMED', confirmedById: req.user.id, confirmedAt: new Date(),
          confirmed: { players: rows.map((r) => ({ profileId: r.profileId, teamId: r.teamId, present: r.present })), note: typeof req.body?.note === 'string' ? req.body.note.slice(0, 300) : null },
        },
      }),
    ]);
    const io = req.app.get('io');
    if (io) io.to('match:' + match.id).emit('match:attendance', { matchId: match.id });
    res.json({ ok: true, present: rows.filter((r) => r.present).length, absent: rows.filter((r) => !r.present).length });
  } catch (err) { fail(res, err); }
});

// Anular: la mesa cargó una planilla equivocada. Se vuelve a "todos disponibles"; la foto y su registro quedan para auditoría.
router.post('/:id/sheet/reject', authenticate, async (req, res) => {
  try {
    const match = await loadForTable(req, res);
    if (!match) return;
    const sheet = await prisma.matchSheet.findFirst({ where: { matchId: match.id, status: 'CONFIRMED' } });
    if (!sheet) return res.status(404).json({ error: 'No hay una planilla confirmada para anular' });
    await prisma.$transaction([
      prisma.matchAttendance.deleteMany({ where: { matchId: match.id } }),
      prisma.matchSheet.update({ where: { id: sheet.id }, data: { status: 'REJECTED' } }),
    ]);
    const io = req.app.get('io');
    if (io) io.to('match:' + match.id).emit('match:attendance', { matchId: match.id });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// Quién juega según la planilla confirmada (público: se ve en gris a quien no juega)
router.get('/:id/attendance', optionalAuth, async (req, res) => {
  try {
    const isAdmin = Boolean(req.user && req.user.roles.includes('ADMIN'));
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, select: { id: true, hiddenAt: true } });
    if (!match || (match.hiddenAt && !isAdmin)) return res.status(404).json({ error: 'Partido no encontrado' });
    const rows = await prisma.matchAttendance.findMany({ where: { matchId: match.id }, select: { profileId: true, present: true } });
    res.json({ confirmed: rows.length > 0, items: rows });
  } catch (err) { fail(res, err); }
});

// La planilla confirmada del partido con su foto: la ve la mesa de ese partido (también después de jugarlo) y el admin
router.get('/:id/sheet', authenticate, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match || match.hiddenAt) return res.status(404).json({ error: 'Partido no encontrado' });
    const perms = await getPermissions(req.user, match);
    if (!perms.isAdmin && !perms.isTable) return res.status(403).json({ error: 'Solo la mesa del partido puede ver la planilla' });
    const sheet = await prisma.matchSheet.findFirst({ where: { matchId: match.id, status: 'CONFIRMED' } });
    if (!sheet) return res.json({ sheet: null });
    const rows = await prisma.matchAttendance.findMany({ where: { matchId: match.id }, select: { present: true } });
    res.json({ sheet: {
      id: sheet.id, imageUrl: await storage.signedSheetUrl(sheet.imagePath), uploadedAt: sheet.uploadedAt, confirmedAt: sheet.confirmedAt,
      present: rows.filter((r) => r.present).length, absent: rows.filter((r) => !r.present).length,
    } });
  } catch (err) { fail(res, err); }
});

// Auditoría: todas las planillas del partido con su foto original (solo admin)
router.get('/:id/sheets', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const sheets = await prisma.matchSheet.findMany({ where: { matchId: req.params.id }, orderBy: { uploadedAt: 'desc' } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(sheets.flatMap((s) => [s.uploadedById, s.confirmedById]).filter(Boolean))] } }, select: { id: true, email: true } });
    const email = new Map(users.map((u) => [u.id, u.email]));
    res.json(await Promise.all(sheets.map(async (s) => ({
      id: s.id, kind: s.kind, status: s.status, sha256: s.sha256, bytes: s.bytes, uploadedAt: s.uploadedAt,
      uploadedBy: email.get(s.uploadedById) ?? null, confirmedAt: s.confirmedAt, confirmedBy: email.get(s.confirmedById) ?? null,
      provider: s.provider, aiModel: s.aiModel, aiError: s.aiError, extracted: s.extracted, confirmed: s.confirmed,
      imageUrl: await storage.signedSheetUrl(s.imagePath),
    }))));
  } catch (err) { fail(res, err); }
});

module.exports = router;
