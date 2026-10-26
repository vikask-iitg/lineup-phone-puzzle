const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');

const ROOT = process.cwd();
const PORT = process.env.PORT || 3000;
const staticFiles = new Map([
  ['/index.html', fs.readFileSync(path.join(ROOT, 'index.html'))],
  ['/style.css', fs.readFileSync(path.join(ROOT, 'style.css'))],
  ['/client.js', fs.readFileSync(path.join(ROOT, 'client.js'))],
]);
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const palettes = ['#ff5d73', '#39d5c5', '#ffc857', '#8c7bff', '#55a7ff', '#ff914d', '#d66bdb', '#a3d977'];
const levels = [{ lines: 1, seconds: 60 }, { lines: 2, seconds: 50 }, { lines: 3, seconds: 45 }, { lines: 2, seconds: 45 }, { lines: 3, seconds: 40 }];

const server = http.createServer((req, res) => {
  const requested = new URL(req.url, `http://${req.headers.host}`).pathname;
  const pathname = requested === '/' || /^[A-Z]{4}$/.test(requested.slice(1)) ? '/index.html' : requested;
  const data = staticFiles.get(pathname);
  if (!data) { res.writeHead(404).end('Not found'); return; }
  const ext = path.extname(pathname);
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' })[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(data);
});
const wss = new WebSocketServer({ server });

function send(ws, type, payload = {}) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload })); }
function state(room) {
  const now = Date.now();
  return { code: room.code, phase: room.phase, hostId: room.hostId, players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected })), level: room.level, tiles: room.tiles, secondsLeft: room.phase === 'play' ? Math.max(0, Math.ceil((room.endsAt - now) / 1000)) : 0, score: room.score, result: room.result, pattern: room.pattern, startsAt: room.startsAt, endsAt: room.endsAt };
}
function broadcast(room) { const payload = state(room); for (const p of room.players.values()) send(p.ws, 'state', { state: payload }); }
function randomCode() { let code; do { code = Array.from({ length: 4 }, () => alphabet[Math.random() * alphabet.length | 0]).join(''); } while (rooms.has(code)); return code; }
function makeRoom() { const code = randomCode(); const room = { code, players: new Map(), phase: 'lobby', hostId: null, level: 1, score: 0, pattern: [], tiles: [], segments: [], result: null, createdAt: Date.now(), endsAt: 0, startsAt: 0, checksLockedUntil: 0, lastActive: Date.now() }; rooms.set(code, room); return room; }

function generate(room) {
  const n = room.players.size;
  const { lines } = levels[Math.min(room.level - 1, levels.length - 1)];
  const colors = palettes.slice(0, lines);
  const patterns = Array.from({ length: n - 1 }, (_, edge) => colors.map((color, i) => ({ color, y: 25 + ((edge * 19 + i * 31 + room.level * 7) % 51), pattern: ['solid', 'dash', 'dot'][(edge + i) % 3] })));
  // Make every boundary distinguishable while preserving a matchable visual pattern.
  room.pattern = patterns;
  const solution = Array.from({ length: n }, (_, i) => i);
  const shuffled = solution.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  room.tiles = shuffled.map((slot, index) => ({ playerId: [...room.players.keys()][index], slot, start: slot === 0, end: slot === n - 1, left: slot === 0 ? [] : patterns[slot - 1], right: slot === n - 1 ? [] : patterns[slot] }));
  room.segments = []; room.result = null;
}
function begin(room) {
  room.phase = 'get-ready'; room.result = null; generate(room); room.startsAt = Date.now() + 3000;
  room.endsAt = room.startsAt + levels[Math.min(room.level - 1, levels.length - 1)].seconds * 1000;
  broadcast(room);
  setTimeout(() => { if (room.phase === 'get-ready') { room.phase = 'play'; broadcast(room); } }, 3000);
}
function finishCheck(room) {
  if (room.checking || room.phase !== 'play') return;
  const chains = [];
  for (const first of room.segments) {
    const chain = [first]; let current = first;
    while (true) {
      const next = room.segments.filter(s => !chain.includes(s) && s.startTime >= current.endTime && s.startTime - current.endTime <= 900).sort((a,b) => a.startTime - b.startTime)[0];
      if (!next) break; chain.push(next); current = next;
    }
    chains.push(chain);
  }
  const chain = chains.sort((a,b) => b.length - a.length)[0] || [];
  if (chain.length < 2) return;
  const ids = chain.map(s => s.playerId);
  const order = room.tiles.slice().sort((a,b) => a.slot - b.slot).map(t => t.playerId);
  const complete = ids.length === order.length && new Set(ids).size === order.length && order.every(id => ids.includes(id));
  if (!complete) { room.result = 'incomplete'; room.segments = []; broadcast(room); return; }
  const correct = ids.every((id, i) => id === order[i]);
  if (correct) { room.result = 'correct'; room.phase = 'level-complete'; room.score += Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000)) * 10; }
  else { room.result = 'wrong'; room.endsAt = Math.max(Date.now(), room.endsAt - 5000); }
  room.segments = []; room.checksLockedUntil = Date.now() + 1500; broadcast(room);
  if (correct) setTimeout(() => { if (room.phase === 'level-complete') { if (room.level >= 5) room.phase = 'final'; else { room.level++; begin(room); } broadcast(room); } }, 4000);
}

wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'ping') { send(ws, 'pong', { clientTime: msg.clientTime, serverTime: Date.now() }); return; }
    if (msg.type === 'create') {
      const room = makeRoom(); join(ws, room, msg); return;
    }
    if (msg.type === 'join') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room) { send(ws, 'error', { message: 'Room not found. Check the 4-letter code.' }); return; }
      if (room.players.size >= 8 && !room.players.has(msg.sessionId)) { send(ws, 'error', { message: 'Room full — this room has 8 players.' }); return; }
      join(ws, room, msg); return;
    }
    const room = [...rooms.values()].find(r => [...r.players.values()].some(p => p.ws === ws));
    if (!room) return;
    const player = [...room.players.values()].find(p => p.ws === ws);
    if (msg.type === 'start' && player.id === room.hostId && room.phase === 'lobby' && room.players.size >= 2) { room.level = 1; room.score = 0; begin(room); return; }
    if (msg.type === 'retry' && player.id === room.hostId && ['time-up','final'].includes(room.phase)) { room.phase = 'play'; begin(room); return; }
    if (msg.type === 'end' && player.id === room.hostId) { room.phase = 'final'; broadcast(room); return; }
    if (msg.type === 'segment' && room.phase === 'play' && Date.now() >= room.checksLockedUntil && room.tiles.some(t => t.playerId === player.id)) {
      room.segments.push({ playerId: player.id, startTime: Number(msg.startTime), endTime: Number(msg.endTime) });
      clearTimeout(room.checkTimer); room.checking = true;
      room.checkTimer = setTimeout(() => { room.checking = false; finishCheck(room); }, 1200);
    }
  });
  ws.on('close', () => {
    for (const room of rooms.values()) for (const p of room.players.values()) if (p.ws === ws) { p.connected = false; if (room.hostId === p.id) { const next = [...room.players.values()].filter(x => x.connected).sort((a,b) => a.joinedAt-b.joinedAt)[0]; room.hostId = next?.id || null; } room.lastActive = Date.now(); broadcast(room); }
  });
});
function join(ws, room, msg) {
  const sessionId = String(msg.sessionId || Math.random().toString(36).slice(2));
  const prior = room.players.get(sessionId);
  if (prior?.ws && prior.ws !== ws) { send(prior.ws, 'elsewhere'); prior.ws.close(); }
  const name = String(msg.name || prior?.name || `Pal ${room.players.size + 1}`).trim().slice(0, 16) || 'Pal';
  const same = [...room.players.values()].filter(p => p.id !== sessionId && p.name.toLowerCase().startsWith(name.toLowerCase()));
  const uniqueName = same.some(p => p.name.toLowerCase() === name.toLowerCase()) ? `${name} ${same.length + 1}` : name;
  const player = { id: sessionId, name: uniqueName, color: prior?.color || palettes[room.players.size % palettes.length], ws, joinedAt: prior?.joinedAt || Date.now(), connected: true };
  room.players.set(sessionId, player); if (!room.hostId) room.hostId = sessionId; room.lastActive = Date.now();
  send(ws, 'joined', { sessionId, code: room.code });
  if (room.phase !== 'lobby' && !prior) send(ws, 'notice', { message: "Next level starts soon — you'll be in it." });
  broadcast(room);
}
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === 'play' && now >= room.endsAt) { room.phase = 'time-up'; room.result = 'time-up'; broadcast(room); }
    if (![...room.players.values()].some(p => p.connected) && now - room.lastActive > 600000) rooms.delete(room.code);
  }
}, 250);
// Vercel owns the listener in production; keep a local listener for development.
if (!process.env.VERCEL) server.listen(PORT, () => console.log(`Lines in Sync listening on ${PORT}`));
module.exports = server;
