const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const ACTIVE = ['SCHEDULED', 'READY', 'LIVE'];

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

// Mis partidos asignados (árbitro y/o mesa), próximos primero
router.get('/assignments', authenticate, async (req, res) => {
  try {
    const or = [{ function: 'TABLE', userId: req.user.id }];
    if (req.user.profileId) or.push({ function: 'REFEREE', profileId: req.user.profileId });

    const rows = await prisma.matchAssignment.findMany({
      where: { OR: or, match: { status: { in: ACTIVE } } },
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

module.exports = router;
