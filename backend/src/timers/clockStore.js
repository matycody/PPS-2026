// backend/src/timers/clockStore.js
// Persistencia del reloj en la base (tabla MatchClock) para sobrevivir a reinicios del servidor.
// - Cambios de estado (comandos, vencimientos): se guardan al instante.
// - Conteo normal (1 tick por segundo): se guarda como máximo cada CHECKPOINT_MS.
// Las escrituras no bloquean el reloj; si fallan, se loguean y el reloj sigue.

const prisma = require("../db");

const CHECKPOINT_MS = 5000;

const lastSavedAt = new Map(); // matchId -> ms de la última escritura iniciada
const inFlight = new Set(); // matchId con una escritura en curso
const pending = new Map(); // matchId -> último estado que llegó mientras se escribía

function toRow(state) {
  return { ...state, savedAt: new Date() };
}

async function write(matchId, state) {
  inFlight.add(matchId);
  lastSavedAt.set(matchId, Date.now());
  try {
    const data = toRow(state);
    await prisma.matchClock.upsert({
      where: { matchId },
      create: { matchId, ...data },
      update: data,
    });
  } catch (err) {
    // Partido borrado o base caída: el reloj en memoria no se ve afectado
    console.error("[clockStore] no se pudo guardar el reloj de", matchId, err.code || err.message);
  } finally {
    inFlight.delete(matchId);
    const next = pending.get(matchId);
    if (next) {
      pending.delete(matchId);
      write(matchId, next);
    }
  }
}

// Se llama desde TimerEngine (callback onPersist) en cada emisión de estado.
function persist(matchId, state, { tick }) {
  if (tick && Date.now() - (lastSavedAt.get(matchId) || 0) < CHECKPOINT_MS) return;
  if (inFlight.has(matchId)) {
    pending.set(matchId, state); // se guarda al terminar la escritura en curso, con el estado más reciente
    return;
  }
  write(matchId, state);
}

async function remove(matchId) {
  lastSavedAt.delete(matchId);
  pending.delete(matchId);
  try {
    await prisma.matchClock.deleteMany({ where: { matchId } });
  } catch (err) {
    console.error("[clockStore] no se pudo borrar el reloj de", matchId, err.code || err.message);
  }
}

// Relojes guardados de partidos que todavía pueden estar en juego (Habilitado o En vivo).
// Las filas de partidos que ya no lo están se borran.
async function loadActive() {
  const rows = await prisma.matchClock.findMany({
    include: { match: { select: { status: true, modality: true } } },
  });
  const stale = rows.filter((r) => r.match.status !== "READY" && r.match.status !== "LIVE").map((r) => r.matchId);
  if (stale.length) await prisma.matchClock.deleteMany({ where: { matchId: { in: stale } } });
  return rows.filter((r) => r.match.status === "READY" || r.match.status === "LIVE");
}

module.exports = { persist, remove, loadActive, CHECKPOINT_MS };
