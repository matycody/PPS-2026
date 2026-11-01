// EDITA torneos que ya existen en la base (no crea ni borra torneos): carga día, hora, sede y resultado de cada partido.
//   Simular:  node scripts/editar-torneo.js              (muestra qué partido encontró y la tabla para controlar)
//   Grabar:   node scripts/editar-torneo.js --aplicar    (opcional: --seed 7)
//   Un solo torneo: --solo femenino   (texto que esté en el nombre)
// Los marcadores son los reales; el orden de los sets es inventado (2 tiempos de 20:00). No cambia el estado del torneo.
require('dotenv').config();
const crypto = require('crypto');
const prisma = require('../src/db');
const { buildSets, resolveTeam } = require('./cargar-resultados');

const SEDES = {
  mupol: { token: 'mupol', name: 'Mupol Voley', address: 'Av. Juan de Garay 3127, CABA' },
  lamadrid: { token: 'lamadrid', name: 'Club Gral. Lamadrid', address: 'Club Gral. Lamadrid' },
  almafuerte: { token: 'almafuerte', name: 'Club Almafuerte', address: 'Club Almafuerte' },
  glow: { token: 'glow', name: 'Glow, Floresta', address: 'Glow, Floresta, CABA' },
  moran: { token: 'clubmoran', name: 'Club Morán', address: 'Club Morán' },
  pueyrredon: { token: 'pueyrredon', name: 'Club Social Atlético Pueyrredón', address: 'Prilidiano Pueyrredón 1320, Burzaco' },
  orione: { token: 'orione', name: 'Polideportivo Don Orione', address: 'Av. Eva Perón 780, Don Orione' },
  cedem: { token: 'cedem', name: 'CEDEM N°1', address: 'CEDEM N°1' },
  cef: { token: 'cef164', name: 'Cef 164, Guernica', address: 'Cef 164, Guernica' },
  sanfer: { token: 'sanfernando', name: 'Polideportivo N°8 San Fernando', address: 'French 1500, San Fernando' },
};

// liga: [fecha, día|null, [[local, visitante, pts local, pts visitante, hora|null, sede|null, día propio (pospuestos)]]]
// rearmarLlave: deja la etapa Playoffs como la arma la web (1°/2° pasan directo, 3° vs 6°, 4° vs 5°, semis, final y 3er puesto); solo si todavía no se jugó nada ahí
// llave: [ronda, slot, local, visitante, pts local, pts visitante, día|null, hora|null, sede|null]  (ronda 1 = cuartos, 2 = semis, 3 = final)
// Forma estándar de la web para 6 clasificados de una zona: 1° y 2° directo a semis, 3° vs 6°, 4° vs 5°, final y 3er puesto.
// Cada partido: [ref, ronda, slot, lado A, lado B]; un lado es 'A4' (4° de la zona A), {w: ref} (ganador de) o {l: ref} (perdedor de)
const SPEC6 = [
  ['R1M1', 1, 1, 'A4', 'A5'], ['R1M2', 1, 2, 'A3', 'A6'],
  ['R2M1', 2, 1, 'A1', { w: 'R1M1' }], ['R2M2', 2, 2, 'A2', { w: 'R1M2' }],
  ['R3M1', 3, 1, { w: 'R2M1' }, { w: 'R2M2' }], ['R3M2', 3, 2, { l: 'R2M1' }, { l: 'R2M2' }],
];
// Llave de 13 equipos (zonas A de 7 y B de 6): play-in B6 vs A7, octavos, cuartos, semis, final y 3er puesto
const SPEC13 = [
  ['PO1', 1, 1, 'B6', 'A7'],
  ['O1', 2, 1, 'B4', 'A5'], ['O2', 2, 2, 'A3', { w: 'PO1' }], ['O3', 2, 3, 'B3', 'A6'], ['O4', 2, 4, 'A4', 'B5'],
  ['C1', 3, 1, 'A1', { w: 'O1' }], ['C2', 3, 2, 'B2', { w: 'O2' }], ['C3', 3, 3, { w: 'O3' }, 'A2'], ['C4', 3, 4, { w: 'O4' }, 'B1'],
  ['S1', 4, 1, { w: 'C1' }, { w: 'C2' }], ['S2', 4, 2, { w: 'C3' }, { w: 'C4' }],
  ['F', 5, 1, { w: 'S1' }, { w: 'S2' }], ['T', 5, 2, { l: 'S1' }, { l: 'S2' }],
];

// Llave de 12 equipos (zonas A y B de 6) con 4 pasando directo a cuartos: octavos entre 3°-6° de cada zona, cuartos, semis, final y 3er puesto
const SPEC12 = [
  ['O1', 1, 1, 'B4', 'A5'], ['O2', 1, 2, 'A3', 'B6'], ['O3', 1, 3, 'B3', 'A6'], ['O4', 1, 4, 'A4', 'B5'],
  ['C1', 2, 1, 'A1', { w: 'O1' }], ['C2', 2, 2, 'B2', { w: 'O2' }], ['C3', 2, 3, 'A2', { w: 'O3' }], ['C4', 2, 4, 'B1', { w: 'O4' }],
  ['S1', 3, 1, { w: 'C1' }, { w: 'C2' }], ['S2', 3, 2, { w: 'C3' }, { w: 'C4' }],
  ['F', 4, 1, { w: 'S1' }, { w: 'S2' }], ['T', 4, 2, { l: 'S1' }, { l: 'S2' }],
];

