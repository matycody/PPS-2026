const express = require('express');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const prisma = require('../db');

const router = express.Router();

// Anti fuerza bruta: 10 intentos cada 15 minutos por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, probá en unos minutos' },
});

// Inicio de sesión con usuario (o mail) + contraseña. El mail del usuario nunca sale del servidor.
router.post('/login', limiter, async (req, res) => {
  const BAD = { error: 'Usuario o contraseña incorrectos' };
  try {
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!identifier || !password) return res.status(400).json(BAD);

    let email = identifier;
    if (!identifier.includes('@')) {
      const user = await prisma.user.findUnique({ where: { username: identifier }, select: { email: true } });
      if (!user) return res.status(401).json(BAD);
      email = user.email;
    }

    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data?.session) return res.status(401).json(BAD);
    res.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
