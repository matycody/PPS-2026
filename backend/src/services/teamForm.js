const prisma = require('../db');
const { computeStandingsMany } = require('./standings');
const { memo } = require('../lib/memo');
const { briefErr } = require('../lib/briefErr');

// equipo|modalidad|rama -> hasta 5 resultados (V/E/D) del más nuevo al más viejo, para todos los equipos
async function loadResultsByKey() {
  const finished = await prisma.match.findMany({
    // Solo la última temporada y media: con los años la lectura no crece sin límite (la forma son los últimos 5 de cada equipo)
    where: { status: 'FINISHED', hiddenAt: null, OR: [{ finishedAt: null }, { finishedAt: { gte: new Date(Date.now() - 540 * 864e5) } }] },
    orderBy: [{ finishedAt: 'desc' }, { scheduledAt: 'desc' }],
    take: 6000,
    select: { teamAId: true, teamBId: true, modality: true, branch: true, sets: { select: { winnerTeamId: true } } },
  });
  const byKey = new Map();
  for (const f of finished) {
    const win = f.modality === 'CLOTH' ? 2 : 1;
    let a = 0;
    let b = 0;
    for (const s of f.sets) {
      if (!s.winnerTeamId) { if (f.modality === 'CLOTH') { a += 1; b += 1; } }
      else if (s.winnerTeamId === f.teamAId) a += win;
      else if (s.winnerTeamId === f.teamBId) b += win;
    }
    for (const [id, mine, theirs] of [[f.teamAId, a, b], [f.teamBId, b, a]]) {
      if (!id) continue;
      const k = id + '|' + f.modality + '|' + f.branch;
      const list = byKey.get(k) ?? [];
      if (list.length < 5) { list.push(mine > theirs ? 'V' : mine === theirs ? 'E' : 'D'); byKey.set(k, list); }
    }
  }
  return byKey;
}

// "Últimas": resultados de los últimos 5 partidos terminados de cada equipo, separados por modalidad y rama
// (Foam y Cloth, o rama Mixto y Masculino, nunca se mezclan). Orden: del más viejo al más nuevo.
async function formsFor(matches) {
  const out = new Map();
  // Posición actual en la tabla de su zona (se recalcula en cada consulta: refleja la tabla de hoy, no la de cuando se jugó)
  const ranksP = ranksFor(matches).catch((e) => { console.error('[rank]', briefErr(e)); return new Map(); });
  const teams = [...new Set(matches.flatMap((m) => [m.teamA?.id, m.teamB?.id]).filter(Boolean))];
  if (!teams.length) return out;
  // Resultados recientes de todos los equipos: se calculan una sola vez y se comparten entre todos los listados (memoria corta)
  const [ranks, byKey] = await Promise.all([ranksP, memo('forms|all', loadResultsByKey)]);
  for (const m of matches) {
    const get = (t) => (t?.id ? [...(byKey.get(t.id + '|' + m.modality + '|' + m.branch) ?? [])].reverse() : []);
    const rk = ranks.get(m.id);
    out.set(m.id, { A: get(m.teamA), B: get(m.teamB), rankA: rk?.A ?? null, rankB: rk?.B ?? null });
  }
  return out;
}

async function ranksFor(matches) {
  const out = new Map();
  const rows = await prisma.match.findMany({
    where: { id: { in: matches.map((m) => m.id) }, stageId: { not: null }, tournamentId: { not: null } },
    select: { id: true, tournamentId: true, stageId: true, teamAId: true, teamBId: true },
  });
  const byTournament = new Map();
  for (const r of rows) byTournament.set(r.tournamentId, [...(byTournament.get(r.tournamentId) ?? []), r]);
  // Todas las tablas juntas (3 consultas en total, no 3 por torneo); pedidos iguales comparten el cálculo
  const tids = [...byTournament.keys()].sort();
  const all = await memo('ranks|' + tids.join(','), () => computeStandingsMany(tids));
  for (const [tid, list] of byTournament) {
    const data = all.get(tid);
    if (!data) continue;
    const pos = new Map(); // stageId -> teamId -> lugar (1, 2, 3... aunque haya empate)
    for (const st of data.stages) pos.set(st.id, new Map(st.rows.map((x, i) => [x.team.id, i + 1])));
    for (const r of list) {
      const z = pos.get(r.stageId); // solo zonas de liga: en playoffs no hay tabla
      if (z) out.set(r.id, { A: z.get(r.teamAId) ?? null, B: z.get(r.teamBId) ?? null });
    }
  }
  return out;
}

module.exports = { formsFor };
