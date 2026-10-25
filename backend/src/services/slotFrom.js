const prisma = require('../db');
const { computeStandings } = require('./standings');
const { notifyMatch } = require('./notify');

const DONE = ['FINISHED', 'CANCELLED'];

// Cuando una zona termina, completa los lugares de las llaves que dependen de su tabla ("2° Zona A")
async function resolveFromSlots(io, tournamentId, leagueStageId) {
  const own = await prisma.match.findMany({ where: { stageId: leagueStageId, hiddenAt: null }, select: { status: true } });
  if (!own.length || own.some((m) => !DONE.includes(m.status))) return;

  const targets = await prisma.match.findMany({
    where: { tournamentId, status: 'SCHEDULED', hiddenAt: null, stage: { type: 'KNOCKOUT' } },
    select: { id: true, teamAId: true, teamBId: true, teamAFrom: true, teamBFrom: true },
  });
  const isMine = (f) => !!f && f.stageId === leagueStageId;
  const mine = targets.filter((m) => isMine(m.teamAFrom) || isMine(m.teamBFrom));
  if (!mine.length) return;

  const data = await computeStandings(tournamentId, leagueStageId);
  const zone = data && data.stages[0];
  if (!zone) return;
  const teamAt = (pos) => (zone.rows[pos - 1] ? zone.rows[pos - 1].team.id : null);

  for (const m of mine) {
    const patch = {};
    if (isMine(m.teamAFrom)) {
      const id = teamAt(m.teamAFrom.position);
      if (id && id !== m.teamAId) patch.teamAId = id;
    }
    if (isMine(m.teamBFrom)) {
      const id = teamAt(m.teamBFrom.position);
      if (id && id !== m.teamBId) patch.teamBId = id;
    }
    if (!Object.keys(patch).length) continue;
    await prisma.match.update({ where: { id: m.id }, data: patch });
    await notifyMatch(io, m.id);
  }
}

module.exports = { resolveFromSlots };