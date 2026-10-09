const crypto = require('crypto');
const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN = ['SCHEDULED', 'READY'];
const TEAM_SELECT = { id: true, name: true, logo: true };

function handleDbError(err, res) {
  console.error('[fixture]', err);
  return res.status(500).json({ error: 'Error interno' });
}

function parseDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined = inválida
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Todos contra todos (método del círculo). Con cantidad impar, uno descansa en cada fecha.
function roundRobin(ids) {
  const list = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== null && b !== null) games.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

function findStage(tournamentId, stageId) {
  return prisma.stage.findFirst({
    where: { id: stageId, tournamentId },
    include: { teams: { select: { teamId: true, seed: true } }, tournament: true },
  });
}

function findMatchday(tournamentId, matchdayId) {
  return prisma.matchday.findFirst({
    where: { id: matchdayId, stage: { tournamentId } },
    include: { stage: { include: { tournament: { select: { status: true } } } } },
  });
}

// Sorteo del fixture todos contra todos de una zona.
// Body: shuffle (default true), doubleRound (ida y vuelta), dates (lista, una por fecha)
// o startDate + intervalDays (default 7). Sin fechas, las jornadas quedan sin día.
router.post('/:id/stages/:stageId/fixture', ...admin, async (req, res) => {
  try {
    const stage = await findStage(req.params.id, req.params.stageId);
    if (!stage) return res.status(404).json({ error: 'Zona no encontrada' });
    const t = stage.tournament;
    if (t.status === 'FINISHED') return res.status(409).json({ error: 'El torneo finalizó' });
    if (stage.type !== 'LEAGUE') {
      return res.status(409).json({ error: 'El sorteo todos contra todos es solo para zonas de liga' });
    }
    if (stage.teams.length < 2) return res.status(409).json({ error: 'La zona necesita al menos 2 equipos' });
    if (await prisma.match.count({ where: { stageId: stage.id } })) {
      return res.status(409).json({ error: 'La zona ya tiene fixture: eliminalo antes de volver a sortear' });
    }

    const b = req.body || {};
    const doShuffle = b.shuffle !== false;
    const doubleRound = b.doubleRound === true;

    let dates = null;
    if (b.dates !== undefined) {
      if (!Array.isArray(b.dates)) return res.status(400).json({ error: 'dates debe ser una lista' });
      dates = b.dates.map(parseDate);
      if (dates.some((d) => d === undefined)) return res.status(400).json({ error: 'Fecha inválida en dates' });
    }
    const startDate = parseDate(b.startDate);
    if (startDate === undefined) return res.status(400).json({ error: 'startDate inválida' });
    const intervalDays = b.intervalDays === undefined ? 7 : Number(b.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 60) {
      return res.status(400).json({ error: 'intervalDays inválido (entero de 1 a 60)' });
    }
    const dateFor = (i) => {
      if (dates && i < dates.length) return dates[i];
      if (startDate) return new Date(startDate.getTime() + i * intervalDays * DAY_MS);
      return null;
    };

    const ids = stage.teams
      .slice()
      .sort((a, c) => (a.seed ?? Infinity) - (c.seed ?? Infinity) || a.teamId.localeCompare(c.teamId))
      .map((x) => x.teamId);
    const order = doShuffle ? shuffle(ids) : ids;

    let rounds = roundRobin(order);
    if (doShuffle) rounds = rounds.map((g) => shuffle(g));
    if (doubleRound) rounds = [...rounds, ...rounds.map((g) => g.map(([x, y]) => [y, x]))];

    const matchdays = [];
    const matches = [];
    const summary = [];
    rounds.forEach((games, i) => {
      const date = dateFor(i);
      const md = { id: crypto.randomUUID(), stageId: stage.id, number: i + 1, date };
      matchdays.push(md);
      const playing = new Set();
      games.forEach(([teamAId, teamBId], k) => {
        playing.add(teamAId);
        playing.add(teamBId);
        matches.push({
          id: crypto.randomUUID(),
          tournamentId: t.id,
          stageId: stage.id,
          matchdayId: md.id,
          slot: k + 1,
          court: null,
          branch: t.branch,
          modality: t.modality,
          scheduledAt: date,
          teamAId,
          teamBId,
        });
      });
      summary.push({
        id: md.id,
        number: md.number,
        date,
        matches: games.length,
        resting: order.filter((id) => !playing.has(id)),
      });
    });

    await prisma.$transaction(
      async (tx) => {
        await tx.matchday.deleteMany({ where: { stageId: stage.id } });
        for (const c of chunks(matchdays, 1000)) await tx.matchday.createMany({ data: c });
        for (const c of chunks(matches, 1000)) await tx.match.createMany({ data: c });
      },
      { timeout: 60000 },
    );

    res.status(201).json({ stageId: stage.id, totalMatches: matches.length, matchdays: summary });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Elimina el fixture de una zona. Solo si ningún partido fue habilitado, jugado ni tiene asignaciones.
router.delete('/:id/stages/:stageId/fixture', ...admin, async (req, res) => {
  try {
    const stage = await findStage(req.params.id, req.params.stageId);
    if (!stage) return res.status(404).json({ error: 'Zona no encontrada' });
    if (stage.tournament.status === 'FINISHED') return res.status(409).json({ error: 'El torneo finalizó' });

    const matches = await prisma.match.findMany({ where: { stageId: stage.id }, select: { id: true, status: true } });
    if (matches.some((m) => m.status !== 'SCHEDULED')) {
      return res.status(409).json({ error: 'Hay partidos habilitados, jugados o cancelados: no se puede eliminar el fixture' });
    }
    const matchIds = matches.map((m) => m.id);
    const [assignments, sets, actions] = await Promise.all([
      prisma.matchAssignment.count({ where: { matchId: { in: matchIds } } }),
      prisma.matchSet.count({ where: { matchId: { in: matchIds } } }),
      prisma.clockAction.count({ where: { matchId: { in: matchIds } } }),
    ]);
    if (assignments || sets || actions) {
      return res.status(409).json({ error: 'Hay partidos con asignaciones o registros: no se puede eliminar el fixture' });
    }

    await prisma.$transaction([
      prisma.match.deleteMany({ where: { stageId: stage.id } }),
      prisma.matchday.deleteMany({ where: { stageId: stage.id } }),
    ]);
    res.json({ ok: true, deletedMatches: matchIds.length });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Calendario del torneo (público): jornadas con sus partidos. Filtro opcional: stageId
router.get('/:id/matchdays', async (req, res) => {
  try {
    const where = { stage: { tournamentId: req.params.id } };
    if (req.query.stageId) where.stageId = String(req.query.stageId);
    res.json(
      await prisma.matchday.findMany({
        where,
        orderBy: [{ stage: { phase: 'asc' } }, { stage: { name: 'asc' } }, { number: 'asc' }],
        include: {
          stage: { select: { id: true, name: true } },
          matches: {
            where: { hiddenAt: null },
            orderBy: [{ slot: 'asc' }],
            select: {
              id: true,
              slot: true,
              court: true,
              status: true,
              scheduledAt: true,
              teamA: { select: TEAM_SELECT },
              teamB: { select: TEAM_SELECT },
            },
          },
        },
      }),
    );
  } catch (err) {
    handleDbError(err, res);
  }
});

// Cambia el día de una jornada. Mueve solo los partidos que seguían en el día original
// (o sin día); los que se reprogramaron a mano no se tocan, y los jugados tampoco.
router.patch('/:id/matchdays/:matchdayId', ...admin, async (req, res) => {
  try {
    const md = await findMatchday(req.params.id, req.params.matchdayId);
    if (!md) return res.status(404).json({ error: 'Jornada no encontrada' });
    if (md.stage.tournament.status === 'FINISHED') return res.status(409).json({ error: 'El torneo finalizó' });

    if (req.body?.date === undefined) return res.status(400).json({ error: 'date obligatoria (o null para quitarla)' });
    const date = parseDate(req.body.date);
    if (date === undefined) return res.status(400).json({ error: 'Fecha inválida' });

    const moved = await prisma.$transaction(async (tx) => {
      await tx.matchday.update({ where: { id: md.id }, data: { date } });
      const r = await tx.match.updateMany({
        where: { matchdayId: md.id, status: { in: OPEN }, scheduledAt: md.date ?? null },
        data: { scheduledAt: date },
      });
      return r.count;
    });
    res.json({ id: md.id, number: md.number, date, movedMatches: moved });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Define el orden de juego dentro de la jornada (matchIds en el orden deseado).
router.put('/:id/matchdays/:matchdayId/order', ...admin, async (req, res) => {
  try {
    const md = await findMatchday(req.params.id, req.params.matchdayId);
    if (!md) return res.status(404).json({ error: 'Jornada no encontrada' });
    if (md.stage.tournament.status === 'FINISHED') return res.status(409).json({ error: 'El torneo finalizó' });

    const raw = req.body?.matchIds;
    if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
      return res.status(400).json({ error: 'matchIds debe ser una lista de ids' });
    }
    const current = await prisma.match.findMany({ where: { matchdayId: md.id, hiddenAt: null }, select: { id: true } });
    const ids = [...new Set(raw)];
    const same = ids.length === current.length && current.every((m) => ids.includes(m.id));
    if (!same) {
      return res.status(400).json({ error: 'matchIds debe incluir exactamente los partidos visibles de la jornada' });
    }

    await prisma.$transaction(ids.map((id, i) => prisma.match.update({ where: { id }, data: { slot: i + 1 } })));
    res.json({ matchdayId: md.id, matchIds: ids });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Asigna canchas a una jornada según el orden de juego: el primer partido (el más temprano,
// y a igual hora el de menor orden) va a la cancha 1, y así hasta `courts` canchas simultáneas.
// Solo toca partidos Programados o Habilitados. overwrite=false respeta las canchas ya definidas.
router.post('/:id/matchdays/:matchdayId/assign-courts', ...admin, async (req, res) => {
  try {
    const md = await findMatchday(req.params.id, req.params.matchdayId);
    if (!md) return res.status(404).json({ error: 'Jornada no encontrada' });
    if (md.stage.tournament.status === 'FINISHED') return res.status(409).json({ error: 'El torneo finalizó' });

    const courts = Number(req.body?.courts);
    if (!Number.isInteger(courts) || courts < 1 || courts > 50) {
      return res.status(400).json({ error: 'courts inválido (entero de 1 a 50)' });
    }
    const overwrite = req.body?.overwrite !== false;

    const matches = await prisma.match.findMany({
      where: { matchdayId: md.id, hiddenAt: null, status: { in: OPEN } },
      select: { id: true, court: true, slot: true, scheduledAt: true },
    });
    matches.sort(
      (a, b) =>
        (a.scheduledAt ? a.scheduledAt.getTime() : Infinity) - (b.scheduledAt ? b.scheduledAt.getTime() : Infinity) ||
        (a.slot ?? Infinity) - (b.slot ?? Infinity) ||
        a.id.localeCompare(b.id),
    );

    const assigned = [];
    const updates = [];
    matches.forEach((m, i) => {
      const court = (i % courts) + 1;
      if (!overwrite && m.court !== null) return;
      assigned.push({ matchId: m.id, court });
      if (m.court !== court) updates.push(prisma.match.update({ where: { id: m.id }, data: { court } }));
    });
    if (updates.length) await prisma.$transaction(updates);

    res.json({ matchdayId: md.id, courts, assigned });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;