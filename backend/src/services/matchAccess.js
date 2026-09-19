const prisma = require('../db');

const OPEN = ['READY', 'LIVE']; // reloj habilitado

async function getMatchFunctions(user, matchId) {
  const or = [{ function: 'TABLE', userId: user.id }];
  if (user.profileId) or.push({ function: 'REFEREE', profileId: user.profileId });
  const rows = await prisma.matchAssignment.findMany({ where: { matchId, OR: or } });
  return {
    isTable: rows.some((r) => r.function === 'TABLE'),
    isReferee: rows.some((r) => r.function === 'REFEREE'),
  };
}

async function getPermissions(user, match) {
  const { isTable, isReferee } = await getMatchFunctions(user, match.id);
  const isAdmin = user.roles.includes('ADMIN');
  const open = OPEN.includes(match.status);

  return {
    isAdmin,
    isTable,
    isReferee,
    // Árbitro asignado o mesa asignada, con el partido Habilitado o En vivo
    canControlClock: (isTable || isReferee) && open,
    canReady: (isAdmin || isTable) && match.status === 'SCHEDULED',
    canUnready: (isAdmin || isTable) && match.status === 'READY',
    // Sets: la mesa mientras dura el partido; el admin solo para corregir uno finalizado
    canAddSets: (isTable && open) || (isAdmin && match.status === 'FINISHED'),
    // Editar resultado: admin siempre; mesa solo mientras dura el partido
    canEditResult: match.status !== 'CANCELLED' && (isAdmin || (isTable && open)),
    // Finalizar: solo un admin asignado como mesa
    canFinish: isAdmin && isTable && open,
  };
}

module.exports = { getMatchFunctions, getPermissions };
