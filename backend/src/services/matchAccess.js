const prisma = require('../db');

const OPEN = ['READY', 'LIVE']; // reloj habilitado

async function getMatchFunctions(user, matchId) {
  const or = [{ function: 'TABLE', userId: user.id }];
  if (user.profileId) {
    or.push({ function: 'REFEREE', profileId: user.profileId });
    or.push({ function: 'TABLE', profileId: user.profileId });
  }
  const rows = await prisma.matchAssignment.findMany({ where: { matchId, OR: or } });

  let isTable = rows.some((r) => r.function === 'TABLE');
  const isReferee = rows.some((r) => r.function === 'REFEREE');

  // Mesa por equipo: cualquiera que esté HOY en el plantel de un equipo asignado como mesa
  if (!isTable && user.profileId) {
    const teamRows = await prisma.matchAssignment.findMany({
      where: { matchId, function: 'TABLE', teamId: { not: null } },
      select: { teamId: true },
    });
    if (teamRows.length) {
      const membership = await prisma.playerTeam.findFirst({
        where: { profileId: user.profileId, teamId: { in: teamRows.map((r) => r.teamId) }, to: null },
        select: { id: true },
      });
      if (membership) isTable = true;
    }
  }

  return { isTable, isReferee };
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
    canAddSets: ((isTable || isReferee) && open) || (isAdmin && match.status === 'FINISHED'),
    canEditResult: match.status !== 'CANCELLED' && (isAdmin || (isTable && open)),
    canFinish: isAdmin && isTable && open,
  };
}

module.exports = { getMatchFunctions, getPermissions };
