// Fusiona equipos duplicados: todo lo del equipo "a borrar" (partidos, torneos, tablas, jugadores, noticias, sanciones…)
// pasa al equipo "a conservar" y después el duplicado se elimina.
// Uso (desde backend/, con DATABASE_URL apuntando a la base a modificar):
//   Simulación (no escribe nada):  node scripts/fusionar-equipos.js
//   Fusionar de verdad:            node scripts/fusionar-equipos.js --aplicar
// Además de los pares de PARES, la simulación lista POSIBLES duplicados por nombre parecido, para revisarlos y sumarlos acá.
const prisma = require('../src/db')

const aplicar = process.argv.includes('--aplicar')

// [equipo a borrar, equipo que se conserva]
const PARES = [
  ['Club General Lamadrid', 'Lamadrid'],
  ['Linces Pueyrredon', 'Linces by Pueyrredón'],
  ['Deportivo Riestra', 'Riestra by PCH'],
]

const NOMBRE = (n) => n.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
const VACIAS = new Set(['club', 'team', 'the', 'by', 'de', 'del', 'la', 'los', 'el', 'deportivo', 'cd', 'ca', 'fc', 'dodgeball'])
const nucleo = (n) => new Set(NOMBRE(n).split(/[^a-z0-9]+/).filter((w) => w && !VACIAS.has(w)))
const contenido = (a, b) => a.size > 0 && [...a].every((w) => b.has(w))

// Tablas con clave que incluye el equipo: si el equipo que se conserva ya tiene esa fila, la del duplicado se descarta
const CON_CLAVE = [
  ['teamBranch', ['branch']],
  ['teamModality', ['modality']],
  ['tournamentTeam', ['tournamentId']],
  ['stageTeam', ['stageId']],
  ['stageStanding', ['stageId']],
  ['matchAssignment', ['matchId']],
]
// Tablas donde alcanza con cambiar el equipo
const SIMPLES = [
  ['playerTeam', 'teamId'], ['tournamentPlace', 'teamId'], ['matchSet', 'winnerTeamId'], ['playerRequestTeam', 'teamId'],
  ['news', 'teamId'], ['teamPenalty', 'teamId'], ['tournament', 'championId'], ['match', 'teamAId'], ['match', 'teamBId'],
]

async function main() {
  const equipos = await prisma.team.findMany({ select: { id: true, name: true, logo: true } })
  const buscar = (n) => equipos.filter((x) => NOMBRE(x.name) === NOMBRE(n))
  const listos = []
  for (const [borrar, conservar] of PARES) {
    const d = buscar(borrar)
    const k = buscar(conservar)
    if (d.length !== 1 || k.length !== 1) {
      console.log('✖ ' + borrar + ' → ' + conservar + ': ' + (d.length !== 1 ? '"' + borrar + '" aparece ' + d.length + ' veces. ' : '') + (k.length !== 1 ? '"' + conservar + '" aparece ' + k.length + ' veces.' : ''))
      continue
    }
    const choque = await prisma.match.count({ where: { OR: [{ teamAId: d[0].id, teamBId: k[0].id }, { teamAId: k[0].id, teamBId: d[0].id }] } })
    if (choque) { console.log('✖ ' + borrar + ' → ' + conservar + ': hay ' + choque + ' partidos entre ellos dos; revisalo a mano.'); continue }
    const [partidos, torneos, jugadores] = await Promise.all([
      prisma.match.count({ where: { OR: [{ teamAId: d[0].id }, { teamBId: d[0].id }] } }),
      prisma.tournamentTeam.count({ where: { teamId: d[0].id } }),
      prisma.playerTeam.count({ where: { teamId: d[0].id } }),
    ])
    console.log('✔ "' + d[0].name + '" (' + partidos + ' partidos, ' + torneos + ' torneos, ' + jugadores + ' jugadores) → "' + k[0].name + '"' + (!k[0].logo && d[0].logo ? ' (el duplicado tiene escudo y el que se conserva no: se copia)' : ''))
    listos.push([d[0], k[0]])
  }

  // Posibles duplicados no incluidos en PARES (solo informativo)
  const usados = new Set(PARES.flat().map(NOMBRE))
  const sospechas = []
  for (let i = 0; i < equipos.length; i++) {
    for (let j = i + 1; j < equipos.length; j++) {
      const a = equipos[i], b = equipos[j]
      if (usados.has(NOMBRE(a.name)) || usados.has(NOMBRE(b.name))) continue
      const na = nucleo(a.name), nb = nucleo(b.name)
      if (contenido(na, nb) || contenido(nb, na)) sospechas.push('"' + a.name + '" ~ "' + b.name + '"')
    }
  }
  if (sospechas.length) console.log('\n⚠ Posibles duplicados (no se tocan; si lo son, sumalos a PARES):\n  - ' + sospechas.join('\n  - '))

  if (!aplicar) { console.log('\nSIMULACIÓN (no se escribió nada). Para fusionar de verdad: node scripts/fusionar-equipos.js --aplicar'); return }

  for (const [d, k] of listos) {
    await prisma.$transaction(async (tx) => {
      for (const [modelo, claves] of CON_CLAVE) {
        const filas = await tx[modelo].findMany({ where: { teamId: d.id } })
        for (const f of filas) {
          const where = { teamId: k.id, ...Object.fromEntries(claves.map((c) => [c, f[c]])) }
          if (await tx[modelo].findFirst({ where })) await tx[modelo].deleteMany({ where: { teamId: d.id, ...Object.fromEntries(claves.map((c) => [c, f[c]])) } })
          else await tx[modelo].updateMany({ where: { teamId: d.id, ...Object.fromEntries(claves.map((c) => [c, f[c]])) }, data: { teamId: k.id } })
        }
      }
      for (const [modelo, campo] of SIMPLES) await tx[modelo].updateMany({ where: { [campo]: d.id }, data: { [campo]: k.id } })
      if (!k.logo && d.logo) await tx.team.update({ where: { id: k.id }, data: { logo: d.logo } })
      await tx.team.delete({ where: { id: d.id } })
    }, { timeout: 60000 })
    console.log('✔ Fusionado y borrado: "' + d.name + '" → "' + k.name + '"')
  }
  if (!listos.length) console.log('Nada para fusionar.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
