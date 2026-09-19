const prisma = require('../db');
const supabase = require('../lib/supabase');

// Vincula la cuenta a un perfil inscripto (mismo mail verificado). Una sola vez.
async function linkProfileIfAny(user) {
  if (user.profileId) return user;

  const profile = await prisma.profile.findUnique({ where: { email: user.email } });
  if (!profile || !profile.active || profile.status !== 'PENDIENTE_VINCULACION') {
    return user;
  }

  const roles = new Set(user.roles);
  if (profile.isPlayer) roles.add('PLAYER');
  if (profile.isReferee) roles.add('REFEREE');

  const [, updated] = await prisma.$transaction([
    prisma.profile.update({
      where: { id: profile.id },
      data: { status: 'VINCULADO' },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { profileId: profile.id, roles: { set: [...roles] } },
    }),
  ]);
  return updated;
}

// Busca o crea el User local a partir de la cuenta de Supabase
async function syncUser(supaUser) {
  const email = supaUser.email.trim().toLowerCase();

  let user = await prisma.user.findUnique({ where: { supabaseId: supaUser.id } });

  if (!user) {
    const seeded = await prisma.user.findUnique({ where: { email } });
    if (seeded && !seeded.supabaseId) {
      // admin del seed: primer login
      user = await prisma.user.update({
        where: { id: seeded.id },
        data: { supabaseId: supaUser.id },
      });
    } else if (!seeded) {
      user = await prisma.user.create({
        data: { supabaseId: supaUser.id, email, roles: [] },
      });
    } else {
      return null; // mail ya asociado a otra cuenta
    }
  }

  return linkProfileIfAny(user);
}

// Valida un token de Supabase y devuelve el User local (o un error con status)
async function resolveToken(token) {
  if (!token) return { status: 401, error: 'Falta token' };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { status: 401, error: 'Token inválido' };

  if (!data.user.email_confirmed_at) {
    return { status: 403, error: 'Mail sin confirmar' };
  }

  const user = await syncUser(data.user);
  if (!user) return { status: 409, error: 'Mail asociado a otra cuenta' };
  if (!user.active) return { status: 403, error: 'Cuenta desactivada' };

  return { user };
}

function resolveUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return resolveToken(token);
}

// Exige sesión válida
async function authenticate(req, res, next) {
  try {
    const result = await resolveUser(req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    req.user = result.user;
    next();
  } catch (err) {
    console.error('[auth]', err);
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

// Sesión opcional (endpoints públicos): req.user = null si no hay token
async function optionalAuth(req, res, next) {
  if (!req.headers.authorization) {
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
}

// Exige alguno de los roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.some((r) => req.user.roles.includes(r))) {
      return res.status(403).json({ error: 'Sin permiso' });
    }
    next();
  };
}

module.exports = { authenticate, optionalAuth, requireRole, resolveToken };
