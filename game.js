/* ============================================================
   SPACE SUS — fan-made online social deduction game.
   Pure static site: WebRTC P2P via the free PeerJS cloud broker.
   The room creator is the authoritative host; everyone else
   connects to them with a 5-letter code.
   ============================================================ */
"use strict";

// ------------------ constants ------------------
const PREFIX      = "space-sus-v1-";
const SPEED       = 270;      // px/sec
const PLAYER_R    = 22;
const KILL_RANGE  = 100;
const KILL_CD     = 30000;
const USE_RANGE   = 95;
const REPORT_RANGE= 120;
const BTN_RANGE   = 170;
const VOTE_TIME   = 60000;
const REVEAL_TIME = 6000;
const TASKS_PER   = 5;
const VISION_CREW = 520;
const VISION_IMP  = 850;
const SNAP_MS     = 66;       // ~15 Hz
// Reference viewport area (world units²). Every screen is zoomed to show this
// same area, so a 4K monitor and a phone reveal an equal slice of the map.
const VIEW_AREA   = 1150 * 690;
// Extreme aspect ratios get letterboxed back into this range, so an ultrawide
// can't see way down a corridor and a tall phone isn't a narrow slit.
const AR_MIN      = 0.55;   // tallest allowed (portrait)
const AR_MAX      = 1.9;    // widest allowed (landscape)

const COLORS = [
  ["Red",    "#c51111"], ["Blue",  "#1330c0"], ["Green", "#117f2d"],
  ["Pink",   "#ed54ba"], ["Orange","#ef7d0d"], ["Yellow","#e8e84c"],
  ["Black",  "#3f474e"], ["White", "#d6e0f0"], ["Purple","#6b2fbb"],
  ["Cyan",   "#38c8dc"], ["Lime",  "#50ef39"], ["Brown", "#71491e"],
];

// ------------------ map ------------------
// Everything walkable is a union of rects (rooms + corridors).
const ROOMS = [
  { n: "CAFETERIA",    x:  950, y:  120, w: 640, h: 480 },
  { n: "WEAPONS",      x: 1900, y:  140, w: 380, h: 320 },
  { n: "NAVIGATION",   x: 2260, y:  780, w: 300, h: 340 },
  { n: "O2",           x: 1750, y:  640, w: 290, h: 240 },
  { n: "SHIELDS",      x: 1900, y: 1240, w: 480, h: 320 },
  { n: "STORAGE",      x: 1180, y: 1180, w: 420, h: 420 },
  { n: "ELECTRICAL",   x:  760, y: 1240, w: 340, h: 280 },
  { n: "LOWER ENGINE", x:  160, y: 1300, w: 360, h: 320 },
  { n: "REACTOR",      x:  140, y:  760, w: 320, h: 360 },
  { n: "UPPER ENGINE", x:  160, y:  200, w: 360, h: 320 },
  { n: "SECURITY",     x:  620, y:  760, w: 280, h: 260 },
  { n: "MEDBAY",       x:  620, y:  360, w: 260, h: 280 },
];
const HALLS = [
  { x: 1570, y:  300, w: 350, h: 120 },  // cafeteria - weapons
  { x: 2020, y:  440, w: 120, h: 400 },  // weapons - o2 (vertical)
  { x: 2120, y:  820, w: 160, h: 120 },  // hall - navigation
  { x: 2280, y: 1100, w: 120, h: 180 },  // navigation - shields
  { x: 1580, y: 1330, w: 340, h: 120 },  // shields - storage
  { x: 1330, y:  580, w: 120, h: 620 },  // cafeteria - storage (vertical)
  { x: 1430, y:  700, w: 340, h: 120 },  // vertical hall - o2
  { x: 1080, y: 1330, w: 120, h: 120 },  // storage - electrical
  { x:  500, y: 1360, w: 280, h: 120 },  // electrical - lower engine
  { x:  240, y: 1100, w: 120, h: 220 },  // lower engine - reactor
  { x:  240, y:  500, w: 120, h: 280 },  // reactor - upper engine
  { x:  500, y:  400, w: 470, h: 120 },  // upper engine - medbay - cafeteria
  { x:  440, y:  840, w: 200, h: 120 },  // reactor hall - security
  { x:  700, y:  620, w: 120, h: 160 },  // medbay - security
];
const WALK = ROOMS.concat(HALLS);

const BUTTON = { x: 1270, y: 360 };  // emergency button (cafeteria)

// Task stations: id, label, room, position, minigame type (0 hold, 1 wires, 2 code)
const STATIONS = [
  { id: 0,  n: "Calibrate targeting",   room: "Weapons",      x: 2090, y: 260  },
  { id: 1,  n: "Chart course",          room: "Navigation",   x: 2470, y: 900  },
  { id: 2,  n: "Clean O2 filter",       room: "O2",           x: 1900, y: 700  },
  { id: 3,  n: "Prime shields",         room: "Shields",      x: 2130, y: 1400 },
  { id: 4,  n: "Sort supplies",         room: "Storage",      x: 1390, y: 1520 },
  { id: 5,  n: "Fix wiring",            room: "Electrical",   x: 950,  y: 1310 },
  { id: 6,  n: "Divert power",          room: "Electrical",   x: 830,  y: 1460 },
  { id: 7,  n: "Fuel lower engine",     room: "Lower Engine", x: 340,  y: 1470 },
  { id: 8,  n: "Fuel upper engine",     room: "Upper Engine", x: 340,  y: 300  },
  { id: 9,  n: "Unlock manifolds",      room: "Reactor",      x: 260,  y: 850  },
  { id: 10, n: "Review footage",        room: "Security",     x: 760,  y: 830  },
  { id: 11, n: "Submit scan",           room: "MedBay",       x: 760,  y: 450  },
  { id: 12, n: "Empty garbage",         room: "Cafeteria",    x: 1520, y: 200  },
];
STATIONS.forEach(s => s.t = s.id % 3);

// Vent networks — impostors only. You can hop between vents that share a network.
const VENTS = [
  { x: 1050, y: 1470, links: [1, 2] },   // 0 Electrical
  { x:  660, y:  600, links: [0, 2] },   // 1 MedBay
  { x:  660, y:  980, links: [0, 1] },   // 2 Security
  { x: 1050, y:  520, links: [4, 5] },   // 3 Cafeteria
  { x: 2200, y:  200, links: [3, 5] },   // 4 Weapons
  { x: 2500, y: 1050, links: [3, 4] },   // 5 Navigation
  { x:  250, y:  420, links: [7, 8] },   // 6 Upper Engine
  { x:  200, y: 1000, links: [6, 8] },   // 7 Reactor
  { x:  250, y: 1560, links: [6, 7] },   // 8 Lower Engine
  { x: 2000, y: 1500, links: [10] },     // 9 Shields
  { x: 1250, y: 1250, links: [9] },      // 10 Storage
];
VENTS.forEach((v, i) => v.id = i);
const VENT_RANGE = 90;

// Sabotages. Critical ones run a countdown that ends the game if it expires.
const SABS = {
  lights:  { name: "Lights",           room: "Electrical", fx: { x: 830,  y: 1300 } },
  comms:   { name: "Comms",            room: "Navigation", fx: { x: 2400, y: 820  } },
  reactor: { name: "Reactor Meltdown", room: "Reactor",    fx: { x: 380,  y: 1050 }, time: 45000 },
  o2:      { name: "O2 Depletion",     room: "O2",         fx: { x: 1960, y: 820  }, time: 45000 },
};
const SAB_CD      = 25000;
const VISION_DARK = 190;   // crew vision while the lights are sabotaged

// ------------------ helpers ------------------
const $ = id => document.getElementById(id);
const now = () => Date.now();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
function inWalk(x, y) {
  for (const r of WALK) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  return false;
}
// player fits if 4 sample points around them are walkable
function canStand(x, y) {
  const m = 16;
  return inWalk(x - m, y) && inWalk(x + m, y) && inWalk(x, y - m) && inWalk(x, y + m);
}
// Keep the camera inside the map; if the view is wider than the map, center it.
function camClamp(center, viewSize, min, max) {
  const span = max - min;
  if (viewSize >= span) return min + (span - viewSize) / 2;
  return clamp(center - viewSize / 2, min, max - viewSize);
}
function meetingSpots(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push([Math.round(BUTTON.x + Math.cos(a) * 150), Math.round(BUTTON.y + Math.sin(a) * 110)]);
  }
  return out;
}

