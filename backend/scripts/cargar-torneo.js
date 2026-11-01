// Carga un torneo COMPLETO de prueba (zonas, fechas con su día y sede, resultados con sets al azar y cruce de promoción).
//   Simular:  node scripts/cargar-torneo.js
//   Grabar:   node scripts/cargar-torneo.js --aplicar          (opcional: --seed 7)
//   Rehacer:  node scripts/cargar-torneo.js --aplicar --rehacer  (borra ese torneo en la base de desarrollo y lo vuelve a cargar)
// Los marcadores son los reales; el orden de los sets es inventado pero respeta los 2 tiempos de 20:00.
// El torneo queda ACTIVO: cerralo desde la web (Cerrar torneo) para congelar la tabla y probar ese flujo.
require('dotenv').config();
const prisma = require('../src/db');
const { buildSets, resolveTeam } = require('./cargar-resultados');

const SEDES = {
  besada: { name: 'Club Villa Besada', address: 'Club Villa Besada' },
  mupol: { name: 'Mupol Voley', address: 'Av. Juan de Garay 3127, CABA' },
  orione: { name: 'Polideportivo Don Orione', address: 'Av. Eva Perón 780, Don Orione' },
  pueyrredon: { name: 'Club Social Atlético Pueyrredón', address: 'Prilidiano Pueyrredón 1320, Burzaco' },
  sanfer: { name: 'Polideportivo N°8 San Fernando', address: 'French 1500, San Fernando' },
  almafuerte: { name: 'Club Almafuerte', address: 'Club Almafuerte' },
};

