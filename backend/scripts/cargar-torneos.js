// Carga torneos ya jugados (copiados de Copa Fácil u otra fuente) dentro de los torneos que ya existen en la web.
// No crea equipos ni torneos: los busca por nombre. Un solo archivo para todos: se agregan al arreglo TORNEOS.
// Uso (desde backend/, con DATABASE_URL apuntando a la base a modificar):
//   Simulación (no escribe nada):  node scripts/cargar-torneos.js
//   Cargar de verdad:              node scripts/cargar-torneos.js --aplicar
//   Un solo torneo:                node scripts/cargar-torneos.js --solo "Femenino Cloth" [--aplicar]
// Un torneo que ya tiene partidos se saltea (para no duplicar); los demás se cargan igual.
// Después de cargar: en la web, abrir cada torneo y tocar "Finalizar torneo" (congela la tabla y define el campeón).
const crypto = require('crypto')
const prisma = require('../src/db')

const aplicar = process.argv.includes('--aplicar')
const soloIdx = process.argv.indexOf('--solo')
const solo = soloIdx > -1 ? process.argv[soloIdx + 1] : null

const CEDEM = {
  name: 'CEDEM N° 1',
  address: 'CEDEM N° 1, Buenos Aires',
  latitude: -34.6015987,
  longitude: -58.5767187,
  mapUrl: 'https://www.google.com/maps?q=-34.6015987,-58.5767187',
  courts: 4,
}
// Nombres con que un equipo puede estar escrito distinto en la web (sin tildes ni mayúsculas)
const ALIAS = { Berserker: ['Berseker'] }

// ───────────────────────────── TORNEOS ─────────────────────────────
// buscar: textos que tiene que contener el nombre del torneo en la web.
// liga: [fecha, local, visitante, puntos local, puntos visitante] (en Foam son sets; en Cloth, los puntos del marcador).
// dias: día de cada fecha de la liga (la hora no se carga). diaLlave: día de los playoffs.
// tabla: tabla final de la fuente, para verificar la carga: equipo → [PTS, puntos a favor, puntos en contra], en orden de posición.
// llave: cruces de playoffs; "byes" pasan directo a la ronda 2. aWin/bWin = ganador de otro cruce.
const TORNEOS = [
  {
    nombre: 'Femenino Cloth - Nacional de Buenos Aires 2026',
    buscar: ['Femenino Cloth', 'Nacional de Buenos Aires 2026'],
    modalidad: 'CLOTH',
    sede: CEDEM, // no se sabe en qué cancha se jugó cada partido: todos en cancha 1
    cancha: 1,
    dias: { 1: '2026-10-10', 2: '2026-10-10', 3: '2026-10-10', 4: '2026-10-11', 5: '2026-10-11' },
    diaLlave: '2026-10-12',
    liga: [
      [1, 'Tama Dodgeball', 'Berserker', 2, 12], [1, 'Deportivo Riestra', 'Marvin', 5, 13], [1, 'Hydra', 'Panthers', 4, 12],
      [2, 'Deportivo Riestra', 'Tama Dodgeball', 10, 4], [2, 'Panthers', 'Berserker', 12, 6], [2, 'Marvin', 'Hydra', 10, 6],
      [3, 'Tama Dodgeball', 'Panthers', 6, 12], [3, 'Hydra', 'Deportivo Riestra', 11, 5], [3, 'Berserker', 'Marvin', 5, 11],
      [4, 'Hydra', 'Tama Dodgeball', 11, 5], [4, 'Marvin', 'Panthers', 4, 14], [4, 'Deportivo Riestra', 'Berserker', 6, 14],
      [5, 'Tama Dodgeball', 'Marvin', 8, 10], [5, 'Berserker', 'Hydra', 8, 8], [5, 'Panthers', 'Deportivo Riestra', 11, 3],
    ],
    tabla: {
      Panthers: [15, 61, 23], Marvin: [12, 48, 38], Berserker: [7, 45, 39],
      Hydra: [7, 40, 40], 'Deportivo Riestra': [3, 29, 53], 'Tama Dodgeball': [0, 25, 55],
    },
    byes: ['Panthers', 'Marvin'], // 1° y 2°: ausentes en cuartos
    llave: [
      { ref: 'C1', round: 1, slot: 1, a: 'Hydra', b: 'Deportivo Riestra', sa: 16, sb: 4 }, // 4° x 5°
      { ref: 'C2', round: 1, slot: 2, a: 'Berserker', b: 'Tama Dodgeball', sa: 16, sb: 2 }, // 3° x 6°
      { ref: 'S1', round: 2, slot: 1, a: 'Panthers', bWin: 'C1', sa: 18, sb: 8 }, // 1° x ganador C1
      { ref: 'S2', round: 2, slot: 2, a: 'Marvin', bWin: 'C2', sa: 13, sb: 15 }, // 2° x ganador C2
      { ref: 'F', round: 3, slot: 1, aWin: 'S1', bWin: 'S2', sa: 22, sb: 6 },
    ],
  },
  // ← Agregar acá los próximos torneos
]
// ───────────────────────────────────────────────────────────────────

