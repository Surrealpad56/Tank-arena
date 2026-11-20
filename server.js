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
const WEATHERS = ["auto", "clear", "cloudy", "rain", "storm", "snow", "fog", "sand"], TODS = ["auto", "dawn", "day", "dusk", "night"];
const DEF_CFG = { weather: "auto", tod: "auto", theme: "random", botsA: 0, botsB: 0, difficulty: "normal", scoreToWin: 10, respawnBots: true, maxPlayers: 8, teamMode: "free", caps: true, allowLate: true };
function sanitizeCfg(inp, base) {
  const c = Object.assign({}, base || DEF_CFG);
  if (!inp || typeof inp !== "object") return c;
  if (typeof inp.theme === "string" && (inp.theme === "random" || /^[a-z0-9_-]{1,24}$/i.test(inp.theme))) c.theme = inp.theme;
  const num = (k, lo, hi) => { if (inp[k] !== undefined && isFinite(+inp[k])) c[k] = Math.max(lo, Math.min(hi, Math.round(+inp[k]))); };
  num("botsA", 0, 8); num("botsB", 0, 8); num("scoreToWin", 3, 50); num("maxPlayers", 2, 12);
  if (["easy", "normal", "hard"].includes(inp.difficulty)) c.difficulty = inp.difficulty;
  if (["free", "auto", "host"].includes(inp.teamMode)) c.teamMode = inp.teamMode;
  if (WEATHERS.includes(inp.weather)) c.weather = inp.weather;
  if (TODS.includes(inp.tod)) c.tod = inp.tod;
  for (const k of ["respawnBots", "caps", "allowLate"]) if (typeof inp[k] === "boolean") c[k] = inp[k];
  return c;
}
const teamCounts = r => { const c = { A: 0, B: 0 }; for (const m of r.members.values()) c[m.team]++; return c; };
const teamCap = r => Math.ceil(r.cfg.maxPlayers / 2);
const autoTeam = r => { const c = teamCounts(r); return c.A <= c.B ? "A" : "B"; };
const byMid = (r, mid) => { for (const m of r.members.values()) if (m.mid === mid) return m; return null; };
function findMemberRoom(cid) { for (const r of rooms.values()) { const m = r.members.get(cid); if (m) return [r, m]; } return [null, null]; }
const memberPub = (r, m) => ({ mid: m.mid, acct: !!m.acct, name: m.name, key: m.key, team: m.team, ready: m.ready, online: !!m.sock, inGame: !!m.inGame, host: m.cid === r.hostCid });
const roomPub = (r, full) => ({ id: r.id, name: r.name, locked: !!r.pass, state: r.state, round: r.round, cfg: r.cfg, members: [...r.members.values()].map(m => memberPub(r, m)), chat: full ? r.chat.slice(-40) : undefined });
function roomSummary(r) {
  const h = r.members.get(r.hostCid), c = teamCounts(r);
  return { id: r.id, name: r.name, locked: !!r.pass, state: r.state, host: h ? h.name : "?", players: r.members.size, online: [...r.members.values()].filter(m => m.sock).length, max: r.cfg.maxPlayers, theme: r.cfg.theme, botsA: r.cfg.botsA, botsB: r.cfg.botsB, teamMode: r.cfg.teamMode, a: c.A, b: c.B, difficulty: r.cfg.difficulty, score: r.cfg.scoreToWin, late: r.cfg.allowLate };
}
const gameCfg = r => ({ theme: r.cfg.theme, botsA: r.cfg.botsA, botsB: r.cfg.botsB, difficulty: r.cfg.difficulty, scoreToWin: r.cfg.scoreToWin, respawnBots: r.cfg.respawnBots, caps: r.cfg.caps });
function touchPresence(cid, name, c, acct) { const p = presence.get(cid) || { cid }; if (acct) { p.acct = acct.low; p.name = acct.name; } else if (!p.acct) p.name = name; p.seen = Date.now(); if (c) p.c = c; presence.set(cid, p); }
function lobbyOnline() {
  const out = [], now = Date.now();
  for (const p of presence.values()) {
    const live = p.c && p.c.sock && !p.c.sock.destroyed;
    if (!live && now - p.seen > 9000) continue;
    const [r, m] = findMemberRoom(p.cid);
    out.push({ name: p.name, acct: !!p.acct, room: r ? r.name : null, where: r ? (m.inGame ? "En partie" : "Dans un salon") : "Au QG", host: !!(r && r.hostCid === p.cid) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function lobbyInfo(cid, name, acct) {
  if (cid) touchPresence(cid, clean(name, 16) || "Joueur", null, acct);
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
  const me = { cid: c.cid, mid: "m" + (++midSeq), name: c.name, acct: !!c.acct, key: clean(m.key, 60), team, ready: false, sock: c.sock, inGame: false, pid: null, left: 0, joined: Date.now() };
  r.members.set(c.cid, me); if (r.state === "playing") { me.pid = "p" + (++pidSeq); r.byPid.set(me.pid, me); }
  c.room = r; c.me = me; c.inGame = false; return me;
}
function leaveRoom(c) { const [r, me] = findMemberRoom(c.cid); if (!r) return; if (me.sock === c.sock) { c.room = null; c.me = null; c.inGame = false; } removeMember(r, me, null); }

setInterval(() => {                       // ménage : membres hors-ligne depuis trop longtemps, présences périmées
  const now = Date.now();
  for (const r of [...rooms.values()]) for (const m of [...r.members.values()]) if (!m.sock && m.left && now - m.left > OFFLINE_GRACE) removeMember(r, m, null);
  for (const [k, p] of presence) if (now - p.seen > 60000 && !(p.c && p.c.sock && !p.c.sock.destroyed)) presence.delete(k);
}, 5000).unref();

/* ───── Comptes, sauvegardes et amis ─────
   Stockage : Upstash Redis (gratuit) si UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN sont définies,
   sinon fichier data/db.json (OK en local ; sur Render gratuit le disque est effacé à chaque redémarrage).
   Données gardées : pseudo, mot de passe HACHÉ (scrypt), liste d'amis, sauvegarde de progression. Aucun e-mail.
   Clés : ta:u:<pseudo> (compte) · ta:s:<pseudo> (sauvegarde) · ta:t:<jeton> (session, 60 jours). */
const DATA_DIR = process.env.TA_DATA_DIR || path.join(ROOT, "data");
const UP_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, ""), UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const DB = (function () {
  const useUp = !!(UP_URL && UP_TOKEN && typeof fetch === "function"), cache = new Map(), file = path.join(DATA_DIR, "db.json");
  let fileData = null, saveT = null;
  async function up(cmd) {
    let r, j;
    try { r = await fetch(UP_URL, { method: "POST", headers: { Authorization: "Bearer " + UP_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmd) }); j = await r.json(); }
    catch (e) { const x = new Error("Base de données injoignable"); x.db = true; throw x; }
    if (!r.ok || j.error) { const x = new Error("Base de données : " + (j.error || "HTTP " + r.status)); x.db = true; throw x; }
    return j.result;
  }
  const loadFile = () => { if (fileData) return; try { fileData = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { fileData = {}; } };
  const writeNow = () => { if (!dirty) return; dirty = false; try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(fileData)); fs.renameSync(file + ".tmp", file); } catch (e) { console.error("[db] écriture impossible :", e.message); } };
  let dirty = false;
  const flush = () => { dirty = true; clearTimeout(saveT); saveT = setTimeout(writeNow, 300); };
  if (!useUp) for (const sg of ["SIGTERM", "SIGINT"]) process.on(sg, () => { writeNow(); process.exit(0); });   // arrêt (redéploiement Render, Ctrl+C) : on n'oublie aucune écriture
  process.on("exit", writeNow);
  return {
    kind: useUp ? "upstash" : "fichier",
    async get(k, nocache) { if (!nocache && cache.has(k)) return cache.get(k); let v; if (useUp) v = await up(["GET", k]); else { loadFile(); v = fileData[k] ?? null; } if (!nocache) cache.set(k, v); return v; },
    async set(k, v, ex, nocache) { if (!nocache) cache.set(k, v); if (useUp) await up(ex ? ["SET", k, v, "EX", ex] : ["SET", k, v]); else { loadFile(); fileData[k] = v; flush(); } },
    async del(k) { cache.delete(k); if (useUp) await up(["DEL", k]); else { loadFile(); delete fileData[k]; flush(); } }
  };
})();
if (DB.kind === "fichier") console.log("  Comptes : stockage dans " + path.join(DATA_DIR, "db.json") + "  (pour une sauvegarde durable en ligne, voir HEBERGER_GRATUITEMENT.md : Upstash)");
else console.log("  Comptes : stockage Upstash Redis ✔");

const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/, RESERVED = new Set(["admin", "administrateur", "moderateur", "modo", "serveur", "server", "system", "systeme", "invite", "guest", "root", "anthropic", "claude"]);
const SAVE_KEYS = /^(XP|XPEarned|SelectedTank|SelectedAmmo1|SelectedAmmo2|researchOrient|match_history|customTankDesigns|customTankActive|researched_.+|claimed_.+|camp_completed_.+|stat_.+)$/;
const SAVE_MAX = 380000, FRIENDS_MAX = 50, REQ_MAX = 30, SESSION_S = 60 * 86400;
const sessCache = new Map();                          // jeton → { n: pseudo (minuscules), e: expiration }
const hits = new Map();                               // limiteur : clé → [horodatages]
function limited(key, max, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); if (a.length >= max) { hits.set(key, a); return true; } a.push(now); hits.set(key, a); return false; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 3600000)) hits.delete(k); for (const [k, v] of sessCache) if (v.e < now) sessCache.delete(k); }, 600000).unref();
let chain = Promise.resolve();
const serial = fn => { const p = chain.then(fn); chain = p.catch(() => { }); return p; };      // modifications de comptes une par une (pas de course entre deux amis)
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? rej(e) : res(k)));
const ipOf = req => String((req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress || "?").trim();
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(obj)); };
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", c => { n += c.length; if (n > max) { reject(Object.assign(new Error("Corps trop gros"), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { reject(Object.assign(new Error("JSON invalide"), { code: 400 })); } });
    req.on("error", reject);
  });
}
const sessAcct = low => { const v = userCache.get(low); return v ? { low, name: v } : { low, name: low }; };
const userCache = new Map();
const getUser = async low => { const v = await DB.get("ta:u:" + low); const u = v ? JSON.parse(v) : null; if (u) userCache.set(low, u.name); return u; };
const putUser = u => DB.set("ta:u:" + u.name.toLowerCase(), JSON.stringify(u));
const pubUser = u => ({ name: u.name, created: u.created, last: u.last, friends: u.friends.length });
async function newSession(low) { const tok = crypto.randomBytes(32).toString("hex"), rec = { n: low, e: Date.now() + SESSION_S * 1000 }; sessCache.set(tok, rec); await DB.set("ta:t:" + tok, JSON.stringify(rec), SESSION_S); return tok; }
async function resolveToken(tok) {
  tok = String(tok || ""); if (!/^[a-f0-9]{64}$/.test(tok)) return null;
  let rec = sessCache.get(tok);
  if (!rec) { const v = await DB.get("ta:t:" + tok, true); if (!v) return null; try { rec = JSON.parse(v); } catch (e) { return null; } sessCache.set(tok, rec); }
  if (rec.e < Date.now()) { sessCache.delete(tok); return null; }
  return rec.n;
}
const bearer = req => { const h = String(req.headers.authorization || ""); return h.startsWith("Bearer ") ? h.slice(7).trim() : ""; };
const authNameSync = req => { const r = sessCache.get(bearer(req)); return r && r.e > Date.now() ? r.n : null; };
async function isRegistered(low) { try { return !!(await DB.get("ta:u:" + low)); } catch (e) { return false; } }