// ============================================================
// NETWORK
// ============================================================
const Net = {
  peer: null, conn: null, isHost: false, myId: null,

  hostRoom(name, attempt = 0) {
    const code = genCode();
    this.isHost = true;
    this.peer = new Peer(PREFIX + code, { debug: 1 });
    this.peer.on("open", id => {
      this.myId = id;
      Host.init(code, name);
    });
    this.peer.on("connection", conn => {
      conn.on("data", d => Host.onNet(conn, d));
      conn.on("close", () => Host.dropPlayer(conn.peer));
    });
    this.peer.on("error", e => {
      if (e.type === "unavailable-id" && attempt < 3) {
        this.peer.destroy(); this.hostRoom(name, attempt + 1);
      } else if (!Host.active) {
        homeError("Could not reach the matchmaking service. Check your connection.");
      }
    });
  },

  joinRoom(code, name) {
    this.isHost = false;
    this.peer = new Peer({ debug: 1 });
    this.peer.on("open", id => {
      this.myId = id;
      this.conn = this.peer.connect(PREFIX + code, { reliable: true });
      this.conn.on("open", () => this.conn.send({ t: "hello", name }));
      this.conn.on("data", d => Client.onMsg(d));
      this.conn.on("close", () => Client.disconnected("The host closed the room or the connection dropped."));
    });
    this.peer.on("error", e => {
      if (e.type === "peer-unavailable") homeError("Room not found. Check the code.");
      else if (e.type !== "unavailable-id") homeError("Connection error: " + e.type);
    });
  },

  toHost(m) {
    if (this.isHost) Host.onMsg(this.myId, m);
    else if (this.conn && this.conn.open) this.conn.send(m);
  },
};

