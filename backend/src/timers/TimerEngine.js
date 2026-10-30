// backend/src/timers/TimerEngine.js

const MATCH_DURATION_SECONDS = 20 * 60;
const SET_DURATION_SECONDS = 3 * 60;
const TIMEOUT_DURATION_SECONDS = 60;
const YELLOW_SECONDS = 5 * 60; // amarilla: 5 minutos afuera
const BLUE_SECONDS = 3 * 60; // azul (Cloth): 3 minutos o 2 sets afuera
const BLUE_SETS = 2;
const newTimeoutsUsed = () => ({ A: { 1: false, 2: false }, B: { 1: false, 2: false } });

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
    this.timeoutTimeLeft = TIMEOUT_DURATION_SECONDS;
    this.timeoutTeam = null;
    this.isTimeoutRunning = false;
    this.timeoutsUsed = newTimeoutsUsed();
    this._resumeAfterTimeout = { match: false, set: false };
    this._timeoutHalf = null; // tiempo (1 o 2) en el que se pidió el tiempo muerto en curso
    this.matchTimeLeft = MATCH_DURATION_SECONDS;
    this.setTimeLeft = SET_DURATION_SECONDS;
    this.matchHalf = 1;
    this.clothAutoResetUsed = false;
    // Sancionados que cumplen tiempo afuera: [{ id, side, kind, label, left, setsLeft }]. Corren con el reloj del partido
    this.sanctions = [];
    // true cuando terminó el 2° tiempo y la mesa finalizó el partido (aún sin cerrarlo)
    this.matchEnded = false;

    this.isMatchPaused = true;
    this.isSetPaused = true;

    // true si el reloj se recuperó tras un reinicio del servidor; se apaga con la primera acción de la mesa
    this.recovered = false;

    this.intervalId = null;
  }

  // Estado completo para persistirlo (ver clockStore). Los tiempos son segundos restantes.
  toJSON() {
    return {
      matchTimeLeft: this.matchTimeLeft,
      setTimeLeft: this.setTimeLeft,
      timeoutTimeLeft: this.timeoutTimeLeft,
      isMatchPaused: this.isMatchPaused,
      isSetPaused: this.isSetPaused,
      isTimeoutRunning: this.isTimeoutRunning,
      matchHalf: this.matchHalf,
      clothAutoResetUsed: this.clothAutoResetUsed,
      matchEnded: this.matchEnded,
      sanctions: this.sanctions.map((x) => ({ ...x })),
      timeoutTeam: this.timeoutTeam,
      timeoutHalf: this._timeoutHalf,
      timeoutsUsed: JSON.parse(JSON.stringify(this.timeoutsUsed)),
      resumeAfterTimeout: { ...this._resumeAfterTimeout },
    };
  }

  // Recupera un estado guardado tras un reinicio. Siempre queda EN PAUSA (la mesa reanuda a mano):
  // un reloj que corría se detiene en el último valor guardado y un tiempo muerto en curso queda detenido.
  restore(s) {
    const int = (v, fallback, min = 0, max = Infinity) =>
      Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
    const used = (team) => ({ 1: Boolean(s.timeoutsUsed?.[team]?.[1]), 2: Boolean(s.timeoutsUsed?.[team]?.[2]) });

    this.matchTimeLeft = int(s.matchTimeLeft, MATCH_DURATION_SECONDS, 0, MATCH_DURATION_SECONDS);
    this.setTimeLeft = int(s.setTimeLeft, SET_DURATION_SECONDS, 0, SET_DURATION_SECONDS);
    this.timeoutTimeLeft = int(s.timeoutTimeLeft, TIMEOUT_DURATION_SECONDS, 0, TIMEOUT_DURATION_SECONDS);
    this.matchHalf = s.matchHalf === 2 ? 2 : 1;
    this.clothAutoResetUsed = Boolean(s.clothAutoResetUsed);
    this.matchEnded = Boolean(s.matchEnded);
    this.sanctions = Array.isArray(s.sanctions)
      ? s.sanctions
          .filter((x) => x && typeof x.id === "string" && (x.side === "A" || x.side === "B") && (x.kind === "YELLOW" || x.kind === "BLUE"))
          .map((x) => ({ id: x.id, side: x.side, kind: x.kind, label: String(x.label ?? "").slice(0, 60), left: int(x.left, 0, 0, YELLOW_SECONDS), setsLeft: x.kind === "BLUE" ? int(x.setsLeft, BLUE_SETS, 0, BLUE_SETS) : null }))
          .filter((x) => x.left > 0)
      : [];
    this.timeoutsUsed = { A: used("A"), B: used("B") };

    const hasTimeout = s.timeoutTeam === "A" || s.timeoutTeam === "B";
    this.timeoutTeam = hasTimeout ? s.timeoutTeam : null;
    this._timeoutHalf = hasTimeout ? (s.timeoutHalf === 2 ? 2 : 1) : null;
    // El tiempo muerto no sigue corriendo ni reanuda solo los relojes al terminarlo
    this.isTimeoutRunning = false;
    this._resumeAfterTimeout = { match: false, set: false };

    this.isMatchPaused = true;
    this.isSetPaused = true;
    this.recovered = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._emitState();
  }

  setModality(modality) {
    if (modality !== "foam" && modality !== "cloth") {
      throw new Error(`Modalidad inválida: ${modality}`);
    }
    this.modality = modality;
    this._emitState();
  }

  setHalf(half) {
    if (half !== 1 && half !== 2) {
      throw new Error(`Tiempo inválido: ${half}`);
    }
    this.matchHalf = half;
    this.matchEnded = false;
    this.clothAutoResetUsed = false;
    this._emitState();
  }

  finishHalf() {
    this._clearTimeout(this.matchHalf === 2);
    this.isMatchPaused = true;
    this.isSetPaused = true;
    this._stopIntervalIfFullyPaused();

    this.matchTimeLeft = MATCH_DURATION_SECONDS;
    this.setTimeLeft = SET_DURATION_SECONDS;
    this.clothAutoResetUsed = false;

    if (this.matchHalf === 1) {
      this.matchHalf = 2;
      this._emitState();
      return { matchEnded: false };
    } else {
      this.matchHalf = 1;
      this.matchEnded = true;
      this.sanctions.forEach((x) => this.callbacks.onSanctionEnd && this.callbacks.onSanctionEnd({ id: x.id, reason: "match" }));
      this.sanctions = [];
      this._emitState();

      if (this.callbacks.onMatchFinished) {
        this.callbacks.onMatchFinished();
      }
      return { matchEnded: true };
    }
  }

  // ---- Sanciones con tiempo afuera (amarilla y azul): corren con el reloj del partido ----
  addSanction({ id, side, kind, label }) {
    if (side !== "A" && side !== "B") return { ok: false, message: "Equipo inválido" };
    if (kind !== "YELLOW" && kind !== "BLUE") return { ok: false, message: "Esa sanción no tiene tiempo afuera" };
    this.sanctions.push({
      id,
      side,
      kind,
      label: String(label ?? "").slice(0, 60),
      left: kind === "YELLOW" ? YELLOW_SECONDS : BLUE_SECONDS,
      setsLeft: kind === "BLUE" ? BLUE_SETS : null,
    });
    this._emitState();
    return { ok: true };
  }

  removeSanction(id) {
    const before = this.sanctions.length;
    this.sanctions = this.sanctions.filter((x) => x.id !== id);
    if (this.sanctions.length !== before) this._emitState();
    return this.sanctions.length !== before;
  }

  // Se cargó el resultado de un set: a la azul le queda un set menos (se levanta a los 2 o a los 3 minutos, lo que ocurra primero)
  sanctionSetEnded() {
    const ended = [];
    this.sanctions.forEach((x) => {
      if (x.kind === "BLUE") x.setsLeft -= 1;
    });
    this.sanctions = this.sanctions.filter((x) => {
      if (x.kind === "BLUE" && x.setsLeft <= 0) { ended.push({ id: x.id, reason: "sets" }); return false; }
      return true;
    });
    if (ended.length) {
      ended.forEach((e) => this.callbacks.onSanctionEnd && this.callbacks.onSanctionEnd(e));
    }
    this._emitState();
  }

  start(target = "both") {
    if (this.timeoutTeam !== null) return;
    this.recovered = false;
    this.matchEnded = false;
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
      this.isSetPaused = true;
      this._stopIntervalIfFullyPaused();
    } else {
      throw new Error(`Timer inválido: ${timer}`);
    }
    this._emitState();
  }

  adjust(timer, seconds) {
    if (timer === "match") {
      this.matchTimeLeft = Math.max(0, this.matchTimeLeft + seconds);
      this._checkMatchExpiry();
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
      this._checkMatchExpiry();
    } else if (timer === "set") {
      this.setTimeLeft = clamped;
    } else {
      throw new Error(`Timer inválido: ${timer}`);
    }
    this._emitState();
  }

  // ---- Tiempo muerto: 1 minuto, 1 por equipo y por tiempo ----
  startTimeout(team) {
    if (team !== "A" && team !== "B") {
      return { ok: false, message: "Equipo inv\u00e1lido" };
    }
    if (this.timeoutTeam !== null) {
      return { ok: false, message: "Ya hay un tiempo muerto en curso" };
    }
    if (this.timeoutsUsed[team][this.matchHalf]) {
      return { ok: false, message: `El equipo ${team} ya us\u00f3 su tiempo muerto en este tiempo` };
    }
    this._resumeAfterTimeout = { match: !this.isMatchPaused, set: !this.isSetPaused };
    this.isMatchPaused = true;
    this.isSetPaused = true;
    this.timeoutsUsed[team][this.matchHalf] = true;
    this._timeoutHalf = this.matchHalf;
    this.timeoutTeam = team;
    this.timeoutTimeLeft = TIMEOUT_DURATION_SECONDS;
    this.isTimeoutRunning = true;
    this._ensureIntervalRunning();
    this._emitState();
    return { ok: true };
  }

  endTimeout() {
    if (this.timeoutTeam === null) {
      return { ok: false, message: "No hay un tiempo muerto en curso" };
    }
    const resume = this._resumeAfterTimeout;
    this._clearTimeout(false);
    if (resume.match && this.matchTimeLeft > 0) this.isMatchPaused = false;
    if (resume.set && this.setTimeLeft > 0) this.isSetPaused = false;
    if (!this.isMatchPaused || !this.isSetPaused) this._ensureIntervalRunning();
    else this._stopIntervalIfFullyPaused();
    this._emitState();
    return { ok: true };
  }

  // Deshace un tiempo muerto pedido por error: el equipo conserva su tiempo muerto y los relojes
  // vuelven a como estaban. Solo mientras corre; si ya terminó se usa endTimeout (Reanudar).
  cancelTimeout() {
    if (this.timeoutTeam === null) {
      return { ok: false, message: "No hay un tiempo muerto en curso" };
    }
    if (!this.isTimeoutRunning) {
      return { ok: false, message: "El tiempo muerto ya termin\u00f3: reanud\u00e1 el partido" };
    }
    const team = this.timeoutTeam;
    const half = this._timeoutHalf ?? this.matchHalf;
    if (this.timeoutsUsed[team]) this.timeoutsUsed[team][half] = false;
    const resume = this._resumeAfterTimeout;
    this._clearTimeout(false);
    if (resume.match && this.matchTimeLeft > 0) this.isMatchPaused = false;
    if (resume.set && this.setTimeLeft > 0) this.isSetPaused = false;
    if (!this.isMatchPaused || !this.isSetPaused) this._ensureIntervalRunning();
    else this._stopIntervalIfFullyPaused();
    this._emitState();
    return { ok: true };
  }

  _clearTimeout(resetUsed) {
    this.timeoutTeam = null;
    this.isTimeoutRunning = false;
    this.timeoutTimeLeft = TIMEOUT_DURATION_SECONDS;
    this._resumeAfterTimeout = { match: false, set: false };
    this._timeoutHalf = null;
    if (resetUsed) this.timeoutsUsed = newTimeoutsUsed();
  }

  _ensureIntervalRunning() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this._tick(), 1000);
  }

  _stopIntervalIfFullyPaused() {
    if (this.isMatchPaused && this.isSetPaused && !this.isTimeoutRunning && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Chequea si el reloj de partido llegó a 0 y, si es así, lo pausa y avisa.
  // Se llama desde _tick() (cuenta regresiva normal) Y desde adjust()/setTime()
  // (para cubrir el caso de que el 0 se alcance por un ajuste manual, no solo por el conteo).
  _checkMatchExpiry() {
    if (this.matchTimeLeft === 0 && !this.isMatchPaused) {
      this.isMatchPaused = true;
      this._stopIntervalIfFullyPaused();

      if (this.callbacks.onSetExpired) {
        const message =
          this.modality === "cloth"
            ? "SET FINALIZADO"
            : "MUERTE SÚBITA (NO HAY ESCUDO)";
        this.callbacks.onSetExpired({
          action: this.modality === "cloth" ? "resetWithBonus" : "suddenDeath",
          source: "match",
          message,
        });
      }
    }
  }

  _tick() {
    if (this.isTimeoutRunning && this.timeoutTimeLeft > 0) this.timeoutTimeLeft--;
    if (!this.isMatchPaused && this.matchTimeLeft > 0) {
      this.matchTimeLeft--;
      // las sanciones cumplen su tiempo solo mientras corre el partido
      const done = [];
      this.sanctions.forEach((x) => { x.left -= 1; });
      this.sanctions = this.sanctions.filter((x) => {
        if (x.left <= 0) { done.push({ id: x.id, reason: "time" }); return false; }
        return true;
      });
      done.forEach((e) => this.callbacks.onSanctionEnd && this.callbacks.onSanctionEnd(e));
    }
    if (!this.isSetPaused && this.setTimeLeft > 0) this.setTimeLeft--;

    let timeoutJustExpired = false;
    if (this.isTimeoutRunning && this.timeoutTimeLeft === 0) {
      this.isTimeoutRunning = false;
      this._stopIntervalIfFullyPaused();
      timeoutJustExpired = true;
    }

    this._emitState(true);

    if (timeoutJustExpired && this.callbacks.onTimeoutExpired) {
      this.callbacks.onTimeoutExpired({ team: this.timeoutTeam, message: "TIEMPO MUERTO TERMINADO" });
    }

    if (this.setTimeLeft === 0 && !this.isSetPaused) {
      const action = this.modality === "cloth" ? "resetWithBonus" : "suddenDeath";
      const message =
        this.modality === "cloth"
          ? "SET FINALIZADO"
          : "MUERTE SÚBITA (NO HAY ESCUDO)";

      if (this.callbacks.onSetExpired) {
        this.callbacks.onSetExpired({ action, message, source: "set" });
      }

      this.isSetPaused = true;

      if (
        this.modality === "cloth" &&
        this.matchTimeLeft < 120 &&
        this.matchTimeLeft > 0
      ) {
        this.matchTimeLeft = 90;
        this.isMatchPaused = true;
        this._stopIntervalIfFullyPaused();
        this._emitState();
      }
    }

    this._checkMatchExpiry();
  }

  // fromTick = true en el conteo normal de cada segundo; false en cualquier cambio de estado (comando, vencimiento).
  // onPersist recibe el estado completo y distingue ambos casos para no escribir en la base cada segundo.
  _emitState(fromTick = false) {
    if (this.callbacks.onPersist) {
      this.callbacks.onPersist(this.toJSON(), { tick: fromTick });
    }
    if (this.callbacks.onTick) {
      this.callbacks.onTick({
        matchTime: formatTime(this.matchTimeLeft),
        setTime: formatTime(this.setTimeLeft),
        isMatchPaused: this.isMatchPaused,
        isSetPaused: this.isSetPaused,
        matchHalf: this.matchHalf,
        timeoutTime: formatTime(this.timeoutTimeLeft),
        timeoutTeam: this.timeoutTeam,
        isTimeoutRunning: this.isTimeoutRunning,
        timeoutsUsed: JSON.parse(JSON.stringify(this.timeoutsUsed)),
        recovered: this.recovered,
        matchEnded: this.matchEnded,
        sanctions: this.sanctions.map((x) => ({ id: x.id, side: x.side, kind: x.kind, label: x.label, left: x.left, time: formatTime(x.left), setsLeft: x.setsLeft })),
      });
    }
  }
}

module.exports = TimerEngine;