function friendView(low) {                            // état « en ligne » d'un compte d'après les présences
  for (const p of presence.values()) {
    if (p.acct !== low) continue; const live = p.c && p.c.sock && !p.c.sock.destroyed; if (!live && Date.now() - p.seen > 9000) continue;
    const [r, m] = findMemberRoom(p.cid);
    return { online: true, where: r ? (m.inGame ? "En partie" : "Dans un salon") : "Au QG", room: r ? { id: r.id, name: r.name, locked: !!r.pass, state: r.state, full: r.members.size >= r.cfg.maxPlayers } : null };
  }
  return { online: false, where: "Hors ligne", room: null };
}
async function friendsPayload(u) {
  const out = [];
  for (const low of u.friends) { const f = await getUser(low); if (f) out.push(Object.assign({ name: f.name, last: f.last }, friendView(low))); }
  out.sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
  const nm = async list => (await Promise.all(list.map(async l => { const f = await getUser(l); return f ? f.name : null; }))).filter(Boolean);
  return { friends: out, incoming: await nm(u.inReq), outgoing: await nm(u.outReq) };
}

const ACC_ROUTES = new Set(["/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/password", "/api/auth/delete", "/api/me", "/api/save", "/api/friends", "/api/friends/add", "/api/friends/respond", "/api/friends/remove"]);
function apiAccounts(req, res, url) {
  if (!ACC_ROUTES.has(url)) return false;
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Max-Age": "600" }); res.end(); return true; }
  handleAcc(req, res, url).catch(e => {
    if (e.code === 413) return json(res, 413, { error: "Données trop volumineuses." }); if (e.code === 400) return json(res, 400, { error: "Requête invalide." });
    console.error("[comptes]", e.message); json(res, e.db ? 503 : 500, { error: e.db ? "Le stockage des comptes est indisponible pour le moment. Réessayez dans un instant." : "Erreur du serveur." });
  });
  return true;
}
async function handleAcc(req, res, url) {
  const M = req.method, ip = ipOf(req);
  /* ── inscription / connexion (sans jeton) ── */
  if (url === "/api/auth/register" && M === "POST") {
    if (limited("reg:" + ip, 8, 3600000)) return json(res, 429, { error: "Trop d'inscriptions depuis cette connexion. Réessayez plus tard." });
    const b = await readBody(req, 2000), name = String(b.name || "").trim(), pass = String(b.pass || "");
    if (!NAME_RE.test(name)) return json(res, 400, { error: "Pseudo : 3 à 16 caractères (lettres, chiffres, - et _)." });
    if (RESERVED.has(name.toLowerCase())) return json(res, 400, { error: "Ce pseudo est réservé." });
    if (pass.length < 6 || pass.length > 100) return json(res, 400, { error: "Mot de passe : 6 caractères minimum." });
    const salt = crypto.randomBytes(16), hash = await scrypt(pass, salt);
    const r = await serial(async () => {
      if (await getUser(name.toLowerCase())) return null;
      const u = { name, salt: salt.toString("hex"), hash: hash.toString("hex"), created: Date.now(), last: Date.now(), friends: [], inReq: [], outReq: [], save: null };
      await putUser(u); return u;
    });
    if (!r) return json(res, 409, { error: "Ce pseudo est déjà pris." });
    console.log("[compte] créé : " + name); return json(res, 200, { token: await newSession(name.toLowerCase()), user: pubUser(r) });
  }
  if (url === "/api/auth/login" && M === "POST") {
    const b = await readBody(req, 2000), name = String(b.name || "").trim().toLowerCase(), pass = String(b.pass || "");
    if (limited("log:" + ip, 20, 600000) || limited("logn:" + name, 8, 600000)) return json(res, 429, { error: "Trop de tentatives. Réessayez dans quelques minutes." });
    const u = NAME_RE.test(name) ? await getUser(name) : null; let ok = false;
    if (u) { const h = await scrypt(pass, Buffer.from(u.salt, "hex")), ref = Buffer.from(u.hash, "hex"); ok = h.length === ref.length && crypto.timingSafeEqual(h, ref); } else await scrypt(pass, Buffer.alloc(16));
    if (!ok) return json(res, 401, { error: "Pseudo ou mot de passe incorrect." });
    u.last = Date.now(); await putUser(u); return json(res, 200, { token: await newSession(name), user: pubUser(u) });
  }
  /* ── tout le reste exige un jeton ── */
  const tok = bearer(req), low = await resolveToken(tok);
  if (!low) return json(res, 401, { error: "Session expirée : reconnectez-vous.", auth: false });
  const me = await getUser(low); if (!me) return json(res, 401, { error: "Compte introuvable.", auth: false });
  if (url === "/api/auth/logout" && M === "POST") { sessCache.delete(tok); await DB.del("ta:t:" + tok); return json(res, 200, { ok: true }); }
  if (url === "/api/me" && M === "GET") return json(res, 200, { user: pubUser(me), save: me.save, storage: DB.kind, persistent: DB.kind === "upstash" });
  if (url === "/api/auth/delete" && M === "POST") {                // suppression complète du compte et de ses données
    const b = await readBody(req, 2000), pass = String(b.pass || "");
    if (limited("del:" + low, 5, 600000)) return json(res, 429, { error: "Trop de tentatives." });
    const h = await scrypt(pass, Buffer.from(me.salt, "hex")), ref = Buffer.from(me.hash, "hex");
    if (!(h.length === ref.length && crypto.timingSafeEqual(h, ref))) return json(res, 401, { error: "Mot de passe incorrect." });
    await serial(async () => {
      const u = await getUser(low); if (!u) return;
      for (const o of new Set([...u.friends, ...u.inReq, ...u.outReq])) { const f = await getUser(o); if (!f) continue; for (const k of ["friends", "inReq", "outReq"]) { const i = f[k].indexOf(low); if (i >= 0) f[k].splice(i, 1); } await putUser(f); }
      await DB.del("ta:u:" + low); await DB.del("ta:s:" + low); userCache.delete(low);
    });
    sessCache.delete(tok); await DB.del("ta:t:" + tok); console.log("[compte] supprimé : " + me.name); return json(res, 200, { ok: true });
  }
  if (url === "/api/auth/password" && M === "POST") {
    const b = await readBody(req, 2000), old = String(b.old || ""), pass = String(b.pass || "");
    if (limited("pw:" + low, 6, 600000)) return json(res, 429, { error: "Trop de tentatives." });
    if (pass.length < 6 || pass.length > 100) return json(res, 400, { error: "Nouveau mot de passe : 6 caractères minimum." });
    const h = await scrypt(old, Buffer.from(me.salt, "hex")), ref = Buffer.from(me.hash, "hex");
    if (!(h.length === ref.length && crypto.timingSafeEqual(h, ref))) return json(res, 401, { error: "Mot de passe actuel incorrect." });
    const salt = crypto.randomBytes(16); me.salt = salt.toString("hex"); me.hash = (await scrypt(pass, salt)).toString("hex"); await serial(() => putUser(me)); return json(res, 200, { ok: true });
  }
  /* ── sauvegarde de progression ── */
  if (url === "/api/save" && M === "GET") { const v = await DB.get("ta:s:" + low, true); return json(res, 200, v ? JSON.parse(v) : { t: 0, data: null }); }
  if (url === "/api/save" && M === "PUT") {
    if (limited("sv:" + low, 40, 600000)) return json(res, 429, { error: "Trop de sauvegardes : patientez un instant." });
    const b = await readBody(req, 500000), data = b.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return json(res, 400, { error: "Sauvegarde invalide." });
    const clean2 = {}; let size = 0;
    for (const k of Object.keys(data)) { if (!SAVE_KEYS.test(k) || typeof data[k] !== "string") continue; size += k.length + data[k].length; if (size > SAVE_MAX) return json(res, 413, { error: "Sauvegarde trop volumineuse." }); clean2[k] = data[k]; }
    return json(res, 200, await serial(async () => {
      const cur = me.save, base = Number(b.base) || 0;
      if (cur && cur.t !== base && !b.force) return { conflict: true, server: cur };                   // un autre appareil a sauvegardé entre-temps
      const t = Date.now(), keys = Object.keys(clean2), xpe = Math.max(parseInt(clean2.XPEarned) || 0, parseInt(clean2.XP) || 0);
      me.save = { t, bytes: size, xp: parseInt(clean2.XP) || 0, xpe, res: keys.filter(k => k.startsWith("researched_")).length, tank: clean2.SelectedTank || "" };
      await DB.set("ta:s:" + low, JSON.stringify({ t, data: clean2 }), 0, true); await putUser(me);
      return { ok: true, t, save: me.save };
    }));
  }
  /* ── amis ── */
  if (url === "/api/friends" && M === "GET") return json(res, 200, await friendsPayload(me));
  if (M === "POST" && (url === "/api/friends/add" || url === "/api/friends/respond" || url === "/api/friends/remove")) {
    const b = await readBody(req, 1000), tl = String(b.name || "").trim().toLowerCase();
    if (!NAME_RE.test(tl) || tl === low) return json(res, 400, { error: "Pseudo invalide." });
    if (limited("fr:" + low, 60, 600000)) return json(res, 429, { error: "Trop d'actions : patientez un instant." });
    const r = await serial(async () => {
      const a = await getUser(low), t = await getUser(tl); if (!t) return { code: 404, error: "Aucun joueur nommé « " + String(b.name).slice(0, 16) + " »." };
      const rm = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); }, add = (arr, x) => { if (!arr.includes(x)) arr.push(x); };
      if (url === "/api/friends/add") {
        if (a.friends.includes(tl)) return { msg: "Déjà dans vos amis." };
        if (a.friends.length >= FRIENDS_MAX) return { code: 400, error: "Liste d'amis pleine (" + FRIENDS_MAX + ")." };
        if (a.inReq.includes(tl)) { rm(a.inReq, tl); rm(t.outReq, low); add(a.friends, tl); add(t.friends, low); await putUser(a); await putUser(t); return { msg: t.name + " est maintenant votre ami." }; }
        if (a.outReq.includes(tl)) return { msg: "Demande déjà envoyée." };
        if (a.outReq.length >= REQ_MAX || t.inReq.length >= REQ_MAX) return { code: 400, error: "Trop de demandes en attente." };
        add(a.outReq, tl); add(t.inReq, low); await putUser(a); await putUser(t); return { msg: "Demande envoyée à " + t.name + "." };
      }
      if (url === "/api/friends/respond") {
        if (!a.inReq.includes(tl)) return { code: 400, error: "Aucune demande de ce joueur." };
        rm(a.inReq, tl); rm(t.outReq, low); if (b.accept) { add(a.friends, tl); add(t.friends, low); }
        await putUser(a); await putUser(t); return { msg: b.accept ? t.name + " est maintenant votre ami." : "Demande refusée." };
      }
      rm(a.friends, tl); rm(t.friends, low); rm(a.outReq, tl); rm(t.inReq, low); rm(a.inReq, tl); rm(t.outReq, low); await putUser(a); await putUser(t); return { msg: "Ami retiré." };
    });
    if (r.error) return json(res, r.code || 400, { error: r.error });
    return json(res, 200, Object.assign({ msg: r.msg }, await friendsPayload(await getUser(low))));
  }
  return json(res, 404, { error: "Route inconnue." });
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
  if (url === "/api/lobby" || url === "/api/room") {      // liste des salons + joueurs en ligne (le lobby l'interroge toutes les ~2,5 s)
    const q = new URLSearchParams((req.url.split("?")[1]) || "");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization" });
    const an = authNameSync(req); return res.end(JSON.stringify(lobbyInfo(clean(q.get("cid"), 40), q.get("name"), an && sessAcct(an))));
  }
  if (apiAccounts(req, res, url)) return;
  if (url === "/api/tunnel") {
    const local = isLocalReq(req);
    if (req.method === "POST" || req.method === "DELETE") {
      if (!local || req.headers["x-ta"] !== "1") { res.writeHead(403); return res.end("Interdit"); }
      if (req.method === "POST") startTunnel(); else stopTunnel();
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ state: tunnel.state, url: tunnel.url, error: tunnel.error, kind: tunnel.kind || (findCloudflared() ? "cloudflare" : "ssh"), canControl: local, lan: lanAddrs(), port: PORT }));
  }
  if (url === "/api/health") { const miss = missingFiles(); res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); return res.end(JSON.stringify({ ok: miss.length === 0, missing: miss, root: path.basename(ROOT), accounts: DB.kind, persistent: DB.kind === "upstash" })); }
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