const L = 'Linces By Pueyrredón', OB = 'Old Blue';
const TORNEOS = [
  {
    nombre: 'Mixto Foam - Apertura 2026', branch: 'MIXED', modality: 'FOAM', year: 2026, edition: 'Apertura', desde: '2026-03-08', hasta: '2026-07-12',
    zonas: [
      { nombre: 'Grupo A', tier: 1, desc: 1, playoff: [4], equipos: ['Hydra', 'Panthers', 'Noazar', 'Freestyle', 'Berserker'] }, // el último desciende; el anteúltimo juega la promoción
      { nombre: 'Grupo B', tier: 2, asc: 1, playoff: [3], equipos: ['PCH', L, 'Marvin', 'Lamadrid', 'Hokory', 'Morán', OB] }, // el primero asciende; en este torneo la promoción la jugó el 3° (Marvin)
    ],
    // [zona, número de fecha, día, sede, [[local, visitante, puntos local, puntos visitante, hora]]]
    fechas: [
      ['A', 1, '2026-03-08', null, [['Freestyle', 'Panthers', 3, 7, '15:00'], ['Berserker', 'Hydra', 4, 7, '16:00']]],
      ['A', 2, '2026-03-29', 'besada', [['Berserker', 'Noazar', 5, 6, '11:00'], ['Hydra', 'Panthers', 6, 5, '12:00']]],
      ['A', 3, '2026-04-19', 'mupol', [['Hydra', 'Freestyle', 8, 4, '11:00'], ['Panthers', 'Noazar', 8, 3, '12:00']]],
      ['A', 4, '2026-05-17', 'orione', [['Noazar', 'Freestyle', 10, 6, '10:00'], ['Panthers', 'Berserker', 5, 3, '11:00']]],
      ['A', 5, '2026-06-07', 'sanfer', [['Noazar', 'Hydra', 4, 9, '10:00'], ['Freestyle', 'Berserker', 10, 3, '11:00']]],
      ['B', 1, '2026-03-08', null, [[OB, 'Hokory', 3, 10, '08:45'], ['PCH', 'Morán', 11, 2, '12:00'], [L, 'Lamadrid', 7, 4, '14:00']]],
      ['B', 2, '2026-03-29', 'besada', [['PCH', 'Lamadrid', 8, 4, '13:00'], [OB, 'Marvin', 1, 20, '17:00'], ['Morán', 'Hokory', 8, 4, '18:00']]],
      ['B', 3, '2026-04-19', 'mupol', [['Morán', 'Marvin', 6, 9, '11:00'], ['PCH', L, 5, 5, '12:00'], ['Hokory', 'Lamadrid', 6, 9, '13:00']]],
      ['B', 4, '2026-05-17', 'orione', [['Hokory', L, 5, 4, '10:00'], ['Lamadrid', 'Marvin', 6, 12, '11:00'], ['Morán', OB, 12, 4, '12:00']]],
      ['B', 5, '2026-05-31', 'pueyrredon', [['Hokory', 'PCH', 6, 3, '11:00'], ['Lamadrid', OB, 21, 2, '12:00'], ['Marvin', L, 7, 9, '13:00']]],
      ['B', 6, '2026-05-31', 'pueyrredon', [['Lamadrid', 'Morán', 9, 5, '14:00'], ['Marvin', 'PCH', 5, 10, '15:00'], [L, OB, 19, 4, '16:00']]],
      ['B', 7, '2026-06-07', 'sanfer', [[L, 'Morán', 4, 3, '10:00'], [OB, 'PCH', 0, 9, '11:00'], ['Marvin', 'Hokory', 12, 5, '12:00']]],
    ],
    // Cruce de promoción, con el resultado que se jugó. [zona, puesto, equipo] contra [zona, puesto, equipo], hora, puntos del primero y del segundo
    promocion: { dia: '2026-07-12', sede: 'almafuerte', cruces: [[['A', 4, 'Freestyle'], ['B', 3, 'Marvin'], '13:00', 8, 4]] }, // Berserker vs PCH es la promoción del Mixto Cloth (otro torneo)
  },
  {
    nombre: 'Mixto Cloth - Apertura 2026', branch: 'MIXED', modality: 'CLOTH', year: 2026, edition: 'Apertura', desde: '2026-03-08', hasta: '2026-07-12',
    zonas: [
      { nombre: 'Grupo A', tier: 1, desc: 1, playoff: [4], equipos: ['Panthers', 'Noazar', 'Hydra', 'PCH', 'Freestyle'] },
      { nombre: 'Grupo B', tier: 2, asc: 1, playoff: [2], equipos: ['Lamadrid', 'Berserker', 'Morán', 'Marvin', L, 'Hokory'] },
    ],
    fechas: [
      ['B', 1, '2026-03-08', null, [[L, 'Morán', 15, 15, '10:00'], ['Lamadrid', 'Berserker', 16, 16, '11:00'], ['Hokory', 'Marvin', 8, 22, '13:00']]],
      ['A', 1, '2026-03-08', null, [['Freestyle', 'Noazar', 4, 36, '17:00'], ['PCH', 'Hydra', 12, 16, '18:00']]],
      ['A', 2, '2026-03-29', 'besada', [['Hydra', 'Noazar', 12, 24, '08:45'], ['PCH', 'Panthers', 20, 10, '10:00']]],
      ['B', 2, '2026-03-29', 'besada', [['Berserker', 'Marvin', 14, 20, '14:00'], [L, 'Hokory', 15, 15, '15:00'], ['Lamadrid', 'Morán', 19, 15, '16:00']]],
      ['A', 3, '2026-04-19', 'mupol', [['Hydra', 'Freestyle', 32, 4, '13:00'], ['Noazar', 'Panthers', 6, 28, '14:00']]],
      ['B', 3, '2026-04-19', 'mupol', [['Marvin', 'Morán', 17, 21, '14:00'], [L, 'Lamadrid', 11, 21, '15:00'], ['Berserker', 'Hokory', 31, 7, '15:00']]],
      ['A', 4, '2026-05-17', 'orione', [['Noazar', 'PCH', 16, 12, '12:00'], ['Panthers', 'Freestyle', 22, 14, '13:00']]],
      ['B', 4, '2026-05-17', 'orione', [[L, 'Berserker', 13, 15, '13:00'], ['Marvin', 'Lamadrid', 19, 21, '14:00'], ['Morán', 'Hokory', 16, 12, '14:00']]],
      ['A', 5, '2026-06-07', 'sanfer', [['Panthers', 'Hydra', 24, 12, '12:00'], ['Freestyle', 'PCH', 3, 27, '13:00']]],
      ['B', 5, '2026-06-07', 'sanfer', [['Morán', 'Berserker', 14, 20, '13:00'], ['Hokory', 'Lamadrid', 7, 29, '14:00'], [L, 'Marvin', 20, 14, '14:00']]],
    ],
    // Promoción: 4° del Grupo A (PCH) vs 2° del Grupo B (Berserker)
    promocion: { dia: '2026-07-12', sede: 'almafuerte', cruces: [[['A', 4, 'PCH'], ['B', 2, 'Berserker'], '14:00', 20, 8]] },
  },
];

