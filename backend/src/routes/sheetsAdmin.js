const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const storage = require('../services/storage');

// Pantalla del organizador: todas las planillas de juego cargadas, partido por partido (solo admin)
const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

const teamSel = { select: { id: true, name: true, logo: true } };
const matchSel = {
  id: true, branch: true, modality: true, status: true, scheduledAt: true, timeSet: true,
  tournament: { select: { id: true, name: true } }, teamA: teamSel, teamB: teamSel,
};

async function emails(ids) {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids.filter(Boolean))] } }, select: { id: true, email: true } });
  return new Map(users.map((u) => [u.id, u.email]));
}

// Un renglón por partido con planilla: la vigente (confirmada) o, si no hay, la última subida
router.get('/', async (req, res) => {
  try {
    const sheets = await prisma.matchSheet.findMany({ orderBy: { uploadedAt: 'desc' }, take: 1000 });
    const byMatch = new Map();
    for (const s of sheets) { if (!byMatch.has(s.matchId)) byMatch.set(s.matchId, []); byMatch.get(s.matchId).push(s); }
    const ids = [...byMatch.keys()];
    const [matches, att, mail] = await Promise.all([
      prisma.match.findMany({ where: { id: { in: ids } }, select: matchSel }),
      prisma.matchAttendance.findMany({ where: { matchId: { in: ids } }, select: { matchId: true, present: true } }),
      emails(sheets.flatMap((s) => [s.uploadedById, s.confirmedById])),
    ]);
    const counts = new Map();
    for (const a of att) { const c = counts.get(a.matchId) || { present: 0, absent: 0 }; c[a.present ? 'present' : 'absent']++; counts.set(a.matchId, c); }
    const items = await Promise.all(matches.map(async (m) => {
      const list = byMatch.get(m.id);
      const cur = list.find((s) => s.status === 'CONFIRMED') || list[0];
      return {
        match: m, status: cur.status, versions: list.length,
        uploadedAt: cur.uploadedAt, uploadedBy: mail.get(cur.uploadedById) ?? null,
        confirmedAt: cur.confirmedAt, confirmedBy: mail.get(cur.confirmedById) ?? null,
        aiError: cur.aiError, ...(counts.get(m.id) || { present: 0, absent: 0 }),
        thumbUrl: await storage.signedSheetUrl(cur.imagePath),
      };
    }));
    items.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json(items);
  } catch (err) { console.error('[sheetsAdmin]', err); res.status(500).json({ error: 'Error interno' }); }
});

// Detalle: todas las versiones con su foto + los jugadores confirmados con nombre
router.get('/:matchId', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.matchId }, select: matchSel });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    const sheets = await prisma.matchSheet.findMany({ where: { matchId: match.id }, orderBy: { uploadedAt: 'desc' } });
    const att = await prisma.matchAttendance.findMany({ where: { matchId: match.id } });
    const [profiles, mail] = await Promise.all([
      prisma.profile.findMany({ where: { id: { in: att.map((a) => a.profileId) } }, select: { id: true, name: true, number: true } }),
      emails(sheets.flatMap((s) => [s.uploadedById, s.confirmedById])),
    ]);
    const pm = new Map(profiles.map((p) => [p.id, p]));
    res.json({
      match,
      players: att.map((a) => ({ teamId: a.teamId, present: a.present, name: pm.get(a.profileId)?.name ?? '—', number: pm.get(a.profileId)?.number ?? null }))
        .sort((x, y) => x.teamId.localeCompare(y.teamId) || (x.number ?? 99) - (y.number ?? 99)),
      sheets: await Promise.all(sheets.map(async (s) => ({
        id: s.id, status: s.status, bytes: s.bytes, sha256: s.sha256, uploadedAt: s.uploadedAt, uploadedBy: mail.get(s.uploadedById) ?? null,
        confirmedAt: s.confirmedAt, confirmedBy: mail.get(s.confirmedById) ?? null, aiModel: s.aiModel, aiError: s.aiError,
        imageUrl: await storage.signedSheetUrl(s.imagePath),
      }))),
    });
  } catch (err) { console.error('[sheetsAdmin]', err); res.status(500).json({ error: 'Error interno' }); }
});

module.exports = router;
