const prisma = require('../db');

// Torneos con zona de liga todavía sin terminar: sus cruces de playoffs son "probables", no definitivos.
// Devuelve un Set con los ids de torneo.
async function openLeagueTournaments(tournamentIds) {
  const ids = [...new Set((tournamentIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await prisma.match.findMany({
    where: { tournamentId: { in: ids }, hiddenAt: null, stage: { type: 'LEAGUE' }, status: { notIn: ['FINISHED', 'CANCELLED'] } },
    select: { tournamentId: true },
    distinct: ['tournamentId'],
  });
  return new Set(rows.map((r) => r.tournamentId));
}

module.exports = { openLeagueTournaments };
