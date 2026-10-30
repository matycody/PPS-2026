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
const OPEN = ['SCHEDULED', 'READY', 'LIVE', 'SUSPENDED'];

const SUS_INCLUDE = {
  sanction: { include: { match: true } },
  profile: { select: { id: true, name: true, nickname: true, showNickname: true, number: true } },
};

// Partidos "del jugador" dentro del alcance de la suspension: de los equipos/ramas donde juega hoy
// (scope MODALITY: solo la modalidad de la roja; scope ALL: todas)
async function playerMatches(sus, { after } = {}) {
  const red = sus.sanction.match;
  const memberships = await prisma.playerTeam.findMany({ where: { profileId: sus.profileId, to: null }, select: { teamId: true, branch: true } });
  if (!memberships.length) return [];
  const where = {
    status: { not: 'CANCELLED' },
    hiddenAt: null,
    scheduledAt: after ? { gt: after } : { not: null },
    OR: memberships.map((m) => ({ branch: m.branch, OR: [{ teamAId: m.teamId }, { teamBId: m.teamId }] })),
  };
  if (sus.scope !== 'ALL') where.modality = red.modality;
  return prisma.match.findMany({ where, select: { id: true, status: true, scheduledAt: true, teamAId: true, teamBId: true, modality: true, branch: true } });
}

// Estado vigente: fechas que le faltan cumplir y si le queda algo de la jornada de la roja
async function suspensionState(sus) {
  const red = sus.sanction.match;
  const redAt = red.scheduledAt || red.finishedAt || red.createdAt;
  const redDay = dayKey(redAt);
  const rows = await playerMatches(sus);
  const sameDayLeft = sus.sameDay && rows.some((m) => m.id !== red.id && dayKey(m.scheduledAt) === redDay && OPEN.includes(m.status));
  // dias posteriores a la roja con partidos: los primeros `fechas` son los que se pierde
  const days = [...new Set(rows.filter((m) => dayKey(m.scheduledAt) > redDay).map((m) => dayKey(m.scheduledAt)))].sort();
  const lost = days.slice(0, sus.fechas);
  const served = lost.filter((d) => rows.filter((m) => dayKey(m.scheduledAt) === d).every((m) => !OPEN.includes(m.status))).length;
  const remaining = Math.max(0, sus.fechas - served);
  return { remaining, sameDayLeft, active: remaining > 0 || sameDayLeft, lostDays: lost, redDay };
}

// ¿Queda el jugador afuera de `match`? (no mira equipo: mira si el partido entra en el alcance de la suspension)
async function isBlocked(sus, match, memberships) {
  const red = sus.sanction.match;
  if (match.id === red.id || !match.scheduledAt) return false;
  const inTeam = memberships.some((m) => m.branch === match.branch && (m.teamId === match.teamAId || m.teamId === match.teamBId));
  if (!inTeam) return false;
  if (sus.scope !== 'ALL' && match.modality !== red.modality) return false;
  const st = await suspensionState(sus);
  const day = dayKey(match.scheduledAt);
  if (day === st.redDay) return sus.sameDay && OPEN.includes(match.status);
  return st.lostDays.includes(day);
}

const baseWhere = { revokedAt: null, OR: [{ fechas: { gt: 0 } }, { sameDay: true }], sanction: { revokedAt: null, kind: 'RED' } };

// Jugadores suspendidos para este partido: [{ profileId, side, name, number, note, scope }]
async function suspendedForMatch(matchId) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return [];
  const teamIds = [match.teamAId, match.teamBId].filter(Boolean);
  if (!teamIds.length) return [];
  const roster = await prisma.playerTeam.findMany({ where: { teamId: { in: teamIds }, branch: match.branch, to: null }, select: { profileId: true, teamId: true } });
  if (!roster.length) return [];
  const rows = await prisma.playerSuspension.findMany({ where: { ...baseWhere, profileId: { in: roster.map((r) => r.profileId) } }, include: SUS_INCLUDE });
  const out = [];
  for (const r of rows) {
    const memberships = await prisma.playerTeam.findMany({ where: { profileId: r.profileId, to: null }, select: { teamId: true, branch: true } });
    if (!(await isBlocked(r, match, memberships))) continue;
    const teamId = roster.find((x) => x.profileId === r.profileId)?.teamId;
    out.push({ profileId: r.profileId, side: match.teamAId === teamId ? 'A' : 'B', name: publicName(r.profile), number: r.profile.number, note: r.note, scope: r.scope });
  }
  return out;
}

// Suspensiones vigentes de estos jugadores: Map(profileId -> { remaining, sameDayLeft, scope, modality, note })
async function activeSuspensions(profileIds) {
  const out = new Map();
  if (!profileIds.length) return out;
  const rows = await prisma.playerSuspension.findMany({ where: { ...baseWhere, profileId: { in: profileIds } }, include: SUS_INCLUDE });
  for (const r of rows) {
    const st = await suspensionState(r);
    if (!st.active) continue;
    out.set(r.profileId, { remaining: st.remaining, sameDayLeft: st.sameDayLeft, scope: r.scope, modality: r.sanction.match.modality, note: r.note, sanctionId: r.sanctionId });
  }
  return out;
}

module.exports = { TEAM_SIZE, listSanctions, emitSanctions, publicName, suspendedForMatch, activeSuspensions, suspensionState, SUS_INCLUDE, baseWhere };
