const express = require('express');
const prisma = require('../db');
const storage = require('../services/storage');

// Banner público del jugador. Solo muestra los datos que la persona marcó como públicos
// (apodo, número, edad, foto); nunca DNI, mail ni fecha de nacimiento.
const router = express.Router();

const teamSel = { select: { id: true, name: true, logo: true } };
const matchSelect = {
  id: true, status: true, court: true, branch: true, modality: true, scheduledAt: true, finishedAt: true, statusReason: true,
  tournament: { select: { id: true, name: true } },
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
            take: 15,
          }),
        ])
      : [[], []];

    res.json({
      id: p.id,
      name: p.name,
      nickname: p.showNickname ? p.nickname : null,
      number: p.showNumber ? p.number : null,
      age: p.showAge && p.birthDate ? ageOf(p.birthDate) : null,
      photoUrl,
      teams: current.map((t) => ({
        teamId: t.team.id, name: t.team.name, logo: t.team.logo, branch: t.branch,
        modalities: t.team.modalities.map((m) => m.modality), since: t.from, coach: t.isCoach,
      })),
      history: past.map((t) => ({ teamId: t.team.id, name: t.team.name, logo: t.team.logo, branch: t.branch, from: t.from, to: t.to })),
      next: next.map(shape),
      recent: recent.map(shape),
    });
  } catch (err) {
    console.error('[players]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
