const prisma = require('../db');

const TEAM_SIZE = 6; // jugadores por equipo en cancha

// Nombre público: apodo si el jugador lo dejó público, si no nombre completo
const publicName = (p) => (p ? (p.showNickname && p.nickname ? p.nickname : p.name) : null);

// Sanciones del partido (sin las deshechas), con el jugador
async function listSanctions(matchId) {
  const rows = await prisma.matchSanction.findMany({
    where: { matchId, revokedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { profile: { select: { id: true, name: true, nickname: true, showNickname: true, number: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    side: r.side,
    kind: r.kind,
    eliminates: r.eliminates,
    reason: r.reason,
    half: r.half,
    setNumber: r.setNumber,
    matchSecond: r.matchSecond,
    createdAt: r.createdAt,
    endedAt: r.endedAt,
    player: r.profile ? { id: r.profile.id, name: publicName(r.profile), number: r.profile.number } : null,
  }));
}

// Avisa a quienes miran el partido que cambiaron las sanciones
async function emitSanctions(io, matchId) {
  const items = await listSanctions(matchId);
  io.to('match:' + matchId).emit('match:sanctions', { matchId, items });
  return items;
}

const TZ = 'America/Argentina/Buenos_Aires';
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const matchDate = (m) => m.scheduledAt || m.finishedAt || m.createdAt;

// ¿Queda el jugador afuera del partido `match` por la suspension `sus`? (sus incluye sanction.match)
async function isBlocked(sus, match) {
  const red = sus.sanction.match;
  if (match.id === red.id) return false;
  const teamId = sus.sanction.side === 'A' ? red.teamAId : red.teamBId;
  if (!teamId || (match.teamAId !== teamId && match.teamBId !== teamId)) return false;
  const redDay = dayKey(matchDate(red));
  const day = dayKey(matchDate(match));
  if (day < redDay) return false;
  if (day === redDay) return sus.sameDay && new Date(matchDate(match)) > new Date(matchDate(red));
  if (sus.fechas <= 0) return false;
  // dias con partidos del equipo despues de la roja: los primeros `fechas` quedan afuera
  const rows = await prisma.match.findMany({
    where: { status: { notIn: ['CANCELLED'] }, OR: [{ teamAId: teamId }, { teamBId: teamId }], scheduledAt: { gt: new Date(matchDate(red)) } },
    select: { scheduledAt: true },
  });
  const days = [...new Set(rows.map((r) => dayKey(r.scheduledAt)))].filter((d) => d > redDay).sort();
  return days.slice(0, sus.fechas).includes(day);
}

// Jugadores suspendidos para este partido: [{ profileId, side, name, number, note }]
async function suspendedForMatch(matchId) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return [];
  const teamIds = [match.teamAId, match.teamBId].filter(Boolean);
  if (!teamIds.length) return [];
  const rows = await prisma.playerSuspension.findMany({
    where: { revokedAt: null, OR: [{ fechas: { gt: 0 } }, { sameDay: true }], sanction: { revokedAt: null, kind: 'RED', match: { OR: [{ teamAId: { in: teamIds } }, { teamBId: { in: teamIds } }] } } },
    include: { sanction: { include: { match: true } }, profile: { select: { id: true, name: true, nickname: true, showNickname: true, number: true } } },
  });
  const out = [];
  for (const r of rows) {
    if (!(await isBlocked(r, match))) continue;
    const teamId = r.sanction.side === 'A' ? r.sanction.match.teamAId : r.sanction.match.teamBId;
    out.push({ profileId: r.profileId, side: match.teamAId === teamId ? 'A' : 'B', name: publicName(r.profile), number: r.profile.number, note: r.note });
  }
  return out;
}

module.exports = { TEAM_SIZE, listSanctions, emitSanctions, publicName, suspendedForMatch };
