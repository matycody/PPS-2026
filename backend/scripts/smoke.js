// backend/scripts/smoke.js
// Prueba de humo del backend: permisos, reglas de negocio, Socket.IO, fotos y cuenta.
// Uso: con el backend corriendo (npm run dev), en otra terminal: npm run smoke
require('dotenv').config();
const sharp = require('sharp');
const { io } = require('socket.io-client');
const prisma = require('../src/db');
const supabase = require('../src/lib/supabase');
const supabaseAdmin = require('../src/lib/supabaseAdmin');
const storage = require('../src/services/storage');

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const TAG = 'SMOKE';
const PASSWORD = 'Smoke-Test-123!';
const mail = (name) => 'smoke-' + name + '@example.com';
const dni = (n) => String(90000000 + n);

let passed = 0;
let failed = 0;
const failures = [];
const tracked = new Set(); // ids de User creados en esta corrida
const openSockets = [];

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log('  OK     ' + name);
  } else {
    failed++;
    failures.push(name);
    console.log('  FALLA  ' + name + (detail ? '   -> ' + detail : ''));
  }
}
const eq = (name, got, want) => check(name, got === want, 'esperado ' + want + ', llegó ' + got);
const section = (t) => console.log('\n== ' + t);

async function api(method, path, token, body, opts) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (opts && opts.raw) {
    headers['Content-Type'] = opts.contentType;
    payload = opts.raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    openSockets.push(s);
    const t = setTimeout(() => reject(new Error('timeout de conexión')), 5000);
    s.on('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function waitFor(socket, event, ms, filter) {
  const ok = filter || (() => true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms || 3000);
    function handler(payload) {
      if (!ok(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

async function emitExpect(socket, event, payload, expectEvent, ms, filter) {
  const p = waitFor(socket, expectEvent, ms, filter);
  socket.emit(event, payload);
  return p;
}

async function createAccount(name) {
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: mail(name),
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error('No se pudo crear la cuenta ' + mail(name) + ': ' + error.message);
}

async function login(name) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: mail(name), password: PASSWORD });
  if (error) throw new Error('No se pudo loguear ' + mail(name) + ': ' + error.message);
  return data.session.access_token;
}

// ───────────── Limpieza ─────────────

async function cleanup() {
  const tournaments = await prisma.tournament.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const tournamentIds = tournaments.map((t) => t.id);
  const matches = await prisma.match.findMany({ where: { tournamentId: { in: tournamentIds } }, select: { id: true } });
  const matchIds = matches.map((m) => m.id);
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { startsWith: 'smoke-' } }, { id: { in: [...tracked] } }] },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const profiles = await prisma.profile.findMany({ where: { email: { startsWith: 'smoke-' } }, select: { id: true } });
  const profileIds = profiles.map((p) => p.id);
  const teams = await prisma.team.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const teamIds = teams.map((t) => t.id);

  await prisma.clockAction.deleteMany({ where: { OR: [{ matchId: { in: matchIds } }, { userId: { in: userIds } }] } });
  await prisma.matchResultLog.deleteMany({ where: { OR: [{ matchId: { in: matchIds } }, { editedBy: { in: userIds } }] } });
  await prisma.matchSet.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.matchAssignment.deleteMany({
    where: { OR: [{ matchId: { in: matchIds } }, { userId: { in: userIds } }, { profileId: { in: profileIds } }] },
  });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await prisma.favorite.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { targetId: { in: [...teamIds, ...profileIds] } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.playerTeam.deleteMany({ where: { OR: [{ profileId: { in: profileIds } }, { teamId: { in: teamIds } }] } });
  await prisma.teamBranch.deleteMany({ where: { teamId: { in: teamIds } } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.profile.deleteMany({ where: { id: { in: profileIds } } });

  // Archivos de prueba en Storage (mejor esfuerzo)
  for (const id of profileIds) await storage.removeFile(storage.PHOTOS_BUCKET, 'profiles/' + id + '.webp').catch(() => {});
  for (const id of userIds) await storage.removeFile(storage.PHOTOS_BUCKET, 'users/' + id + '.webp').catch(() => {});
  for (const id of teamIds) await storage.removeFile(storage.LOGOS_BUCKET, 'teams/' + id + '.webp').catch(() => {});

  // Cuentas de prueba en Supabase Auth
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of (data && data.users) || []) {
    if (u.email && u.email.startsWith('smoke-') && u.email.endsWith('@example.com')) {
      await supabaseAdmin.auth.admin.deleteUser(u.id);
    }
  }
}

// ───────────── Pruebas ─────────────

async function run() {
  const health = await fetch(BASE + '/health').catch(() => null);
  if (!health || !health.ok) {
    throw new Error('El backend no responde en ' + BASE + ': levantalo con npm run dev en otra terminal');
  }

  await cleanup();

  section('Preparación de cuentas de prueba');
  await prisma.user.create({ data: { email: mail('admin'), roles: ['ADMIN'] } });
  const names = ['admin', 'player', 'referee', 'table', 'plain'];
  for (const n of names) await createAccount(n);
  const T = {};
  for (const n of names) T[n] = await login(n);
  const A = T.admin;
  const ids = {};
  console.log('  cuentas listas: ' + names.join(', '));

  // ── 1. Autenticación ──
  section('1. Autenticación y menú por rol');
  let r = await api('GET', '/me');
  eq('sin token: /me responde 401', r.status, 401);
  r = await api('GET', '/me', 'token-falso');
  eq('token inválido: /me responde 401', r.status, 401);

  r = await api('GET', '/me', A);
  check('admin del seed: primer login lo vincula y trae ADMIN + menú de administración',
    r.status === 200 && r.data.user.roles.includes('ADMIN') && r.data.menu.includes('usuarios'), JSON.stringify(r.data));
  ids.admin = r.data.user.id;
  tracked.add(ids.admin);

  r = await api('GET', '/me', T.plain);
  check('usuario común: sin roles y sin menú de administración',
    r.status === 200 && r.data.user.roles.length === 0 && !r.data.menu.includes('usuarios'), JSON.stringify(r.data));
  ids.plain = r.data.user.id;
  tracked.add(ids.plain);

  r = await api('GET', '/profiles');
  eq('visitante no accede a /profiles (401)', r.status, 401);
  r = await api('GET', '/profiles', T.plain);
  eq('usuario común no accede a /profiles (403)', r.status, 403);
  r = await api('GET', '/users', T.plain);
  eq('usuario común no accede a /users (403)', r.status, 403);

  // ── 2. Perfiles ──
  section('2. Inscripción de perfiles y vínculo automático');
  const playerBody = { dni: dni(1), name: 'SMOKE Jugador', email: mail('player'), sex: 'M', isPlayer: true };
  r = await api('POST', '/profiles', T.plain, playerBody);
  eq('usuario común no puede inscribir (403)', r.status, 403);
  r = await api('POST', '/profiles', A, playerBody);
  eq('admin inscribe jugador (201)', r.status, 201);
  check('el perfil nace PENDIENTE_VINCULACION', r.data && r.data.status === 'PENDIENTE_VINCULACION');
  const profile = { player: r.data && r.data.id };

  r = await api('POST', '/profiles', A, { ...playerBody, dni: dni(99), email: 'no-es-mail' });
  eq('mail inválido rechazado (400)', r.status, 400);
  r = await api('POST', '/profiles', A, { dni: dni(98), name: 'SMOKE Sin Sexo', email: mail('nosex'), isPlayer: true });
  eq('jugador sin sexo rechazado (400)', r.status, 400);
  r = await api('POST', '/profiles', A, { ...playerBody, dni: dni(97) });
  eq('mail repetido en otro DNI rechazado (409)', r.status, 409);
  r = await api('POST', '/profiles', A, { ...playerBody, name: 'SMOKE Jugador Editado' });
  check('mismo DNI actualiza el perfil en vez de duplicarlo', r.status === 200 && r.data.id === profile.player, JSON.stringify(r.data));

  r = await api('POST', '/profiles', A, { dni: dni(2), name: 'SMOKE Arbitro', email: mail('referee'), isReferee: true });
  eq('admin inscribe árbitro (201)', r.status, 201);
  profile.referee = r.data && r.data.id;
  r = await api('POST', '/profiles', A, { dni: dni(3), name: 'SMOKE Jugadora', email: mail('playerf'), sex: 'F', isPlayer: true });
  profile.female = r.data && r.data.id;
  r = await api('POST', '/profiles', A, {
    dni: dni(4), name: 'SMOKE Jugador Arbitro', email: mail('refplayer'), sex: 'M', isPlayer: true, isReferee: true,
  });
  profile.refplayer = r.data && r.data.id;
  profile.extras = [];
  for (let i = 1; i <= 6; i++) {
    r = await api('POST', '/profiles', A, { dni: dni(10 + i), name: 'SMOKE Arbitro ' + i, email: mail('r' + i), isReferee: true });
    profile.extras.push(r.data && r.data.id);
  }
  check('perfiles auxiliares creados', profile.female && profile.refplayer && profile.extras.every(Boolean));

  r = await api('GET', '/profiles?status=PENDIENTE_VINCULACION', A);
  check('listado de pendientes incluye a los inscriptos', r.status === 200 && r.data.some((p) => p.email === mail('refplayer')));

  r = await api('GET', '/me', T.player);
  check('jugador: el mail verificado lo vincula (PLAYER + perfil)',
    r.status === 200 && r.data.user.roles.includes('PLAYER') && r.data.user.profileId === profile.player && r.data.menu.includes('mis_partidos'),
    JSON.stringify(r.data));
  ids.player = r.data.user.id;
  tracked.add(ids.player);

  r = await api('GET', '/me', T.referee);
  check('árbitro: el mail verificado lo vincula (REFEREE + menú de árbitro)',
    r.status === 200 && r.data.user.roles.includes('REFEREE') && r.data.menu.includes('mis_partidos_asignados'),
    JSON.stringify(r.data));
  ids.referee = r.data.user.id;
  tracked.add(ids.referee);

  r = await api('GET', '/me', T.table);
  check('cuenta de mesa: sin inscripción queda como usuario común', r.status === 200 && r.data.user.roles.length === 0);
  ids.table = r.data.user.id;
  tracked.add(ids.table);

  r = await api('GET', '/profiles', T.player);
  eq('jugador no accede a /profiles (403)', r.status, 403);

  // ── 3. Equipos ──
  section('3. Equipos, ramas y traspasos');
  r = await api('POST', '/teams', T.player, { name: TAG + ' X', branches: ['MIXED'] });
  eq('jugador no puede crear equipos (403)', r.status, 403);
  r = await api('POST', '/teams', A, { name: TAG + ' X', branches: ['XX'] });
  eq('rama inválida rechazada (400)', r.status, 400);

  const mkTeam = async (name, branches) => (await api('POST', '/teams', A, { name: TAG + ' ' + name, branches })).data;
  const tA = await mkTeam('Equipo A', ['MIXED', 'MALE', 'FEMALE']);
  const tB = await mkTeam('Equipo B', ['MIXED', 'MALE']);
  const tC = await mkTeam('Equipo C', ['MIXED']);
  const tD = await mkTeam('Equipo D', ['MIXED']);
  check('equipos creados', tA && tA.id && tB && tB.id && tC && tC.id && tD && tD.id);

  const assign = (team, profileId, branch) => api('POST', '/teams/' + team.id + '/players', A, { profileId, branch });
  r = await assign(tA, profile.player, 'MIXED');
  check('jugador M entra a mixto del equipo A (201)', r.status === 201 && r.data.transfer === false, JSON.stringify(r.data));
  r = await assign(tA, profile.player, 'FEMALE');
  eq('jugador M no entra a femenino (409)', r.status, 409);
  r = await assign(tA, profile.player, 'MALE');
  eq('un equipo por rama: otra rama sí se permite (201)', r.status, 201);
  r = await assign(tB, profile.player, 'MIXED');
  check('traspaso en mixto al equipo B (201, transfer=true)', r.status === 201 && r.data.transfer === true, JSON.stringify(r.data));
  r = await assign(tB, profile.player, 'MIXED');
  eq('repetir el mismo equipo y rama rechazado (409)', r.status, 409);
  r = await assign(tC, profile.player, 'MALE');
  eq('equipo sin esa rama rechazado (409)', r.status, 409);
  r = await assign(tA, profile.female, 'MALE');
  eq('jugadora F no entra a masculino (409)', r.status, 409);
  r = await assign(tA, profile.female, 'MIXED');
  eq('jugadora F entra a mixto (201)', r.status, 201);
  r = await assign(tA, profile.referee, 'MIXED');
  eq('un perfil que no es jugador no se asigna (409)', r.status, 409);
  r = await assign(tA, profile.refplayer, 'MIXED');
  eq('jugador-árbitro entra al equipo A (201)', r.status, 201);

  r = await api('GET', '/teams/' + tA.id);
  const txt = JSON.stringify(r.data);
  check('plantel público: sin DNI ni mail', r.status === 200 && !txt.includes(dni(1)) && !txt.includes('@example.com'));
  check('plantel del equipo A: 3 jugadores activos', r.data.roster && r.data.roster.length === 3, txt);

  // ── 4. Torneo y partidos ──
  r = await api('GET', '/me/profile');
  eq('sin token: /me/profile responde 401', r.status, 401);
  r = await api('GET', '/me/profile', T.player);
  check('mi ficha: nombre y equipos actuales por rama (mixto en B, masculino en A)',
    r.status === 200 && r.data.profile && r.data.profile.name === 'SMOKE Jugador Editado' &&
    r.data.profile.teams.length === 2 &&
    r.data.profile.teams.some((t) => t.branch === 'MIXED' && t.teamId === tB.id) &&
    r.data.profile.teams.some((t) => t.branch === 'MALE' && t.teamId === tA.id), JSON.stringify(r.data));
  r = await api('GET', '/me/profile', T.plain);
  check('usuario sin perfil: profile es null', r.status === 200 && r.data.profile === null, JSON.stringify(r.data));

  section('4. Torneo, partidos y asignaciones');
  r = await api('POST', '/tournaments', T.player, { name: TAG + ' T' });
  eq('jugador no puede crear torneos (403)', r.status, 403);
  r = await api('POST', '/tournaments', A, { name: TAG + ' T', startsAt: '2026-12-01', endsAt: '2026-10-01' });
  eq('fechas invertidas rechazadas (400)', r.status, 400);
  r = await api('POST', '/tournaments', A, { name: TAG + ' Torneo', startsAt: '2026-10-01', endsAt: '2026-12-01' });
  eq('admin crea torneo (201)', r.status, 201);
  const tour = r.data;

  const mBody = {
    tournamentId: tour.id, court: 1, branch: 'MIXED', modality: 'FOAM',
    scheduledAt: '2026-10-05T15:00:00Z', teamAId: tA.id, teamBId: tC.id,
  };
  r = await api('POST', '/matches', T.player, mBody);
  eq('jugador no puede crear partidos (403)', r.status, 403);
  r = await api('POST', '/matches', A, { ...mBody, branch: 'XX' });
  eq('rama inválida en partido rechazada (400)', r.status, 400);
  r = await api('POST', '/matches', A, { ...mBody, teamBId: tA.id });
  eq('equipo contra sí mismo rechazado (409)', r.status, 409);
  r = await api('POST', '/matches', A, { ...mBody, branch: 'FEMALE', teamAId: tB.id, teamBId: null });
  eq('equipo sin la rama del partido rechazado (409)', r.status, 409);
  r = await api('POST', '/matches', A, mBody);
  eq('admin crea partido (201)', r.status, 201);
  const m = r.data;

  r = await api('GET', '/matches?tournamentId=' + tour.id);
  check('visitante lista partidos sin datos internos',
    r.status === 200 && r.data.some((x) => x.id === m.id) && !JSON.stringify(r.data).includes('assignments'));
  r = await api('GET', '/matches/' + m.id);
  check('visitante ve el detalle sin asignaciones', r.status === 200 && !('assignments' in r.data));

  const asg = (body, tk) => api('POST', '/matches/' + m.id + '/assignments', tk || A, body);
  r = await asg({ function: 'REFEREE', profileId: profile.referee }, T.referee);
  eq('un árbitro no puede asignar (403)', r.status, 403);
  r = await asg({ function: 'REFEREE', profileId: profile.referee });
  eq('admin asigna árbitro (201)', r.status, 201);
  r = await asg({ function: 'REFEREE', profileId: profile.referee });
  eq('asignación repetida rechazada (409)', r.status, 409);
  r = await asg({ function: 'REFEREE', profileId: profile.refplayer });
  eq('nadie arbitra un partido de su propio equipo (409)', r.status, 409);
  r = await asg({ function: 'REFEREE', profileId: profile.player });
  eq('un perfil que no es árbitro no se asigna (409)', r.status, 409);

  let five = true;
  for (let i = 0; i < 5; i++) {
    r = await asg({ function: 'REFEREE', profileId: profile.extras[i] });
    if (r.status !== 201) five = false;
  }
  check('se completan 6 árbitros por partido', five);
  r = await asg({ function: 'REFEREE', profileId: profile.extras[5] });
  eq('el 7.º árbitro es rechazado (409)', r.status, 409);
  r = await asg({ function: 'TABLE', userId: ids.table });
  eq('admin asigna colaborador de mesa (201)', r.status, 201);
  r = await asg({ function: 'TABLE', userId: ids.admin });
  eq('admin se asigna como mesa (201)', r.status, 201);

  // ── 5. Ciclo de vida ──
  section('5. Habilitar, sets, resultado y registro de ediciones');
  const post = (path, tk, body) => api('POST', '/matches/' + m.id + path, tk, body);
  r = await post('/ready', T.plain);
  eq('usuario común no habilita (403)', r.status, 403);
  r = await post('/ready', T.referee);
  eq('árbitro no habilita (403)', r.status, 403);
  r = await post('/ready', T.table);
  check('mesa habilita el partido (READY)', r.status === 200 && r.data.status === 'READY', JSON.stringify(r.data));
  r = await post('/ready', T.table);
  eq('habilitar de nuevo rechazado (409)', r.status, 409);
  r = await post('/unready', T.table);
  check('revertir habilitación antes de arrancar (SCHEDULED)', r.status === 200 && r.data.status === 'SCHEDULED');
  r = await post('/ready', T.table);
  eq('se vuelve a habilitar (200)', r.status, 200);

  r = await api('GET', '/me/assignments', T.referee);
  check('"mis partidos asignados" del árbitro incluye el partido', r.status === 200 && r.data.some((x) => x.match.id === m.id && x.function === 'REFEREE'));
  r = await api('GET', '/me', T.table);
  check('la mesa asignada ve "control_mesa" en el menú', r.status === 200 && r.data.menu.includes('control_mesa'));

  r = await post('/sets', T.referee, { winnerTeamId: tA.id });
  eq('árbitro asignado agrega el set 1 (201)', r.status, 201);
  r = await api('PATCH', '/matches/' + m.id + '/sets/1', T.referee, { winnerTeamId: tC.id });
  eq('árbitro no corrige sets (403)', r.status, 403);
  r = await post('/sets', T.table, { winnerTeamId: 'otro-equipo' });
  eq('ganador que no juega el partido rechazado (400)', r.status, 400);
  r = await post('/sets', T.table, { winnerTeamId: tA.id });
  eq('mesa agrega el set 2 (201)', r.status, 201);
  r = await post('/sets', T.table, { winnerTeamId: tA.id });
  eq('mesa agrega el set 3 (201)', r.status, 201);
  r = await api('PATCH', '/matches/' + m.id + '/sets/1', T.table, { winnerTeamId: tC.id });
  eq('mesa corrige un set mientras el partido no terminó (200)', r.status, 200);
  r = await api('GET', '/matches/' + m.id);
  check('el marcador refleja los sets (2 a 1)', r.data.score && r.data.score.teamA === 2 && r.data.score.teamB === 1, JSON.stringify(r.data.score));
  r = await api('GET', '/matches/' + m.id + '/result-log', T.table);
  eq('la mesa no ve el registro de ediciones (403)', r.status, 403);
  r = await api('GET', '/matches/' + m.id + '/result-log', A);
  check('el admin ve el registro de ediciones (3 o más)', r.status === 200 && r.data.length >= 3, JSON.stringify(r.data));
  r = await post('/finish', T.table);
  eq('la mesa (no admin) no finaliza (403)', r.status, 403);

  // ── 6. Socket.IO ──
  section('6. Socket.IO: reloj, rooms y permisos');
  const bad = await connect('token-falso').then((s) => { s.close(); return false; }).catch(() => true);
  check('conexión con token inválido rechazada', bad);

  const viewer = await connect();
  viewer.emit('match:join', { matchId: m.id });
  viewer.emit('matches:subscribe');
  let e = await emitExpect(viewer, 'match:start', { matchId: m.id, target: 'both' }, 'match:error');
  check('visitante no puede iniciar el reloj', e && /sesi/i.test(e.message), JSON.stringify(e));
  e = await emitExpect(viewer, 'match:controlJoin', { matchId: m.id }, 'match:error');
  check('visitante no entra a la room de control', e && /sesi/i.test(e.message), JSON.stringify(e));

  const sPlain = await connect(T.plain);
  e = await emitExpect(sPlain, 'match:controlJoin', { matchId: m.id }, 'match:error');
  check('cuenta sin asignación no entra a la room de control', e && /asignado/i.test(e.message), JSON.stringify(e));
  e = await emitExpect(sPlain, 'match:start', { matchId: m.id, target: 'both' }, 'match:error');
  check('cuenta sin asignación no inicia el reloj', e && /permiso/i.test(e.message), JSON.stringify(e));

  const sPlayer = await connect(T.player);
  e = await emitExpect(sPlayer, 'match:pause', { matchId: m.id, target: 'both' }, 'match:error');
  check('jugador no asignado no toca el reloj', e && /permiso/i.test(e.message), JSON.stringify(e));

  const sRef = await connect(T.referee);
  const perms = await emitExpect(sRef, 'match:controlJoin', { matchId: m.id }, 'match:permissions');
  check('árbitro asignado entra a control con permiso de reloj', perms && perms.canControlClock === true && perms.isReferee === true, JSON.stringify(perms));

  const tickP = waitFor(viewer, 'match:tick', 4000);
  const liveP = waitFor(viewer, 'match:updated', 4000, (p) => p.status === 'LIVE');
  sRef.emit('match:start', { matchId: m.id, target: 'both' });
  const tick = await tickP;
  const live = await liveP;
  check('árbitro inicia el reloj y el espectador recibe ticks', tick && tick.matchId === m.id, JSON.stringify(tick));
  check('el espectador recibe match:updated con estado LIVE', live && live.status === 'LIVE', JSON.stringify(live));
  r = await api('GET', '/matches/' + m.id);
  eq('el partido pasó a LIVE en la base', r.data && r.data.status, 'LIVE');

  const pausedP = waitFor(viewer, 'match:paused', 3000);
  const actionP = waitFor(sRef, 'match:action', 3000, (a) => a.action === 'PAUSE');
  sRef.emit('match:pause', { matchId: m.id, target: 'both' });
  const paused = await pausedP;
  const action = await actionP;
  check('pausa: el espectador recibe match:paused', paused && paused.matchId === m.id, JSON.stringify(paused));
  check('la room de control recibe quién pausó', action && action.by === 'SMOKE Arbitro', JSON.stringify(action));
  const dup = await emitExpect(sRef, 'match:pause', { matchId: m.id, target: 'both' }, 'match:paused', 1500);
  check('pausar dos veces es idempotente (el segundo no hace nada)', dup === null, JSON.stringify(dup));
  const resumed = await emitExpect(sRef, 'match:resume', { matchId: m.id, target: 'both' }, 'match:resumed');
  check('reanudar funciona', resumed && resumed.matchId === m.id, JSON.stringify(resumed));
  const logged = await prisma.clockAction.count({ where: { matchId: m.id } });
  check('las acciones del reloj quedan registradas (3 o más)', logged >= 3, 'registradas: ' + logged);

  r = await api('GET', '/matches/' + m.id, A);
  const ref = (r.data.assignments || []).find((x) => x.function === 'REFEREE' && x.profile && x.profile.id === profile.referee);
  check('el admin ve las asignaciones del partido', Boolean(ref));
  r = await api('DELETE', '/matches/' + m.id + '/assignments/' + ref.id, A);
  eq('admin quita al árbitro en pleno partido (200)', r.status, 200);
  e = await emitExpect(sRef, 'match:pause', { matchId: m.id, target: 'both' }, 'match:error');
  check('sin asignación pierde el control de inmediato', e && /permiso/i.test(e.message), JSON.stringify(e));

  const finP = waitFor(viewer, 'match:updated', 4000, (p) => p.status === 'FINISHED');
  r = await post('/finish', A);
  check('admin asignado como mesa finaliza el partido', r.status === 200 && r.data.status === 'FINISHED', JSON.stringify(r.data));
  const fin = await finP;
  check('el espectador recibe match:updated con estado FINISHED', fin && fin.status === 'FINISHED', JSON.stringify(fin));
  r = await post('/finish', A);
  eq('finalizar de nuevo rechazado (409)', r.status, 409);

  const sTable = await connect(T.table);
  e = await emitExpect(sTable, 'match:start', { matchId: m.id, target: 'both' }, 'match:error');
  check('finalizado: la mesa ya no controla el reloj', e && /permiso/i.test(e.message), JSON.stringify(e));

  r = await api('PATCH', '/matches/' + m.id + '/sets/1', T.table, { winnerTeamId: tA.id });
  eq('finalizado: la mesa no edita el resultado (403)', r.status, 403);
  r = await api('PATCH', '/matches/' + m.id + '/sets/1', A, { winnerTeamId: tA.id });
  eq('finalizado: el admin sí edita el resultado (200)', r.status, 200);
  r = await api('POST', '/matches/' + m.id + '/sets', T.table, { winnerTeamId: tA.id });
  eq('finalizado: la mesa no agrega sets (403)', r.status, 403);
  r = await api('POST', '/matches/' + m.id + '/sets', A, { winnerTeamId: tA.id });
  eq('finalizado: el admin agrega un set de corrección (201)', r.status, 201);

  // ── 7. Cancelación ──
  section('7. Cancelación');
  r = await api('POST', '/matches', A, { ...mBody, court: 2, teamAId: tB.id, teamBId: tC.id });
  eq('segundo partido creado (201)', r.status, 201);
  const m2 = r.data;
  r = await api('POST', '/matches/' + m2.id + '/cancel', A);
  check('admin cancela el partido', r.status === 200 && r.data.status === 'CANCELLED');
  r = await api('POST', '/matches/' + m2.id + '/ready', A);
  eq('un partido cancelado no se habilita (409)', r.status, 409);

  // ── 8. Fotos ──
  section('8. Fotos y escudos');
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const img = { raw: png, contentType: 'image/png' };
  r = await api('PUT', '/me/photo', T.player, undefined, img);
  check('jugador sube su foto', r.status === 200 && typeof r.data.url === 'string', JSON.stringify(r.data));
  r = await api('GET', '/me/photo', T.player);
  check('la foto vuelve con URL firmada', r.status === 200 && typeof r.data.url === 'string');
  r = await api('PUT', '/me/photo', T.player, undefined, { raw: Buffer.from('no soy una imagen'), contentType: 'image/png' });
  eq('un archivo que no es imagen es rechazado (400)', r.status, 400);
  r = await api('POST', '/photos/sign', undefined, { profileIds: [profile.player] });
  eq('visitante no obtiene fotos firmadas (401)', r.status, 401);
  r = await api('POST', '/photos/sign', T.plain, { profileIds: [profile.player] });
  check('cuenta registrada obtiene la foto firmada', r.status === 200 && typeof r.data[profile.player] === 'string', JSON.stringify(r.data));
  r = await api('PUT', '/photos/profiles/' + profile.female, T.player, undefined, img);
  eq('jugador no cambia la foto de otro (403)', r.status, 403);
  r = await api('PUT', '/photos/profiles/' + profile.female, A, undefined, img);
  eq('admin cambia la foto de cualquiera (200)', r.status, 200);
  r = await api('PUT', '/photos/teams/' + tA.id, A, undefined, img);
  check('admin sube el escudo del equipo', r.status === 200 && String(r.data.logo).startsWith('http'), JSON.stringify(r.data));
  r = await api('GET', '/teams/' + tA.id);
  check('el escudo es público (visible sin sesión)', r.status === 200 && String(r.data.logo).startsWith('http'));
  r = await api('DELETE', '/me/photo', T.player);
  eq('jugador quita su foto (200)', r.status, 200);

  // ── 9. Favoritos ──
  section('9. Favoritos');
  r = await api('POST', '/favorites', undefined, { targetType: 'TEAM', targetId: tA.id });
  eq('visitante no sigue equipos (401)', r.status, 401);
  r = await api('POST', '/favorites', T.plain, { targetType: 'TEAM', targetId: tA.id });
  eq('cuenta registrada sigue un equipo (201)', r.status, 201);
  r = await api('GET', '/favorites', T.plain);
  check('el favorito aparece en la lista', r.status === 200 && r.data.some((f) => f.targetId === tA.id));
  r = await api('POST', '/favorites', T.plain, { targetType: 'TEAM', targetId: 'no-existe' });
  eq('favorito inexistente rechazado (404)', r.status, 404);
  r = await api('DELETE', '/favorites/TEAM/' + tA.id, T.plain);
  eq('se deja de seguir (200)', r.status, 200);

  // ── 10. Usuarios ──
  section('10. Administración de usuarios');
  r = await api('POST', '/users/' + ids.plain + '/promote', T.player);
  eq('jugador no promueve admins (403)', r.status, 403);
  r = await api('POST', '/users/' + ids.plain + '/promote', A);
  check('admin promueve a otro usuario', r.status === 200 && r.data.roles.includes('ADMIN'));
  r = await api('POST', '/users/' + ids.plain + '/promote', A);
  eq('promover a quien ya es admin rechazado (409)', r.status, 409);
  r = await api('POST', '/users/' + ids.plain + '/demote', A);
  check('admin degrada a otro admin', r.status === 200 && !r.data.roles.includes('ADMIN'));

  // ── 11. Bajas ──
  section('11. Bajas y eliminaciones');
  r = await api('DELETE', '/teams/' + tA.id, A);
  eq('un equipo con partidos no se elimina (409)', r.status, 409);
  r = await api('DELETE', '/teams/' + tD.id, A);
  eq('un equipo sin partidos se elimina (200)', r.status, 200);
  r = await api('DELETE', '/tournaments/' + tour.id, A);
  eq('un torneo con partidos no se elimina (409)', r.status, 409);
  r = await api('DELETE', '/profiles/' + profile.female, A);
  eq('baja de una jugadora (200)', r.status, 200);
  r = await api('GET', '/teams/' + tA.id);
  check('la jugadora dada de baja sale del plantel', r.data.roster && r.data.roster.length === 2, JSON.stringify(r.data.roster));
  r = await api('DELETE', '/profiles/' + profile.player + '?permanent=true', A);
  eq('un perfil con cuenta vinculada no se borra del todo (409)', r.status, 409);
  r = await api('DELETE', '/profiles/' + profile.extras[0] + '?permanent=true', A);
  eq('un árbitro con partidos asignados no se borra del todo (409)', r.status, 409);
  r = await api('DELETE', '/profiles/' + profile.extras[5] + '?permanent=true', A);
  eq('un perfil sin cuenta ni partidos se borra del todo (200)', r.status, 200);

  // ── 12. Eliminar cuenta ──
  section('12. Eliminar mi cuenta');
  r = await api('DELETE', '/me', T.plain, {});
  eq('eliminar cuenta exige confirmación (400)', r.status, 400);
  r = await api('DELETE', '/me', T.plain, { confirm: true });
  eq('el usuario elimina su cuenta (200)', r.status, 200);
  r = await api('GET', '/me', T.plain);
  eq('con la cuenta eliminada el token ya no sirve (401)', r.status, 401);

  console.log('\nNota: la regla "el último admin no puede ser degradado ni eliminado" no se automatiza (exigiría dejar un solo admin en la base).');
}

(async () => {
  try {
    await run();
  } catch (err) {
    failed++;
    failures.push('la prueba se cortó: ' + err.message);
    console.error('\nSe cortó la prueba:', err);
  } finally {
    for (const s of openSockets) s.close();
    try {
      await cleanup();
      console.log('\nDatos de prueba eliminados.');
    } catch (err) {
      console.error('\nNo se pudo limpiar (borrá a mano lo que empiece con SMOKE / smoke-):', err.message);
    }
    console.log('\nRESULTADO: ' + passed + ' OK, ' + failed + ' con falla');
    failures.forEach((f) => console.log('  - ' + f));
    await prisma.$disconnect();
    process.exit(failed ? 1 : 0);
  }
})();
