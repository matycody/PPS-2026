const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { FEED_ROOM, notifyMatch } = require('../services/notify');
const { removeMatch } = require('../timers/matchManager');

// Avisa a quienes tienen la app abierta que un torneo se pausó o reanudó (para que recarguen sus listas)
function emitTournamentUpdate(req, tournamentId, pausedAt) {
  try {
    const io = req.app.get('io');
    if (io) io.to(FEED_ROOM).emit('tournament:updated', { tournamentId, pausedAt: pausedAt ?? null });
  } catch (err) {
    console.error('[tournament:updated]', err);
  }
}

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const BRANCHES = ['MIXED', 'MALE', 'FEMALE'];
const MODALITIES = ['FOAM', 'CLOTH'];
const FORMATS = ['LEAGUE', 'LEAGUE_CUP', 'CUP'];
// Borra partidos y todo lo que cuelga de ellos (solo con el torneo pausado)
async function wipeMatches(tx, where) {
  const w = { match: where };
  await tx.clockAction.deleteMany({ where: w });
  await tx.matchSet.deleteMany({ where: w });
  await tx.matchAssignment.deleteMany({ where: w });
  await tx.match.deleteMany({ where });
}

const STATUSES = ['DRAFT', 'ACTIVE', 'FINISHED'];
const CRITERIA = ['HEAD_TO_HEAD', 'SET_DIFFERENCE', 'SETS_WON', 'WINS', 'DRAW_LOT'];
// Valores por defecto: el organizador los puede cambiar, agregar y reordenar por torneo
const DEFAULT_TIEBREAKERS = ['HEAD_TO_HEAD', 'SET_DIFFERENCE', 'SETS_WON', 'DRAW_LOT'];

const TEAM_SELECT = { id: true, name: true, logo: true };

function parseDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined = inválida
}

function parseYear(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2200 ? n : null; // null = inválido
}

function parsePoints(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null; // null = inválido
}

function parseEdition(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  return s && s.length <= 30 ? s : undefined; // undefined = inválida
}

// Lista ordenada de criterios sin repetir; null = inválida
function parseTiebreakers(raw) {
  if (!Array.isArray(raw)) return null;
  const list = [...new Set(raw)];
  return list.every((c) => CRITERIA.includes(c)) ? list : null;
}

function handleDbError(err, res) {
  console.error('[tournaments]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// Equipos inscriptos que ya no están habilitados para esa rama y modalidad
function ineligibleEnrolled(tournamentId, branch, modality) {
  return prisma.tournamentTeam.findMany({
    where: {
      tournamentId,
      team: { OR: [{ branches: { none: { branch } } }, { modalities: { none: { modality } } }] },
    },
    include: { team: { select: { name: true } } },
  });
}

router.post('/', ...admin, async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name ?? '').trim();
    const startsAt = parseDate(b.startsAt);
    const endsAt = parseDate(b.endsAt);
    const year = parseYear(b.year);
    const edition = parseEdition(b.edition);
    const format = b.format === undefined ? 'LEAGUE' : b.format;
    const tiebreakers = b.tiebreakers === undefined ? DEFAULT_TIEBREAKERS : parseTiebreakers(b.tiebreakers);
    const points = {};
    for (const [key, def] of [['pointsWin', 3], ['pointsDraw', 1], ['pointsLoss', 0]]) {
      points[key] = b[key] === undefined ? def : parsePoints(b[key]);
    }

    const errors = [];
    if (!name) errors.push('Nombre obligatorio');
    if (!BRANCHES.includes(b.branch)) errors.push('Rama inválida (MIXED, MALE, FEMALE)');
    if (!MODALITIES.includes(b.modality)) errors.push('Modalidad inválida (FOAM, CLOTH)');
    if (year === null) errors.push('Año inválido');
    if (edition === undefined) errors.push('Edición inválida (máx. 30 caracteres)');
    if (!FORMATS.includes(format)) errors.push('Formato inválido (LEAGUE, LEAGUE_CUP, CUP)');
    if (startsAt === undefined || endsAt === undefined) errors.push('Fecha inválida');
    else if (startsAt && endsAt && startsAt > endsAt) {
      errors.push('La fecha de inicio es posterior a la de fin');
    }
    if (Object.values(points).some((p) => p === null)) errors.push('Puntos inválidos (enteros de 0 a 100)');
    if (!tiebreakers) errors.push('Criterios de desempate inválidos (' + CRITERIA.join(', ') + ')');
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });

    const t = await prisma.tournament.create({
      data: {
        name,
        branch: b.branch,
        modality: b.modality,
        year,
        edition,
        format,
        startsAt,
        endsAt,
        ...points,
        tiebreakers: { create: tiebreakers.map((criterion, i) => ({ order: i + 1, criterion })) },
      },
      include: { tiebreakers: { orderBy: { order: 'asc' } } },
    });
    res.status(201).json(t);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Equipos que pueden jugar un torneo de esa rama y modalidad (público)
