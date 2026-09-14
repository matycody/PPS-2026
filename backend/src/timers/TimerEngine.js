// backend/src/timers/TimerEngine.js

const MATCH_DURATION_SECONDS = 20 * 60;
const SET_DURATION_SECONDS = 3 * 60;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

class TimerEngine {
  constructor(matchId, callbacks = {}) {
    this.matchId = matchId;
    this.callbacks = callbacks;

    this.modality = "foam";
    this.matchTimeLeft = MATCH_DURATION_SECONDS;
    this.setTimeLeft = SET_DURATION_SECONDS;
    this.matchHalf = 1; // 1 = primer tiempo, 2 = segundo tiempo — 100% manual

    this.isMatchPaused = true;
    this.isSetPaused = true;

    this.intervalId = null;
  }

  setModality(modality) {
    if (modality !== "foam" && modality !== "cloth") {
      throw new Error(`Modalidad inválida: ${modality}`);
    }
    this.modality = modality;
    this._emitState();
  }

  // Cambia manualmente el tiempo (1 o 2). El árbitro controla esto con botones.
  setHalf(half) {
    if (half !== 1 && half !== 2) {
      throw new Error(`Tiempo inválido: ${half}`);
    }
    this.matchHalf = half;
    this._emitState();
  }

  // El árbitro dictamina que el tiempo actual terminó.
  // Si era el 1er tiempo, pasa automáticamente al 2do.
  // Si era el 2do tiempo, el partido termina de verdad.
  finishHalf() {
    if (this.matchHalf === 1) {
      this.matchHalf = 2;
      this._emitState();
      return { matchEnded: false };
    } else {
      if (this.callbacks.onMatchFinished) {
        this.callbacks.onMatchFinished();
      }
      return { matchEnded: true };
    }
  }

  // target: "match" | "set" | "both"
  start(target = "both") {
    if (target === "match" || target === "both") this.isMatchPaused = false;
    if (target === "set" || target === "both") this.isSetPaused = false;

    this._ensureIntervalRunning();
    this._emitState();
  }

  pause(target = "both") {
    if (target === "match" || target === "both") this.isMatchPaused = true;
    if (target === "set" || target === "both") this.isSetPaused = true;

    this._stopIntervalIfFullyPaused();
    this._emitState();
  }

  resume(target = "both") {
    if (this.matchTimeLeft <= 0 && (target === "match" || target === "both")) {
      return;
    }
    this.start(target);
  }

  reset(timer) {
    if (timer === "match") {
      this.matchTimeLeft = MATCH_DURATION_SECONDS;
    } else if (timer === "set") {
      this.setTimeLeft = SET_DURATION_SECONDS;
    } else {
      throw new Error(`Timer inválido: ${timer}`);
    }
    this._emitState();
  }

  adjust(timer, seconds) {
    if (timer === "match") {
      this.matchTimeLeft = Math.max(0, this.matchTimeLeft + seconds);
    } else if (timer === "set") {
      this.setTimeLeft = Math.max(0, this.setTimeLeft + seconds);
    } else {
      throw new Error(`Timer inválido: ${timer}`);
    }
    this._emitState();
  }

  setTime(timer, totalSeconds) {
    const clamped = Math.max(0, Math.floor(totalSeconds));
    if (timer === "match") {
      this.matchTimeLeft = clamped;
    } else if (timer === "set") {
      this.setTimeLeft = clamped;
    } else {
      throw new Error(`Timer inválido: ${timer}`);
    }
    this._emitState();
  }

  _ensureIntervalRunning() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this._tick(), 1000);
  }

  _stopIntervalIfFullyPaused() {
    if (this.isMatchPaused && this.isSetPaused && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  _tick() {
    if (!this.isMatchPaused && this.matchTimeLeft > 0) this.matchTimeLeft--;
    if (!this.isSetPaused && this.setTimeLeft > 0) this.setTimeLeft--;

    this._emitState();

    if (this.setTimeLeft === 0 && !this.isSetPaused) {
      const action = this.modality === "cloth" ? "resetWithBonus" : "suddenDeath";
      const message =
        this.modality === "cloth"
          ? "SET TERMINADO"
          : "MUERTE SÚBITA (NO HAY ESCUDO)";

      if (this.callbacks.onSetExpired) {
        this.callbacks.onSetExpired({ action, message });
      }

      // Ambas modalidades quedan congeladas en 0:00 hasta reset manual del árbitro
      this.isSetPaused = true;
    }

    // El reloj de partido solo se pausa al llegar a 0.
    // El PARTIDO sigue en curso hasta que el árbitro apriete "Finalizar Tiempo".
    if (this.matchTimeLeft === 0 && !this.isMatchPaused) {
      this.isMatchPaused = true;
      this._stopIntervalIfFullyPaused();
    }
  }

  _emitState() {
    if (this.callbacks.onTick) {
      this.callbacks.onTick({
        matchTime: formatTime(this.matchTimeLeft),
        setTime: formatTime(this.setTimeLeft),
        isMatchPaused: this.isMatchPaused,
        isSetPaused: this.isSetPaused,
        matchHalf: this.matchHalf,
      });
    }
  }
}

module.exports = TimerEngine;