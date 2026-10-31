// Cruza lo que leyó la herramienta con los planteles reales. Solo propone: la mesa decide.
const prisma = require('../db');
const { suspendedForMatch } = require('./sanctions');

const digits = (s) => String(s ?? '').replace(/\D/g, '');
const dotted = (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const tokens = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);

function nameScore(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((t) => { if (B.has(t)) hit++; });
  return hit / Math.max(A.size, B.size);
}

// Plantel de ambos equipos para la rama del partido
async function loadRoster(match) {
  const teamIds = [match.teamAId, match.teamBId].filter(Boolean);
  if (!teamIds.length) return [];
  const rows = await prisma.playerTeam.findMany({
    where: { teamId: { in: teamIds }, branch: match.branch, to: null },
    include: { profile: { select: { id: true, name: true, nickname: true, number: true, dni: true } } },
  });
  const sus = new Set((await suspendedForMatch(match.id).catch(() => [])).map((s) => s.profileId));
  return rows.map((r) => ({
    profileId: r.profile.id,
    name: r.profile.name,
    number: r.profile.number,
    dni: r.profile.dni,
    teamId: r.teamId,
    side: r.teamId === match.teamAId ? 'A' : 'B',
    coach: !!r.isCoach,
    suspended: sus.has(r.profile.id),
  }));
}

// Lo que se manda al navegador (sin DNI de nadie)
const publicRoster = (roster) => roster.map(({ dni, ...r }) => r);

async function buildProposal(match, extracted, roster) {
  const out = { sides: [], signedAny: false };
  const used = new Set();
  const unknownDigits = new Set();
  const sides = [['A', extracted?.teamA], ['B', extracted?.teamB]];

  for (const [side, team] of sides) {
    const mine = roster.filter((r) => r.side === side);
    const byDni = new Map(mine.filter((r) => digits(r.dni)).map((r) => [digits(r.dni), r]));
    const rows = (team?.players ?? []).map((p, idx) => {
      const d = digits(p.dni);
      const row = { idx, number: p.number || '', name: p.name || '', dni: d, signed: !!p.signed, status: 'UNKNOWN', profileId: null, matchedName: null, suspended: false };
      if (row.signed) out.signedAny = true;
      let hit = d && byDni.get(d);
      let status = 'OK';
      if (!hit) {
        // sin DNI claro: se busca por nombre dentro del mismo plantel
        const best = mine.filter((r) => !used.has(r.profileId)).map((r) => ({ r, s: nameScore(p.name, r.name) })).sort((x, y) => y.s - x.s)[0];
        if (best && best.s >= 0.75) { hit = best.r; status = 'NAME_ONLY'; }
      }
      if (hit) {
        if (used.has(hit.profileId)) status = 'DUPLICATE';
        else used.add(hit.profileId);
        Object.assign(row, { status, profileId: hit.profileId, matchedName: hit.name, suspended: hit.suspended });
      } else if (d) {
        unknownDigits.add(d);
      }
      return row;
    });
    out.sides.push({ side, teamId: side === 'A' ? match.teamAId : match.teamBId, readName: team?.name || '', rows });
  }

  // DNI que existen en el sistema pero no en el plantel de este equipo
  if (unknownDigits.size) {
    const variants = [...unknownDigits].flatMap((d) => [d, dotted(d)]);
    const found = await prisma.profile.findMany({ where: { dni: { in: variants } }, select: { id: true, name: true, dni: true } });
    const byD = new Map(found.map((f) => [digits(f.dni), f]));
    out.sides.forEach((s) => s.rows.forEach((r) => {
      if (r.status === 'UNKNOWN' && r.dni && byD.has(r.dni)) Object.assign(r, { status: 'OTHER_TEAM', matchedName: byD.get(r.dni).name });
    }));
  }

  // Jugadores del plantel que no aparecen en la planilla
  out.missing = roster.filter((r) => !used.has(r.profileId)).map(({ dni, ...r }) => r);
  return out;
}

module.exports = { loadRoster, publicRoster, buildProposal };