async function helloAsync(c, m) {
  const cid = clean(m.cid, 40); if (!cid) return; let name = clean(m.name, 16) || "Joueur", acct = null;
  if (m.token) { try { const low = await resolveToken(m.token); if (low) { const u = await getUser(low); if (u) acct = { low, name: u.name }; } } catch (e) { } }
  if (acct) name = acct.name; else if (await isRegistered(name.toLowerCase())) name = name.slice(0, 11) + " (inv.)";   // un invité ne peut pas usurper le pseudo d'un compte
  c.cid = cid; c.acct = acct ? acct.low : null; c.name = name; touchPresence(cid, name, c, acct);
  const [r, me] = findMemberRoom(cid);
  if (r && me) { attach(c, r, me, false); me.name = name; me.acct = !!acct; sendTo(c.sock, { t: "room", room: roomPub(r, true), you: me.mid }); pushRoom(r); }
  else sendTo(c.sock, { t: "hi", acct: acct ? acct.name : null });
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
  if (t === "hello") { c.helloP = helloAsync(c, m).catch(e => console.error("[hello]", e.message)).then(() => { c.helloP = null; }); return; }
  if (c.helloP) { c.helloP.then(() => onMessage(c, m)); return; }          // les messages suivants attendent la fin de l'identification
  if (t === "enter" && !c.cid) { c.cid = clean(m.cid, 40); c.name = "Joueur"; }
  if (!c.cid) return;

  /* ── entrée en arène (page arena.html) ── */
  if (t === "enter") {
    const r = rooms.get(m.room), me = r && r.members.get(c.cid);
    if (!r || !me) return errTo(c, "Salon introuvable : retournez au QG et rejoignez-le à nouveau.", true);
    if (r.state !== "playing") return errTo(c, "La partie n'est pas lancée.", true);
    attach(c, r, me, true); r.sawGame = true; c.name = me.name; { const p = presence.get(c.cid); if (p) { p.c = c; p.seen = Date.now(); } }
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
      if (r.cfg.weather === "auto" && WEATHERS.includes(m.weather) && m.weather !== "auto") r.cfg.weather = m.weather;       // « auto » résolu par l'hôte pour que tout le monde voie le même temps
      if (r.cfg.tod === "auto" && TODS.includes(m.tod) && m.tod !== "auto") r.cfg.tod = m.tod;
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
