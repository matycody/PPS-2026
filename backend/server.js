// backend/server.js

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const { registerMatchHandlers } = require("./src/sockets/matchSocket");
const { registerSocketAuth } = require("./src/sockets/auth");

const app = express();
app.set("trust proxy", 1); // Render: IP real del cliente para el rate limit

// CORS explícito para las rutas REST (Express)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
}));
app.use(express.json());

// Anti-abuso: límite de requests por IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, probá en un minuto" },
}));

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor backend PPS Dodgeball corriendo" });
});

// Auth, perfiles, equipos, torneos, partidos, usuarios y favoritos
app.use("/me", require("./src/routes/me"));
app.use("/profiles", require("./src/routes/profiles"));
app.use("/teams", require("./src/routes/teams"));
app.use("/tournaments", require("./src/routes/tournaments"));
app.use("/matches", require("./src/routes/matches"));
app.use("/users", require("./src/routes/users"));
app.use("/favorites", require("./src/routes/favorites"));
app.use("/me", require("./src/routes/account"));
app.use("/photos", require("./src/routes/photos"));

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
});
