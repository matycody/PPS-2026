const prisma = require('../db');
const { decide, syncAdvance } = require('../services/bracket');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RE = new RegExp('^/(' + UUID + ')/(finish|sets|cancel|unready)(?:/|$)', 'i');
const STARTED = ['LIVE', 'FINISHED'];

// Eliminación directa: sin empates, y el ganador avanza solo a la ronda siguiente.
// Se monta antes del router de /matches.
module.exports = function bracketAdvance(req, res, next) {
  if (req.method === 'GET' || !req.headers.authorization) return next();
  const found = RE.exec(req.path);
  if (!found) return next();
  const id = found[1];
  const action = found[2].toLowerCase();

  prisma.match
    .findUnique({
      where: { id },
      select: {
        status: true,
        teamAId: true,
        teamBId: true,
        nextMatchId: true,
        loserMatchId: true,
        stage: { select: { type: true } },
        sets: { select: { winnerTeamId: true } },
      },
    })
    .then(async (m) => {
      if (!m || !m.stage || m.stage.type !== 'KNOCKOUT') return next();

      if (action === 'sets' && req.body && req.body.draw) {
        return res.status(409).json({ error: 'En eliminación directa no hay empate: el set de desempate define al ganador' });
      }
      if (action === 'finish') {
        if (!decide(m)) {
          return res.status(409).json({
            error: 'En eliminación directa no puede terminar empatado ni sin sets: cargá el set de desempate antes de finalizar',
          });
        }
      }
      if (action === 'sets' && m.status === 'FINISHED') {
        const downstream = await prisma.match.findMany({
          where: { id: { in: [m.nextMatchId, m.loserMatchId].filter(Boolean) } },
          select: { status: true },
        });
        if (downstream.some((d) => STARTED.includes(d.status))) {
          return res.status(409).json({ error: 'El partido siguiente ya empezó: no se puede modificar este resultado' });
        }
      }

      const original = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 400) return original(body);
        syncAdvance(req.app.get('io'), id)
          .catch((err) => console.error('[bracket] advance', err))
          .then(() => original(body));
        return res;
      };
      next();
    })
    .catch((err) => {
      console.error('[bracketAdvance]', err);
      next();
    });
};