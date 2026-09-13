// backend/server.js

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { registerMatchHandlers } = require("./src/sockets/matchSocket");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor backend PPS Dodgeball corriendo" });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // en Sprint 2 lo restringimos al dominio real del frontend en Vercel
    methods: ["GET", "POST"],
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