// backend/src/timers/matchManager.js

const TimerEngine = require("./TimerEngine");

// Diccionario en memoria: matchId -> instancia de TimerEngine
const activeMatches = new Map();

/**
 * Crea (o devuelve si ya existe) el TimerEngine de un partido.
 */
function getOrCreateMatch(matchId, callbacks) {
  if (!activeMatches.has(matchId)) {
    activeMatches.set(matchId, new TimerEngine(matchId, callbacks));
  }
  return activeMatches.get(matchId);
}

/**
 * Busca un partido existente. Devuelve undefined si no existe.
 */
function getMatch(matchId) {
  return activeMatches.get(matchId);
}

/**
 * Elimina un partido de la memoria (por ejemplo, cuando termina).
 */
function removeMatch(matchId) {
  const match = activeMatches.get(matchId);
  if (match) {
    match.pause(); // por seguridad, frenamos el interval antes de borrar
    activeMatches.delete(matchId);
  }
}

/**
 * Pausa UN partido puntual (scope: "individual").
 */
function pauseMatch(matchId) {
  const match = getMatch(matchId);
  if (!match) return false;
  match.pause();
  return true;
}

/**
 * Pausa TODOS los partidos activos (scope: "group").
 * Devuelve la lista de matchIds que efectivamente se pausaron.
 */
function pauseAllMatches() {
  const pausedIds = [];
  for (const [matchId, match] of activeMatches.entries()) {
    match.pause();
    pausedIds.push(matchId);
  }
  return pausedIds;
}

/**
 * Reanuda UN partido puntual.
 */
function resumeMatch(matchId) {
  const match = getMatch(matchId);
  if (!match) return false;
  match.resume();
  return true;
}

/**
 * Reanuda TODOS los partidos activos.
 */
function resumeAllMatches() {
  const resumedIds = [];
  for (const [matchId, match] of activeMatches.entries()) {
    match.resume();
    resumedIds.push(matchId);
  }
  return resumedIds;
}

module.exports = {
  getOrCreateMatch,
  getMatch,
  removeMatch,
  pauseMatch,
  pauseAllMatches,
  resumeMatch,
  resumeAllMatches,
};