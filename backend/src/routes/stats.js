const express = require('express');
const prisma = require('../db');
const { matchResult } = require('../services/bracket');
const { teamCareer } = require('../services/teamCareer');
const { resolveChampions } = require('../services/champion');
const { podiums } = require('../services/podium');

const router = express.Router();
const TEAM_SELECT = { id: true, name: true, logo: true };

function fail(err, res) {
  if (err && err.name === 'PrismaClientValidationError') return res.status(400).json({ error: 'Filtro inválido' });
  console.error('[stats]', require('../lib/briefErr').briefErr(err));
  return res.status(500).json({ error: 'Error interno' });
}

// Filtros comunes: yearFrom, yearTo, branch, modality (sobre el torneo del partido)
function tournamentFilter(q) {
  const where = { deletedAt: null }; // los torneos eliminados no cuentan en ninguna estadística
  const years = {};
  for (const [key, op] of [['yearFrom', 'gte'], ['yearTo', 'lte']]) {
    if (q[key] === undefined) continue;
    const y = Number(q[key]);
    if (!Number.isInteger(y) || y < 1900 || y > 9999) return { error: key + ' inválido' };
    years[op] = y;
  }
  if (Object.keys(years).length) where.year = years;
  if (q.branch !== undefined) where.branch = String(q.branch);
  if (q.modality !== undefined) where.modality = String(q.modality);
  return { where };
}

// Totales de un equipo sobre una lista de partidos terminados
function tally(teamId, matches) {
  const t = { played: 0, won: 0, drawn: 0, lost: 0, setsFor: 0, setsAgainst: 0 };
  for (const m of matches) {
    const r = matchResult(m);
    if (!r) continue;
    const mine = m.teamAId === teamId ? r.setsA : r.setsB;
    const theirs = m.teamAId === teamId ? r.setsB : r.setsA;
    t.played++;
    t.setsFor += mine;
    t.setsAgainst += theirs;
    if (mine > theirs) t.won++;
    else if (mine === theirs) t.drawn++;
    else t.lost++;
  }
  return t;
}


const whenOf = (m) => (m.finishedAt ?? m.scheduledAt)?.getTime() ?? 0;

// Últimos N resultados de un equipo, del más viejo al más nuevo: 'W' | 'D' | 'L'
function formOf(teamId, matches, n) {
  return matches
    .filter((m) => matchResult(m))
    .sort((a, b) => whenOf(b) - whenOf(a))
    .slice(0, n)
    .reverse()
    .map((m) => {
      const r = matchResult(m);
      const mine = m.teamAId === teamId ? r.setsA : r.setsB;
      const theirs = m.teamAId === teamId ? r.setsB : r.setsA;
      return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
    });
}

const MATCH_SELECT = {
  id: true, teamAId: true, teamBId: true, finishedAt: true, scheduledAt: true,
  tournament: { select: { id: true, name: true, year: true } },
  sets: { select: { winnerTeamId: true } },
};

// Campeones por torneo y títulos por equipo
router.get('/champions', async (req, res) => {
  try {
    const f = tournamentFilter(req.query);
    if (f.error) return res.status(400).json({ error: f.error });
    const rows = await prisma.tournament.findMany({
      where: { ...f.where, status: 'FINISHED' },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, year: true, edition: true, branch: true, modality: true, championId: true,
        champion: { select: TEAM_SELECT },
      },
    });
    // Si el torneo se cerró sin guardar campeón, se deduce de la final
    const missing = await resolveChampions(rows.filter((t) => !t.championId).map((t) => t.id));
    const teams = missing.size ? await prisma.team.findMany({ where: { id: { in: [...new Set(missing.values())] } }, select: TEAM_SELECT }) : [];
    const list = rows
      .map((t) => ({ ...t, champion: t.champion ?? teams.find((x) => x.id === missing.get(t.id)) ?? null }))
      .filter((t) => t.champion)
      .map(({ championId, ...t }) => t);
    const pods = await podiums(rows.map((t) => ({ id: t.id, championId: t.championId ?? missing.get(t.id) ?? null })));
    for (const t of list) t.podium = pods.get(t.id) ?? null;
    const titles = new Map();
    for (const t of list) {
      const e = titles.get(t.champion.id) || { team: t.champion, titles: 0 };
      e.titles++;
      titles.set(t.champion.id, e);
    }
    res.json({
      tournaments: list,
      titles: [...titles.values()].sort((a, b) => b.titles - a.titles || a.team.name.localeCompare(b.team.name)),
    });
  } catch (err) {
    fail(err, res);
  }
});

