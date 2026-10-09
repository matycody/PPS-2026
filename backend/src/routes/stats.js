const express = require('express');
const prisma = require('../db');
const { matchResult } = require('../services/bracket');

const router = express.Router();
const TEAM_SELECT = { id: true, name: true, logo: true };

function fail(err, res) {
  if (err && err.name === 'PrismaClientValidationError') return res.status(400).json({ error: 'Filtro inválido' });
  console.error('[stats]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// Filtros comunes: yearFrom, yearTo, branch, modality (sobre el torneo del partido)
function tournamentFilter(q) {
  const where = {};
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
    const list = await prisma.tournament.findMany({
      where: { ...f.where, status: 'FINISHED', championId: { not: null } },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, year: true, edition: true, branch: true, modality: true,
        champion: { select: TEAM_SELECT },
      },
    });
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

    res.json({
      team,
      tournamentsPlayed: enrolled,
      titles: titles.length,
      titlesList: titles,
      record: tally(team.id, matches),
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

module.exports = router;