// ============================================================
// HOST (authoritative game state, runs only on room creator)
// ============================================================
const Host = {
  active: false, code: "", phase: "lobby",
  players: new Map(),          // id -> player
  bodies: [], meeting: null, snapTimer: null, revealTimer: null,
  sab: null, sabReadyAt: 0,

  init(code, name) {
    this.active = true;
    this.code = code;
    this.addPlayer(Net.myId, name, null);
    this.snapTimer = setInterval(() => this.tick(), SNAP_MS);
    Client.enterLobby(code);
  },

  addPlayer(id, name, conn) {
    const used = new Set([...this.players.values()].map(p => p.ci));
    let ci = 0;
    while (used.has(ci) && ci < COLORS.length) ci++;
    const p = {
      id, conn, name: String(name).slice(0, 12) || "Player",
      ci, color: COLORS[ci % COLORS.length][1],
      x: BUTTON.x, y: BUTTON.y + 80, dir: 1, mv: 0,
      alive: true, imp: false, tasks: [], done: new Set(),
      usedBtn: false, lastKill: 0, vent: -1,
    };
    this.players.set(id, p);
    this.sendRoster();
    this.sysChat(p.name + " joined the lobby");
    return p;
  },

  onNet(conn, m) {
    if (m && m.t === "hello") {
      if (this.phase !== "lobby") { conn.send({ t: "reject", reason: "Game already in progress." }); return; }
      if (this.players.size >= 12) { conn.send({ t: "reject", reason: "Room is full (12 max)." }); return; }
      this.addPlayer(conn.peer, m.name, conn);
      return;
    }
    if (this.players.has(conn.peer)) this.onMsg(conn.peer, m);
  },

  onMsg(id, m) {
    const p = this.players.get(id);
    if (!p || !m) return;
    switch (m.t) {
      case "pos":
        if (p.vent >= 0) break;                    // vented players don't move
        p.x = clamp(+m.x || 0, 0, 2600); p.y = clamp(+m.y || 0, 0, 1800);
        p.dir = m.dir >= 0 ? 1 : -1; p.mv = m.mv ? 1 : 0;
        break;
      case "vent": {
        if (this.phase !== "play" || !p.imp || !p.alive) break;
        const v = VENTS[m.v];
        if (m.a === "enter") {
          if (p.vent >= 0 || !v || dist(p, v) > VENT_RANGE + 60) break;
          p.vent = v.id; p.x = v.x; p.y = v.y; p.mv = 0;
        } else if (m.a === "move") {
          if (p.vent < 0 || !v || !VENTS[p.vent].links.includes(v.id)) break;
          p.vent = v.id; p.x = v.x; p.y = v.y;
        } else if (m.a === "exit") {
          if (p.vent < 0) break;
          const cur = VENTS[p.vent];
          p.vent = -1; p.x = cur.x; p.y = cur.y;
        }
        this.sendTo(p, { t: "ventOk", v: p.vent, x: p.x, y: p.y });
        break;
      }
      case "sab": {
        if (this.phase !== "play" || !p.imp || !p.alive) break;
        if (this.sab || now() < this.sabReadyAt) break;
        const def = SABS[m.s];
        if (!def) break;
        this.sabReadyAt = now() + SAB_CD;
        this.sab = { type: m.s, ends: def.time ? now() + def.time : 0 };
        this.broadcast({ t: "sabOn", s: m.s, ends: this.sab.ends });
        break;
      }
      case "fixSab": {
        if (this.phase !== "play" || !p.alive || !this.sab || p.vent >= 0) break;
        const def = SABS[this.sab.type];
        if (dist(p, def.fx) > USE_RANGE + 60) break;
        this.sab = null;
        this.broadcast({ t: "sabOff" });
        break;
      }
      case "task": {
        if (this.phase !== "play" && this.phase !== "meeting") break;
        if (p.imp || !p.tasks.includes(m.sid) || p.done.has(m.sid)) break;
        p.done.add(m.sid);
        if (this.tasksDone() >= this.tasksTotal() && this.tasksTotal() > 0) this.gameOver("crew");
        break;
      }
      case "kill": {
        if (this.phase !== "play" || !p.imp || !p.alive || p.vent >= 0) break;
        const t = this.players.get(m.tid);
        if (!t || !t.alive || t.imp) break;
        if (dist(p, t) > KILL_RANGE + 60) break;
        if (now() - p.lastKill < KILL_CD - 2000) break;
        p.lastKill = now();
        t.alive = false;
        this.bodies.push({ x: t.x, y: t.y, color: t.color, id: t.id });
        p.x = t.x; p.y = t.y;
        this.sendTo(p, { t: "tp", x: t.x, y: t.y });
        this.checkWin();
        break;
      }
      case "report": {
        if (this.phase !== "play" || !p.alive || p.vent >= 0) break;
        const b = this.bodies.find(b => dist(p, b) < REPORT_RANGE + 60);
        if (b) this.startMeeting(p, this.players.get(b.id));
        break;
      }
      case "button":
        if (this.phase !== "play" || !p.alive || p.usedBtn || p.vent >= 0) break;
        if (this.sab && SABS[this.sab.type].time) break;   // no meetings mid-crisis
        if (dist(p, BUTTON) > BTN_RANGE + 60) break;
        p.usedBtn = true;
        this.startMeeting(p, null);
        break;
      case "vote": {
        const mt = this.meeting;
        if (this.phase !== "meeting" || !mt || mt.reveal || !p.alive) break;
        if (mt.votes[id] !== undefined) break;
        const valid = m.v === "skip" || (this.players.has(m.v) && this.players.get(m.v).alive);
        if (!valid) break;
        mt.votes[id] = m.v;
        if (this.aliveIds().every(aid => mt.votes[aid] !== undefined)) this.tally();
        break;
      }
      case "chat": {
        const text = String(m.text || "").slice(0, 120).trim();
        if (!text) break;
        const okPhase = this.phase === "lobby" || this.phase === "meeting" || this.phase === "end";
        if (!okPhase) break;
        const deadOnly = !p.alive && this.phase !== "end";
        const out = { t: "chat", name: p.name, color: p.color, text, dead: deadOnly };
        for (const q of this.players.values()) {
          if (deadOnly && q.alive) continue;
          this.sendTo(q, out);
        }
        break;
      }
      case "toLobby":
        if (id === Net.myId && this.phase === "end") this.backToLobby();
        break;
      case "startGame":
        if (id === Net.myId && this.phase === "lobby") this.startGame();
        break;
    }
  },

  // ---- game flow ----
  startGame() {
    const ps = [...this.players.values()];
    if (ps.length < 2) return;
    const nImp = ps.length >= 7 ? 2 : 1;
    const impIds = shuffle(ps.map(p => p.id)).slice(0, nImp);
    const spots = meetingSpots(ps.length);
    const stationIds = STATIONS.map(s => s.id);
    ps.forEach((p, i) => {
      p.alive = true; p.imp = impIds.includes(p.id);
      p.done = new Set(); p.usedBtn = false; p.lastKill = now() - KILL_CD + 15000;
      p.tasks = p.imp ? [] : shuffle(stationIds).slice(0, TASKS_PER);
      p.x = spots[i][0]; p.y = spots[i][1]; p.vent = -1;
    });
    this.bodies = []; this.meeting = null; this.phase = "play";
    this.sab = null; this.sabReadyAt = now() + 15000;
    for (const p of ps) {
      this.sendTo(p, {
        t: "start", role: p.imp ? "imp" : "crew",
        imps: p.imp ? impIds : [],
        tasks: p.tasks, total: this.tasksTotal(),
        x: p.x, y: p.y,
      });
    }
  },

  startMeeting(caller, victim) {
    this.bodies = [];
    this.sab = null;                       // a meeting clears any sabotage
    const ids = [...this.players.keys()];
    const spots = meetingSpots(ids.length);
    const pos = {};
    ids.forEach((id, i) => {
      const p = this.players.get(id);
      p.x = spots[i][0]; p.y = spots[i][1]; p.vent = -1;
      pos[id] = spots[i];
    });
    this.phase = "meeting";
    this.meeting = { ends: now() + VOTE_TIME, votes: {}, reveal: null };
    this.broadcast({
      t: "meeting", caller: caller.name, callerColor: caller.color,
      body: victim ? victim.name : null, ends: this.meeting.ends, pos,
    });
  },

  tally() {
    const mt = this.meeting;
    if (!mt || mt.reveal) return;
    const counts = {};
    let skips = 0;
    for (const v of Object.values(mt.votes)) {
      if (v === "skip") skips++;
      else counts[v] = (counts[v] || 0) + 1;
    }
    let best = null, bestN = 0, tie = false;
    for (const [tid, n] of Object.entries(counts)) {
      if (n > bestN) { best = tid; bestN = n; tie = false; }
      else if (n === bestN) tie = true;
    }
    let ejected = null;
    if (best && !tie && bestN > skips) ejected = this.players.get(best);
    if (ejected) ejected.alive = false;
    mt.reveal = true;
    this.broadcast({
      t: "ejected",
      id: ejected ? ejected.id : null,
      name: ejected ? ejected.name : null,
      wasImp: ejected ? ejected.imp : false,
      counts, skips, tie: !!(tie && bestN > 0),
      votes: mt.votes,
    });
    this.revealTimer = setTimeout(() => {
      this.meeting = null;
      if (!this.checkWin()) {
        this.phase = "play";
        this.sabReadyAt = now() + 10000;
        for (const p of this.players.values()) p.lastKill = now();
      }
    }, REVEAL_TIME);
  },

  checkWin() {
    if (this.phase === "lobby" || this.phase === "end") return false;
    const ps = [...this.players.values()];
    const impAlive = ps.filter(p => p.imp && p.alive).length;
    const crewAlive = ps.filter(p => !p.imp && p.alive).length;
    if (impAlive === 0) { this.gameOver("crew"); return true; }
    if (impAlive >= crewAlive) { this.gameOver("imp"); return true; }
    return false;
  },

  gameOver(winner) {
    this.phase = "end";
    this.meeting = null;
    clearTimeout(this.revealTimer);
    const imps = [...this.players.values()].filter(p => p.imp).map(p => ({ name: p.name, color: p.color }));
    this.broadcast({ t: "over", winner, imps });
  },

  backToLobby() {
    this.phase = "lobby";
    this.bodies = []; this.meeting = null; this.sab = null;
    for (const p of this.players.values()) {
      p.alive = true; p.imp = false; p.done = new Set(); p.tasks = [];
      p.x = BUTTON.x; p.y = BUTTON.y + 80; p.vent = -1;
    }
    this.broadcast({ t: "toLobby" });
    this.sendRoster();
  },

  dropPlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.sysChat(p.name + " disconnected");
    this.sendRoster();
    if (this.phase === "play" || this.phase === "meeting") {
      if (this.meeting && !this.meeting.reveal) {
        delete this.meeting.votes[id];
        if (this.aliveIds().every(aid => this.meeting.votes[aid] !== undefined) && this.aliveIds().length) this.tally();
      }
      if (!this.checkWin() && this.phase === "play" &&
          this.tasksTotal() > 0 && this.tasksDone() >= this.tasksTotal()) this.gameOver("crew");
    }
  },

  // ---- utilities ----
  aliveIds() { return [...this.players.values()].filter(p => p.alive).map(p => p.id); },
  tasksTotal() { let n = 0; for (const p of this.players.values()) n += p.tasks.length; return n; },
  tasksDone()  { let n = 0; for (const p of this.players.values()) n += p.done.size;  return n; },

  sendTo(p, m) {
    if (p.id === Net.myId) Client.onMsg(JSON.parse(JSON.stringify(m)));
    else if (p.conn && p.conn.open) p.conn.send(m);
  },
  broadcast(m) { for (const p of this.players.values()) this.sendTo(p, m); },
  sysChat(text) { this.broadcast({ t: "chat", sys: true, text }); },
  sendRoster() {
    this.broadcast({
      t: "roster", code: this.code, hostId: Net.myId,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })),
    });
  },

  tick() {
    // meeting timeout
    if (this.phase === "meeting" && this.meeting && !this.meeting.reveal && now() > this.meeting.ends) this.tally();
    // critical sabotage ran out — crew loses
    if (this.phase === "play" && this.sab && this.sab.ends && now() > this.sab.ends) {
      this.sab = null;
      this.gameOver("imp");
      return;
    }
    const mt = this.meeting;
    const rows = [...this.players.values()].map(p =>
      [p.id, Math.round(p.x), Math.round(p.y), p.dir, p.mv, p.alive ? 1 : 0, p.vent >= 0 ? 1 : 0]);
    const anyVented = rows.some(r => r[6]);
    const base = {
      t: "s", ph: this.phase,
      bd: this.bodies.map(b => [Math.round(b.x), Math.round(b.y), b.color]),
      tb: this.tasksTotal() ? this.tasksDone() / this.tasksTotal() : 0,
      mt: mt ? { e: mt.ends, v: Object.keys(mt.votes), r: mt.reveal ? 1 : 0 } : 0,
      sb: this.sab ? { t: this.sab.type, e: this.sab.ends } : 0,
      sr: this.sabReadyAt,
    };
    for (const q of this.players.values()) {
      // players inside a vent are invisible to the living crew
      const seesVented = q.imp || !q.alive;
      const pl = (!anyVented || seesVented) ? rows : rows.filter(r => !r[6] || r[0] === q.id);
      this.sendTo(q, Object.assign({ pl }, base));
    }
  },
};

