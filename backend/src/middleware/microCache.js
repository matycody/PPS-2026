// Caché en memoria de pocos segundos para GET públicos (visitantes sin sesión).
// - Miles de pedidos iguales dentro de la ventana se resuelven con una sola consulta a la base.
// - Anti-estampida: si varios piden lo mismo mientras se calcula, esperan ese resultado en vez de repetir la consulta.
// - Vencido el TTL, se sirve la última respuesta (hasta STALE_MS) y se recalcula en segundo plano: nadie espera un recálculo.
// - La respuesta se guarda también comprimida (gzip): se comprime una vez por recálculo y no una vez por pedido.
// Cualquier escritura (POST/PATCH/PUT/DELETE) vacía el caché: los cambios se ven al instante.
const zlib = require('zlib');
const http = require('http');
const crypto = require('crypto');
const { clearMemo } = require('../lib/memo');
const TTL_MS = Number(process.env.MICROCACHE_TTL_MS) || 5000;
const STALE_MS = Number(process.env.MICROCACHE_STALE_MS) || 90000; // máximo que se sirve una respuesta vencida (las escrituras la vacían igual)
const MAX_ENTRIES = 500;
const MAX_WAITERS = 500;
const MIN_GZIP_BYTES = 1024;
const WAIT_LIMIT_MS = 30000; // máximo que esperan los pedidos agrupados antes de seguir por su cuenta
const store = new Map(); // url -> { at, status, type, body, gz }
const inflight = new Map(); // url -> [{ req, res, next }]
const refreshing = new Set(); // urls que se están recalculando en segundo plano
const REFRESH_TOKEN = crypto.randomBytes(16).toString('hex'); // solo este proceso conoce el valor: un cliente no puede forzar recálculos
let generation = 0; // sube con cada escritura: un cálculo iniciado antes de una escritura no se guarda

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PUBLIC_PREFIXES = ['/tournaments', '/teams', '/players', '/stats', '/matches', '/search'];

function etagOf(body) {
  return 'W/"' + crypto.createHash('sha1').update(body).digest('base64').slice(0, 22) + '"';
}

// Direcciones más pedidas: se recalculan solas (tras una escritura y cada tanto en reposo) para que nadie espere el cálculo en frío
const hot = new Map(); // url -> { n: pedidos, last: último pedido }
const REWARM_TOP = process.env.MICROCACHE_REWARM_TOP === undefined ? 6 : Number(process.env.MICROCACHE_REWARM_TOP) || 0; // 0 lo apaga
const REWARM_DELAY_MS = 1500;
const WARM_EVERY_MS = Number(process.env.MICROCACHE_WARM_EVERY_MS) || 45000; // mantenimiento en reposo
const WARM_IDLE_MS = 15 * 60 * 1000; // dejan de mantenerse si nadie las pide en 15 min
let localPort = null;
let rewarmTimer = null;

function topKeys(maxIdleMs) {
  const now = Date.now();
  return [...hot.entries()]
    .filter(([, v]) => v.n >= 3 && now - v.last < maxIdleMs)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, REWARM_TOP)
    .map(([k]) => k);
}

// Recalcula de a una las direcciones que faltan o están por vencer: no se juntan varios cálculos pesados
function warmKeys(keys, maxAgeMs) {
  const next = () => {
    const key = keys.shift();
    if (!key) return;
    const e = store.get(key);
    if (e && Date.now() - e.at < maxAgeMs) return next(); // sigue fresca
    startRefresh(localPort, key, next);
  };
  next();
}

function scheduleRewarm() {
  if (!REWARM_TOP || !localPort || rewarmTimer) return;
  rewarmTimer = setTimeout(() => {
    rewarmTimer = null;
    const keys = topKeys(WARM_IDLE_MS);
    for (const v of hot.values()) v.n = Math.floor(v.n / 2); // el interés viejo se va apagando
    warmKeys(keys, 1); // tras una escritura el caché está vacío: se recalculan todas
  }, REWARM_DELAY_MS);
  if (rewarmTimer.unref) rewarmTimer.unref();
}

// En reposo: cada tanto se renuevan las populares antes de que venzan, así el primer visitante nunca espera
if (REWARM_TOP) {
  const t = setInterval(() => { if (localPort) warmKeys(topKeys(WARM_IDLE_MS), Math.floor(STALE_MS / 3)); }, WARM_EVERY_MS);
  if (t.unref) t.unref();
}

function acceptsGzip(req) {
  const h = req.headers['accept-encoding'];
  return typeof h === 'string' && /\bgzip\b/i.test(h);
}

// Los navegadores revalidan siempre (max-age=0: tras escribir ven lo nuevo al instante); un CDN puede reutilizar 5 s
const CACHE_CONTROL = 'public, max-age=0, s-maxage=5, stale-while-revalidate=20';

