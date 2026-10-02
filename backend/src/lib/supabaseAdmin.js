require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Cliente con la clave de servicio: SOLO backend. Nunca exponerlo al frontend.
module.exports = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
