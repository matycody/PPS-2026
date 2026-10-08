const prisma = require('../db');

// Se registran los cambios (no las lecturas) de estas secciones
const PREFIXES = ['/users', '/profiles', '/player-requests', '/teams', '/tournaments', '/matches', '/me'];
const SECRET = /pass|token|secret/i;
const ID = /\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,})(?=\/|$)/gi;

const LABELS = {
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
};

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
      label: LABELS[key] || key,
      targetId: ids.length ? ids.join(',') : null,
      status: res.statusCode,
      data: clean(req.body),
    },
  });
}

function auditWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const url = req.originalUrl.split('?')[0];
  if (!PREFIXES.some((p) => url === p || url.startsWith(p + '/')) || url.includes('/photo')) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    record(req, res, url).catch((e) => console.error('[audit]', e.message));
  });
  next();
}

module.exports = { auditWrites };