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

/**
 * Registra todos los handlers de eventos de un partido para una conexión de socket.
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerMatchHandlers(io, socket) {

  // Callbacks que le pasamos a cada TimerEngine para que avise por socket
  function buildCallbacks(matchId) {
    return {
      onTick: ({ matchTime, setTime }) => {
        io.emit(SERVER_EVENTS.MATCH_TICK, { matchId, matchTime, setTime });
      },
      onSetExpired: ({ action }) => {
        const match = getMatch(matchId);
        io.emit(SERVER_EVENTS.MATCH_SET_EXPIRED, {
          matchId,
          modality: match?.modality,
          action,
        });
      },
      onEnded: () => {
        io.emit(SERVER_EVENTS.MATCH_ENDED, { matchId });
      },
    };
  }

  socket.on(CLIENT_EVENTS.MATCH_START, ({ matchId }) => {
    if (!matchId) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { message: "Falta matchId" });
    }
    const match = getOrCreateMatch(matchId, buildCallbacks(matchId));
    match.start();
  });

  socket.on(CLIENT_EVENTS.MATCH_PAUSE, ({ matchId, scope }) => {
    if (scope === "group") {
      const pausedIds = pauseAllMatches();
      io.emit(SERVER_EVENTS.MATCH_PAUSED, { matchId: pausedIds, scope: "group" });
      return;
    }

    const ok = pauseMatch(matchId);
    if (!ok) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    io.emit(SERVER_EVENTS.MATCH_PAUSED, { matchId, scope: "individual" });
  });

  socket.on(CLIENT_EVENTS.MATCH_RESUME, ({ matchId, scope }) => {
    if (scope === "group") {
      const resumedIds = resumeAllMatches();
      io.emit(SERVER_EVENTS.MATCH_RESUMED, { matchId: resumedIds, scope: "group" });
      return;
    }

    const ok = resumeMatch(matchId);
    if (!ok) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    io.emit(SERVER_EVENTS.MATCH_RESUMED, { matchId, scope: "individual" });
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

  socket.on(CLIENT_EVENTS.MATCH_SET_MODALITY, ({ matchId, modality }) => {
    const match = getMatch(matchId);
    if (!match) {
      return socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message: "Partido no encontrado" });
    }
    match.setModality(modality);
  });
}

module.exports = { registerMatchHandlers };