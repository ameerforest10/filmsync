const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 5000, pingTimeout: 8000 });

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();

function roomState(room) {
  return {
    playing: room.playing,
    time: room.time,
    updatedAt: room.updatedAt,
    members: [...room.members.values()].map(m => ({ id: m.id, initial: m.initial, ready: m.ready }))
  };
}
function position(room) {
  return room.playing ? room.time + (Date.now() - room.updatedAt) / 1000 : room.time;
}
function broadcast(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("state", { ...roomState(room), time: position(room), playing: room.playing, serverNow: Date.now() });
}
function pauseRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.time = position(room);
  room.playing = false;
  room.updatedAt = Date.now();
  broadcast(roomCode);
}

io.on("connection", socket => {
  socket.on("join", ({ roomCode, initial }, ack) => {
    roomCode = String(roomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    initial = String(initial || "?").toUpperCase().slice(0, 1);
    if (!roomCode) return ack?.({ ok: false, error: "Invalid room" });

    let room = rooms.get(roomCode);
    if (!room) {
      room = { playing: false, time: 0, updatedAt: Date.now(), members: new Map() };
      rooms.set(roomCode, room);
    }
    if (room.members.size >= 2 && !room.members.has(socket.id)) return ack?.({ ok: false, error: "Room is full" });

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    room.members.set(socket.id, { id: socket.id, initial, ready: false });
    pauseRoom(roomCode);
    ack?.({ ok: true, roomCode });
    broadcast(roomCode);
  });

  socket.on("ready", ready => {
    const code = socket.data.roomCode, room = rooms.get(code);
    if (!room || !room.members.has(socket.id)) return;
    room.members.get(socket.id).ready = !!ready;
    if (!ready) pauseRoom(code); else broadcast(code);
  });

  socket.on("control", ({ action, time }) => {
    const code = socket.data.roomCode, room = rooms.get(code);
    if (!room || !room.members.has(socket.id)) return;
    const allReady = room.members.size === 2 && [...room.members.values()].every(m => m.ready);
    if (!allReady) return pauseRoom(code);

    const t = Number(time);
    if (Number.isFinite(t)) room.time = Math.max(0, t);
    room.updatedAt = Date.now();
    if (action === "play") room.playing = true;
    if (action === "pause" || action === "seek") room.playing = false;
    broadcast(code);
  });

  socket.on("sync-request", () => {
    const code = socket.data.roomCode;
    if (code) broadcast(code);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode, room = rooms.get(code);
    if (!room) return;
    room.members.delete(socket.id);
    pauseRoom(code);
    if (room.members.size === 0) setTimeout(() => {
      const current = rooms.get(code);
      if (current && current.members.size === 0) rooms.delete(code);
    }, 30 * 60 * 1000);
  });
});

setInterval(() => {
  for (const [code, room] of rooms) if (room.playing) broadcast(code);
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`FilmSync listening on ${PORT}`));
