// Caché en memoria de pocos segundos para GET públicos (visitantes sin sesión).
// Miles de pedidos iguales dentro de la ventana se resuelven con una sola consulta a la base.
// Cualquier escritura (POST/PATCH/PUT/DELETE) vacía el caché: los cambios se ven al instante.
const TTL_MS = Number(process.env.MICROCACHE_TTL_MS) || 5000;
const MAX_ENTRIES = 500;
const store = new Map(); // url -> { at, status, type, body }

const PUBLIC_PREFIXES = ['/tournaments', '/teams', '/players', '/stats', '/matches', '/search'];

function microCache(req, res, next) {
  if (req.method !== 'GET') {
    if (store.size) store.clear();
    return next();
  }
  if (req.headers.authorization) return next(); // con sesión: la respuesta puede depender del rol
  if (!PUBLIC_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + '/'))) return next();

  const key = req.originalUrl;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.set('X-Cache', 'HIT');
    res.status(hit.status).type(hit.type).send(hit.body);
    return undefined;
  }

  const origSend = res.send.bind(res);
  res.send = (body) => {
    if (res.statusCode === 200 && (typeof body === 'string' || Buffer.isBuffer(body))) {
      if (store.size >= MAX_ENTRIES) store.clear();
      store.set(key, { at: Date.now(), status: 200, type: res.get('Content-Type') || 'application/json', body });
    }
    return origSend(body);
  };
  res.set('X-Cache', 'MISS');
  return next();
}

module.exports = { microCache };