// Historial de un equipo: récord, títulos y posición en cada torneo
router.get('/teams/:id', async (req, res) => {
  try {
    const f = tournamentFilter(req.query);
    if (f.error) return res.status(400).json({ error: f.error });
    const team = await prisma.team.findUnique({ where: { id: req.params.id }, select: TEAM_SELECT });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });
    const tournament = f.where;

    const [matches, titles, standings, enrolled] = await Promise.all([
      prisma.match.findMany({
        where: { status: 'FINISHED', hiddenAt: null, OR: [{ teamAId: team.id }, { teamBId: team.id }], tournament },
        select: MATCH_SELECT,
      }),
      prisma.tournament.findMany({
        where: { ...tournament, championId: team.id, status: 'FINISHED' },
        orderBy: [{ year: 'desc' }],
        select: { id: true, name: true, year: true, edition: true },
      }),
      prisma.stageStanding.findMany({
        where: { teamId: team.id, stage: { tournament } },
        select: {
          position: true, points: true, played: true, tied: true, zone: true,
          stage: { select: { name: true, tournament: { select: { id: true, name: true, year: true } } } },
        },
      }),
      prisma.tournamentTeam.count({ where: { teamId: team.id, tournament } }),
    ]);

    const career = await teamCareer(team.id, tournament).catch((e) => { console.error('[career]', e.message); return []; });
    // Títulos: guardados al cerrar + deducidos de la final si el campeón no quedó guardado
    const known = new Set(titles.map((x) => x.id));
    const titlesAll = [
      ...titles,
      ...career.filter((c) => c.result?.kind === 'CHAMPION' && c.status === 'FINISHED' && !known.has(c.tournamentId))
        .map((c) => ({ id: c.tournamentId, name: c.tournament, year: c.year, edition: c.edition })),
    ];

    res.json({
      team,
      career,
      tournamentsPlayed: enrolled,
      titles: titlesAll.length,
      titlesList: titlesAll,
      record: tally(team.id, matches),
      form: formOf(team.id, matches, 5),
      history: standings
        .map((s) => ({
          tournamentId: s.stage.tournament.id,
          tournament: s.stage.tournament.name,
          year: s.stage.tournament.year,
          stage: s.stage.name,
          position: s.position,
          points: s.points,
          played: s.played,
          tied: s.tied,
          zone: s.zone,
        }))
        .sort((a, b) => b.year - a.year || a.tournament.localeCompare(b.tournament)),
    });
  } catch (err) {
    fail(err, res);
  }
});

// Historial entre dos equipos: ?teamA=&teamB=
router.get('/head-to-head', async (req, res) => {
  try {
    const f = tournamentFilter(req.query);
    if (f.error) return res.status(400).json({ error: f.error });
    const a = String(req.query.teamA || '');
    const b = String(req.query.teamB || '');
    if (!a || !b || a === b) return res.status(400).json({ error: 'Indicá teamA y teamB (distintos)' });
    const teams = await prisma.team.findMany({ where: { id: { in: [a, b] } }, select: TEAM_SELECT });
    if (teams.length !== 2) return res.status(404).json({ error: 'Equipo no encontrado' });

    const matches = await prisma.match.findMany({
      where: {
        status: 'FINISHED',
        hiddenAt: null,
        tournament: f.where,
        OR: [{ teamAId: a, teamBId: b }, { teamAId: b, teamBId: a }],
      },
      orderBy: [{ finishedAt: 'desc' }],
      select: MATCH_SELECT,
    });
    const list = matches
      .map((m) => {
        const r = matchResult(m);
        if (!r) return null;
        return {
          id: m.id,
          tournament: m.tournament,
          date: m.finishedAt || m.scheduledAt,
          setsA: m.teamAId === a ? r.setsA : r.setsB,
          setsB: m.teamAId === a ? r.setsB : r.setsA,
        };
      })
      .filter(Boolean);
    const rec = (x, y) => list.reduce((n, m) => n + (m[x] > m[y] ? 1 : 0), 0);
    res.json({
      teamA: teams.find((t) => t.id === a),
      teamB: teams.find((t) => t.id === b),
      played: list.length,
      winsA: rec('setsA', 'setsB'),
      winsB: rec('setsB', 'setsA'),
      draws: list.filter((m) => m.setsA === m.setsB).length,
      matches: list,
    });
  } catch (err) {
    fail(err, res);
  }
});

