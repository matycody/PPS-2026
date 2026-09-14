// backend/src/timers/timerEvents.js

// Eventos que el FRONTEND emite (nosotros escuchamos)
const CLIENT_EVENTS = {
  MATCH_START: "match:start",
  MATCH_PAUSE: "match:pause",
  MATCH_RESUME: "match:resume",
  MATCH_RESET: "match:reset",
  MATCH_ADJUST: "match:adjust",
  MATCH_SET_TIME: "match:setTime",
  MATCH_SET_MODALITY: "match:setModality",
  MATCH_SET_HALF: "match:setHalf",
  MATCH_FINISH_HALF: "match:finishHalf",
};

// Eventos que el BACKEND emite (nosotros mandamos)
const SERVER_EVENTS = {
  MATCH_TICK: "match:tick",
  MATCH_SET_EXPIRED: "match:setExpired",
  MATCH_ENDED: "match:ended",
  MATCH_FINISHED: "match:finished",
  MATCH_PAUSED: "match:paused",
  MATCH_RESUMED: "match:resumed",
  MATCH_ERROR: "match:error",
};

module.exports = { CLIENT_EVENTS, SERVER_EVENTS };