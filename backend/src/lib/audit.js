const prisma = require('../db');

// Se registran los cambios (no las lecturas) de estas secciones
const PREFIXES = ['/users', '/profiles', '/player-requests', '/teams', '/tournaments', '/matches', '/me', '/venues', '/news'];
const SECRET = /pass|token|secret/i;
const ID = /\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,})(?=\/|$)/gi;

const LABELS = {
  'POST /news': 'Publicó una noticia',
  'PATCH /news/:id': 'Editó una noticia',
  'DELETE /news/:id': 'Eliminó una noticia',
  'POST /venues': 'Creó una sede',
  'PATCH /venues/:id': 'Editó una sede',
  'DELETE /venues/:id': 'Eliminó una sede',
  'POST /users/:id/promote': 'Hizo admin a un usuario',
  'POST /users/:id/demote': 'Quitó admin a un usuario',
  'DELETE /users/:id': 'Desactivó un usuario',
  'POST /users/:id/reactivate': 'Reactivó un usuario',
  'POST /users/:id/referee': 'Designó un árbitro',
  'DELETE /users/:id/referee': 'Quitó el rol de árbitro',
  'POST /player-requests': 'Envió una solicitud de alta de jugador',
  'PUT /teams/:id/coach': 'Designó o quitó al DT de un equipo',
  'POST /player-requests/:id/approve': 'Aprobó una solicitud de alta',
  'POST /player-requests/:id/reject': 'Rechazó una solicitud de alta',
  'PATCH /me/profile': 'Editó su apodo o número',
  'DELETE /me': 'Dio de baja su cuenta',
  'POST /profiles': 'Cargó una persona',
  'PATCH /profiles/:id': 'Editó una persona',
  'POST /profiles/:id/unlink': 'Desvinculó la cuenta de una persona',
  'DELETE /profiles/:id': 'Eliminó una persona',
  'POST /teams': 'Creó un equipo',
  'PATCH /teams/:id': 'Editó un equipo',
  'POST /teams/:id/players': 'Agregó un jugador a un equipo',
  'DELETE /teams/:id/players/:id': 'Quitó un jugador de un equipo',
  'DELETE /teams/:id': 'Eliminó un equipo',
  'POST /tournaments': 'Creó un torneo',
  'PATCH /tournaments/:id': 'Editó un torneo',
  'DELETE /tournaments/:id': 'Eliminó un torneo',
  'PUT /tournaments/:id/teams': 'Definió los equipos de un torneo',
  'PUT /tournaments/:id/stages': 'Definió las zonas de un torneo',
  'POST /tournaments/:id/stages/:id/fixture': 'Sorteó el fixture de una zona',
  'DELETE /tournaments/:id/stages/:id/fixture': 'Eliminó el fixture de una zona',
  'PATCH /tournaments/:id/matchdays/:id': 'Cambió el día de una jornada',
  'PUT /tournaments/:id/matchdays/:id/order': 'Reordenó los partidos de una jornada',
  'POST /tournaments/:id/matchdays/:id/assign-courts': 'Asignó las canchas de una jornada',
  'POST /tournaments/:id/stages/:id/bracket': 'Armó la llave de eliminación',
  'PUT /tournaments/:id/stages/:id/bracket': 'Definió la llave a mano',
  'DELETE /tournaments/:id/stages/:id/bracket': 'Eliminó la llave',
  'POST /tournaments/:id/activate': 'Activó un torneo',
  'POST /tournaments/:id/close': 'Cerró un torneo',
  'POST /matches': 'Creó un partido',
  'PATCH /matches/:id': 'Editó un partido',
  'POST /matches/:id/cancel': 'Canceló un partido',
  'POST /matches/:id/ready': 'Marcó un partido como listo',
  'POST /matches/:id/unready': 'Desmarcó un partido como listo',
  'POST /matches/:id/finish': 'Finalizó un partido',
  'POST /matches/:id/hide': 'Ocultó un partido',
  'POST /matches/:id/restore': 'Restauró un partido',
  'DELETE /matches/:id/purge': 'Eliminó definitivamente un partido',
  'POST /matches/:id/assignments': 'Asignó personas a un partido',
  'DELETE /matches/:id/assignments/:id': 'Quitó una asignación de un partido',
  'POST /matches/:id/sets': 'Cargó un set',
  'PATCH /matches/:id/sets/:n': 'Corrigió un set',
  'DELETE /matches/:id/sets/:n': 'Eliminó un set',
  'POST /tournaments/:id/pause': 'Pausó un torneo',
  'POST /tournaments/:id/resume': 'Reanudó un torneo',
  'POST /tournaments/:id/reset': 'Reinició un torneo (borró resultados y relojes)',
  'POST /tournaments/:id/restore': 'Restauró un torneo eliminado',
  'DELETE /tournaments/:id/purge': 'Eliminó definitivamente un torneo',
  'PATCH /tournaments/:id/stages/:id/bracket/rounds/:id': 'Cambió el día de una ronda de playoffs',
  'POST /tournaments/:id/stages/:id/bracket/rounds/:id/assign-courts': 'Asignó las canchas de una ronda de playoffs',
  'POST /matches/bulk-schedule': 'Armó una jornada (días, horarios y canchas)',
  'POST /matches/:id/suspend': 'Suspendió un partido',
  'POST /matches/:id/reschedule': 'Reprogramó un partido',
  'PATCH /matches/:id/reason': 'Cambió el motivo de un partido',
  'PUT /sanctions/:id/suspension': 'Definió una suspensión',
  'DELETE /sanctions/:id/suspension': 'Quitó una suspensión',
  'PATCH /me/username': 'Cambió su nombre de usuario',
  'PUT /teams/:id/branch/:branch': 'Cambió el escudo de una rama de un equipo',
  'DELETE /teams/:id/branch/:branch': 'Quitó el escudo de una rama de un equipo',
  'PUT /teams/:id': 'Cambió el escudo de un equipo',
  'DELETE /teams/:id/photo': 'Quitó la foto de un equipo',
  'PUT /profiles/:id': 'Cambió la foto de una persona',
  'DELETE /profiles/:id/photo': 'Quitó la foto de una persona',
  'POST /venues/resolve': 'Buscó una sede',
};

