// EDITA torneos que ya existen en la base (no crea ni borra torneos): carga día, hora, sede y resultado de cada partido.
//   Simular:  node scripts/editar-torneo.js              (muestra qué partido encontró y la tabla para controlar)
//   Grabar:   node scripts/editar-torneo.js --aplicar    (opcional: --seed 7)
//   Un solo torneo: --solo femenino   (texto que esté en el nombre)
// Los marcadores son los reales; el orden de los sets es inventado (2 tiempos de 20:00). No cambia el estado del torneo.
require('dotenv').config();
const prisma = require('../src/db');
const { buildSets, resolveTeam } = require('./cargar-resultados');

const SEDES = {
  mupol: { token: 'mupol', name: 'Mupol Voley', address: 'Av. Juan de Garay 3127, CABA' },
  lamadrid: { token: 'lamadrid', name: 'Club Gral. Lamadrid', address: 'Club Gral. Lamadrid' },
  almafuerte: { token: 'almafuerte', name: 'Club Almafuerte', address: 'Club Almafuerte' },
  glow: { token: 'glow', name: 'Glow, Floresta', address: 'Glow, Floresta, CABA' },
  moran: { token: 'clubmoran', name: 'Club Morán', address: 'Club Morán' },
};

// liga: [fecha, día, [[local, visitante, pts local, pts visitante, hora|null, sede|null, día propio (pospuestos)]]]
// llave: [ronda, slot, local, visitante, pts local, pts visitante, día|null, hora|null, sede|null]  (ronda 1 = cuartos, 2 = semis, 3 = final)
const TORNEOS = [
  {
    nombre: 'Femenino Cloth 2026', buscar: ['femenino', 'cloth'], modality: 'CLOTH',
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
      [1, 2, 'Noazar', 'Riestra by Pch', 17, 11, '2026-08-30', '16:00', 'moran'],
      [1, 4, 'Marvin', 'Berserker', 9, 25, '2026-08-30', '15:00', 'moran'],
      [2, 1, 'Hydra', 'Noazar', 24, 6, '2026-10-04', '12:00', 'lamadrid'],
      [2, 2, 'Panthers', 'Berserker', 18, 16, '2026-10-04', '15:00', 'lamadrid'],
      [3, 1, 'Hydra', 'Panthers', 17, 15, null, null, null],
      [3, 2, 'Noazar', 'Berserker', 13, 15, null, null, null], // 3er y 4to puesto
    ],
  },
  {
    nombre: 'Femenino Foam 2026', buscar: ['femenino', 'foam'], modality: 'FOAM',
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
      [1, 2, 'Hydra', 'Noazar', 10, 4, '2026-09-13', '15:00', 'lamadrid'],
      [1, 3, 'Panthers', 'Riestra by Pch', 9, 5, '2026-09-13', '14:00', 'lamadrid'],
      [2, 1, 'Marvin', 'Hydra', 9, 7, '2026-10-04', '16:00', 'lamadrid'],
      [2, 2, 'Panthers', 'Berserker', 7, 6, '2026-10-04', '17:00', 'lamadrid'],
      [3, 1, 'Marvin', 'Panthers', 13, 7, null, null, null],
      [3, 2, 'Hydra', 'Berserker', 4, 10, null, null, null], // 3er y 4to puesto
    ],
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

function tabla(T) {
  const rows = new Map();
  const row = (n) => { if (!rows.has(n)) rows.set(n, { n, pts: 0, pj: 0, g: 0, e: 0, p: 0, f: 0, c: 0 }); return rows.get(n); };
  for (const [, , ms] of T.liga) for (const [a, b, pa, pb] of ms) {
    const A = row(a), B = row(b);
    A.pj++; B.pj++; A.f += pa; A.c += pb; B.f += pb; B.c += pa;
    if (pa === pb) { A.e++; B.e++; A.pts++; B.pts++; } else if (pa > pb) { A.g++; B.p++; A.pts += 3; } else { B.g++; A.p++; B.pts += 3; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.f - y.c) - (x.f - x.c));
}

