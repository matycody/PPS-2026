// Carga el Nacional de Buenos Aires 2026 (Femenino Foam, 10-12/10/2026) copiado de Copa Fácil
// dentro del torneo que ya existe en la web. No crea equipos ni torneos: los busca por nombre.
// Uso (desde backend/, con DATABASE_URL apuntando a la base a modificar):
//   Simulación (no escribe nada): node scripts/cargar-nacional-2026.js
//   Cargar de verdad:             node scripts/cargar-nacional-2026.js --aplicar
// Después de cargar: en la web, abrir el torneo y tocar "Finalizar torneo" (congela la tabla y define el campeón).
const crypto = require('crypto')
const prisma = require('../src/db')

const aplicar = process.argv.includes('--aplicar')
const TORNEO = 'Nacional de Buenos Aires 2026' // se busca por este texto dentro del nombre
const SEDE = {
  name: 'CEDEM N° 1',
  address: 'CEDEM N° 1, Buenos Aires',
  latitude: -34.6015987,
  longitude: -58.5767187,
  mapUrl: 'https://www.google.com/maps?q=-34.6015987,-58.5767187',
  courts: 4,
}
const CANCHA = 1 // no se sabe en cuál se jugó cada uno: todos en cancha 1
const DIA = { d1: '2026-10-10', d2: '2026-10-11', d3: '2026-10-12' }
const dia = (iso) => new Date(iso + 'T12:00:00-03:00') // mediodía local: el día no se corre por zona horaria

// Liga (1ª fase): [fecha, local, visitante, sets local, sets visitante]. Día: fechas 1-3 → 10/10, 4-7 → 11/10
const LIGA = [
  [1, 'Tama Dodgeball', 'Hydra', 2, 4], [1, 'Marvin', 'Los Teros', 8, 0], [1, 'Deportivo Riestra', 'Panthers', 1, 4],
  [2, 'Tama Dodgeball', 'Berserker', 2, 4], [2, 'Hydra', 'Deportivo Riestra', 3, 2], [2, 'Panthers', 'Marvin', 3, 4],
  [3, 'Berserker', 'Los Teros', 7, 0], [3, 'Deportivo Riestra', 'Tama Dodgeball', 1, 6], [3, 'Marvin', 'Hydra', 5, 4],
  [4, 'Deportivo Riestra', 'Berserker', 1, 5], [4, 'Panthers', 'Los Teros', 7, 0], [4, 'Tama Dodgeball', 'Marvin', 2, 6],
  [5, 'Berserker', 'Panthers', 2, 4], [5, 'Marvin', 'Deportivo Riestra', 4, 1], [5, 'Los Teros', 'Hydra', 1, 5],
  [6, 'Marvin', 'Berserker', 5, 2], [6, 'Hydra', 'Panthers', 2, 4], [6, 'Tama Dodgeball', 'Los Teros', 7, 0],
  [7, 'Berserker', 'Hydra', 5, 1], [7, 'Panthers', 'Tama Dodgeball', 5, 1], [7, 'Los Teros', 'Deportivo Riestra', 4, 2],
]
// Tabla final esperada (para verificar la carga): equipo → [PTS, PJ(a favor), PC(en contra)]
const TABLA = {
  Marvin: [18, 32, 12], Panthers: [15, 27, 10], Berserker: [12, 25, 13], Hydra: [9, 19, 19],
  'Tama Dodgeball': [6, 20, 20], 'Los Teros': [3, 5, 36], 'Deportivo Riestra': [0, 8, 26],
}
const SIEMBRA = ['Marvin', 'Panthers', 'Berserker', 'Hydra', 'Tama Dodgeball', 'Los Teros', 'Deportivo Riestra']

// Llave (2ª fase). Marvin (1°) pasa directo a semis (ausente en cuartos).
const LLAVE = [
  { ref: 'C1', round: 1, slot: 1, a: 'Hydra', b: 'Tama Dodgeball', sa: 5, sb: 2 }, // 4° x 5°
  { ref: 'C2', round: 1, slot: 2, a: 'Panthers', b: 'Deportivo Riestra', sa: 7, sb: 1 }, // 2° x 7°
  { ref: 'C3', round: 1, slot: 3, a: 'Berserker', b: 'Los Teros', sa: 7, sb: 1 }, // 3° x 6°
  { ref: 'S1', round: 2, slot: 1, a: 'Marvin', bWin: 'C1', sa: 7, sb: 5 }, // 1° x ganador C1
  { ref: 'S2', round: 2, slot: 2, aWin: 'C2', bWin: 'C3', sa: 4, sb: 5 },
  { ref: 'F', round: 3, slot: 1, aWin: 'S1', bWin: 'S2', sa: 6, sb: 5 },
]
// Equipos de cada partido de la llave (se resuelven con los ganadores)
const NOMBRE = (n) => n.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function fallar(msg) { console.error('✖ ' + msg); process.exit(1) }

