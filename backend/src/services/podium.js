const prisma = require('../db');
const { decide } = require('./bracket');

const TEAM = { id: true, name: true, logo: true };

// Podio de las llaves de la última etapa eliminatoria: final (1.º y 2.º) y partido por el tercer puesto (3.º).
// El tercer puesto es el partido al que van los perdedores de las dos semis (lo apuntan dos loserMatchId).
function knockoutPodium(stages, matches) {
  const ko = stages.filter((s) => s.type === 'KNOCKOUT' && !s.isPromotion);
  if (!ko.length) return null;
  const top = Math.max(...ko.map((s) => s.phase));
  const last = ko.filter((s) => s.phase === top);
  if (last.length !== 1) return null;
  const ms = matches.filter((m) => m.stageId === last[0].id);
  if (!ms.length) return null;
  const maxRound = Math.max(...ms.map((m) => m.round || 0));
  const targets = new Map();
  ms.forEach((m) => { if (m.loserMatchId) targets.set(m.loserMatchId, (targets.get(m.loserMatchId) ?? 0) + 1); });
  const inFinalRound = ms.filter((m) => m.round === maxRound && (targets.get(m.id) ?? 0) < 2);
  const final = inFinalRound.length === 1 ? inFinalRound[0] : inFinalRound.find((m) => m.slot === 1) || ms.find((m) => m.round === maxRound && m.slot === 1);
  const third = ms.find((m) => (targets.get(m.id) ?? 0) >= 2);
  const f = final && final.status === 'FINISHED' ? decide(final) : null;
  const t = third && third.status === 'FINISHED' ? decide(third) : null;
  return { firstId: f?.winnerTeamId ?? null, secondId: f?.loserTeamId ?? null, thirdId: t?.winnerTeamId ?? null };
}

// rows: [{ id, championId }] de torneos terminados.
// Devuelve Map(torneo -> { first, second, third, full }). Liga sola: solo 1.º (full=false); con llaves: podio completo (full=true).
async function podiums(rows) {
  const out = new Map();
  if (!rows.length) return out;
  const ids = rows.map((r) => r.id);
  const [stages, matches] = await Promise.all([
    prisma.stage.findMany({ where: { tournamentId: { in: ids } }, select: { id: true, tournamentId: true, type: true, phase: true, isPromotion: true } }),
    prisma.match.findMany({
      where: { tournamentId: { in: ids }, hiddenAt: null, stage: { type: 'KNOCKOUT' } },
      select: { id: true, tournamentId: true, stageId: true, round: true, slot: true, status: true, teamAId: true, teamBId: true, loserMatchId: true, sets: { select: { winnerTeamId: true } } },
    }),
  ]);
  const raw = new Map();
  const teamIds = new Set();
  for (const r of rows) {
    const st = stages.filter((s) => s.tournamentId === r.id);
    const pod = knockoutPodium(st, matches.filter((m) => m.tournamentId === r.id));
    const full = st.some((s) => s.type === 'KNOCKOUT' && !s.isPromotion);
    const p = { firstId: pod?.firstId ?? r.championId ?? null, secondId: full ? pod?.secondId ?? null : null, thirdId: full ? pod?.thirdId ?? null : null, full };
    raw.set(r.id, p);
    [p.firstId, p.secondId, p.thirdId].filter(Boolean).forEach((x) => teamIds.add(x));
  }
  const teams = teamIds.size ? await prisma.team.findMany({ where: { id: { in: [...teamIds] } }, select: TEAM }) : [];
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const [tid, p] of raw) {
    out.set(tid, { first: byId.get(p.firstId) ?? null, second: byId.get(p.secondId) ?? null, third: byId.get(p.thirdId) ?? null, full: p.full });
  }
  return out;
}

module.exports = { podiums, knockoutPodium };
