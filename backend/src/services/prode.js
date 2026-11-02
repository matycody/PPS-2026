const prisma = require('../db');

// Prode: predicciones con puntos (sin dinero). Fase 1: cada acierto vale lo mismo (POINTS_PER_HIT).
// "points" se guarda en cada predicción, así más adelante el valor puede depender de la probabilidad sin tocar las ya hechas.
const POINTS_PER_HIT = 10;
const PICKS = ['A', 'DRAW', 'B'];
const OPEN_STATUSES = ['SCHEDULED']; // se predice mientras está Programado: al pasar a Habilitado (unos minutos antes de empezar) se cierra

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

const BLOCK_OWN = 'Jugás en uno de los equipos de este partido: no podés predecirlo';
const BLOCK_ASSIGNED = 'Estás asignado a este partido: no podés predecirlo';

// Por qué este usuario NO puede predecir este partido (o null si puede):
// juega en alguno de los dos equipos, o está asignado al partido (mesa/árbitro)
async function blockedReason(user, match) {
  if (user.profileId) {
    const ids = [match.teamAId, match.teamBId].filter(Boolean);
    const own = await prisma.playerTeam.findFirst({ where: { profileId: user.profileId, teamId: { in: ids }, to: null } });
    if (own) return BLOCK_OWN;
  }
  const assigned = await prisma.matchAssignment.findFirst({
    where: { matchId: match.id, OR: [{ userId: user.id }, ...(user.profileId ? [{ profileId: user.profileId }] : [])] },
  });
  if (assigned) return BLOCK_ASSIGNED;
  return null;
}

// Bonus por anticipación: cuanto antes del partido se predice, más multiplica los puntos base.
// El reloj arranca al predecir y solo se reinicia si se cambia la elección.
const TIERS = [[90, 1.75], [60, 1.5], [30, 1.3], [14, 1.15], [7, 1.08], [3, 1.03], [0, 1]];
const DAY = 86400000;
const daysBetween = (from, to) => (to ? (new Date(to).getTime() - new Date(from).getTime()) / DAY : 0);
const tierOf = (days) => (TIERS.find(([d]) => days >= d) ?? [0, 1])[1];
// Bonus que se lleva quien predice "desde" (ahora por defecto) para un partido que arranca en "scheduledAt"
function bonusFrom(scheduledAt, from = new Date()) {
  const days = scheduledAt ? daysBetween(from, scheduledAt) : 0;
  const mult = tierOf(days);
  const idx = TIERS.findIndex(([, m]) => m === mult);
  const next = idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1][1] : null;
  const inDays = next ? Math.max(1, Math.ceil(days - TIERS[idx][0])) : null; // cuándo baja a la franja siguiente
  return { mult, next, inDays };
}

// Cierre del partido (pasa a Habilitado): las cuotas del cierre quedan guardadas en el partido y
// la base y el bonus de cada predicción quedan fijos
async function freezePredictions(matchId) {
  const { oddsForMatches } = require('./odds');
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, modality: true, branch: true, scheduledAt: true, teamAId: true, teamBId: true, closingOdds: true, stage: { select: { type: true } } },
  });
  if (!match) return;
  const odds = (await oddsForMatches([match])).get(match.id);
  if (!match.closingOdds) await prisma.match.update({ where: { id: matchId }, data: { closingOdds: odds } });
  const rows = await prisma.prediction.findMany({ where: { matchId, closedAt: null } });
  if (!rows.length) return;
  const now = new Date();
  await prisma.$transaction(rows.map((r) => {
    const o = (match.closingOdds ?? odds)[r.pick];
    const bonus = bonusFrom(match.scheduledAt, r.pickedAt).mult;
    return prisma.prediction.update({ where: { id: r.id }, data: { closedAt: now, cuota: o.cuota, bonus, points: Math.round(o.pts * bonus) } });
  }));
}

// Si el partido vuelve a Programado (se des-habilita), las predicciones se reabren
async function reopenPredictions(matchId) {
  await prisma.prediction.updateMany({ where: { matchId, closedAt: { not: null } }, data: { closedAt: null, bonus: null, cuota: null } });
  await prisma.match.update({ where: { id: matchId }, data: { closingOdds: null } });
}

// Quien es designado árbitro o mesa de un partido que ya había predicho pierde esa predicción
// (no se le puede impedir predecir antes de saber que lo van a designar; esto evita el mal uso)
async function dropPredictionsOfAssigned(matchId, { userId, profileId }) {
  const users = [];
  if (userId) users.push(userId);
  if (profileId) {
    const u = await prisma.user.findUnique({ where: { profileId }, select: { id: true } });
    if (u) users.push(u.id);
  }
  if (!users.length) return 0;
  const r = await prisma.prediction.deleteMany({ where: { matchId, userId: { in: users } } });
  return r.count;
}

const matchFields = { id: true, status: true, hiddenAt: true, modality: true, teamAId: true, teamBId: true };

module.exports = { dropPredictionsOfAssigned, bonusFrom, freezePredictions, reopenPredictions, POINTS_PER_HIT, PICKS, OPEN_STATUSES, BLOCK_OWN, BLOCK_ASSIGNED, outcome, verdict, blockedReason, matchFields };
