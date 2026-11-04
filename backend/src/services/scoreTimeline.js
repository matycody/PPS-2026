// Sets de un partido con el marcador acumulado después de cada uno (0-1, 1-1, 2-1…) y el momento en que se decidieron.
// Mismo criterio de puntos que el marcador: Foam +1 al ganador; Cloth +2 al ganador y empate +1 a cada uno.
function setsWithScore(match) {
  const win = match.modality === 'CLOTH' ? 2 : 1;
  let a = 0;
  let b = 0;
  return match.sets.map((s) => {
    if (!s.winnerTeamId) {
      if (match.modality === 'CLOTH') {
        a += 1;
        b += 1;
      }
    } else if (s.winnerTeamId === match.teamAId) a += win;
    else if (s.winnerTeamId === match.teamBId) b += win;
    return {
      number: s.number,
      winnerTeamId: s.winnerTeamId,
      draw: s.winnerTeamId === null,
      half: s.half ?? null, // null en los sets cargados antes de existir el registro
      second: s.matchSecond ?? null,
      at: s.createdAt ?? null,
      scoreA: a,
      scoreB: b,
    };
  });
}

module.exports = { setsWithScore };
