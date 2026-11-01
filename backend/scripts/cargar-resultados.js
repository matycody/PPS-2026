// Carga resultados de partidos de PRUEBA generando los sets al azar hasta llegar al marcador pedido.
//   Simular (no graba):  node scripts/cargar-resultados.js
//   Grabar:              node scripts/cargar-resultados.js --aplicar          (opcional: --seed 7 para repetir el mismo azar)
// Los totales son los reales; el orden y el momento de cada set son inventados pero realistas
// (cada tiempo dura 20:00, un set dura al menos ~70 s). Si el partido ya tenía sets, se reemplazan.
require('dotenv').config();
const prisma = require('../src/db');

// Un bloque por torneo. Cada partido: [equipo A, equipo B, puntos A, puntos B] (el orden local/visitante da igual).
const RESULTADOS = [
  {
    torneo: 'Promoción Mixto Foam y Cloth - Apertura 2026',
    partidos: [
      ['Freestyle', 'Marvin', 8, 4],
      ['Berserker', 'PCH', 8, 20],
    ],
  },
];

const APPLY = process.argv.includes('--aplicar');
const si = process.argv.indexOf('--seed');
let seed = si > -1 ? Number(process.argv[si + 1]) || 1 : Date.now() % 2147483646 || 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const HALF = 1200, MIN_GAP = 70;

// Devuelve [{ w: 'A'|'B'|null, half, second }] cuyos puntos suman exactamente (pa, pb)
function buildSets(modality, pa, pb) {
  let wa, wb, ties = 0;
  if (modality === 'CLOTH') { // ganar un set vale 2, un set empatado vale 1 a cada uno
    if ((pa - pb) % 2) throw new Error('En Cloth la diferencia de puntos no puede ser impar (' + pa + '-' + pb + ')');
    const maxTies = Math.min(pa, pb);
    ties = pa % 2 === 0 ? 0 : 1; // con puntos impares hace falta al menos un empate
    if (ties > maxTies) throw new Error('Marcador imposible en Cloth');
    if (rnd() < 0.3 && maxTies - ties >= 2) ties += 2; // a veces un empate extra
    wa = (pa - ties) / 2; wb = (pb - ties) / 2;
  } else { wa = pa; wb = pb; }
  const seq = shuffle([...Array(wa).fill('A'), ...Array(wb).fill('B'), ...Array(ties).fill(null)]);
  const n = seq.length;
  const total = 2 * HALF;
  if (n * MIN_GAP > total) throw new Error('Son ' + n + ' sets: no entran en 2 tiempos de 20 minutos (¿es Foam? revisá el marcador)');
  // Momentos en que se decide cada set: crecientes, separados al menos MIN_GAP, y el último cerca del final
  let t = 0;
  const slack = total - n * MIN_GAP - 60;
  const cuts = Array.from({ length: n }, () => rnd()).sort((x, y) => x - y);
  return seq.map((w, i) => {
    t = Math.min(total - 1, Math.round((i + 1) * MIN_GAP + cuts[i] * slack));
    return { w, half: t < HALF ? 1 : 2, second: t < HALF ? t : t - HALF };
  });
}

async function main() {
  if ((process.env.DATABASE_URL || '').includes('ep-withered-grass')) throw new Error('Esto apunta a PRODUCCIÓN. Abortado.');
  console.log(APPLY ? '== GRABANDO ==' : '== SIMULACIÓN (no graba; usá --aplicar) ==');
  for (const bloque of RESULTADOS) {
    const t = await prisma.tournament.findFirst({ where: { deletedAt: null, name: { equals: bloque.torneo, mode: 'insensitive' } } });
    if (!t) {
      const all = await prisma.tournament.findMany({ where: { deletedAt: null }, select: { name: true, status: true }, orderBy: { name: 'asc' } });
      console.log('\nNo existe el torneo: ' + bloque.torneo + '\nTorneos que hay en esta base (' + all.length + '):');
      all.forEach((x) => console.log('  - ' + x.name + ' [' + x.status + ']'));
      continue;
    }
    console.log('\n' + t.name);
    for (const [na, nb, pa, pb] of bloque.partidos) {
      const m = await prisma.match.findFirst({
        where: {
          tournamentId: t.id, hiddenAt: null,
          OR: [
            { teamA: { name: { equals: na, mode: 'insensitive' } }, teamB: { name: { equals: nb, mode: 'insensitive' } } },
            { teamA: { name: { equals: nb, mode: 'insensitive' } }, teamB: { name: { equals: na, mode: 'insensitive' } } },
          ],
        },
        include: { teamA: true, teamB: true, sets: true },
      });
      if (!m) { console.log(`  ${na} vs ${nb}: no se encontró el partido`); continue; }
      const swap = m.teamA.name.toLowerCase() !== na.toLowerCase(); // el partido está guardado al revés
      const [ptsA, ptsB] = swap ? [pb, pa] : [pa, pb];
      let sets;
      try { sets = buildSets(m.modality, ptsA, ptsB); } catch (e) { console.log(`  ${m.teamA.name} vs ${m.teamB.name}: ${e.message}`); continue; }
      const wins = (k) => sets.filter((s) => s.w === k).length;
      const ties = sets.filter((s) => s.w === null).length;
      console.log(`  ${m.teamA.name} ${ptsA} - ${ptsB} ${m.teamB.name} (${m.modality}): ${sets.length} sets · ${wins('A')} ${m.teamA.name}, ${wins('B')} ${m.teamB.name}${ties ? ', ' + ties + ' empatados' : ''} · tenía ${m.sets.length} sets`);
      if (!APPLY) continue;
      await prisma.$transaction(async (tx) => {
        await tx.matchSet.deleteMany({ where: { matchId: m.id } });
        await tx.matchSet.createMany({
          data: sets.map((s, i) => ({ matchId: m.id, number: i + 1, winnerTeamId: s.w === 'A' ? m.teamAId : s.w === 'B' ? m.teamBId : null, half: s.half, matchSecond: s.second })),
        });
        if (m.status !== 'FINISHED') await tx.match.update({ where: { id: m.id }, data: { status: 'FINISHED', finishedAt: m.scheduledAt ? new Date(m.scheduledAt.getTime() + 45 * 60000) : new Date() } });
      });
    }
  }
  console.log(APPLY ? '\nListo.' : '\nNada se grabó. Si está bien, corré con --aplicar.');
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
module.exports = { buildSets };