// Debe ir antes de GET /:id
router.get('/eligible-teams', async (req, res) => {
  try {
    const { branch, modality } = req.query;
    if (!BRANCHES.includes(branch) || !MODALITIES.includes(modality)) {
      return res.status(400).json({ error: 'branch (MIXED, MALE, FEMALE) y modality (FOAM, CLOTH) obligatorios' });
    }
    res.json(
      await prisma.team.findMany({
        where: { branches: { some: { branch } }, modalities: { some: { modality } } },
        select: TEAM_SELECT,
        orderBy: { name: 'asc' },
      }),
    );
  } catch (err) {
    handleDbError(err, res);
  }
});

// Público. Filtros: year, yearFrom, yearTo, status, branch, modality, format, limit (50, máx. 200), offset
router.get('/', async (req, res) => {
  try {
    const q = req.query;
    const where = {};
    if (req.hidePaused) where.pausedAt = null; // los pausados solo los ve la organización
    where.deletedAt = req.onlyDeleted ? { not: null } : null; // los eliminados solo se listan en la papelera

    for (const [key, list] of [['status', STATUSES], ['branch', BRANCHES], ['modality', MODALITIES], ['format', FORMATS]]) {
      if (q[key] === undefined) continue;
      if (!list.includes(q[key])) return res.status(400).json({ error: `${key} inválido` });
      where[key] = q[key];
    }

    const years = {};
    if (q.year !== undefined) {
      const y = parseYear(q.year);
      if (y === null) return res.status(400).json({ error: 'year inválido' });
      years.equals = y;
    }
    if (q.yearFrom !== undefined) {
      const y = parseYear(q.yearFrom);
      if (y === null) return res.status(400).json({ error: 'yearFrom inválido' });
      years.gte = y;
    }
    if (q.yearTo !== undefined) {
      const y = parseYear(q.yearTo);
      if (y === null) return res.status(400).json({ error: 'yearTo inválido' });
      years.lte = y;
    }
    if (Object.keys(years).length) where.year = years;

    const take = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
    const skip = Math.max(parseInt(q.offset, 10) || 0, 0);

    res.json(
      await prisma.tournament.findMany({
        where,
        orderBy: [{ year: 'desc' }, { startsAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
        take,
        skip,
        include: {
          champion: { select: { id: true, name: true } },
          _count: { select: { teams: true } },
        },
      }),
    );
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        champion: { select: { id: true, name: true } },
        tiebreakers: { orderBy: { order: 'asc' } },
        teams: { include: { team: { select: TEAM_SELECT } }, orderBy: { team: { name: 'asc' } } },
        stages: {
          orderBy: [{ phase: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
          include: { teams: { include: { team: { select: TEAM_SELECT } } } },
        },
      },
    });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(t);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Pausar: el torneo y todos sus partidos (programados, habilitados, en vivo o finalizados) desaparecen para
// todos menos la organización. No se borra ni se cambia nada: reanudar lo deja exactamente como estaba.
router.post('/:id/pause', ...admin, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id }, select: { id: true, pausedAt: true } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.pausedAt) return res.status(409).json({ error: 'El torneo ya está pausado' });
    const now = new Date();
    const [updated, hidden] = await prisma.$transaction([
      prisma.tournament.update({ where: { id: t.id }, data: { pausedAt: now } }),
      prisma.match.updateMany({
        where: { tournamentId: t.id, hiddenAt: null },
        data: { hiddenAt: now, hiddenByPause: true },
      }),
    ]);
    emitTournamentUpdate(req, t.id, updated.pausedAt);
    res.json({ ...updated, hiddenMatches: hidden.count });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Reanudar: vuelve a mostrar el torneo y solo los partidos que ocultó la pausa (no los que se ocultaron a mano)
router.post('/:id/resume', ...admin, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id }, select: { id: true, pausedAt: true } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (!t.pausedAt) return res.status(409).json({ error: 'El torneo no está pausado' });
    const [updated, restored] = await prisma.$transaction([
      prisma.tournament.update({ where: { id: t.id }, data: { pausedAt: null } }),
      prisma.match.updateMany({
        where: { tournamentId: t.id, hiddenByPause: true },
        data: { hiddenAt: null, hiddenByPause: false },
      }),
    ]);
    emitTournamentUpdate(req, t.id, null);
    res.json({ ...updated, restoredMatches: restored.count });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.patch('/:id', ...admin, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status === 'FINISHED') {
      return res.status(409).json({ error: 'El torneo finalizó: no se puede editar' });
    }

    const b = req.body || {};
    const data = {};
    const errors = [];

    if (b.name !== undefined) {
      const n = String(b.name).trim();
      if (!n) errors.push('Nombre obligatorio');
      else data.name = n;
    }
    for (const key of ['startsAt', 'endsAt']) {
      if (b[key] === undefined) continue;
      const d = parseDate(b[key]);
      if (d === undefined) errors.push('Fecha inválida');
      else data[key] = d;
    }
    if (b.edition !== undefined) {
      const e = parseEdition(b.edition);
      if (e === undefined) errors.push('Edición inválida (máx. 30 caracteres)');
      else data.edition = e;
    }
    for (const key of ['pointsWin', 'pointsDraw', 'pointsLoss']) {
      if (b[key] === undefined) continue;
      const p = parsePoints(b[key]);
      if (p === null) errors.push('Puntos inválidos (enteros de 0 a 100)');
      else data[key] = p;
    }

    // El formato define la estructura: solo en borrador (lo demás se edita siempre, salvo torneo finalizado)
    const structural = ['format'].filter((k) => b[k] !== undefined);
    if (structural.length && t.status !== 'DRAFT' && !t.pausedAt) {
      return res.status(409).json({ error: 'El formato solo se edita en borrador o con el torneo pausado' });
    }
    if (b.branch !== undefined) {
      if (BRANCHES.includes(b.branch)) data.branch = b.branch;
      else errors.push('Rama inválida (MIXED, MALE, FEMALE)');
    }
    if (b.modality !== undefined) {
      if (MODALITIES.includes(b.modality)) data.modality = b.modality;
      else errors.push('Modalidad inválida (FOAM, CLOTH)');
    }
    if (b.year !== undefined) {
      const y = parseYear(b.year);
      if (y === null) errors.push('Año inválido');
      else data.year = y;
    }
    if (b.format !== undefined) {
      if (FORMATS.includes(b.format)) data.format = b.format;
      else errors.push('Formato inválido (LEAGUE, LEAGUE_CUP, CUP)');
    }

    let tiebreakers = null;
    if (b.tiebreakers !== undefined) {
      tiebreakers = parseTiebreakers(b.tiebreakers);
      if (!tiebreakers) errors.push('Criterios de desempate inválidos (' + CRITERIA.join(', ') + ')');
    }

    const s = 'startsAt' in data ? data.startsAt : t.startsAt;
    const e = 'endsAt' in data ? data.endsAt : t.endsAt;
    if (s && e && s > e) errors.push('La fecha de inicio es posterior a la de fin');
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });

    // Si cambia la rama o modalidad, los equipos inscriptos deben seguir habilitados
    const branch = data.branch ?? t.branch;
    const modality = data.modality ?? t.modality;
    if (branch !== t.branch || modality !== t.modality) {
      const invalid = await ineligibleEnrolled(t.id, branch, modality);
      if (invalid.length) {
        return res.status(409).json({
          error: 'Equipos inscriptos no habilitados para esa rama o modalidad: ' + invalid.map((i) => i.team.name).join(', '),
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (tiebreakers) {
        await tx.tiebreaker.deleteMany({ where: { tournamentId: t.id } });
        await tx.tiebreaker.createMany({
          data: tiebreakers.map((criterion, i) => ({ tournamentId: t.id, order: i + 1, criterion })),
        });
      }
      await tx.tournament.update({ where: { id: t.id }, data });
      if (data.branch || data.modality) {
        await tx.match.updateMany({
          where: { tournamentId: t.id },
          data: { ...(data.branch ? { branch: data.branch } : {}), ...(data.modality ? { modality: data.modality } : {}) },
        });
      }
    });

    res.json(
      await prisma.tournament.findUnique({
        where: { id: t.id },
        include: { tiebreakers: { orderBy: { order: 'asc' } } },
      }),
    );
  } catch (err) {
    handleDbError(err, res);
  }
});