// ============================================================
// CLIENT (runs on everyone, including the host)
// ============================================================
const Client = {
  screen: "home", phase: "lobby",
  roster: [], meta: {},           // id -> {name, color}
  me: { x: BUTTON.x, y: BUTTON.y + 80, dir: 1, mv: 0, alive: true },
  others: {},                     // id -> {x,y,tx,ty,dir,mv,alive}
  role: null, imps: [], tasks: [], doneSet: new Set(), taskbar: 0,
  bodies: [], meeting: null, killReadyAt: 0, usedBtn: false,
  modalOpen: false, lastPosSend: 0, votedFor: null, hostId: null,
  ventId: -1, sab: null, sabReadyAt: 0, ventedIds: [],

  enterLobby(code) {
    this.screen = "lobby";
    $("home").classList.add("hidden");
    $("lobby").classList.remove("hidden");
    $("lobbyCode").textContent = code;
    if (Net.isHost) $("startBtn").classList.remove("hidden");
  },

  onMsg(m) {
    if (!m) return;
    switch (m.t) {
      case "reject":
        homeError(m.reason);
        break;
      case "roster":
        this.roster = m.players;
        this.hostId = m.hostId;
        this.meta = {};
        for (const p of m.players) this.meta[p.id] = p;
        if (this.screen === "home") this.enterLobby(m.code);
        renderLobby();
        break;
      case "chat":
        addChat(m);
        break;
      case "start":
        this.startGame(m);
        break;
      case "tp":
        this.me.x = m.x; this.me.y = m.y;
        break;
      case "ventOk":
        this.ventId = m.v; this.me.x = m.x; this.me.y = m.y;
        renderVentPanel();
        break;
      case "sabOn":
        this.sab = { type: m.s, ends: m.ends };
        showSabBanner();
        break;
      case "sabOff":
        this.sab = null;
        showSabBanner();
        break;
      case "meeting":
        this.meeting = { ends: m.ends, voted: [], reveal: null };
        this.votedFor = null;
        if (m.pos[Net.myId]) { this.me.x = m.pos[Net.myId][0]; this.me.y = m.pos[Net.myId][1]; }
        closeTaskModal();
        openMeeting(m);
        break;
      case "ejected":
        if (this.meeting) this.meeting.reveal = m;
        showEjectResult(m);
        break;
      case "over":
        this.phase = "end";
        this.meeting = null;
        $("meetingOverlay").classList.add("hidden");
        closeTaskModal();
        showEnd(m);
        break;
      case "toLobby":
        this.resetToLobby();
        break;
      case "s":
        this.onSnapshot(m);
        break;
    }
  },

  startGame(m) {
    this.role = m.role; this.imps = m.imps || [];
    this.tasks = m.tasks; this.doneSet = new Set();
    this.me.x = m.x; this.me.y = m.y; this.me.alive = true;
    this.usedBtn = false; this.votedFor = null;
    this.killReadyAt = now() + 15000;
    this.bodies = []; this.meeting = null;
    this.others = {};
    this.ventId = -1; this.sab = null; this.sabReadyAt = now() + 15000;
    closeVentPanel(); closeSabMenu(); showSabBanner();
    $("sabBtn").classList.toggle("hidden", m.role !== "imp");
    $("ventBtn").classList.toggle("hidden", m.role !== "imp");
    this.screen = "game"; this.phase = "play";
    $("lobby").classList.add("hidden");
    $("endOverlay").classList.add("hidden");
    $("meetingOverlay").classList.add("hidden");
    $("gameWrap").classList.remove("hidden");
    applyViewport();
    buildTaskList();
    $("killBtn").classList.toggle("hidden", this.role !== "imp");
    $("buttonBtn").classList.remove("hidden");
    // role flash
    const rf = $("roleFlash"), tx = $("roleFlashText");
    if (this.role === "imp") {
      const mates = this.imps.filter(id => id !== Net.myId).map(id => (this.meta[id] || {}).name).filter(Boolean);
      tx.innerHTML = '<span class="impclr">IMPOSTOR</span><small>Eliminate the crew. Don\'t get caught.' +
        (mates.length ? " Partner: " + esc(mates.join(", ")) : "") + "</small>";
    } else {
      tx.innerHTML = '<span class="crewclr">CREWMATE</span><small>Finish your tasks. Find the impostor.</small>';
    }
    rf.classList.remove("hidden");
    rf.style.opacity = 1;
    setTimeout(() => { rf.style.opacity = 0; setTimeout(() => rf.classList.add("hidden"), 600); }, 2200);
  },

  onSnapshot(m) {
    const prevPhase = this.phase;
    this.phase = m.ph;
    if (prevPhase === "meeting" && m.ph === "play") {
      $("meetingOverlay").classList.add("hidden");
      this.meeting = null;
      if (this.role === "imp") this.killReadyAt = now() + KILL_CD;
    }
    this.taskbar = m.tb;
    this.bodies = m.bd.map(b => ({ x: b[0], y: b[1], color: b[2] }));
    if (m.mt && this.meeting) { this.meeting.voted = m.mt.v; this.meeting.ends = m.mt.e; }
    this.sabReadyAt = m.sr || 0;
    const sabWas = this.sab && this.sab.type;
    this.sab = m.sb ? { type: m.sb.t, ends: m.sb.e } : null;
    if ((this.sab && this.sab.type) !== sabWas) showSabBanner();
    const seen = new Set(), vented = [];
    for (const row of m.pl) {
      const [id, x, y, dir, mv, alive, inVent] = row;
      seen.add(id);
      if (inVent) vented.push(id);
      if (id === Net.myId) {
        const wasAlive = this.me.alive;
        this.me.alive = !!alive;
        if (wasAlive && !alive) { closeTaskModal(); closeVentPanel(); closeSabMenu(); }
        if (!inVent && this.ventId >= 0) { this.ventId = -1; closeVentPanel(); }
        continue;
      }
      let o = this.others[id];
      if (!o) o = this.others[id] = { x, y, tx: x, ty: y, dir, mv, alive: !!alive };
      o.tx = x; o.ty = y; o.dir = dir; o.mv = mv; o.alive = !!alive; o.vent = !!inVent;
      if (this.phase === "meeting") { o.x = x; o.y = y; }
    }
    this.ventedIds = vented;
    for (const id of Object.keys(this.others)) if (!seen.has(id)) delete this.others[id];
    if (this.screen === "game" && this.phase === "meeting") updateMeetingUI();
  },

  resetToLobby() {
    this.screen = "lobby"; this.phase = "lobby";
    this.role = null; this.tasks = []; this.doneSet = new Set();
    this.bodies = []; this.meeting = null; this.others = {};
    this.me.alive = true;
    this.ventId = -1; this.sab = null;
    closeVentPanel(); closeSabMenu(); showSabBanner();
    $("gameWrap").classList.add("hidden");
    $("endOverlay").classList.add("hidden");
    $("meetingOverlay").classList.add("hidden");
    $("lobby").classList.remove("hidden");
    renderLobby();
  },

  disconnected(msg) {
    if (this.screen === "home") { homeError(msg); return; }
    $("gameWrap").classList.remove("hidden");
    $("dcMsg").textContent = msg;
    $("dcOverlay").classList.remove("hidden");
  },
};

// ============================================================
// INPUT
// ============================================================
const keys = {};
window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  keys[e.key.toLowerCase()] = true;
  if (Client.screen !== "game") return;
  const k = e.key.toLowerCase();
  if (k === "e" || k === " ") { tryUse(); e.preventDefault(); }
  if (k === "q") tryKill();
  if (k === "r") tryReport();
  if (k === "f") tryVent();
  if (k === "x") toggleSabMenu();
  if (k === "escape") { closeTaskModal(); closeSabMenu(); }
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

// ---- virtual joystick (phones / tablets) ----
// Touch anywhere on the map: the stick appears under your finger; drag to move.
const JOY_R = 60;
const joy = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
function joyStart(e) {
  if (Client.screen !== "game") return;
  const r = cv.getBoundingClientRect();
  for (const t of e.changedTouches) {
    if (joy.active) continue;
    joy.active = true; joy.id = t.identifier;
    joy.bx = t.clientX - r.left; joy.by = t.clientY - r.top;
    joy.dx = 0; joy.dy = 0;
  }
  e.preventDefault();
}
function joyMove(e) {
  const r = cv.getBoundingClientRect();
  for (const t of e.changedTouches) {
    if (t.identifier !== joy.id) continue;
    let dx = (t.clientX - r.left) - joy.bx, dy = (t.clientY - r.top) - joy.by;
    const l = Math.hypot(dx, dy);
    if (l > JOY_R) { dx = dx / l * JOY_R; dy = dy / l * JOY_R; }
    joy.dx = dx / JOY_R; joy.dy = dy / JOY_R;
  }
  e.preventDefault();
}
function joyEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier !== joy.id) continue;
    joy.active = false; joy.id = -1; joy.dx = 0; joy.dy = 0;
  }
  e.preventDefault();
}

function moveDir() {
  if (joy.active && Math.hypot(joy.dx, joy.dy) > 0.18) {
    let dx = joy.dx, dy = joy.dy;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    return [dx, dy];
  }
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  const l = Math.hypot(dx, dy);
  return l ? [dx / l, dy / l] : [0, 0];
}