const APPLY = process.argv.includes('--aplicar');
const REHACER = process.argv.includes('--rehacer');
const at = (day, hh) => new Date(day + 'T' + hh + ':00-03:00');
const norm = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Tabla de la zona con los marcadores (3 por victoria, 1 por empate) para controlar contra la web
function tabla(t, zona) {
  const rows = new Map(zona.equipos.map((n) => [n, { n, pts: 0, pj: 0, g: 0, e: 0, p: 0, f: 0, c: 0 }]));
  for (const [z, , , , ms] of t.fechas) {
    if (z !== zona.nombre.slice(-1)) continue;
    for (const [a, b, pa, pb] of ms) {
      const A = rows.get(a), B = rows.get(b);
      if (!A || !B) throw new Error('Equipo fuera de la zona: ' + a + ' / ' + b);
      A.pj++; B.pj++; A.f += pa; A.c += pb; B.f += pb; B.c += pa;
      if (pa === pb) { A.e++; B.e++; A.pts++; B.pts++; } else if (pa > pb) { A.g++; B.p++; A.pts += 3; } else { B.g++; A.p++; B.pts += 3; }
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.f - y.c) - (x.f - x.c));
}

async function venue(key) {
  if (!key) return null;
  const v = SEDES[key];
  const all = await prisma.venue.findMany({ where: { deletedAt: null } });
  const hit = all.find((x) => norm(x.name) === norm(v.name));
  if (hit) return hit;
  if (!APPLY) return { id: null, name: v.name };
  return prisma.venue.create({ data: { name: v.name, address: v.address } });
}

async function borrar(t) {
  const ids = (await prisma.match.findMany({ where: { tournamentId: t.id }, select: { id: true } })).map((m) => m.id);
  await prisma.$transaction(async (tx) => {
    await tx.matchSet.deleteMany({ where: { matchId: { in: ids } } });
    await tx.match.deleteMany({ where: { tournamentId: t.id } });
    const stages = (await tx.stage.findMany({ where: { tournamentId: t.id }, select: { id: true } })).map((s) => s.id);
    await tx.stageStanding.deleteMany({ where: { stageId: { in: stages } } });
    await tx.stageTeam.deleteMany({ where: { stageId: { in: stages } } });
    await tx.matchday.deleteMany({ where: { stageId: { in: stages } } });
    await tx.stage.deleteMany({ where: { tournamentId: t.id } });
    await tx.tournamentTeam.deleteMany({ where: { tournamentId: t.id } });
    await tx.tournament.delete({ where: { id: t.id } });
  }, { timeout: 60000 });
}

