const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const admin = [authenticate, requireRole('ADMIN')];

const BRANCHES = ['MIXED', 'MALE', 'FEMALE'];
// Sexo -> ramas permitidas (igual que en equipos)
const ALLOWED = { M: ['MIXED', 'MALE'], F: ['MIXED', 'FEMALE'] };
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const NUMBER_MIN = 0;
const NUMBER_MAX = 999;

const normDni = (d) => String(d || '').replace(/\D/g, '');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function handleError(err, res) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Ya hay una solicitud pendiente o un dato repetido' });
  }
  console.error('[player-requests]', err);
  return res.status(500).json({ error: 'Error interno' });
}

const include = {
  teams: { include: { team: { select: { id: true, name: true, logo: true } } } },
};

function serialize(r) {
  return {
    id: r.id,
    status: r.status,
    name: r.name,
    dni: r.dni,
    sex: r.sex,
    number: r.number,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    teams: r.teams.map((t) => ({
      teamId: t.teamId,
      name: t.team ? t.team.name : null,
      logo: t.team ? t.team.logo : null,
      branch: t.branch,
    })),
  };
}

// ───────────── El jugador pide su alta ─────────────

// Body: { name, dni, sex: 'M'|'F', number?, teams: [{ teamId, branch }] }
router.post('/', authenticate, async (req, res) => {
  try {
    if (req.user.profileId) {
      return res.status(409).json({ error: 'Tu cuenta ya tiene un perfil de jugador o árbitro' });
    }

    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const dni = normDni(b.dni);
    const sex = b.sex;
    const errors = [];

    if (!name || name.length > 100) errors.push('Nombre obligatorio');
    if (dni.length < 6 || dni.length > 12) errors.push('DNI inválido');
    if (sex !== 'M' && sex !== 'F') errors.push('El sexo es obligatorio (M o F)');

    let number = null;
    if (b.number !== undefined && b.number !== null && b.number !== '') {
      number = Number(b.number);
      if (!Number.isInteger(number) || number < NUMBER_MIN || number > NUMBER_MAX) {
        errors.push('El número tiene que ser un entero de ' + NUMBER_MIN + ' a ' + NUMBER_MAX);
      }
    }

    const teamsIn = Array.isArray(b.teams) ? b.teams : [];
    if (!teamsIn.length) errors.push('Elegí al menos un equipo');
    const seen = new Set();
    for (const t of teamsIn) {
      if (!t || typeof t.teamId !== 'string' || !BRANCHES.includes(t.branch)) {
        errors.push('Equipo o rama inválidos');
        break;
      }
      if (seen.has(t.branch)) {
        errors.push('Solo un equipo por rama');
        break;
      }
      seen.add(t.branch);
      if (ALLOWED[sex] && !ALLOWED[sex].includes(t.branch)) {
        errors.push('Rama no permitida para tu sexo');
        break;
      }
    }
    if (errors.length) return res.status(400).json({ errors });

    const teams = await prisma.team.findMany({
      where: { id: { in: teamsIn.map((t) => t.teamId) } },
      include: { branches: true },
    });
    for (const t of teamsIn) {
      const team = teams.find((x) => x.id === t.teamId);
      if (!team) return res.status(400).json({ errors: ['Equipo no encontrado'] });
      if (!team.branches.some((br) => br.branch === t.branch)) {
        return res.status(400).json({ errors: ['El equipo ' + team.name + ' no tiene esa rama'] });
      }
    }

    const pending = await prisma.playerRequest.findFirst({
      where: { userId: req.user.id, status: 'PENDING' },
    });
    if (pending) return res.status(409).json({ error: 'Ya tenés una solicitud pendiente' });

    const created = await prisma.playerRequest.create({
      data: {
        userId: req.user.id,
        name,
        dni,
        sex,
        number,
        teams: { create: teamsIn.map((t) => ({ teamId: t.teamId, branch: t.branch })) },
      },
      include,
    });
    res.status(201).json(serialize(created));
  } catch (err) {
    handleError(err, res);
  }
});