// nearest usable things (computed each frame for HUD)
function nearestStation() {
  let best = null, bd = USE_RANGE;
  for (const sid of Client.tasks) {
    if (Client.doneSet.has(sid)) continue;
    const s = STATIONS[sid];
    const d = dist(Client.me, s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function nearestVictim() {
  let best = null, bd = KILL_RANGE;
  for (const [id, o] of Object.entries(Client.others)) {
    if (!o.alive || Client.imps.includes(id)) continue;
    const d = dist(Client.me, o);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
function nearestBody() {
  let best = null, bd = REPORT_RANGE;
  for (const b of Client.bodies) {
    const d = dist(Client.me, b);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function nearestVent() {
  if (Client.role !== "imp") return null;
  let best = null, bd = VENT_RANGE;
  for (const v of VENTS) {
    const d = dist(Client.me, v);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
// the console that repairs the active sabotage, if we're standing at it
function sabFixHere() {
  if (!Client.sab || !Client.me.alive || Client.ventId >= 0) return null;
  const fx = SABS[Client.sab.type].fx;
  return dist(Client.me, fx) < USE_RANGE ? fx : null;
}

function tryUse() {
  if (Client.phase !== "play" || Client.modalOpen || Client.ventId >= 0) return;
  if (sabFixHere()) { Net.toHost({ t: "fixSab" }); return; }
  if (Client.role === "imp") { tryButton(); return; }
  const s = nearestStation();
  if (s) openTaskModal(s);
  else tryButton();
}

function tryVent() {
  if (Client.role !== "imp" || Client.phase !== "play" || !Client.me.alive) return;
  if (Client.ventId >= 0) { Net.toHost({ t: "vent", a: "exit", v: Client.ventId }); return; }
  const v = nearestVent();
  if (v) Net.toHost({ t: "vent", a: "enter", v: v.id });
}
function ventJump(id) { Net.toHost({ t: "vent", a: "move", v: id }); }
function tryButton() {
  if (Client.phase !== "play" || !Client.me.alive || Client.usedBtn) return;
  if (dist(Client.me, BUTTON) > BTN_RANGE) return;
  Client.usedBtn = true;
  Net.toHost({ t: "button" });
}
function tryKill() {
  if (Client.role !== "imp" || Client.phase !== "play" || !Client.me.alive) return;
  if (now() < Client.killReadyAt) return;
  const tid = nearestVictim();
  if (!tid) return;
  Client.killReadyAt = now() + KILL_CD;
  Net.toHost({ t: "kill", tid });
}
function tryReport() {
  if (Client.phase !== "play" || !Client.me.alive) return;
  if (nearestBody()) Net.toHost({ t: "report" });
}
$("useBtn").onclick = tryUse;
$("killBtn").onclick = tryKill;
$("reportBtn").onclick = tryReport;
$("buttonBtn").onclick = tryButton;
$("ventBtn").onclick = tryVent;
$("sabBtn").onclick = toggleSabMenu;
$("sabClose").onclick = closeSabMenu;

// ---- sabotage menu (impostor) ----
function toggleSabMenu() {
  if (Client.role !== "imp" || Client.phase !== "play" || !Client.me.alive) return;
  if (!$("sabModal").classList.contains("hidden")) { closeSabMenu(); return; }
  renderSabMenu();
  Client.modalOpen = true;
  $("sabModal").classList.remove("hidden");
}
function closeSabMenu() {
  if ($("sabModal").classList.contains("hidden")) return;
  Client.modalOpen = false;
  $("sabModal").classList.add("hidden");
}
function renderSabMenu() {
  const box = $("sabList");
  box.innerHTML = "";
  const cd = Math.max(0, Client.sabReadyAt - now());
  const blocked = Client.sab ? "A sabotage is already active." : cd > 0 ? "Recharging: " + Math.ceil(cd / 1000) + "s" : "";
  if (blocked) {
    const p = document.createElement("p");
    p.className = "sabnote";
    p.textContent = blocked;
    box.appendChild(p);
  }
  for (const [key, def] of Object.entries(SABS)) {
    const b = document.createElement("button");
    b.className = "sabopt" + (def.time ? " crit" : "");
    b.innerHTML = "<b>" + def.name + "</b><small>" + (def.time ? "Critical — crew must fix it in "
      + (def.time / 1000) + "s" : "Fixed at " + def.room) + "</small>";
    b.disabled = !!blocked;
    b.onclick = () => { Net.toHost({ t: "sab", s: key }); closeSabMenu(); };
    box.appendChild(b);
  }
}

// ---- vent panel ----
function renderVentPanel() {
  const panel = $("ventPanel");
  if (Client.ventId < 0) { closeVentPanel(); return; }
  const cur = VENTS[Client.ventId];
  panel.innerHTML = "";
  const label = document.createElement("div");
  label.className = "ventlabel";
  label.textContent = "In vent — " + roomAt(cur);
  panel.appendChild(label);
  for (const id of cur.links) {
    const b = document.createElement("button");
    b.textContent = "→ " + roomAt(VENTS[id]);
    b.onclick = () => ventJump(id);
    panel.appendChild(b);
  }
  const ex = document.createElement("button");
  ex.className = "ventexit";
  ex.textContent = "Climb out (F)";
  ex.onclick = tryVent;
  panel.appendChild(ex);
  panel.classList.remove("hidden");
}
function closeVentPanel() { $("ventPanel").classList.add("hidden"); }
function roomAt(pt) {
  for (const r of ROOMS) {
    if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return r.n;
  }
  return "Vent";
}

// ---- sabotage banner ----
function showSabBanner() {
  const el = $("sabBanner");
  if (!Client.sab) { el.classList.add("hidden"); $("taskPanel").classList.remove("commsdown"); return; }
  const def = SABS[Client.sab.type];
  el.classList.toggle("crit", !!def.time);
  el.classList.remove("hidden");
  $("taskPanel").classList.toggle("commsdown", Client.sab.type === "comms");
  updateSabBanner();
}
function updateSabBanner() {
  if (!Client.sab) return;
  const def = SABS[Client.sab.type];
  const left = def.time ? Math.max(0, Math.ceil((Client.sab.ends - now()) / 1000)) : 0;
  $("sabBanner").innerHTML = "<b>" + def.name.toUpperCase() + "</b>" +
    (def.time ? " <span class='sabclock'>" + left + "s</span>" : "") +
    "<small>Fix it in " + def.room + "</small>";
}

// ============================================================
// GAME LOOP + RENDERING
// ============================================================
const cv = $("cv"), ctx = cv.getContext("2d");
let visCv = document.createElement("canvas"), visCtx = visCv.getContext("2d");
let DPR = 1;
let curZoom = 1;   // world→CSS-pixel scale of the current frame
// Size the canvas from its OWN box — never from window.innerWidth. The two
// disagree whenever the visual viewport differs from the layout viewport
// (pinch/page zoom, mobile URL bars), which silently scaled the world and
// shoved the player into a corner.
function canvasCssSize() {
  const r = cv.getBoundingClientRect();
  return [Math.round(r.width), Math.round(r.height)];
}
function resizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const [cssW, cssH] = canvasCssSize();
  if (cssW < 2 || cssH < 2) return;          // hidden — keep what we have
  cv.width = visCv.width = Math.round(cssW * DPR);
  cv.height = visCv.height = Math.round(cssH * DPR);
}
// Pin the play area to the VISIBLE region, so a zoomed page or an overlapping
// URL bar can't push the map or the buttons off screen.
function applyViewport() {
  const vv = window.visualViewport, gw = $("gameWrap");
  gw.style.width = (vv ? vv.width : window.innerWidth) + "px";
  gw.style.height = (vv ? vv.height : window.innerHeight) + "px";
  gw.style.left = (vv ? vv.offsetLeft : 0) + "px";
  gw.style.top = (vv ? vv.offsetTop : 0) + "px";
  resizeCanvas();
}
window.addEventListener("resize", applyViewport);
window.addEventListener("orientationchange", () => setTimeout(applyViewport, 250));
if (window.visualViewport) {
  visualViewport.addEventListener("resize", applyViewport);
  visualViewport.addEventListener("scroll", applyViewport);
}
// iOS/Android don't always fire resize on rotation or URL-bar collapse, so
// re-check the backing size each frame (cheap; only acts when it changed).
function ensureCanvasSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const [cssW, cssH] = canvasCssSize();
  if (cssW < 2 || cssH < 2) return;
  if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) resizeCanvas();
}
applyViewport();
cv.addEventListener("touchstart", joyStart, { passive: false });
cv.addEventListener("touchmove", joyMove, { passive: false });
cv.addEventListener("touchend", joyEnd, { passive: false });
cv.addEventListener("touchcancel", joyEnd, { passive: false });

// starfield
const STARS = [];
(function () {
  let seed = 1234;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) STARS.push([rnd() * 3200 - 300, rnd() * 2400 - 300, rnd() * 1.6 + 0.4]);
})();

let lastT = now();
function frame() {
  requestAnimationFrame(frame);
  gameTick();
}
// rAF pauses in hidden/background tabs; this keeps the simulation and
// network updates alive (throttled) so the game doesn't freeze.
setInterval(() => { if (now() - lastT > 120) gameTick(); }, 100);
function gameTick() {
  const t = now(), dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  if (Client.screen !== "game") return;

  // ---- movement ----
  const canMove = Client.phase === "play" && !Client.modalOpen && Client.ventId < 0;
  if (canMove) {
    const [dx, dy] = moveDir();
    const me = Client.me;
    me.mv = (dx || dy) ? 1 : 0;
    if (dx) me.dir = dx > 0 ? 1 : -1;
    const ghost = !me.alive;
    const nx = clamp(me.x + dx * SPEED * dt, 40, 2560);
    const ny = clamp(me.y + dy * SPEED * dt, 40, 1760);
    if (ghost) { me.x = nx; me.y = ny; }
    else {
      if (canStand(nx, me.y)) me.x = nx;
      if (canStand(me.x, ny)) me.y = ny;
    }
  } else {
    Client.me.mv = 0;
  }
  if (t - Client.lastPosSend > SNAP_MS) {
    Client.lastPosSend = t;
    Net.toHost({ t: "pos", x: Math.round(Client.me.x), y: Math.round(Client.me.y), dir: Client.me.dir, mv: Client.me.mv });
  }

  // lerp others
  for (const o of Object.values(Client.others)) {
    const k = Math.min(1, dt * 12);
    o.x += (o.tx - o.x) * k;
    o.y += (o.ty - o.y) * k;
  }

  ensureCanvasSize();
  draw();
  updateHUD();
}
requestAnimationFrame(frame);

function draw() {
  const W = cv.width, H = cv.height;
  // Fairness: everyone sees the SAME amount of the ship regardless of screen
  // size. We zoom so the visible world area is constant — a big monitor just
  // renders it larger, a phone smaller, but nobody gets extra map to look at.
  // Letterbox only the excess: shrink the drawing box until its aspect ratio is
  // inside [AR_MIN, AR_MAX], then fit the constant world area into that box.
  let boxW = W, boxH = H;
  const ar = W / H;
  if (ar > AR_MAX) boxW = H * AR_MAX;
  else if (ar < AR_MIN) boxH = W / AR_MIN;
  const ox = (W - boxW) / 2, oy = (H - boxH) / 2;

  curZoom = clamp(Math.sqrt((boxW * boxH) / (VIEW_AREA * DPR * DPR)), 0.42, 5);
  const zoom = curZoom * DPR;
  const viewW = boxW / zoom, viewH = boxH / zoom;
  const camX = camClamp(Client.me.x, viewW, -200, 2800);
  const camY = camClamp(Client.me.y, viewH, -200, 2000);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#02030a";           // letterbox bars
  ctx.fillRect(0, 0, W, H);
  ctx.save();                          // clip so nothing spills into the bars
  ctx.beginPath(); ctx.rect(ox, oy, boxW, boxH); ctx.clip();
  ctx.fillStyle = "#05070f";
  ctx.fillRect(ox, oy, boxW, boxH);
  ctx.setTransform(zoom, 0, 0, zoom, ox - camX * zoom, oy - camY * zoom);

  // stars
  ctx.fillStyle = "#cfd8ef";
  for (const [sx, sy, sr] of STARS) {
    if (sx < camX - 10 || sx > camX + viewW + 10 || sy < camY - 10 || sy > camY + viewH + 10) continue;
    ctx.globalAlpha = 0.5 + sr * 0.3;
    ctx.fillRect(sx, sy, sr, sr);
  }
  ctx.globalAlpha = 1;

  // hull walls (union expanded), then floors
  ctx.fillStyle = "#39415f";
  for (const r of WALK) ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
  ctx.fillStyle = "#8f99b8";
  for (const r of WALK) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "#a4aec9";
  for (const r of ROOMS) ctx.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);

  // floor grid inside rooms
  ctx.strokeStyle = "#96a0bd";
  ctx.lineWidth = 1;
  for (const r of ROOMS) {
    ctx.beginPath();
    for (let gx = r.x + 60; gx < r.x + r.w; gx += 60) { ctx.moveTo(gx, r.y + 6); ctx.lineTo(gx, r.y + r.h - 6); }
    for (let gy = r.y + 60; gy < r.y + r.h; gy += 60) { ctx.moveTo(r.x + 6, gy); ctx.lineTo(r.x + r.w - 6, gy); }
    ctx.stroke();
  }

  // room labels
  ctx.fillStyle = "#5c6685";
  ctx.font = "700 22px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  for (const r of ROOMS) ctx.fillText(r.n, r.x + r.w / 2, r.y + 34);

  // emergency button
  ctx.beginPath();
  ctx.arc(BUTTON.x, BUTTON.y, 34, 0, 7);
  ctx.fillStyle = "#7c86a6"; ctx.fill();
  ctx.beginPath();
  ctx.arc(BUTTON.x, BUTTON.y, 22, 0, 7);
  ctx.fillStyle = "#d43a45"; ctx.fill();
  ctx.strokeStyle = "#5c0e17"; ctx.lineWidth = 3; ctx.stroke();

  // task stations
  for (const s of STATIONS) {
    const mine = Client.tasks.includes(s.id) && !Client.doneSet.has(s.id) && Client.role !== "imp";
    ctx.fillStyle = mine ? "#ffd166" : "#6d7794";
    ctx.strokeStyle = mine ? "#a87900" : "#4a5470";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(s.x - 22, s.y - 16, 44, 32, 6); else ctx.rect(s.x - 22, s.y - 16, 44, 32);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = mine ? "#7a5800" : "#39415f";
    ctx.fillRect(s.x - 14, s.y - 9, 28, 12);
    if (mine) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now() / 250);
      ctx.beginPath(); ctx.arc(s.x, s.y, 40, 0, 7);
      ctx.fillStyle = "#ffd166"; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // vents — impostors get them highlighted
  const impView = Client.role === "imp";
  for (const v of VENTS) drawVent(v, impView, Client.ventId === v.id);

  // active sabotage repair console
  if (Client.sab) {
    const fx = SABS[Client.sab.type].fx;
    const pulse = 0.4 + 0.3 * Math.sin(now() / 200);
    ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 52, 0, 7);
    ctx.fillStyle = "#ff4757"; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffd166"; ctx.strokeStyle = "#a83a00"; ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(fx.x - 24, fx.y - 18, 48, 36, 6); else ctx.rect(fx.x - 24, fx.y - 18, 48, 36);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#a83a00";
    ctx.font = "700 22px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
    ctx.fillText("!", fx.x, fx.y + 8);
  }

  // bodies
  for (const b of Client.bodies) drawBody(b);

  // players (others then me, ghosts filtered)
  const iAmDead = !Client.me.alive;
  const rows = [];
  for (const [id, o] of Object.entries(Client.others)) {
    if (!o.alive && !iAmDead) continue;   // living players can't see ghosts
    rows.push({ id, o });
  }
  rows.sort((a, b) => a.o.y - b.o.y);
  for (const { id, o } of rows) {
    const meta = Client.meta[id] || { color: "#888", name: "?" };
    if (o.vent) ctx.globalAlpha = 0.5;    // fellow impostor hiding in a vent
    drawBean(o.x, o.y, meta.color, o.dir, !o.alive, meta.name, o.mv);
    ctx.globalAlpha = 1;
  }
  const myMeta = Client.meta[Net.myId] || { color: "#fff", name: "me" };
  if (Client.ventId >= 0) ctx.globalAlpha = 0.55;
  drawBean(Client.me.x, Client.me.y, myMeta.color, Client.me.dir, iAmDead, myMeta.name, Client.me.mv);
  ctx.globalAlpha = 1;

  // vision fog (alive players during play only)
  if (Client.phase === "play" && Client.me.alive) {
    const dark = Client.sab && Client.sab.type === "lights" && Client.role !== "imp";
    const vr = Client.role === "imp" ? VISION_IMP : (dark ? VISION_DARK : VISION_CREW);
    visCtx.setTransform(1, 0, 0, 1, 0, 0);
    visCtx.clearRect(0, 0, W, H);
    visCtx.fillStyle = "rgba(4,7,16,0.93)";
    visCtx.fillRect(0, 0, W, H);
    // radius is a fixed WORLD distance, so sight range is identical on every device
    const px = ox + (Client.me.x - camX) * zoom, py = oy + (Client.me.y - camY) * zoom;
    const vrs = vr * zoom;
    const g = visCtx.createRadialGradient(px, py, vrs * 0.35, px, py, vrs);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    visCtx.globalCompositeOperation = "destination-out";
    visCtx.fillStyle = g;
    visCtx.beginPath(); visCtx.arc(px, py, vrs, 0, 7); visCtx.fill();
    visCtx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(visCv, 0, 0);
  }
  ctx.restore();                       // drop the letterbox clip
  // joystick lives in CSS-pixel screen space
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (joy.active) {
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(joy.bx, joy.by, JOY_R, 0, 7);
    ctx.fillStyle = "#cfd8ef"; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(joy.bx + joy.dx * JOY_R, joy.by + joy.dy * JOY_R, 26, 0, 7);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBean(x, y, color, dir, ghost, name, moving) {
  ctx.save();
  ctx.translate(x, y);
  if (ghost) ctx.globalAlpha = 0.45;
  const bob = moving ? Math.sin(now() / 90) * 3 : 0;
  ctx.translate(0, bob);
  if (dir < 0) ctx.scale(-1, 1);
  // shadow
  if (!ghost) {
    ctx.beginPath(); ctx.ellipse(0, 26 - bob, 22, 8, 0, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fill();
  }
  // backpack
  ctx.fillStyle = shade(color, -25);
  rr(-30, -14, 14, 30, 6); ctx.fill();
  // body
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 3;
  rr(-20, -30, 40, 56, 18); ctx.fill(); ctx.stroke();
  // legs gap
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(-4, 14, 8, 12);
  // visor
  ctx.fillStyle = ghost ? "#dfe9ff" : "#9fd8e8";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  rr(-2, -22, 24, 16, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  rr(6, -20, 12, 5, 3); ctx.fill();
  ctx.restore();
  // name — sized so it reads the same on a phone as on a monitor
  ctx.save();
  ctx.globalAlpha = ghost ? 0.5 : 1;
  ctx.font = "700 " + clamp(13 / curZoom, 11, 30).toFixed(1) + "px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#0b0f1e";
  ctx.fillText(name, x + 1, y - 40 + 1);
  ctx.fillStyle = ghost ? "#b9c3e0" : "#ffffff";
  ctx.fillText(name, x, y - 40);
  ctx.restore();
}
function drawVent(v, highlight, occupied) {
  ctx.save();
  ctx.translate(v.x, v.y);
  if (highlight) {
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(now() / 300);
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7);
    ctx.fillStyle = occupied ? "#ffd166" : "#ff4757"; ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#39415f";
  ctx.strokeStyle = "#1d2338";
  ctx.lineWidth = 3;
  rr(-26, -20, 52, 40, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#20263c";
  for (let i = 0; i < 4; i++) ctx.fillRect(-20, -14 + i * 9, 40, 5);
  ctx.restore();
}
function drawBody(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(-0.5);
  ctx.fillStyle = shade(b.color, -10);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3;
  rr(-20, -10, 40, 30, 12); ctx.fill(); ctx.stroke();
  // bone
  ctx.fillStyle = "#e8ecf7";
  ctx.fillRect(-4, -22, 8, 14);
  ctx.beginPath(); ctx.arc(-4, -24, 5, 0, 7); ctx.arc(4, -24, 5, 0, 7);
  ctx.fill();
  ctx.restore();
}
function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => clamp(c + amt * 2.55, 0, 255) | 0;
  return "rgb(" + f(n >> 16) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")";
}

// ============================================================
// HUD
// ============================================================
function buildTaskList() {
  const ul = $("taskList");
  ul.innerHTML = "";
  if (Client.role === "imp") {
    const li = document.createElement("li");
    li.className = "imp";
    li.textContent = "Sabotage: pretend to do tasks. Kill the crew.";
    ul.appendChild(li);
    return;
  }
  for (const sid of Client.tasks) {
    const s = STATIONS[sid];
    const li = document.createElement("li");
    li.id = "task-" + sid;
    li.textContent = s.room + ": " + s.n;
    ul.appendChild(li);
  }
}
function updateHUD() {
  $("taskBarInner").style.width = Math.round(Client.taskbar * 100) + "%";
  const play = Client.phase === "play";
  const alive = Client.me.alive;
  const vented = Client.ventId >= 0;

  const fix = sabFixHere();
  const st = nearestStation();
  $("useBtn").disabled = !(play && !Client.modalOpen && !vented && (fix || (Client.role !== "imp" && st)));
  $("useBtn").innerHTML = fix ? "FIX<small>E</small>" : "USE<small>E</small>";

  const bd = nearestBody();
  $("reportBtn").disabled = !(play && alive && !vented && bd);

  if (Client.role === "imp") {
    $("ventBtn").disabled = !(play && alive && (vented || nearestVent()));
    $("ventBtn").innerHTML = vented ? "EXIT<small>F</small>" : "VENT<small>F</small>";
    const cd = Math.max(0, Client.sabReadyAt - now());
    $("sabBtn").disabled = !(play && alive && !Client.sab && !cd);
    $("sabBtn").innerHTML = cd > 0 ? "SABO<small>" + Math.ceil(cd / 1000) + "s</small>" : "SABO<small>X</small>";
  }
  if (Client.sab && SABS[Client.sab.type].time) updateSabBanner();

  if (Client.role === "imp") {
    const cdLeft = Math.max(0, Client.killReadyAt - now());
    const victim = nearestVictim();
    $("killBtn").disabled = !(play && alive && !cdLeft && victim);
    $("killBtn").innerHTML = cdLeft > 0
      ? "KILL<small>" + Math.ceil(cdLeft / 1000) + "s</small>"
      : "KILL<small>Q</small>";
  }
  const nearBtn = dist(Client.me, BUTTON) < BTN_RANGE;
  const crisis = Client.sab && SABS[Client.sab.type].time;
  $("buttonBtn").disabled = !(play && alive && !Client.usedBtn && nearBtn && !vented && !crisis);
}

// ============================================================
// TASK MINIGAMES
// ============================================================
let activeStation = null;
function openTaskModal(s) {
  activeStation = s;
  Client.modalOpen = true;
  $("taskTitle").textContent = s.room + ": " + s.n;
  const area = $("taskArea");
  area.innerHTML = "";
  if (s.t === 0) buildHoldGame(area);
  else if (s.t === 1) buildWireGame(area);
  else buildCodeGame(area);
  $("taskModal").classList.remove("hidden");
}
function closeTaskModal() {
  activeStation = null;
  Client.modalOpen = false;
  $("taskModal").classList.add("hidden");
}
$("taskClose").onclick = closeTaskModal;

function completeTask() {
  if (!activeStation) return;
  const sid = activeStation.id;
  Client.doneSet.add(sid);
  const li = $("task-" + sid);
  if (li) li.classList.add("done");
  Net.toHost({ t: "task", sid });
  closeTaskModal();
}

function buildHoldGame(area) {
  area.innerHTML = '<p>Hold the button until the gauge is full.</p>' +
    '<button class="holdbtn" id="holdBtn">HOLD</button>' +
    '<div class="progress"><div id="holdProg"></div></div>';
  let prog = 0, holding = false, raf;
  const btn = $("holdBtn"), bar = $("holdProg");
  const step = () => {
    prog = holding ? Math.min(100, prog + 1.4) : Math.max(0, prog - 2);
    bar.style.width = prog + "%";
    if (prog >= 100) { completeTask(); return; }
    raf = requestAnimationFrame(step);
  };
  const down = e => { e.preventDefault(); holding = true; };
  const up = () => { holding = false; };
  btn.addEventListener("mousedown", down);
  btn.addEventListener("touchstart", down);
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
  raf = requestAnimationFrame(step);
}

function buildWireGame(area) {
  area.innerHTML = '<p>Connect each wire to its matching color.</p>';
  const wrap = document.createElement("div");
  wrap.className = "wirerow";
  const colors = ["#e63946", "#ffd166", "#4a6cf7", "#35d47a"];
  const left = document.createElement("div"), right = document.createElement("div");
  left.className = right.className = "wirecol";
  let sel = null, doneN = 0;
  colors.forEach(c => {
    const w = document.createElement("button");
    w.className = "wire"; w.style.background = c;
    w.onclick = () => {
      if (w.classList.contains("done")) return;
      document.querySelectorAll(".wire.sel").forEach(x => x.classList.remove("sel"));
      w.classList.add("sel"); sel = { el: w, c };
    };
    left.appendChild(w);
  });
  shuffle(colors).forEach(c => {
    const w = document.createElement("button");
    w.className = "wire"; w.style.background = c;
    w.onclick = () => {
      if (!sel || w.classList.contains("done")) return;
      if (sel.c === c) {
        sel.el.classList.remove("sel"); sel.el.classList.add("done");
        w.classList.add("done");
        sel = null;
        if (++doneN === 4) setTimeout(completeTask, 300);
      }
    };
    right.appendChild(w);
  });
  wrap.appendChild(left); wrap.appendChild(right);
  area.appendChild(wrap);
}

function buildCodeGame(area) {
  area.innerHTML = '<p>Press the pads in order: 1 → 5.</p>';
  const grid = document.createElement("div");
  grid.className = "codegrid";
  let next = 1;
  shuffle([1, 2, 3, 4, 5]).forEach(n => {
    const b = document.createElement("button");
    b.textContent = n;
    b.onclick = () => {
      if (n === next) {
        b.classList.add("hit");
        if (++next > 5) setTimeout(completeTask, 300);
      } else {
        next = 1;
        grid.querySelectorAll("button").forEach(x => x.classList.remove("hit"));
      }
    };
    grid.appendChild(b);
  });
  area.appendChild(grid);
}

// ============================================================
// MEETING UI
// ============================================================
function openMeeting(m) {
  $("meetingTitle").textContent = m.body
    ? m.caller + " found " + m.body + "'s body!"
    : m.caller + " called an emergency meeting";
  $("meetingResult").textContent = "";
  buildVoteCards();
  $("skipBtn").classList.remove("myvote");
  $("skipBtn").disabled = !Client.me.alive;
  $("meetChatLog").innerHTML = "";
  $("meetingOverlay").classList.remove("hidden");
}

function buildVoteCards() {
  const box = $("voteCards");
  box.innerHTML = "";
  for (const p of Client.roster) {
    const alive = p.id === Net.myId
      ? Client.me.alive
      : !Client.others[p.id] || Client.others[p.id].alive;
    const card = document.createElement("div");
    card.className = "vcard" + (alive ? "" : " deadcard");
    card.id = "vc-" + p.id;
    card.innerHTML = '<div class="dot" style="background:' + p.color + '"></div>' +
      "<span>" + esc(p.name) + (p.id === Net.myId ? " (you)" : "") + "</span>" +
      '<span class="votedchip hidden">voted</span><span class="cnt hidden"></span>';
    if (alive) card.onclick = () => castVote(p.id);
    box.appendChild(card);
  }
}
function castVote(v) {
  if (!Client.me.alive || Client.votedFor || !Client.meeting || Client.meeting.reveal) return;
  Client.votedFor = v;
  Net.toHost({ t: "vote", v });
  if (v === "skip") $("skipBtn").classList.add("myvote");
  else { const c = $("vc-" + v); if (c) c.classList.add("myvote"); }
}
$("skipBtn").onclick = () => castVote("skip");

function updateMeetingUI() {
  const mt = Client.meeting;
  if (!mt) return;
  const left = Math.max(0, Math.ceil((mt.ends - now()) / 1000));
  $("meetingTimer").textContent = mt.reveal ? "" : left + "s";
  for (const id of mt.voted || []) {
    const card = $("vc-" + id);
    if (card) card.querySelector(".votedchip").classList.remove("hidden");
  }
}

function showEjectResult(m) {
  // show vote counts
  for (const [tid, n] of Object.entries(m.counts || {})) {
    const card = $("vc-" + tid);
    if (card) {
      const c = card.querySelector(".cnt");
      c.textContent = n; c.classList.remove("hidden");
    }
  }
  let txt;
  if (m.id) txt = m.name + " was ejected. " + (m.wasImp ? "They WERE the Impostor." : "They were NOT the Impostor.");
  else if (m.tie) txt = "Tie vote — no one was ejected.";
  else txt = "No one was ejected (skipped).";
  $("meetingResult").textContent = txt;
  if (m.id === Net.myId) Client.me.alive = false;
}

// ============================================================
// END / CHAT / LOBBY UI
// ============================================================
function showEnd(m) {
  const win = m.winner === "crew";
  $("endTitle").textContent = win ? "CREW WINS" : "IMPOSTOR WINS";
  $("endTitle").className = win ? "crewclr" : "impclr";
  $("endSub").textContent = "Impostor" + (m.imps.length > 1 ? "s" : "") + ": " +
    m.imps.map(i => i.name).join(", ");
  $("lobbyReturnBtn").classList.toggle("hidden", !Net.isHost);
  $("endWait").classList.toggle("hidden", Net.isHost);
  $("endOverlay").classList.remove("hidden");
}
$("lobbyReturnBtn").onclick = () => Net.toHost({ t: "toLobby" });

function addChat(m) {
  const inMeeting = !$("meetingOverlay").classList.contains("hidden");
  const log = inMeeting ? $("meetChatLog") : $("lobbyChatLog");
  const div = document.createElement("div");
  if (m.sys) {
    div.className = "sys";
    div.textContent = m.text;
  } else {
    div.className = m.dead ? "dead" : "";
    div.innerHTML = "<b style='color:" + m.color + "'>" + esc(m.name) + (m.dead ? " (ghost)" : "") + ":</b> " + esc(m.text);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}
function wireChat(inputId, btnId) {
  const send = () => {
    const inp = $(inputId);
    const text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    Net.toHost({ t: "chat", text });
  };
  $(btnId).onclick = send;
  $(inputId).addEventListener("keydown", e => { if (e.key === "Enter") send(); });
}
wireChat("lobbyChatInput", "lobbyChatSend");
wireChat("meetChatInput", "meetChatSend");

function renderLobby() {
  const box = $("lobbyPlayers");
  box.innerHTML = "";
  for (const p of Client.roster) {
    const d = document.createElement("div");
    d.className = "pcard";
    d.innerHTML = '<div class="dot" style="background:' + p.color + '"></div>' +
      '<div class="nm">' + esc(p.name) + "</div>" +
      (p.id === Client.hostId ? '<div class="hosttag">HOST</div>' : "");
    box.appendChild(d);
  }
  if (Net.isHost) $("startBtn").disabled = Client.roster.length < 2;
}
$("startBtn").onclick = () => Net.toHost({ t: "startGame" });

// ============================================================
// HOME SCREEN
// ============================================================
function homeError(msg) {
  $("homeMsg").textContent = msg;
  $("createBtn").disabled = false;
  $("joinBtn").disabled = false;
}
function getName() {
  const n = $("nameInput").value.trim().slice(0, 12);
  if (!n) { homeError("Enter a name first."); return null; }
  return n;
}
$("createBtn").onclick = () => {
  const n = getName();
  if (!n) return;
  $("homeMsg").textContent = "Creating room…";
  $("createBtn").disabled = true; $("joinBtn").disabled = true;
  Net.hostRoom(n);
};
$("joinBtn").onclick = () => {
  const n = getName();
  if (!n) return;
  const code = $("codeInput").value.trim().toUpperCase();
  if (code.length !== 5) { homeError("Codes are 5 characters."); return; }
  $("homeMsg").textContent = "Joining " + code + "…";
  $("createBtn").disabled = true; $("joinBtn").disabled = true;
  Net.joinRoom(code, n);
};
$("codeInput").addEventListener("keydown", e => { if (e.key === "Enter") $("joinBtn").click(); });
$("nameInput").addEventListener("keydown", e => { if (e.key === "Enter") $("createBtn").click(); });
