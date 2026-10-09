const prisma = require('../db');
const { notifyMatch } = require('./notify');

// Resultado por sets: gana quien ganó más sets. null = sin sets decididos.
function matchResult(match) {
  let setsA = 0;
  let setsB = 0;
  for (const s of match.sets || []) {
    if (s.winnerTeamId && s.winnerTeamId === match.teamAId) setsA++;
    else if (s.winnerTeamId && s.winnerTeamId === match.teamBId) setsB++;
  }
  return setsA + setsB === 0 ? null : { setsA, setsB };
}

// { winnerTeamId, loserTeamId } o null si no hay ganador (sin sets o empatado)
function decide(match) {
  const r = matchResult(match);
  if (!r || r.setsA === r.setsB) return null;
  return r.setsA > r.setsB
    ? { winnerTeamId: match.teamAId, loserTeamId: match.teamBId }
    : { winnerTeamId: match.teamBId, loserTeamId: match.teamAId };
}

function shuffleWith(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// entrants: [{ teamId, entryRound }] en orden de siembra (el primero es el mejor).
// pairing: 'fold' (1 vs último, 2 vs anteúltimo…) o 'adjacent' (1 vs 2, 3 vs 4…)
// En cada ronda se enfrentan primero los que entran en esa ronda y luego los ganadores de la anterior.
function buildSpecs(entrants, { pairing = 'fold', thirdPlace = false } = {}) {
  if (entrants.length < 2) return { error: 'Hacen falta al menos 2 equipos' };
  const byRound = new Map();
  let maxEntry = 1;
  for (const e of entrants) {
    if (!Number.isInteger(e.entryRound) || e.entryRound < 1 || e.entryRound > 30) {
      return { error: 'entryRound inválido (entero de 1 a 30)' };
    }
    if (!byRound.has(e.entryRound)) byRound.set(e.entryRound, []);
    byRound.get(e.entryRound).push(e.teamId);
    maxEntry = Math.max(maxEntry, e.entryRound);
  }
  const specs = [];
  let prev = [];
  for (let r = 1; r <= 40; r++) {
    const src = [...(byRound.get(r) || []).map((teamId) => ({ teamId })), ...prev.map((winnerOf) => ({ winnerOf }))];
    if (src.length === 0) return { error: 'Ninguna entrada ni ganador llega a la ronda ' + r + ': hay un hueco en entryRounds' };
    if (src.length % 2) {
      return { error: 'La ronda ' + r + ' tendría ' + src.length + ' participantes (impar): revisá las rondas de entrada' };
    }
    const pairs = [];
    if (pairing === 'adjacent') for (let i = 0; i < src.length; i += 2) pairs.push([src[i], src[i + 1]]);
    else for (let i = 0; i < src.length / 2; i++) pairs.push([src[i], src[src.length - 1 - i]]);
    prev = pairs.map(([a, b], k) => {
      const ref = 'R' + r + 'M' + (k + 1);
      specs.push({ ref, round: r, slot: k + 1, a, b });
      return ref;
    });
    if (r >= maxEntry && pairs.length === 1) break;
  }
  const final = specs[specs.length - 1];
  if (!final || specs.filter((s) => s.round === final.round).length !== 1) {
    return { error: 'No se pudo cerrar la llave en una final' };
  }
  if (thirdPlace) {
    const semis = specs.filter((s) => s.round === final.round - 1);
    if (final.round < 2 || semis.length !== 2) {
      return { error: 'El tercer puesto necesita dos semifinales' };
    }
    specs.push({
      ref: 'THIRD',
      round: final.round,
      slot: 2,
      a: { loserOf: semis[0].ref },
      b: { loserOf: semis[1].ref },
    });
  }
  return { specs };
}

// Llave estándar: los mejores sembrados pasan directo a la ronda 2 si no es potencia de 2
function standardEntrants(teamIds) {
  const n = teamIds.length;
  let size = 1;
  while (size < n) size *= 2;
  const byes = size - n;
  return teamIds.map((teamId, i) => ({ teamId, entryRound: i < byes ? 2 : 1 }));
}

const KEYS = ['teamId', 'winnerOf', 'loserOf'];

// Valida una lista de partidos de llave (manual). Devuelve { error } o { specs } normalizados.
function validateSpecs(list, enrolled) {
  if (!Array.isArray(list) || !list.length) return { error: 'matches debe ser una lista con al menos un partido' };
  if (list.length > 5000) return { error: 'Demasiados partidos (máximo 5000)' };
  const refs = new Map();
  const positions = new Set();
  for (const m of list) {
    if (!m || typeof m !== 'object') return { error: 'Partido inválido' };
    if (typeof m.ref !== 'string' || !m.ref.trim()) return { error: 'Cada partido necesita un ref (texto único)' };
    if (refs.has(m.ref)) return { error: 'ref repetido: ' + m.ref };
    if (!Number.isInteger(m.round) || m.round < 1 || !Number.isInteger(m.slot) || m.slot < 1) {
      return { error: 'round y slot deben ser enteros desde 1 (' + m.ref + ')' };
    }
    const pos = m.round + ':' + m.slot;
    if (positions.has(pos)) return { error: 'Dos partidos con la misma ronda y posición: ' + pos };
    positions.add(pos);
    refs.set(m.ref, m);
  }
  const usedWinner = new Set();
  const usedLoser = new Set();
  const usedTeams = new Set();
  const specs = [];
  for (const m of list) {
    const spec = { ref: m.ref, round: m.round, slot: m.slot, a: null, b: null };
    for (const side of ['a', 'b']) {
      const src = m[side];
      if (src === undefined || src === null) continue;
      const keys = KEYS.filter((k) => src[k] !== undefined && src[k] !== null);
      if (keys.length !== 1) return { error: 'Cada lado debe tener exactamente uno de teamId, winnerOf, loserOf (' + m.ref + ')' };
      const key = keys[0];
      const val = src[key];
      if (typeof val !== 'string') return { error: key + ' debe ser texto (' + m.ref + ')' };
      if (key === 'teamId') {
        if (enrolled && !enrolled.has(val)) return { error: 'Equipo no inscripto en el torneo: ' + val };
        if (usedTeams.has(val)) return { error: 'Un equipo aparece dos veces como entrada: ' + val };
        usedTeams.add(val);
      } else {
        const from = refs.get(val);
        if (!from) return { error: key + ' apunta a un ref inexistente: ' + val };
        if (from.round >= m.round) return { error: 'El origen ' + val + ' debe estar en una ronda anterior a ' + m.ref };
        const used = key === 'winnerOf' ? usedWinner : usedLoser;
        if (used.has(val)) return { error: val + ' ya alimenta a otro partido como ' + key };
        used.add(val);
      }
      spec[side] = { [key]: val };
    }
    if (spec.a && spec.b && KEYS.some((k) => spec.a[k] && spec.a[k] === spec.b[k])) {
      return { error: 'Ambos lados de ' + m.ref + ' son iguales' };
    }
    if (m.scheduledAt !== undefined && m.scheduledAt !== null && m.scheduledAt !== '') {
      const d = new Date(m.scheduledAt);
      if (Number.isNaN(d.getTime())) return { error: 'scheduledAt inválida en ' + m.ref };
      spec.scheduledAt = d;
    }
    if (m.court !== undefined && m.court !== null && m.court !== '') {
      const c = Number(m.court);
      if (!Number.isInteger(c) || c < 1 || c > 99) return { error: 'court inválida en ' + m.ref };
      spec.court = c;
    }
    specs.push(spec);
  }
  return { specs };
}

// Pasa ganador (y perdedor) de un partido a los partidos que alimenta.
async function setSlot(io, matchId, side, teamId) {
  if (!matchId || !side) return;
  const next = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, status: true, teamAId: true, teamBId: true },
  });
  if (!next) return;
  const field = side === 'A' ? 'teamAId' : 'teamBId';
  if (next[field] === teamId) return;
  if (next.status === 'LIVE' || next.status === 'FINISHED') {
    console.warn('[bracket] partido siguiente ya empezó, no se actualiza:', matchId);
    return;
  }
  const data = { [field]: teamId };
  if (next.status === 'READY') Object.assign(data, { status: 'SCHEDULED', readyAt: null, readyBy: null });
  await prisma.match.update({ where: { id: matchId }, data });
  try {
    await notifyMatch(io, matchId);
  } catch (err) {
    console.error('[bracket] notify', err);
  }
}

async function syncAdvance(io, matchId) {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      teamAId: true,
      teamBId: true,
      nextMatchId: true,
      nextSide: true,
      loserMatchId: true,
      loserSide: true,
      sets: { select: { winnerTeamId: true } },
    },
  });
  if (!m || (!m.nextMatchId && !m.loserMatchId)) return;
  const res = m.status === 'FINISHED' ? decide(m) : null;
  await setSlot(io, m.nextMatchId, m.nextSide, res ? res.winnerTeamId : null);
  await setSlot(io, m.loserMatchId, m.loserSide, res ? res.loserTeamId : null);
}

module.exports = { matchResult, decide, shuffleWith, buildSpecs, standardEntrants, validateSpecs, syncAdvance };