const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const storage = require('../services/storage');
const { teamCareer } = require('../services/teamCareer');

const router = express.Router();

const ACTIVE = ['SCHEDULED', 'READY', 'LIVE', 'SUSPENDED'];
const NICKNAME_MAX = 30;
const NUMBER_MIN = 0;
const NUMBER_MAX = 999;

// Ítems de menú por rol (el front solo los renderiza)
const MENU = {
  BASE: ['home', 'favoritos', 'perfil'],
  PLAYER: ['mis_partidos', 'mi_equipo', 'mis_estadisticas', 'asignaciones'], // todo jugador ve Control de mesa (vacío si no tiene partidos asignados); los permisos reales siguen siendo por asignación
  REFEREE: ['asignaciones'], // pantalla única: Dirección de árbitro + Control de mesa
  TABLE: ['asignaciones'], // quien no es jugador lo recibe solo si tiene una mesa asignada en un partido activo
  ADMIN: [
    'dashboard_canchas', 'torneos', 'partidos', 'equipos', 'sedes', 'sanciones',
    'asignaciones', 'personas', 'importar_excel', 'usuarios', 'planillas', 'registro_ediciones',
  ],
};

function buildMenu(roles, hasTable) {
  const items = new Set(MENU.BASE);
  for (const role of roles) (MENU[role] || []).forEach((i) => items.add(i));
  if (hasTable) MENU.TABLE.forEach((i) => items.add(i));
  if (items.has('asignaciones')) items.add('historial_asignaciones'); // entrada aparte en el menú
  return [...items];
}

// Ids de los equipos donde la persona juega HOY (para la mesa por equipo)
async function currentTeamIds(profileId) {
  if (!profileId) return [];
  const rows = await prisma.playerTeam.findMany({ where: { profileId, to: null }, select: { teamId: true } });
  return rows.map((r) => r.teamId);
}

