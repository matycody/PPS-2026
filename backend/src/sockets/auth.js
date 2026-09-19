const prisma = require('../db');
const { resolveToken } = require('../middleware/auth');

const MAX_CONN_PER_IP = 30;
const connections = new Map();

function clientIp(socket) {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0].trim() : socket.handshake.address) || 'unknown';
}

// El token ya fue validado por Supabase: solo leemos su vencimiento
function tokenExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.exp || 0;
  } catch (err) {
    return 0;
  }
}

function registerSocketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const ip = clientIp(socket);
      const count = connections.get(ip) || 0;
      if (count >= MAX_CONN_PER_IP) return next(new Error('Demasiadas conexiones'));

      socket.data.user = null; // sin token = visitante (viewer)
      socket.data.displayName = 'Visitante';

      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (token) {
        const result = await resolveToken(token);
        if (result.error) return next(new Error(result.error));

        const user = result.user;
        let displayName = user.email.split('@')[0];
        if (user.profileId) {
          const profile = await prisma.profile.findUnique({
            where: { id: user.profileId },
            select: { name: true },
          });
          if (profile) displayName = profile.name;
        }
        socket.data.user = user;
        socket.data.displayName = displayName;
        socket.data.tokenExp = tokenExp(token);
      }

      connections.set(ip, count + 1);
      socket.on('disconnect', () => {
        const left = (connections.get(ip) || 1) - 1;
        if (left <= 0) connections.delete(ip);
        else connections.set(ip, left);
      });
      next();
    } catch (err) {
      console.error('[socket-auth]', err);
      next(new Error('Error de autenticación'));
    }
  });
}

module.exports = { registerSocketAuth };