async function editar(T) {
  console.log('\n' + T.nombre);
  const all = await prisma.tournament.findMany({ where: { deletedAt: null }, select: { id: true, name: true, status: true } });
  const cand = all.filter((t) => T.buscar.every((w) => norm(t.name).includes(norm(w))));
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
  console.log('  Tabla esperada (3 por victoria, 1 por empate) para controlar contra la web:');
  tabla(T).forEach((r, i) => console.log(`    ${i + 1}. ${r.n.padEnd(16)} ${String(r.pts).padStart(2)} pts  J${r.pj} G${r.g} E${r.e} P${r.p}  ${r.f}-${r.c}`));

  const ms = await prisma.match.findMany({ where: { tournamentId: t.id, hiddenAt: null }, include: { stage: true, teamA: true, teamB: true, sets: true } });
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

  for (const [fecha, dia, lista] of T.liga) {
    for (const [a, b, pa, pb, hh, sede, diaPropio] of lista) {
      const r = await buscar('LEAGUE', a, b);
      if (!r) { faltan++; console.log(`  Fecha ${fecha}: ${a} vs ${b}: NO se encontró el partido`); continue; }
      plan.push({ ...r, a, b, pa, pb, dia: diaPropio || dia, hh, sede, fecha, etiqueta: 'Fecha ' + fecha });
    }
  }
  for (const [ronda, slot, a, b, pa, pb, dia, hh, sede] of T.llave) {
    const r = await buscar('KNOCKOUT', a, b, [ronda, slot]);
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
    p.sets = buildSets(T.modality, ptsA, ptsB);
    p.vacio = vacio;
    p.ptsA = ptsA; p.ptsB = ptsB;
    console.log(`  ${p.etiqueta}: ${p.a} ${p.pa}-${p.pb} ${p.b} · ${p.dia || 'sin día nuevo'}${p.hh ? ' ' + p.hh : ''}${p.sede ? ' · ' + SEDES[p.sede].name : ''} · ${p.sets.length} sets (tenía ${p.m.sets.length})${vacio ? ' · llena los equipos' : ''}`);
  }
  if (!APPLY) return;
  if (faltan) { console.log('  Faltan partidos: no se graba este torneo hasta resolverlo.'); return; }

  const vid = {};
  for (const k of Object.keys(SEDES)) if (plan.some((p) => p.sede === k)) vid[k] = await venueId(k, venues);
  const mdFecha = new Map();
  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      const m = p.m;
      await tx.matchSet.deleteMany({ where: { matchId: m.id } });
      const tA = p.vacio ? p.ra.id : m.teamAId, tB = p.vacio ? p.rb.id : m.teamBId;
      await tx.matchSet.createMany({ data: p.sets.map((s, i) => ({ matchId: m.id, number: i + 1, winnerTeamId: s.w === 'A' ? tA : s.w === 'B' ? tB : null, half: s.half, matchSecond: s.second })) });
      const data = { status: 'FINISHED' };
      if (p.vacio) { data.teamAId = tA; data.teamBId = tB; }
      if (p.dia) {
        const when = at(p.dia, p.hh);
        data.scheduledAt = when; data.timeSet = !!p.hh;
        data.finishedAt = new Date(when.getTime() + 45 * 60000);
        if (p.sede) data.venueId = vid[p.sede];
      } else data.finishedAt = m.finishedAt || new Date();
      await tx.match.update({ where: { id: m.id }, data });
      if (p.fecha && m.matchdayId) mdFecha.set(m.matchdayId, p.dia);
    }
    for (const p of plan) if (p.fecha && p.m.matchdayId && p.dia === T.liga.find((f) => f[0] === p.fecha)[1]) await tx.matchday.update({ where: { id: p.m.matchdayId }, data: { date: at(p.dia, '12:00') } });
  }, { timeout: 120000, maxWait: 30000 });
  console.log('  Editado.');
}

(async () => {
  if ((process.env.DATABASE_URL || '').includes('ep-withered-grass')) throw new Error('Esto apunta a PRODUCCIÓN. Abortado.');
  console.log(APPLY ? '== GRABANDO ==' : '== SIMULACIÓN (no graba; usá --aplicar) ==');
  for (const T of TORNEOS) if (!solo || norm(T.nombre).includes(norm(solo))) await editar(T);
  console.log(APPLY ? '\nListo.' : '\nNada se grabó. Si está bien, corré con --aplicar.');
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
