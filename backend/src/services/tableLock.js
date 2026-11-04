// Mesa única por partido: la primera persona que entra a la pantalla de control como mesa opera;
// las demás con permiso de mesa ven el partido en solo lectura hasta que quien opera salga de esa pantalla.
// - Salir de la pantalla del partido libera el control al instante.
// - Si se corta la conexión se espera GRACE_MS antes de liberar (un corte breve de red no hace perder el control).
// - Árbitros y organizadores no entran en este bloqueo.
// - La misma persona en otra pestaña o dispositivo comparte el control.
const authCache = require('./authCache');

const GRACE_MS = Number(process.env.TABLE_LOCK_GRACE_MS) || 15000;
const holders = new Map(); // matchId -> { userId, name, sockets: Set, timer }
let onFree = () => {};

function init(freeFn) {
  onFree = freeFn;
}

// Nombre de quien opera, si es otra persona (null = nadie, o es la misma persona)
function blockedFor(matchId, userId) {
  const h = holders.get(matchId);
  return h && h.userId !== userId ? h.name : null;
}

// Intenta tomar el control. { ok: true } o { ok: false, holder: nombre }
function acquire(matchId, userId, socketId, name) {
  const h = holders.get(matchId);
  if (h && h.userId !== userId) return { ok: false, holder: h.name };
  if (h) {
    clearTimeout(h.timer);
    h.timer = null;
    h.sockets.add(socketId);
  } else {
    holders.set(matchId, { userId, name, sockets: new Set([socketId]), timer: null });
    authCache.clearMatch(matchId);
  }
  return { ok: true };
}

function drop(matchId, h) {
  clearTimeout(h.timer);
  holders.delete(matchId);
  authCache.clearMatch(matchId);
  onFree(matchId);
}

// Quien opera sale de la pantalla (o se desconecta: grace = true)
function release(matchId, socketId, grace = false) {
  const h = holders.get(matchId);
  if (!h || !h.sockets.has(socketId)) return;
  h.sockets.delete(socketId);
  if (h.sockets.size) return; // sigue conectado en otra pestaña
  if (!grace) return drop(matchId, h);
  h.timer = setTimeout(() => { if (holders.get(matchId) === h && !h.sockets.size) drop(matchId, h); }, GRACE_MS);
}

function releaseSocket(socketId, grace = true) {
  for (const matchId of [...holders.keys()]) release(matchId, socketId, grace);
}

module.exports = { init, acquire, release, releaseSocket, blockedFor };
