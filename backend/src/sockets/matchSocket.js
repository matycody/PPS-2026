// backend/src/sockets/matchSocket.js

const prisma = require('../db');
const { getPermissions } = require('../services/matchAccess');
const { notifyMatch, FEED_ROOM } = require('../services/notify');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../timers/timerEvents');
const { getOrCreateMatch, getMatch, pauseMatch, resumeMatch } = require('../timers/matchManager');

const MAX_ROOMS = 12;
// Valores que espera TimerEngine.setModality (verificar contra TimerEngine.js)
const MODALITY_TO_ENGINE = { FOAM: 'foam', CLOTH: 'cloth' };

const publicRoom = (id) => 'match:' + id;
const controlRoom = (id) => 'control:' + id;

// Último estado emitido por partido: sirve de snapshot al unirse
const lastTick = new Map();

function buildCallbacks(io, matchId) {
  return {
    onTick: ({ matchTime, setTime, isMatchPaused, isSetPaused, matchHalf }) => {
      const payload = { matchId, matchTime, setTime, isMatchPaused, isSetPaused, matchHalf };
      lastTick.set(matchId, payload);
      io.to(publicRoom(matchId)).emit(SERVER_EVENTS.MATCH_TICK, payload);
    },
    onSetExpired: ({ action, message }) => {
      const engine = getMatch(matchId);
      io.to(publicRoom(matchId)).emit(SERVER_EVENTS.MATCH_SET_EXPIRED, {
        matchId,
        modality: engine && engine.modality,
        action,
        message,
      });
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
  const auth = await authUser(socket);
  if (auth.error) return auth;

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { error: 'Partido no encontrado' };

  const perms = await getPermissions(auth.user, match);
  if (need && !perms[need]) {
    return { error: 'Sin permiso sobre este partido (o el partido no está Habilitado)' };
  }
  return { user: auth.user, match, perms };
}

async function runGuarded(socket, need, payload, handler) {
  const matchId = payload && payload.matchId;
  try {
    const ctx = await authorize(socket, matchId, need);
    if (ctx.error) return emitError(socket, matchId, ctx.error);
    await handler(ctx);
  } catch (err) {
    console.error('[socket]', err);
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
    data: { matchId, userId: socket.data.user.id, action },
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

function registerMatchHandlers(io, socket) {
  function on(event, need, fn) {
    socket.on(event, (payload) => {
      const p = payload && typeof payload === 'object' ? payload : {};
      return runGuarded(socket, need, p, (ctx) => fn(ctx, p));
    });
  }

  function requireEngine(match) {
    const engine = getMatch(match.id);
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
      const exists = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true } });
      if (!exists) return emitError(socket, matchId, 'Partido no encontrado');

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

      socket.join(publicRoom(match.id));
      socket.join(controlRoom(match.id));

      socket.emit(SERVER_EVENTS.MATCH_PERMISSIONS, {
        matchId: match.id,
        status: match.status,
        isTable: perms.isTable,
        isReferee: perms.isReferee,
        canControlClock: perms.canControlClock,
        canReady: perms.canReady,
        canUnready: perms.canUnready,
        canAddSets: perms.canAddSets,
        canEditResult: perms.canEditResult,
        canFinish: perms.canFinish,
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
  });

  // ── Comandos del reloj: árbitros asignados y mesa, con el partido Habilitado o En vivo ──
  on(CLIENT_EVENTS.MATCH_START, 'canControlClock', async ({ match }, p) => {
    const target = p.target || 'both';
    getEngine(io, match).start(target);

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

  on(CLIENT_EVENTS.MATCH_FINISH_HALF, 'canControlClock', async ({ match }) => {
    const engine = requireEngine(match);
    if (!engine) return;
    engine.finishHalf();
    await logAction(io, socket, match.id, 'FINISH_HALF');
  });
}

module.exports = { registerMatchHandlers };
