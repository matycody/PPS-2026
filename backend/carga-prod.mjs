// Carga de SOLO LECTURA contra producción. Uso: node carga-prod.mjs [tanda]
// tanda: base | endpoints | quiebre | todo (default: base)
// Requiere Node 18+. autocannon se baja solo con npx.
import { execSync } from 'node:child_process'

const BASE = process.env.BASE_URL || 'https://dodgeball-ba.onrender.com'
const MAX_P975 = 10000 // ms: corte del quiebre

async function get(path) {
  const t = Date.now()
  const r = await fetch(BASE + path, { headers: { 'accept-encoding': 'gzip' } })
  const buf = await r.arrayBuffer()
  return { status: r.status, kb: (buf.byteLength / 1024).toFixed(1), ms: Date.now() - t, body: Buffer.from(buf).toString() }
}

function run(path, c, d) {
  const out = execSync(`npx --yes autocannon -c ${c} -d ${d} --json "${BASE}${path}"`, { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })
  const j = JSON.parse(out.toString())
  const row = {
    ruta: path, conex: c,
    reqs: +j.requests.average.toFixed(1),
    med_ms: j.latency.p50, p975_ms: j.latency.p97_5, max_ms: j.latency.max,
    errores: j.errors + j.timeouts, non2xx: j.non2xx,
  }
  console.log(JSON.stringify(row))
  return row
}

const tanda = process.argv[2] || 'base'
console.log(`Base: ${BASE} | tanda: ${tanda} | ${new Date().toISOString()}`)

// Despertar Render
console.log('Despertando backend...')
for (let i = 0; i < 3; i++) { const r = await get('/health'); console.log(`/health ${r.status} ${r.ms} ms`); if (r.status === 200) break }

// Inventario de respuestas (tamaño con gzip)
const rutas = ['/health', '/matches', '/tournaments', '/teams', '/stats/records', '/stats/champions', '/sanciones-publicas']
const ok = []
console.log('\n== Tamaño y estado ==')
for (const p of rutas) {
  try { const r = await get(p); console.log(`${p}  status=${r.status}  ${r.kb} KB  ${r.ms} ms`); if (r.status === 200) ok.push(p) }
  catch (e) { console.log(`${p}  ERROR ${e.message}`) }
}

// IDs dinámicos
let tId, teamId, matchId
try { const t = JSON.parse((await get('/tournaments')).body); const a = Array.isArray(t) ? t : t.items || t.data || []; tId = a[0]?.id; console.log(`Torneos: ${a.length}`) } catch {}
try { const t = JSON.parse((await get('/teams')).body); const a = Array.isArray(t) ? t : t.items || t.data || []; teamId = a[0]?.id; console.log(`Equipos: ${a.length}`) } catch {}
try { const m = JSON.parse((await get('/matches')).body); const a = Array.isArray(m) ? m : m.items || m.data || []; matchId = a[0]?.id; console.log(`Partidos (1ra página): ${a.length}`) } catch {}

const extra = []
if (tId) extra.push(`/tournaments/${tId}`)
if (teamId) extra.push(`/teams/${teamId}/posiciones`)
if (matchId) extra.push(`/matches/${matchId}`)
for (const p of extra) { const r = await get(p); console.log(`${p}  status=${r.status}  ${r.kb} KB  ${r.ms} ms`); if (r.status === 200) ok.push(p) }

const filas = []
if (tanda === 'base' || tanda === 'todo') {
  console.log('\n== Tanda base: 60 conexiones, 20 s (22/10: /health 306 req/s; /matches 76 req/s, med 608, p97,5 2902) ==')
  for (const p of ['/health', '/matches']) filas.push(run(p, 60, 20))
}
if (tanda === 'endpoints' || tanda === 'todo') {
  console.log('\n== Tanda endpoints: 30 conexiones, 15 s ==')
  for (const p of ok.filter(x => x !== '/health' && x !== '/matches')) filas.push(run(p, 30, 15))
}
if (tanda === 'quiebre' || tanda === 'todo') {
  console.log('\n== Tanda quiebre (escalones) ==')
  for (const p of ['/matches', ...(process.env.QUIEBRE_EXTRA ? process.env.QUIEBRE_EXTRA.split(',') : [])]) {
    for (const c of [60, 100, 200, 400]) {
      const r = run(p, c, 20); filas.push(r)
      if (r.errores > 0 || r.non2xx > 0 || r.p975_ms > MAX_P975) { console.log(`CORTE en ${p} con ${c} conexiones`); break }
      await new Promise(r => setTimeout(r, 15000)) // enfriar
    }
  }
}
console.log('\n== Resumen ==')
console.table(filas)