function sets(sa, sb, teamA, teamB) {
  const out = []
  let a = sa, b = sb, turno = 0
  while (a + b > 0) {
    const gana = (turno % 2 === 0 && a > 0) || b === 0 ? teamA : teamB
    gana === teamA ? a-- : b--
    out.push(gana)
    turno++
  }
  return out.map((winnerTeamId, i) => ({ number: i + 1, winnerTeamId }))
}

async function main() {
  // 1) Verificación interna: la tabla calculada con los partidos tiene que dar igual a la de Copa Fácil
  const calc = {}
  for (const n of SIEMBRA) calc[n] = [0, 0, 0]
  for (const [, a, b, sa, sb] of LIGA) {
    calc[a][1] += sa; calc[a][2] += sb; calc[b][1] += sb; calc[b][2] += sa
    calc[sa > sb ? a : b][0] += 3
  }
  for (const n of SIEMBRA) {
    if (calc[n].join() !== TABLA[n].join()) fallar('La tabla calculada no coincide con Copa Fácil para ' + n + ': ' + calc[n] + ' vs ' + TABLA[n])
  }
  console.log('✔ Los 21 partidos de liga reproducen exactamente la tabla de Copa Fácil.')

  // 2) Torneo y equipos
  const torneos = await prisma.tournament.findMany({
    where: { name: { contains: TORNEO, mode: 'insensitive' }, deletedAt: null },
    include: { stages: true, teams: true },
  })
  if (torneos.length !== 1) fallar('Esperaba 1 torneo con "' + TORNEO + '" y encontré ' + torneos.length + (torneos.length ? ': ' + torneos.map((t) => t.name).join(' | ') : ''))
  const t = torneos[0]
  console.log('Torneo: ' + t.name + ' (' + t.id + ') · formato ' + t.format + ' · estado ' + t.status)
  const yaPartidos = await prisma.match.count({ where: { tournamentId: t.id } })
  if (yaPartidos) fallar('El torneo ya tiene ' + yaPartidos + ' partidos. Reiniciá el torneo desde la web antes de cargar (para no duplicar).')

  const todos = await prisma.team.findMany({ select: { id: true, name: true } })
  const inscriptos = new Set(t.teams.map((x) => x.teamId))
  const equipo = {}
  for (const n of SIEMBRA) {
    const c = todos.filter((x) => NOMBRE(x.name) === NOMBRE(n))
    const prefer = c.filter((x) => inscriptos.has(x.id))
    const elegido = prefer.length === 1 ? prefer[0] : c.length === 1 ? c[0] : null
    if (!elegido) fallar('Equipo "' + n + '": ' + (c.length ? 'hay ' + c.length + ' con ese nombre y no sé cuál usar' : 'no existe en la web') + '. Nombres parecidos: ' + todos.filter((x) => NOMBRE(x.name).includes(NOMBRE(n).split(' ')[0])).map((x) => x.name).join(', '))
    equipo[n] = elegido.id
  }
  console.log('✔ Equipos encontrados: ' + SIEMBRA.map((n) => n).join(', ') + (SIEMBRA.some((n) => !inscriptos.has(equipo[n])) ? ' (alguno no estaba inscripto en el torneo: se inscribe)' : ''))

  const extra = t.stages.filter((s) => !(s.type === 'LEAGUE' && s.phase === 1) && !(s.type === 'KNOCKOUT' && s.phase === 2))
  if (extra.length) fallar('El torneo tiene etapas que no esperaba: ' + extra.map((s) => s.name + ' (' + s.type + ' fase ' + s.phase + ')').join(', '))
  const venue = await prisma.venue.findFirst({ where: { deletedAt: null, OR: [{ name: { contains: 'CEDEM', mode: 'insensitive' } }, { mapUrl: { contains: 'CEDEM', mode: 'insensitive' } }] } })

  console.log('\nSe va a hacer:')
  console.log('- Sede: ' + (venue ? 'usar la existente "' + venue.name + '"' : 'crear "' + SEDE.name + '"'))
  console.log('- Torneo: formato ' + (t.format === 'LEAGUE' ? 'LEAGUE → LEAGUE_CUP (liga + llave)' : t.format) + ', fechas 10/10 a 12/10')
  console.log('- Etapas: ' + (t.stages.some((s) => s.type === 'LEAGUE') ? 'usar la liga existente' : 'crear "1ª Fase" (liga)') + ' · ' + (t.stages.some((s) => s.type === 'KNOCKOUT') ? 'usar la llave existente' : 'crear "2ª Fase" (llave)'))
  console.log('- 7 fechas con 21 partidos (fechas 1-3 el 10/10, 4-7 el 11/10), cancha ' + CANCHA + ', todos FINALIZADOS con sus sets')
  console.log('- Llave el 12/10: 3 cuartos (Marvin pasa directo), 2 semis, final → campeón Marvin')
  if (!aplicar) { console.log('\nSIMULACIÓN: no se escribió nada. Para cargar: node scripts/cargar-nacional-2026.js --aplicar'); return }

  await prisma.$transaction(async (tx) => {
    const sede = venue || (await tx.venue.create({ data: SEDE }))
    await tx.tournament.update({
      where: { id: t.id },
      data: { format: t.format === 'LEAGUE' ? 'LEAGUE_CUP' : t.format, startsAt: t.startsAt || dia(DIA.d1), endsAt: t.endsAt || dia(DIA.d3) },
    })
    await tx.tournamentTeam.createMany({ data: SIEMBRA.map((n) => ({ tournamentId: t.id, teamId: equipo[n] })), skipDuplicates: true })

    const liga = t.stages.find((s) => s.type === 'LEAGUE') || (await tx.stage.create({ data: { tournamentId: t.id, name: '1ª Fase', type: 'LEAGUE', phase: 1 } }))
    const llave = t.stages.find((s) => s.type === 'KNOCKOUT') || (await tx.stage.create({ data: { tournamentId: t.id, name: '2ª Fase', type: 'KNOCKOUT', phase: 2 } }))
    await tx.stageTeam.createMany({ data: SIEMBRA.map((n) => ({ stageId: liga.id, teamId: equipo[n] })), skipDuplicates: true })

    const base = { tournamentId: t.id, branch: t.branch, modality: t.modality, status: 'FINISHED', court: CANCHA, venueId: sede.id, timeSet: false }
    const filas = []
    const setsRows = []
    const nuevo = (fila, sa, sb) => {
      const id = crypto.randomUUID()
      filas.push({ id, ...base, ...fila, finishedAt: fila.scheduledAt })
      for (const s of sets(sa, sb, fila.teamAId, fila.teamBId)) setsRows.push({ matchId: id, ...s })
      return id
    }

    // Liga
    const dias = {}
    for (let n = 1; n <= 7; n++) {
      const f = dia(n <= 3 ? DIA.d1 : DIA.d2)
      const md = await tx.matchday.upsert({
        where: { stageId_number: { stageId: liga.id, number: n } },
        update: { date: f },
        create: { stageId: liga.id, number: n, date: f },
      })
      dias[n] = { id: md.id, f }
    }
    LIGA.forEach(([n, a, b, sa, sb], i) => {
      nuevo({ stageId: liga.id, matchdayId: dias[n].id, scheduledAt: dias[n].f, teamAId: equipo[a], teamBId: equipo[b] }, sa, sb)
    })

    // Llave
    const f3 = dia(DIA.d3)
    const ids = {}
    const rows = {}
    const pos = (n) => ({ stageId: liga.id, position: SIEMBRA.indexOf(n) + 1 })
    for (const m of LLAVE) {
      const fila = { stageId: llave.id, round: m.round, slot: m.slot, scheduledAt: f3 }
      if (m.a) { fila.teamAId = equipo[m.a]; fila.teamAFrom = pos(m.a) }
      if (m.b) { fila.teamBId = equipo[m.b]; fila.teamBFrom = pos(m.b) }
      const ganador = (ref) => { const o = LLAVE.find((x) => x.ref === ref); return o.sa > o.sb ? (o.a ? equipo[o.a] : rows[o.ref].teamAId) : (o.b ? equipo[o.b] : rows[o.ref].teamBId) }
      if (m.aWin) fila.teamAId = ganador(m.aWin)
      if (m.bWin) fila.teamBId = ganador(m.bWin)
      rows[m.ref] = fila
      ids[m.ref] = nuevo(fila, m.sa, m.sb)
    }
    // Hay que guardar los partidos antes de enlazar "a quién pasa el ganador"
    await tx.match.createMany({ data: filas })
    await tx.matchSet.createMany({ data: setsRows })
    for (const m of LLAVE) {
      for (const [lado, ref] of [['A', m.aWin], ['B', m.bWin]]) {
        if (ref) await tx.match.update({ where: { id: ids[ref] }, data: { nextMatchId: ids[m.ref], nextSide: lado } })
      }
    }
    const entradas = [
      ...SIEMBRA.map((n, i) => ({ stageId: llave.id, teamId: equipo[n], seed: i + 1, entryRound: n === 'Marvin' ? 2 : 1 })),
    ]
    await tx.stageTeam.deleteMany({ where: { stageId: llave.id } })
    await tx.stageTeam.createMany({ data: entradas })
    console.log('\n✔ Cargados ' + filas.length + ' partidos y ' + setsRows.length + ' sets.')
  }, { timeout: 60000 })
  console.log('Listo. Ahora, en la web: abrir el torneo y tocar "Finalizar torneo" para congelar la tabla y definir el campeón.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