const TORNEOS = [
  {
    nombre: 'Femenino Cloth 2026', buscar: ['femenino', 'cloth'], modality: 'CLOTH', rearmarLlave: SPEC6,
    liga: [
      [1, '2026-03-14', [['Noazar', 'Morán', 20, 12, '16:00', 'mupol'], ['Riestra by Pch', 'Berserker', 16, 10, '17:00', 'mupol'], ['Panthers', 'Marvin', 18, 16, '15:00', 'almafuerte', '2026-07-11']]],
      [2, '2026-04-25', [['Panthers', 'Morán', 33, 3, '15:00', 'lamadrid'], ['Riestra by Pch', 'Hydra', 2, 30, '18:00', 'lamadrid'], ['Marvin', 'Berserker', 20, 14, '19:00', 'lamadrid']]],
      [3, '2026-05-09', [['Marvin', 'Hydra', 10, 22, '15:30', 'lamadrid'], ['Panthers', 'Noazar', 17, 9, '19:30', 'lamadrid'], ['Berserker', 'Morán', 26, 0, '12:00', 'almafuerte', '2026-07-12']]], // la web dice 03:30: se toma 15:30
      [4, '2026-07-05', [['Marvin', 'Riestra by Pch', 21, 7, '12:00', 'almafuerte'], ['Morán', 'Hydra', 4, 36, '13:00', 'almafuerte'], ['Berserker', 'Noazar', 14, 14, '14:00', 'almafuerte']]],
      [5, '2026-08-09', [['Berserker', 'Panthers', 13, 15, '14:00'], ['Hydra', 'Noazar', 16, 12, '19:00'], ['Morán', 'Riestra by Pch', 0, 26, null]]],
      [6, '2026-08-23', [['Noazar', 'Riestra by Pch', 24, 6, '13:00', 'glow'], ['Hydra', 'Panthers', 24, 18, '18:00', 'glow'], ['Morán', 'Marvin', 0, 26, null, 'glow']]],
      [7, '2026-08-23', [['Riestra by Pch', 'Panthers', 3, 33, '11:00', 'glow'], ['Hydra', 'Berserker', 21, 15, '14:00', 'glow'], ['Noazar', 'Marvin', 13, 21, '15:00', 'glow']]],
    ],
    llave: [
      [1, 1, 'Noazar', 'Riestra by Pch', 17, 11, '2026-08-30', '16:00', 'moran'],
      [1, 2, 'Marvin', 'Berserker', 9, 25, '2026-08-30', '15:00', 'moran'],
      [2, 1, 'Hydra', 'Noazar', 24, 6, '2026-10-04', '12:00', 'lamadrid'],
      [2, 2, 'Panthers', 'Berserker', 18, 16, '2026-10-04', '15:00', 'lamadrid'],
      [3, 1, 'Hydra', 'Panthers', 17, 15, null, null, null],
      [3, 2, 'Noazar', 'Berserker', 13, 15, null, null, null], // 3er y 4to puesto
    ],
  },
  {
    nombre: 'Femenino Foam 2026', buscar: ['femenino', 'foam'], modality: 'FOAM', rearmarLlave: SPEC6,
    liga: [
      [1, '2026-03-14', [['Marvin', 'Morán', 12, 3, '18:00', 'mupol'], ['Hydra', 'Noazar', 12, 1, '19:00', 'mupol'], ['Panthers', 'Riestra by Pch', 13, 0, '16:30', 'lamadrid', '2026-05-09']]],
      [2, '2026-04-25', [['Hydra', 'Berserker', 4, 5, '16:00', 'lamadrid'], ['Panthers', 'Marvin', 8, 12, '17:00', 'lamadrid'], ['Riestra by Pch', 'Noazar', 5, 6, '20:00', 'lamadrid']]],
      [3, '2026-05-09', [['Noazar', 'Marvin', 8, 12, '17:30', 'lamadrid'], ['Riestra by Pch', 'Berserker', 1, 12, '18:30', 'lamadrid'], ['Panthers', 'Morán', 9, 0, '12:00', 'almafuerte', '2026-07-12']]],
      [4, '2026-07-05', [['Marvin', 'Berserker', 8, 8, '10:00', 'almafuerte'], ['Noazar', 'Morán', 5, 4, '11:00', 'almafuerte'], ['Riestra by Pch', 'Hydra', 1, 9, '15:00', 'almafuerte']]],
      [5, '2026-08-09', [['Noazar', 'Panthers', 4, 6, '16:00'], ['Marvin', 'Hydra', 9, 7, '17:00'], ['Berserker', 'Morán', 9, 0, null]]],
      [6, '2026-08-23', [['Berserker', 'Panthers', 7, 7, '12:00', 'glow'], ['Marvin', 'Riestra by Pch', 10, 7, '17:00', 'glow'], ['Morán', 'Hydra', 0, 9, null, 'glow']]],
      [7, '2026-08-23', [['Berserker', 'Noazar', 6, 5, '10:00', 'glow'], ['Hydra', 'Panthers', 6, 9, '16:00', 'glow'], ['Morán', 'Riestra by Pch', 0, 9, null, 'glow']]],
    ],
    llave: [
      [1, 1, 'Hydra', 'Noazar', 10, 4, '2026-09-13', '15:00', 'lamadrid'],
      [1, 2, 'Panthers', 'Riestra by Pch', 9, 5, '2026-09-13', '14:00', 'lamadrid'],
      [2, 1, 'Marvin', 'Hydra', 9, 7, '2026-10-04', '16:00', 'lamadrid'],
      [2, 2, 'Panthers', 'Berserker', 7, 6, '2026-10-04', '17:00', 'lamadrid'],
      [3, 1, 'Marvin', 'Panthers', 13, 7, null, null, null],
      [3, 2, 'Hydra', 'Berserker', 4, 10, null, null, null], // 3er y 4to puesto
    ],
  },
  {
    nombre: 'Masculino Foam 2026', buscar: ['masculino', 'foam'], modality: 'FOAM', rearmarLlave: SPEC13,
    orden: { A: ['Berserker', 'Freestyle', 'Lamadrid', 'Panthers', 'Riestra by Pch', 'Aurinegro', 'Dragons Guernica'] }, // Panthers queda 4° sobre Riestra (ganó el cruce directo 8-4)
    liga: [
      [1, '2026-03-22', [['Hydra', 'Linces by Pueyrredón', 9, 4, '11:00', 'pueyrredon'], ['Noazar', 'Hokory', 9, 5, '12:00', 'pueyrredon'], ['Morán', 'Marvin', 9, 6, '18:00', 'pueyrredon']], 'B'],
      [1, '2026-03-22', [['Dragons Guernica', 'Riestra by Pch', 0, 26, '15:00', 'pueyrredon'], ['Freestyle', 'Aurinegro', 25, 3, '16:00', 'pueyrredon'], ['Panthers', 'Lamadrid', 6, 8, '17:00', 'pueyrredon']], 'A'],
      [2, '2026-04-12', [['Noazar', 'Morán', 10, 5, '08:45', 'cef'], ['Linces by Pueyrredón', 'Marvin', 7, 4, '13:00', 'cef'], ['Hydra', 'Hokory', 12, 0, '14:00', 'cef']], 'B'],
      [2, '2026-04-12', [['Dragons Guernica', 'Aurinegro', 0, 17, '15:00', 'cef'], ['Panthers', 'Berserker', 4, 9, '17:00', 'cef'], ['Riestra by Pch', 'Lamadrid', 13, 2, '18:00', 'cef']], 'A'],
      [3, '2026-04-26', [['Hokory', 'Morán', 7, 6, '12:00', 'pueyrredon'], ['Hydra', 'Marvin', 16, 4, '13:00', 'pueyrredon'], ['Linces by Pueyrredón', 'Noazar', 4, 10, '16:00']], 'B'],
      [3, '2026-04-26', [['Dragons Guernica', 'Freestyle', 0, 33, '08:45', 'pueyrredon'], ['Lamadrid', 'Aurinegro', 9, 6, '17:00', 'pueyrredon'], ['Riestra by Pch', 'Berserker', 4, 9, '18:00', 'pueyrredon']], 'A'],
      [4, '2026-05-10', [['Marvin', 'Noazar', 2, 16, '11:10', 'sanfer'], ['Hydra', 'Morán', 7, 5, '12:20', 'sanfer'], ['Hokory', 'Linces by Pueyrredón', 3, 11, '13:30', 'sanfer']], 'B'],
      [4, '2026-05-10', [['Riestra by Pch', 'Panthers', 4, 8, '11:10', 'sanfer'], ['Lamadrid', 'Freestyle', 8, 9, '12:20', 'sanfer'], ['Aurinegro', 'Berserker', 3, 14, '13:30', 'sanfer']], 'A'],
      [5, '2026-07-26', [['Hydra', 'Noazar', 8, 6, '10:00', 'pueyrredon'], ['Morán', 'Linces by Pueyrredón', 5, 5, '19:00', 'pueyrredon'], ['Marvin', 'Hokory', 0, 9, null, 'pueyrredon']], 'B'],
      [5, '2026-07-26', [['Berserker', 'Freestyle', 6, 5, '11:00', 'pueyrredon'], ['Aurinegro', 'Panthers', 7, 5, '14:00', 'pueyrredon'], ['Lamadrid', 'Dragons Guernica', 25, 0, '18:00', 'pueyrredon']], 'A'],
      [6, '2026-08-09', [['Berserker', 'Dragons Guernica', 26, 0, '12:00'], ['Freestyle', 'Panthers', 4, 5, '13:00'], ['Aurinegro', 'Riestra by Pch', 2, 7, '18:00']], 'A'],
      [7, '2026-08-09', [['Berserker', 'Lamadrid', 4, 13, '09:00'], ['Panthers', 'Dragons Guernica', 24, 0, '10:00'], ['Freestyle', 'Riestra by Pch', 5, 4, '15:00']], 'A'],
    ],
    llave: [
      [1, 1, 'Marvin', 'Dragons Guernica', 15, 0, '2026-09-13', '12:00', 'lamadrid'],
      [2, 1, 'Hokory', 'Riestra by Pch', 4, 8, '2026-09-13', '14:00', 'lamadrid'],
      [2, 2, 'Lamadrid', 'Marvin', 10, 6, '2026-09-13', '17:00', 'lamadrid'],
      [2, 3, 'Linces by Pueyrredón', 'Aurinegro', 12, 1, '2026-09-13', '13:00', 'lamadrid'],
      [2, 4, 'Panthers', 'Morán', 12, 2, '2026-09-13', '10:45', 'lamadrid'],
      [3, 1, 'Berserker', 'Riestra by Pch', 7, 5, '2026-09-27', '17:00', 'pueyrredon'],
      [3, 2, 'Noazar', 'Lamadrid', 8, 7, '2026-09-27', '09:45', 'pueyrredon'],
      [3, 3, 'Linces by Pueyrredón', 'Freestyle', 6, 7, '2026-09-27', '16:00', 'pueyrredon'],
      [3, 4, 'Panthers', 'Hydra', 6, 7, '2026-09-27', '11:00', 'pueyrredon'],
      [4, 1, 'Berserker', 'Noazar', 8, 7, '2026-10-04', '14:00', 'lamadrid'],
      [4, 2, 'Freestyle', 'Hydra', 7, 6, '2026-10-04', '16:00', 'lamadrid'],
      [5, 1, 'Berserker', 'Freestyle', 5, 7, null, null, null],
      [5, 2, 'Noazar', 'Hydra', 9, 7, null, null, null], // 3er y 4to puesto
    ],
  },
  {
    nombre: 'Masculino Cloth 2026', buscar: ['masculino', 'cloth'], modality: 'CLOTH', rearmarLlave: SPEC12, rearmarZonas: true,
    orden: { B: ['Hydra', 'Riestra by Pch', 'Panthers', 'Lamadrid', 'Morán', 'Hokory'] }, // la web muestra a Panthers con 7 pts (no 8): queda 3° y Riestra 2°
    liga: [
      [1, '2026-03-22', [['Noazar', 'Berserker', 24, 12, '10:00', 'pueyrredon'], ['Freestyle', 'Linces by Pueyrredón', 12, 30, '13:00', 'pueyrredon'], ['Aurinegro', 'Marvin', 2, 42, '14:00', 'pueyrredon']], 'A'],
      [1, '2026-03-22', [['Hydra', 'Hokory', 26, 6, '08:45', 'pueyrredon'], ['Lamadrid', 'Riestra by Pch', 11, 17, '19:00', 'pueyrredon'], ['Panthers', 'Morán', 15, 15, '20:00', 'pueyrredon']], 'B'],
      [2, '2026-04-12', [['Linces by Pueyrredón', 'Marvin', 19, 13, '10:00', 'cef'], ['Noazar', 'Aurinegro', 46, 4, '12:00', 'cef'], ['Freestyle', 'Berserker', 0, 26, '19:00', 'cef']], 'A'],
      [2, '2026-04-12', [['Hydra', 'Morán', 16, 12, '11:00', 'cef'], ['Hokory', 'Riestra by Pch', 7, 23, '16:00', 'cef'], ['Panthers', 'Lamadrid', 21, 15, '20:00', 'cef']], 'B'],
      [3, '2026-04-26', [['Freestyle', 'Marvin', 19, 17, '11:00', 'pueyrredon'], ['Linces by Pueyrredón', 'Noazar', 10, 26, '19:00', 'pueyrredon'], ['Berserker', 'Aurinegro', 42, 4, '20:00', 'pueyrredon']], 'A'],
      [3, '2026-04-26', [['Hokory', 'Panthers', 4, 36, '10:00', 'pueyrredon'], ['Morán', 'Lamadrid', 16, 24, '14:00', 'pueyrredon'], ['Hydra', 'Riestra by Pch', 28, 10, '15:00', 'pueyrredon']], 'B'],
      [4, '2026-05-10', [['Freestyle', 'Aurinegro', 19, 15, '10:00', 'sanfer'], ['Marvin', 'Noazar', 7, 41, '14:40', 'sanfer'], ['Berserker', 'Linces by Pueyrredón', 15, 19, '15:50', 'sanfer']], 'A'],
      [4, '2026-05-10', [['Hydra', 'Lamadrid', 22, 12, '10:00', 'sanfer'], ['Riestra by Pch', 'Panthers', 15, 15, '14:40', 'sanfer'], ['Morán', 'Hokory', 44, 2, '15:50', 'sanfer']], 'B'],
      [5, '2026-07-26', [['Freestyle', 'Noazar', 11, 37, '13:00', 'pueyrredon'], ['Aurinegro', 'Linces by Pueyrredón', 9, 27, '16:00', 'pueyrredon'], ['Marvin', 'Berserker', 0, 26, null, 'pueyrredon']], 'A'],
      [5, '2026-07-26', [['Hydra', 'Panthers', 26, 12, '12:00', 'pueyrredon'], ['Lamadrid', 'Hokory', 28, 8, '15:00', 'pueyrredon'], ['Riestra by Pch', 'Morán', 13, 13, '17:00', 'pueyrredon']], 'B'],
    ],
    llave: [
      [1, 1, 'Lamadrid', 'Marvin', 27, 13, '2026-08-30', '13:00', 'moran'],
      [1, 2, 'Berserker', 'Hokory', 30, 4, '2026-08-30', '17:00', 'moran'],
      [1, 3, 'Panthers', 'Aurinegro', 32, 4, '2026-08-30', '14:00', 'moran'],
      [1, 4, 'Freestyle', 'Morán', 15, 21, '2026-08-30', '18:00', 'moran'],
      [2, 1, 'Noazar', 'Lamadrid', 20, 16, '2026-09-27', '12:00', 'pueyrredon'],
      [2, 2, 'Riestra by Pch', 'Berserker', 16, 18, '2026-09-27', '15:00', 'pueyrredon'],
      [2, 3, 'Linces by Pueyrredón', 'Panthers', 13, 23, '2026-09-27', '14:00', 'pueyrredon'],
      [2, 4, 'Hydra', 'Morán', 19, 13, '2026-09-27', '13:00', 'pueyrredon'],
      [3, 1, 'Noazar', 'Berserker', 22, 16, '2026-10-04', '11:00', 'lamadrid'],
      [3, 2, 'Panthers', 'Hydra', 30, 4, '2026-10-04', '14:00', 'lamadrid'],
      [4, 1, 'Noazar', 'Panthers', 14, 18, null, null, null],
      [4, 2, 'Berserker', 'Hydra', 10, 22, null, null, null], // 3er y 4to puesto
    ],
  },
  {
    nombre: 'Cloth Mixto Clausura 2026', buscar: ['mixto', 'cloth'], excluir: ['apertura'], modality: 'CLOTH', rearmarZonas: 'siempre',
    // Igual que el Apertura: el último del A desciende, el 1° del B asciende y juegan la promoción el 4° del A y el 2° del B
    zonasConfig: { A: { tier: 1, desc: 1, playoff: [4] }, B: { tier: 2, asc: 1, playoff: [2] } },
    // Fecha 5: todavía sin jugar (mañana 1/11); el día sale del cronograma de la organización
    liga: [
      [1, '2026-08-02', [['Hydra', 'PCH', 14, 12, '13:00', 'orione', null, 1], ['Lamadrid', 'Panthers', 12, 22, '14:00', 'orione', null, 1]], 'A'],
      [1, '2026-08-02', [['Berserker', 'Linces by Pueyrredón', 18, 18, '10:00', 'orione', null, 2], ['Marvin', 'Morán', 15, 17, '13:00', 'orione', null, 2], ['Freestyle', 'Hokory', 14, 18, '14:00', 'orione', null, 2]], 'B'],
      [2, '2026-08-16', [['PCH', 'Panthers', 15, 15, '12:00', 'cedem', null, 1], ['Hydra', 'Noazar', 27, 7, '12:00', 'cedem', null, 2]], 'A'],
      [2, '2026-08-16', [['Linces by Pueyrredón', 'Morán', 15, 13, '13:00', 'cedem', null, 2], ['Freestyle', 'Marvin', 14, 36, '13:00', 'cedem', null, 1], ['Berserker', 'Hokory', 16, 14, '14:00', 'cedem', null, 2]], 'B'],
      [3, '2026-09-06', [['Panthers', 'Noazar', 18, 18, '14:00', 'cedem', null, 2], ['PCH', 'Lamadrid', 17, 11, '15:00', 'cedem', null, 1]], 'A'],
      [3, '2026-09-06', [['Freestyle', 'Berserker', 16, 20, '10:00', 'cedem', null, 1], ['Linces by Pueyrredón', 'Marvin', 19, 15, '10:00', 'cedem', null, 2], ['Morán', 'Hokory', 11, 17, '14:00', 'cedem', null, 1]], 'B'],
      [4, '2026-09-20', [['Panthers', 'Hydra', 16, 16, '14:00', 'cedem', null, 1], ['Noazar', 'Lamadrid', 21, 13, '16:00', 'cedem', null, 1]], 'A'],
      [4, '2026-09-20', [['Hokory', 'Marvin', 7, 25, '14:00', 'cedem', null, 2], ['Freestyle', 'Linces by Pueyrredón', 15, 23, '15:00', 'cedem', null, 2], ['Morán', 'Berserker', 10, 18, '15:00', 'cedem', null, 1]], 'B'],
      [5, '2026-11-01', [['Noazar', 'PCH', null, null, null, 'sanfer'], ['Lamadrid', 'Hydra', null, null, null, 'sanfer']], 'A'],
      [5, '2026-11-01', [['Freestyle', 'Morán', null, null, null, 'sanfer'], ['Hokory', 'Linces by Pueyrredón', null, null, null, 'sanfer'], ['Marvin', 'Berserker', null, null, null, 'sanfer']], 'B'],
    ],
    llave: [],
  },
  {
    nombre: 'Foam Mixto Clausura 2026', buscar: ['mixto', 'foam'], excluir: ['apertura'], modality: 'FOAM', rearmarZonas: 'siempre',
    // Mismo criterio que el Apertura: el último del A desciende, el 1° del B asciende y juegan la promoción el anteúltimo del A (5°) y el 2° del B
    zonasConfig: { A: { tier: 1, desc: 1, playoff: [5] }, B: { tier: 2, asc: 1, playoff: [2] } },
    // Los partidos sin hora ni cancha no se veían en las capturas: sus marcadores salen de despejar las tablas (día y sede de la fecha)
    liga: [
      [1, '2026-08-02', [['Hydra', 'Freestyle', 9, 7, '10:00', 'orione', null, 1], ['Panthers', 'PCH', 12, 1, '11:00', 'orione', null, 1], ['Linces by Pueyrredón', 'Noazar', 7, 7, '12:00', 'orione', null, 1]], 'A'],
      [1, '2026-08-02', [['Morán', 'Hokory', 2, 11, '11:00', 'orione', null, 2], ['Berserker', 'Lamadrid', 9, 7, '12:00', 'orione', null, 2], ['Marvin', 'Old Blue', 18, 4, null, 'orione']], 'B'],
      [2, '2026-08-16', [['PCH', 'Freestyle', 9, 6, '10:00', 'cedem', null, 1], ['Panthers', 'Noazar', 7, 7, '14:00', 'cedem', null, 1], ['Hydra', 'Linces by Pueyrredón', 10, 4, null, 'cedem']], 'A'],
      [2, '2026-08-16', [['Morán', 'Lamadrid', 4, 9, '10:00', 'cedem', null, 2], ['Hokory', 'Marvin', 6, 8, '11:00', 'cedem', null, 2], ['Berserker', 'Old Blue', 20, 0, '11:00', 'cedem', null, 1]], 'B'],
      [3, '2026-09-06', [['PCH', 'Hydra', 5, 9, '11:00', 'cedem', null, 1], ['Freestyle', 'Noazar', 8, 8, '12:00', 'cedem', null, 1], ['Panthers', 'Linces by Pueyrredón', 10, 3, null, 'cedem']], 'A'],
      [3, '2026-09-06', [['Hokory', 'Old Blue', 16, 2, '11:00', 'cedem', null, 2], ['Berserker', 'Morán', 8, 3, '12:00', 'cedem', null, 2], ['Marvin', 'Lamadrid', 11, 7, '13:00', 'cedem', null, 2]], 'B'],
      [4, '2026-09-20', [['Freestyle', 'Panthers', 4, 13, '10:45', 'cedem', null, 1], ['Noazar', 'Hydra', 4, 9, '12:00', 'cedem', null, 1], ['PCH', 'Linces by Pueyrredón', 7, 4, null, 'cedem']], 'A'],
      [4, '2026-09-20', [['Marvin', 'Morán', 8, 6, '10:45', 'cedem', null, 2], ['Berserker', 'Hokory', 4, 8, '12:00', 'cedem', null, 2], ['Lamadrid', 'Old Blue', 26, 5, '13:00', 'cedem', null, 2]], 'B'],
      [5, '2026-11-01', [['Linces by Pueyrredón', 'Freestyle', null, null, null, 'sanfer'], ['Noazar', 'PCH', null, null, null, 'sanfer'], ['Hydra', 'Panthers', null, null, null, 'sanfer']], 'A'],
      [5, '2026-11-01', [['Berserker', 'Marvin', null, null, null, 'sanfer'], ['Lamadrid', 'Hokory', null, null, null, 'sanfer'], ['Old Blue', 'Morán', null, null, null, 'sanfer']], 'B'],
    ],
    llave: [],
  },
];

