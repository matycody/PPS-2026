// Caché muy corto de autorización por (usuario, partido): evita 3 consultas a la base por cada comando del reloj.
// Se invalida al cambiar el estado del partido (notifyMatch) y vence solo en pocos segundos,
// así que quitar un permiso o una asignación hace efecto casi de inmediato.
const TTL_MS = 3000;
const store = new Map(); // "userId:matchId" -> { at, value }

function get(userId, matchId) {
  const hit = store.get(userId + ':' + matchId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  return null;
}

function set(userId, matchId, value) {
  if (store.size > 2000) store.clear();
  store.set(userId + ':' + matchId, { at: Date.now(), value });
}

function clearMatch(matchId) {
  for (const k of store.keys()) if (k.endsWith(':' + matchId)) store.delete(k);
}

module.exports = { get, set, clearMatch };
