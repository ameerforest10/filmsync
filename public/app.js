const socket = io({ reconnection: true });
const $ = id => document.getElementById(id);
const video = $("video");
let joined = false, roomCode = "", me = "", fileReady = false, applying = false, lastSeekSent = 0;

$("joinBtn").onclick = () => {
  const code = $("room").value.trim().toUpperCase();
  me = $("initial").value;
  socket.emit("join", { roomCode: code, initial: me }, res => {
    if (!res?.ok) return alert(res?.error || "Could not join");
    joined = true; roomCode = res.roomCode;
    $("join").hidden = true; $("watch").hidden = false; $("roomLabel").textContent = roomCode;
  });
};

$("file").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = URL.createObjectURL(file);
  video.load();
  fileReady = true;
  socket.emit("ready", true);
  socket.emit("sync-request");
};

function send(action) {
  if (!joined || !fileReady || applying) return;
  socket.emit("control", { action, time: video.currentTime || 0 });
}

video.addEventListener("play", () => send("play"));
video.addEventListener("pause", () => send("pause"));
video.addEventListener("seeked", () => {
  if (applying) return;
  const now = Date.now();
  if (now - lastSeekSent > 100) { lastSeekSent = now; send("seek"); }
});

socket.on("state", async state => {
  if (!joined) return;
  const members = state.members || [];
  const A = members.some(m => m.initial === "A"), L = members.some(m => m.initial === "L");
  $("aDot").classList.toggle("on", A); $("lDot").classList.toggle("on", L);
  const bothReady = members.length === 2 && members.every(m => m.ready);
  if (!A || !L) $("status").textContent = A ? "Waiting for L…" : L ? "Waiting for A…" : "Waiting…";
  else if (!bothReady) $("status").textContent = "Choose film on both devices";
  else $("status").textContent = state.playing ? "Synced" : "Synced — paused";
  if (!fileReady) return;

  const target = Math.max(0, Number(state.time) || 0);
  applying = true;
  try {
    if (Math.abs(video.currentTime - target) > 0.65) video.currentTime = target;
    if (!state.playing && !video.paused) video.pause();
    if (state.playing && video.paused) {
      try { await video.play(); } catch { $("status").textContent = "Press play to continue"; }
    }
  } finally { setTimeout(() => applying = false, 120); }
});

socket.on("disconnect", () => {
  if (joined) $("status").textContent = "Reconnecting…";
  if (!video.paused) { applying = true; video.pause(); setTimeout(() => applying = false, 120); }
});
socket.on("connect", () => {
  if (joined && roomCode) socket.emit("join", { roomCode, initial: me }, res => {
    if (res?.ok && fileReady) { socket.emit("ready", true); socket.emit("sync-request"); }
  });
});