const APPLY = process.argv.includes('--aplicar');
const ESTRUCTURA = process.argv.includes('--estructura');
const solo = process.argv.indexOf('--solo') > -1 ? process.argv[process.argv.indexOf('--solo') + 1].toLowerCase() : null;
const at = (day, hh) => new Date(day + 'T' + (hh || '12:00') + ':00-03:00');
const norm = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function venueId(key, all) {
  if (!key) return null;
  const s = SEDES[key];
  const hit = all.find((v) => norm(v.name).includes(s.token));
  if (hit) return hit.id;
  if (!APPLY) return 'NUEVA';
  const v = await prisma.venue.create({ data: { name: s.name, address: s.address } });
  all.push(v);
  return v.id;
}

function tabla(T, zona) {
  const rows = new Map();
  const row = (n) => { if (!rows.has(n)) rows.set(n, { n, pts: 0, pj: 0, g: 0, e: 0, p: 0, f: 0, c: 0 }); return rows.get(n); };
  for (const [, , ms, z = 'A'] of T.liga) {
    if (zona && z !== zona) continue;
    for (const [a, b, pa, pb] of ms) {
      if (pa == null) continue; // todavía sin jugar
      const A = row(a), B = row(b);
      A.pj++; B.pj++; A.f += pa; A.c += pb; B.f += pb; B.c += pa;
      if (pa === pb) { A.e++; B.e++; A.pts++; B.pts++; } else if (pa > pb) { A.g++; B.p++; A.pts += 3; } else { B.g++; A.p++; B.pts += 3; }
    }
  }
  const out = [...rows.values()].sort((x, y) => y.pts - x.pts || (y.f - y.c) - (x.f - x.c));
  const fijo = T.orden && T.orden[zona || 'A']; // desempate real de la web cuando difiere (ej: cruce directo)
  return fijo ? fijo.map((n) => out.find((r) => r.n === n)) : out;
}

