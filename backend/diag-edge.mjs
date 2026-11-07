// Diagnóstico: dispara pedidos en paralelo y cuenta los códigos de estado (muestra el primero que no sea 200).
// Uso: node diag-edge.mjs [url] [total] [paralelo]
const url = process.argv[2] || 'https://dodgeball-ba.vercel.app/edge/matches?status=LIVE,READY,SCHEDULED&limit=200&includeUndated=true'
const total = Number(process.argv[3]) || 600
const par = Number(process.argv[4]) || 60
const cuenta = {}
let muestra = null
let enviados = 0
async function uno() {
  const r = await fetch(url, { headers: { 'accept-encoding': 'gzip' } })
  const txt = await r.text()
  cuenta[r.status] = (cuenta[r.status] || 0) + 1
  if (r.status !== 200 && !muestra) {
    const h = {}
    for (const k of ['x-vercel-cache', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'ratelimit-limit', 'ratelimit-remaining', 'server', 'x-vercel-id', 'x-vercel-error', 'content-type']) if (r.headers.get(k)) h[k] = r.headers.get(k)
    muestra = { status: r.status, headers: h, cuerpo: txt.slice(0, 300) }
  }
}
async function worker() { while (enviados < total) { enviados++; try { await uno() } catch (e) { cuenta.error = (cuenta.error || 0) + 1 } } }
const t = Date.now()
await Promise.all(Array.from({ length: par }, worker))
console.log('URL:', url)
console.log('Total:', total, '| tiempo:', Date.now() - t, 'ms')
console.log('Códigos:', cuenta)
console.log('Primer no-200:', JSON.stringify(muestra, null, 2))
