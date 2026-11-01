// Pone el día (y la sede) de cada fecha de los torneos según el "Calendario de competencias y torneos 2026".
//   Simular (no graba):  node scripts/calendario-2026.js
//   Grabar:              node scripts/calendario-2026.js --aplicar
//   Incluir fechas ya pasadas:  --todo
// Hace lo mismo que cambiar el día de la jornada en Estructura › Calendario: mueve solo los partidos que seguían en el día
// anterior (o sin día); los reprogramados a mano y los ya jugados no se tocan. El horario queda sin definir (se carga después).
require('dotenv').config();
const prisma = require('../src/db');

// Una fila por día de juego del calendario. fecha = número de fecha (jornada) dentro de cada torneo.
//   branches / modalities: qué torneos entran. edition (opcional): texto que debe contener la edición ("Clausura").
//   venue: sede (se busca por nombre; si no existe se crea al grabar).
const PLAN = [
  {
    date: '2026-11-01', fecha: 1, branches: ['MIXED'], modalities: ['FOAM', 'CLOTH'],
    venue: { name: 'Polideportivo N°8', address: 'French 1500, San Fernando', courts: 2 },
    soloEstos: true, // ese día juegan únicamente estas ramas/modalidades: los partidos de otros torneos ese día quedan sin día
    note: 'Domingo 1/11 · Mixto Foam y Cloth · cierre de año (11 partidos)',
  },
  // Pegá acá las demás filas del calendario (desde el 8/11 en adelante) con el mismo formato.
];

const APPLY = process.argv.includes('--aplicar');
const ALL = process.argv.includes('--todo');
const OPEN = ['SCHEDULED', 'READY'];
const at = (d) => new Date(d + 'T15:00:00Z'); // 12:00 de Argentina: solo se conoce el día

async function findVenue(v) {
  const found = await prisma.venue.findFirst({ where: { deletedAt: null, name: { contains: v.name.replace(/\s*N°.*/, '').trim(), mode: 'insensitive' } } });
  if (found) return found;
  if (!APPLY) return { id: null, name: v.name + ' (se crearía)' };
  return prisma.venue.create({ data: { name: v.name, address: v.address, courts: v.courts ?? null } });
}

(async () => {
  if ((process.env.DATABASE_URL || '').includes('ep-withered-grass')) throw new Error('Esto apunta a PRODUCCIÓN. Abortado.');
  console.log(APPLY ? '== GRABANDO ==' : '== SIMULACIÓN (no graba; usá --aplicar) ==');
  const today = new Date().toLocaleDateString('en-CA');
  let total = 0;

  for (const row of PLAN) {
    if (!ALL && row.date < today) { console.log(`\n${row.date}: ya pasó, se salta (usá --todo para incluirla)`); continue; }
    console.log(`\n${row.date} — ${row.note ?? ''}`);
    const venue = row.venue ? await findVenue(row.venue) : null;
    if (venue) console.log(`  Sede: ${venue.name}`);

    const tournaments = await prisma.tournament.findMany({
      where: {
        deletedAt: null, status: { not: 'FINISHED' }, year: 2026,
        branch: { in: row.branches }, modality: { in: row.modalities },
        ...(row.edition ? { edition: { contains: row.edition, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    if (!tournaments.length) console.log('  (no hay torneos que coincidan)');

    if (row.soloEstos) {
      const day = { gte: new Date(row.date + 'T00:00:00-03:00'), lt: new Date(new Date(row.date + 'T00:00:00-03:00').getTime() + 864e5) };
      const others = await prisma.match.findMany({
        where: { hiddenAt: null, status: { in: OPEN }, scheduledAt: day, NOT: { branch: { in: row.branches }, modality: { in: row.modalities } } },
        include: { tournament: { select: { name: true } }, matchday: { select: { id: true, number: true } } },
      });
      const groups = {};
      for (const m of others) { const k = (m.tournament?.name ?? 'Partido suelto') + (m.matchday ? ' › Fecha ' + m.matchday.number : ''); groups[k] = (groups[k] || 0) + 1; }
      console.log(others.length ? `  Se sacan de ese día (quedan sin día): ${others.length} partidos` : '  Ningún otro torneo juega ese día');
      for (const [k, n] of Object.entries(groups)) console.log(`    - ${k}: ${n}`);
      if (APPLY && others.length) {
        await prisma.$transaction(async (tx) => {
          await tx.match.updateMany({ where: { id: { in: others.map((m) => m.id) } }, data: { scheduledAt: null, timeSet: false, court: null } });
          const mdIds = [...new Set(others.map((m) => m.matchday?.id).filter(Boolean))];
          if (mdIds.length) await tx.matchday.updateMany({ where: { id: { in: mdIds }, date: day }, data: { date: null } });
        });
        total += others.length;
      }
    }

    for (const t of tournaments) {
      const mds = await prisma.matchday.findMany({ where: { number: row.fecha, stage: { tournamentId: t.id } }, include: { stage: { select: { name: true } } } });
      if (!mds.length) { console.log(`  ${t.name}: no tiene Fecha ${row.fecha}`); continue; }
      for (const md of mds) {
        const target = at(row.date);
        const movable = await prisma.match.count({ where: { matchdayId: md.id, status: { in: OPEN }, scheduledAt: md.date ?? null } });
        const before = md.date ? md.date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'sin día';
        console.log(`  ${t.name} › ${md.stage.name} › Fecha ${md.number}: ${before} → ${row.date} (${movable} partidos se mueven)`);
        if (!APPLY) continue;
        await prisma.$transaction(async (tx) => {
          await tx.matchday.update({ where: { id: md.id }, data: { date: target } });
          await tx.match.updateMany({ where: { matchdayId: md.id, status: { in: OPEN }, scheduledAt: md.date ?? null }, data: { scheduledAt: target, timeSet: false } });
          if (venue?.id) await tx.match.updateMany({ where: { matchdayId: md.id, status: { in: OPEN }, scheduledAt: target, venueId: null }, data: { venueId: venue.id } });
        });
        total += movable;
      }
    }
  }
  console.log(APPLY ? `\nListo: ${total} partidos movidos.` : '\nNada se grabó. Si está bien, corré con --aplicar.');
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
