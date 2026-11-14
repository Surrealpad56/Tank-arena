#!/usr/bin/env node
/* ==========================================================================
   SERVER.JS — Serveur multijoueur local de TankArena.
   Aucune dépendance : il suffit de Node.js (≥ 14).   Lancer :  node server.js
   • sert les fichiers du jeu (lobby.html, arena.html…) sur le port 3000,
   • relaie les parties en WebSocket (une seule salle),
   • GET /api/room renvoie l'état de la salle (le lobby l'utilise).
   Les amis ouvrent l'adresse affichée dans la console (même wifi).
   ========================================================================== */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), os = require("os"), zlib = require("zlib"), { spawn } = require("child_process");
const PORT = +process.env.PORT || 3000, ROOT = __dirname;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".obj": "text/plain", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".woff2": "font/woff2" };

/* ───── Salons multijoueur ─────
   Plusieurs salons en parallèle. Chaque salon a un HÔTE (celui qui l'a créé, transmissible) qui contrôle les
   options (carte, bots, score…), peut expulser, lancer la partie et décider de la règle des équipes :
     libre = chacun choisit son équipe · auto = équilibrage automatique · hôte = seul l'hôte place les joueurs.
   Identité : « cid » = identifiant secret du navigateur ; « mid » = identifiant public d'un membre du salon.
   Phases : lobby (préparation) → playing (les clients ouvrent arena.html et envoient « enter »). */
