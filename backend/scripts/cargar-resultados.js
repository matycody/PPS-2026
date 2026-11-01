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
    // Si el torneo no existe en esta base, se crea como torneo independiente (solo playoff) con estos datos
    crear: { branch: 'MIXED', modality: 'CLOTH', year: 2026, edition: 'Apertura', day: '2026-07-12', sede: { name: 'Club Almafuerte', address: 'Club Almafuerte' } },
    partidos: [ // [equipo A, equipo B, puntos A, puntos B, hora]
      ['Freestyle', 'Marvin', 8, 4, '13:00'],
      ['Berserker', 'PCH', 8, 20, '14:00'],
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

// Busca el equipo tolerando mayúsculas, tildes y errores de tipeo (ej: "Berserker" / "Berseker")
const norm = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function dist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
let TEAMS = null;
async function resolveTeam(name) {
  if (!TEAMS) TEAMS = await prisma.team.findMany({ select: { id: true, name: true } });
  const n = norm(name);
  const hit = TEAMS.find((t) => norm(t.name) === n) || TEAMS.find((t) => norm(t.name).includes(n) || n.includes(norm(t.name)))
    || TEAMS.map((t) => [t, dist(norm(t.name), n)]).filter(([, d]) => d <= 2).sort((a, b) => a[1] - b[1]).map(([t]) => t)[0];
  if (hit && hit.name.toLowerCase() !== String(name).toLowerCase()) console.log(`  (el equipo "${name}" figura en la base como "${hit.name}")`);
  return hit || null;
}

// Crea el torneo independiente (solo playoff): equipos inscriptos, una etapa de eliminación y sus partidos ya finalizados
async function crearTorneo(b) {
  const c = b.crear;
  const names = [...new Set(b.partidos.flatMap((p) => [p[0], p[1]]))];
  const teams = [];
  for (const n of names) {
    const tm = await resolveTeam(n);
    if (!tm) { console.log('\nNo existe el equipo "' + n + '" en esta base: no se puede crear ' + b.torneo); return null; }
    teams.push({ ...tm, alias: n });
  }
  console.log('\n' + b.torneo + ' no existe: ' + (APPLY ? 'se crea' : 'se crearía') + ' (' + c.branch + ' ' + c.modality + ', ' + names.length + ' equipos, ' + b.partidos.length + ' partidos, ' + c.day + ')');
  if (!APPLY) {
    for (const [na, nb, pa, pb, hh] of b.partidos) {
      const sets = buildSets(c.modality, pa, pb);
      console.log(`  ${na} ${pa} - ${pb} ${nb} (${hh}): ${sets.length} sets`);
    }
    return null;
  }
  let venue = await prisma.venue.findFirst({ where: { deletedAt: null, name: { contains: c.sede.name, mode: 'insensitive' } } });
  if (!venue) venue = await prisma.venue.create({ data: { name: c.sede.name, address: c.sede.address } });
  const at = (hh) => new Date(c.day + 'T' + hh + ':00-03:00');
  return prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: { name: b.torneo, branch: c.branch, modality: c.modality, year: c.year, edition: c.edition, format: 'CUP', status: 'FINISHED', startsAt: at('00:00'), endsAt: at('23:59') },
    });
    await tx.tournamentTeam.createMany({ data: teams.map((tm) => ({ tournamentId: t.id, teamId: tm.id })) });
    const stage = await tx.stage.create({ data: { tournamentId: t.id, name: 'Promoción', type: 'LEAGUE', phase: 1 } });
    const md = await tx.matchday.create({ data: { stageId: stage.id, number: 1, date: at('12:00') } });
    await tx.stageTeam.createMany({ data: teams.map((tm, i) => ({ stageId: stage.id, teamId: tm.id, seed: i + 1 })) });
    for (const [i, [na, nb, , , hh]] of b.partidos.entries()) {
      const ta = teams.find((x) => x.alias === na);
      const tb = teams.find((x) => x.alias === nb);
      await tx.match.create({
        data: { tournamentId: t.id, stageId: stage.id, matchdayId: md.id, branch: c.branch, modality: c.modality, status: 'FINISHED', teamAId: ta.id, teamBId: tb.id, scheduledAt: at(hh), timeSet: true, finishedAt: new Date(at(hh).getTime() + 45 * 60000), venueId: venue.id },
      });
    }
    return t;
  });
}

// Si el torneo ya se había creado como llave (marcador en sets 4-2), lo pasa a una fecha de liga: así se ve el marcador en puntos (8-4)
async function ensureLeague(t, b) {
  const stages = await prisma.stage.findMany({ where: { tournamentId: t.id }, include: { matchdays: true } });
  const st = stages.find((x) => x.type === 'KNOCKOUT' && !x.matchdays.length);
  if (!st) return;
  console.log(`  El torneo estaba armado como llave: ${APPLY ? 'se pasa' : 'se pasaría'} a una fecha de liga para mostrar los puntos`);
  if (!APPLY) return;
  const day = b.crear?.day || new Date().toLocaleDateString('en-CA');
  await prisma.$transaction(async (tx) => {
    await tx.stage.update({ where: { id: st.id }, data: { type: 'LEAGUE', name: 'Promoción' } });
    const md = await tx.matchday.create({ data: { stageId: st.id, number: 1, date: new Date(day + 'T12:00:00-03:00') } });
    await tx.match.updateMany({ where: { stageId: st.id }, data: { matchdayId: md.id, round: null, slot: null } });
  });
}

async function main() {
  if ((process.env.DATABASE_URL || '').includes('ep-withered-grass')) throw new Error('Esto apunta a PRODUCCIÓN. Abortado.');
  console.log(APPLY ? '== GRABANDO ==' : '== SIMULACIÓN (no graba; usá --aplicar) ==');
  for (const bloque of RESULTADOS) {
    let t = await prisma.tournament.findFirst({ where: { deletedAt: null, name: { equals: bloque.torneo, mode: 'insensitive' } } });
    if (!t && bloque.crear) t = await crearTorneo(bloque);
    if (!t && bloque.crear && !APPLY) continue;
    if (!t) {
      const all = await prisma.tournament.findMany({ where: { deletedAt: null }, select: { name: true, status: true }, orderBy: { name: 'asc' } });
      console.log('\nNo existe el torneo: ' + bloque.torneo + '\nTorneos que hay en esta base (' + all.length + '):');
      all.forEach((x) => console.log('  - ' + x.name + ' [' + x.status + ']'));
      continue;
    }
    console.log('\n' + t.name);
    await ensureLeague(t, bloque);
    for (const [na, nb, pa, pb] of bloque.partidos) {
      const ra = await resolveTeam(na), rb = await resolveTeam(nb);
      const m = ra && rb && await prisma.match.findFirst({
        where: {
          tournamentId: t.id, hiddenAt: null,
          OR: [{ teamAId: ra.id, teamBId: rb.id }, { teamAId: rb.id, teamBId: ra.id }],
        },
        include: { teamA: true, teamB: true, sets: true },
      });
      if (!m) { console.log(`  ${na} vs ${nb}: no se encontró el partido`); continue; }
      const swap = m.teamAId !== ra.id; // el partido está guardado al revés
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