// Rearma la llave (Playoffs) según T.rearmarLlave (lista de partidos). Los clasificados salen de las tablas de cada zona.
async function rearmarLlave(t, T, stages) {
  const ko = stages.find((x) => x.type === 'KNOCKOUT' && !x.isPromotion);
  const zone = (z) => stages.find((x) => x.type === 'LEAGUE' && x.name.trim().slice(-1).toUpperCase() === z);
  const full = await prisma.tournament.findUnique({ where: { id: t.id } });
  const tablas = {};
  const seed = async (code) => {
    const z = code[0], pos = Number(code.slice(1));
    tablas[z] = tablas[z] || tabla(T, z);
    const tm = await resolveTeam(tablas[z][pos - 1].n);
    const st = zone(z);
    if (!tm || !st) throw new Error('No pude resolver ' + code + ' para armar la llave');
    return { teamId: tm.id, from: { stageId: st.id, position: pos }, code };
  };
  const spec = T.rearmarLlave;
  const id = Object.fromEntries(spec.map(([ref]) => [ref, crypto.randomUUID()]));
  const rows = new Map(spec.map(([ref, round, slot]) => [ref, { id: id[ref], tournamentId: t.id, stageId: ko.id, round, slot, branch: full.branch, modality: full.modality, nextMatchId: null, nextSide: null, loserMatchId: null, loserSide: null }]));
  const direct = [];
  for (const [ref, round, , a, b] of spec) {
    for (const [side, src] of [['A', a], ['B', b]]) {
      const r = rows.get(ref);
      if (typeof src === 'string') {
        const sd = await seed(src);
        r['team' + side + 'Id'] = sd.teamId; r['team' + side + 'From'] = sd.from;
        direct.push({ teamId: sd.teamId, entryRound: round, code: src });
      } else if (src.w) Object.assign(rows.get(src.w), { nextMatchId: id[ref], nextSide: side });
      else Object.assign(rows.get(src.l), { loserMatchId: id[ref], loserSide: side });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { stageId: ko.id } });
    await tx.stageTeam.deleteMany({ where: { stageId: ko.id } });
    await tx.stageTeam.createMany({ data: direct.map((d, i) => ({ stageId: ko.id, teamId: d.teamId, seed: i + 1, entryRound: d.entryRound })) });
    await tx.match.createMany({ data: [...rows.values()] });
  }, { timeout: 60000 });
}

