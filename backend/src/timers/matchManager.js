// backend/src/timers/matchManager.js

const TimerEngine = require("./TimerEngine");

const activeMatches = new Map();

function getOrCreateMatch(matchId, callbacks) {
  if (!activeMatches.has(matchId)) {
    activeMatches.set(matchId, new TimerEngine(matchId, callbacks));
  }
  return activeMatches.get(matchId);
}

function getMatch(matchId) {
  return activeMatches.get(matchId);
}

function removeMatch(matchId) {
  const match = activeMatches.get(matchId);
  if (match) {
    match.pause("both");
    activeMatches.delete(matchId);
  }
}

function pauseMatch(matchId, target = "both") {
  const match = getMatch(matchId);
  if (!match) return false;
  match.pause(target);
  return true;
}

function pauseAllMatches(target = "both") {
  const pausedIds = [];
  for (const [matchId, match] of activeMatches.entries()) {
    match.pause(target);
    pausedIds.push(matchId);
  }
  return pausedIds;
}

function resumeMatch(matchId, target = "both") {
  const match = getMatch(matchId);
  if (!match) return false;
  match.resume(target);
  return true;
}

function resumeAllMatches(target = "both") {
  const resumedIds = [];
  for (const [matchId, match] of activeMatches.entries()) {
    match.resume(target);
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