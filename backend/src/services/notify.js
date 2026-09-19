const prisma = require('../db');
const { SERVER_EVENTS } = require('../timers/timerEvents');

const FEED_ROOM = 'matches:all';
const matchRoom = (id) => 'match:' + id;

// Avisa a los espectadores el estado público actual de un partido
async function notifyMatch(io, matchId) {
  try {
    if (!io) return;
    const m = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: { select: { id: true, name: true } },
        teamA: { select: { id: true, name: true, logo: true } },
        teamB: { select: { id: true, name: true, logo: true } },
        sets: { orderBy: { number: 'asc' } },
      },
    });
    if (!m) return;

    let a = 0;
    let b = 0;
    for (const s of m.sets) {
      if (s.winnerTeamId && s.winnerTeamId === m.teamAId) a++;
      else if (s.winnerTeamId && s.winnerTeamId === m.teamBId) b++;
    }

    io.to([matchRoom(matchId), FEED_ROOM]).emit(SERVER_EVENTS.MATCH_UPDATED, {
      matchId: m.id,
      tournament: m.tournament,
      court: m.court,
      branch: m.branch,
      modality: m.modality,
      status: m.status,
      scheduledAt: m.scheduledAt,
      readyAt: m.readyAt,
      finishedAt: m.finishedAt,
      teamA: m.teamA,
      teamB: m.teamB,
      sets: m.sets.map((s) => ({ number: s.number, winnerTeamId: s.winnerTeamId })),
      score: { teamA: a, teamB: b },
    });
  } catch (err) {
    console.error('[notify]', err);
  }
}

module.exports = { notifyMatch, FEED_ROOM };