const ROOM_LIMIT = 24, OFFLINE_GRACE = 90000;
const rooms = new Map(), presence = new Map();
let roomSeq = 0, pidSeq = 0, midSeq = 0;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const DEF_CFG = { theme: "random", botsA: 0, botsB: 0, difficulty: "normal", scoreToWin: 10, respawnBots: true, maxPlayers: 8, teamMode: "free", caps: true, allowLate: true };
function sanitizeCfg(inp, base) {
  const c = Object.assign({}, base || DEF_CFG);
  if (!inp || typeof inp !== "object") return c;
  if (typeof inp.theme === "string" && (inp.theme === "random" || /^[a-z0-9_-]{1,24}$/i.test(inp.theme))) c.theme = inp.theme;
  const num = (k, lo, hi) => { if (inp[k] !== undefined && isFinite(+inp[k])) c[k] = Math.max(lo, Math.min(hi, Math.round(+inp[k]))); };
  num("botsA", 0, 8); num("botsB", 0, 8); num("scoreToWin", 3, 50); num("maxPlayers", 2, 12);
  if (["easy", "normal", "hard"].includes(inp.difficulty)) c.difficulty = inp.difficulty;
  if (["free", "auto", "host"].includes(inp.teamMode)) c.teamMode = inp.teamMode;
  for (const k of ["respawnBots", "caps", "allowLate"]) if (typeof inp[k] === "boolean") c[k] = inp[k];
  return c;
}
const teamCounts = r => { const c = { A: 0, B: 0 }; for (const m of r.members.values()) c[m.team]++; return c; };
const teamCap = r => Math.ceil(r.cfg.maxPlayers / 2);
const autoTeam = r => { const c = teamCounts(r); return c.A <= c.B ? "A" : "B"; };
const byMid = (r, mid) => { for (const m of r.members.values()) if (m.mid === mid) return m; return null; };
function findMemberRoom(cid) { for (const r of rooms.values()) { const m = r.members.get(cid); if (m) return [r, m]; } return [null, null]; }
const memberPub = (r, m) => ({ mid: m.mid, name: m.name, key: m.key, team: m.team, ready: m.ready, online: !!m.sock, inGame: !!m.inGame, host: m.cid === r.hostCid });
const roomPub = (r, full) => ({ id: r.id, name: r.name, locked: !!r.pass, state: r.state, round: r.round, cfg: r.cfg, members: [...r.members.values()].map(m => memberPub(r, m)), chat: full ? r.chat.slice(-40) : undefined });
function roomSummary(r) {
  const h = r.members.get(r.hostCid), c = teamCounts(r);
  return { id: r.id, name: r.name, locked: !!r.pass, state: r.state, host: h ? h.name : "?", players: r.members.size, online: [...r.members.values()].filter(m => m.sock).length, max: r.cfg.maxPlayers, theme: r.cfg.theme, botsA: r.cfg.botsA, botsB: r.cfg.botsB, teamMode: r.cfg.teamMode, a: c.A, b: c.B, difficulty: r.cfg.difficulty, score: r.cfg.scoreToWin, late: r.cfg.allowLate };
}
const gameCfg = r => ({ theme: r.cfg.theme, botsA: r.cfg.botsA, botsB: r.cfg.botsB, difficulty: r.cfg.difficulty, scoreToWin: r.cfg.scoreToWin, respawnBots: r.cfg.respawnBots, caps: r.cfg.caps });
function touchPresence(cid, name, c) { const p = presence.get(cid) || { cid }; p.name = name; p.seen = Date.now(); if (c) p.c = c; presence.set(cid, p); }
function lobbyOnline() {
  const out = [], now = Date.now();
  for (const p of presence.values()) {
    const live = p.c && p.c.sock && !p.c.sock.destroyed;
    if (!live && now - p.seen > 9000) continue;
    const [r, m] = findMemberRoom(p.cid);
    out.push({ name: p.name, room: r ? r.name : null, where: r ? (m.inGame ? "En partie" : "Dans un salon") : "Au QG", host: !!(r && r.hostCid === p.cid) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function lobbyInfo(cid, name) {
  if (cid) touchPresence(cid, clean(name, 16) || "Joueur");
  const list = [...rooms.values()].sort((a, b) => (a.state === "playing") - (b.state === "playing") || b.created - a.created).map(roomSummary);
  return { rooms: list, online: lobbyOnline(), uptime: Math.round(process.uptime()) };
}
/* envoi : chaque membre « au salon » reçoit l'état complet ; les membres en jeu ne reçoivent rien */
function pushRoom(r) { for (const m of r.members.values()) if (m.sock && !m.inGame) sendTo(m.sock, { t: "room", room: roomPub(r), you: m.mid }); }
function toRoom(r, obj, onlyGame) { const data = frame(0x1, Buffer.from(JSON.stringify(obj))); for (const m of r.members.values()) if (m.sock && m.sock.writable && (!onlyGame || m.inGame)) m.sock.write(data); }
function sysChat(r, text) { const e = { from: "", text, ts: Date.now(), sys: true }; r.chat.push(e); if (r.chat.length > 60) r.chat.shift(); toRoom(r, { t: "chat", m: e }); }
const errTo = (c, msg, fatal) => sendTo(c.sock, { t: "err", msg, fatal: !!fatal });
function nextHost(r) {
  let best = null; for (const m of r.members.values()) if (m.sock && (!best || m.joined < best.joined)) best = m;
  if (!best) for (const m of r.members.values()) if (!best || m.joined < best.joined) best = m;
  if (!best) return; r.hostCid = best.cid; sysChat(r, best.name + " est maintenant l'hôte du salon");
}
function removeMember(r, me, why) {
  r.members.delete(me.cid); if (me.pid) r.byPid.delete(me.pid);
  if (me.inGame) { toRoom(r, { t: "leave", id: me.pid }, true); if (r.simHostCid === me.cid) electSimHost(r); }
  if (me.sock) { if (why) sendTo(me.sock, { t: "kicked", why }); }
  if (!r.members.size) { rooms.delete(r.id); console.log("[salon] « " + r.name + " » fermé (vide)"); return; }
  if (r.hostCid === me.cid) nextHost(r);
  pushRoom(r);
}
function electSimHost(r) {
  let n = null; for (const m of r.members.values()) if (m.inGame && (!n || m.joined < n.joined)) n = m;
  r.simHostCid = n ? n.cid : null; if (n) toRoom(r, { t: "host", id: n.pid }, true);
}
function attach(c, r, me, inGame) { me.sock = c.sock; me.left = 0; me.inGame = inGame; c.room = r; c.me = me; c.inGame = inGame; }
function addMember(r, c, m, team) {
  const me = { cid: c.cid, mid: "m" + (++midSeq), name: c.name, key: clean(m.key, 60), team, ready: false, sock: c.sock, inGame: false, pid: null, left: 0, joined: Date.now() };
  r.members.set(c.cid, me); if (r.state === "playing") { me.pid = "p" + (++pidSeq); r.byPid.set(me.pid, me); }
  c.room = r; c.me = me; c.inGame = false; return me;
}
function leaveRoom(c) { const [r, me] = findMemberRoom(c.cid); if (!r) return; if (me.sock === c.sock) { c.room = null; c.me = null; c.inGame = false; } removeMember(r, me, null); }

setInterval(() => {                       // ménage : membres hors-ligne depuis trop longtemps, présences périmées
  const now = Date.now();
  for (const r of [...rooms.values()]) for (const m of [...r.members.values()]) if (!m.sock && m.left && now - m.left > OFFLINE_GRACE) removeMember(r, m, null);
  for (const [k, p] of presence) if (now - p.seen > 60000 && !(p.c && p.c.sock && !p.c.sock.destroyed)) presence.delete(k);
}, 5000).unref();

/* ───── Tunnel public (ssh → localhost.run), piloté depuis Réglages → Multijoueur ───── */
const tunnel = { state: "off", url: null, error: null, proc: null, timer: null, stopping: false };
const TUNNEL_RE = /https:\/\/([a-z0-9-]+)\.(?:lhr\.life|lhr\.rocks|localhost\.run)\b/gi;
function lanAddrs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push("http://" + i.address + ":" + PORT);
  return out;
}
/* Requête venant de ce PC et non relayée par le tunnel (le tunnel ajoute X-Forwarded-For) */
function isLocalReq(req) {
  const a = req.socket.remoteAddress || "";
  return (a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1") && !req.headers["x-forwarded-for"] && !req.headers["x-forwarded-host"];
}
function tunnelFail(msg) { clearTimeout(tunnel.timer); tunnel.state = "error"; tunnel.error = msg; tunnel.url = null; if (tunnel.proc) { tunnel.stopping = true; try { tunnel.proc.kill(); } catch (e) { } } }
/* Tunnel public. Si cloudflared (exe posé à côté de server.js) est présent, on l'utilise : plus rapide et
   sans ssh, ni compte, ni droits administrateur. Sinon repli sur ssh → localhost.run. */
const CF_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;
function findCloudflared() {
  for (const n of ["cloudflared-windows-amd64.exe", "cloudflared.exe", "cloudflared"]) { const p = path.join(ROOT, n); try { if (fs.statSync(p).isFile()) return p; } catch (e) { } }
  return null;
}
function startTunnel() {
  if (tunnel.proc) return;
  tunnel.state = "starting"; tunnel.url = null; tunnel.error = null; tunnel.stopping = false;
  const cf = findCloudflared(); tunnel.kind = cf ? "cloudflare" : "ssh";
  let proc;
  try {
    proc = cf ? spawn(cf, ["tunnel", "--no-autoupdate", "--url", "http://localhost:" + PORT], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
              : spawn("ssh", ["-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=30", "-o", "ExitOnForwardFailure=yes", "-R", "80:localhost:" + PORT, "nokey@localhost.run"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  }
  catch (e) { return tunnelFail("Impossible de lancer " + (cf ? "cloudflared" : "ssh") + " : " + (e.message || e)); }
  tunnel.proc = proc;
  let buf = "";
  const feed = d => {
    buf = (buf + d.toString()).slice(-4000);
    if (tunnel.state !== "starting") return;
    const RE = tunnel.kind === "cloudflare" ? CF_RE : TUNNEL_RE; RE.lastIndex = 0; let m;
    while ((m = RE.exec(buf))) if (tunnel.kind === "cloudflare" ? !/\/\/api\./i.test(m[0]) : !["admin", "docs", "www"].includes(m[1].toLowerCase())) { clearTimeout(tunnel.timer); tunnel.url = m[0]; tunnel.state = "on"; console.log("  Tunnel public :   " + m[0]); break; }
  };
  proc.stdout.on("data", feed); proc.stderr.on("data", feed);
  proc.on("error", e => { tunnel.proc = null; tunnelFail(e.code === "ENOENT" ? "La commande « ssh » est introuvable sur ce PC (Client OpenSSH non activé dans Windows). Posez cloudflared.exe à côté de server.js pour utiliser Cloudflare à la place." : "Erreur du tunnel : " + (e.message || e)); });
  proc.on("close", () => {
    clearTimeout(tunnel.timer); tunnel.proc = null;
    if (tunnel.state === "error") { tunnel.stopping = false; return; }      // message d'erreur déjà posé
    if (tunnel.stopping) { tunnel.stopping = false; if (tunnel.state !== "error") { tunnel.state = "off"; tunnel.url = null; } return; }
    const had = !!tunnel.url; tunnel.url = null; tunnel.state = "error";
    tunnel.error = had ? "Le tunnel s'est interrompu. Relancez-le." : "Impossible d'ouvrir le tunnel (pas d'accès à internet, ou " + (tunnel.kind === "cloudflare" ? "Cloudflare bloqué" : "ssh bloqué") + " sur ce réseau).";
  });
  tunnel.timer = setTimeout(() => { if (tunnel.state === "starting") tunnelFail("Délai dépassé : le service de tunnel ne répond pas."); }, 25000);
}
function stopTunnel() {
  clearTimeout(tunnel.timer);
  if (tunnel.proc) { tunnel.stopping = true; try { tunnel.proc.kill(); } catch (e) { } }
  tunnel.state = "off"; tunnel.url = null; tunnel.error = null;
}
process.on("exit", () => { if (tunnel.proc) try { tunnel.proc.kill(); } catch (e) { } });
process.on("SIGINT", () => process.exit(0));

/* ───── HTTP ───── */
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/api/lobby" || url === "/api/room") {      // liste des salons + joueurs en ligne (le lobby l'interroge toutes les ~2,5 s)
    const q = new URLSearchParams((req.url.split("?")[1]) || "");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify(lobbyInfo(clean(q.get("cid"), 40), q.get("name"))));
  }
  if (url === "/api/tunnel") {
    const local = isLocalReq(req);
    if (req.method === "POST" || req.method === "DELETE") {
      if (!local || req.headers["x-ta"] !== "1") { res.writeHead(403); return res.end("Interdit"); }
      if (req.method === "POST") startTunnel(); else stopTunnel();
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ state: tunnel.state, url: tunnel.url, error: tunnel.error, kind: tunnel.kind || (findCloudflared() ? "cloudflare" : "ssh"), canControl: local, lan: lanAddrs(), port: PORT }));
  }
  if (url === "/api/health") { const miss = missingFiles(); res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); return res.end(JSON.stringify({ ok: miss.length === 0, missing: miss, root: path.basename(ROOT) })); }
  if (url === "/") url = "/lobby.html";
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT) || /(^|[\\/])\.|node_modules/.test(path.relative(ROOT, file))) { res.writeHead(403); return res.end("Interdit"); }
  serveStatic(req, res, file);
});

