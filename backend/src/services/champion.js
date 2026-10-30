const prisma = require('../db');
const { decide } = require('./bracket');

// Campeón de un torneo con llaves: el ganador de la final de la última etapa eliminatoria.
// La final es el partido de la ronda más alta que no es el de tercer puesto (el tercer puesto recibe a los dos perdedores de semis).
function knockoutChampion(stages, matchesByStage) {
  const ko = stages.filter((s) => s.type === 'KNOCKOUT');
  if (!ko.length) return null;
  const top = Math.max(...ko.map((s) => s.phase));
  const last = ko.filter((s) => s.phase === top);
  if (last.length !== 1) return null;
  const ms = matchesByStage.get(last[0].id) || [];
  if (!ms.length) return null;
  const maxRound = Math.max(...ms.map((m) => m.round || 0));
  const targets = new Map();
  ms.forEach((m) => { if (m.loserMatchId) targets.set(m.loserMatchId, (targets.get(m.loserMatchId) ?? 0) + 1); });
  const inFinalRound = ms.filter((m) => m.round === maxRound && (targets.get(m.id) ?? 0) < 2);
  const final = inFinalRound.length === 1 ? inFinalRound[0] : inFinalRound.find((m) => m.slot === 1) || ms.find((m) => m.round === maxRound && m.slot === 1);
  const res = final && final.status === 'FINISHED' ? decide(final) : null;
  return res ? res.winnerTeamId : null;
}

// Torneos terminados sin campeón guardado: lo deduce de la final (para que no se pierdan títulos ya jugados)
async function resolveChampions(tournamentIds) {
  const out = new Map();
  if (!tournamentIds.length) return out;
  const [stages, matches] = await Promise.all([
    prisma.stage.findMany({ where: { tournamentId: { in: tournamentIds } }, select: { id: true, tournamentId: true, type: true, phase: true } }),
    prisma.match.findMany({
      where: { tournamentId: { in: tournamentIds }, hiddenAt: null, stage: { type: 'KNOCKOUT' } },
      select: { id: true, tournamentId: true, stageId: true, round: true, slot: true, status: true, teamAId: true, teamBId: true, loserMatchId: true, sets: { select: { winnerTeamId: true } } },
    }),
  ]);
  for (const tid of tournamentIds) {
    const byStage = new Map();
    matches.filter((m) => m.tournamentId === tid).forEach((m) => {
      if (!byStage.has(m.stageId)) byStage.set(m.stageId, []);
      byStage.get(m.stageId).push(m);
    });
    const champ = knockoutChampion(stages.filter((s) => s.tournamentId === tid), byStage);
    if (champ) out.set(tid, champ);
  }
  return out;
}

module.exports = { knockoutChampion, resolveChampions };