// Define los equipos del torneo (reemplaza la lista). Solo en borrador.
// Cada equipo debe tener habilitadas la rama y la modalidad del torneo.
router.put('/:id/teams', ...admin, async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status === 'FINISHED' || (t.status !== 'DRAFT' && !t.pausedAt)) {
      return res.status(409).json({ error: 'Los equipos solo se editan en borrador o con el torneo pausado' });
    }

    const raw = req.body?.teamIds;
    if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
      return res.status(400).json({ error: 'teamIds debe ser una lista de ids' });
    }
    const teamIds = [...new Set(raw)];

    const teams = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true, branches: true, modalities: true },
    });
    if (teams.length !== teamIds.length) {
      return res.status(404).json({ error: 'Algún equipo no existe' });
    }
    const invalid = teams.filter(
      (tm) =>
        !tm.branches.some((x) => x.branch === t.branch) ||
        !tm.modalities.some((x) => x.modality === t.modality),
    );
    if (invalid.length) {
      return res.status(409).json({
        error: 'Equipos no habilitados para esta rama o modalidad: ' + invalid.map((i) => i.name).join(', '),
        teamIds: invalid.map((i) => i.id),
      });
    }

    if (t.pausedAt) {
      await prisma.$transaction(async (tx) => {
        await wipeMatches(tx, { tournamentId: t.id, OR: [{ teamAId: { notIn: teamIds } }, { teamBId: { notIn: teamIds } }] });
        await tx.stageStanding.deleteMany({ where: { stage: { tournamentId: t.id }, teamId: { notIn: teamIds } } });
      });
    }
    await prisma.$transaction([
      prisma.stageTeam.deleteMany({ where: { stage: { tournamentId: t.id }, teamId: { notIn: teamIds } } }),
      prisma.tournamentTeam.deleteMany({ where: { tournamentId: t.id, teamId: { notIn: teamIds } } }),
      prisma.tournamentTeam.createMany({
        data: teamIds.map((teamId) => ({ tournamentId: t.id, teamId })),
        skipDuplicates: true,
      }),
    ]);
    res.json({ tournamentId: t.id, teamIds });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Define la estructura del torneo (zonas o llaves) y los equipos de cada una.
