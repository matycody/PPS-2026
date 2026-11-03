const express = require('express');
const crypto = require('crypto');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const storage = require('../services/storage');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

function handleError(err, res) {
  if (err.message === 'INVALID_IMAGE') {
    return res.status(400).json({ error: 'El archivo no es una imagen válida (si es HEIC de iPhone, sacala como JPG o usá una captura)' });
  }
  console.error('[photos]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// URLs firmadas de varios perfiles: { "<profileId>": "<url>" | null }. Solo con sesión.
router.post('/sign', authenticate, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.profileIds)
      ? [...new Set(req.body.profileIds.map(String))].slice(0, 100)
      : [];
    if (!ids.length) return res.status(400).json({ error: 'profileIds obligatorio' });

    const profiles = await prisma.profile.findMany({
      where: { id: { in: ids }, active: true, photo: { not: null } },
      select: { id: true, photo: true },
    });
    const signed = await storage.signedUrls(profiles.map((p) => p.photo));
    const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

    const out = {};
    for (const id of ids) out[id] = null;
    for (const p of profiles) out[p.id] = byPath.get(p.photo) || null;
    res.json(out);
  } catch (err) {
    handleError(err, res);
  }
});

// Admin: reemplazar o quitar la foto de cualquier persona
router.put('/profiles/:id', ...admin, storage.imageBody, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

    const path = 'profiles/' + profile.id + '.webp';
    const webp = await storage.processImage(req.body, 'photo');
    await storage.uploadPhoto(path, webp);
    await prisma.profile.update({ where: { id: profile.id }, data: { photo: path } });
    res.json({ url: await storage.signedUrl(path) });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/profiles/:id', ...admin, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

    await prisma.profile.update({ where: { id: profile.id }, data: { photo: null } });
    await storage.removeFile(storage.PHOTOS_BUCKET, 'profiles/' + profile.id + '.webp').catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Admin: escudo del equipo (bucket público, la URL se guarda en Team.logo)
router.put('/teams/:id', ...admin, storage.imageBody, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const webp = await storage.processImage(req.body, 'logo');
    const url = await storage.uploadLogo('teams/' + team.id + '.webp', webp);
    await prisma.team.update({ where: { id: team.id }, data: { logo: url } });
    res.json({ logo: url });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/teams/:id', ...admin, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    await prisma.team.update({ where: { id: team.id }, data: { logo: null } });
    await storage.removeFile(storage.LOGOS_BUCKET, 'teams/' + team.id + '.webp').catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Admin: portada de una noticia (bucket público). Devuelve la URL para guardarla en News.imageUrl
router.put('/news-image', ...admin, storage.imageBody, async (req, res) => {
  try {
    const webp = await storage.processImage(req.body, 'cover');
    const url = await storage.uploadLogo('news/' + crypto.randomUUID() + '.webp', webp);
    res.json({ url });
  } catch (err) {
    handleError(err, res);
  }
});

// Admin: imagen del torneo (bucket público, la URL se guarda en Tournament.logo)
router.put('/tournaments/:id', ...admin, storage.imageBody, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    const webp = await storage.processImage(req.body, 'logo');
    const url = await storage.uploadLogo('tournaments/' + t.id + '.webp', webp);
    await prisma.tournament.update({ where: { id: t.id }, data: { logo: url } });
    res.json({ logo: url });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/tournaments/:id', ...admin, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    await prisma.tournament.update({ where: { id: t.id }, data: { logo: null } });
    await storage.removeFile(storage.LOGOS_BUCKET, 'tournaments/' + t.id + '.webp').catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Admin: escudo propio de una rama del equipo (si no tiene, se usa el general)
const BRANCHES = ['MIXED', 'MALE', 'FEMALE'];
router.put('/teams/:id/branch/:branch', ...admin, storage.imageBody, async (req, res) => {
  try {
    const { id, branch } = req.params;
    if (!BRANCHES.includes(branch)) return res.status(400).json({ error: 'Rama inválida' });
    const tb = await prisma.teamBranch.findUnique({ where: { teamId_branch: { teamId: id, branch } } });
    if (!tb) return res.status(404).json({ error: 'El equipo no tiene esa rama' });

    const webp = await storage.processImage(req.body, 'logo');
    const url = await storage.uploadLogo('teams/' + id + '-' + branch + '.webp', webp);
    await prisma.teamBranch.update({ where: { teamId_branch: { teamId: id, branch } }, data: { logo: url } });
    res.json({ logo: url });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/teams/:id/branch/:branch', ...admin, async (req, res) => {
  try {
    const { id, branch } = req.params;
    if (!BRANCHES.includes(branch)) return res.status(400).json({ error: 'Rama inválida' });
    const tb = await prisma.teamBranch.findUnique({ where: { teamId_branch: { teamId: id, branch } } });
    if (!tb) return res.status(404).json({ error: 'El equipo no tiene esa rama' });

    await prisma.teamBranch.update({ where: { teamId_branch: { teamId: id, branch } }, data: { logo: null } });
    await storage.removeFile(storage.LOGOS_BUCKET, 'teams/' + id + '-' + branch + '.webp').catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
