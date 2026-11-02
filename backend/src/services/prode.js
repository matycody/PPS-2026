const prisma = require('../db');

// Prode: predicciones con puntos (sin dinero). Fase 1: cada acierto vale lo mismo (POINTS_PER_HIT).
// "points" se guarda en cada predicción, así más adelante el valor puede depender de la probabilidad sin tocar las ya hechas.
const POINTS_PER_HIT = 10;
const PICKS = ['A', 'DRAW', 'B'];
const OPEN_STATUSES = ['SCHEDULED', 'READY']; // se predice hasta que el partido pasa a En vivo

// Resultado por puntos de juego (igual que la tabla): Foam 1 por set, Cloth 2 por set y 1 cada uno si el set empata.
// null = sin sets cargados (no se puede decidir)
function outcome(match) {
  const win = match.modality === 'CLOTH' ? 2 : 1;
  let a = 0;
  let b = 0;
  for (const s of match.sets || []) {
    if (!s.winnerTeamId) { if (match.modality === 'CLOTH') { a += 1; b += 1; } }
    else if (s.winnerTeamId === match.teamAId) a += win;
    else if (s.winnerTeamId === match.teamBId) b += win;
  }
  if ((match.sets || []).length === 0) return null;
  return { a, b, pick: a > b ? 'A' : a < b ? 'B' : 'DRAW' };
}

// HIT | MISS | PENDING | VOID (partido cancelado/suspendido o terminado sin sets: no suma ni resta)
function verdict(prediction, match) {
  if (match.status === 'CANCELLED' || match.status === 'SUSPENDED') return 'VOID';
  if (match.status !== 'FINISHED') return 'PENDING';
  const o = outcome(match);
  if (!o) return 'VOID';
  return o.pick === prediction.pick ? 'HIT' : 'MISS';
}

// Por qué este usuario NO puede predecir este partido (o null si puede):
// juega en alguno de los dos equipos, o está asignado al partido (mesa/árbitro)
async function blockedReason(user, match) {
  if (user.profileId) {
    const ids = [match.teamAId, match.teamBId].filter(Boolean);
    const own = await prisma.playerTeam.findFirst({ where: { profileId: user.profileId, teamId: { in: ids }, to: null } });
    if (own) return 'Jugás en uno de los equipos de este partido: no podés predecirlo';
  }
  const assigned = await prisma.matchAssignment.findFirst({
    where: { matchId: match.id, OR: [{ userId: user.id }, ...(user.profileId ? [{ profileId: user.profileId }] : [])] },
  });
  if (assigned) return 'Estás asignado a este partido: no podés predecirlo';
  return null;
}

const matchFields = { id: true, status: true, hiddenAt: true, modality: true, teamAId: true, teamBId: true };

module.exports = { POINTS_PER_HIT, PICKS, OPEN_STATUSES, outcome, verdict, blockedReason, matchFields };
