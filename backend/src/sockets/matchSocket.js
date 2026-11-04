// backend/src/sockets/matchSocket.js

const prisma = require('../db');
const { getPermissions } = require('../services/matchAccess');
const { notifyMatch, FEED_ROOM } = require('../services/notify');
const authCache = require('../services/authCache');
const tableLock = require('../services/tableLock');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../timers/timerEvents');
const { getOrCreateMatch, getMatch, pauseMatch, resumeMatch } = require('../timers/matchManager');
const clockStore = require('../timers/clockStore');
const { listSanctions, emitSanctions, publicName } = require('../services/sanctions');

const MAX_ROOMS = 12;
// Valores que espera TimerEngine.setModality (verificado contra TimerEngine.js)
const MODALITY_TO_ENGINE = { FOAM: 'foam', CLOTH: 'cloth' };

const publicRoom = (id) => 'match:' + id;
const controlRoom = (id) => 'control:' + id;

// Último estado emitido por partido: sirve de snapshot al unirse
const lastTick = new Map();

function buildCallbacks(io, matchId) {
  return {
    onPersist: (state, opts) => clockStore.persist(matchId, state, opts),
    onTick: ({ matchTime, setTime, isMatchPaused, isSetPaused, matchHalf, timeoutTime, timeoutTeam, isTimeoutRunning, timeoutsUsed, recovered, matchEnded, sanctions }) => {
      const payload = { matchId, matchTime, setTime, isMatchPaused, isSetPaused, matchHalf, timeoutTime, timeoutTeam, isTimeoutRunning, timeoutsUsed, recovered, matchEnded, sanctions };
      lastTick.set(matchId, payload);
      io.to(publicRoom(matchId)).emit(SERVER_EVENTS.MATCH_TICK, payload);
    },
    // La amarilla o la azul terminó (por tiempo, por sets o porque se cerró el partido): queda anotado
    onSanctionEnd: ({ id }) => {
      prisma.matchSanction.updateMany({ where: { id, endedAt: null }, data: { endedAt: new Date() } })
        .then(() => emitSanctions(io, matchId))
        .catch((e) => console.error('[sanction]', e.message));
    },
    onSetExpired: ({ action, message, source }) => {
      const engine = getMatch(matchId);
      io.to(publicRoom(matchId)).emit(SERVER_EVENTS.MATCH_SET_EXPIRED, {
        matchId,
        modality: engine && engine.modality,
        source,
        action,
        message,
      });
    },
    onTimeoutExpired: ({ team, message }) => {
      io.to(publicRoom(matchId)).emit(SERVER_EVENTS.MATCH_TIMEOUT_EXPIRED, { matchId, team, message });
    },
    onMatchFinished: () => {
      // Solo congela el reloj: el estado FINISHED lo pone la mesa (POST /matches/:id/finish)
      io.to(publicRoom(matchId)).emit(SERVER_EVENTS.MATCH_FINISHED, {
        matchId,
        message: 'SE TERMINÓ EL PARTIDO',
      });
    },
  };
}

function getEngine(io, dbMatch) {
  let engine = getMatch(dbMatch.id);
  if (!engine) {
    engine = getOrCreateMatch(dbMatch.id, buildCallbacks(io, dbMatch.id));
    engine.setModality(MODALITY_TO_ENGINE[dbMatch.modality]);
  }
  return engine;
}

// Al arrancar el servidor: recrea los relojes guardados de partidos Habilitados o En vivo, siempre en pausa
async function restoreClocks(io) {
  try {
    const rows = await clockStore.loadActive();
    for (const row of rows) {
      if (getMatch(row.matchId)) continue;
      const engine = getOrCreateMatch(row.matchId, buildCallbacks(io, row.matchId));
      engine.modality = MODALITY_TO_ENGINE[row.match.modality];
      engine.restore(row);
    }
    if (rows.length) console.log('[clock] relojes recuperados:', rows.length);
  } catch (err) {
    // Sin la tabla (migración sin aplicar) o base caída: el servidor arranca igual, con relojes nuevos
    console.error('[clock] no se pudieron recuperar los relojes:', err.code || err.message);
  }
}

