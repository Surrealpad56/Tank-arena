/* ==========================================================================
   ACCOUNT.JS — Compte joueur, sauvegarde en ligne et amis (client).
   Chargé dans le lobby, l'arène et l'atelier.
   • Un compte = un pseudo + un mot de passe (aucun e-mail). La progression (XP, véhicules
     recherchés, statistiques, succès, chars de l'Atelier…) est copiée sur le serveur et se
     recharge sur n'importe quel ordinateur ou navigateur.
   • Synchronisation automatique : tout changement de progression est envoyé ~15 s plus tard
     (et à la fermeture de la page). Si un AUTRE appareil a sauvegardé entre-temps, le serveur
     refuse l'écrasement et le lobby propose de choisir (jamais de perte silencieuse).
   • Sans compte : exportation / importation d'un fichier de sauvegarde.
   ========================================================================== */
/* Texte affichable : on supprime purement les caractères de balisage afin que la valeur reste
   utilisable comme clé (MODE_NAME[mode], MAP_THEME_LABELS[map]) sans jamais devenir du HTML. */
const plainText = (v, n) => String(v == null ? "" : v).replace(/[&<>"']/g, "").slice(0, n);

const Account = (function () {
  "use strict";
  const L = localStorage;
  const PROG = /^(XP|XPEarned|SelectedTank|SelectedAmmo1|SelectedAmmo2|researchOrient|match_history|customTankDesigns|customTankActive|researched_.+|claimed_.+|camp_completed_.+|stat_.+)$/;
  const K = { token: "TaToken", user: "TaUser", synced: "TaSyncT", dirty: "TaDirty", owner: "TaOwner" };
  const A = { info: null, pending: null, state: "idle", error: null, listeners: [] };
  const rawSet = Storage.prototype.setItem, rawRm = Storage.prototype.removeItem;
  let applying = false, pushT = null, busy = false;

  const emit = () => A.listeners.forEach(f => { try { f(); } catch (e) { } });
  A.on = f => { A.listeners.push(f); };
  A.token = () => L.getItem(K.token) || "";
  A.name = () => { try { return (JSON.parse(L.getItem(K.user) || "null") || {}).name || null; } catch (e) { return null; } };
  A.loggedIn = () => !!A.token() && !!A.name();
  A.headers = () => A.token() ? { Authorization: "Bearer " + A.token() } : {};

  /* ───── Suivi des modifications de progression ───── */
  function mark(k) {
    if (applying || !PROG.test(k) || !A.loggedIn()) return;
    rawSet.call(L, K.dirty, "1"); clearTimeout(pushT); pushT = setTimeout(() => A.push(), 15000); emit();
  }
  Storage.prototype.setItem = function (k, v) { const old = this === L ? L.getItem(k) : null; rawSet.call(this, k, v); if (this === L && old !== String(v)) mark(k); };   // seulement si la valeur change vraiment
  Storage.prototype.removeItem = function (k) { const had = this === L && L.getItem(k) !== null; rawRm.call(this, k); if (had) mark(k); };
  const set = (k, v) => rawSet.call(L, k, v), rm = k => rawRm.call(L, k);

  /* Validation à la frontière fichier serveur ↔ DOM : une sauvegarde forgée ne doit jamais
     pouvoir injecter du HTML. Les structures complexes sont normalisées, pas seulement typées. */
  function sanitizeValue(k, v) {
    if (typeof v !== "string") return null;
    if (k === "match_history") {
      try {
        const a = JSON.parse(v); if (!Array.isArray(a)) return "[]";
        return JSON.stringify(a.slice(-30).filter(h => h && typeof h === "object").map(h => ({
          mode: plainText(h.mode, 40),
          map: plainText(h.map, 40),
          tank: plainText(h.tank, 60),
          result: plainText(h.result, 20),
          score: plainText(h.score, 40),
          kills: Number.isFinite(+h.kills) ? +h.kills : 0,
          xp: Number.isFinite(+h.xp) ? +h.xp : 0
        })));
      } catch (e) { return "[]"; }
    }
    if (k === "customTankDesigns") {
      try {
        const o = JSON.parse(v), out = {};
        if (!o || typeof o !== "object" || Array.isArray(o)) return "{}";
        // Copie structurée : on garde base/paint/tp/gp/meta/parts (sinon l'Atelier perd ses chars),
        // mais aucun texte importé ne survit avec des caractères de balisage.
        const cleanObj = (x, depth) => {
          if (x == null) return null;
          if (typeof x === "number") return Number.isFinite(x) ? x : 0;
          if (typeof x === "boolean") return x;
          if (typeof x === "string") return plainText(x, 500);
          if (depth > 5) return null;
          if (Array.isArray(x)) return x.slice(0, 300).map(y => cleanObj(y, depth + 1));
          if (typeof x !== "object") return null;
          const c = {}; let n = 0;
          for (const key of Object.keys(x)) { if (n++ > 60 || key.length > 60) continue; c[plainText(key, 60)] = cleanObj(x[key], depth + 1); }
          return c;
        };
        const pair = (x, fallback) => Array.isArray(x) && x.length >= 2 && x.slice(0, 2).every(y => Number.isFinite(+y)) ? [+x[0], +x[1]] : fallback;
        let bytes = 2;
        for (const id of Object.keys(o).slice(0, 200)) {
          if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !o[id] || typeof o[id] !== "object" || !Array.isArray(o[id].parts)) continue;
          const d = o[id];
          const design = {
            v: 1, id,
            name: plainText(d.name, 60) || "Char",
            base: /^[A-Za-z0-9_-]{1,40}$/i.test(String(d.base || "")) ? d.base : null,
            paint: cleanObj(d.paint || {}, 0),
            tp: pair(d.tp, [0, 2]), gp: pair(d.gp, [0, 0]),
            meta: cleanObj(d.meta || {}, 0),
            parts: d.parts.slice(0, 300).map(p => cleanObj(p, 0)).filter(Boolean),
            updated: Number.isFinite(+d.updated) ? +d.updated : 0
          };
          // Les pièces doivent rester dans un type connu, sinon l'éditeur peut tenter un rendu arbitraire.
          design.parts.forEach(p => { if (!/^[a-z0-9_-]{1,30}$/i.test(String(p.type || ""))) p.type = "box"; if (!["hull", "turret", "gun"].includes(p.grp)) p.grp = "hull"; });
          const s = JSON.stringify(design);
          if (bytes + s.length > 360000) break;
          bytes += s.length + 1; out[id] = design;
        }
        return JSON.stringify(out);
      } catch (e) { return "{}"; }
    }
    if (k === "customTankActive") {
      try {
        const o = JSON.parse(v), out = {};
        if (!o || typeof o !== "object" || Array.isArray(o)) return "{}";
        for (const key of Object.keys(o).slice(0, 60)) if (/^[A-Za-z0-9_-]{1,40}$/.test(String(o[key] || ""))) out[key.slice(0, 60)] = o[key];
        return JSON.stringify(out);
      } catch (e) { return "{}"; }
    }
    return v.slice(0, 380000);
  }
  A.sanitizeValue = sanitizeValue;   // utilisé aussi par l'Atelier pour les fichiers .tankdesign.json
  const collect = () => { const d = {}; for (let i = 0; i < L.length; i++) { const k = L.key(i); if (PROG.test(k)) { const v = sanitizeValue(k, L.getItem(k)); if (v !== null) d[k] = v; } } return d; };
  const metaOf = d => ({ xp: parseInt(d.XP) || 0, xpe: Math.max(parseInt(d.XPEarned) || 0, parseInt(d.XP) || 0), res: Object.keys(d).filter(k => k.startsWith("researched_")).length, tank: d.SelectedTank || "" });
  A.localMeta = () => { const d = collect(); const m = metaOf(d); m.has = m.xpe > 0 || m.res > 0 || Object.keys(d).some(k => k.startsWith("stat_")); m.bytes = JSON.stringify(d).length; return m; };
  A.isDirty = () => L.getItem(K.dirty) === "1";
  A.lastSync = () => parseInt(L.getItem(K.synced) || "0") || 0;

  /* ───── Appels serveur ───── */
  async function api(method, path, body, opts) {
    let r, j = {};
    try { r = await fetch(path, { method, headers: Object.assign({ "Content-Type": "application/json" }, A.headers()), body: body ? JSON.stringify(body) : undefined, keepalive: !!(opts && opts.keepalive) }); }
    catch (e) { throw Object.assign(new Error("Serveur injoignable."), { net: true }); }
    try { j = await r.json(); } catch (e) { }
    if (r.status === 401 && j.auth === false) { forget(); emit(); }
    if (!r.ok) throw Object.assign(new Error(j.error || "Erreur " + r.status), { status: r.status, body: j });
    return j;
  }
  A.api = api;
  function forget() { rm(K.token); rm(K.user); A.info = null; A.pending = null; }

  /* ───── Connexion / inscription / déconnexion ───── */
  async function enter(kind, name, pass) {
    const j = await api("POST", "/api/auth/" + kind, { name, pass });
    set(K.token, j.token); set(K.user, JSON.stringify({ name: j.user.name })); set("PlayerName", j.user.name);
    A.error = null; await A.refresh(); const d = await decide(j.user.name); emit(); return d;
  }
  A.login = (n, p) => enter("login", n, p);
  A.register = (n, p) => enter("register", n, p);
  A.refresh = async function () {
    if (!A.token()) { A.info = null; return null; }
    try { A.info = await api("GET", "/api/me"); set("PlayerName", A.info.user.name); } catch (e) { if (e.net) A.error = e.message; }
    emit(); return A.info;
  };
  A.logout = async function (wipe) {
    if (A.isDirty()) { try { await A.push(true); } catch (e) { } }
    try { await api("POST", "/api/auth/logout"); } catch (e) { }
    forget(); rm(K.synced); rm(K.dirty); rm(K.owner);
    if (wipe) { for (const k of Object.keys(collect())) rm(k); rm("PlayerName"); }
    emit();
  };

  /* ───── À la connexion : quelle sauvegarde garder ? ───── */
  async function decide(name) {
    const info = A.info, srv = info && info.save, loc = A.localMeta(), low = name.toLowerCase(), owner = L.getItem(K.owner);
    if (!srv) { if (loc.has) await A.push(true); set(K.owner, low); return { did: "pushed" }; }                       // compte neuf : on y copie ce PC
    if (!loc.has) { await A.pull(); return { did: "pulled", reload: true }; }                              // PC vierge : on charge le compte
    if (owner === low && String(A.lastSync()) === String(srv.t)) { if (A.isDirty()) await A.push(); return { did: "ok" }; }   // même lignée
    A.pending = { server: srv, local: loc, name }; return { did: "ask" };                                  // les deux ont de la progression différente
  }
  A.resolve = async function (choice) {
    const p = A.pending; if (!p) return; A.pending = null;
    if (choice === "server") { await A.pull(); emit(); return { reload: true }; }
    await A.push(true); set(K.owner, p.name.toLowerCase()); emit(); return { reload: false };
  };

  /* ───── Envoi / réception de la sauvegarde ───── */
  A.push = async function (force) {
    if (!A.loggedIn() || busy) return null; busy = true; A.state = "sending"; emit();
    try {
      const j = await api("PUT", "/api/save", { data: collect(), base: A.lastSync(), force: !!force });
      if (j.conflict) { A.pending = A.pending || { server: j.server, local: A.localMeta(), name: A.name() }; A.state = "conflict"; return j; }
      set(K.synced, String(j.t)); set(K.dirty, "0"); set(K.owner, A.name().toLowerCase()); A.state = "idle"; A.error = null;
      if (A.info) A.info.save = j.save; return j;
    } catch (e) { A.state = "error"; A.error = e.message; throw e; }
    finally { busy = false; emit(); }
  };
  A.pull = async function () {
    const j = await api("GET", "/api/save"); if (!j.data) return null;
    applying = true;
    try { for (const k of Object.keys(collect())) rm(k); for (const k of Object.keys(j.data)) { if (!PROG.test(k)) continue; const v = sanitizeValue(k, j.data[k]); if (v !== null) set(k, v); } set(K.synced, String(j.t)); set(K.dirty, "0"); set(K.owner, A.name().toLowerCase()); }
    finally { applying = false; }
    A.state = "idle"; A.pending = null; return j;
  };
  /* Sauvegarde dès que l'onglet passe en arrière-plan (requête normale, sans limite keepalive). */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && A.loggedIn() && A.isDirty()) A.push().catch(() => { });
  });
  /* Dernier recours à la fermeture : fetch keepalive (limite navigateur ~60 Ko). Si la
     sauvegarde est plus grosse, on laisse un avertissement visible au prochain chargement. */
  A.saveWarning = () => L.getItem("TaSaveWarn") || "";
  A.clearSaveWarning = () => rm("TaSaveWarn");
  window.addEventListener("pagehide", () => {
    if (!A.loggedIn() || !A.isDirty()) return; const data = collect(), body = JSON.stringify({ data, base: A.lastSync() });
    if (body.length >= 60000) { rawSet.call(L, "TaSaveWarn", "Sauvegarde trop volumineuse pour un envoi à la fermeture : elle sera envoyée au prochain changement d'onglet."); return; }
    rm("TaSaveWarn");
    try { fetch("/api/save", { method: "PUT", keepalive: true, headers: Object.assign({ "Content-Type": "application/json" }, A.headers()), body }); } catch (e) { }
  });

  /* ───── Sauvegarde manuelle par fichier (avec ou sans compte) ───── */
  A.exportFile = function () {
    const blob = new Blob([JSON.stringify({ v: 1, game: "tank-arena", name: A.name() || L.getItem("PlayerName") || "", at: Date.now(), data: collect() }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tank-arena-progression-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  A.importFile = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader(); r.onerror = () => reject(new Error("Lecture impossible")); r.onload = () => {
        try {
          const j = JSON.parse(r.result); if (!j || typeof j.data !== "object" || Array.isArray(j.data)) throw 0;
          applying = true; try {
            for (const k of Object.keys(collect())) rm(k);
            for (const k of Object.keys(j.data)) { if (!PROG.test(k)) continue; const v = sanitizeValue(k, j.data[k]); if (v !== null) set(k, v); }
          } finally { applying = false; }
          if (A.loggedIn()) { set(K.dirty, "1"); } resolve(metaOf(j.data));
        } catch (e) { reject(new Error("Fichier de sauvegarde invalide.")); }
      }; r.readAsText(file);
    });
  };

  /* ───── Amis ───── */
  A.friends = () => api("GET", "/api/friends");
  A.addFriend = name => api("POST", "/api/friends/add", { name });
  A.respondFriend = (name, accept) => api("POST", "/api/friends/respond", { name, accept: !!accept });
  A.removeFriend = name => api("POST", "/api/friends/remove", { name });
  A.changePassword = (old, pass) => api("POST", "/api/auth/password", { old, pass });
  A.deleteAccount = async function (pass, wipe) {
    await api("POST", "/api/auth/delete", { pass });
    forget(); rm(K.synced); rm(K.dirty); rm(K.owner); if (wipe) { for (const k of Object.keys(collect())) rm(k); rm("PlayerName"); } emit();
  };

  if (A.token()) A.refresh().then(() => { if (A.loggedIn() && A.isDirty()) A.push().catch(() => { }); });
  return A;
})();