async function cargar(T) {
  console.log('\n' + T.nombre);
  const existing = await prisma.tournament.findFirst({ where: { deletedAt: null, name: { equals: T.nombre, mode: 'insensitive' } } });
  if (existing && !REHACER) { console.log('  Ya existe en esta base. Usá --rehacer (con --aplicar) para borrarlo y volver a cargarlo.'); return; }

  // Equipos de la base
  const team = new Map();
  for (const z of T.zonas) for (const n of z.equipos) {
    const tm = await resolveTeam(n);
    if (!tm) { console.log('  No existe el equipo "' + n + '" en esta base: no se carga el torneo.'); return; }
    team.set(n, tm);
  }
  const nMatches = T.fechas.reduce((n, f) => n + f[4].length, 0);
  console.log(`  ${T.zonas.length} zonas, ${team.size} equipos, ${T.fechas.length} fechas, ${nMatches} partidos${T.promocion ? ' + ' + T.promocion.cruces.length + ' de promoción (' + T.promocion.cruces.map((c) => c[0][2] + ' ' + c[3] + '-' + c[4] + ' ' + c[1][2]).join(', ') + ')' : ''}`);
  for (const z of T.zonas) {
    console.log('  ' + z.nombre + ' (control contra la web)' + (z.asc ? ' · asciende el 1°' : '') + (z.desc ? ' · desciende el último' : '') + (z.playoff ? ' · promoción: puesto ' + z.playoff.join(', ') : '') + ':');
    tabla(T, z).forEach((r, i) => console.log(`    ${i + 1}. ${r.n.padEnd(22)} ${String(r.pts).padStart(2)} pts  J${r.pj} G${r.g} E${r.e} P${r.p}  ${r.f}-${r.c}`));
  }
  if (existing) console.log('  (se borra el torneo existente y se vuelve a cargar)');
  if (!APPLY) return;
  if (existing) await borrar(existing);

  const ven = {};
  for (const k of Object.keys(SEDES)) ven[k] = await venue(k);
  await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: { name: T.nombre, branch: T.branch, modality: T.modality, year: T.year, edition: T.edition, format: 'LEAGUE_CUP', status: 'ACTIVE', startsAt: at(T.desde, '00:00'), endsAt: at(T.hasta, '23:59') },
    });
    await tx.tournamentTeam.createMany({ data: [...team.values()].map((x) => ({ tournamentId: t.id, teamId: x.id })) });
    const stage = {};
    for (const z of T.zonas) {
      const key = z.nombre.slice(-1);
      stage[key] = await tx.stage.create({ data: { tournamentId: t.id, name: z.nombre, type: 'LEAGUE', phase: 1, tier: z.tier, promotions: z.asc || 0, relegations: z.desc || 0, playoffPositions: z.playoff || [] } });
      await tx.stageTeam.createMany({ data: z.equipos.map((n, i) => ({ stageId: stage[key].id, teamId: team.get(n).id, seed: i + 1 })) });
    }
    for (const [z, num, day, sede, ms] of T.fechas) {
      const md = await tx.matchday.create({ data: { stageId: stage[z].id, number: num, date: at(day, '12:00') } });
      for (const [a, b, pa, pb, hh] of ms) {
        const m = await tx.match.create({
          data: {
            tournamentId: t.id, stageId: stage[z].id, matchdayId: md.id, branch: T.branch, modality: T.modality, status: 'FINISHED',
            teamAId: team.get(a).id, teamBId: team.get(b).id, scheduledAt: at(day, hh), timeSet: true, finishedAt: new Date(at(day, hh).getTime() + 45 * 60000), venueId: ven[sede]?.id ?? null,
          },
        });
        const sets = buildSets(T.modality, pa, pb);
        await tx.matchSet.createMany({ data: sets.map((s, i) => ({ matchId: m.id, number: i + 1, winnerTeamId: s.w === 'A' ? m.teamAId : s.w === 'B' ? m.teamBId : null, half: s.half, matchSecond: s.second })) });
      }
    }
    if (T.promocion) {
      const p = T.promocion;
      const ps = await tx.stage.create({ data: { tournamentId: t.id, name: 'Playoff de ascenso/permanencia', type: 'KNOCKOUT', phase: 2, isPromotion: true } });
      for (const [i, [x, y, hh, pa, pb]] of p.cruces.entries()) {
        const m = await tx.match.create({
          data: {
            tournamentId: t.id, stageId: ps.id, round: 1, slot: i + 1, branch: T.branch, modality: T.modality, status: 'FINISHED',
            teamAId: team.get(x[2]).id, teamBId: team.get(y[2]).id, scheduledAt: at(p.dia, hh), timeSet: true, finishedAt: new Date(at(p.dia, hh).getTime() + 45 * 60000), venueId: ven[p.sede]?.id ?? null,
            teamAFrom: { stageId: stage[x[0]].id, position: x[1] }, teamBFrom: { stageId: stage[y[0]].id, position: y[1] },
          },
        });
        const sets = buildSets(T.modality, pa, pb);
        await tx.matchSet.createMany({ data: sets.map((q, k) => ({ matchId: m.id, number: k + 1, winnerTeamId: q.w === 'A' ? m.teamAId : q.w === 'B' ? m.teamBId : null, half: q.half, matchSecond: q.second })) });
      }
      await tx.stageTeam.createMany({ data: p.cruces.flatMap(([x, y]) => [x, y]).map((q) => ({ stageId: ps.id, teamId: team.get(q[2]).id, entryRound: 1 })) });
    }
  }, { timeout: 120000, maxWait: 30000 });
  console.log('  Cargado.');
}

if (require.main === module) {
  (async () => {
    if ((process.env.DATABASE_URL || '').includes('ep-withered-grass')) throw new Error('Esto apunta a PRODUCCIÓN. Abortado.');
    console.log(APPLY ? '== GRABANDO ==' : '== SIMULACIÓN (no graba; usá --aplicar) ==');
    for (const T of TORNEOS) await cargar(T);
    console.log(APPLY ? '\nListo.' : '\nNada se grabó. Si está bien, corré con --aplicar.');
  })().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
module.exports = { TORNEOS, tabla };
