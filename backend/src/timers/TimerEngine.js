// backend/src/timers/TimerEngine.js

const MATCH_DURATION_SECONDS = 20 * 60; // 20 minutos
const SET_DURATION_SECONDS = 3 * 60;    // 3 minutos

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

class TimerEngine {
  /**
   * @param {string} matchId - UUID del partido
   * @param {object} callbacks - funciones a ejecutar en cada evento
   *   onTick({ matchTime, setTime })
   *   onSetExpired({ action })
   *   onEnded()
   */
  constructor(matchId, callbacks = {}) {
    this.matchId = matchId;
    this.callbacks = callbacks;

    this.modality = "foam"; // default, se puede cambiar con setModality()
    this.matchTimeLeft = MATCH_DURATION_SECONDS;
    this.setTimeLeft = SET_DURATION_SECONDS;

    this.isPaused = true; // arranca pausado hasta que llamen start()
    this.intervalId = null;
  }

  setModality(modality) {
    if (modality !== "foam" && modality !== "cloth") {
      throw new Error(`Modalidad inválida: ${modality}`);
    }
    this.modality = modality;
  }

  start() {
    if (this.intervalId) return; // ya está corriendo, no duplicar

    this.isPaused = false;
    this.intervalId = setInterval(() => this._tick(), 1000);
  }

  pause() {
    this.isPaused = true;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  resume() {
    if (this.matchTimeLeft <= 0) return; // no reanudar un partido ya terminado
    this.start();
  }

  reset(timer) {
    if (timer === "match") {
      this.matchTimeLeft = MATCH_DURATION_SECONDS;
    } else if (timer === "set") {
      this.setTimeLeft = SET_DURATION_SECONDS;
    } else {
      throw new Error(`Timer inválido: ${timer}`);
    }
  }

  adjust(timer, seconds) {
    if (timer === "match") {
      this.matchTimeLeft = Math.max(0, this.matchTimeLeft + seconds);
    } else if (timer === "set") {
      this.setTimeLeft = Math.max(0, this.setTimeLeft + seconds);
    } else {
      throw new Error(`Timer inválido: ${timer}`);
    }
  }

  _tick() {
    if (this.matchTimeLeft > 0) this.matchTimeLeft--;
    if (this.setTimeLeft > 0) this.setTimeLeft--;

    // Avisar el tiempo actual formateado
    if (this.callbacks.onTick) {
      this.callbacks.onTick({
        matchTime: formatTime(this.matchTimeLeft),
        setTime: formatTime(this.setTimeLeft),
      });
    }

    // Chequear si el set expiró
    if (this.setTimeLeft === 0) {
      const action = this.modality === "cloth" ? "resetWithBonus" : "suddenDeath";

      if (this.callbacks.onSetExpired) {
        this.callbacks.onSetExpired({ action });
      }

      if (this.modality === "cloth") {
        this.setTimeLeft = SET_DURATION_SECONDS; // reinicia el set automáticamente
      }
      // en foam (muerte súbita) el set queda en 0 hasta que alguien resetee manualmente
    }

    // Chequear si el partido terminó
    if (this.matchTimeLeft === 0) {
      this.pause();
      if (this.callbacks.onEnded) {
        this.callbacks.onEnded();
      }
    }
  }
}

module.exports = TimerEngine;