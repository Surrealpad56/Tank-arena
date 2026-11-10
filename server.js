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

/* ───── Salle unique ───── */
const room = { cfg: null, hostId: null, players: new Map(), seq: 0 };   // players : id → { id, name, key, team, sock }
function publicPlayers() { return [...room.players.values()].map(p => ({ id: p.id, name: p.name, key: p.key, team: p.team })); }
function roomInfo() {
  const h = room.players.get(room.hostId);
  return { open: room.players.size > 0, cfg: room.cfg, host: h ? h.name : null, players: publicPlayers() };
}

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
  if (url === "/api/room") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }); return res.end(JSON.stringify(roomInfo())); }
  if (url === "/api/tunnel") {
    const local = isLocalReq(req);
    if (req.method === "POST" || req.method === "DELETE") {
      if (!local || req.headers["x-ta"] !== "1") { res.writeHead(403); return res.end("Interdit"); }
      if (req.method === "POST") startTunnel(); else stopTunnel();
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ state: tunnel.state, url: tunnel.url, error: tunnel.error, kind: tunnel.kind || (findCloudflared() ? "cloudflare" : "ssh"), canControl: local, lan: lanAddrs(), port: PORT }));
  }
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
const TEXT_EXT = new Set([".html", ".js", ".css", ".json", ".svg", ".gltf", ".obj", ".mtl", ".txt", ".md"]);
const fileCache = new Map();   // chemin → { mtime, size, etag, raw, gz, br }
function serveStatic(req, res, file) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end("Introuvable"); }
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
function broadcast(obj, exceptId) { const data = frame(0x1, Buffer.from(JSON.stringify(obj))); for (const p of room.players.values()) if (p.id !== exceptId && p.sock.writable) p.sock.write(data); }

server.on("upgrade", (req, sock) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") { sock.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  sock.setNoDelay(true);
  const client = { sock, buf: Buffer.alloc(0), id: null, frag: null };
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
  const gone = () => leave(client);
  sock.on("close", gone); sock.on("error", gone);
});

function leave(c) {
  if (!c.id || !room.players.has(c.id)) return;
  const id = c.id; room.players.delete(id); c.id = null;
  console.log("[-] " + id + " a quitté (" + room.players.size + " joueur(s))");
  if (!room.players.size) { room.cfg = null; room.hostId = null; console.log("    salle vide : fermée"); return; }
  if (room.hostId === id) { room.hostId = room.players.keys().next().value; broadcast({ t: "host", id: room.hostId }); }
  broadcast({ t: "leave", id });
}

function onMessage(c, m) {
  if (m.t === "join") {
    if (c.id) return;
    const id = "p" + (++room.seq), first = room.players.size === 0;
    if (first) { room.cfg = m.cfg || {}; room.hostId = id; }
    const cnt = { A: 0, B: 0 }; for (const p of room.players.values()) cnt[p.team]++;
    const team = cnt.A <= cnt.B ? "A" : "B";
    const name = String(m.name || "Joueur").slice(0, 16), key = String(m.key || "").slice(0, 60);
    c.id = id; room.players.set(id, { id, name, key, team, sock: c.sock });
    sendTo(c.sock, { t: "welcome", id, team, host: room.hostId === id, hostId: room.hostId, cfg: room.cfg, players: publicPlayers().filter(p => p.id !== id) });
    broadcast({ t: "join", p: { id, name, key, team } }, id);
    console.log("[+] " + name + " (" + id + ", équipe " + team + ", " + key + ")" + (first ? " — hôte" : "") + " — " + room.players.size + " joueur(s)");
    return;
  }
  if (!c.id) return;
  m.from = c.id;
  if (m.to) { const p = room.players.get(m.to); if (p) sendTo(p.sock, m); }
  else broadcast(m, c.id);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n  TankArena — serveur multijoueur local\n  ───────────────────────────────────");
  console.log("  Sur ce PC :        http://localhost:" + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === "IPv4" && !i.internal) console.log("  Pour vos amis :    http://" + i.address + ":" + PORT + "   (même wifi)");
  console.log("\n  Ouvrez l'adresse, choisissez « Multijoueur » dans Jouer, puis Déployer.\n  Ctrl+C pour arrêter.\n");
});
server.on("error", e => { console.error(e.code === "EADDRINUSE" ? "Le port " + PORT + " est déjà utilisé (PORT=3001 node server.js)." : e); process.exit(1); });
