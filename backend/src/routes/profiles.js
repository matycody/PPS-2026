const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

const normEmail = (e) => String(e || '').trim().toLowerCase();
const normDni = (d) => String(d || '').replace(/\D/g, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isSex = (s) => s === 'M' || s === 'F';

// Recalcula PLAYER/REFEREE de la cuenta vinculada según el perfil (conserva ADMIN)
async function syncRoles(profileId) {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { user: true },
  });
  if (!profile?.user) return;

  const roles = new Set(profile.user.roles);
  const toggle = (role, on) => (on ? roles.add(role) : roles.delete(role));
  toggle('PLAYER', profile.active && profile.isPlayer);
  toggle('REFEREE', profile.active && profile.isReferee);

  await prisma.user.update({
    where: { id: profile.user.id },
    data: { roles: { set: [...roles] } },
  });
}

function handleDbError(err, res) {
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'DNI o mail ya existente en otro perfil' });
  }
  console.error('[profiles]', err);
  return res.status(500).json({ error: 'Error interno' });
}

// Alta manual. Si el DNI ya existe, actualiza el perfil en vez de duplicarlo.
router.post('/', async (req, res) => {
  try {
    const { dni, name, email, sex, isPlayer = false, isReferee = false } = req.body;
    const dniN = normDni(dni);
    const emailN = normEmail(email);
    const errors = [];

    if (dniN.length < 6) errors.push('DNI inválido');
    if (!name || !String(name).trim()) errors.push('Nombre obligatorio');
    if (!EMAIL_RE.test(emailN)) errors.push('Mail inválido');
    if (!isPlayer && !isReferee) errors.push('Indicá si es jugador y/o árbitro');
    if (sex && !isSex(sex)) errors.push('Sexo inválido (M o F)');
    if (isPlayer && !isSex(sex)) errors.push('El sexo es obligatorio para jugadores');
    if (errors.length) return res.status(400).json({ errors });

    const existing = await prisma.profile.findUnique({ where: { dni: dniN } });
    const emailOwner = await prisma.profile.findUnique({ where: { email: emailN } });
    if (emailOwner && emailOwner.id !== existing?.id) {
      return res.status(409).json({ error: 'Ese mail ya está inscripto en otro perfil' });
    }

    let profile;
    if (existing) {
      profile = await prisma.profile.update({
        where: { id: existing.id },
        data: {
          name: String(name).trim(),
          sex: sex || existing.sex,
          isPlayer: existing.isPlayer || isPlayer,
          isReferee: existing.isReferee || isReferee,
          active: true,
          // el mail de un perfil vinculado lo cambia el propio usuario
          ...(existing.status === 'PENDIENTE_VINCULACION' ? { email: emailN } : {}),
        },
      });
    } else {
      profile = await prisma.profile.create({
        data: {
          dni: dniN,
          name: String(name).trim(),
          email: emailN,
          sex: sex || null,
          isPlayer,
          isReferee,
        },
      });
    }

    await syncRoles(profile.id);
    res.status(existing ? 200 : 201).json(profile);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Listado con filtros: ?status=PENDIENTE_VINCULACION&active=true&q=texto
router.get('/', async (req, res) => {
  try {
    const { status, active, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (active !== undefined) where.active = active === 'true';
    if (q) {
      where.OR = [
        { name: { contains: String(q), mode: 'insensitive' } },
        { dni: { contains: String(q) } },
        { email: { contains: String(q).toLowerCase() } },
      ];
    }
    const profiles = await prisma.profile.findMany({ where, orderBy: { name: 'asc' } });
    res.json(profiles);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Editar (también baja/reactivación con { active: false | true })
router.patch('/:id', async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

    const { dni, name, email, sex, isPlayer, isReferee, active } = req.body;
    const data = {};

    if (dni !== undefined) {
      const dniN = normDni(dni);
      if (dniN.length < 6) return res.status(400).json({ error: 'DNI inválido' });
      data.dni = dniN;
    }
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
      data.name = String(name).trim();
    }
    if (email !== undefined) {
      if (profile.status !== 'PENDIENTE_VINCULACION') {
        return res.status(409).json({
          error: 'Perfil vinculado: el mail lo cambia el usuario, o desvinculá el perfil primero',
        });
      }
      const emailN = normEmail(email);
      if (!EMAIL_RE.test(emailN)) return res.status(400).json({ error: 'Mail inválido' });
      data.email = emailN;
    }
    if (sex !== undefined) {
      if (sex !== null && !isSex(sex)) return res.status(400).json({ error: 'Sexo inválido' });
      data.sex = sex;
    }
    if (isPlayer !== undefined) data.isPlayer = Boolean(isPlayer);
    if (isReferee !== undefined) data.isReferee = Boolean(isReferee);
    if (active !== undefined) data.active = Boolean(active);

    const final = { ...profile, ...data };
    if (final.isPlayer && !final.sex) {
      return res.status(400).json({ error: 'El sexo es obligatorio para jugadores' });
    }

    const updated = await prisma.profile.update({ where: { id: profile.id }, data });
    await syncRoles(profile.id);
    res.json(updated);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Desvincular cuenta (perdió acceso al mail). Exige el mail nuevo para que no se revincule solo.
router.post('/:id/unlink', async (req, res) => {
  try {
    const emailN = normEmail(req.body.email);
    if (!EMAIL_RE.test(emailN)) {
      return res.status(400).json({ error: 'Indicá el mail nuevo del perfil' });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });
    if (!profile.user) return res.status(409).json({ error: 'El perfil no está vinculado' });
    if (emailN === profile.user.email) {
      return res.status(400).json({ error: 'El mail nuevo debe ser distinto al de la cuenta actual' });
    }

    const roles = profile.user.roles.filter((r) => r !== 'PLAYER' && r !== 'REFEREE');

    const [, updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: profile.user.id },
        data: { profileId: null, roles: { set: roles } },
      }),
      prisma.profile.update({
        where: { id: profile.id },
        data: { email: emailN, status: 'PENDIENTE_VINCULACION' },
      }),
    ]);
    res.json(updated);
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;