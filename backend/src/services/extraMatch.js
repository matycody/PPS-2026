// Partidos agregados a un torneo por la organización fuera del fixture generado.
// - Sin "suma a la tabla": el partido queda con tournamentId pero sin zona (stageId null) y se lista en
//   "Fuera del fixture".
// - Con "suma a la tabla": el partido se asigna a una zona de liga (stageId) y a una fecha (matchdayId), así que
//   aparece en el fixture y la tabla lo cuenta al finalizar (la tabla se calcula siempre desde los partidos).

const prisma = require('../db');

class ExtraMatchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// El torneo tiene que admitir partidos nuevos: ni finalizado ni pausado
async function assertTournamentOpen(tournamentId) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new ExtraMatchError(404, 'Torneo no encontrado');
  if (t.status === 'FINISHED') throw new ExtraMatchError(409, 'El torneo ya finalizó: no se le pueden agregar partidos');
  if (t.pausedAt) throw new ExtraMatchError(409, 'El torneo está pausado: reanudalo para agregarle partidos');
  return t;
}

// Valida que el partido pueda sumar a la tabla de una zona y devuelve { stage, matchday|null }.
// matchdayId: id de una fecha existente de esa zona, o vacío / "new" para crear una fecha nueva.
async function planStanding({ tournamentId, stageId, matchdayId, teamAId, teamBId }) {
  if (!tournamentId) throw new ExtraMatchError(400, 'Para sumar a la tabla el partido tiene que ser de un torneo');
  if (!stageId) throw new ExtraMatchError(400, 'Elegí la zona en la que suma');
  const stage = await prisma.stage.findFirst({
    where: { id: String(stageId), tournamentId, type: 'LEAGUE' },
    include: { teams: { select: { teamId: true } } },
  });
  if (!stage) throw new ExtraMatchError(404, 'Zona no encontrada en este torneo');
  if (!teamAId || !teamBId) throw new ExtraMatchError(409, 'Para sumar a la tabla hay que definir los dos equipos');
  const inStage = new Set(stage.teams.map((x) => x.teamId));
  if (!inStage.has(teamAId) || !inStage.has(teamBId)) {
    throw new ExtraMatchError(409, 'Los dos equipos tienen que ser de la zona ' + stage.name);
  }
  let matchday = null;
  if (matchdayId && matchdayId !== 'new') {
    matchday = await prisma.matchday.findFirst({ where: { id: String(matchdayId), stageId: stage.id } });
    if (!matchday) throw new ExtraMatchError(404, 'Fecha no encontrada en esa zona');
  }
  return { stage, matchday };
}

// Crea la fecha nueva si hace falta y devuelve { stageId, matchdayId, slot } para guardar en el partido.
// Se llama dentro de la transacción del alta o de la edición.
async function placeInFixture(tx, { stage, matchday }, scheduledAt) {
  let md = matchday;
  if (!md) {
    const last = await tx.matchday.aggregate({ where: { stageId: stage.id }, _max: { number: true } });
    md = await tx.matchday.create({
      data: { stageId: stage.id, number: (last._max.number ?? 0) + 1, date: scheduledAt ?? null },
    });
  }
  const lastSlot = await tx.match.aggregate({ where: { matchdayId: md.id }, _max: { slot: true } });
  return { stageId: stage.id, matchdayId: md.id, slot: (lastSlot._max.slot ?? 0) + 1 };
}

// Partidos del torneo que no pertenecen a ninguna zona ni llave (público; respeta ocultos y pausa)
function listExtraMatches(tournamentId, TEAM_SELECT, includePaused = false) {
  return prisma.match.findMany({
    where: includePaused
      ? { tournamentId, stageId: null, OR: [{ hiddenAt: null }, { hiddenByPause: true }] }
      : { tournamentId, stageId: null, hiddenAt: null },
    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      hiddenByPause: true,
      court: true,
      status: true,
      statusReason: true,
      originalScheduledAt: true,
      scheduledAt: true,
      modality: true,
      teamAId: true,
      teamBId: true,
      sets: { select: { winnerTeamId: true } },
      teamA: { select: TEAM_SELECT },
      teamB: { select: TEAM_SELECT },
    },
  });
}

module.exports = { ExtraMatchError, assertTournamentOpen, planStanding, placeInFixture, listExtraMatches };