/* ───── Fichiers statiques : compression + ETag + cache ─────
   Le tunnel (ssh / Cloudflare) est lent et chaque fichier coûte un aller-retour :
   on envoie donc les textes compressés (brotli/gzip, calculés UNE fois puis gardés en
   mémoire), on répond 304 si le navigateur a déjà la bonne version, et les visiteurs
   distants gardent les fichiers en cache 10 min (l'hôte, lui, revalide toujours). */
/* Contrôle d'installation : les pages HTML appellent des scripts / styles / modèles — tous présents ? */
function missingFiles() {
  const miss = new Set();
  for (const page of ["lobby.html", "arena.html", "editor.html"]) {
    let h; try { h = fs.readFileSync(path.join(ROOT, page), "utf8"); } catch (e) { miss.add(page); continue; }
    const re = /(?:src|href)="([^"#?]+)"/g; let m;
    while ((m = re.exec(h))) { const u = m[1]; if (/^(https?:|\/\/|data:|mailto:)/.test(u) || u.endsWith(".html")) continue; if (!fs.existsSync(path.join(ROOT, u)) && !fs.existsSync(path.join(ROOT, path.basename(u)))) miss.add(u); }
  }
  return [...miss].sort();
}
const TEXT_EXT = new Set([".html", ".js", ".css", ".json", ".svg", ".gltf", ".obj", ".mtl", ".txt", ".md"]);
const fileCache = new Map();   // chemin → { mtime, size, etag, raw, gz, br }
/* Dépôt « à plat » : si les fichiers ont été envoyés sans leurs dossiers (js/, css/, models/…),
   /js/net.js est servi depuis net.js à la racine. Les noms de fichiers du jeu sont tous uniques. */