// Mi última solicitud (o null)
router.get('/mine', authenticate, async (req, res) => {
  try {
    const r = await prisma.playerRequest.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include,
    });
    res.json(r ? serialize(r) : null);
  } catch (err) {
    handleError(err, res);
  }
});
// ───────────── La organización revisa ─────────────

// Avisos para el admin al cotejar con la planilla. blocking = no se puede aprobar hasta resolverlo.
function conflictsFor(r, profiles, pendings) {
  const out = [];
  const byDni = profiles.find((p) => p.dni === r.dni);
  const byEmail = profiles.find((p) => p.email === r.user.email);

  if (byDni && byDni.user && byDni.user.id !== r.userId) {
    out.push({
      code: 'DNI_OTRA_CUENTA',
      blocking: true,
      message: 'El DNI ya está vinculado a otra cuenta (' + byDni.user.email + ')',
    });
  }
  if (byDni && !byDni.user) {
    out.push({
      code: 'PERFIL_EXISTENTE',
      blocking: false,
      message:
        'Ya hay un perfil cargado con este DNI (' + byDni.name +
        (byDni.email !== r.user.email ? ', mail ' + byDni.email : '') +
        '): al aprobar se vincula a esta cuenta',
    });
  }
  if (byDni && byDni.sex && byDni.sex !== r.sex) {
    out.push({
      code: 'SEXO_DISTINTO',
      blocking: true,
      message: 'El sexo no coincide con el del perfil cargado con ese DNI',
    });
  }
  if (byEmail && (!byDni || byEmail.id !== byDni.id)) {
    out.push({
      code: 'MAIL_OTRO_DNI',
      blocking: true,
      message: 'El mail de la cuenta ya pertenece a un perfil con otro DNI (' + byEmail.dni + ')',
    });
  }
  if (pendings.some((p) => p.id !== r.id && p.dni === r.dni)) {
    out.push({
      code: 'SOLICITUD_DUPLICADA',
      blocking: false,
      message: 'Hay otra solicitud pendiente con el mismo DNI',
    });
  }
  return out;
}