function emitError(socket, matchId, message) {
  socket.emit(SERVER_EVENTS.MATCH_ERROR, { matchId, message });
}

// ───────────── Autorización ─────────────

async function authUser(socket) {
  const session = socket.data.user;
  if (!session) return { error: 'Iniciá sesión para operar el partido' };
  if (socket.data.tokenExp && Date.now() / 1000 > socket.data.tokenExp) {
    return { error: 'Sesión vencida: reconectá con un token nuevo' };
  }
  // Se relee de la base en cada comando: si le quitaron permisos, los pierde de inmediato
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !user.active) return { error: 'Cuenta desactivada' };
  return { user };
}

async function authorize(socket, matchId, need) {
  if (typeof matchId !== 'string' || !matchId || matchId.length > 64) {
    return { error: 'matchId inválido' };
  }
  // Vencimiento del token: siempre se revisa (es gratis)
  if (socket.data.user && socket.data.tokenExp && Date.now() / 1000 > socket.data.tokenExp) {
    return { error: 'Sesión vencida: reconectá con un token nuevo' };
  }
  const cached = socket.data.user ? authCache.get(socket.data.user.id, matchId) : null;
  if (cached && (!need || cached.perms[need])) return cached;

  const auth = await authUser(socket);
  if (auth.error) return auth;

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { error: 'Partido no encontrado' };
  if (match.hiddenAt && !auth.user.roles.includes('ADMIN')) {
    return { error: 'Partido no encontrado' };
  }

  const perms = await getPermissions(auth.user, match);
  if (need && !perms[need]) {
    if (perms.tableLockedBy) return { error: perms.tableLockedBy + ' está operando la mesa de este partido' };
    return { error: 'Sin permiso sobre este partido (o el partido no está Habilitado)' };
  }
  const result = { user: auth.user, match, perms };
  authCache.set(auth.user.id, matchId, result);
  return result;
}

async function runGuarded(socket, need, payload, handler) {
  const matchId = payload && payload.matchId;
  try {
    const ctx = await authorize(socket, matchId, need);
    if (ctx.error) return emitError(socket, matchId, ctx.error);
    await handler(ctx);
  } catch (err) {
    console.error('[socket]', err);
    try { if (process.env.SENTRY_DSN) require('@sentry/node').captureException(err); } catch (e) { /* sin sdk */ }
    emitError(socket, matchId, 'Error interno');
  }
}

async function controllableMatchIds(user) {
  const or = [{ function: 'TABLE', userId: user.id }];
  if (user.profileId) or.push({ function: 'REFEREE', profileId: user.profileId });
  const rows = await prisma.matchAssignment.findMany({
    where: { OR: or, match: { status: { in: ['READY', 'LIVE'] } } },
    select: { matchId: true },
  });
  return [...new Set(rows.map((r) => r.matchId))];
}

// ───────────── Auditoría de acciones ─────────────

async function logAction(io, socket, matchId, action, extra) {
  await prisma.clockAction.create({
    data: { matchId, userId: socket.data.user.id, action, detail: extra ? JSON.stringify(extra) : null },
  });
  io.to(controlRoom(matchId)).emit(SERVER_EVENTS.MATCH_ACTION, {
    matchId,
    action,
    by: socket.data.displayName,
    at: new Date(),
    ...(extra || {}),
  });
}

// ───────────── Idempotencia (según el último estado emitido) ─────────────

function timersOf(target) {
  if (target === 'match') return ['match'];
  if (target === 'set') return ['set'];
  return ['match', 'set'];
}

function pausedFlag(state, timer) {
  return timer === 'match' ? state.isMatchPaused : state.isSetPaused;
}

function alreadyPaused(matchId, target) {
  const s = lastTick.get(matchId);
  return Boolean(s) && timersOf(target).every((t) => pausedFlag(s, t));
}

