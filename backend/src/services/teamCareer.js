const prisma = require('../db');
const { decide } = require('./bracket');
const { computeStandings } = require('./standings');

function roundLabel(round, maxRound) {
  const d = maxRound - round;
  if (d === 0) return 'Final';
  if (d === 1) return 'Semifinal';
  if (d === 2) return 'Cuartos de final';
  if (d === 3) return 'Octavos de final';
  return 'Ronda ' + round;
}

// Resultado del equipo en la llave: campeón, subcampeón, 3.º/4.º, eliminado en una ronda o todavía en juego
function knockoutResult(teamId, champion, stageMatches) {
  const loserTargets = new Map();
  stageMatches.forEach((m) => { if (m.loserMatchId) loserTargets.set(m.loserMatchId, (loserTargets.get(m.loserMatchId) ?? 0) + 1); });
  const isThird = (m) => (loserTargets.get(m.id) ?? 0) >= 2;
  const maxRound = Math.max(...stageMatches.map((m) => m.round || 0));
  const mine = stageMatches.filter((m) => m.teamAId === teamId || m.teamBId === teamId);
  if (!mine.length) return null;

  const won = (m) => { const d = decide(m); return d ? d.winnerTeamId === teamId : null; }; // null = sin ganador todavía
  const third = mine.find(isThird);
  if (third && third.status === 'FINISHED' && won(third) !== null) return { kind: won(third) ? 'THIRD' : 'FOURTH', label: won(third) ? '3.º puesto' : '4.º puesto' };

  const main = mine.filter((m) => !isThird(m)).sort((a, b) => (b.round || 0) - (a.round || 0));
  const last = main[0];
  if (!last) return null;
  const label = roundLabel(last.round || 0, maxRound);
  const w = last.status === 'FINISHED' ? won(last) : null;
  if (last.round === maxRound) {
    if (w === true || champion === teamId) return { kind: 'CHAMPION', label: 'Campeón' };
    if (w === false) return { kind: 'RUNNER_UP', label: 'Subcampeón' };
    return { kind: 'IN_PLAY', label: 'En juego · Final' };
  }
  if (w === false) return { kind: 'ELIMINATED', label: 'Eliminado en ' + label.toLowerCase() };
  if (w === true) return { kind: 'IN_PLAY', label: 'Avanzó · ' + roundLabel((last.round || 0) + 1, maxRound) };
  return { kind: 'IN_PLAY', label: 'En juego · ' + label };
}

// Carrera del equipo por torneo: resultado real (llaves incluidas) y su paso por la zona
async function teamCareer(teamId, tournamentWhere) {
  const tournaments = await prisma.tournament.findMany({
    where: { ...tournamentWhere, status: { in: ['ACTIVE', 'FINISHED'] }, teams: { some: { teamId } } },
    select: {
      id: true, name: true, year: true, edition: true, status: true, championId: true,
      stages: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
  });
  const out = [];
  for (const t of tournaments) {
    // Paso por la zona: tabla guardada (torneo cerrado) o calculada en vivo
    let zone = null;
    const saved = await prisma.stageStanding.findFirst({ where: { teamId, stage: { tournamentId: t.id, type: 'LEAGUE' } }, include: { stage: { select: { name: true } } } });
    if (saved) zone = { name: saved.zone || saved.stage.name, position: saved.position, points: saved.points, played: saved.played };
    else {
      const live = await computeStandings(t.id).catch(() => null);
      for (const s of live?.stages ?? []) {
        const i = s.rows.findIndex((r) => r.team.id === teamId);
        if (i >= 0) { zone = { name: s.name, position: i + 1, points: s.rows[i].points, played: s.rows[i].played }; break; }
      }
    }

    const koIds = t.stages.filter((s) => s.type === 'KNOCKOUT').map((s) => s.id);
    let result = null;
    if (koIds.length) {
      const ko = await prisma.match.findMany({
        where: { stageId: { in: koIds }, hiddenAt: null, status: { not: 'CANCELLED' } },
        select: { id: true, stageId: true, round: true, status: true, teamAId: true, teamBId: true, loserMatchId: true, sets: { select: { winnerTeamId: true } } },
      });
      for (const sid of koIds) {
        result = knockoutResult(teamId, t.championId, ko.filter((m) => m.stageId === sid));
        if (result) break;
      }
      if (!result) {
        result = t.status === 'FINISHED'
          ? { kind: 'GROUP_ONLY', label: 'No clasificó a playoffs' }
          : { kind: 'GROUP_ONLY', label: 'Fase de zonas' };
      }
    } else if (t.championId === teamId) {
      result = { kind: 'CHAMPION', label: 'Campeón' };
    } else if (zone) {
      result = { kind: 'LEAGUE', label: zone.position + '.º en la tabla' };
    }
    out.push({ tournamentId: t.id, tournament: t.name, year: t.year, edition: t.edition, status: t.status, result, zone });
  }
  return out;
}

module.exports = { teamCareer };