// Rearma las zonas (equipos de cada grupo y su fixture) cuando en la base están armadas distinto y todavía no se jugó nada
async function rearmarZonas(t, T, stages) {
  const full = await prisma.tournament.findUnique({ where: { id: t.id } });
  const zonas = [...new Set(T.liga.map((f) => f[3] || 'A'))];
  for (const z of zonas) {
    const st = stages.find((x) => x.type === 'LEAGUE' && x.name.trim().slice(-1).toUpperCase() === z);
    if (!st) throw new Error('No encontré la zona ' + z + ' en la base');
    const entradas = T.liga.filter((f) => (f[3] || 'A') === z);
    const nombres = [...new Set(entradas.flatMap((f) => f[2].flatMap((m) => [m[0], m[1]])))];
    const ids = new Map();
    for (const n of nombres) { const tm = await resolveTeam(n); if (!tm) throw new Error('No existe el equipo ' + n); ids.set(n, tm.id); }
    await prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({ where: { stageId: st.id } });
      await tx.matchday.deleteMany({ where: { stageId: st.id } });
      await tx.stageTeam.deleteMany({ where: { stageId: st.id } });
      await tx.stageTeam.createMany({ data: nombres.map((n, i) => ({ stageId: st.id, teamId: ids.get(n), seed: i + 1 })) });
      for (const [fecha, dia, lista] of entradas) {
        const md = await tx.matchday.create({ data: { stageId: st.id, number: fecha, date: dia ? at(dia, '12:00') : null } });
        await tx.match.createMany({ data: lista.map(([a, b]) => ({ tournamentId: t.id, stageId: st.id, matchdayId: md.id, branch: full.branch, modality: full.modality, status: 'SCHEDULED', teamAId: ids.get(a), teamBId: ids.get(b) })) });
      }
    }, { timeout: 60000 });
  }
}