function alreadyRunning(matchId, target) {
  const s = lastTick.get(matchId);
  return Boolean(s) && timersOf(target).every((t) => !pausedFlag(s, t));
}

// ───────────── Handlers ─────────────

let lockReady = false;
function registerMatchHandlers(io, socket) {
  if (!lockReady) {
    lockReady = true;
    // Al quedar libre la mesa, quienes esperan en solo lectura vuelven a intentar tomarla
    tableLock.init((matchId) => io.to(controlRoom(matchId)).emit('match:tableFree', { matchId }));
  }
  function on(event, need, fn) {
    socket.on(event, (payload) => {
      const p = payload && typeof payload === 'object' ? payload : {};
      return runGuarded(socket, need, p, (ctx) => fn(ctx, p));
    });
  }

  function requireEngine(match) {
    let engine = getMatch(match.id);
    // Partido Habilitado o En vivo sin reloj en memoria (el servidor se reinició): se recrea, pausado y en 20:00 / 3:00
    if (!engine && (match.status === 'READY' || match.status === 'LIVE')) engine = getEngine(io, match);
    if (!engine) emitError(socket, match.id, 'El reloj de este partido todavía no fue iniciado');
    return engine;
  }

  // ── Suscripción pública: cualquiera (con o sin sesión) ──
  socket.on(CLIENT_EVENTS.MATCH_JOIN, async (payload) => {
    const matchId = payload && payload.matchId;
    try {
      if (typeof matchId !== 'string' || !matchId || matchId.length > 64) {
        return emitError(socket, matchId, 'matchId inválido');
      }
      if (socket.rooms.size >= MAX_ROOMS) {
        return emitError(socket, matchId, 'Demasiadas suscripciones');
      }
      const exists = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true, hiddenAt: true } });
      if (!exists) return emitError(socket, matchId, 'Partido no encontrado');
      const isAdminSocket = Boolean(socket.data.user && socket.data.user.roles.includes('ADMIN'));
      if (exists.hiddenAt && !isAdminSocket) return emitError(socket, matchId, 'Partido no encontrado');

      socket.join(publicRoom(matchId));
      const snapshot = lastTick.get(matchId);
      if (snapshot) socket.emit(SERVER_EVENTS.MATCH_TICK, snapshot);
    } catch (err) {
      console.error('[socket]', err);
      emitError(socket, matchId, 'Error interno');
    }
  });

  // ── Feed general: cambios de estado y resultado de todos los partidos (home) ──
  socket.on(CLIENT_EVENTS.MATCHES_SUBSCRIBE, () => {
    if (socket.rooms.size < MAX_ROOMS) socket.join(FEED_ROOM);
  });
  socket.on(CLIENT_EVENTS.MATCHES_UNSUBSCRIBE, () => socket.leave(FEED_ROOM));

  socket.on(CLIENT_EVENTS.MATCH_LEAVE, (payload) => {
    const matchId = payload && payload.matchId;
    if (typeof matchId === 'string') socket.leave(publicRoom(matchId));
  });

  // ── Room de control: exige sesión y asignación (o ser admin) ──
  socket.on(CLIENT_EVENTS.MATCH_CONTROL_JOIN, async (payload) => {
    const matchId = payload && payload.matchId;
    try {
      const ctx = await authorize(socket, matchId, null);
      if (ctx.error) return emitError(socket, matchId, ctx.error);
      const { match, perms } = ctx;

      if (!perms.isTable && !perms.isReferee && !perms.isAdmin) {
        return emitError(socket, matchId, 'No estás asignado a este partido');
      }
      if (socket.rooms.size >= MAX_ROOMS - 1) {
        return emitError(socket, matchId, 'Demasiadas suscripciones');
      }

      // Mesa única: la primera persona que entra opera; las demás quedan en solo lectura hasta que salga
      let live = perms;
      if (perms.isTable && !perms.isReferee && !perms.isAdmin) {
        tableLock.acquire(match.id, ctx.user.id, socket.id, socket.data.displayName || 'Otra persona');
        live = await getPermissions(ctx.user, match); // con el bloqueo ya aplicado
      }

      socket.join(publicRoom(match.id));
      socket.join(controlRoom(match.id));

      socket.emit(SERVER_EVENTS.MATCH_PERMISSIONS, {
        matchId: match.id,
        status: match.status,
        isTable: live.isTable,
        isReferee: live.isReferee,
        tableLockedBy: live.tableLockedBy ?? null,
        canControlClock: live.canControlClock,
        canReady: live.canReady,
        canUnready: live.canUnready,
        canAddSets: live.canAddSets,
        canEditResult: live.canEditResult,
        canFinish: live.canFinish,
      });

      const snapshot = lastTick.get(match.id);
      if (snapshot) socket.emit(SERVER_EVENTS.MATCH_TICK, snapshot);
    } catch (err) {
      console.error('[socket]', err);
      emitError(socket, matchId, 'Error interno');
    }
  });

  socket.on(CLIENT_EVENTS.MATCH_CONTROL_LEAVE, (payload) => {
    const matchId = payload && payload.matchId;
    if (typeof matchId === 'string') socket.leave(controlRoom(matchId));
    if (typeof matchId === 'string') tableLock.release(matchId, socket.id); // salir de la pantalla libera la mesa al instante
  });

  // Se cortó la conexión: se libera la mesa pasada la gracia (un corte breve de red no la pierde)
  socket.on('disconnect', () => tableLock.releaseSocket(socket.id, true));

  // ── Comandos del reloj: árbitros asignados y mesa, con el partido Habilitado o En vivo ──
  on(CLIENT_EVENTS.MATCH_START, 'canControlClock', async ({ match }, p) => {
    const target = p.target || 'both';
    const startEngine = getEngine(io, match);
    if (startEngine.timeoutTeam !== null) {
      return emitError(socket, match.id, 'Hay un tiempo muerto en curso');
    }
    startEngine.start(target);

    if (match.status === 'READY') {
      await prisma.match.updateMany({
        where: { id: match.id, status: 'READY' },
        data: { status: 'LIVE' },
      });
    }
    if (match.status === 'READY') await notifyMatch(io, match.id);
    await logAction(io, socket, match.id, 'START', { target });
  });

  socket.on(CLIENT_EVENTS.MATCH_PAUSE, (payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const target = p.target || 'both';

    if (p.scope === 'group') return runGroup('pause', target);

    return runGuarded(socket, 'canControlClock', p, async ({ match }) => {
      if (!requireEngine(match)) return;
      if (alreadyPaused(match.id, target)) return; // idempotente
      pauseMatch(match.id, target);
      io.to(publicRoom(match.id)).emit(SERVER_EVENTS.MATCH_PAUSED, {
        matchId: match.id,
        scope: 'individual',
        target,
      });
      await logAction(io, socket, match.id, 'PAUSE', { target });
    });
  });

  socket.on(CLIENT_EVENTS.MATCH_RESUME, (payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const target = p.target || 'both';

    if (p.scope === 'group') return runGroup('resume', target);

    return runGuarded(socket, 'canControlClock', p, async ({ match }) => {
      if (!requireEngine(match)) return;
      if (alreadyRunning(match.id, target)) return; // idempotente
      if (requireEngine(match).timeoutTeam !== null) {
        return emitError(socket, match.id, 'Hay un tiempo muerto en curso');
      }
      resumeMatch(match.id, target);
      io.to(publicRoom(match.id)).emit(SERVER_EVENTS.MATCH_RESUMED, {
        matchId: match.id,
        scope: 'individual',
        target,
      });
      await logAction(io, socket, match.id, 'RESUME', { target });
    });
  });

  // Pausa/reanuda grupal: solo los partidos que este usuario puede controlar
  async function runGroup(kind, target) {
    try {
      const auth = await authUser(socket);
      if (auth.error) return emitError(socket, null, auth.error);

      const ids = (await controllableMatchIds(auth.user)).filter((id) => getMatch(id));
      const changed = ids.filter((id) =>
        kind === 'pause' ? pauseMatch(id, target) : resumeMatch(id, target)
      );
      if (!changed.length) return;

      io.to(changed.map(publicRoom)).emit(
        kind === 'pause' ? SERVER_EVENTS.MATCH_PAUSED : SERVER_EVENTS.MATCH_RESUMED,
        { matchId: changed, scope: 'group', target }
      );
      for (const id of changed) {
        await logAction(io, socket, id, kind === 'pause' ? 'PAUSE' : 'RESUME', { scope: 'group', target });
      }
    } catch (err) {
      console.error('[socket]', err);
      emitError(socket, null, 'Error interno');
    }
  }

  on(CLIENT_EVENTS.MATCH_RESET, 'canControlClock', async ({ match }, p) => {
    const engine = requireEngine(match);
    if (!engine) return;
    engine.reset(p.timer);
    await logAction(io, socket, match.id, 'RESET', { timer: p.timer });
  });

  on(CLIENT_EVENTS.MATCH_ADJUST, 'canControlClock', async ({ match }, p) => {
    if (!Number.isFinite(p.seconds)) return emitError(socket, match.id, 'seconds inválido');
    const engine = requireEngine(match);
    if (!engine) return;
    engine.adjust(p.timer, p.seconds);
    await logAction(io, socket, match.id, 'ADJUST', { timer: p.timer, seconds: p.seconds });
  });

  on(CLIENT_EVENTS.MATCH_SET_TIME, 'canControlClock', async ({ match }, p) => {
    if (!Number.isFinite(p.totalSeconds) || p.totalSeconds < 0) {
      return emitError(socket, match.id, 'totalSeconds inválido');
    }
    const engine = requireEngine(match);
    if (!engine) return;
    engine.setTime(p.timer, p.totalSeconds);
    await logAction(io, socket, match.id, 'SET_TIME', { timer: p.timer, totalSeconds: p.totalSeconds });
  });

  on(CLIENT_EVENTS.MATCH_SET_MODALITY, 'canControlClock', async ({ match }, p) => {
    if (typeof p.modality !== 'string') return emitError(socket, match.id, 'modality inválida');
    const engine = requireEngine(match);
    if (!engine) return;
    engine.setModality(p.modality);
    await logAction(io, socket, match.id, 'SET_MODALITY', { modality: p.modality });
  });

  on(CLIENT_EVENTS.MATCH_SET_HALF, 'canControlClock', async ({ match }, p) => {
    const engine = requireEngine(match);
    if (!engine) return;
    engine.setHalf(p.half);
    await logAction(io, socket, match.id, 'SET_HALF', { half: p.half });
  });

  // Tiempo muerto: 1 minuto, 1 por equipo y por tiempo (las reglas las valida TimerEngine)
  on(CLIENT_EVENTS.MATCH_TIMEOUT_START, 'canControlClock', async ({ match }, p) => {
    const engine = requireEngine(match);
    if (!engine) return;
    const r = engine.startTimeout(p.team);
    if (!r.ok) return emitError(socket, match.id, r.message);
    await logAction(io, socket, match.id, 'TIMEOUT_START', { team: p.team, half: engine.matchHalf });
  });

  on(CLIENT_EVENTS.MATCH_TIMEOUT_END, 'canControlClock', async ({ match }) => {
    const engine = requireEngine(match);
    if (!engine) return;
    const r = engine.endTimeout();
    if (!r.ok) return emitError(socket, match.id, r.message);
    await logAction(io, socket, match.id, 'TIMEOUT_END');
  });

  // Deshacer un tiempo muerto pedido sin querer: el equipo no pierde el suyo
  on(CLIENT_EVENTS.MATCH_TIMEOUT_CANCEL, 'canControlClock', async ({ match }) => {
    const engine = requireEngine(match);
    if (!engine) return;
    const team = engine.timeoutTeam;
    const r = engine.cancelTimeout();
    if (!r.ok) return emitError(socket, match.id, r.message);
    await logAction(io, socket, match.id, 'TIMEOUT_CANCEL', { team });
  });

  on(CLIENT_EVENTS.MATCH_FINISH_HALF, 'canControlClock', async ({ match }) => {
    const engine = requireEngine(match);
    if (!engine) return;
    engine.finishHalf();
    await logAction(io, socket, match.id, 'FINISH_HALF');
  });

  // ── Sanciones: advertencia (solo Foam), amarilla, azul (solo Cloth) y roja ──
  const KINDS = ['WARNING', 'YELLOW', 'BLUE', 'RED'];
  on(CLIENT_EVENTS.MATCH_SANCTION_ADD, 'canControlClock', async ({ match }, p) => {
    const engine = requireEngine(match);
    if (!engine) return;
    if (p.side !== 'A' && p.side !== 'B') return emitError(socket, match.id, 'Equipo inválido');
    if (!KINDS.includes(p.kind)) return emitError(socket, match.id, 'Tipo de sanción inválido');
    if (p.kind === 'BLUE' && match.modality !== 'CLOTH') return emitError(socket, match.id, 'La tarjeta azul es solo de Cloth');
    const reason = typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim().slice(0, 200) : null;

    let player = null;
    if (p.profileId) {
      const teamId = p.side === 'A' ? match.teamAId : match.teamBId;
      const inTeam = teamId && await prisma.playerTeam.findFirst({ where: { profileId: String(p.profileId), teamId, to: null }, select: { id: true } });
      if (!inTeam) return emitError(socket, match.id, 'Ese jugador no pertenece al equipo');
      player = await prisma.profile.findUnique({ where: { id: String(p.profileId) }, select: { id: true, name: true, nickname: true, showNickname: true } });
    }
    if (p.kind === 'WARNING' && !player) return emitError(socket, match.id, 'Elegí al jugador que recibe la advertencia');

    // Foam: la 2.ª advertencia del mismo jugador lo elimina y el equipo pasa a jugar con 5 (en Cloth la advertencia no elimina)
    let eliminates = false;
    if (p.kind === 'WARNING' && match.modality === 'FOAM') {
      const prev = await prisma.matchSanction.count({ where: { matchId: match.id, profileId: player.id, kind: 'WARNING', revokedAt: null } });
      eliminates = prev >= 1;
    }
    const lastSet = await prisma.matchSet.aggregate({ where: { matchId: match.id }, _max: { number: true } });
    const row = await prisma.matchSanction.create({
      data: {
        matchId: match.id,
        side: p.side,
        profileId: player ? player.id : null,
        kind: p.kind,
        eliminates,
        reason,
        half: engine.matchHalf,
        setNumber: (lastSet._max.number || 0) + 1,
        matchSecond: Math.max(0, 20 * 60 - engine.matchTimeLeft),
        createdById: socket.data.user.id,
      },
    });
    if (p.kind === 'YELLOW' || p.kind === 'BLUE') {
      engine.addSanction({ id: row.id, side: p.side, kind: p.kind, label: player ? publicName(player) : 'Sin identificar' });
    }
    await emitSanctions(io, match.id);
    await logAction(io, socket, match.id, 'SANCTION_ADD', { side: p.side, kind: p.kind, profileId: player ? player.id : null, eliminates });
  });

  // Deshacer una sanción cargada por error (queda registrada como deshecha)
  on(CLIENT_EVENTS.MATCH_SANCTION_REMOVE, 'canControlClock', async ({ match }, p) => {
    const engine = requireEngine(match);
    if (!engine) return;
    const row = typeof p.sanctionId === 'string' ? await prisma.matchSanction.findUnique({ where: { id: p.sanctionId } }) : null;
    if (!row || row.matchId !== match.id || row.revokedAt) return emitError(socket, match.id, 'Sanción no encontrada');
    await prisma.matchSanction.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    engine.removeSanction(row.id);
    await emitSanctions(io, match.id);
    await logAction(io, socket, match.id, 'SANCTION_REMOVE', { side: row.side, kind: row.kind });
  });
}

module.exports = { registerMatchHandlers, restoreClocks };