function reply(req, res, hit, state) {
  res.set('X-Cache', state);
  if (hit.status === 200 && hit.etag) {
    res.set({ ETag: hit.etag, 'Cache-Control': CACHE_CONTROL, Vary: 'Accept-Encoding' });
    // El cliente ya tiene esta versión: se responde sin cuerpo (ahorra CPU y datos)
    if (req.headers['if-none-match'] === hit.etag) {
      res.status(304).end();
      return;
    }
  }
  if (hit.gz && acceptsGzip(req)) {
    // Ya comprimida: el middleware de compresión la deja pasar tal cual
    res.set({ 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    res.status(hit.status).type(hit.type).send(hit.gz);
    return;
  }
  res.status(hit.status).type(hit.type).send(hit.body);
}

// Recalcula una URL en segundo plano con un pedido interno (por loopback) que atraviesa la ruta normal
function startRefresh(port, key, onDone) {
  if (refreshing.has(key) || inflight.has(key)) { if (onDone) onDone(); return; }
  refreshing.add(key);
  let ended = false;
  const done = () => { if (ended) return; ended = true; refreshing.delete(key); if (onDone) onDone(); };
  try {
    const r = http.request({
      host: '127.0.0.1', port, path: key, method: 'GET', timeout: 30000,
      headers: { 'x-mc-refresh': REFRESH_TOKEN, 'accept-encoding': 'identity', accept: 'application/json' },
    }, (resp) => { resp.resume(); resp.on('end', done); resp.on('error', done); resp.on('close', done); });
    r.on('error', done);
    r.on('timeout', () => { r.destroy(); done(); });
    r.end();
  } catch (e) {
    done();
  }
}

function microCache(req, res, next) {
  if (req.method !== 'GET') {
    // HEAD y OPTIONS no modifican datos: pasan sin vaciar el caché
    if (!WRITE_METHODS.has(req.method)) return next();
    generation += 1;
    if (store.size) store.clear();
    clearMemo();
    res.on('finish', () => { generation += 1; store.clear(); clearMemo(); scheduleRewarm(); }); // y otra vez al terminar, por si un GET guardó datos viejos mientras se escribía
    return next();
  }
  // Con sesión la respuesta puede depender del rol; el listado de partidos es igual para todos (salvo los ocultos del admin)
  const sameForAll = req.path === '/matches' && req.query.hidden !== 'true';
  if (req.headers.authorization && !sameForAll) return next();
  if (!PUBLIC_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + '/'))) return next();

  const key = req.originalUrl;
  localPort = req.socket.localPort;
  if (!req.headers['x-mc-refresh']) {
    if (hot.size >= MAX_ENTRIES && !hot.has(key)) hot.clear();
    const h = hot.get(key);
    if (h) { h.n += 1; h.last = Date.now(); } else hot.set(key, { n: 1, last: Date.now() });
  }
  const isRefresh = req.headers['x-mc-refresh'] === REFRESH_TOKEN;
  const hit = isRefresh ? null : store.get(key);
  if (hit) {
    const age = Date.now() - hit.at;
    if (age < TTL_MS) {
      reply(req, res, hit, 'HIT');
      return undefined;
    }
    if (age < STALE_MS) {
      reply(req, res, hit, 'STALE'); // vencida: se entrega igual y se recalcula aparte
      startRefresh(req.socket.localPort, key);
      return undefined;
    }
  }

  // Ya se está calculando: esperar ese resultado
  const waiters = inflight.get(key);
  if (waiters && waiters.length < MAX_WAITERS) {
    waiters.push({ req, res, next });
    return undefined;
  }
  if (waiters) return next(); // demasiados esperando: que siga normal

  inflight.set(key, []);
  const startedAt = generation;
  let released = false;
  let guard = null;
  let holding = false; // esperando el gzip: el fin de la respuesta original no debe soltar a los que esperan
  const release = (result) => {
    if (released) return;
    released = true;
    clearTimeout(guard);
    const list = inflight.get(key) || [];
    inflight.delete(key);
    for (const w of list) {
      if (result) reply(w.req, w.res, result, 'HIT');
      else w.next(); // no hubo resultado reutilizable: cada uno sigue por su cuenta
    }
  };

  // Red de seguridad: si el cálculo nunca responde, los que esperan siguen por su cuenta
  guard = setTimeout(() => release(null), WAIT_LIMIT_MS);
  if (guard.unref) guard.unref();

  const origSend = res.send.bind(res);
  res.send = (body) => {
    if (res.statusCode === 200 && (typeof body === 'string' || Buffer.isBuffer(body))) {
      const entry = { at: Date.now(), status: 200, type: res.get('Content-Type') || 'application/json', body, gz: null, etag: etagOf(body) };
      // El primer pedido (MISS) lleva las mismas cabeceras que los siguientes; Express responde 304 solo si el ETag coincide
      res.set({ ETag: entry.etag, 'Cache-Control': CACHE_CONTROL });
      if (startedAt === generation) { // si hubo una escritura mientras se calculaba, no se guarda (se reparte igual a los que esperan)
        if (store.size >= MAX_ENTRIES) store.clear();
        store.set(key, entry);
      }
      const out = origSend(body);
      const raw = typeof body === 'string' ? Buffer.from(body) : body;
      const hasWaiters = (inflight.get(key) || []).length > 0;
      if (raw.length >= MIN_GZIP_BYTES) {
        // Se comprime una sola vez; los que esperan reciben la versión ya comprimida (no 60 compresiones seguidas)
        if (hasWaiters) holding = true;
        zlib.gzip(raw, (err, gz) => { if (!err) entry.gz = gz; release(entry); });
        if (!hasWaiters) release(entry);
      } else {
        release(entry);
      }
      return out;
    }
    const out = origSend(body);
    // Un 5xx se reparte tal cual a los que esperaban (no se guarda): si cada uno recalculara, saturarían la base
    const failed = res.statusCode >= 500 && (typeof body === 'string' || Buffer.isBuffer(body));
    release(failed ? { at: Date.now(), status: res.statusCode, type: res.get('Content-Type') || 'application/json', body, gz: null } : null);
    return out;
  };
  // Respuesta terminada sin pasar por send (por ejemplo un redirect): se suelta a los que esperan.
  // Si el cliente se desconecta antes, el cálculo sigue y se reparte igual (no hay evento 'close' que los suelte a todos a la vez).
  res.on('finish', () => { if (!holding) release(null); });
  res.set('X-Cache', isRefresh ? 'REFRESH' : 'MISS');
  return next();
}

module.exports = { microCache };
