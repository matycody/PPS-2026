const prisma = require('../db');
const { outcome } = require('./prode');

// Probabilidades del prode a partir de los resultados ya cargados (Foam y Cloth, y cada rama, por separado).
// 1) Fuerza de cada equipo: se ajusta con todos los partidos terminados según la proporción de puntos de cada uno
//    (un 20-0 pesa más que un 9-8). 2) La diferencia de fuerza se pasa a probabilidad de ganar con un factor prudente
//    (C), porque cada equipo juega pocos partidos. 3) El empate sale de un modelo de Davidson con la tasa de cada modalidad.
// 4) Los puntos de un acierto valen 10 / probabilidad, entre 10 y 60: acertar al favorito da poco, un batacazo da mucho.
const C = 2;
const NU = { FOAM: 0.286, CLOTH: 0.5 }; // qué tan frecuentes son los empates en cada modalidad
const P_MIN = 0.08;
const P_MAX = 0.8;
const PTS_MIN = 10;
const PTS_MAX = 60;
const TTL_MS = 2 * 60 * 1000;
const cache = new Map(); // "modalidad|rama" -> { at, s }

const sig = (x) => 1 / (1 + Math.exp(-x));

function fit(rows) {
  const teams = [...new Set(rows.flatMap((r) => [r.a, r.b]))];
  const s = Object.fromEntries(teams.map((t) => [t, 0]));
  for (let it = 0; it < 3000; it++) {
    const g = Object.fromEntries(teams.map((t) => [t, 0]));
    for (const r of rows) {
      const E = sig(s[r.a] - s[r.b]);
      const d = (E - r.share) * E * (1 - E);
      g[r.a] += d;
      g[r.b] -= d;
    }
    for (const t of teams) s[t] -= 2 * (g[t] + 0.02 * s[t]);
  }
  return s;
}

async function strengthsFor(modality, branch) {
  const key = modality + '|' + branch;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.s;
  const finished = await prisma.match.findMany({
    where: { modality, branch, status: 'FINISHED', hiddenAt: null, teamAId: { not: null }, teamBId: { not: null } },
    select: { modality: true, teamAId: true, teamBId: true, sets: { select: { winnerTeamId: true } } },
  });
  const rows = [];
  for (const m of finished) {
    const o = outcome(m);
    if (!o || o.a + o.b === 0) continue;
    rows.push({ a: m.teamAId, b: m.teamBId, share: o.a / (o.a + o.b) });
  }
  const s = fit(rows);
  cache.set(key, { at: Date.now(), s });
  return s;
}

// { A: { p, pts }, DRAW: { p, pts }, B: { p, pts }, drawAllowed } — p en porcentaje entero
function oddsFor(match, s) {
  const drawAllowed = !(match.stage?.type === 'KNOCKOUT' || match.stage?.isPromotion || match.round != null); // llaves, playoffs y ascenso/descenso: alguien tiene que ganar
  const E = sig(C * ((s[match.teamAId] ?? 0) - (s[match.teamBId] ?? 0)));
  const d = drawAllowed ? (NU[match.modality] ?? NU.FOAM) * Math.sqrt(E * (1 - E)) : 0;
  const t = 1 + d;
  const clamp = (x) => Math.min(P_MAX, Math.max(P_MIN, x));
  let p = [clamp(E / t), d / t, clamp((1 - E) / t)];
  const sum = p[0] + p[1] + p[2];
  p = p.map((x) => x / sum);
  const pts = (x) => (x > 0 ? Math.min(PTS_MAX, Math.max(PTS_MIN, Math.round(10 / x))) : PTS_MAX);
  const out = {};
  // cuota decimal al estilo apuestas (1 / probabilidad); pts = puntos base de un acierto, sin el bonus por anticipación
  ['A', 'DRAW', 'B'].forEach((k, i) => { out[k] = { p: Math.round(p[i] * 100), cuota: p[i] > 0 ? Math.round(100 / p[i]) / 100 : null, pts: pts(p[i]) }; });
  out.drawAllowed = drawAllowed;
  return out;
}

async function oddsForMatches(matches) {
  const groups = new Map();
  for (const m of matches) groups.set(m.modality + '|' + m.branch, [m.modality, m.branch]);
  const strengths = new Map();
  await Promise.all([...groups].map(async ([k, [mod, br]]) => strengths.set(k, await strengthsFor(mod, br))));
  return new Map(matches.map((m) => [m.id, oddsFor(m, strengths.get(m.modality + '|' + m.branch) ?? {})]));
}

// Al terminar un partido cambian las fuerzas: se descarta lo guardado para que las cuotas se recalculen enseguida
function invalidateOdds() {
  cache.clear();
}

module.exports = { oddsFor, oddsForMatches, strengthsFor, invalidateOdds };
