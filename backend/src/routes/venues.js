const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { resolveMapsLink } = require('../lib/mapsLink');

const router = express.Router();
// Público (todos los roles y visitantes): dónde se juega durante el año
router.get('/public', async (req, res) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, latitude: true, longitude: true, mapUrl: true, courts: true, notes: true },
    });
    res.json(venues);
  } catch (err) {
    handleError(err, res);
  }
});

router.use(authenticate, requireRole('ADMIN'));

function handleError(err, res) {
  console.error('[venues]', err);
  return res.status(500).json({ error: 'Error interno' });
}

const str = (v, max) => {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  return s.length > max ? null : s;
};

// Valida el cuerpo. partial = edición (solo valida lo que vino)
function parse(b, partial) {
  const data = {};
  const errors = [];
  if (!partial || b.name !== undefined) {
    const v = str(b.name, 80);
    if (!v) errors.push('Nombre obligatorio (máx. 80 caracteres)'); else data.name = v;
  }
  if (!partial || b.address !== undefined) {
    const v = str(b.address, 160);
    if (!v) errors.push('Dirección obligatoria (máx. 160 caracteres)'); else data.address = v;
  }
  const hasLat = b.latitude !== undefined && b.latitude !== null && b.latitude !== '';
  const hasLng = b.longitude !== undefined && b.longitude !== null && b.longitude !== '';
  if (b.latitude !== undefined || b.longitude !== undefined) {
    if (hasLat !== hasLng) errors.push('Latitud y longitud van juntas');
    else if (!hasLat) { data.latitude = null; data.longitude = null; }
    else {
      const lat = Number(b.latitude);
      const lng = Number(b.longitude);
      if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) errors.push('Coordenadas inválidas');
      else { data.latitude = lat; data.longitude = lng; }
    }
  }
  if (b.mapUrl !== undefined) {
    const v = str(b.mapUrl, 300);
    if (v === null || (v && !/^https?:\/\//i.test(v))) errors.push('El enlace del mapa debe empezar con http(s):// (máx. 300 caracteres)');
    else data.mapUrl = v || null;
  }
  if (b.courts !== undefined) {
    if (b.courts === null || b.courts === '') data.courts = null;
    else {
      const c = Number(b.courts);
      if (!Number.isInteger(c) || c < 1 || c > 50) errors.push('Canchas inválidas (1 a 50)'); else data.courts = c;
    }
  }
  if (b.notes !== undefined) {
    const v = str(b.notes, 300);
    if (v === null) errors.push('Nota demasiado larga (máx. 300 caracteres)'); else data.notes = v || null;
  }
  return { data, errors };
}

router.get('/', async (req, res) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { matches: true } } },
    });
    res.json(venues.map(({ _count, ...v }) => ({ ...v, matchCount: _count.matches })));
  } catch (err) {
    handleError(err, res);
  }
});

// Lee un enlace de Google Maps (largo o corto) y devuelve nombre, dirección y coordenadas para precargar el formulario
router.post('/resolve', async (req, res) => {
  try {
    const url = String((req.body && req.body.url) || '').trim();
    if (!/^https?:\/\//i.test(url) || url.length > 500) return res.status(400).json({ error: 'Pegá un enlace de Google Maps (empieza con https://)' });
    try {
      res.json(await resolveMapsLink(url));
    } catch (e) {
      res.status(422).json({ error: e.message === 'El enlace debe ser de Google Maps' ? e.message : 'No pude leer ese enlace. Completá los datos a mano.' });
    }
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/', async (req, res) => {
  try {
    const { data, errors } = parse(req.body || {}, false);
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    res.status(201).json(await prisma.venue.create({ data }));
  } catch (err) {
    handleError(err, res);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const v = await prisma.venue.findUnique({ where: { id: req.params.id } });
    if (!v || v.deletedAt) return res.status(404).json({ error: 'Sede no encontrada' });
    const { data, errors } = parse(req.body || {}, true);
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    res.json(await prisma.venue.update({ where: { id: v.id }, data }));
  } catch (err) {
    handleError(err, res);
  }
});

// Baja lógica: los partidos que ya la usaban conservan la sede
router.delete('/:id', async (req, res) => {
  try {
    const v = await prisma.venue.findUnique({ where: { id: req.params.id } });
    if (!v || v.deletedAt) return res.status(404).json({ error: 'Sede no encontrada' });
    await prisma.venue.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