const PRIVATE_FILES = new Set(["server.js", "package.json", "package-lock.json", "render.yaml", ".gitignore"]);
function flatFallback(file) {
  const b = path.basename(file), alt = path.join(ROOT, b);
  if (alt === file || b.startsWith(".") || PRIVATE_FILES.has(b.toLowerCase()) || b.toLowerCase().endsWith(".bat")) return null;
  try { if (fs.statSync(alt).isFile()) return alt; } catch (e) { }
  return null;
}
function serveStatic(req, res, file) {
  const bn = path.basename(file).toLowerCase();
  if (PRIVATE_FILES.has(bn) || bn.endsWith(".bat")) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Introuvable"); }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { const alt = flatFallback(file); if (alt) return serveStatic(req, res, alt); }
    if (e || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end("Fichier introuvable sur le serveur : " + path.relative(ROOT, file).replace(/\\/g, "/") + "\n\nLe dossier correspondant (js, css, models…) n'a probablement pas été envoyé avec le jeu.\nVérifiez la liste des fichiers du dépôt GitHub, ou ouvrez /api/health pour voir tout ce qui manque.");
    }
    const ext = path.extname(file).toLowerCase(), isText = TEXT_EXT.has(ext), type = MIME[ext] || "application/octet-stream";
    const etag = '"' + st.size.toString(36) + "-" + Math.round(st.mtimeMs).toString(36) + '"';
    const local = isLocalReq(req);
    const cc = local ? "no-cache" : (ext === ".html" ? "public, max-age=60" : "public, max-age=600");
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ETag: etag, "Cache-Control": cc }); return res.end(); }
    const head = { "Content-Type": type, "Cache-Control": cc, ETag: etag, Vary: "Accept-Encoding" };
    if (!isText || req.method === "HEAD") {          // binaires (modèles 3D, images) : envoi en flux
      head["Content-Length"] = st.size; res.writeHead(200, head);
      return req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
    }
    let c = fileCache.get(file);
    const send = () => {
      const ae = String(req.headers["accept-encoding"] || "");
      let body = c.raw, enc = null;
      if (c.size > 1024) {
        if (/\bbr\b/.test(ae) && c.br) { body = c.br; enc = "br"; } else if (/\bgzip\b/.test(ae) && c.gz) { body = c.gz; enc = "gzip"; }
      }
      if (enc) head["Content-Encoding"] = enc;
      head["Content-Length"] = body.length; res.writeHead(200, head); res.end(body);
    };
    if (c && c.etag === etag) return send();
    fs.readFile(file, (er, raw) => {
      if (er) { res.writeHead(500); return res.end("Erreur"); }
      c = { etag, size: raw.length, raw, gz: null, br: null };
      try { c.gz = zlib.gzipSync(raw, { level: 9 }); if (zlib.brotliCompressSync) c.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }); } catch (x) { }
      fileCache.set(file, c); send();
    });
  });
}

