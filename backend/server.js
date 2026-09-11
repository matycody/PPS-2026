require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

// Health check - para confirmar que el server está vivo
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor backend PPS Dodgeball corriendo" });
});

const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // en Sprint 2 lo restringimos al dominio real del frontend en Vercel
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // --- Eventos que el frontend puede emitir ---
  socket.on("match:start", (data) => {
    console.log("match:start recibido", data);
    // TODO: acá se llama al TimerEngine para arrancar el partido
  });

  socket.on("match:pause", (data) => {
    console.log("match:pause recibido", data);
    // TODO: pausa individual o grupal según data.scope
  });

  socket.on("match:resume", (data) => {
    console.log("match:resume recibido", data);
    // TODO: reanudar timer
  });

  socket.on("disconnect", () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});