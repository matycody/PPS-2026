const prisma = require('../db');
const { SERVER_EVENTS } = require('../timers/timerEvents');
const { getPermissions } = require('./matchAccess');
const { setsWithScore } = require('./scoreTimeline');
const authCache = require('./authCache');
const { getMatch } = require('../timers/matchManager');

const FEED_ROOM = 'matches:all';
const matchRoom = (id) => 'match:' + id;

// Los permisos dependen del estado del partido: al cambiar, se reenvían a quienes están en la room de control
async function pushPermissions(io, m) {
  try {
    const sockets = await io.in('control:' + m.id).fetchSockets();
    for (const s of sockets) {
      const session = s.data && s.data.user;
      if (!session) continue;
      const user = await prisma.user.findUnique({ where: { id: session.id } });
      if (!user || !user.active) continue;
      const perms = await getPermissions(user, m);
      s.emit(SERVER_EVENTS.MATCH_PERMISSIONS, {
        matchId: m.id,
        status: m.status,
        isTable: perms.isTable,
        isReferee: perms.isReferee,
        canControlClock: perms.canControlClock,
        canReady: perms.canReady,
        canUnready: perms.canUnready,
        canAddSets: perms.canAddSets,
        canEditResult: perms.canEditResult,
        canFinish: perms.canFinish,
      });
    }
  } catch (err) {
    console.error('[notify:permissions]', err);
  }
}

// Avisa a los espectadores el estado público actual de un partido
async function notifyMatch(io, matchId) {
  try {
    if (!io) return;
    authCache.clearMatch(matchId);
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

    // Si el partido ya no está Habilitado ni En vivo (finalizado, cancelado, suspendido, reprogramado o deshabilitado),
    // el reloj no puede seguir corriendo: se frena y se avisa el estado a quienes lo miran
    if (m.status !== 'READY' && m.status !== 'LIVE') {
      const engine = getMatch(matchId);
      if (engine) {
        if (engine.timeoutTeam !== null) engine.endTimeout();
        engine.pause('both');
      }
      // El partido ya no está en juego: se descarta el reloj guardado (si no, se recuperaría al reiniciar)
      require('../timers/clockStore').remove(matchId);
    }

    let a = 0;
    let b = 0;
    const win = m.modality === 'CLOTH' ? 2 : 1;
    for (const s of m.sets) {
      if (!s.winnerTeamId) {
        if (m.modality === 'CLOTH') {
          a += 1;
          b += 1;
        }
      } else if (s.winnerTeamId === m.teamAId) a += win;
      else if (s.winnerTeamId === m.teamBId) b += win;
    }

    pushPermissions(io, m);

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
      statusReason: m.statusReason ?? null,
      originalScheduledAt: m.originalScheduledAt ?? null,
      teamA: m.teamA,
      teamB: m.teamB,
      sets: setsWithScore(m),
      score: { teamA: a, teamB: b },
    });
  } catch (err) {
    console.error('[notify]', err);
  }
}

module.exports = { notifyMatch, FEED_ROOM };
