// Copia los DATOS de una base Neon a otra (misma estructura), sin borrar nada del destino.
// Uso (desde backend/):
//   Ver qué se copiaría:  node scripts/copiar-bd.js
//   Copiar de verdad:     node scripts/copiar-bd.js --aplicar
//   Dejar el destino IGUAL al origen (borra antes los datos del destino): node scripts/copiar-bd.js --aplicar --vaciar-destino
// Variables: ORIGEN_URL (dev-torneos) y DESTINO_URL (production), ambas con conexión DIRECTA (sin -pooler).
// Es seguro repetirlo: usa ON CONFLICT DO NOTHING, o sea que no pisa filas que ya existan en el destino.
// 'faltan' > 0 en una tabla = filas del origen que chocaron con otra del destino (mismo DNI/nombre/mail pero distinto id).
const { Client } = require('pg')

const aplicar = process.argv.includes('--aplicar')
const vaciar = process.argv.includes('--vaciar-destino') // BORRA todos los datos del destino antes de copiar (deja una copia exacta del origen)
const ORIGEN = process.env.ORIGEN_URL
const DESTINO = process.env.DESTINO_URL
const SALTAR = new Set(['_prisma_migrations'])
const LOTE = 300

if (!ORIGEN || !DESTINO) { console.error('Falta ORIGEN_URL o DESTINO_URL'); process.exit(1) }
const host = (u) => new URL(u).host
if (host(ORIGEN) === host(DESTINO)) { console.error('ORIGEN y DESTINO apuntan al mismo host. Cancelado.'); process.exit(1) }

const q = (s) => '"' + s.replace(/"/g, '""') + '"'

// Ordena las tablas para que las referenciadas se copien antes (padres primero)
async function ordenar(db) {
  const { rows: tablas } = await db.query(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
  const nombres = tablas.map((t) => t.table_name).filter((t) => !SALTAR.has(t))
  const { rows: fks } = await db.query(`
    select c.conrelid::regclass::text as hija, c.confrelid::regclass::text as padre
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'`)
  const limpia = (s) => s.replace(/^public\./, '').replace(/"/g, '')
  const deps = new Map(nombres.map((n) => [n, new Set()]))
  for (const f of fks) {
    const h = limpia(f.hija), p = limpia(f.padre)
    if (h !== p && deps.has(h) && deps.has(p)) deps.get(h).add(p)
  }
  const orden = []
  const hechos = new Set()
  while (orden.length < nombres.length) {
    const listos = nombres.filter((n) => !hechos.has(n) && [...deps.get(n)].every((d) => hechos.has(d)))
    if (!listos.length) { for (const n of nombres) if (!hechos.has(n)) { orden.push(n); hechos.add(n) } break } // ciclo: se sigue igual
    for (const n of listos) { orden.push(n); hechos.add(n) }
  }
  return orden
}

async function main() {
  const o = new Client({ connectionString: ORIGEN })
  const d = new Client({ connectionString: DESTINO })
  await o.connect(); await d.connect()
  console.log('Origen :', host(ORIGEN))
  console.log('Destino:', host(DESTINO))
  console.log(aplicar ? 'MODO: COPIAR' : 'MODO: SOLO VER (agregá --aplicar para copiar)')

  const orden = await ordenar(o)
  const filas = []
  for (const t of orden) {
    const a = (await o.query(`select count(*)::int n from ${q(t)}`)).rows[0].n
    let b = 0
    try { b = (await d.query(`select count(*)::int n from ${q(t)}`)).rows[0].n } catch { b = '¿no existe?' }
    filas.push({ tabla: t, origen: a, destino: b })
  }
  console.table(filas)
  if (!aplicar) { await o.end(); await d.end(); return }

  // Si el rol lo permite, se desactivan los chequeos de claves foráneas durante la copia
  // Por defecto las claves foráneas SE CHEQUEAN: si falta un padre, la tabla da error en vez de dejar filas huérfanas
  console.log('Chequeo de claves foráneas: activo')
  if (vaciar) {
    console.log('VACIANDO destino (todas las tablas de datos, menos _prisma_migrations)...')
    await d.query(`truncate table ${orden.map(q).join(', ')} restart identity cascade`)
  }

  const resumen = []
  for (const t of orden) {
    const total = filas.find((f) => f.tabla === t).origen
    if (!total) { resumen.push({ tabla: t, copiadas: 0, faltan: '', error: '' }); continue }
    let copiadas = 0, error = '', faltan = ''
    try {
      const cur = await o.query(`select row_to_json(x) as r from ${q(t)} x`)
      const pk = (await d.query(
        `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
         where i.indrelid = $1::regclass and i.indisprimary`, [q(t)])).rows.map((r) => q(r.attname))
      let presentes = 0
      for (let i = 0; i < cur.rows.length; i += LOTE) {
        const lote = JSON.stringify(cur.rows.slice(i, i + LOTE).map((r) => r.r))
        const res = await d.query(
          `insert into ${q(t)} select * from json_populate_recordset(null::${q(t)}, $1::json) on conflict do nothing`, [lote])
        copiadas += res.rowCount
        if (pk.length) {
          const on = pk.map((c) => `t.${c} = s.${c}`).join(' and ')
          presentes += (await d.query(
            `select count(*)::int n from ${q(t)} t join json_populate_recordset(null::${q(t)}, $1::json) s on ${on}`, [lote])).rows[0].n
        }
      }
      // Filas del origen que NO quedaron en el destino con el mismo id: chocaron con otra fila (mismo DNI, nombre, mail...)
      if (pk.length && presentes < cur.rows.length) faltan = cur.rows.length - presentes
    } catch (e) { error = e.message }
    resumen.push({ tabla: t, copiadas, faltan, error })
  }
  console.table(resumen)
  const fallas = resumen.filter((r) => r.error || r.faltan)
  console.log(fallas.length ? `Atención: ${fallas.length} tabla(s) con error o con filas que chocaron. Pasale la tabla de arriba a Claude antes de seguir.` : 'Listo: copia completa sin errores.')
  await o.end(); await d.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
