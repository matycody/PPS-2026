// backend/server.js

require("./instrument"); // Sentry (opcional)
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const { registerMatchHandlers, restoreClocks } = require("./src/sockets/matchSocket");
const { registerSocketAuth } = require("./src/sockets/auth");

const app = express();
app.set("trust proxy", 1); // Render: IP real del cliente para el rate limit

// CORS explícito para las rutas REST (Express)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
}));
// Compresión gzip (si el paquete está instalado)
try { app.use(require("compression")()); } catch (e) { console.warn("[compression] no instalado: npm i compression"); }
app.use(express.json());
app.use(require("./src/lib/audit").auditWrites);
app.use(require("./src/middleware/microCache").microCache); // caché de 5 s para GET públicos

// Anti-abuso: límite de requests por IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 1000, // varias personas comparten WiFi/datos en la cancha
  skip: (req) => req.path === '/health' || req.path === '/time',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, probá en un minuto" },
}));

app.get("/time", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ now: Date.now(), iso: new Date().toISOString() });
});

// Prueba de Sentry: solo existe si definís SENTRY_TEST_KEY en el entorno. Uso: /debug-sentry?key=<valor>
app.get("/debug-sentry", (req, res) => {
  if (!process.env.SENTRY_TEST_KEY || req.query.key !== process.env.SENTRY_TEST_KEY) {
    return res.status(404).json({ error: "No encontrado" });
  }
  throw new Error("Prueba de Sentry (backend)");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor backend PPS Dodgeball corriendo" });
});

// Auth, perfiles, equipos, torneos, partidos, usuarios y favoritos
app.use("/auth", require("./src/routes/authLogin"));
app.use("/me", require("./src/routes/me"));
app.use("/profiles", require("./src/routes/profiles"));
app.use("/teams", require("./src/routes/teams"));
app.use("/players", require("./src/routes/players"));
app.use("/tournaments", require("./src/middleware/pausedTournament")); // torneo pausado: oculto para quien no es organización
app.use("/tournaments", require("./src/routes/tournaments"));
app.use("/tournaments", require("./src/routes/fixture"));
app.use("/tournaments", require("./src/routes/standings"));
app.use("/tournaments", require("./src/routes/bracket"));
app.use("/tournaments", require("./src/routes/lifecycle"));
app.use("/stats", require("./src/routes/stats"));
app.use("/search", require("./src/routes/search"));
app.use("/matches", require("./src/middleware/bracketAdvance"));
app.use("/matches", require("./src/routes/matches"));
app.use("/audit", require("./src/routes/audit"));
app.use("/users", require("./src/routes/users"));
app.use('/player-requests', require('./src/routes/playerRequests'))
app.use("/favorites", require("./src/routes/favorites"));
app.use("/me", require("./src/routes/account"));
app.use("/photos", require("./src/routes/photos"));

// Errores no controlados de Express -> Sentry (si está activo)
if (process.env.SENTRY_DSN) {
  try { require("@sentry/node").setupExpressErrorHandler(app); } catch (e) { /* sin sdk */ }
}

const server = http.createServer(app);

// CORS explícito para Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false,
  },
});

app.set('io', io); // notifica cambios de estado desde las rutas REST

// Token opcional en el handshake: sin token entra como visitante (solo lectura)
registerSocketAuth(io);

io.on("connection", (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  registerMatchHandlers(io, socket);

  socket.on("disconnect", () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  // Recupera (en pausa) los relojes guardados antes del reinicio
  restoreClocks(io);
});
