const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Ítems de menú por rol (el front solo los renderiza)
const MENU = {
  BASE: ['home', 'favoritos', 'perfil'],
  PLAYER: ['mis_partidos', 'mi_equipo', 'mis_estadisticas'],
  REFEREE: ['mis_partidos_asignados'],
  ADMIN: [
    'dashboard_canchas', 'torneos', 'partidos', 'equipos',
    'personas', 'importar_excel', 'usuarios', 'registro_ediciones',
  ],
};

function buildMenu(roles) {
  const items = new Set(MENU.BASE);
  for (const role of roles) (MENU[role] || []).forEach((i) => items.add(i));
  return [...items];
}

router.get('/', authenticate, (req, res) => {
  const { id, email, roles, profileId } = req.user;
  res.json({ user: { id, email, roles, profileId }, menu: buildMenu(roles) });
});

module.exports = router;