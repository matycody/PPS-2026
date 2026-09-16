// backend/src/sockets/matchSocket.js

const { CLIENT_EVENTS, SERVER_EVENTS } = require("../timers/timerEvents");
const {
  getOrCreateMatch,
  getMatch,
  pauseMatch,
  pauseAllMatches,
  resumeMatch,
  resumeAllMatches,
} = require("../timers/matchManager");

function registerMatchHandlers(io, socket) {

  function buildCallbacks(matchId) {
    return {
      onTick: ({ matchTime, setTime, isMatchPaused, isSetPaused, matchHalf }) => {
        io.emit(SERVER_EVENTS.MATCH_TICK, {
          matchId,
          matchTime,
          setTime,
          isMatchPaused,
          isSetPaused,
          matchHalf,
        });
      },
      onSetExpired: ({ action, message }) => {
        const match = getMatch(matchId);
        io.emit(SERVER_EVENTS.MATCH_SET_EXPIRED, {
          matchId,
          modality: match?.modality,
          action,
          message,
        });
      },
      onMatchFinished: () => {
        io.emit(SERVER_EVENTS.MATCH_FINISHED, {
          matchId,
          message: "SE TERMINÓ EL PARTIDO",
        });
      },
    };
  }

  socket.on(CLIENT_EVENTS.MATCH_START, ({ matchId, target }) => {
    if (!matchId) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { message: "Falta matchId" });
    }
    const match = getOrCreateMatch(matchId, buildCallbacks(matchId));
    match.start(target || "both");
  });

  socket.on(CLIENT_EVENTS.MATCH_PAUSE, ({ matchId, scope, target }) => {
    if (scope === "group") {
      const pausedIds = pauseAllMatches(target || "both");
      io.emit(SERVER_EVENTS.MATCH_PAUSED, { matchId: pausedIds, scope: "group", target: target || "both" });
      return;
    }

    const ok = pauseMatch(matchId, target || "both");
    if (!ok) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    io.emit(SERVER_EVENTS.MATCH_PAUSED, { matchId, scope: "individual", target: target || "both" });
  });

  socket.on(CLIENT_EVENTS.MATCH_RESUME, ({ matchId, scope, target }) => {
    if (scope === "group") {
      const resumedIds = resumeAllMatches(target || "both");
      io.emit(SERVER_EVENTS.MATCH_RESUMED, { matchId: resumedIds, scope: "group", target: target || "both" });
      return;
    }

    const ok = resumeMatch(matchId, target || "both");
    if (!ok) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    io.emit(SERVER_EVENTS.MATCH_RESUMED, { matchId, scope: "individual", target: target || "both" });
  });

  socket.on(CLIENT_EVENTS.MATCH_RESET, ({ matchId, timer }) => {
    const match = getMatch(matchId);
    if (!match) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    match.reset(timer);
  });

  socket.on(CLIENT_EVENTS.MATCH_ADJUST, ({ matchId, timer, seconds }) => {
    const match = getMatch(matchId);
    if (!match) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    match.adjust(timer, seconds);
  });

  socket.on(CLIENT_EVENTS.MATCH_SET_TIME, ({ matchId, timer, totalSeconds }) => {
    const match = getMatch(matchId);
    if (!match) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    match.setTime(timer, totalSeconds);
  });

  socket.on(CLIENT_EVENTS.MATCH_SET_MODALITY, ({ matchId, modality }) => {
    const match = getMatch(matchId);
    if (!match) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    match.setModality(modality);
  });

  socket.on(CLIENT_EVENTS.MATCH_SET_HALF, ({ matchId, half }) => {
    const match = getMatch(matchId);
    if (!match) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    match.setHalf(half);
  });

  socket.on(CLIENT_EVENTS.MATCH_FINISH_HALF, ({ matchId }) => {
    const match = getMatch(matchId);
    if (!match) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    match.finishHalf();
  });
}

module.exports = { registerMatchHandlers };