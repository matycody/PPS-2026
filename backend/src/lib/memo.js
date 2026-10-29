// Memoria de pocos segundos para cálculos pesados repetidos (tablas de posiciones).
// - Pedidos iguales dentro de la ventana comparten un solo cálculo (también los que llegan mientras se calcula).
// - Cualquier escritura HTTP la vacía (ver microCache); los cambios por socket se ven en un máximo de TTL_MS.
const TTL_MS = Number(process.env.MEMO_TTL_MS) || 5000;
const MAX_ENTRIES = 300;
const store = new Map(); // key -> { at, promise }

function memo(key, fn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  if (store.size >= MAX_ENTRIES) store.clear();
  const entry = { at: Date.now(), promise: null };
  entry.promise = Promise.resolve()
    .then(fn)
    .catch((e) => { if (store.get(key) === entry) store.delete(key); throw e; }); // un error no se queda guardado
  store.set(key, entry);
  return entry.promise;
}

function clearMemo() {
  store.clear();
}

module.exports = { memo, clearMemo };
