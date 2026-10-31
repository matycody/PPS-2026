const express = require('express');
const prisma = require('../db');
const { VENUE_SELECT } = require('../lib/venue');
const storage = require('../services/storage');
const { activeSuspensions } = require('../services/sanctions');

// Banner público del jugador. Solo muestra los datos que la persona marcó como públicos
// (apodo, número, edad, foto); nunca DNI, mail ni fecha de nacimiento.
const router = express.Router();

const teamSel = { select: { id: true, name: true, logo: true } };
const matchSelect = {
  id: true, status: true, court: true, branch: true, modality: true, scheduledAt: true, timeSet: true, finishedAt: true, statusReason: true,
  tournament: { select: { id: true, name: true } },
  venue: { select: VENUE_SELECT },
  teamA: teamSel,
  teamB: teamSel,
  teamAId: true,
  teamBId: true,
  sets: { select: { number: true, winnerTeamId: true }, orderBy: { number: 'asc' } },
};

function score(m) {
  const win = m.modality === 'CLOTH' ? 2 : 1;
  let a = 0;
  let b = 0;
  for (const s of m.sets) {
    if (!s.winnerTeamId) {
      if (m.modality === 'CLOTH') { a += 1; b += 1; }
    } else if (s.winnerTeamId === m.teamAId) a += win;
    else if (s.winnerTeamId === m.teamBId) b += win;
  }
  return { teamA: a, teamB: b };
}

const shape = ({ teamAId, teamBId, sets, ...m }) => ({ ...m, score: score({ ...m, teamAId, teamBId, sets }) });

function ageOf(birth) {
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

router.get('/:id', async (req, res) => {
  try {
    const p = await prisma.profile.findUnique({
      where: { id: req.params.id },
      include: {
        teams: {
          orderBy: { from: 'desc' },
          include: { team: { select: { id: true, name: true, logo: true, modalities: true } } },
        },
      },
    });
    if (!p || !p.isPlayer || !p.active) return res.status(404).json({ error: 'Jugador no encontrado' });

    const photoUrl = p.showPhoto && p.photo ? await storage.signedUrl(p.photo) : null;

    const current = p.teams.filter((t) => !t.to);
    const past = p.teams.filter((t) => t.to);

    // Partidos de sus equipos en la rama donde juega y mientras estuvo en el equipo
    // (el sistema no guarda la alineación de cada partido)
    const windows = p.teams.map((t) => ({
      branch: t.branch,
      scheduledAt: t.to ? { gte: t.from, lte: t.to } : { gte: t.from },
      OR: [{ teamAId: t.teamId }, { teamBId: t.teamId }],
    }));
    const base = {
      hiddenAt: null,
      OR: [{ tournamentId: null }, { tournament: { status: { not: 'DRAFT' } } }],
      AND: [{ OR: windows }],
    };

    const [next, recent] = windows.length
      ? await Promise.all([
          prisma.match.findMany({
            where: { ...base, status: { in: ['LIVE', 'READY', 'SCHEDULED', 'SUSPENDED'] } },
            select: matchSelect,
            orderBy: [{ scheduledAt: 'asc' }],
            take: 10,
          }),
          prisma.match.findMany({
            where: { ...base, status: 'FINISHED' },
            select: matchSelect,
            orderBy: [{ scheduledAt: { sort: 'desc', nulls: 'last' } }],
          }),
        ])
      : [[], []];

    // Resultados de sus equipos mientras formó parte (el sistema no guarda la alineación de cada partido)
    const finished = recent.map((m) => ({ m, sc: score(m) }));
    const tally = (list, teamIdsOf) => {
      const t = { played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
      for (const { m, sc } of list) {
        const mineIsA = teamIdsOf.includes(m.teamAId);
        const mine = mineIsA ? sc.teamA : sc.teamB;
        const other = mineIsA ? sc.teamB : sc.teamA;
        t.played++;
        t.pointsFor += mine;
        t.pointsAgainst += other;
        if (mine > other) t.won++;
        else if (mine < other) t.lost++;
        else t.drawn++;
      }
      return t;
    };
    const myTeamIds = p.teams.map((t) => t.teamId);
    const inStint = (t) => finished.filter(({ m }) => (m.teamAId === t.teamId || m.teamBId === t.teamId) && m.branch === t.branch
      && m.scheduledAt && m.scheduledAt >= t.from && (!t.to || m.scheduledAt <= t.to));
    const stats = {
      total: tally(finished, myTeamIds),
      FOAM: tally(finished.filter(({ m }) => m.modality === 'FOAM'), myTeamIds),
      CLOTH: tally(finished.filter(({ m }) => m.modality === 'CLOTH'), myTeamIds),
    };
    const stintStats = (t) => { const x = tally(inStint(t), [t.teamId]); return { played: x.played, won: x.won }; };

    const suspension = (await activeSuspensions([p.id]).catch(() => new Map())).get(p.id) || null;

    res.json({
      id: p.id,
      name: p.name,
      nickname: p.showNickname ? p.nickname : null,
      number: p.showNumber ? p.number : null,
      age: p.showAge && p.birthDate ? ageOf(p.birthDate) : null,
      photoUrl,
      teams: current.map((t) => ({
        teamId: t.team.id, name: t.team.name, logo: t.team.logo, branch: t.branch,
        modalities: t.team.modalities.map((m) => m.modality), since: t.from, coach: t.isCoach, stint: stintStats(t),
      })),
      history: past.map((t) => ({ teamId: t.team.id, name: t.team.name, logo: t.team.logo, branch: t.branch, from: t.from, to: t.to, stint: stintStats(t) })),
      next: next.map(shape),
      recent: recent.slice(0, 15).map(shape),
      stats,
      suspension,
    });
  } catch (err) {
    console.error('[players]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