// Resumen general: totales, ranking histórico y récords (mismos filtros que el resto)
router.get('/records', async (req, res) => {
  try {
    const f = tournamentFilter(req.query);
    if (f.error) return res.status(400).json({ error: f.error });
    const tournament = f.where;
    const [matches, tournaments, champRows] = await Promise.all([
      prisma.match.findMany({
        where: { status: 'FINISHED', hiddenAt: null, teamAId: { not: null }, teamBId: { not: null }, tournament },
        select: {
          ...MATCH_SELECT,
          teamA: { select: TEAM_SELECT },
          teamB: { select: TEAM_SELECT },
        },
      }),
      prisma.tournamentTeam.findMany({ where: { tournament }, select: { teamId: true, tournamentId: true } }),
      prisma.tournament.findMany({ where: { ...tournament, status: 'FINISHED' }, select: { id: true, championId: true } }),
    ]);

    const teams = new Map();
    const get = (t) => { if (!teams.has(t.id)) teams.set(t.id, { team: t, played: 0, won: 0, drawn: 0, lost: 0, titles: 0 }); return teams.get(t.id); };
    let sets = 0;
    let blowout = null;
    let longest = null;
    const ordered = matches.filter((m) => matchResult(m)).sort((a, b) => whenOf(a) - whenOf(b));
    const run = new Map(); // equipo -> racha de victorias en curso
    let streak = null;
    for (const m of ordered) {
      const r = matchResult(m);
      sets += r.setsA + r.setsB;
      const a = get(m.teamA);
      const b = get(m.teamB);
      a.played++; b.played++;
      if (r.setsA > r.setsB) { a.won++; b.lost++; } else if (r.setsA < r.setsB) { b.won++; a.lost++; } else { a.drawn++; b.drawn++; }
      const winner = r.setsA > r.setsB ? m.teamA : r.setsA < r.setsB ? m.teamB : null;
      for (const t of [m.teamA, m.teamB]) {
        const n = winner && winner.id === t.id ? (run.get(t.id) ?? 0) + 1 : 0;
        run.set(t.id, n);
        if (n && (!streak || n > streak.n)) streak = { team: t, n };
      }
      const diff = Math.abs(r.setsA - r.setsB);
      if (diff && (!blowout || diff > blowout.diff)) blowout = { diff, winner: r.setsA > r.setsB ? m.teamA : m.teamB, loser: r.setsA > r.setsB ? m.teamB : m.teamA, score: [Math.max(r.setsA, r.setsB), Math.min(r.setsA, r.setsB)], tournament: m.tournament?.name ?? null };
      if (!longest || r.setsA + r.setsB > longest.sets) longest = { sets: r.setsA + r.setsB, teamA: m.teamA, teamB: m.teamB, tournament: m.tournament?.name ?? null };
    }

    // Títulos (si el torneo se cerró sin campeón guardado, se deduce de la final)
    const missing = await resolveChampions(champRows.filter((t) => !t.championId).map((t) => t.id));
    const champIds = champRows.map((t) => t.championId ?? missing.get(t.id)).filter(Boolean);
    const champTeams = champIds.length ? await prisma.team.findMany({ where: { id: { in: [...new Set(champIds)] } }, select: TEAM_SELECT }) : [];
    for (const id of champIds) {
      const t = champTeams.find((x) => x.id === id);
      if (t) get(t).titles++;
    }

    const rows = [...teams.values()].map((e) => ({ ...e, pct: e.played ? Math.round((e.won / e.played) * 100) : 0 }));
    const ranking = rows
      .sort((a, b) => b.titles - a.titles || b.pct - a.pct || b.played - a.played || a.team.name.localeCompare(b.team.name))
      .slice(0, 10);
    const unbeaten = rows.filter((e) => e.played >= 3 && e.lost === 0).sort((a, b) => b.played - a.played)[0] ?? null;

    res.json({
      totals: {
        matches: ordered.length,
        sets,
        tournaments: champRows.length,
        teams: new Set(tournaments.map((x) => x.teamId)).size,
      },
      ranking,
      records: {
        streak,
        blowout,
        longest,
        unbeaten: unbeaten ? { team: unbeaten.team, played: unbeaten.played } : null,
      },
    });
  } catch (err) {
    fail(err, res);
  }
});

module.exports = router;