/* ───── WebSocket minimal (RFC 6455, texte uniquement) ───── */
function frame(op, payload) {
  const len = payload.length; let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
function sendTo(sock, obj) { if (sock && !sock.destroyed && sock.writable) sock.write(frame(0x1, Buffer.from(JSON.stringify(obj)))); }

server.on("upgrade", (req, sock) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") { sock.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  sock.setNoDelay(true);
  const client = { sock, buf: Buffer.alloc(0), cid: null, name: "Joueur", room: null, me: null, inGame: false, frag: null, lastChat: 0 };
  sock.on("data", d => {
    client.buf = Buffer.concat([client.buf, d]);
    for (; ;) {
      const b = client.buf; if (b.length < 2) return;
      const op = b[0] & 0x0f, fin = !!(b[0] & 0x80), masked = !!(b[1] & 0x80); let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) { sock.destroy(); return; }
      if (b.length < off + (masked ? 4 : 0) + len) return;
      let payload = b.slice(off + (masked ? 4 : 0), off + (masked ? 4 : 0) + len);
      if (masked) { const m = b.slice(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      client.buf = b.slice(off + (masked ? 4 : 0) + len);
      if (op === 0x8) { sock.end(frame(0x8, Buffer.alloc(0))); return; }
      if (op === 0x9) { sock.write(frame(0xA, payload)); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        client.frag = op === 0x1 ? payload : Buffer.concat([client.frag || Buffer.alloc(0), payload]);
        if (fin) { const txt = client.frag.toString("utf8"); client.frag = null; try { onMessage(client, JSON.parse(txt)); } catch (e) { /* message invalide ignoré */ } }
      }
    }
  });
  let closed = false; const gone = () => { if (closed) return; closed = true; onGone(client); };
  sock.on("close", gone); sock.on("error", gone);
});

function onGone(c) {
  const p = c.cid && presence.get(c.cid); if (p && p.c === c) p.c = null;
  const r = c.room, me = c.me; if (!r || !me || me.sock !== c.sock) return;
  me.sock = null; me.left = Date.now();
  if (me.inGame) {
    me.inGame = false; toRoom(r, { t: "leave", id: me.pid }, true);
    if (r.simHostCid === me.cid) electSimHost(r);
    if (r.state === "playing" && r.sawGame && ![...r.members.values()].some(x => x.inGame)) {   // tout le monde a quitté l'arène : retour au salon
      r.state = "lobby"; r.sawGame = false; r.simHostCid = null; for (const x of r.members.values()) { x.pid = null; x.ready = false; } r.byPid.clear();
      sysChat(r, "Partie terminée — retour au salon");
    }
  }
  pushRoom(r);
}

function onMessage(c, m) {
  const t = m.t, sock = c.sock;
  /* ── en jeu : relais entre les joueurs du salon ── */
  if (c.inGame && c.room && c.me) {
    const r = c.room;
    if (t === "s" || t === "shot" || t === "dead" || t === "resp" || t === "bots" || t === "chat" || t === "ev" || m.to !== undefined || t) {
      m.from = c.me.pid;
      if (m.to) { const x = r.byPid.get(m.to); if (x && x.sock && x.inGame) sendTo(x.sock, m); }
      else { const data = frame(0x1, Buffer.from(JSON.stringify(m))); for (const x of r.members.values()) if (x !== c.me && x.inGame && x.sock && x.sock.writable) x.sock.write(data); }
    }
    return;
  }
  /* ── identification ── */
  if (t === "hello") {
    c.cid = clean(m.cid, 40); c.name = clean(m.name, 16) || "Joueur"; if (!c.cid) return;
    touchPresence(c.cid, c.name, c);
    const [r, me] = findMemberRoom(c.cid);
    if (r && me) { attach(c, r, me, false); me.name = c.name; sendTo(sock, { t: "room", room: roomPub(r, true), you: me.mid }); pushRoom(r); }
    else sendTo(sock, { t: "hi" });
    return;
  }
  if (t === "enter" && !c.cid) { c.cid = clean(m.cid, 40); c.name = clean(m.name, 16) || "Joueur"; if (c.cid) touchPresence(c.cid, c.name, c); }
  if (!c.cid) return;
  if (m.name) { c.name = clean(m.name, 16) || c.name; if (c.me) c.me.name = c.name; }

  /* ── entrée en arène (page arena.html) ── */
  if (t === "enter") {
    const r = rooms.get(m.room), me = r && r.members.get(c.cid);
    if (!r || !me) return errTo(c, "Salon introuvable : retournez au QG et rejoignez-le à nouveau.", true);
    if (r.state !== "playing") return errTo(c, "La partie n'est pas lancée.", true);
    attach(c, r, me, true); me.name = c.name; r.sawGame = true;
    if (!me.pid) { me.pid = "p" + (++pidSeq); r.byPid.set(me.pid, me); }
    const sim = r.simHostCid && r.members.get(r.simHostCid);
    if (!sim || !sim.inGame || sim === me) r.simHostCid = c.cid;
    const others = [...r.members.values()].filter(x => x !== me && x.inGame).map(x => ({ id: x.pid, name: x.name, key: x.key, team: x.team }));
    sendTo(sock, { t: "welcome", id: me.pid, team: me.team, host: r.simHostCid === c.cid, hostId: r.members.get(r.simHostCid).pid, cfg: gameCfg(r), players: others });
    { const d = frame(0x1, Buffer.from(JSON.stringify({ t: "join", p: { id: me.pid, name: me.name, key: me.key, team: me.team } }))); for (const x of r.members.values()) if (x !== me && x.inGame && x.sock && x.sock.writable) x.sock.write(d); }
    console.log("[+] " + me.name + " en jeu dans « " + r.name + " » (équipe " + me.team + ")");
    return;
  }

  /* ── création / entrée / sortie ── */
  if (t === "create") {
    leaveRoom(c);
    if (rooms.size >= ROOM_LIMIT) return errTo(c, "Trop de salons ouverts sur ce serveur.");
    const r = { id: "r" + (++roomSeq), name: clean(m.rname, 24) || ("Salon de " + c.name), pass: clean(m.pass, 20), cfg: sanitizeCfg(m.cfg, DEF_CFG), hostCid: c.cid, simHostCid: null, sawGame: false, members: new Map(), byPid: new Map(), state: "lobby", created: Date.now(), chat: [], round: 0 };
    rooms.set(r.id, r); addMember(r, c, m, m.team === "B" ? "B" : "A");
    console.log("[salon] « " + r.name + " » créé par " + c.name);
    sysChat(r, c.name + " a créé le salon"); pushRoom(r); return;
  }
  if (t === "join") {
    const r = rooms.get(m.room); if (!r) return errTo(c, "Ce salon n'existe plus.");
    const known = r.members.get(c.cid); if (known) { attach(c, r, known, false); sendTo(sock, { t: "room", room: roomPub(r, true), you: known.mid }); pushRoom(r); return; }
    if (r.pass && r.pass !== clean(m.pass, 20)) return errTo(c, "Mot de passe incorrect.");
    if (r.members.size >= r.cfg.maxPlayers) return errTo(c, "Ce salon est plein.");
    if (r.state === "playing" && !r.cfg.allowLate) return errTo(c, "Partie en cours : l'hôte a désactivé l'entrée en cours de jeu.");
    leaveRoom(c);
    let team = autoTeam(r); if (r.cfg.teamMode === "free" && (m.team === "A" || m.team === "B") && teamCounts(r)[m.team] < teamCap(r)) team = m.team;
    addMember(r, c, m, team); sysChat(r, c.name + " a rejoint le salon (équipe " + team + ")");
    sendTo(sock, { t: "room", room: roomPub(r, true), you: c.me.mid }); pushRoom(r); return;
  }
  const r = c.room, me = c.me; if (!r || !me) return;
  const isHost = r.hostCid === c.cid;
  if (t === "leave") { leaveRoom(c); sendTo(sock, { t: "hi" }); return; }
  if (t === "ready") { me.ready = !!m.v; pushRoom(r); return; }
  if (t === "tank") { me.key = clean(m.key, 60); pushRoom(r); return; }
  if (t === "chat") {
    const now = Date.now(); if (now - c.lastChat < 400) return; c.lastChat = now;
    const text = clean(m.text, 200); if (!text) return;
    const e = { from: me.name, team: me.team, text, ts: now }; r.chat.push(e); if (r.chat.length > 60) r.chat.shift(); toRoom(r, { t: "chat", m: e }); return;
  }
  if (t === "team") {
    if (r.state === "playing") return errTo(c, "Partie en cours : les équipes ne peuvent plus changer.");
    const target = m.mid ? byMid(r, m.mid) : me; if (!target) return;
    if (m.team !== "A" && m.team !== "B") return;
    if (target !== me && !isHost) return errTo(c, "Seul l'hôte peut changer l'équipe d'un autre joueur.");
    if (!isHost && r.cfg.teamMode !== "free") return errTo(c, r.cfg.teamMode === "auto" ? "Les équipes sont automatiques : l'hôte les a verrouillées." : "Dans ce salon, seul l'hôte place les joueurs.");
    if (target.team === m.team) return;
    if (teamCounts(r)[m.team] >= teamCap(r)) return errTo(c, "L'équipe " + m.team + " est pleine (" + teamCap(r) + " joueurs max).");
    target.team = m.team; if (target !== me) target.ready = false; pushRoom(r); return;
  }
  /* ── réservé à l'hôte ── */
  if (t === "cfg" || t === "start" || t === "kick" || t === "host" || t === "reset" || t === "balance") {
    if (!isHost) return errTo(c, "Seul l'hôte (" + (r.members.get(r.hostCid) || {}).name + ") peut faire cela.");
    if (t === "cfg") {
      if (r.state === "playing") return errTo(c, "Partie en cours : les options sont figées jusqu'au retour au salon.");
      const before = JSON.stringify(r.cfg); r.cfg = sanitizeCfg(m.cfg, r.cfg); r.cfg.maxPlayers = Math.max(r.cfg.maxPlayers, r.members.size);
      if (m.rname !== undefined) r.name = clean(m.rname, 24) || r.name;
      if (m.pass !== undefined) r.pass = clean(m.pass, 20);
      if (JSON.stringify(r.cfg) !== before) for (const x of r.members.values()) if (x.cid !== r.hostCid) x.ready = false;
      pushRoom(r); return;
    }
    if (t === "balance") {                        // répartit les joueurs équitablement (ordre d'arrivée)
      if (r.state === "playing") return; let i = 0; for (const x of [...r.members.values()].sort((a, b) => a.joined - b.joined)) x.team = (i++ % 2) ? "B" : "A"; pushRoom(r); sysChat(r, "L'hôte a équilibré les équipes"); return;
    }
    if (t === "kick") {
      const target = byMid(r, m.mid); if (!target || target === me) return;
      sysChat(r, target.name + " a été expulsé par l'hôte"); removeMember(r, target, "Vous avez été expulsé du salon par l'hôte."); return;
    }
    if (t === "host") { const target = byMid(r, m.mid); if (!target || target === me) return; r.hostCid = target.cid; sysChat(r, c.name + " passe l'hôte à " + target.name); pushRoom(r); return; }
    if (t === "reset") { if (r.state !== "playing") return; r.state = "lobby"; r.sawGame = false; r.simHostCid = null; for (const x of r.members.values()) { x.pid = null; x.ready = false; } r.byPid.clear(); sysChat(r, "L'hôte a rouvert le salon"); pushRoom(r); return; }
    if (t === "start") {
      if (r.state !== "lobby") return;
      if (r.cfg.theme === "random") { if (typeof m.theme === "string" && /^[a-z0-9_-]{1,24}$/i.test(m.theme)) r.cfg.theme = m.theme; else return errTo(c, "Carte aléatoire non résolue."); }
      r.state = "playing"; r.round++; r.sawGame = false; r.simHostCid = null; r.byPid.clear();
      for (const x of r.members.values()) { x.pid = "p" + (++pidSeq); r.byPid.set(x.pid, x); x.ready = false; x.inGame = false; }
      console.log("[salon] « " + r.name + " » : partie lancée (" + r.members.size + " joueur(s))");
      sysChat(r, "La partie démarre !"); const data = { t: "start", room: roomPub(r), round: r.round };
      toRoom(r, data); return;
    }
  }
}

{ const miss = missingFiles(); if (miss.length) { console.error("\n  ⚠ INSTALLATION INCOMPLÈTE — " + miss.length + " fichier(s) manquant(s) :"); miss.slice(0, 25).forEach(f => console.error("     - " + f)); console.error("  → Les dossiers js, css et models doivent être présents à côté de server.js (sur GitHub, vérifiez qu'ils apparaissent dans la liste des fichiers).\n"); } }
server.listen(PORT, "0.0.0.0", () => {
  console.log("\n  TankArena — serveur multijoueur local\n  ───────────────────────────────────");
  console.log("  Sur ce PC :        http://localhost:" + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === "IPv4" && !i.internal) console.log("  Pour vos amis :    http://" + i.address + ":" + PORT + "   (même wifi)");
  console.log("\n  Ouvrez l'adresse, choisissez « Multijoueur » dans Jouer, puis Déployer.\n  Ctrl+C pour arrêter.\n");
});
server.on("error", e => { console.error(e.code === "EADDRINUSE" ? "Le port " + PORT + " est déjà utilisé (PORT=3001 node server.js)." : e); process.exit(1); });
