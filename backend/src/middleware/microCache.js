// Caché en memoria de pocos segundos para GET públicos (visitantes sin sesión).
// - Miles de pedidos iguales dentro de la ventana se resuelven con una sola consulta a la base.
// - Anti-estampida: si varios piden lo mismo mientras se calcula, esperan ese resultado en vez de repetir la consulta.
// Cualquier escritura (POST/PATCH/PUT/DELETE) vacía el caché: los cambios se ven al instante.
const TTL_MS = Number(process.env.MICROCACHE_TTL_MS) || 5000;
const MAX_ENTRIES = 500;
const MAX_WAITERS = 500;
const store = new Map(); // url -> { at, status, type, body }
const inflight = new Map(); // url -> [{ req, res, next }]

const PUBLIC_PREFIXES = ['/tournaments', '/teams', '/players', '/stats', '/matches', '/search'];

function reply(res, hit, state) {
  res.set('X-Cache', state);
  res.status(hit.status).type(hit.type).send(hit.body);
}

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
    reply(res, hit, 'HIT');
    return undefined;
  }

  // Ya se está calculando: esperar ese resultado
  const waiters = inflight.get(key);
  if (waiters && waiters.length < MAX_WAITERS) {
    waiters.push({ req, res, next });
    return undefined;
  }
  if (waiters) return next(); // demasiados esperando: que siga normal

  inflight.set(key, []);
  let released = false;
  const release = (result) => {
    if (released) return;
    released = true;
    const list = inflight.get(key) || [];
    inflight.delete(key);
    for (const w of list) {
      if (result) reply(w.res, result, 'HIT');
      else w.next(); // no hubo resultado reutilizable: cada uno sigue por su cuenta
    }
  };

  const origSend = res.send.bind(res);
  res.send = (body) => {
    if (res.statusCode === 200 && (typeof body === 'string' || Buffer.isBuffer(body))) {
      if (store.size >= MAX_ENTRIES) store.clear();
      const entry = { at: Date.now(), status: 200, type: res.get('Content-Type') || 'application/json', body };
      store.set(key, entry);
      const out = origSend(body);
      release(entry);
      return out;
    }
    const out = origSend(body);
    release(null);
    return out;
  };
  res.on('close', () => release(null)); // la respuesta se cortó antes de enviar: liberar a los que esperan
  res.set('X-Cache', 'MISS');
  return next();
}

module.exports = { microCache };