const NOMBRE = (n) => n.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const dia = (iso) => new Date(iso + 'T12:00:00-03:00') // mediodía local: el día no se corre por zona horaria
const equipos = (T) => Object.keys(T.tabla)

// Sets de un partido a partir de su marcador. Foam: 1 punto por set. Cloth: 2 por set ganado y 1 a cada uno por set empatado
// (por eso los dos puntajes tienen que tener la misma paridad: si es impar hubo un set empatado).
function sets(T, sa, sb, teamA, teamB) {
  const cloth = T.modalidad === 'CLOTH'
  const emp = cloth ? sa % 2 : 0
  let a = cloth ? (sa - emp) / 2 : sa
  let b = cloth ? (sb - emp) / 2 : sb
  const out = []
  let turno = 0
  while (a + b > 0) {
    const gana = (turno % 2 === 0 && a > 0) || b === 0 ? teamA : teamB
    gana === teamA ? a-- : b--
    out.push(gana)
    turno++
  }
  if (emp) out.push(null)
  return out.map((winnerTeamId, i) => ({ number: i + 1, winnerTeamId }))
}

function verificar(T) {
  const err = []
  const calc = {}
  for (const n of equipos(T)) calc[n] = [0, 0, 0]
  for (const [f, a, b, sa, sb] of T.liga) {
    if (!calc[a] || !calc[b]) { err.push('equipo desconocido en la liga: ' + a + ' / ' + b); continue }
    if (!T.dias[f]) err.push('falta el día de la fecha ' + f)
    if (T.modalidad === 'CLOTH' && sa % 2 !== sb % 2) err.push('marcador imposible en Cloth (paridad distinta): ' + a + ' ' + sa + '-' + sb + ' ' + b)
    calc[a][1] += sa; calc[a][2] += sb; calc[b][1] += sb; calc[b][2] += sa
    if (sa > sb) calc[a][0] += 3; else if (sa < sb) calc[b][0] += 3; else { calc[a][0] += 1; calc[b][0] += 1 }
  }
  for (const n of equipos(T)) if (calc[n].join() !== T.tabla[n].join()) err.push('la tabla calculada no coincide para ' + n + ': ' + calc[n] + ' vs ' + T.tabla[n])
  for (const m of T.llave) if (T.modalidad === 'CLOTH' && m.sa % 2 !== m.sb % 2) err.push('marcador imposible en la llave ' + m.ref)
  return err
}

