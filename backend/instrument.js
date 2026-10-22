// Sentry: se activa solo si existe SENTRY_DSN. Debe cargarse antes que el resto del servidor.
require("dotenv").config();
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "production",
      tracesSampleRate: 0, // solo errores, sin trazas
      sendDefaultPii: false,
    });
  } catch (e) {
    console.warn("[sentry] no instalado: npm i @sentry/node");
  }
}
