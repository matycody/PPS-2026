const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const storage = require('../services/storage');

const router = express.Router();

const ACTIVE = ['SCHEDULED', 'READY', 'LIVE'];
const NICKNAME_MAX = 30;
const NUMBER_MIN = 0;
const NUMBER_MAX = 999;

// Ítems de menú por rol (el front solo los renderiza)
const MENU = {
  BASE: ['home', 'favoritos', 'perfil'],
  PLAYER: ['mis_partidos', 'mi_equipo', 'mis_estadisticas'],
  REFEREE: ['mis_partidos_asignados'],
  TABLE: ['control_mesa'], // solo si tiene una mesa asignada en un partido activo
  ADMIN: [
    'dashboard_canchas', 'torneos', 'partidos', 'equipos',
    'personas', 'importar_excel', 'usuarios', 'registro_ediciones',
  ],
};

function buildMenu(roles, hasTable) {
  const items = new Set(MENU.BASE);
  for (const role of roles) (MENU[role] || []).forEach((i) => items.add(i));
  if (hasTable) MENU.TABLE.forEach((i) => items.add(i));
  return [...items];
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
    const { id, email, roles, profileId } = req.user;
    const tableCount = await prisma.matchAssignment.count({
      where: { function: 'TABLE', userId: id, match: { status: { in: ACTIVE } } },
    });
    res.json({ user: { id, email, roles, profileId }, menu: buildMenu(roles, tableCount > 0) });
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Mis partidos asignados (árbitro y/o mesa): pasados y futuros, sin los ocultos
router.get('/assignments', authenticate, async (req, res) => {
  try {
    const or = [{ function: 'TABLE', userId: req.user.id }];
    if (req.user.profileId) or.push({ function: 'REFEREE', profileId: req.user.profileId });

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

    rows.sort((a, b) => {
      const ta = a.match.scheduledAt ? a.match.scheduledAt.getTime() : Infinity;
      const tb = b.match.scheduledAt ? b.match.scheduledAt.getTime() : Infinity;
      return ta - tb || a.match.court - b.match.court;
    });

    res.json(
      rows.map((r) => ({
        function: r.function,
        match: {
          id: r.match.id,
          tournament: r.match.tournament,
          court: r.match.court,
          branch: r.match.branch,
          modality: r.match.modality,
          status: r.match.status,
          scheduledAt: r.match.scheduledAt,
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

// Edita SOLO el apodo y el número de camiseta. Todo opcional; null borra el valor.
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
