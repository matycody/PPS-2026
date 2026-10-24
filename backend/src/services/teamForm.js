const prisma = require('../db');

// "Últimas": resultados de los últimos 5 partidos terminados de cada equipo, separados por modalidad y rama
// (Foam y Cloth, o rama Mixto y Masculino, nunca se mezclan). Orden: del más viejo al más nuevo.
async function formsFor(matches) {
  const out = new Map();
  const teams = [...new Set(matches.flatMap((m) => [m.teamA?.id, m.teamB?.id]).filter(Boolean))];
  if (!teams.length) return out;
  const finished = await prisma.match.findMany({
    where: { status: 'FINISHED', hiddenAt: null, OR: [{ teamAId: { in: teams } }, { teamBId: { in: teams } }] },
    orderBy: [{ finishedAt: 'desc' }, { scheduledAt: 'desc' }],
    take: 3000,
    select: { teamAId: true, teamBId: true, modality: true, branch: true, sets: { select: { winnerTeamId: true } } },
  });
  const byKey = new Map(); // equipo|modalidad|rama -> resultados del más nuevo al más viejo
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
      if (!id || !teams.includes(id)) continue;
      const k = id + '|' + f.modality + '|' + f.branch;
      const list = byKey.get(k) ?? [];
      if (list.length < 5) { list.push(mine > theirs ? 'V' : mine === theirs ? 'E' : 'D'); byKey.set(k, list); }
    }
  }
  for (const m of matches) {
    const get = (t) => (t?.id ? [...(byKey.get(t.id + '|' + m.modality + '|' + m.branch) ?? [])].reverse() : []);
    out.set(m.id, { A: get(m.teamA), B: get(m.teamB) });
  }
  return out;
}

module.exports = { formsFor };
