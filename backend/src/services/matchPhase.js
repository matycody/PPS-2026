const prisma = require('../db');
const { computeStandings } = require('./standings');

const TEAM = { id: true, name: true, logo: true };

function roundLabel(round, maxRound) {
  const d = maxRound - round;
  if (d === 0) return 'Final';
  if (d === 1) return 'Semifinal';
  if (d === 2) return 'Cuartos de final';
  if (d === 3) return 'Octavos de final';
  return 'Ronda ' + round;
}

// Para cada partido de un torneo: a qué fecha/ronda corresponde y, si todavía no tiene equipo definido,
// qué lugar ocupa ("1° Zona A", "Ganador Semifinal 1") y quién lo ocupa hoy.
// Devuelve Map(matchId -> phase). Partidos sueltos (sin etapa) no tienen phase.
async function phasesFor(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const rows = await prisma.match.findMany({
    where: { id: { in: ids }, stageId: { not: null } },
    select: {
      id: true, tournamentId: true, round: true, slot: true, teamAId: true, teamBId: true, teamAFrom: true, teamBFrom: true,
      stage: { select: { id: true, name: true, type: true } },
      matchday: { select: { number: true } },
    },
  });
  if (!rows.length) return out;

  // Llaves involucradas: todos sus partidos, para ronda máxima, tercer puesto y de dónde viene cada lugar
  const koStageIds = [...new Set(rows.filter((r) => r.stage.type === 'KNOCKOUT').map((r) => r.stage.id))];
  const ko = koStageIds.length
    ? await prisma.match.findMany({
        where: { stageId: { in: koStageIds }, hiddenAt: null },
        select: {
          id: true, stageId: true, round: true, slot: true, nextMatchId: true, nextSide: true, loserMatchId: true, loserSide: true,
          teamAId: true, teamBId: true, teamAFrom: true, teamBFrom: true,
          teamA: { select: TEAM }, teamB: { select: TEAM },
        },
      })
    : [];
  const byId = new Map(ko.map((m) => [m.id, m]));
  const maxRound = new Map();
  ko.forEach((m) => maxRound.set(m.stageId, Math.max(maxRound.get(m.stageId) ?? 0, m.round || 0)));
  const feeds = new Map(); // matchId -> { A: {from, kind}, B: {...} }
  const feed = (target, side, from, kind) => {
    if (!target) return;
    if (!feeds.has(target)) feeds.set(target, {});
    feeds.get(target)[side] = { from, kind };
  };
  ko.forEach((m) => { feed(m.nextMatchId, m.nextSide, m.id, 'WINNER'); feed(m.loserMatchId, m.loserSide, m.id, 'LOSER'); });
  const isThird = (id) => { const f = feeds.get(id); return !!(f && f.A && f.B && f.A.kind === 'LOSER' && f.B.kind === 'LOSER'); };

  // Tablas de las zonas de las que depende algún lugar sin equipo (una sola vez por zona)
  const zoneRows = new Map();
  const tournamentOf = new Map(rows.map((r) => [r.stage.id, r.tournamentId]));
  const needZone = new Map();
  const note = (m, tId) => [m.teamAFrom, m.teamBFrom].forEach((f) => f && f.stageId && needZone.set(f.stageId, tId));
  rows.forEach((r) => note(r, r.tournamentId));
  ko.forEach((m) => note(m, tournamentOf.get(m.stageId)));
  await Promise.all([...needZone].map(async ([zoneId, tId]) => {
    if (!tId) return;
    const data = await computeStandings(tId, zoneId);
    const z = data && data.stages[0];
    if (z) zoneRows.set(zoneId, { name: z.name, rows: z.rows });
  }));
  const zoneTeam = (f) => {
    const z = f && zoneRows.get(f.stageId);
    const row = z && z.rows[f.position - 1];
    return row && !row.tied ? row.team : null; // con empate el lugar todavía no está definido
  };
  const zoneSlot = (f) => {
    const z = zoneRows.get(f.stageId);
    return { big: f.position + '°', sub: z ? z.name : null, current: zoneTeam(f) };
  };

  // Equipos que hoy ocupan un partido de la llave (reales o, si faltan, los de la tabla)
  const nowTeams = (m) => {
    const a = m.teamA ?? zoneTeam(m.teamAFrom);
    const b = m.teamB ?? zoneTeam(m.teamBFrom);
    return [a, b].filter(Boolean);
  };
  const feederName = (id) => {
    const m = byId.get(id);
    const max = maxRound.get(m.stageId);
    const same = ko.filter((x) => x.stageId === m.stageId && x.round === m.round && !isThird(x.id)).sort((p, q) => (p.slot ?? 0) - (q.slot ?? 0));
    const n = same.findIndex((x) => x.id === id) + 1;
    return roundLabel(m.round, max) + (same.length > 1 ? ' ' + n : '');
  };

  for (const r of rows) {
    if (r.stage.type === 'LEAGUE') {
      const slotA = !r.teamAId && r.teamAFrom ? zoneSlot(r.teamAFrom) : null;
      const slotB = !r.teamBId && r.teamBFrom ? zoneSlot(r.teamBFrom) : null;
      out.set(r.id, { kind: 'LEAGUE', zone: r.stage.name, label: (r.matchday ? 'Fecha ' + r.matchday.number : r.stage.name), slotA, slotB });
      continue;
    }
    const m = byId.get(r.id);
    if (!m) continue;
    const max = maxRound.get(m.stageId);
    const third = isThird(m.id);
    const f = feeds.get(m.id) || {};
    const slot = (side, teamId, from) => {
      if (teamId) return null;
      if (from) return zoneSlot(from);
      const fd = f[side];
      if (!fd) return null;
      const cands = nowTeams(byId.get(fd.from));
      return { big: fd.kind === 'LOSER' ? 'Perdedor' : 'Ganador', sub: feederName(fd.from), current: null, candidates: cands };
    };
    out.set(r.id, {
      kind: 'KNOCKOUT',
      zone: null,
      label: third ? 'Tercer puesto' : roundLabel(m.round, max),
      slotA: slot('A', m.teamAId, m.teamAFrom),
      slotB: slot('B', m.teamBId, m.teamBFrom),
    });
  }
  return out;
}

module.exports = { phasesFor };
