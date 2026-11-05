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
// buscar: textos que tiene que contener el nombre del torneo en la web; rama (FEMALE, MALE, MIXED) y modalidad lo distinguen de los otros con el mismo nombre.
// liga: [fecha, local, visitante, puntos local, puntos visitante] (en Foam son sets; en Cloth, los puntos del marcador).
// dias: día de cada fecha de la liga (la hora no se carga). diaLlave: día de los playoffs.
// tabla: tabla final de la fuente, para verificar la carga: equipo → [PTS, puntos a favor, puntos en contra], en orden de posición.
// Con varios grupos se usa grupos: [{ nombre, tabla }] (una tabla por grupo) y siembra: orden general de los clasificados a la llave.
// llave: cruces de playoffs (sa/sb en null = sin resultado: el partido queda Programado); "byes" pasan directo a la ronda 2. aWin/bWin = ganador de otro cruce.
const TORNEOS = [
  {
    nombre: 'Femenino Cloth - Nacional de Buenos Aires 2026',
    buscar: ['Nacional de Buenos Aires 2026'],
    rama: 'FEMALE',
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
  {
    nombre: 'Masculino Foam - Nacional de Buenos Aires 2026',
    buscar: ['Nacional de Buenos Aires 2026'],
    rama: 'MALE',
    modalidad: 'FOAM',
    sede: CEDEM,
    cancha: 1,
    dias: { 1: '2026-10-10', 2: '2026-10-10', 3: '2026-10-10', 4: '2026-10-11', 5: '2026-10-11' },
    diaLlave: '2026-10-12',
    grupos: [
      { nombre: 'Grupo A', tabla: { Noazar: [12, 24, 7], 'Club Moran': [9, 21, 10], 'Linces Pueyrredon': [6, 21, 9], 'The Catchers': [3, 15, 19], Mineros: [0, 0, 36] } },
      { nombre: 'Grupo B', tabla: { Panthers: [9, 21, 9], Berserker: [9, 16, 12], 'Club General Lamadrid': [6, 20, 14], Marvin: [3, 11, 20], 'Los Teros': [3, 10, 23] } },
      { nombre: 'Grupo C', tabla: { Hydra: [7, 18, 8], 'Tama Dodgeball': [7, 17, 11], 'Deportivo Riestra': [7, 15, 11], Freestyle: [7, 15, 13], Dementores: [0, 4, 26] } },
    ],
    liga: [
      [1, 'The Catchers', 'Noazar', 2, 6], [1, 'Club Moran', 'Mineros', 9, 0], [1, 'Los Teros', 'Berserker', 4, 3],
      [1, 'Panthers', 'Marvin', 6, 1], [1, 'Tama Dodgeball', 'Dementores', 6, 1], [1, 'Hydra', 'Deportivo Riestra', 2, 3],
      [2, 'The Catchers', 'Linces Pueyrredon', 1, 7], [2, 'Noazar', 'Club Moran', 5, 2], [2, 'Los Teros', 'Club General Lamadrid', 2, 8],
      [2, 'Berserker', 'Panthers', 5, 2], [2, 'Tama Dodgeball', 'Freestyle', 6, 3], [2, 'Dementores', 'Hydra', 0, 9],
      [3, 'Linces Pueyrredon', 'Mineros', 9, 0], [3, 'Club Moran', 'The Catchers', 6, 3], [3, 'Club General Lamadrid', 'Marvin', 7, 2],
      [3, 'Panthers', 'Los Teros', 7, 1], [3, 'Freestyle', 'Deportivo Riestra', 4, 3], [3, 'Hydra', 'Tama Dodgeball', 4, 2],
      [4, 'Club Moran', 'Linces Pueyrredon', 4, 2], [4, 'Noazar', 'Mineros', 9, 0], [4, 'Panthers', 'Club General Lamadrid', 6, 2],
      [4, 'Berserker', 'Marvin', 4, 3], [4, 'Hydra', 'Freestyle', 3, 3], [4, 'Dementores', 'Deportivo Riestra', 2, 6],
      [5, 'Linces Pueyrredon', 'Noazar', 3, 4], [5, 'Mineros', 'The Catchers', 0, 9], [5, 'Club General Lamadrid', 'Berserker', 3, 4],
      [5, 'Marvin', 'Los Teros', 5, 3], [5, 'Freestyle', 'Dementores', 5, 1], [5, 'Deportivo Riestra', 'Tama Dodgeball', 3, 3],
    ],
    // Orden general de los 8 clasificados (1° puesto x 8°, 4° x 5°, 2° x 7°, 3° x 6° en cuartos)
    siembra: ['Noazar', 'Panthers', 'Hydra', 'Club Moran', 'Berserker', 'Tama Dodgeball', 'Deportivo Riestra', 'Linces Pueyrredon'],
    llave: [
      { ref: 'C1', round: 1, slot: 1, a: 'Noazar', b: 'Linces Pueyrredon', sa: 5, sb: 2 }, // 1° x 8°
      { ref: 'C2', round: 1, slot: 2, a: 'Club Moran', b: 'Berserker', sa: 2, sb: 6 }, // 4° x 5°
      { ref: 'C3', round: 1, slot: 3, a: 'Panthers', b: 'Deportivo Riestra', sa: 3, sb: 6 }, // 2° x 7°
      { ref: 'C4', round: 1, slot: 4, a: 'Hydra', b: 'Tama Dodgeball', sa: 4, sb: 6 }, // 3° x 6°
      { ref: 'S1', round: 2, slot: 1, aWin: 'C1', bWin: 'C2', sa: 1, sb: 11 },
      { ref: 'S2', round: 2, slot: 2, aWin: 'C3', bWin: 'C4', sa: 5, sb: 6 },
      { ref: 'F', round: 3, slot: 1, aWin: 'S1', bWin: 'S2', sa: 7, sb: 4 },
    ],
  },
  {
    nombre: 'Masculino Cloth - Nacional de Buenos Aires 2026',
    buscar: ['Nacional de Buenos Aires 2026'],
    rama: 'MALE',
    modalidad: 'CLOTH',
    sede: CEDEM,
    cancha: 1,
    dias: { 1: '2026-10-10', 2: '2026-10-10', 3: '2026-10-10' },
    diaLlave: '2026-10-12',
    grupos: [
      { nombre: 'Grupo A', tabla: { Panthers: [9, 40, 16], 'Linces Pueyrredon': [6, 28, 22], 'Tama Dodgeball': [3, 26, 22], 'The Catchers': [0, 12, 46] } },
      { nombre: 'Grupo B', tabla: { Noazar: [7, 39, 27], 'Deportivo Riestra': [6, 37, 19], 'Club General Lamadrid': [2, 29, 35], Marvin: [1, 21, 45] } },
      { nombre: 'Grupo C', tabla: { Hydra: [9, 34, 14], Berserker: [6, 30, 22], 'Club Moran': [3, 23, 25], Freestyle: [0, 11, 37] } },
    ],
    liga: [
      [1, 'The Catchers', 'Tama Dodgeball', 6, 14], [1, 'Linces Pueyrredon', 'Panthers', 7, 13], [1, 'Club General Lamadrid', 'Noazar', 13, 13],
      [1, 'Deportivo Riestra', 'Marvin', 20, 2], [1, 'Hydra', 'Berserker', 9, 7], [1, 'Freestyle', 'Club Moran', 3, 11],
      [2, 'Linces Pueyrredon', 'The Catchers', 14, 4], [2, 'Panthers', 'Tama Dodgeball', 9, 7], [2, 'Deportivo Riestra', 'Club General Lamadrid', 11, 5],
      [2, 'Marvin', 'Noazar', 8, 14], [2, 'Freestyle', 'Hydra', 2, 14], [2, 'Club Moran', 'Berserker', 7, 11],
      [3, 'The Catchers', 'Panthers', 2, 18], [3, 'Tama Dodgeball', 'Linces Pueyrredon', 5, 7], [3, 'Club General Lamadrid', 'Marvin', 11, 11],
      [3, 'Noazar', 'Deportivo Riestra', 12, 6], [3, 'Hydra', 'Club Moran', 11, 5], [3, 'Berserker', 'Freestyle', 12, 6],
    ],
    // Orden general de los 8 clasificados (1° x 8°, 4° x 5°, 2° x 7°, 3° x 6° en cuartos)
    siembra: ['Panthers', 'Hydra', 'Noazar', 'Deportivo Riestra', 'Berserker', 'Linces Pueyrredon', 'Tama Dodgeball', 'Club Moran'],
    llave: [
      { ref: 'C1', round: 1, slot: 1, a: 'Panthers', b: 'Club Moran', sa: 14, sb: 10 }, // 1° x 8°
      { ref: 'C2', round: 1, slot: 2, a: 'Deportivo Riestra', b: 'Berserker', sa: 15, sb: 5 }, // 4° x 5°
      { ref: 'C3', round: 1, slot: 3, a: 'Hydra', b: 'Tama Dodgeball', sa: 16, sb: 4 }, // 2° x 7°
      { ref: 'C4', round: 1, slot: 4, a: 'Noazar', b: 'Linces Pueyrredon', sa: 18, sb: 4 }, // 3° x 6°
      { ref: 'S1', round: 2, slot: 1, aWin: 'C1', bWin: 'C2', sa: 16, sb: 18 },
      { ref: 'S2', round: 2, slot: 2, aWin: 'C3', bWin: 'C4', sa: 17, sb: 13 },
      { ref: 'F', round: 3, slot: 1, aWin: 'S1', bWin: 'S2', sa: 16, sb: 12 },
    ],
  },
  {
    nombre: 'Mixto Foam - Nacional de Buenos Aires 2026',
    buscar: ['Nacional de Buenos Aires 2026'],
    rama: 'MIXED',
    modalidad: 'FOAM',
    sede: CEDEM,
    cancha: 1,
    dias: { 1: '2026-10-10', 2: '2026-10-10', 3: '2026-10-10', 4: '2026-10-11', 5: '2026-10-11' },
    diaLlave: '2026-10-12',
    grupos: [
      { nombre: 'Grupo A', tabla: { Noazar: [12, 28, 9], Hydra: [9, 29, 7], 'Club General Lamadrid': [6, 18, 20], 'The Catchers': [3, 11, 27], 'Los Teros': [0, 6, 29] } },
      { nombre: 'Grupo B', tabla: { Panthers: [12, 21, 10], Berserker: [9, 22, 8], PCH: [6, 17, 12], Marvin: [3, 15, 20], 'Soul Dodgeball': [0, 6, 31] } },
      { nombre: 'Grupo C', tabla: { Freestyle: [9, 15, 12], 'Linces Pueyrredon': [7, 16, 11], 'Tama Dodgeball': [7, 15, 11], 'Club Moran': [6, 11, 15], Dementores: [0, 8, 16] } },
    ],
    liga: [
      [1, 'Hydra', 'Noazar', 2, 5], [1, 'The Catchers', 'Los Teros', 6, 3], [1, 'Marvin', 'Soul Dodgeball', 8, 2],
      [1, 'Berserker', 'Panthers', 2, 4], [1, 'Club Moran', 'Freestyle', 4, 2], [1, 'Dementores', 'Tama Dodgeball', 2, 4],
      [2, 'Hydra', 'Club General Lamadrid', 8, 2], [2, 'Noazar', 'The Catchers', 9, 2], [2, 'Marvin', 'PCH', 1, 5],
      [2, 'Soul Dodgeball', 'Berserker', 0, 9], [2, 'Club Moran', 'Linces Pueyrredon', 1, 6], [2, 'Freestyle', 'Dementores', 4, 2],
      [3, 'Club General Lamadrid', 'Los Teros', 4, 3], [3, 'The Catchers', 'Hydra', 0, 8], [3, 'PCH', 'Panthers', 2, 5],
      [3, 'Berserker', 'Marvin', 7, 2], [3, 'Linces Pueyrredon', 'Tama Dodgeball', 3, 3], [3, 'Dementores', 'Club Moran', 2, 4],
      [4, 'The Catchers', 'Club General Lamadrid', 3, 7], [4, 'Noazar', 'Los Teros', 8, 0], [4, 'Berserker', 'PCH', 4, 2],
      [4, 'Soul Dodgeball', 'Panthers', 2, 6], [4, 'Dementores', 'Linces Pueyrredon', 2, 4], [4, 'Freestyle', 'Tama Dodgeball', 4, 3],
      [5, 'Club General Lamadrid', 'Noazar', 5, 6], [5, 'Los Teros', 'Hydra', 0, 11], [5, 'PCH', 'Soul Dodgeball', 8, 2],
      [5, 'Panthers', 'Marvin', 6, 4], [5, 'Linces Pueyrredon', 'Freestyle', 3, 5], [5, 'Tama Dodgeball', 'Club Moran', 5, 2],
    ],
    // Orden general de los 8 clasificados (1° x 8°, 4° x 5°, 2° x 7°, 3° x 6° en cuartos)
    siembra: ['Noazar', 'Panthers', 'Freestyle', 'Hydra', 'Berserker', 'Linces Pueyrredon', 'Tama Dodgeball', 'PCH'],
    llave: [
      { ref: 'C1', round: 1, slot: 1, a: 'Noazar', b: 'PCH', sa: 5, sb: 4 }, // 1° x 8°
      { ref: 'C2', round: 1, slot: 2, a: 'Hydra', b: 'Berserker', sa: 2, sb: 5 }, // 4° x 5°
      { ref: 'C3', round: 1, slot: 3, a: 'Panthers', b: 'Tama Dodgeball', sa: 5, sb: 6 }, // 2° x 7°
      { ref: 'C4', round: 1, slot: 4, a: 'Freestyle', b: 'Linces Pueyrredon', sa: 5, sb: 3 }, // 3° x 6°
      { ref: 'S1', round: 2, slot: 1, aWin: 'C1', bWin: 'C2', sa: 3, sb: 6 },
      { ref: 'S2', round: 2, slot: 2, aWin: 'C3', bWin: 'C4', sa: 6, sb: 5 },
      { ref: 'F', round: 3, slot: 1, aWin: 'S1', bWin: 'S2', sa: null, sb: null }, // Berserker vs Tama: en Copa Fácil todavía sin resultado
    ],
  },
  {
    nombre: 'Mixto Cloth - Nacional de Buenos Aires 2026',
    buscar: ['Nacional de Buenos Aires 2026'],
    rama: 'MIXED',
    modalidad: 'CLOTH',
    sede: CEDEM,
    cancha: 1,
    dias: { 1: '2026-10-10', 2: '2026-10-10', 3: '2026-10-10' },
    diaLlave: '2026-10-12',
    grupos: [
      { nombre: 'Grupo A', tabla: { Hydra: [7, 36, 18], Berserker: [5, 27, 23], 'Club Moran': [3, 21, 37], 'Club General Lamadrid': [1, 24, 30] } },
      { nombre: 'Grupo B', tabla: { Panthers: [6, 22, 14], Noazar: [3, 21, 21], 'Tama Dodgeball': [0, 15, 23] } },
      { nombre: 'Grupo C', tabla: { PCH: [6, 21, 11], Marvin: [3, 19, 17], Freestyle: [0, 12, 24] } },
    ],
    liga: [
      [1, 'Club Moran', 'Berserker', 6, 10], [1, 'Hydra', 'Club General Lamadrid', 10, 6], [1, 'Tama Dodgeball', 'Panthers', 6, 10], [1, 'Freestyle', 'Marvin', 8, 12],
      [2, 'Hydra', 'Club Moran', 18, 4], [2, 'Club General Lamadrid', 'Berserker', 9, 9], [2, 'Tama Dodgeball', 'Noazar', 9, 13], [2, 'Freestyle', 'PCH', 4, 12],
      [3, 'Club Moran', 'Club General Lamadrid', 11, 9], [3, 'Berserker', 'Hydra', 8, 8], [3, 'Noazar', 'Panthers', 8, 12], [3, 'PCH', 'Marvin', 9, 7],
    ],
    // Orden general de los 8 clasificados (1° x 8°, 4° x 5°, 2° x 7°, 3° x 6° en cuartos)
    siembra: ['Hydra', 'PCH', 'Panthers', 'Berserker', 'Marvin', 'Noazar', 'Club Moran', 'Tama Dodgeball'],
    llave: [
      { ref: 'C1', round: 1, slot: 1, a: 'Hydra', b: 'Tama Dodgeball', sa: 20, sb: 4 }, // 1° x 8°
      { ref: 'C2', round: 1, slot: 2, a: 'Berserker', b: 'Marvin', sa: 9, sb: 15 }, // 4° x 5°
      { ref: 'C3', round: 1, slot: 3, a: 'PCH', b: 'Club Moran', sa: 14, sb: 10 }, // 2° x 7°
      { ref: 'C4', round: 1, slot: 4, a: 'Panthers', b: 'Noazar', sa: 15, sb: 9 }, // 3° x 6°
      { ref: 'S1', round: 2, slot: 1, aWin: 'C1', bWin: 'C2', sa: 13, sb: 21 },
      { ref: 'S2', round: 2, slot: 2, aWin: 'C3', bWin: 'C4', sa: 15, sb: 13 },
      { ref: 'F', round: 3, slot: 1, aWin: 'S1', bWin: 'S2', sa: 10, sb: 18 },
    ],
  },
  // ← Agregar acá los próximos torneos
]
// ───────────────────────────────────────────────────────────────────

const NOMBRE = (n) => n.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const dia = (iso) => new Date(iso + 'T12:00:00-03:00') // mediodía local: el día no se corre por zona horaria
const gruposDe = (T) => T.grupos || [{ nombre: '1ª Fase', tabla: T.tabla }]
const equipos = (T) => gruposDe(T).flatMap((g) => Object.keys(g.tabla))

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
  const G = gruposDe(T)
  const grupoDe = (n) => G.findIndex((g) => g.tabla[n])
  const calc = G.map((g) => Object.fromEntries(Object.keys(g.tabla).map((n) => [n, [0, 0, 0]])))
  for (const [f, a, b, sa, sb] of T.liga) {
    const ga = grupoDe(a)
    if (ga < 0 || grupoDe(b) < 0) { err.push('equipo desconocido en la liga: ' + a + ' / ' + b); continue }
    if (ga !== grupoDe(b)) { err.push('partido entre grupos distintos: ' + a + ' vs ' + b); continue }
    if (!T.dias[f]) err.push('falta el día de la fecha ' + f)
    if (T.modalidad === 'CLOTH' && sa % 2 !== sb % 2) err.push('marcador imposible en Cloth (paridad distinta): ' + a + ' ' + sa + '-' + sb + ' ' + b)
    const c = calc[ga]
    c[a][1] += sa; c[a][2] += sb; c[b][1] += sb; c[b][2] += sa
    if (sa > sb) c[a][0] += 3; else if (sa < sb) c[b][0] += 3; else { c[a][0] += 1; c[b][0] += 1 }
  }
  G.forEach((g, i) => {
    for (const n of Object.keys(g.tabla)) if (calc[i][n].join() !== g.tabla[n].join()) err.push('la tabla calculada no coincide para ' + n + ': ' + calc[i][n] + ' vs ' + g.tabla[n])
  })
  const sig = T.siembra || (G.length === 1 ? Object.keys(G[0].tabla) : null)
  if (!sig) err.push('con varios grupos falta "siembra" (orden general de los clasificados a la llave)')
  else for (const m of T.llave) for (const n of [m.a, m.b]) if (n && !sig.includes(n)) err.push('la llave usa un equipo que no está en la siembra: ' + n)
  for (const m of T.llave) if (T.modalidad === 'CLOTH' && m.sa != null && m.sa % 2 !== m.sb % 2) err.push('marcador imposible en la llave ' + m.ref)
  return err
}