// Reemplaza la estructura anterior. Solo en borrador y antes de generar partidos.
router.put('/:id/stages', ...admin, async (req, res) => {
  try {
    const STAGE_TYPES = ['LEAGUE', 'KNOCKOUT'];
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { teams: { select: { teamId: true } } },
    });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status === 'FINISHED' || (t.status !== 'DRAFT' && !t.pausedAt)) {
      return res.status(409).json({ error: 'La estructura solo se edita en borrador o con el torneo pausado' });
    }
    const hasMatches = (await prisma.match.count({ where: { tournamentId: t.id } })) > 0;
    if (hasMatches && !t.pausedAt) {
      return res.status(409).json({ error: 'El torneo ya tiene partidos: pausalo para rehacer la estructura' });
    }

    const raw = req.body?.stages;
    if (!Array.isArray(raw) || raw.length > 500) {
      return res.status(400).json({ error: 'stages debe ser una lista (máx. 500)' });
    }

    const enrolled = new Set(t.teams.map((x) => x.teamId));
    const names = new Set();
    const leagueTeamsByPhase = new Map(); // fase -> equipos ya ubicados en una zona de esa fase
    const stages = [];
    const errors = [];
    const posInt = (v) => Number.isInteger(v) && v >= 1;

    raw.forEach((s, i) => {
      const name = String(s?.name ?? '').trim();
      const label = name || `#${i + 1}`;
      if (!name || name.length > 40) errors.push(`${label}: nombre obligatorio (máx. 40 caracteres)`);
      else if (names.has(name.toLowerCase())) errors.push(`${label}: nombre repetido`);
      names.add(name.toLowerCase());

      if (!STAGE_TYPES.includes(s?.type)) errors.push(`${label}: tipo inválido (LEAGUE, KNOCKOUT)`);
     else if (t.format === 'CUP' && s.type !== 'KNOCKOUT') errors.push(`${label}: un torneo de copa solo tiene llaves`);

      if (!posInt(s?.phase)) errors.push(`${label}: fase inválida (entero desde 1)`);
      const tier = s?.tier ?? null;
      if (tier !== null && !posInt(tier)) errors.push(`${label}: nivel inválido (entero desde 1)`);
      const promotions = s?.promotions ?? 0;
      const relegations = s?.relegations ?? 0;
      const playoffUp = s?.playoffUp ?? 0;
      const playoffDown = s?.playoffDown ?? 0;
      if (!Number.isInteger(playoffUp) || playoffUp < 0 || !Number.isInteger(playoffDown) || playoffDown < 0) {
        errors.push(`${label}: los lugares de playoff de promoción deben ser enteros desde 0`);
      }
      if (!Number.isInteger(promotions) || promotions < 0 || !Number.isInteger(relegations) || relegations < 0) {
        errors.push(`${label}: ascensos y descensos deben ser enteros desde 0`);
      }

      const rawTeams = s?.teams ?? [];
      if (!Array.isArray(rawTeams)) {
        errors.push(`${label}: teams debe ser una lista`);
        return;
      }
      const seen = new Set();
      const teams = [];
      for (const x of rawTeams) {
        const item = typeof x === 'string' ? { teamId: x } : x;
        const teamId = item?.teamId;
        if (typeof teamId !== 'string' || !enrolled.has(teamId)) {
          errors.push(`${label}: hay un equipo que no está inscripto en el torneo`);
          continue;
        }
        if (seen.has(teamId)) {
          errors.push(`${label}: equipo repetido`);
          continue;
        }
        seen.add(teamId);
        const seed = item.seed ?? null;
        const entryRound = item.entryRound ?? null;
        if ((seed !== null && !posInt(seed)) || (entryRound !== null && !posInt(entryRound))) {
          errors.push(`${label}: seed y entryRound deben ser enteros desde 1`);
          continue;
        }
        teams.push({ teamId, seed, entryRound });
      }

      // Las zonas necesitan equipos desde el inicio; las llaves de playoffs se completan después
      if (s?.type === 'LEAGUE') {
        if (teams.length < 2) errors.push(`${label}: una zona necesita al menos 2 equipos`);
        if (promotions + relegations + playoffUp + playoffDown > teams.length) {
          errors.push(`${label}: ascensos + descensos + playoffs de promoción superan la cantidad de equipos`);
        }
        const used = leagueTeamsByPhase.get(s.phase) ?? new Set();
        if (teams.some((x) => used.has(x.teamId))) {
          errors.push(`${label}: un equipo no puede estar en dos zonas de la misma fase`);
        }
        teams.forEach((x) => used.add(x.teamId));
        leagueTeamsByPhase.set(s.phase, used);
      }

      stages.push({ name, type: s?.type, phase: s?.phase, tier, promotions, relegations, playoffUp, playoffDown, teams });
    });
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });

    // Cambios no estructurales (ascensos, descensos, nivel) sobre zonas/llaves ya existentes:
    // se actualizan en el lugar, sin tocar partidos, fechas, llaves ni posiciones.
    const existing = await prisma.stage.findMany({
      where: { tournamentId: t.id },
      include: { teams: { select: { teamId: true, seed: true, entryRound: true } } },
    });
    const key = (x) => `${x.name.toLowerCase()}|${x.type}|${x.phase}`;
    const teamsSig = (arr) =>
      arr.map((x) => `${x.teamId}:${x.seed ?? ''}:${x.entryRound ?? ''}`).sort().join(',');
    const byKey = new Map(existing.map((e) => [key(e), e]));
    const sameStructure =
      existing.length === stages.length &&
      stages.every((s) => {
        const e = byKey.get(key(s));
        return e && (s.type === 'KNOCKOUT' || teamsSig(e.teams) === teamsSig(s.teams)); // los equipos de las llaves los maneja el armado de la llave
      });

    if (sameStructure) {
      await prisma.$transaction(
        stages.map((s) =>
          prisma.stage.update({
            where: { id: byKey.get(key(s)).id },
            data: { tier: s.tier, promotions: s.promotions, relegations: s.relegations, playoffUp: s.playoffUp, playoffDown: s.playoffDown },
          }),
        ),
      );
    } else {
      if (hasMatches && req.body?.confirmWipe !== true) {
        return res.status(409).json({
          code: 'WIPE_REQUIRED',
          error:
            'Cambiar zonas, llaves o equipos borra el fixture y los playoffs ya armados. Confirmá para continuar.',
        });
      }
    await prisma.$transaction(
      async (tx) => {
        if (hasMatches) await wipeMatches(tx, { tournamentId: t.id }); // pausado: el fixture se rehace
        await tx.stageStanding.deleteMany({ where: { stage: { tournamentId: t.id } } });
        await tx.stageTeam.deleteMany({ where: { stage: { tournamentId: t.id } } });
        await tx.matchday.deleteMany({ where: { stage: { tournamentId: t.id } } });
        await tx.stage.deleteMany({ where: { tournamentId: t.id } });
        for (const s of stages) {
          await tx.stage.create({
            data: {
              tournamentId: t.id,
              name: s.name,
              type: s.type,
              phase: s.phase,
              tier: s.tier,
              promotions: s.promotions,
              relegations: s.relegations,
              playoffUp: s.playoffUp,
              playoffDown: s.playoffDown,
              teams: { create: s.teams },
            },
          });
        }
      },
      { timeout: 30000 },
    );
    }

    const saved = await prisma.stage.findMany({
      where: { tournamentId: t.id },
      orderBy: [{ phase: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
      include: { teams: { include: { team: { select: TEAM_SELECT } } } },
    });
    const placed = new Set(saved.flatMap((s) => s.teams.map((x) => x.teamId)));
    res.json({ stages: saved, unassigned: [...enrolled].filter((id) => !placed.has(id)) });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Solo si no tiene partidos ni finalizó (no se borra historial)
// Reiniciar torneo (solo para pruebas y demos): deja el fixture como recién creado.
// Conserva equipos, zonas, fechas y llaves; borra resultados, relojes, canchas y designaciones.
// Body: { clearSchedule: boolean } -> true también borra los horarios (si no, se restauran los originales de los reprogramados).
router.post('/:id/reset', ...admin, async (req, res) => {
  try {
    const id = req.params.id;
    const t = await prisma.tournament.findUnique({ where: { id }, select: { id: true, status: true, pausedAt: true } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    const clearSchedule = req.body && req.body.clearSchedule === true;

    const matches = await prisma.match.findMany({
      where: { tournamentId: id },
      select: { id: true, status: true, originalScheduledAt: true, nextMatchId: true, nextSide: true, loserMatchId: true, loserSide: true, teamAFrom: true, teamBFrom: true },
    });
    const ids = matches.map((m) => m.id);

    // Lugares de las llaves que se completan solos (ganador, perdedor o posición de zona): vuelven a quedar vacíos
    const fed = new Map(); // matchId -> { A: bool, B: bool }
    const mark = (matchId, side) => {
      if (!matchId || !side) return;
      if (!fed.has(matchId)) fed.set(matchId, { A: false, B: false });
      fed.get(matchId)[side] = true;
    };
    matches.forEach((m) => {
      mark(m.nextMatchId, m.nextSide);
      mark(m.loserMatchId, m.loserSide);
      if (m.teamAFrom) mark(m.id, 'A');
      if (m.teamBFrom) mark(m.id, 'B');
    });

    const ops = [
      prisma.clockAction.deleteMany({ where: { matchId: { in: ids } } }),
      prisma.matchClock.deleteMany({ where: { matchId: { in: ids } } }),
      prisma.matchSet.deleteMany({ where: { matchId: { in: ids } } }),
      prisma.matchAssignment.deleteMany({ where: { matchId: { in: ids } } }),
      prisma.stageStanding.deleteMany({ where: { stage: { tournamentId: id } } }),
      prisma.match.updateMany({
        where: { id: { in: ids } },
        data: { status: 'SCHEDULED', court: null, readyAt: null, readyBy: null, finishedAt: null, statusReason: null, originalScheduledAt: null, ...(clearSchedule ? { scheduledAt: null } : {}) },
      }),
    ];
    if (!clearSchedule) {
      matches.filter((m) => m.originalScheduledAt).forEach((m) => {
        ops.push(prisma.match.update({ where: { id: m.id }, data: { scheduledAt: m.originalScheduledAt } }));
      });
    }
    fed.forEach((sides, matchId) => {
      const data = {};
      if (sides.A) data.teamAId = null;
      if (sides.B) data.teamBId = null;
      ops.push(prisma.match.update({ where: { id: matchId }, data }));
    });
    ops.push(prisma.tournament.update({ where: { id }, data: { championId: null, ...(t.status === 'FINISHED' ? { status: 'ACTIVE' } : {}) } }));

    await prisma.$transaction(ops);

    // Relojes en memoria de los partidos que estaban en juego o habilitados
    matches.filter((m) => ['LIVE', 'READY'].includes(m.status)).forEach((m) => removeMatch(m.id));
    const io = req.app.get('io');
    for (const mid of ids) {
      try { await notifyMatch(io, mid); } catch (e) { console.error('[reset] notify', e.message); }
    }
    if (io) io.to(FEED_ROOM).emit('tournament:updated', { tournamentId: id, pausedAt: t.pausedAt ?? null });
    res.json({ ok: true, matches: ids.length, clearedSchedule: clearSchedule });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Eliminar = mandar a "Eliminados": desaparece para todos (también para la organización) y se puede restaurar.
// Sus partidos se ocultan igual que al pausar.
router.delete('/:id', ...admin, async (req, res) => {
  try {
    const id = req.params.id;
    const t = await prisma.tournament.findUnique({ where: { id }, select: { id: true, deletedAt: true, pausedAt: true } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.deletedAt) return res.status(409).json({ error: 'El torneo ya está eliminado' });
    const now = new Date();
    await prisma.$transaction([
      prisma.tournament.update({ where: { id }, data: { deletedAt: now } }),
      prisma.match.updateMany({ where: { tournamentId: id, hiddenAt: null }, data: { hiddenAt: now, hiddenByPause: true } }),
    ]);
    emitTournamentUpdate(req, id, t.pausedAt);
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Restaurar un torneo eliminado: vuelve a verse tal cual estaba (si estaba pausado, sigue pausado)
router.post('/:id/restore', ...admin, async (req, res) => {
  try {
    const id = req.params.id;
    const t = await prisma.tournament.findUnique({ where: { id }, select: { id: true, deletedAt: true, pausedAt: true } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (!t.deletedAt) return res.status(409).json({ error: 'El torneo no está eliminado' });
    const ops = [prisma.tournament.update({ where: { id }, data: { deletedAt: null } })];
    if (!t.pausedAt) {
      ops.push(prisma.match.updateMany({ where: { tournamentId: id, hiddenByPause: true }, data: { hiddenAt: null, hiddenByPause: false } }));
    }
    await prisma.$transaction(ops);
    emitTournamentUpdate(req, id, t.pausedAt);
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Borrado definitivo (solo desde "Eliminados"): borra también partidos y todo lo que cuelga de ellos
router.delete('/:id/purge', ...admin, async (req, res) => {
  try {
    const id = req.params.id;
    const t = await prisma.tournament.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (!t.deletedAt) return res.status(409).json({ error: 'Primero hay que eliminar el torneo para borrarlo definitivamente' });
    await prisma.$transaction([
      prisma.clockAction.deleteMany({ where: { match: { tournamentId: id } } }),
      prisma.matchSet.deleteMany({ where: { match: { tournamentId: id } } }),
      prisma.matchAssignment.deleteMany({ where: { match: { tournamentId: id } } }),
      prisma.match.deleteMany({ where: { tournamentId: id } }),
      prisma.stageStanding.deleteMany({ where: { stage: { tournamentId: id } } }),
      prisma.stageTeam.deleteMany({ where: { stage: { tournamentId: id } } }),
      prisma.matchday.deleteMany({ where: { stage: { tournamentId: id } } }),
      prisma.stage.deleteMany({ where: { tournamentId: id } }),
      prisma.tiebreaker.deleteMany({ where: { tournamentId: id } }),
      prisma.tournamentTeam.deleteMany({ where: { tournamentId: id } }),
      prisma.tournament.delete({ where: { id } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;