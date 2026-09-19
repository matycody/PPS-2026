// backend/server.js

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { registerMatchHandlers } = require("./src/sockets/matchSocket");

const app = express();

// CORS explícito para las rutas REST (Express)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
}));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor backend PPS Dodgeball corriendo" });
});

// Auth: usuario logueado, roles y menú
app.use("/me", require("./src/routes/me"));
app.use("/profiles", require("./src/routes/profiles"));

const server = http.createServer(app);

// CORS explícito para Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false,
  },
});

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