const prisma = require('../db');

const TEAM_SELECT = { id: true, name: true, logo: true };

// Resultado del partido según sus sets: gana quien ganó más sets; igual cantidad = empate.
// Los sets sin ganador no cuentan. null = ningún set decidido (el partido no suma).
function matchResult(match) {
  let setsA = 0;
  let setsB = 0;
  for (const s of match.sets) {
    if (s.winnerTeamId && s.winnerTeamId === match.teamAId) setsA++;
    else if (s.winnerTeamId && s.winnerTeamId === match.teamBId) setsB++;
  }
  return setsA + setsB === 0 ? null : { setsA, setsB };
}

function outcomePoints(t, mine, theirs) {
  if (mine > theirs) return t.pointsWin;
  if (mine === theirs) return t.pointsDraw;
  return t.pointsLoss;
}

// Valor de cada equipo para un criterio, medido solo dentro del grupo empatado
function criterionValues(criterion, rows, results, t) {
  const values = new Map(rows.map((r) => [r.teamId, 0]));
  if (criterion === 'HEAD_TO_HEAD') {
    for (const g of results) {
      if (!values.has(g.a) || !values.has(g.b)) continue;
      values.set(g.a, values.get(g.a) + outcomePoints(t, g.setsA, g.setsB));
      values.set(g.b, values.get(g.b) + outcomePoints(t, g.setsB, g.setsA));
    }
    return values;
  }
  const field = { SET_DIFFERENCE: 'setDiff', SETS_WON: 'setsFor', WINS: 'won' }[criterion];
  for (const r of rows) values.set(r.teamId, r[field]);
  return values;
}

// Divide un grupo empatado aplicando los criterios en orden. Devuelve grupos ordenados;
// un grupo de más de un equipo queda empatado (se define con el sorteo del organizador).
function breakTies(rows, criteria, results, t) {
  if (rows.length <= 1 || !criteria.length) return [rows];
  const [criterion, ...rest] = criteria;
  if (criterion === 'DRAW_LOT') return [rows];
  const values = criterionValues(criterion, rows, results, t);
  const buckets = new Map();
  for (const r of rows) {
    const v = values.get(r.teamId);
    if (!buckets.has(v)) buckets.set(v, []);
    buckets.get(v).push(r);
  }
  return [...buckets.keys()]
    .sort((x, y) => y - x)
    .flatMap((v) => {
      const g = buckets.get(v);
      return g.length === 1 ? [g] : breakTies(g, rest, results, t);
    });
}

function buildTable(stage, t, matches, criteria) {
  const rows = new Map(
    stage.teams.map((x) => [
      x.teamId,
      { teamId: x.teamId, team: x.team, played: 0, won: 0, drawn: 0, lost: 0, points: 0, setsFor: 0, setsAgainst: 0, setDiff: 0 },
    ]),
  );
  const results = [];
  let matchesWithoutSets = 0;

  for (const m of matches) {
    const r = matchResult(m);
    if (!r) {
      matchesWithoutSets++;
      continue;
    }
    const a = rows.get(m.teamAId);
    const b = rows.get(m.teamBId);
    if (!a || !b) continue;
    results.push({ a: a.teamId, b: b.teamId, setsA: r.setsA, setsB: r.setsB });
    for (const [row, mine, theirs] of [[a, r.setsA, r.setsB], [b, r.setsB, r.setsA]]) {
      row.played++;
      row.setsFor += mine;
      row.setsAgainst += theirs;
      row.setDiff = row.setsFor - row.setsAgainst;
      row.points += outcomePoints(t, mine, theirs);
      if (mine > theirs) row.won++;
      else if (mine === theirs) row.drawn++;
      else row.lost++;
    }
  }

  // Primero por puntos; los empatados se desempatan con los criterios del torneo, en orden
  const byPoints = new Map();
  for (const r of rows.values()) {
    if (!byPoints.has(r.points)) byPoints.set(r.points, []);
    byPoints.get(r.points).push(r);
  }
  const groups = [...byPoints.keys()]
    .sort((x, y) => y - x)
    .flatMap((p) => breakTies(byPoints.get(p), criteria, results, t));

  const total = rows.size;
  const zoneAt = (pos) => {
    if (pos <= stage.promotions) return 'PROMOTION';
    if (pos > total - stage.relegations) return 'RELEGATION';
    return null;
  };
  let index = 0;
  const out = [];
  for (const g of groups) {
    const tied = g.length > 1;
    const sorted = tied ? [...g].sort((x, y) => x.team.name.localeCompare(y.team.name)) : g;
    const position = index + 1;
    // Un grupo empatado solo hereda ascenso/descenso si todo el grupo cae del mismo lado del límite
    const zones = new Set(sorted.map((_, k) => zoneAt(position + k)));
    const zone = zones.size === 1 ? [...zones][0] : null;
    for (const r of sorted) {
      index++;
      out.push({ ...r, position, tied, zone: tied ? zone : zoneAt(index) });
    }
  }
  return { rows: out, matchesWithoutSets };
}

// Tabla de posiciones de las zonas de liga de un torneo (o de una sola con stageId).
// Se calcula siempre desde los partidos finalizados.
async function computeStandings(tournamentId, stageId = null) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { tiebreakers: { orderBy: { order: 'asc' } } },
  });
  if (!t) return null;

  const stages = await prisma.stage.findMany({
    where: { tournamentId, type: 'LEAGUE', ...(stageId ? { id: stageId } : {}) },
    orderBy: [{ phase: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
    include: { teams: { include: { team: { select: TEAM_SELECT } } } },
  });
  const matches = stages.length
    ? await prisma.match.findMany({
        where: { stageId: { in: stages.map((s) => s.id) }, status: 'FINISHED', hiddenAt: null },
        select: { stageId: true, teamAId: true, teamBId: true, sets: { select: { winnerTeamId: true } } },
      })
    : [];
  const criteria = t.tiebreakers.map((x) => x.criterion);

  return {
    tournament: {
      id: t.id,
      name: t.name,
      status: t.status,
      pointsWin: t.pointsWin,
      pointsDraw: t.pointsDraw,
      pointsLoss: t.pointsLoss,
      tiebreakers: criteria,
    },
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      phase: s.phase,
      tier: s.tier,
      promotions: s.promotions,
      relegations: s.relegations,
      ...buildTable(s, t, matches.filter((m) => m.stageId === s.id), criteria),
    })),
  };
}

module.exports = { computeStandings, buildTable };