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

// Puestos puestos a mano (2.º y 3.º). Si la tabla todavía no existe (migración pendiente) se ignoran, sin romper nada.
async function manualPlaces(ids) {
  const out = new Map();
  try {
    const rows = await prisma.tournamentPlace.findMany({ where: { tournamentId: { in: ids } }, select: { tournamentId: true, place: true, teamId: true } });
    for (const r of rows) {
      if (!out.has(r.tournamentId)) out.set(r.tournamentId, {});
      out.get(r.tournamentId)[r.place] = r.teamId;
    }
  } catch { /* sin tabla */ }
  return out;
}

// Guarda 2.º y 3.º a mano ({ second, third }: id = fijar, null = volver al automático, undefined = no tocar)
async function savePlaces(tx, tournamentId, { second, third }) {
  for (const [place, teamId] of [[2, second], [3, third]]) {
    if (teamId === undefined) continue;
    await tx.tournamentPlace.deleteMany({ where: { tournamentId, place } });
    if (teamId) await tx.tournamentPlace.create({ data: { tournamentId, place, teamId } });
  }
}

// Posiciones 1 a 3 de la tabla de la zona principal (torneo solo de liga). Solo si el puesto es único (sin empate).
function leaguePodium(stages, standings) {
  const leagues = stages.filter((s) => s.type === 'LEAGUE' && !s.isPromotion);
  if (!leagues.length) return null;
  const topPhase = Math.max(...leagues.map((s) => s.phase));
  const topTier = Math.min(...leagues.filter((s) => s.phase === topPhase).map((s) => s.tier ?? 1));
  const tops = leagues.filter((s) => s.phase === topPhase && (s.tier ?? 1) === topTier);
  if (tops.length !== 1) return null;
  const rows = standings.filter((x) => x.stageId === tops[0].id);
  if (!rows.length) return null;
  const at = (n) => { const r = rows.filter((x) => x.position === n); return r.length === 1 && !r[0].tied ? r[0].teamId : null; };
  return { firstId: at(1), secondId: at(2), thirdId: at(3) };
}

// rows: [{ id, championId }] de torneos terminados.
// Devuelve Map(torneo -> { first, second, third, full, manual }).
// Cada puesto sale, en este orden: de lo puesto a mano, del partido (final / tercer puesto) o de la tabla de posiciones (torneo de liga).
async function podiums(rows) {
  const out = new Map();
  if (!rows.length) return out;
  const ids = rows.map((r) => r.id);
  const [stages, matches, standings, manual] = await Promise.all([
    prisma.stage.findMany({ where: { tournamentId: { in: ids } }, select: { id: true, tournamentId: true, type: true, phase: true, tier: true, isPromotion: true } }),
    prisma.match.findMany({
      where: { tournamentId: { in: ids }, hiddenAt: null, stage: { type: 'KNOCKOUT' } },
      select: { id: true, tournamentId: true, stageId: true, round: true, slot: true, status: true, teamAId: true, teamBId: true, loserMatchId: true, sets: { select: { winnerTeamId: true } } },
    }),
    prisma.stageStanding.findMany({ where: { stage: { tournamentId: { in: ids } } }, select: { stageId: true, teamId: true, position: true, tied: true } }),
    manualPlaces(ids),
  ]);
  const raw = new Map();
  const teamIds = new Set();
  for (const r of rows) {
    const st = stages.filter((s) => s.tournamentId === r.id);
    const hasKo = st.some((s) => s.type === 'KNOCKOUT' && !s.isPromotion);
    const man = manual.get(r.id) || {};
    const pod = knockoutPodium(st, matches.filter((m) => m.tournamentId === r.id));
    const lg = hasKo ? null : leaguePodium(st, standings.filter((x) => st.some((s) => s.id === x.stageId)));
    const p = {
      firstId: r.championId ?? pod?.firstId ?? lg?.firstId ?? null,
      secondId: man[2] ?? pod?.secondId ?? lg?.secondId ?? null,
      thirdId: man[3] ?? pod?.thirdId ?? lg?.thirdId ?? null,
      full: hasKo || !!lg || !!man[2] || !!man[3],
      manual: { second: man[2] ?? null, third: man[3] ?? null },
    };
    raw.set(r.id, p);
    [p.firstId, p.secondId, p.thirdId].filter(Boolean).forEach((x) => teamIds.add(x));
  }
  const teams = teamIds.size ? await prisma.team.findMany({ where: { id: { in: [...teamIds] } }, select: TEAM }) : [];
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const [tid, p] of raw) {
    out.set(tid, { first: byId.get(p.firstId) ?? null, second: byId.get(p.secondId) ?? null, third: byId.get(p.thirdId) ?? null, full: p.full, manual: p.manual });
  }
  return out;
}

module.exports = { podiums, knockoutPodium, savePlaces };