async function editar(T) {
  console.log('\n' + T.nombre);
  const all = await prisma.tournament.findMany({ where: { deletedAt: null }, select: { id: true, name: true, status: true } });
  const cand = all.filter((t) => T.buscar.every((w) => norm(t.name).includes(norm(w))) && !(T.excluir || []).some((w) => norm(t.name).includes(norm(w))));
  if (cand.length !== 1) {
    console.log(cand.length ? '  Hay más de un torneo que coincide: ' + cand.map((c) => c.name).join(' | ') : '  No encontré un torneo con ' + T.buscar.join(' + ') + ' en el nombre. Torneos que hay:');
    if (!cand.length) all.forEach((x) => console.log('   - ' + x.name + ' [' + x.status + ']'));
    return;
  }
  const t = cand[0];
  console.log('  Torneo en la base: "' + t.name + '" [' + t.status + ']');
  if (ESTRUCTURA) {
    const st = await prisma.stage.findMany({ where: { tournamentId: t.id }, orderBy: [{ phase: 'asc' }, { name: 'asc' }] });
    const mm = await prisma.match.findMany({ where: { tournamentId: t.id, hiddenAt: null, stage: { type: 'KNOCKOUT' } }, include: { teamA: true, teamB: true, stage: true }, orderBy: [{ round: 'asc' }, { slot: 'asc' }] });
    st.forEach((x) => console.log(`  etapa "${x.name}" ${x.type} fase ${x.phase} playoff=${JSON.stringify(x.playoffPositions)} promo=${x.isPromotion}`));
    mm.forEach((x) => console.log(`   r${x.round} s${x.slot} [${x.stage.name}] ${x.teamA?.name ?? '?'} vs ${x.teamB?.name ?? '?'} · A<-${JSON.stringify(x.teamAFrom)} B<-${JSON.stringify(x.teamBFrom)} · next=${x.nextMatchId ? 'sí' : 'no'} loser=${x.loserMatchId ? 'sí' : 'no'} · ${x.status}`));
    return;
  }
  const zonas = [...new Set(T.liga.map((f) => f[3] || 'A'))];
  console.log('  Tabla esperada (3 por victoria, 1 por empate) para controlar contra la web:');
  for (const z of zonas) {
    if (zonas.length > 1) console.log('   Grupo ' + z);
    tabla(T, z).forEach((r, i) => console.log(`    ${i + 1}. ${r.n.padEnd(20)} ${String(r.pts).padStart(2)} pts  J${r.pj} G${r.g} E${r.e} P${r.p}  ${r.f}-${r.c}`));
  }

  const stages = await prisma.stage.findMany({ where: { tournamentId: t.id } });
  let ms = await prisma.match.findMany({ where: { tournamentId: t.id, hiddenAt: null }, include: { stage: true, teamA: true, teamB: true, sets: true } });
  if (T.zonasConfig) {
    for (const [z, c] of Object.entries(T.zonasConfig)) {
      const st = stages.find((x) => x.type === 'LEAGUE' && x.name.trim().slice(-1).toUpperCase() === z);
      if (!st) { console.log('  No encontré la zona ' + z + ' para cargar su ascenso/descenso'); continue; }
      const data = { tier: c.tier, promotions: c.asc || 0, relegations: c.desc || 0, playoffPositions: c.playoff || [] };
      console.log(`  Zona ${z} (${st.name}): nivel ${c.tier}${c.asc ? ' · asciende el 1°' : ''}${c.desc ? ' · desciende el último' : ''}${c.playoff ? ' · promoción: puesto ' + c.playoff.join(', ') : ''}`);
      if (APPLY) await prisma.stage.update({ where: { id: st.id }, data });
    }
  }
  let rearmarZ = false;
  if (T.rearmarZonas) {
    const lg = ms.filter((x) => x.stage?.type === 'LEAGUE');
    const sts = await prisma.stageTeam.findMany({ where: { stageId: { in: stages.filter((x) => x.type === 'LEAGUE').map((x) => x.id) } } });
    let difiere = false;
    for (const z of [...new Set(T.liga.map((f) => f[3] || 'A'))]) {
      const st = stages.find((x) => x.type === 'LEAGUE' && x.name.trim().slice(-1).toUpperCase() === z);
      const esperado = new Set();
      for (const f of T.liga.filter((q) => (q[3] || 'A') === z)) for (const m of f[2]) for (const n of [m[0], m[1]]) { const tm = await resolveTeam(n); if (tm) esperado.add(tm.id); }
      const real = new Set(sts.filter((x) => x.stageId === st?.id).map((x) => x.teamId));
      if (!st || T.rearmarZonas === 'siempre' || esperado.size !== real.size || [...esperado].some((id) => !real.has(id))) difiere = true;
    }
    if (difiere) {
      if (lg.some((x) => x.sets.length || x.status !== 'SCHEDULED')) console.log('  Las zonas de la base son distintas pero ya hay partidos jugados: no se rearman.');
      else { rearmarZ = true; console.log('  Las zonas de la base no coinciden con las reales (equipos de cada grupo): ' + (APPLY ? 'se rearman' : 'se rearmarían') + ' los dos grupos y su fixture (nada jugado todavía).'); }
    }
  }
  if (rearmarZ && APPLY) {
    await rearmarZonas(t, T, stages);
    ms = await prisma.match.findMany({ where: { tournamentId: t.id, hiddenAt: null }, include: { stage: true, teamA: true, teamB: true, sets: true } });
  }
  let rearmar = false;
  if (T.rearmarLlave) {
    const ko = ms.filter((x) => x.stage?.type === 'KNOCKOUT' && !x.stage.isPromotion);
    if (ko.some((x) => x.sets.length || x.status !== 'SCHEDULED')) console.log('  La llave ya tiene partidos jugados: no se rearma, se carga sobre lo que hay.');
    else { rearmar = true; console.log('  La llave actual no tiene la forma estándar (falta el 3er puesto o los cruces no coinciden): ' + (APPLY ? 'se rearma' : 'se rearmaría') + ' (1° y 2° directo a semis, 3° vs 6°, 4° vs 5°, final y 3er puesto). Todavía no se jugó nada ahí.'); }
  }
  if (rearmar && APPLY) {
    await rearmarLlave(t, T, stages);
    ms = await prisma.match.findMany({ where: { tournamentId: t.id, hiddenAt: null }, include: { stage: true, teamA: true, teamB: true, sets: true } });
  }
  const venues = await prisma.venue.findMany({ where: { deletedAt: null } });
  const usados = new Set();
  const plan = [];
  let faltan = 0;

  const buscar = async (tipo, a, b, hint) => {
    const ra = await resolveTeam(a), rb = await resolveTeam(b);
    if (!ra || !rb) { console.log(`  ${a} vs ${b}: no existe el equipo en la base`); return null; }
    const ok = (m) => !usados.has(m.id) && m.stage?.type === tipo && !m.stage.isPromotion;
    let m = ms.find((x) => ok(x) && ((x.teamAId === ra.id && x.teamBId === rb.id) || (x.teamAId === rb.id && x.teamBId === ra.id)));
    if (!m && hint) m = ms.find((x) => ok(x) && x.round === hint[0] && x.slot === hint[1]);
    if (!m) return null;
    usados.add(m.id);
    return { m, ra, rb };
  };

  for (const [fecha, dia, lista, zona] of T.liga) {
    for (const [a, b, pa, pb, hh, sede, diaPropio, cancha] of lista) {
      let r = rearmarZ && !APPLY ? null : await buscar('LEAGUE', a, b);
      if (!r && rearmarZ && !APPLY) {
        const ra = await resolveTeam(a), rb = await resolveTeam(b);
        if (ra && rb) r = { m: { id: null, teamAId: null, teamBId: null, sets: [], matchdayId: null }, ra, rb };
      }
      if (!r) { faltan++; console.log(`  Fecha ${fecha}: ${a} vs ${b}: NO se encontró el partido`); continue; }
      plan.push({ ...r, a, b, pa, pb, dia: diaPropio || dia, hh, sede, cancha, fecha, fechaDia: dia, etiqueta: 'Fecha ' + fecha + (zona ? ' Gr.' + zona : '') });
    }
  }
  for (const [ronda, slot, a, b, pa, pb, dia, hh, sede] of T.llave) {
    let r = await buscar('KNOCKOUT', a, b, [ronda, slot]);
    if (!r && rearmar && !APPLY) { // simulación: la llave todavía no existe, se muestra lo que se cargaría
      const ra = await resolveTeam(a), rb = await resolveTeam(b);
      if (ra && rb) r = { m: { id: null, teamAId: null, teamBId: null, sets: [], matchdayId: null }, ra, rb };
    }
    if (!r) { faltan++; console.log(`  Llave ronda ${ronda} #${slot}: ${a} vs ${b}: NO se encontró el partido`); continue; }
    plan.push({ ...r, a, b, pa, pb, dia, hh, sede, etiqueta: 'Llave r' + ronda + ' #' + slot });
  }
  if (faltan) {
    console.log('  Partidos de la base (para ver qué falta):');
    ms.filter((x) => !usados.has(x.id)).forEach((x) => console.log(`   - ${x.stage?.name} r${x.round ?? '-'} s${x.slot ?? '-'}: ${x.teamA?.name ?? '?'} vs ${x.teamB?.name ?? '?'} [${x.status}]`));
  }

  for (const p of plan) {
    const swap = p.m.teamAId !== p.ra.id;
    const vacio = !p.m.teamAId || !p.m.teamBId;
    const [ptsA, ptsB] = swap && !vacio ? [p.pb, p.pa] : [p.pa, p.pb];
    p.sinResultado = p.pa == null;
    p.sets = p.sinResultado ? [] : buildSets(T.modality, ptsA, ptsB);
    p.vacio = vacio;
    p.ptsA = ptsA; p.ptsB = ptsB;
    console.log(`  ${p.etiqueta}: ${p.a} ${p.sinResultado ? 'vs' : p.pa + '-' + p.pb} ${p.b} · ${p.dia || 'sin día nuevo'}${p.hh ? ' ' + p.hh : ''}${p.sede ? ' · ' + SEDES[p.sede].name : ''}${p.cancha ? ' · cancha ' + p.cancha : ''} · ${p.sinResultado ? 'sin jugar' : p.sets.length + ' sets (tenía ' + p.m.sets.length + ')'}${vacio ? ' · llena los equipos' : ''}`);
  }
  if (!APPLY) return;
  if (faltan) { console.log('  Faltan partidos: no se graba este torneo hasta resolverlo.'); return; }

  const vid = {};
  for (const k of Object.keys(SEDES)) if (plan.some((p) => p.sede === k)) vid[k] = await venueId(k, venues);
  const mdFecha = new Map();
  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      const m = p.m;
      const tA = p.vacio ? p.ra.id : m.teamAId, tB = p.vacio ? p.rb.id : m.teamBId;
      if (!p.sinResultado) await tx.matchSet.deleteMany({ where: { matchId: m.id } });
      if (!p.sinResultado) await tx.matchSet.createMany({ data: p.sets.map((s, i) => ({ matchId: m.id, number: i + 1, winnerTeamId: s.w === 'A' ? tA : s.w === 'B' ? tB : null, half: s.half, matchSecond: s.second })) });
      const data = p.sinResultado ? {} : { status: 'FINISHED' };
      if (p.vacio) { data.teamAId = tA; data.teamBId = tB; }
      if (p.cancha) data.court = p.cancha;
      if (p.dia) {
        const when = at(p.dia, p.hh);
        data.scheduledAt = when; data.timeSet = !!p.hh;
        if (!p.sinResultado) data.finishedAt = new Date(when.getTime() + 45 * 60000);
        if (p.sede) data.venueId = vid[p.sede];
      } else if (!p.sinResultado) data.finishedAt = m.finishedAt || new Date();
      if (Object.keys(data).length) await tx.match.update({ where: { id: m.id }, data });
      if (p.fecha && m.matchdayId) mdFecha.set(m.matchdayId, p.dia);
    }
    for (const p of plan) if (p.fecha && p.m.matchdayId && p.fechaDia && p.dia === p.fechaDia) await tx.matchday.update({ where: { id: p.m.matchdayId }, data: { date: at(p.dia, '12:00') } });
  }, { timeout: 120000, maxWait: 30000 });
  console.log('  Editado.');
}

(async () => {
  if ((process.env.DATABASE_URL || '').includes('ep-withered-grass')) throw new Error('Esto apunta a PRODUCCIÓN. Abortado.');
  console.log(APPLY ? '== GRABANDO ==' : '== SIMULACIÓN (no graba; usá --aplicar) ==');
  for (const T of TORNEOS) if (!solo || norm(T.nombre).includes(norm(solo))) await editar(T);
  console.log(APPLY ? '\nListo.' : '\nNada se grabó. Si está bien, corré con --aplicar.');
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