async function cargar(T) {
  console.log('\n══ ' + T.nombre + ' ══')
  const errs = verificar(T)
  if (errs.length) { console.log('✖ Datos inconsistentes:\n  - ' + errs.join('\n  - ')); return false }
  console.log('✔ Los ' + T.liga.length + ' partidos de liga reproducen exactamente la tabla de la fuente.')

  const cand = await prisma.tournament.findMany({ where: { deletedAt: null, AND: T.buscar.map((s) => ({ name: { contains: s, mode: 'insensitive' } })) }, include: { stages: true, teams: true } })
  if (cand.length !== 1) { console.log('✖ Esperaba 1 torneo que contenga "' + T.buscar.join('" y "') + '" y encontré ' + cand.length + (cand.length ? ': ' + cand.map((t) => t.name).join(' | ') : '')); return false }
  const t = cand[0]
  console.log('Torneo: ' + t.name + ' (' + t.id + ') · formato ' + t.format + ' · estado ' + t.status)
  if (t.modality !== T.modalidad) { console.log('✖ El torneo en la web es ' + t.modality + ' y los datos son ' + T.modalidad); return false }
  const yaPartidos = await prisma.match.count({ where: { tournamentId: t.id } })
  if (yaPartidos) { console.log('⚠ Se saltea: ya tiene ' + yaPartidos + ' partidos. Para recargarlo, reiniciá o vaciá el torneo desde la web.'); return false }

  const todos = await prisma.team.findMany({ select: { id: true, name: true } })
  const inscriptos = new Set(t.teams.map((x) => x.teamId))
  const equipo = {}
  for (const n of equipos(T)) {
    const buscados = [n, ...(ALIAS[n] || [])].map(NOMBRE)
    const c = todos.filter((x) => buscados.includes(NOMBRE(x.name)))
    const prefer = c.filter((x) => inscriptos.has(x.id))
    const elegido = prefer.length === 1 ? prefer[0] : c.length === 1 ? c[0] : null
    if (!elegido) {
      console.log('✖ Equipo "' + n + '": ' + (c.length ? 'hay ' + c.length + ' con ese nombre y no sé cuál usar' : 'no existe en la web') + '. Parecidos: ' + todos.filter((x) => NOMBRE(x.name).includes(NOMBRE(n).slice(0, 4))).map((x) => x.name).join(', '))
      return false
    }
    equipo[n] = elegido.id
  }
  const extra = t.stages.filter((s) => !(s.type === 'LEAGUE' && s.phase === 1) && !(s.type === 'KNOCKOUT' && s.phase === 2))
  if (extra.length) { console.log('✖ El torneo tiene etapas que no esperaba: ' + extra.map((s) => s.name + ' (' + s.type + ' fase ' + s.phase + ')').join(', ')); return false }
  const venue = await prisma.venue.findFirst({ where: { deletedAt: null, OR: [{ name: { contains: T.sede.name.split(' ')[0], mode: 'insensitive' } }, { mapUrl: T.sede.mapUrl }] } })
  const fechas = [...new Set(T.liga.map((x) => x[0]))].sort((a, b) => a - b)

  console.log('✔ Equipos encontrados: ' + equipos(T).join(', '))
  console.log('Se va a hacer: sede ' + (venue ? 'existente "' + venue.name + '"' : 'nueva "' + T.sede.name + '"') + ' · formato ' + (t.format === 'LEAGUE' ? 'LEAGUE → LEAGUE_CUP' : t.format)
    + ' · ' + fechas.length + ' fechas / ' + T.liga.length + ' partidos (' + fechas.map((f) => f + '→' + T.dias[f].slice(5)).join(', ') + ') · llave ' + T.diaLlave.slice(5) + ' (' + T.llave.length + ' partidos) · campeón ' + (() => { const f = T.llave.find((x) => x.ref === 'F'); return f.sa > f.sb ? '(ganador de la final)' : '' })())
  if (!aplicar) return true

  await prisma.$transaction(async (tx) => {
    const sede = venue || (await tx.venue.create({ data: T.sede }))
    const primero = dia(T.dias[fechas[0]])
    await tx.tournament.update({
      where: { id: t.id },
      data: { format: t.format === 'LEAGUE' ? 'LEAGUE_CUP' : t.format, startsAt: t.startsAt || primero, endsAt: t.endsAt || dia(T.diaLlave) },
    })
    await tx.tournamentTeam.createMany({ data: equipos(T).map((n) => ({ tournamentId: t.id, teamId: equipo[n] })), skipDuplicates: true })

    const liga = t.stages.find((s) => s.type === 'LEAGUE') || (await tx.stage.create({ data: { tournamentId: t.id, name: '1ª Fase', type: 'LEAGUE', phase: 1 } }))
    const llave = t.stages.find((s) => s.type === 'KNOCKOUT') || (await tx.stage.create({ data: { tournamentId: t.id, name: '2ª Fase', type: 'KNOCKOUT', phase: 2 } }))
    await tx.stageTeam.createMany({ data: equipos(T).map((n) => ({ stageId: liga.id, teamId: equipo[n] })), skipDuplicates: true })

    const base = { tournamentId: t.id, branch: t.branch, modality: t.modality, status: 'FINISHED', court: T.cancha, venueId: sede.id, timeSet: false }
    const filas = []
    const setsRows = []
    const nuevo = (fila, sa, sb) => {
      const id = crypto.randomUUID()
      filas.push({ id, ...base, ...fila, finishedAt: fila.scheduledAt })
      for (const s of sets(T, sa, sb, fila.teamAId, fila.teamBId)) setsRows.push({ matchId: id, ...s })
      return id
    }

    const dias = {}
    for (const n of fechas) {
      const f = dia(T.dias[n])
      const md = await tx.matchday.upsert({
        where: { stageId_number: { stageId: liga.id, number: n } },
        update: { date: f },
        create: { stageId: liga.id, number: n, date: f },
      })
      dias[n] = { id: md.id, f }
    }
    for (const [n, a, b, sa, sb] of T.liga) {
      nuevo({ stageId: liga.id, matchdayId: dias[n].id, scheduledAt: dias[n].f, teamAId: equipo[a], teamBId: equipo[b] }, sa, sb)
    }

    const fl = dia(T.diaLlave)
    const ids = {}
    const rows = {}
    const orden = equipos(T) // la tabla viene en orden de posición
    const pos = (n) => ({ stageId: liga.id, position: orden.indexOf(n) + 1 })
    const ganador = (ref) => { const o = T.llave.find((x) => x.ref === ref); return o.sa > o.sb ? rows[o.ref].teamAId : rows[o.ref].teamBId }
    for (const m of T.llave) {
      const fila = { stageId: llave.id, round: m.round, slot: m.slot, scheduledAt: fl }
      if (m.a) { fila.teamAId = equipo[m.a]; fila.teamAFrom = pos(m.a) }
      if (m.b) { fila.teamBId = equipo[m.b]; fila.teamBFrom = pos(m.b) }
      if (m.aWin) fila.teamAId = ganador(m.aWin)
      if (m.bWin) fila.teamBId = ganador(m.bWin)
      rows[m.ref] = fila
      ids[m.ref] = nuevo(fila, m.sa, m.sb)
    }
    // Hay que guardar los partidos antes de enlazar "a quién pasa el ganador"
    await tx.match.createMany({ data: filas })
    await tx.matchSet.createMany({ data: setsRows })
    for (const m of T.llave) {
      for (const [lado, ref] of [['A', m.aWin], ['B', m.bWin]]) {
        if (ref) await tx.match.update({ where: { id: ids[ref] }, data: { nextMatchId: ids[m.ref], nextSide: lado } })
      }
    }
    await tx.stageTeam.deleteMany({ where: { stageId: llave.id } })
    await tx.stageTeam.createMany({
      data: orden.map((n, i) => ({ stageId: llave.id, teamId: equipo[n], seed: i + 1, entryRound: (T.byes || []).includes(n) ? 2 : 1 })),
    })
    console.log('✔ Cargados ' + filas.length + ' partidos y ' + setsRows.length + ' sets.')
  }, { timeout: 60000 })
  return true
}

async function main() {
  const lista = TORNEOS.filter((T) => !solo || NOMBRE(T.nombre).includes(NOMBRE(solo)))
  if (!lista.length) { console.log('No hay torneos que coincidan con "' + solo + '".'); return }
  const res = []
  for (const T of lista) res.push([T.nombre, await cargar(T)])
  console.log('\n' + (aplicar ? 'RESULTADO' : 'SIMULACIÓN (no se escribió nada)') + ':')
  for (const [n, ok] of res) console.log('  ' + (ok ? '✔' : '✖') + ' ' + n)
  if (!aplicar) console.log('Para cargar de verdad: node scripts/cargar-torneos.js --aplicar')
  else console.log('Ahora, en la web: abrir cada torneo cargado y tocar "Finalizar torneo" para congelar la tabla y definir el campeón.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
