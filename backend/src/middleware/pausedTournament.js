// Torneo pausado: para quien no es organización desaparece por completo (listado, detalle, fixture, posiciones, llaves).
// Sus partidos se ocultan al pausar (ver POST /tournaments/:id/pause), así que tampoco aparecen en el resto de la app.
const prisma = require('../db');
const { optionalAuth } = require('./auth');

const runOptionalAuth = (req, res) => new Promise((resolve) => optionalAuth(req, res, resolve));
const ID_PATH = /^\/([0-9a-f-]{36})(?:\/|$)/i;

async function pausedTournament(req, res, next) {
  try {
    if (req.method !== 'GET') return next();
    const isList = req.path === '/' || req.path === '';
    const idMatch = req.path.match(ID_PATH);
    if (!isList && !idMatch) return next();

    // Quién consulta: solo se necesita la sesión si hay algo pausado que ocultar
    if (isList) {
      await runOptionalAuth(req, res);
      if (res.headersSent) return undefined;
      req.hidePaused = !(req.user && req.user.roles.includes('ADMIN'));
      return next();
    }

    const t = await prisma.tournament.findUnique({ where: { id: idMatch[1] }, select: { pausedAt: true } });
    if (!t || !t.pausedAt) return next();
    await runOptionalAuth(req, res);
    if (res.headersSent) return undefined;
    if (req.user && req.user.roles.includes('ADMIN')) return next();
    return res.status(404).json({ error: 'Torneo no encontrado' });
  } catch (err) {
    console.error('[pausedTournament]', err);
    return next();
  }
}

module.exports = pausedTournament;
