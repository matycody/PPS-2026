const prisma = require('../db');
const { memo, memoPeek, memoPrefill } = require('../lib/memo');

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

// Puntos de juego de cada equipo (los que se ven en el marcador): Foam 1 por set ganado;
// Cloth 2 por set ganado y 1 a cada uno si el set se empata.
function matchPoints(match) {
  let a = 0;
  let b = 0;
  const cloth = match.modality === 'CLOTH';
  for (const s of match.sets) {
    if (!s.winnerTeamId) { if (cloth) { a += 1; b += 1; } } else if (s.winnerTeamId === match.teamAId) a += cloth ? 2 : 1;
    else if (s.winnerTeamId === match.teamBId) b += cloth ? 2 : 1;
  }
  return { a, b };
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
  // Se desempata por puntos de juego (no por sets): SET_DIFFERENCE = diferencia de puntos, SETS_WON = puntos a favor
  const field = { SET_DIFFERENCE: 'pointDiff', SETS_WON: 'pointsFor', WINS: 'won' }[criterion];
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

function buildTable(stage, t, matches, criteria, penalties = []) {
  const rows = new Map(
    stage.teams.map((x) => [
      x.teamId,
      { teamId: x.teamId, team: x.team, played: 0, won: 0, drawn: 0, lost: 0, points: 0, setsFor: 0, setsAgainst: 0, setDiff: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0, penalty: 0, form: [] },
    ]),
  );
  const results = [];
  let matchesWithoutSets = 0;

  const when = (m) => (m.finishedAt ?? m.scheduledAt ? new Date(m.finishedAt ?? m.scheduledAt).getTime() : 0)
  for (const m of [...matches].sort((x, y) => when(x) - when(y))) {
    const r = matchResult(m);
    if (!r) {
      matchesWithoutSets++;
      continue;
    }
    const a = rows.get(m.teamAId);
    const b = rows.get(m.teamBId);
    if (!a || !b) continue;
    results.push({ a: a.teamId, b: b.teamId, setsA: r.setsA, setsB: r.setsB });
    const pts = matchPoints(m);
    for (const [row, mine, theirs, pf, pa] of [[a, r.setsA, r.setsB, pts.a, pts.b], [b, r.setsB, r.setsA, pts.b, pts.a]]) {
      row.form.push(mine > theirs ? 'V' : mine === theirs ? 'E' : 'D'); // últimos resultados, del más viejo al más nuevo
      row.played++;
      row.setsFor += mine;
      row.setsAgainst += theirs;
      row.setDiff = row.setsFor - row.setsAgainst;
      row.pointsFor += pf;
      row.pointsAgainst += pa;
      row.pointDiff = row.pointsFor - row.pointsAgainst;
      row.points += outcomePoints(t, mine, theirs);
      if (mine > theirs) row.won++;
      else if (mine === theirs) row.drawn++;
      else row.lost++;
    }
  }

  // Quita de puntos por equipo (ej. no presentó árbitros o mesa): se resta antes de ordenar
  for (const pn of penalties) {
    const r = rows.get(pn.teamId);
    if (!r) continue;
    r.penalty += pn.points;
    r.points -= pn.points;
  }

  for (const r of rows.values()) r.form = r.form.slice(-5);

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
    if ((stage.playoffPositions ?? []).includes(pos)) return 'PLAYOFF';
    return null;
  };
  const notStarted = [...rows.values()].every((r) => r.played === 0); // sin partidos: se marca por el orden de la lista
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
      out.push({ ...r, position, tied, zone: tied && !notStarted ? zone : zoneAt(index) });
    }
  }
  return { rows: out, matchesWithoutSets };
}

// Tabla de posiciones de las zonas de liga de un torneo (o de una sola con stageId).
// Se calcula siempre desde los partidos finalizados.
// withPaused: la organización ve la tabla con los partidos que ocultó la pausa del torneo
const STAGE_INCLUDE = { teams: { include: { team: { select: TEAM_SELECT } } }, penalties: { select: { id: true, teamId: true, points: true, kind: true, missing: true, reason: true, createdAt: true }, orderBy: { createdAt: 'asc' } } };
const STAGE_ORDER = [{ phase: 'asc' }, { tier: 'asc' }, { name: 'asc' }];
const MATCH_SELECT = { stageId: true, modality: true, teamAId: true, teamBId: true, finishedAt: true, scheduledAt: true, sets: { select: { winnerTeamId: true } } };

