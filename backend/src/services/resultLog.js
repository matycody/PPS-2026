const prisma = require('../db');

// Apodo si tiene, si no nombre real, si no (admin sin perfil) el mail
async function editorLabel(user) {
  if (user.profileId) {
    const p = await prisma.profile.findUnique({
      where: { id: user.profileId },
      select: { nickname: true, name: true },
    });
    if (p) return p.nickname || p.name;
  }
  return user.email;
}

function teamLabel(team, fallback) {
  return team && team.name ? team.name : fallback;
}

// "Equipo A vs Equipo B (cancha 1)" — requiere match con teamA/teamB incluidos (select name)
function matchLabelFrom(match) {
  const a = teamLabel(match.teamA, 'Sin equipo A');
  const b = teamLabel(match.teamB, 'Sin equipo B');
  return a + ' vs ' + b + ' (cancha ' + match.court + ')';
}

// "ganó Equipo A" o "empate"
function setResultLabel(match, winnerTeamId) {
  if (!winnerTeamId) return 'empate';
  const name =
    winnerTeamId === match.teamAId ? teamLabel(match.teamA, 'el equipo A') : teamLabel(match.teamB, 'el equipo B');
  return 'ganó ' + name;
}

function buildLogData(match, editedById, label, type, description) {
  return {
    matchId: match.id,
    matchLabel: matchLabelFrom(match),
    editedBy: editedById,
    editorLabel: label,
    type,
    description,
  };
}

// Arma la consulta SIN ejecutarla: pensada para ir dentro de un array de $transaction.
// NO es async: si lo fuera, un "await logEntry(...)" ejecutaría la consulta antes de tiempo
// (await desenvuelve cualquier objeto con .then(), y las consultas de Prisma lo tienen).
// El apodo/nombre (editorLbl) se resuelve ANTES, aparte, con editorLabel(user).
function logEntry(match, editedById, editorLbl, type, description) {
  return prisma.matchResultLog.create({ data: buildLogData(match, editedById, editorLbl, type, description) });
}

// ── Acciones del reloj, para la misma línea de tiempo ──

function targetLabel(target) {
  if (target === 'match') return 'partido';
  if (target === 'set') return 'set';
  return 'partido y set';
}
function timerLabel(timer) {
  return timer === 'set' ? 'set' : 'partido';
}
function signed(seconds) {
  const n = Number(seconds) || 0;
  return (n >= 0 ? '+' : '') + n + 's';
}
function mmss(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

function describeClockAction(action, detail) {
  const d = detail || {};
  const group = d.scope === 'group' ? ' (todos sus partidos asignados)' : '';
  switch (action) {
    case 'START':
      return 'Inició el reloj (' + targetLabel(d.target) + ')';
    case 'PAUSE':
      return 'Pausó el reloj (' + targetLabel(d.target) + ')' + group;
    case 'RESUME':
      return 'Reanudó el reloj (' + targetLabel(d.target) + ')' + group;
    case 'RESET':
      return 'Reinició el reloj del ' + timerLabel(d.timer);
    case 'ADJUST':
      return 'Ajustó el reloj del ' + timerLabel(d.timer) + ': ' + signed(d.seconds);
    case 'SET_TIME':
      return 'Fijó el reloj del ' + timerLabel(d.timer) + ' en ' + mmss(d.totalSeconds);
    case 'SET_MODALITY':
      return 'Cambió la modalidad del reloj a ' + (d.modality === 'cloth' ? 'Cloth' : 'Foam');
    case 'SET_HALF':
      return 'Cambió al ' + (d.half === 2 ? '2do' : '1er') + ' tiempo';
    case 'FINISH_HALF':
      return 'Finalizó el tiempo actual';
    default:
      return action;
  }
}

module.exports = {
  editorLabel,
  matchLabelFrom,
  setResultLabel,
  buildLogData,
  logEntry,
  describeClockAction,
};