// Texto entendible para quien no programa. Los movimientos viejos guardaron "MÉTODO /ruta": se traducen al mostrarlos.
const RAW = /^(GET|POST|PUT|PATCH|DELETE) \//;
function humanLabel(method, path, label) {
  if (label && !RAW.test(label)) return label;
  const key = label && RAW.test(label) ? label : method + ' ' + path;
  if (LABELS[key]) return LABELS[key];
  const verb = { POST: 'Hizo un cambio', PUT: 'Actualizó datos', PATCH: 'Editó datos', DELETE: 'Eliminó datos' }[key.split(' ')[0]] || 'Hizo un cambio';
  const area = [
    [/\/tournaments/, 'de un torneo'], [/\/matches/, 'de un partido'], [/\/teams/, 'de un equipo'], [/\/users/, 'de un usuario'],
    [/\/profiles/, 'de una persona'], [/\/venues/, 'de una sede'], [/\/sanctions/, 'de una sanción'], [/\/me/, 'de su cuenta'],
  ].find(([re]) => re.test(key));
  return area ? verb + ' ' + area[1] : verb;
}


function clean(body) {
  if (!body || typeof body !== 'object' || !Object.keys(body).length) return undefined;
  const out = {};
  for (const [k, val] of Object.entries(body)) out[k] = SECRET.test(k) ? '***' : val;
  const txt = JSON.stringify(out);
  return txt.length > 2000 ? { truncado: true } : out;
}

async function record(req, res, url) {
  const ids = (url.match(ID) || []).map((s) => s.slice(1));
  const path = url.replace(ID, '/:id').replace(/\/sets\/\d+/, '/sets/:n');
  const key = req.method + ' ' + path;

  // Al aprobar o rechazar, el movimiento tambien queda en el historial de la persona solicitante
  if (/^POST \/player-requests\/:id\/(approve|reject)$/.test(key) && ids[0]) {
    const r = await prisma.playerRequest.findUnique({ where: { id: ids[0] }, select: { userId: true } });
    if (r) ids.push(r.userId);
  }

  await prisma.auditLog.create({
    data: {
      actorId: req.user.id,
      actorEmail: req.user.email,
      method: req.method,
      path,
      label: humanLabel(req.method, path, LABELS[key]),
      targetId: ids.length ? ids.join(',') : null,
      status: res.statusCode,
      data: clean(req.body),
    },
  });
}

function auditWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const url = req.originalUrl.split('?')[0];
  if (!PREFIXES.some((p) => url === p || url.startsWith(p + '/')) || url.includes('/photo') || url === '/venues/resolve') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    record(req, res, url).catch((e) => console.error('[audit]', e.message));
  });
  next();
}

module.exports = { auditWrites, humanLabel };