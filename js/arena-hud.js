/* ==========================================================================
   ARENA-HUD.JS — Interface de combat (DOM + quelques canvas) : score,
   boussole, minicarte, journal d'événements, viseur, marqueurs, véhicule,
   munitions, indicateurs de dégâts, écrans (chargement, pause, attente, fin).
   Aucune information codée en dur : tout est lu depuis l'état de la partie.
   ========================================================================== */
console.log("[TankArena] chargement : arena-hud.js");

const HUD = (function () {
  const $ = id => document.getElementById(id);
  const H = { shakeVal: 0, mini: null, miniT: 0, lastFeed: [], fpsAcc: 0, fpsN: 0, toastT: 0 };
  let el = {}, markerPool = [], cpts = null;

  const KEYS = [
    ["Avancer / reculer", "W S · ↑ ↓"], ["Tourner la caisse", "A D · ← →"], ["Rapport −/+", "Q · E"], ["Frein", "Espace"],
    ["Orienter canon et caméra", "Souris"], ["Tirer", "Clic gauche"], ["Mode visée (lunette)", "Clic droit · V"], ["Distance de caméra", "Molette"],
    ["Obus 1 / obus 2", "1 · 2"], ["Repérage actif", "T"], ["Réparer (à l'arrêt)", "R (maintenir)"], ["Carte agrandie", "M"],
    ["Pause / commandes", "Échap · H"], ...(ARENA_CFG.mode === "test" ? [["Réinitialiser l'essai", "K"]] : []), ["Verrouiller la souris", "Clic dans le jeu"]
  ];

  /* ───── Lunette : réticule gradué en milliradians (dessiné en pixels, selon le zoom et la taille d'écran) ───── */
  H.buildScope = function () {
    const svg = $("scope-ret"); if (!svg) return;
    const W = innerWidth, Hh = innerHeight, u = Math.min(W, Hh) / 100, lens = 37 * u;
    const mil = (Hh / 2) / Math.tan(degToRad(Cam.fovSniper) / 2) * 0.001;         // pixels par milliradian
    svg.setAttribute("viewBox", `${-W / 2} ${-Hh / 2} ${W} ${Hh}`);
    const L = [], S = (cls, d, w) => L.push(`<path class="${cls}" d="${d}" stroke-width="${w}"/>`);
    const both = (d, w) => { S("sh", d, w + 2.2); S("ln", d, w); };
    const g = 1.4 * u;                                                            // vide central
    // gros montants extérieurs
    both(`M${-lens} 0H${-g * 5}M${g * 5} 0H${lens}M0 ${lens}V${g * 5}`, 3);
    both(`M0 ${-lens}V${-g * 5}`, 2.2);
    // filets fins vers le centre
    both(`M${-g * 5} 0H${-g * .8}M${g * .8} 0H${g * 5}M0 ${-g * 5}V${-g * .8}M0 ${g * .8}V${g * 5}`, 1.2);
    // graduations : points tous les 1 mil, traits tous les 5 mil
    let ticks = "", dots = "", txt = "";
    const step = mil >= 6 ? 1 : mil >= 2.6 ? 2 : 5, bigEvery = mil >= 6 ? 5 : 10;      // lisible quel que soit le zoom / l'écran
    for (let m = step; m * mil < lens * .62; m += step) {
      const p = m * mil, big = m % bigEvery === 0, h = big ? 6 : 3;
      if (p < g * 1.4) continue;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1]]) {
        const x = sx * p, y = sy * p;
        ticks += sx ? `M${x} ${-h}V${h}` : `M${-h} ${y}H${h}`;
      }
      if (!big || m % (bigEvery * 2) !== 0) continue;
      txt += `<text x="${p - 6}" y="${-10}">${m}</text><text x="${-p - 6}" y="${-10}">${m}</text><text x="10" y="${p + 3}">${m}</text>`;
    }
    both(ticks, 1);
    // anneau central (couleur = état de pénétration) + point
    L.push(`<circle class="ring" r="${g * .62}" stroke-width="1.4"/>`, `<circle class="cdot" r="1.7"/>`);
    svg.innerHTML = L.join("") + txt;
    H._scopeW = W + "x" + Hh;
  };
  addEventListener("resize", () => { if (Cam && Cam.sniper) H.buildScope(); });

  H.init = function () {
    try {
      ["hud", "score", "sc-a", "sc-b", "sc-mode", "sc-obj", "compass", "minimap", "mini-theme", "fps", "feed", "aim", "gun-mark", "range", "penetration", "target-info", "scope", "sc-dist", "sc-el", "sc-ammo", "sc-zoom", "markers",
        "veh-name", "veh-cat", "orient", "spd", "gear", "eng-fill", "m-engine", "m-canon", "m-trackL", "m-trackR", "crew", "an1", "an2", "ap1", "ap2", "slot1", "slot2", "reload", "reload-fill",
        "veh", "veh-body", "veh-view", "light-move", "light-fire", "light-reload", "light-turret", "light-fireout", "dmg-out", "dmg-out-val", "rep", "rep-cv", "rep-title", "rep-sub", "rep-list", "rep-hits", "rep-stats", "reload-txt", "respawn", "respawn-txt", "toast", "hit-ring", "touch", "t-reload", "t-reload-fill", "t-reload-label", "loading", "ld-title", "ld-sub", "ld-fill", "ld-step", "pause", "wait", "end", "mini"].forEach(i => el[i] = $(i));
      { const d = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
        for (const k in el) { const e = el[k]; if (e && e.nodeType === 1) Object.defineProperty(e, "textContent", { configurable: true, get() { return d.get.call(this); }, set(v) { v = String(v); if (d.get.call(this) !== v) d.set.call(this, v); } }); } }
      el.cmp = el.compass ? el.compass.getContext("2d") : null; el.mm = el.minimap ? el.minimap.getContext("2d") : null; el.or = el.orient ? el.orient.getContext("2d") : null;
      $("keys-grid").innerHTML = KEYS.map(k => `<div><span>${k[0]}</span><span class="num">${k[1]}</span></div>`).join("");
      el["mini-theme"].textContent = MAP_THEME_LABELS[MAP_THEME] || MAP_THEME;
      el["ld-sub"].textContent = (MAP_THEME_LABELS[MAP_THEME] || MAP_THEME) + " · " + (MODE_LABEL[ARENA_CFG.mode] || "");
      el.fps.classList.toggle("hidden", !Settings.get("showFps"));
      if (mobileMode) document.body.classList.add("touch");
    } catch (e) {
      // DOM pas encore prêt : on retente dans 100 ms
      setTimeout(() => H.init(), 100);
    }
  };
  const MODE_LABEL = { sandbox: "Terrain d'entraînement", test: "Champ d'essai", skirmish: "Escarmouche", deathmatch: "Deathmatch", campaign: "Campagne", online: "En ligne", multi: "Multijoueur local" };

  /* ───── Chargement ───── */
  H.setLoading = function (p, text) { el["ld-fill"].style.width = Math.round(p * 100) + "%"; el["ld-step"].textContent = Math.round(p * 100) + " % — " + (text || ""); };
  H.hideLoading = function () { el.loading.classList.add("hidden"); el.hud.classList.remove("hidden"); if (mobileMode) el.touch.classList.remove("hidden"); };
  H.showLoading = function () { el.loading.classList.remove("hidden"); };

  /* ───── Écrans ───── */
  H.showPause = function (on) { el.pause.classList.toggle("hidden", !on); };
  H.showWait = function (title, html, onCancel) {
    el.wait.classList.remove("hidden"); $("wait-title").textContent = title; $("wait-body").innerHTML = html;
    $("b-wait-quit").onclick = onCancel || (() => location.href = "lobby.html");
  };
  H.updateWait = function (html) { $("wait-body").innerHTML = html; };
  H.hideWait = function () { el.wait.classList.add("hidden"); };
  H.toast = function (text, ms) { el.toast.textContent = text; el.toast.classList.remove("hidden"); H.toastT = ms || 2200; };
  H.showEnd = function (d) {
    const e = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const rows = (d.stats || []).map(s => `<div><span>${e(s[0])}</span><b class="num">${e(s[1])}</b></div>`).join("");
    el.end.innerHTML = `<div class="end-card cut ${d.win ? "win" : "loss"}"><h2>${e(d.title)}</h2><div class="end-sub">${e(d.sub)}</div>
      <div class="end-grid">${rows}</div>
      <div class="end-xp"><div><span class="disp" style="font-size:13px;letter-spacing:.14em;color:var(--dim)">Expérience gagnée</span><small>${e(d.xpNote || "")}</small></div><b class="num">+${(Number(d.xp) || 0).toLocaleString("fr-FR")} XP</b></div>
      <div class="pa-btns"><button class="btn primary disp" id="e-again">${e(d.again || "Rejouer")}</button><button class="btn disp" id="e-lobby">Retour au QG</button></div></div>`;
    el.end.classList.remove("hidden");
    $("e-again").onclick = () => d.onAgain ? d.onAgain() : location.reload(); $("e-lobby").onclick = () => location.href = "lobby.html";
    if (document.pointerLockElement) document.exitPointerLock();
  };
  H.shake = k => Cam.shake(k);

  /* ───── Journal & indicateurs ───── */
  function feed(cls, html) {
    const f = el.feed, d = document.createElement("div"); d.className = "fe " + cls; d.innerHTML = html; f.appendChild(d);
    while (f.children.length > 7) f.removeChild(f.firstChild);
    setTimeout(() => d.classList.add("old"), 6500); setTimeout(() => d.remove(), 7200);
  }
  H.feed = feed;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  H.event = function (type, detail, bearing, outgoing) {
    const d = esc(detail || "");
    switch (type) {
      case "ricochet": feed("ric", `<b>${outgoing ? "Ricochet" : "Ricochet !"}</b>${d}`); break;
      case "ricochet-out": feed("ric", `<b>Ricochet</b>${d}`); break;
      case "penetration": feed(outgoing ? "out" : "pen", `<b>${outgoing ? "Perforation" : "Perforé"}</b>${d}`); break;
      case "blocked": feed("blk", `<b>${outgoing ? "Arrêté" : "Encaissé"}</b>${d}`); break;
      case "spall": feed("pen", `<b>Éclats</b>${d}`); break;
      case "module": feed("mod", `<b>Module</b>${d}`); break;
      case "fire": feed("pen", `<b>Incendie</b>${d}`); break;
      case "fire-out": feed("sys", `<b>Incendie</b>${d}`); break;
      case "canon": feed("mod", `<b>Canon</b>endommagé`); break;
      case "engine": feed("mod", `<b>Moteur</b>endommagé`); break;
      case "track": feed("mod", `<b>Chenille</b>${d || "touchée"}`); break;
      case "crew": feed("mod", `<b>Équipage</b>${d}`); break;
      case "ammo": feed("pen", `<b>Soute</b>${d}`); break;
      case "killed": feed("pen", `<b>Détruit</b>`); break;
      case "capture": feed("sys", `<b>Zone</b>${d}`); break;
      case "spot": feed("sys", `<b>Repérage</b>${d}`); break;
      case "kill": feed("kill", d); break;
      default: feed("sys", d);
    }
    if (bearing !== null && bearing !== undefined && (type === "penetration" || type === "blocked" || type === "ricochet" || type === "spall") && !outgoing) hitArrow(bearing, false);
    else if (outgoing && (type === "penetration")) hitMarker();
  };
  function hitArrow(bearing, mine) {
    const a = document.createElement("div"); a.className = "hit-arrow" + (mine ? " mine" : "");
    a.style.transform = `rotate(${wrapAngle(bearing - Cam.yaw)}rad)`; el["hit-ring"].appendChild(a); setTimeout(() => a.remove(), 1500);
  }
  function hitMarker() { const g = el.aim; g.style.transform = "scale(1.35)"; setTimeout(() => g.style.transform = "", 120); }
  H.onPlayerDestroyed = function (killer) {
    el.respawn.classList.remove("hidden");
    $("respawn").querySelector(".rt").textContent = "Véhicule détruit";
    if (killer && killer !== localTank) feed("pen", `<b>Détruit par</b>${esc(killer._playerName || killer._tankKey || "l'ennemi")}`);
  };
  H.setRespawn = function (txt) { if (txt === null) el.respawn.classList.add("hidden"); else { el.respawn.classList.remove("hidden"); el["respawn-txt"].textContent = txt; } };

  /* ───── Système d'affichage des dégâts (subis + infligés) ───── */
  const DMG_MAX_IN = 8, DMG_MAX_OUT = 10;
  let incomingHits = [], outgoingHits = [];
  let outgoingStats = { dmg: 0, pen: 0, kills: 0 };
  let rep = null;
  const OUT = { ricochet: "Ricochet", blocked: "Arrêté", pen: "Perforation", spall: "Éclats", overmatch: "Overmatch" };


  /* Ajoute un impact subi (appelé par le moteur de dégâts quand le joueur est touché) */
  H.reportIncoming = function (r) {
    incomingHits.unshift({
      t: performance.now(), res: r.outcome, shell: r.shell || "", zone: r.zone || "",
      dir: r.dir || 0, dmg: r.changes ? r.changes.reduce((s, c) => s + (1 - c.to), 0) : 0,
      dead: r.detonated || false
    });
    if (incomingHits.length > DMG_MAX_IN) incomingHits.pop();
    if (r.outcome === "penetration" || r.outcome === "blocked" || r.outcome === "ricochet" || r.outcome === "spall") {
      const bearing = typeof r.dir === "number" ? r.dir : 0;
      hitArrow(bearing, false);
    }
    if (r.detonated) feed("pen", `<b>Détonation de la soute !</b>`);
    else if (r.fire) feed("pen", `<b>Incendie déclenché</b>`);
    refreshDamageUI();
  };

  /* Ajoute un tir infligé (appelé quand le joueur touche un ennemi) */
  H.reportOutgoing = function (r) {
    const t = r.tank;
    const isKill = r.detonated || (t && t.destroyed);
    if (isKill) outgoingStats.kills++;
    if (r.outcome === "penetration" || r.outcome === "spall" || r.outcome === "overmatch") outgoingStats.pen++;
    const dmg = r.dmg !== undefined ? r.dmg : (r.changes ? r.changes.reduce((s, c) => s + (1 - c.to), 0) : 0);
    outgoingStats.dmg += Math.round(dmg);

    outgoingHits.unshift({
      t: performance.now(), res: r.outcome, shell: r.shell || "",
      target: t._playerName || t._tankKey || "Ennemi",
      zone: r.zone || "", dmg: Math.round(dmg), pen: r.pen || 0, eff: r.eff || 0,
      kill: isKill
    });
    if (outgoingHits.length > DMG_MAX_OUT) outgoingHits.pop();
    refreshDamageUI();
    hitMarker();
  };

  /* Dessin de l'état du char sur le panneau Véhicule (vue de dessus + voyants fonctions) */
  function refreshDamageUI() {
    const t = localTank;

    const vehCanvas = document.getElementById("veh-view");
    if (!vehCanvas) return;
    const vehCtx = vehCanvas.getContext("2d");

    if (t && t.int) {
      const I = t.int;
      const M = I.byId;

      // Dessin de la silhouette + modules sur le canvas du panneau Véhicule
      Dmg.drawTank(vehCtx, 100, 100, t, null);

      // Voyants fonctions : rouge = indisponible (module détruit), vert = opérationnel
      const setLight = (id, ok) => {
        const b = el[id]; if (!b) return;
        const dot = b.querySelector(".light-dot");
        dot.className = "light-dot " + (ok ? "on" : "off");
      };

      // Avancer : moteur OK + transmission OK + conducteur vivant
      const driverOk = !M.driver || M.driver.hp > 0;
      const moveOk = driverOk && M.engine.hp > 0 && M.trans.hp > 0;
      setLight("light-move", moveOk);

      // Tirer : culasse vivante
      setLight("light-fire", M.breech.hp > 0);

      // Recharger : chargeur vivant
      const loaderOk = !M.loader || M.loader.hp > 0;
      setLight("light-reload", loaderOk);

      // Tourner tourelle : bague vivante + tireur vivant
      const turretOk = M.ring.hp > 0 && M.gunner.hp > 0;
      setLight("light-turret", turretOk);

      // Incendie
      const fireOn = !!I.fire;
      setLight("light-fireout", !fireOn); // vert = pas d'incendie, rouge = incendie
      const fireDot = el["light-fireout"]?.querySelector(".light-dot");
      if (fireDot) fireDot.classList.toggle("blink", fireOn);
    }

    drawOutgoingHistory();
    if (t && el["rep-stats"]) el["rep-stats"].textContent = outgoingStats.dmg + " dmg · " + outgoingStats.pen + " pen · " + outgoingStats.kills + " destr";
    if (el["dmg-out-val"]) el["dmg-out-val"].textContent = outgoingStats.dmg + " dmg · " + outgoingStats.pen + " pen · " + outgoingStats.kills + " destr";
    el["dmg-out"].classList.toggle("hidden", outgoingStats.dmg === 0 && outgoingStats.pen === 0 && outgoingStats.kills === 0);
  }

  /* Historique des tirs infligés */
  function drawOutgoingHistory() {
    if (el["rep-hits"]) el["rep-hits"].innerHTML = outgoingHits.map(h => {
      const resCls = h.res === "penetration" ? "pen" : h.res === "blocked" ? "blocked" : h.res === "ricochet" ? "ricochet" : h.res === "spall" ? "spall" : h.kill ? "dead" : "";
      const resTxt = h.kill ? "DÉTRUIT" : h.res === "penetration" ? "PERFO" : h.res === "blocked" ? "ARRÊTÉ" : h.res === "ricochet" ? "RICOCHET" : h.res === "spall" ? "ÉCLATS" : h.res;
      return `<li><span class="tgt">${esc(h.target)}<span class="ammo">${h.shell}</span></span><span class="res ${resCls}">${resTxt}</span><span class="val">${h.dmg > 0 ? h.dmg + " dmg" : "—"}</span></li>`;
    }).join("");
  }

  /* Rapport détaillé d'impact (popup latérale, 9 s) — conservé pour le dernier tir */
  H.report = function (r, dir) {
    rep = { r, dir, until: performance.now() + 9000 };
    el["rep-title"].textContent = dir === "out" ? "Votre tir" : "Tir reçu"; el["rep-sub"].textContent = r.tank._tankKey || "";
    const pen = r.outcome === "ricochet" ? "Ricochet" : r.outcome === "blocked" ? `Arrêté · ${r.pen} / ${r.eff} mm` : r.outcome === "spall" ? "Éclats" : `${r.shell} · ${r.pen} › ${r.eff} mm`;
    const li = (c, t) => `<li class="${c}">${esc(t)}</li>`;
    let h = `<li class="note" style="color:var(--text);font-weight:600">${esc(pen)}</li>` + li("note", r.zone + (r.outcome === "ricochet" ? " — l'obus rebondit" : r.outcome === "blocked" ? " — blindage non percé" : ""));
    for (const n of r.notes || []) h += li("note", n);
    for (const c of r.changes || []) h += li(c.to <= 0 ? "dead" : "dmg", c.m.label + " : " + Dmg.stateText(c.m));
    if (r.outcome !== "ricochet" && r.outcome !== "blocked" && !(r.changes || []).length && !r.detonated) h += li("ok", "Aucun module touché");
    if (r.detonated) h += li("dead", "Détonation de la soute !");
    if (r.fire) h += li("dmg", "Incendie déclenché");
    const rl = $("rep-list"); rl.innerHTML = h; rl.style.display = "block"; el.rep.classList.remove("hidden");
    Dmg.drawTank($("rep-cv"), 170, 170, r.tank, r);
    refreshDamageUI();
  };

  let dmgT = 0;
  function drawDamage(dt) {
    dmgT += dt;
    if (dmgT > 0.05) {
      dmgT = 0;
      refreshDamageUI();
    }
    if (rep && performance.now() > rep.until) { rep = null; el.rep.classList.add("hidden"); $("rep-list").style.display = "none"; }
  }

  /* ───── Minicarte ───── */
  H.prepareMinimap = function () {
    const c = document.createElement("canvas"); c.width = 240; c.height = 252; const x = c.getContext("2d");
    const src = World.S.terrainCanvas; if (src) x.drawImage(src, 0, 0, 240, 252);
    x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(0, 0, 240, 252);
    const sx = 240 / MAP_WIDTH, sy = 252 / MAP_HEIGHT;
    for (const o of OBSTACLES) {
      x.fillStyle = o.type === "building" ? "rgba(30,26,22,.85)" : o.type === "rock" ? "rgba(70,70,64,.8)" : o.type === "hedge" ? "rgba(20,70,30,.9)" : "rgba(40,40,40,.9)";
      if (o.type === "rock") { x.beginPath(); x.ellipse((o.x + o.w / 2) * sx, (o.y + o.h / 2) * sy, o.w / 2 * sx, o.h / 2 * sy, 0, 0, 6.283); x.fill(); }
      else x.fillRect(o.x * sx, o.y * sy, Math.max(1.5, o.w * sx), Math.max(1.5, o.h * sy));
    }
    H.mini = c;
  };
  function drawMinimap() {
    const x = el.mm, W = 240, Hh = 252, sx = W / MAP_WIDTH, sy = Hh / MAP_HEIGHT;
    x.clearRect(0, 0, W, Hh);
    if (H.mini) x.drawImage(H.mini, 0, 0);
    x.lineWidth = 1.2;
    for (const cp of CAPTURE_POINTS) {
      const col = cp.contested ? "#ffc83a" : cp.owner === "A" ? "#4db4ff" : cp.owner === "B" ? "#ff5a44" : "#ffffff";
      x.strokeStyle = col; x.globalAlpha = .9; x.beginPath(); x.arc(cp.x * sx, cp.y * sy, cp.radius * sx, 0, 6.283); x.stroke();
      x.globalAlpha = .18; x.fillStyle = col; x.fill();
      if (Math.abs(cp.progress) > 0.02 && Math.abs(cp.progress) < 1) { x.globalAlpha = .95; x.strokeStyle = cp.progress > 0 ? "#4db4ff" : "#ff5a44"; x.lineWidth = 2.5; x.beginPath(); x.arc(cp.x * sx, cp.y * sy, cp.radius * sx + 2, -1.57, -1.57 + Math.abs(cp.progress) * 6.283); x.stroke(); x.lineWidth = 1.2; }
      x.globalAlpha = 1;
    }
    // tank — 3 niveaux de spotting pour les ennemis
    const dot = (t, col, size) => {
      const px = t.x * sx, py = t.y * sy;
      if (t.destroyed) { x.fillStyle = "#777"; x.fillRect(px - 2, py - 2, 4, 4); return; }
      x.fillStyle = col;
      x.beginPath();
      x.arc(px, py, size, 0, 6.283);
      x.fill();
      x.strokeStyle = "#000"; x.lineWidth = 1; x.stroke();
    };
    for (const it of items) if (it instanceof Tank && it !== localTank) {
      if (it.teamId === localTank.teamId) {
        dot(it, "#4db4ff", 3.4);
      } else {
        const lv = it.spotLevel || 0;
        if (lv >= 3) dot(it, "#ff5a44", 3.6);       // identified
        else if (lv === 2) dot(it, "#ff7a44", 2.8);  // silhouette
        else if (lv === 1) dot(it, "#ff9a60", 1.9);  // contact
      }
    }
    // joueur + cône de vue
    const t = localTank, px = t.x * sx, py = t.y * sy;
    x.save(); x.translate(px, py);
    x.fillStyle = "rgba(255,176,0,.22)"; x.beginPath(); x.moveTo(0, 0); const fov = Cam._fov * Math.PI / 180 * (window.innerWidth / window.innerHeight) * 0.5; x.arc(0, 0, 46, Cam.yaw - fov, Cam.yaw + fov); x.closePath(); x.fill();
    x.rotate(t.alphaTank - Math.PI / 2); x.fillStyle = "#ffb000"; x.strokeStyle = "#000"; x.beginPath(); x.moveTo(6, 0); x.lineTo(-4, 4); x.lineTo(-2, 0); x.lineTo(-4, -4); x.closePath(); x.fill(); x.stroke(); x.restore();
    x.strokeStyle = "rgba(255,255,255,.2)"; x.strokeRect(.5, .5, W - 1, Hh - 1);
  }

  /* ───── Boussole ───── */
  function drawCompass() {
    const c = el.cmp, W = 520, Hh = 34; c.clearRect(0, 0, W, Hh);
    const heading = ((Cam.yaw + Math.PI / 2) * 180 / Math.PI % 360 + 360) % 360, ppd = W / 150;
    c.font = "600 15px 'Roboto Condensed','Arial Narrow',sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.18, "rgba(0,0,0,.5)"); g.addColorStop(.82, "rgba(0,0,0,.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    const labels = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SO", 270: "O", 315: "NO" };
    for (let d = -80; d <= 80; d += 5) {
      const a = Math.round(heading / 5) * 5 + d, x = W / 2 + (a - heading) * ppd, an = ((a % 360) + 360) % 360;
      const major = an % 45 === 0;
      c.strokeStyle = major ? "#fff" : "rgba(255,255,255,.45)"; c.lineWidth = major ? 2 : 1;
      c.beginPath(); c.moveTo(x, Hh - 4); c.lineTo(x, Hh - (major ? 14 : 9)); c.stroke();
      if (major) { c.fillStyle = an % 90 === 0 ? "#ffb000" : "#fff"; c.fillText(labels[an], x, 9); }
      else if (an % 15 === 0) { c.fillStyle = "rgba(255,255,255,.6)"; c.font = "500 11px 'Roboto Condensed','Arial Narrow',sans-serif"; c.fillText(an, x, 11); c.font = "600 15px 'Roboto Condensed','Arial Narrow',sans-serif"; }
    }
    for (const cp of CAPTURE_POINTS) {
      const b = Math.atan2(cp.y - localTank.y, cp.x - localTank.x), bd = ((b + Math.PI / 2) * 180 / Math.PI % 360 + 360) % 360;
      let df = bd - heading; df = ((df + 540) % 360) - 180; if (Math.abs(df) > 72) continue;
      const x = W / 2 + df * ppd; c.fillStyle = cp.owner === "A" ? "#4db4ff" : cp.owner === "B" ? "#ff5a44" : "#fff";
      c.beginPath(); c.moveTo(x, 20); c.lineTo(x + 5, 26); c.lineTo(x, 32); c.lineTo(x - 5, 26); c.closePath(); c.fill();
    }
    c.fillStyle = "#ffb000"; c.beginPath(); c.moveTo(W / 2, Hh - 1); c.lineTo(W / 2 - 5, Hh + 5 - 6); c.lineTo(W / 2 + 5, Hh + 5 - 6); c.fill();
  }

  /* ───── Orientation caisse / tourelle ───── */
  function drawOrient() {
    const c = el.or, S = 120, t = localTank, P = t.profile; c.clearRect(0, 0, S, S);
    c.save(); c.translate(S / 2, S / 2);
    c.strokeStyle = "rgba(255,255,255,.18)"; c.beginPath(); c.arc(0, 0, 54, 0, 6.283); c.stroke();
    // cône de caméra
    c.fillStyle = "rgba(255,176,0,.14)"; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 54, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill();
    const rel = wrapAngle(t.alphaTank - Math.PI / 2 - Cam.yaw), sc = 54 / 7.5;
    c.save(); c.rotate(rel);
    const L = P.L * sc, W = P.W * sc;
    c.fillStyle = t.destroyed ? "#444" : "#3c4a52"; c.strokeStyle = "#9fb3bf"; c.lineWidth = 1.5;
    c.beginPath(); c.rect(-W / 2, -L / 2, W, L); c.fill(); c.stroke();
    c.fillStyle = "#9fb3bf"; c.beginPath(); c.moveTo(-W / 2, -L / 2); c.lineTo(0, -L / 2 - 5); c.lineTo(W / 2, -L / 2); c.fill();
    c.restore();
    const tr = wrapAngle(t.alphaTurret + Math.PI / 2 - Cam.yaw);
    c.save(); c.rotate(tr); c.strokeStyle = "#ffb000"; c.fillStyle = "rgba(255,176,0,.9)"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -P.gunLen * sc - 4); c.stroke(); c.beginPath(); c.arc(0, 0, Math.max(5, P.tu.w * sc * 0.4), 0, 6.283); c.fill(); c.restore();
    c.restore();
  }

  /* ───── Marqueurs de chars ───── */
  function marker(i) {
    if (!markerPool[i]) { const d = document.createElement("div"); d.className = "mk"; el.markers.appendChild(d); markerPool[i] = d; }
    return markerPool[i];
  }

  function getPenetrationState() {
    const t = localTank;
    const pred = (typeof Cam !== "undefined" && Cam.impact) ? Cam.impact : null;
    // Quand la trajectoire réelle est disponible, on affiche SON résultat, pas une approximation HUD.
    if (pred && pred.valid && pred.kind && pred.kind !== "none") {
      if (pred.kind !== "tank") return { kind: "uncertain", label: "—" };
      if (pred.res) {
        const o = pred.res.outcome;
        if (o === "blocked") return { kind: "blocked", label: "BLOQ" };
        if (o === "ricochet") return { kind: "uncertain", label: "RICO" };
        return { kind: "possible", label: "PEN" };
      }
    }
    const target = Cam && Cam.aim ? Cam.aim.target : null;
    if (!t || !target || target.destroyed) return null;
    const ammoType = t.currentAmmo || selectedAmmos[0];
    const data = getAmmoData(ammoType, t._tankModules);
    const v = { x: target.x - t.x, y: target.y - t.y };
    const rel = wrapAngle(Math.atan2(v.y, v.x) - (target.alphaTank - Math.PI / 2));
    const deg = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)) * 180 / Math.PI);
    let face = deg < 32 ? "avant" : deg > 148 ? "arriere" : "flanc";
    const armor = target.armor || {};
    let baseArmor = 36;
    if (face === "avant") baseArmor = armor.hullFront?.thickness ?? armor.turretFront?.thickness ?? 55;
    else if (face === "flanc") baseArmor = armor.hullSide?.thickness ?? armor.turretSide?.thickness ?? 32;
    else baseArmor = armor.hullRear?.thickness ?? armor.turretRear?.thickness ?? 28;
    const shell = { type: ammoType, caliber: data.caliber || 75, penetration0: data.penetration || 75, currentPenetration: data.penetration || 75, damage: data.damage || 130, explosionPower: data.explosion || 1.2, vx: 1, vy: 0, vz: 0 };
    const info = { baseArmor, plateAngle: 0, impactAngle: clamp(Math.max(8, 40 - Math.min(30, deg * 0.35)), 0, 80), zone: "coque", face, faceName: face === "avant" ? "Avant" : face === "flanc" ? "Flanc" : "Arrière", side: 1, relAngle: 1, attackerBearing: 0, entryH: { x: 0, y: 0, z: 0 }, dirH: { x: 1, y: 0, z: 0 } };
    const res = decideImpact(shell, info);
    if (res.outcome === "blocked") return { kind: "blocked", label: "BLOQ" };
    if (res.outcome === "ricochet") return { kind: "uncertain", label: "RICO" };
    if (res.outcome === "pen" || res.outcome === "overmatch" || res.outcome === "spall") return { kind: "possible", label: "PEN" };
    return { kind: "uncertain", label: "INC" };
  }

  /* Zones opaques du HUD : on évite que les étiquettes de chars se posent dessus.
     Les rectangles sont mis en cache (coût de getBoundingClientRect non négligeable par image). */
  const BLOCKERS = ["score", "veh", "dmg", "rep", "feed", "dmg-out"];
  let blockRects = [], blockT = 0;
  function refreshBlockers() {
    blockRects = BLOCKERS.map(id => el[id]).filter(Boolean).map(e => {
      const r = e.getBoundingClientRect();
      return { l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 };
    }).filter(r => r.r > r.l && r.b > r.t);
  }
  function blocked(x, y) {
    for (const r of blockRects) if (x >= r.l && x <= r.r && y >= r.t && y <= r.b) return true;
    return false;
  }

  /* ───── Mise à jour par image ───── */
  H.update = function (dt, cam, rules) {
    const t = localTank; if (!t) return;
    blockT -= dt; if (blockT <= 0) { blockT = 0.25; refreshBlockers(); }
    // FPS
    H.fpsAcc += dt; H.fpsN++;
    if (H.fpsAcc > 0.5) { if (Settings.get("showFps")) el.fps.textContent = Math.round(H.fpsN / H.fpsAcc) + " IPS"; H.fpsAcc = 0; H.fpsN = 0; }
    if (H.toastT > 0) { H.toastT -= dt * 1000; if (H.toastT <= 0) el.toast.classList.add("hidden"); }
    // Score
    { const mb = localTank && localTank.teamId === "B"; el["sc-a"].textContent = mb ? teamScore.B : teamScore.A; el["sc-b"].textContent = mb ? teamScore.A : teamScore.B; }
    el["sc-mode"].textContent = rules.modeLabel(); el["sc-obj"].textContent = rules.objectiveText();
    // Munitions
    const am = selectedAmmos;
    [0, 1].forEach(i => {
      const k = am[i], d = k ? getAmmoData(k, t._tankModules) : null, n = i + 1;
      el["an" + n].textContent = k || "—"; el["ap" + n].textContent = d ? `Pén. ${d.penetration} mm · ${d.caliber} mm` : "";
      el["slot" + n].classList.toggle("on", t.currentAmmo === k);
    });
    const rl = t.reloadMax > 0 ? clamp(1 - t.reload / t.reloadMax, 0, 1) : 1;
    el["reload-fill"].style.width = (t.reload > 0 ? rl * 100 : 100) + "%"; el.reload.classList.toggle("busy", t.reload > 0);
    el["reload-txt"].textContent = !t.modules.canon ? "CANON HS" : t.reload > 0 ? (t.reload / 60).toFixed(1) + " s" : "PRÊT";
    // Indicateur tactile dédié : reste visible même lorsque le panneau de munitions desktop est masqué.
    if (el["t-reload-fill"]) {
      el["t-reload-fill"].style.width = (rl * 100) + "%";
      el["t-reload"].classList.toggle("busy", t.reload > 0);
      el["t-reload"].classList.toggle("ready", t.reload <= 0 && !!t.modules.canon);
      el["t-reload-label"].textContent = !t.modules.canon ? "CANON HORS SERVICE" : t.reload > 0 ? "RECHARGE · " + (t.reload / 60).toFixed(1) + " s" : "CANON PRÊT";
    }
    drawCompass(); drawDamage(dt);
    H.miniT += dt; if (H.miniT > 0.05) { H.miniT = 0; drawMinimap(); }
    // Viseur : point visé + marqueur de canon
    const aim = Cam.aim;
    const penState = getPenetrationState();
    el.range.textContent = "Visée · " + Math.round(aim.dist) + " m";
    el.aim.classList.remove("possible", "uncertain", "blocked");
    if (penState) {
      el.aim.classList.add(penState.kind);
      el.penetration.textContent = penState.label;
      el.penetration.classList.remove("hidden");
      el.penetration.className = "penetration " + penState.kind;
    } else {
      el.aim.classList.add("neutral");
      el.penetration.classList.add("hidden");
      el.penetration.textContent = "";
    }
    /* Point d'impact prévu : arena-main.js le recalcule à ~8 Hz, le HUD ne fait que l'afficher. */
    const imp = Cam.impact;
    const gm = el["gun-mark"];
    if (imp.valid && !t.destroyed) {
      const pr = Cam.project(imp.x * PX, imp.z * PX, imp.y * PX, cam, H._p || (H._p = {}));
      const W = innerWidth, Hh = innerHeight, cx = W / 2, cy = Hh / 2, pad = 26;
      let px, py, edge = false;
      if (pr) { px = pr.x; py = pr.y; }
      else { const f = new THREE.Vector3(imp.x * PX, imp.z * PX, imp.y * PX).project(cam); px = cx + (f.x >= 0 ? -1 : 1) * 1e4 * Math.sign(f.x || 1); py = cy - f.y * 1e4; }  // derrière la caméra : on le pousse sur le bord
      if (px < pad || px > W - pad || py < pad || py > Hh - pad) {
        const dx = px - cx, dy = py - cy, k = Math.min((cx - pad) / Math.max(1e-3, Math.abs(dx)), (cy - pad) / Math.max(1e-3, Math.abs(dy)));
        px = cx + dx * k; py = cy + dy * k; edge = true;
      }
      gm.style.display = "block"; gm.style.left = px + "px"; gm.style.top = py + "px";
      gm.lastChild.textContent = "Impact · " + Math.round(imp.dist) + " m";
      const dd = Math.hypot(px - cx, py - cy); gm.classList.toggle("far", dd > 160 && !edge); gm.classList.toggle("edge", edge); gm.classList.toggle("rside", px > W * 0.6); gm.classList.toggle("onfoe", !!(imp.target && imp.target.teamId !== t.teamId));
    } else gm.style.display = "none";
    if (Cam.sniper) {
      const sc = el.scope;
      sc.classList.remove("possible", "uncertain", "blocked"); if (penState) sc.classList.add(penState.kind);
      el["sc-dist"].textContent = aim.kind === "none" ? "—" : Math.round(aim.dist) + " m";
      el["sc-el"].textContent = (t.gunElevation >= 0 ? "+" : "−") + Math.abs(t.gunElevation).toFixed(1) + "°";
      el["sc-ammo"].textContent = t.currentAmmo || "—";
      el["sc-zoom"].textContent = "×" + (Cam.fovBase / Math.max(1, cam.fov)).toFixed(1);
      if (H._scopeW !== innerWidth + "x" + innerHeight) H.buildScope();
    }
    const ti = el["target-info"];
    if (aim.target && !aim.target.destroyed) {
      const ally = aim.target.teamId === t.teamId;
      const lv = ally ? 3 : (aim.target.spotLevel || 0);
      if (ally || lv >= 3) {
        ti.className = ally ? "ally" : "foe";
        ti.textContent = (aim.target._playerName || aim.target._tankKey) + " · " + Math.round(aim.dist) + " m";
      } else if (lv === 2) {
        ti.className = "foe";
        ti.textContent = "Cible · " + Math.round(aim.dist) + " m";
      } else if (lv === 1) {
        ti.className = "foe";
        ti.textContent = "Contact · " + Math.round(aim.dist) + " m";
      } else {
        ti.textContent = "";
      }
      el.range.textContent = "";
    } else { ti.textContent = ""; }
    // Marqueurs — 3 niveaux de spotting
    let mi = 0;
    const consider = tk => {
      if (tk === t) return;
      if (tk.destroyed) return;
      const ally = tk.teamId === t.teamId;
      const lv = ally ? 3 : (tk.spotLevel || 0);
      if (!ally && lv < 1) return;
      const d = Math.hypot(tk.x - t.x, tk.y - t.y) * PX;
      const p = Cam.project(tk.x * PX, tk.profile.totalHeight + 1.4 + (tk.gz || 0) * PX, tk.y * PX, cam, H._q || (H._q = {})); if (!p) return;
      /* Masqué par un panneau ou hors écran : on ne consomme pas de marqueur du pool. */
      if (blocked(p.x, p.y) || p.x < -40 || p.x > innerWidth + 40 || p.y < -40 || p.y > innerHeight + 40) return;
      const e = marker(mi++);
      e.style.display = "block"; e.style.left = p.x + "px"; e.style.top = p.y + "px";
      if (ally) {
        e.className = "mk a";
        const nm = tk._playerName || tk._tankKey;
        const html = esc(nm) + `<small class="num">${Math.round(d)} m</small><i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      } else if (lv >= 3) {
        // Identified : nom + distance
        e.className = "mk b";
        const nm = tk._playerName || tk._tankKey;
        const html = esc(nm) + `<small class="num">${Math.round(d)} m</small><i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      } else if (lv === 2) {
        // Silhouette : marqueur sans nom
        e.className = "mk b sil";
        const html = `<i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      } else {
        // Contact : petit point
        e.className = "mk b contact";
        const html = `<i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      }
    };
    for (const it of items) if (it instanceof Tank) consider(it);
    for (let k = mi; k < markerPool.length; k++) markerPool[k].style.display = "none";
  };

  return H;
})();