// ?status=PENDING|APPROVED|REJECTED
router.get('/', ...admin, async (req, res) => {
  try {
    const where = {};
    if (STATUSES.includes(req.query.status)) where.status = req.query.status;

    const list = await prisma.playerRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 300,
      include: { ...include, user: { select: { id: true, email: true } } },
    });

    const dnis = [...new Set(list.map((r) => r.dni))];
    const emails = [...new Set(list.map((r) => r.user.email))];
    const profiles = list.length
      ? await prisma.profile.findMany({
          where: { OR: [{ dni: { in: dnis } }, { email: { in: emails } }] },
          include: { user: { select: { id: true, email: true } } },
        })
      : [];
    const pendings = list.length
      ? await prisma.playerRequest.findMany({
          where: { status: 'PENDING', dni: { in: dnis } },
          select: { id: true, dni: true },
        })
      : [];

    res.json(
      list.map((r) => ({
        ...serialize(r),
        user: r.user,
        conflicts: r.status === 'PENDING' ? conflictsFor(r, profiles, pendings) : [],
      }))
    );
  } catch (err) {
    handleError(err, res);
  }
});
// Aprobar: crea (o vincula) el perfil, da el rol de jugador y asigna los equipos, todo junto
router.post('/:id/approve', ...admin, async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      const r = await tx.playerRequest.findUnique({
        where: { id: req.params.id },
        include: { teams: { include: { team: { include: { branches: true } } } }, user: true },
      });
      if (!r) throw new HttpError(404, 'Solicitud no encontrada');
      if (r.status !== 'PENDING') throw new HttpError(409, 'La solicitud ya fue resuelta');

      const user = r.user;
      if (!user.active) throw new HttpError(409, 'La cuenta está desactivada');
      if (user.profileId) throw new HttpError(409, 'La cuenta ya tiene un perfil');

      for (const t of r.teams) {
        if (!t.team) throw new HttpError(409, 'Un equipo de la solicitud ya no existe');
        if (!t.team.branches.some((br) => br.branch === t.branch)) {
          throw new HttpError(409, 'El equipo ' + t.team.name + ' ya no tiene esa rama');
        }
        if (!ALLOWED[r.sex].includes(t.branch)) {
          throw new HttpError(409, 'Rama no permitida para el sexo de la solicitud');
        }
      }

      const byDni = await tx.profile.findUnique({ where: { dni: r.dni }, include: { user: true } });
      const byEmail = await tx.profile.findUnique({ where: { email: user.email } });
      if (byDni && byDni.user && byDni.user.id !== user.id) {
        throw new HttpError(409, 'El DNI ya está vinculado a otra cuenta (' + byDni.user.email + ')');
      }
      if (byDni && byDni.sex && byDni.sex !== r.sex) {
        throw new HttpError(409, 'El sexo no coincide con el del perfil cargado con ese DNI');
      }
      if (byEmail && (!byDni || byEmail.id !== byDni.id)) {
        throw new HttpError(409, 'El mail de la cuenta ya pertenece a un perfil con otro DNI (' + byEmail.dni + ')');
      }

      // Se toma la solicitud primero: si dos admins aprueban a la vez, solo uno la gana
      const claimed = await tx.playerRequest.updateMany({
        where: { id: r.id, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: req.user.id, reviewedAt: new Date(), rejectReason: null },
      });
      if (!claimed.count) throw new HttpError(409, 'La solicitud ya fue resuelta');

      let profile;
      if (byDni) {
        profile = await tx.profile.update({
          where: { id: byDni.id },
          data: {
            isPlayer: true,
            active: true,
            status: 'VINCULADO',
            email: user.email,
            sex: byDni.sex || r.sex,
            ...(r.number != null && byDni.number == null ? { number: r.number } : {}),
          },
        });
      } else {
        profile = await tx.profile.create({
          data: {
            dni: r.dni,
            name: r.name,
            email: user.email,
            sex: r.sex,
            number: r.number,
            isPlayer: true,
            status: 'VINCULADO',
          },
        });
      }

      const roles = new Set(user.roles);
      roles.add('PLAYER');
      await tx.user.update({
        where: { id: user.id },
        data: { profileId: profile.id, roles: { set: [...roles] } },
      });

      for (const t of r.teams) {
        const current = await tx.playerTeam.findFirst({
          where: { profileId: profile.id, branch: t.branch, to: null },
        });
        if (current && current.teamId === t.teamId) continue;
        const now = new Date();
        if (current) await tx.playerTeam.update({ where: { id: current.id }, data: { to: now } });
        await tx.playerTeam.create({
          data: { profileId: profile.id, teamId: t.teamId, branch: t.branch, from: now },
        });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// Rechazar con motivo (el usuario lo ve y puede enviar otra solicitud corregida)
router.post('/:id/reject', ...admin, async (req, res) => {
  try {
    const reason = typeof (req.body || {}).reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).json({ error: 'Indicá el motivo del rechazo' });
    if (reason.length > 300) return res.status(400).json({ error: 'El motivo es muy largo (máx. 300 caracteres)' });

    const result = await prisma.playerRequest.updateMany({
      where: { id: req.params.id, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: reason, reviewedById: req.user.id, reviewedAt: new Date() },
    });
    if (!result.count) {
      const exists = await prisma.playerRequest.findUnique({ where: { id: req.params.id } });
      if (!exists) return res.status(404).json({ error: 'Solicitud no encontrada' });
      return res.status(409).json({ error: 'La solicitud ya fue resuelta' });
    }
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;