// Ficha propia: datos del perfil y equipos actuales (uno por rama)
async function loadProfile(profileId) {
  const p = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      teams: {
        where: { to: null },
        orderBy: { branch: 'asc' },
        include: { team: { select: { id: true, name: true, logo: true } } },
      },
    },
  });
  if (!p) return null;
  return {
    photo: p.photo,
    profile: {
      id: p.id,
      dni: p.dni,
      name: p.name,
      nickname: p.nickname,
      number: p.number,
      birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : null,
      showNickname: p.showNickname,
      showNumber: p.showNumber,
      showAge: p.showAge,
      showPhoto: p.showPhoto,
      sex: p.sex,
      isPlayer: p.isPlayer,
      isReferee: p.isReferee,
      active: p.active,
      status: p.status,
      teams: p.teams.map((t) => ({
        teamId: t.team.id,
        name: t.team.name,
        logo: t.team.logo,
        branch: t.branch,
        since: t.from,
      })),
    },
  };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const { id, email, roles, profileId, username } = req.user;

    const tableOr = [{ function: 'TABLE', userId: id }];
    if (profileId) {
      tableOr.push({ function: 'TABLE', profileId });
      const teamIds = await currentTeamIds(profileId);
      if (teamIds.length) tableOr.push({ function: 'TABLE', teamId: { in: teamIds } });
    }
    const tableCount = await prisma.matchAssignment.count({
      where: { OR: tableOr, match: { status: { in: ACTIVE }, hiddenAt: null } },
    });

    res.json({ user: { id, email, username, roles, profileId }, menu: buildMenu(roles, tableCount > 0) });
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Mis partidos asignados (árbitro y/o mesa, por cuenta, por perfil o por equipo): pasados y futuros, sin los ocultos
// Nombre de usuario para iniciar sesión (solo lo ve la organización). null lo quita.
const USERNAME_RE = /^[a-z0-9._]{3,20}$/;
router.patch('/username', authenticate, async (req, res) => {
  try {
    const raw = req.body?.username;
    const username = raw === null ? null : typeof raw === 'string' ? raw.trim().toLowerCase() : undefined;
    if (username === undefined || (username !== null && !USERNAME_RE.test(username))) {
      return res.status(400).json({ error: 'Usuario inválido: 3 a 20 caracteres, solo letras, números, punto y guion bajo' });
    }
    try {
      await prisma.user.update({ where: { id: req.user.id }, data: { username } });
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'Ese usuario ya está en uso' });
      throw err;
    }
    res.json({ username });
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/assignments', authenticate, async (req, res) => {
  try {
    const or = [{ function: 'TABLE', userId: req.user.id }];
    if (req.user.profileId) {
      or.push({ function: 'REFEREE', profileId: req.user.profileId });
      or.push({ function: 'TABLE', profileId: req.user.profileId });
      const teamIds = await currentTeamIds(req.user.profileId);
      if (teamIds.length) or.push({ function: 'TABLE', teamId: { in: teamIds } });
    }

    const rows = await prisma.matchAssignment.findMany({
      where: { OR: or, match: { hiddenAt: null } },
      include: {
        match: {
          include: {
            tournament: { select: { id: true, name: true } },
            teamA: { select: { id: true, name: true, logo: true } },
            teamB: { select: { id: true, name: true, logo: true } },
          },
        },
      },
    });

    // Dedupe por partido: puede tener más de una vía de acceso al mismo (ej. árbitro y también mesa por equipo)
    const byMatch = new Map();
    for (const r of rows) if (!byMatch.has(r.match.id)) byMatch.set(r.match.id, r);
    const list = [...byMatch.values()];

    list.sort((a, b) => {
      const ta = a.match.scheduledAt ? a.match.scheduledAt.getTime() : Infinity;
      const tb = b.match.scheduledAt ? b.match.scheduledAt.getTime() : Infinity;
      return ta - tb || (a.match.court ?? 999) - (b.match.court ?? 999);
    });

    res.json(
      list.map((r) => ({
        function: r.function,
        match: {
          id: r.match.id,
          tournament: r.match.tournament,
          court: r.match.court,
          branch: r.match.branch,
          modality: r.match.modality,
          status: r.match.status,
          scheduledAt: r.match.scheduledAt,
          timeSet: r.match.scheduledAt ? !!r.match.timeSet : false,
          finishedAt: r.match.finishedAt,
          teamA: r.match.teamA,
          teamB: r.match.teamB,
        },
      }))
    );
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Mi ficha: datos propios, equipos actuales por rama y foto
// Estadísticas propias del jugador, a partir de los partidos de sus equipos actuales (por rama) y de sus sanciones
function score(m) {
  const win = m.modality === 'CLOTH' ? 2 : 1;
  let a = 0;
  let b = 0;
  for (const st of m.sets) {
    if (!st.winnerTeamId) { if (m.modality === 'CLOTH') { a += 1; b += 1; } }
    else if (st.winnerTeamId === m.teamAId) a += win;
    else if (st.winnerTeamId === m.teamBId) b += win;
  }
  return { a, b };
}

router.get('/stats', authenticate, async (req, res) => {
  try {
    const { profileId } = req.user;
    if (!profileId) return res.json({ teams: [], total: null, form: [], recent: [], next: null, medals: { gold: 0, silver: 0, bronze: 0 }, career: [], sanctions: null });
    const pts = await prisma.playerTeam.findMany({
      where: { profileId, to: null },
      include: { team: { select: { id: true, name: true, logo: true } } },
    });
    const TEAM = { id: true, name: true, logo: true };
    const rows = [];
    const upcoming = [];
    const career = [];
    for (const pt of pts) {
      const where = { branch: pt.branch, hiddenAt: null, OR: [{ teamAId: pt.teamId }, { teamBId: pt.teamId }] };
      const [done, next, car] = await Promise.all([
        prisma.match.findMany({
          where: { ...where, status: 'FINISHED' },
          select: { id: true, modality: true, teamAId: true, teamBId: true, finishedAt: true, scheduledAt: true, tournament: { select: { name: true, year: true } }, teamA: { select: TEAM }, teamB: { select: TEAM }, sets: { select: { winnerTeamId: true } } },
        }),
        prisma.match.findFirst({
          where: { ...where, status: { in: ['SCHEDULED', 'READY', 'LIVE'] } },
          orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }],
          select: { id: true, status: true, scheduledAt: true, tournament: { select: { name: true } }, teamA: { select: TEAM }, teamB: { select: TEAM } },
        }),
        teamCareer(pt.teamId, { branch: pt.branch }).catch(() => []),
      ]);
      for (const m of done) {
        const sc = score(m);
        const mineIsA = m.teamAId === pt.teamId;
        const mine = mineIsA ? sc.a : sc.b;
        const other = mineIsA ? sc.b : sc.a;
        rows.push({ id: m.id, teamId: pt.teamId, branch: pt.branch, tournament: m.tournament?.name ?? null, year: m.tournament?.year ?? null, rival: mineIsA ? m.teamB : m.teamA, mine, other, res: mine > other ? 'G' : mine < other ? 'P' : 'E', date: m.finishedAt ?? m.scheduledAt });
      }
      if (next) upcoming.push({ id: next.id, status: next.status, scheduledAt: next.scheduledAt, tournament: next.tournament?.name ?? null, teamId: pt.teamId, rival: next.teamA?.id === pt.teamId ? next.teamB : next.teamA });
      car.forEach((c) => career.push({ ...c, teamId: pt.teamId, teamName: pt.team.name, branch: pt.branch }));
    }
    rows.sort((x, y) => new Date(y.date ?? 0) - new Date(x.date ?? 0));
    upcoming.sort((x, y) => (x.scheduledAt ? new Date(x.scheduledAt).getTime() : Infinity) - (y.scheduledAt ? new Date(y.scheduledAt).getTime() : Infinity));
    const count = (r) => rows.filter((x) => x.res === r).length;
    const total = { played: rows.length, won: count('G'), drawn: count('E'), lost: count('P') };
    total.pct = total.played ? Math.round((total.won / total.played) * 100) : 0;
    const kinds = (k) => career.filter((c) => c.result?.kind === k).length;

    const sanc = await prisma.matchSanction.findMany({
      where: { profileId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, matchId: true, kind: true, reason: true, createdAt: true, match: { select: { tournament: { select: { name: true } }, teamA: { select: { name: true } }, teamB: { select: { name: true } } } } },
    });
    const sc = (k) => sanc.filter((x) => x.kind === k).length;

    res.json({
      teams: pts.map((p) => ({ ...p.team, branch: p.branch })),
      total,
      form: rows.slice(0, 5).map((x) => x.res),
      recent: rows.slice(0, 5),
      next: upcoming[0] ?? null,
      medals: { gold: kinds('CHAMPION'), silver: kinds('RUNNER_UP'), bronze: kinds('THIRD') },
      career: career.filter((c) => c.result).sort((x, y) => (y.year ?? 0) - (x.year ?? 0)).slice(0, 12),
      sanctions: { total: sanc.length, warning: sc('WARNING'), yellow: sc('YELLOW'), blue: sc('BLUE'), red: sc('RED'), recent: sanc.slice(0, 5).map((x) => ({ id: x.id, matchId: x.matchId, kind: x.kind, reason: x.reason, date: x.createdAt, tournament: x.match?.tournament?.name ?? null, vs: [x.match?.teamA?.name, x.match?.teamB?.name].filter(Boolean).join(' vs ') })) },
    });
  } catch (err) {
    console.error('[me/stats]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/profile', authenticate, async (req, res) => {
  try {
    const { id, email, roles, profileId } = req.user;
    let profile = null;
    let photoPath = req.user.photo || null;

    if (profileId) {
      const loaded = await loadProfile(profileId);
      if (loaded) {
        profile = loaded.profile;
        photoPath = loaded.photo;
      }
    }

    const photoUrl = photoPath ? await storage.signedUrl(photoPath) : null;
    res.json({ user: { id, email, roles, profileId }, profile, photoUrl });
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Edita apodo, número, fecha de nacimiento y qué datos son públicos. Todo opcional; null borra el valor.
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const profileId = req.user.profileId;
    if (!profileId) {
      return res.status(404).json({ error: 'Tu cuenta no tiene un perfil de jugador o árbitro' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const data = {};
    const errors = [];

    if (has('nickname')) {
      if (body.nickname === null) {
        data.nickname = null;
      } else if (typeof body.nickname !== 'string') {
        errors.push('El apodo debe ser un texto');
      } else {
        const nick = body.nickname.trim();
        if (Array.from(nick).length > NICKNAME_MAX) {
          errors.push('El apodo no puede tener más de ' + NICKNAME_MAX + ' caracteres');
        } else {
          data.nickname = nick === '' ? null : nick;
        }
      }
    }

    if (has('number')) {
      if (body.number === null) {
        data.number = null;
      } else if (
        typeof body.number !== 'number' ||
        !Number.isInteger(body.number) ||
        body.number < NUMBER_MIN ||
        body.number > NUMBER_MAX
      ) {
        errors.push('El número de camiseta debe ser un entero de ' + NUMBER_MIN + ' a ' + NUMBER_MAX);
      } else {
        data.number = body.number;
      }
    }

    // Qué datos son públicos en mi banner de jugador
    for (const key of ['showNickname', 'showNumber', 'showAge', 'showPhoto']) {
      if (!has(key)) continue;
      if (typeof body[key] !== 'boolean') errors.push(key + ' debe ser true o false');
      else data[key] = body[key];
    }

    // Fecha de nacimiento (YYYY-MM-DD); solo se muestra la edad y solo si showAge
    if (has('birthDate')) {
      if (body.birthDate === null || body.birthDate === '') {
        data.birthDate = null;
      } else if (typeof body.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) {
        errors.push('La fecha de nacimiento debe tener formato AAAA-MM-DD');
      } else {
        const d = new Date(body.birthDate + 'T00:00:00Z');
        const year = d.getUTCFullYear();
        if (Number.isNaN(d.getTime()) || d > new Date() || year < 1920) errors.push('Fecha de nacimiento inválida');
        else data.birthDate = d;
      }
    }

    if (errors.length) return res.status(400).json({ errors });

    if (Object.keys(data).length) {
      await prisma.profile.update({ where: { id: profileId }, data });
    }

    const loaded = await loadProfile(profileId);
    if (!loaded) return res.status(404).json({ error: 'Tu cuenta no tiene un perfil de jugador o árbitro' });
    res.json(loaded.profile);
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
