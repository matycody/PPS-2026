const express = require('express');
const prisma = require('../db');
const supabaseAdmin = require('../lib/supabaseAdmin');
const { authenticate } = require('../middleware/auth');
const storage = require('../services/storage');

const router = express.Router();

function handleError(err, res) {
  if (err.message === 'INVALID_IMAGE') {
    return res.status(400).json({ error: 'La imagen no es un JPG, PNG o WebP válido' });
  }
  console.error('[account]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// La foto vive en el perfil (jugador/árbitro) o en la cuenta (usuario registrado)
function photoTarget(user) {
  return user.profileId
    ? { kind: 'profile', id: user.profileId, path: 'profiles/' + user.profileId + '.webp' }
    : { kind: 'user', id: user.id, path: 'users/' + user.id + '.webp' };
}

async function saveTargetPhoto(target, value) {
  if (target.kind === 'profile') {
    await prisma.profile.update({ where: { id: target.id }, data: { photo: value } });
  } else {
    await prisma.user.update({ where: { id: target.id }, data: { photo: value } });
  }
}

// Subir o reemplazar mi foto (el cuerpo es la imagen, con su Content-Type)
router.put('/photo', authenticate, storage.imageBody, async (req, res) => {
  try {
    const target = photoTarget(req.user);
    const webp = await storage.processImage(req.body, 'photo');
    await storage.uploadPhoto(target.path, webp);
    await saveTargetPhoto(target, target.path);
    res.json({ url: await storage.signedUrl(target.path) });
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/photo', authenticate, async (req, res) => {
  try {
    let path = req.user.photo;
    if (req.user.profileId) {
      const profile = await prisma.profile.findUnique({
        where: { id: req.user.profileId },
        select: { photo: true },
      });
      path = profile && profile.photo;
    }
    res.json({ url: path ? await storage.signedUrl(path) : null });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/photo', authenticate, async (req, res) => {
  try {
    const target = photoTarget(req.user);
    await saveTargetPhoto(target, null);
    await storage.removeFile(storage.PHOTOS_BUCKET, target.path).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Eliminar mi cuenta: borra datos personales y favoritos; si estaba vinculada,
// solo se desvincula del perfil y el historial deportivo se conserva.
router.delete('/', authenticate, async (req, res) => {
  try {
    if (req.body.confirm !== true) {
      return res.status(400).json({ error: 'Confirmá enviando { "confirm": true }' });
    }
    const user = req.user;

    if (user.roles.includes('ADMIN')) {
      const admins = await prisma.user.count({ where: { active: true, roles: { has: 'ADMIN' } } });
      if (admins <= 1) {
        return res.status(409).json({ error: 'Sos el último admin: no podés eliminar tu cuenta' });
      }
    }

    const files = [];
    if (user.photo) files.push(user.photo);

    const ops = [
      prisma.favorite.deleteMany({ where: { userId: user.id } }),
      // Sale de las mesas de partidos que no terminaron
      prisma.matchAssignment.deleteMany({
        where: { userId: user.id, match: { status: { in: ['SCHEDULED', 'READY', 'LIVE'] } } },
      }),
    ];
    if (user.profileId) {
      files.push('profiles/' + user.profileId + '.webp');
      ops.push(
        prisma.profile.update({
          where: { id: user.profileId },
          data: { status: 'PENDIENTE_VINCULACION', photo: null },
        })
      );
    }
    // Se anonimiza (no se borra la fila: conserva la auditoría de relojes y resultados)
    ops.push(
      prisma.user.update({
        where: { id: user.id },
        data: {
          email: 'deleted-' + user.id + '@deleted.invalid',
          supabaseId: null,
          roles: { set: [] },
          profileId: null,
          photo: null,
          active: false,
        },
      })
    );
    await prisma.$transaction(ops);

    await Promise.allSettled(files.map((f) => storage.removeFile(storage.PHOTOS_BUCKET, f)));

    // Libera el mail en Supabase para poder volver a registrarse
    if (user.supabaseId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.supabaseId);
      if (error) console.error('[account] no se pudo borrar en Supabase Auth:', error.message);
    }

    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