// Arma la respuesta de un torneo a partir de sus datos ya leídos (la misma para uno solo o para varios juntos)
function assemble(t, stages, matches) {
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
      playoffPositions: s.playoffPositions,
      ...buildTable(s, t, matches.filter((m) => m.stageId === s.id), criteria, s.penalties),
      penalties: s.penalties,
    })),
  };
}

async function computeStandingsRaw(tournamentId, stageId = null, withPaused = false) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { tiebreakers: { orderBy: { order: 'asc' } } },
  });
  if (!t) return null;

  const stages = await prisma.stage.findMany({
    where: { tournamentId, type: 'LEAGUE', ...(stageId ? { id: stageId } : {}) },
    orderBy: STAGE_ORDER,
    include: STAGE_INCLUDE,
  });
  const matches = stages.length
    ? await prisma.match.findMany({
        where: { stageId: { in: stages.map((s) => s.id) }, status: 'FINISHED', ...(withPaused ? { OR: [{ hiddenAt: null }, { hiddenByPause: true }] } : { hiddenAt: null }) },
        select: MATCH_SELECT,
      })
    : [];
  return assemble(t, stages, matches);
}

// Las tablas de varios torneos juntos (sin pausados ni zona puntual): 3 consultas en total en vez de 3 por torneo.
// Devuelve Map(tournamentId -> igual que computeStandings) y deja cada uno disponible para computeStandings (memoria corta).
async function computeStandingsMany(tournamentIds) {
  const wanted = [...new Set(tournamentIds)].filter(Boolean);
  const out = new Map();
  if (!wanted.length) return out;
  // Lo que ya está calculado y vigente se reutiliza; solo se consulta lo que falta
  const ids = [];
  await Promise.all(wanted.map(async (id) => {
    const p = memoPeek('standings|' + id + '||');
    if (p) {
      try { out.set(id, await p); return; } catch (e) { /* falló: se vuelve a calcular */ }
    }
    ids.push(id);
  }));
  if (!ids.length) return out;
  const tournaments = await prisma.tournament.findMany({ where: { id: { in: ids } }, include: { tiebreakers: { orderBy: { order: 'asc' } } } });
  const stages = await prisma.stage.findMany({ where: { tournamentId: { in: ids }, type: 'LEAGUE' }, orderBy: STAGE_ORDER, include: STAGE_INCLUDE });
  const matches = stages.length
    ? await prisma.match.findMany({ where: { stageId: { in: stages.map((s) => s.id) }, status: 'FINISHED', hiddenAt: null }, select: MATCH_SELECT })
    : [];
  const matchesByStage = new Map();
  for (const m of matches) {
    if (!matchesByStage.has(m.stageId)) matchesByStage.set(m.stageId, []);
    matchesByStage.get(m.stageId).push(m);
  }
  for (const t of tournaments) {
    const own = stages.filter((s) => s.tournamentId === t.id);
    const ownMatches = own.flatMap((s) => matchesByStage.get(s.id) ?? []);
    const data = assemble(t, own, ownMatches);
    out.set(t.id, data);
    memoPrefill('standings|' + t.id + '||', Promise.resolve(data));
  }
  for (const id of wanted) if (!out.has(id)) out.set(id, null);
  return out;
}

// Con memoria corta: el Inicio pide las tablas de cada torneo en cada carga
const computeStandings = (tournamentId, stageId = null, withPaused = false) => memo('standings|' + tournamentId + '|' + (stageId ?? '') + '|' + (withPaused ? 'p' : ''), () => computeStandingsRaw(tournamentId, stageId, withPaused));

module.exports = { computeStandings, computeStandingsMany, buildTable, matchPoints };