async function cargar(T) {
  console.log('\n══ ' + T.nombre + ' ══')
  const errs = verificar(T)
  if (errs.length) { console.log('✖ Datos inconsistentes:\n  - ' + errs.join('\n  - ')); return false }
  console.log('✔ Los ' + T.liga.length + ' partidos de liga reproducen exactamente ' + (gruposDe(T).length > 1 ? 'las ' + gruposDe(T).length + ' tablas' : 'la tabla') + ' de la fuente.')

  const todosT = await prisma.tournament.findMany({ where: { AND: T.buscar.map((s) => ({ name: { contains: s, mode: 'insensitive' } })) }, include: { stages: true, teams: true } })
  const mismo = todosT.filter((x) => x.branch === T.rama && x.modality === T.modalidad)
  if (mismo.some((x) => x.deletedAt)) { console.log('✖ El torneo está en "Eliminados" en la web: restauralo (o borralo definitivamente) y volvé a correr.'); return false }
  if (mismo.length > 1) { console.log('✖ Hay ' + mismo.length + ' torneos con ese nombre, rama y modalidad: ' + mismo.map((x) => x.name).join(' | ')); return false }
  const nuevoTorneo = mismo.length === 0
  let t = mismo[0] || { id: null, name: T.nombre, branch: T.rama, modality: T.modalidad, format: 'LEAGUE', status: 'DRAFT', stages: [], teams: [], startsAt: null, endsAt: null }
  if (nuevoTorneo) console.log('⚠ El torneo no existe en la web: se va a CREAR "' + T.nombre + '" (borrador)' + (todosT.length ? '' : '. Torneos que hay hoy: ' + (await prisma.tournament.findMany({ where: { deletedAt: null }, select: { name: true } })).map((x) => x.name).join(' | ')))
  else {
    console.log('Torneo: ' + t.name + ' (' + t.id + ') · formato ' + t.format + ' · estado ' + t.status)
    const yaPartidos = await prisma.match.count({ where: { tournamentId: t.id } })
    if (yaPartidos) { console.log('⚠ Se saltea: ya tiene ' + yaPartidos + ' partidos. Para recargarlo, reiniciá o vaciá el torneo desde la web.'); return false }
  }

  const todos = await prisma.team.findMany({ select: { id: true, name: true } })
  const inscriptos = new Set(t.teams.map((x) => x.teamId))
  const equipo = {}
  const faltan = []
  for (const n of equipos(T)) {
    const buscados = [n, ...(ALIAS[n] || [])].map(NOMBRE)
    const c = todos.filter((x) => buscados.includes(NOMBRE(x.name)))
    const prefer = c.filter((x) => inscriptos.has(x.id))
    const elegido = prefer.length === 1 ? prefer[0] : c.length === 1 ? c[0] : null
    if (c.length > 1 && !elegido) {
      console.log('✖ Equipo "' + n + '": hay ' + c.length + ' con ese nombre y no sé cuál usar')
      return false
    }
    if (!elegido) faltan.push(n) // no existe: se crea al cargar (sin escudo)
    equipo[n] = elegido ? elegido.id : null
  }
  const extra = t.stages.filter((s) => !(s.type === 'LEAGUE' && s.phase === 1) && !(s.type === 'KNOCKOUT' && s.phase === 2))
  if (extra.length) { console.log('✖ El torneo tiene etapas que no esperaba: ' + extra.map((s) => s.name + ' (' + s.type + ' fase ' + s.phase + ')').join(', ')); return false }
  const G = gruposDe(T)
  const ligasWeb = t.stages.filter((s) => s.type === 'LEAGUE').sort((x, y) => x.name.localeCompare(y.name))
  if (ligasWeb.length && ligasWeb.length !== G.length) { console.log('✖ El torneo en la web tiene ' + ligasWeb.length + ' zonas (' + ligasWeb.map((s) => s.name).join(', ') + ') y los datos tienen ' + G.length + ' grupos. Ajustá la estructura en la web o avisame.'); return false }
  const venue = await prisma.venue.findFirst({ where: { deletedAt: null, OR: [{ name: { contains: T.sede.name.split(' ')[0], mode: 'insensitive' } }, { mapUrl: T.sede.mapUrl }] } })
  const fechas = [...new Set(T.liga.map((x) => x[0]))].sort((a, b) => a - b)

  console.log('✔ Equipos existentes: ' + equipos(T).filter((n) => equipo[n]).join(', '))
  if (faltan.length) console.log('⚠ Equipos que no existen y se van a CREAR (sin escudo): ' + faltan.join(', '))
  console.log('Se va a hacer: sede ' + (venue ? 'existente "' + venue.name + '"' : 'nueva "' + T.sede.name + '"') + ' · formato ' + (t.format === 'LEAGUE' ? 'LEAGUE → LEAGUE_CUP' : t.format)
    + ' · ' + fechas.length + ' fechas / ' + T.liga.length + ' partidos (' + fechas.map((f) => f + '→' + T.dias[f].slice(5)).join(', ') + ') · llave ' + T.diaLlave.slice(5) + ' (' + T.llave.length + ' partidos)' + (T.llave.some((m) => m.sa == null) ? ' · ⚠ ' + T.llave.filter((m) => m.sa == null).length + ' sin resultado (quedan Programados: hay que jugarlos o cancelarlos en la web antes de finalizar el torneo)' : ''))
  if (!aplicar) return true

  await prisma.$transaction(async (tx) => {
    const sede = venue || (await tx.venue.create({ data: T.sede }))
    if (nuevoTorneo) {
      const nt = await tx.tournament.create({
        data: {
          name: T.nombre, branch: T.rama, modality: T.modalidad, year: 2026, edition: 'Nacional', format: 'LEAGUE',
          tiebreakers: { create: ['HEAD_TO_HEAD', 'SET_DIFFERENCE', 'SETS_WON', 'DRAW_LOT'].map((criterion, i) => ({ order: i + 1, criterion })) },
        },
      })
      t = { ...t, id: nt.id }
    }
    for (const n of faltan) equipo[n] = (await tx.team.create({ data: { name: n } })).id
    // Todos los equipos del torneo tienen que figurar en su rama y modalidad (si no, la web no los deja inscribir ni programar)
    await tx.teamBranch.createMany({ data: equipos(T).map((n) => ({ teamId: equipo[n], branch: t.branch })), skipDuplicates: true })
    await tx.teamModality.createMany({ data: equipos(T).map((n) => ({ teamId: equipo[n], modality: t.modality })), skipDuplicates: true })
    const primero = dia(T.dias[fechas[0]])
    await tx.tournament.update({
      where: { id: t.id },
      data: { format: t.format === 'LEAGUE' ? 'LEAGUE_CUP' : t.format, startsAt: t.startsAt || primero, endsAt: t.endsAt || dia(T.diaLlave) },
    })
    await tx.tournamentTeam.createMany({ data: equipos(T).map((n) => ({ tournamentId: t.id, teamId: equipo[n] })), skipDuplicates: true })

    const ligas = []
    for (let i = 0; i < G.length; i++) {
      ligas.push(ligasWeb[i] || (await tx.stage.create({ data: { tournamentId: t.id, name: G[i].nombre, type: 'LEAGUE', phase: 1 } })))
      await tx.stageTeam.createMany({ data: Object.keys(G[i].tabla).map((n) => ({ stageId: ligas[i].id, teamId: equipo[n] })), skipDuplicates: true })
    }
    const ligaDe = (n) => ligas[G.findIndex((g) => g.tabla[n])]
    const llave = t.stages.find((s) => s.type === 'KNOCKOUT') || (await tx.stage.create({ data: { tournamentId: t.id, name: '2ª Fase', type: 'KNOCKOUT', phase: 2 } }))

    const base = { tournamentId: t.id, branch: t.branch, modality: t.modality, status: 'FINISHED', court: T.cancha, venueId: sede.id, timeSet: false }
    const filas = []
    const setsRows = []
    const nuevo = (fila, sa, sb) => {
      const id = crypto.randomUUID()
      if (sa == null) { // sin resultado (todavía no se jugó): queda Programado y sin sets
        filas.push({ id, ...base, ...fila, status: 'SCHEDULED', finishedAt: null })
        return id
      }
      filas.push({ id, ...base, ...fila, finishedAt: fila.scheduledAt })
      for (const s of sets(T, sa, sb, fila.teamAId, fila.teamBId)) setsRows.push({ matchId: id, ...s })
      return id
    }

    const dias = {}
    for (const lg of ligas) {
      for (const n of fechas) {
        const f = dia(T.dias[n])
        const md = await tx.matchday.upsert({
          where: { stageId_number: { stageId: lg.id, number: n } },
          update: { date: f },
          create: { stageId: lg.id, number: n, date: f },
        })
        dias[lg.id + ':' + n] = { id: md.id, f }
      }
    }
    for (const [n, a, b, sa, sb] of T.liga) {
      const lg = ligaDe(a)
      const d = dias[lg.id + ':' + n]
      nuevo({ stageId: lg.id, matchdayId: d.id, scheduledAt: d.f, teamAId: equipo[a], teamBId: equipo[b] }, sa, sb)
    }

    const fl = dia(T.diaLlave)
    const ids = {}
    const rows = {}
    const orden = T.siembra || equipos(T) // orden general de clasificación (con una sola zona, el de su tabla)
    // De dónde sale cada lugar: solo se puede indicar con una zona única (con varios grupos el cruce es general y se carga el equipo directo)
    const pos = (n) => (ligas.length === 1 ? { stageId: ligas[0].id, position: orden.indexOf(n) + 1 } : undefined)
    const ganador = (ref) => { const o = T.llave.find((x) => x.ref === ref); return o.sa > o.sb ? rows[o.ref].teamAId : rows[o.ref].teamBId }
    for (const m of T.llave) {
      const fila = { stageId: llave.id, round: m.round, slot: m.slot, scheduledAt: fl }
      if (m.a) { fila.teamAId = equipo[m.a]; if (pos(m.a)) fila.teamAFrom = pos(m.a) }
      if (m.b) { fila.teamBId = equipo[m.b]; if (pos(m.b)) fila.teamBFrom = pos(m.b) }
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
      data: orden.filter((n) => equipo[n]).map((n, i) => ({ stageId: llave.id, teamId: equipo[n], seed: i + 1, entryRound: (T.byes || []).includes(n) ? 2 : 1 })),
    })
    console.log('✔ Cargados ' + filas.length + ' partidos y ' + setsRows.length + ' sets.')
  }, { timeout: 60000 })
  return true
}

async function main() {
  try { console.log('Base de datos: ' + new URL(process.env.DATABASE_URL).hostname) } catch { /* sin URL */ }
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
