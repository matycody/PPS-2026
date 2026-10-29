// Búsquedas recientes, guardadas en este dispositivo (una lista por persona; la de visitante aparte)
const MAX = 8
const key = (uid) => 'recent-searches:' + (uid ?? 'guest')
export function getRecent(uid) {
  try { const v = JSON.parse(localStorage.getItem(key(uid)) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const save = (uid, list) => { try { localStorage.setItem(key(uid), JSON.stringify(list)) } catch { /* sin storage */ } return list }
export function addRecent(uid, term) {
  const t = term.trim()
  if (t.length < 2) return getRecent(uid)
  const low = t.toLowerCase()
  // se descartan repetidas y las versiones parciales ("mor" cuando se busca "morán")
  const rest = getRecent(uid).filter((x) => { const l = x.toLowerCase(); return l !== low && !low.startsWith(l) })
  return save(uid, [t, ...rest].slice(0, MAX))
}
export const removeRecent = (uid, term) => save(uid, getRecent(uid).filter((x) => x !== term))
export const clearRecent = (uid) => save(uid, [])
