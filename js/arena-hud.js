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
    ["Obus 1 / obus 2", "1 · 2"], ["Réparer (à l'arrêt)", "R (maintenir)"], ["Carte agrandie", "M"],
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
  H.init = function () {
    ["hud", "score", "sc-a", "sc-b", "sc-mode", "sc-obj", "compass", "minimap", "mini-theme", "fps", "feed", "aim", "gun-mark", "range", "target-info", "scope", "scope-ret", "sc-dist", "sc-zero", "markers",
      "veh-name", "veh-cat", "orient", "spd", "gear", "eng-fill", "m-engine", "m-canon", "m-trackL", "m-trackR", "crew", "an1", "an2", "ap1", "ap2", "slot1", "slot2", "reload", "reload-fill",
      "dmg", "dmg-cv", "dmg-chips", "dmg-sum", "dmg-body", "dmg-toggle", "rep", "rep-cv", "rep-title", "rep-sub", "rep-list", "reload-txt", "respawn", "respawn-txt", "toast", "hit-ring", "touch", "t-reload", "t-reload-fill", "t-reload-label", "loading", "ld-title", "ld-map-name", "ld-map", "ld-team-list", "ld-sub", "ld-fill", "ld-step", "deploy", "deploy-mode", "deploy-map-name", "deploy-map-place", "deploy-team-list", "deploy-map-canvas", "deploy-objective", "deploy-description", "cinematic", "cinematic-kicker", "cinematic-title", "cinematic-progress", "sc-zoom", "pause", "wait", "end", "mini"].forEach(i => el[i] = $(i));
    { const d = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
      for (const k in el) { const e = el[k]; if (e && e.nodeType === 1) Object.defineProperty(e, "textContent", { configurable: true, get() { return d.get.call(this); }, set(v) { v = String(v); if (d.get.call(this) !== v) d.set.call(this, v); } }); } }
    el.dcv = el["dmg-cv"].getContext("2d"); el.rcv = el["rep-cv"].getContext("2d");
    el.cmp = el.compass.getContext("2d"); el.mm = el.minimap.getContext("2d"); el.or = el.orient.getContext("2d");
    el["dmg-toggle"].onclick = () => {
      const open = el["dmg-body"].classList.toggle("hidden") === false;
      el["dmg-toggle"].textContent = open ? "DÉGÂTS −" : "DÉGÂTS +";
      el["dmg-toggle"].setAttribute("aria-expanded", String(open));
    };
    addEventListener("resize", () => { if (Cam.sniper) H.buildScope(); });
    $("keys-grid").innerHTML = KEYS.map(k => `<div><span>${k[0]}</span><span class="num">${k[1]}</span></div>`).join("");
    el["mini-theme"].textContent = MAP_THEME_LABELS[MAP_THEME] || MAP_THEME;
    el["ld-map-name"].textContent = MAP_THEME_LABELS[MAP_THEME] || MAP_THEME;
    el["deploy-map-name"].textContent = MAP_THEME_LABELS[MAP_THEME] || MAP_THEME;
    el["deploy-map-place"].textContent = MAPS[MAP_THEME].place || "";
    el["ld-sub"].textContent = (MAP_THEME_LABELS[MAP_THEME] || MAP_THEME) + " · " + (MODE_LABEL[ARENA_CFG.mode] || "");
    el.fps.classList.toggle("hidden", !Settings.get("showFps"));
    if (mobileMode) document.body.classList.add("touch");
    H.drawMapPreview(0);
  };
  const MODE_LABEL = { sandbox: "Terrain d'entraînement", test: "Champ d'essai", skirmish: "Escarmouche", deathmatch: "Deathmatch", campaign: "Campagne", online: "En ligne", multi: "Multijoueur local" };

  /* ───── Chargement ───── */
  H.drawMapPreview = function (progress) {
    const paint = (canvas, reveal) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height, sx = w / MAP_WIDTH, sy = h / MAP_HEIGHT;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = (MAPS[MAP_THEME].pal && MAPS[MAP_THEME].pal.base) || "#26352d";
      ctx.fillRect(0, 0, w, h);
      if (World.S.terrainCanvas) ctx.drawImage(World.S.terrainCanvas, 0, 0, w, h);
      else {
        ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = Math.max(1, w / 500);
        for (let i = 1; i < 12; i++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += Math.max(8, w / 60)) {
            const y = h * i / 12 + Math.sin(x / (w / 9) + i * 0.8) * h * 0.018;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      for (const o of OBSTACLES) {
        ctx.fillStyle = o.type === "building" ? "rgba(20,24,24,.82)" : o.type === "hedge" ? "rgba(24,62,34,.78)" : "rgba(65,67,58,.68)";
        ctx.fillRect(o.x * sx, o.y * sy, Math.max(1, o.w * sx), Math.max(1, o.h * sy));
      }
      const sp = MAP_LAYOUT.spawn;
      for (const team of ["A", "B"]) {
        const [x, y] = sp[team];
        ctx.fillStyle = team === "A" ? "rgba(77,180,255,.18)" : "rgba(255,90,68,.18)";
        ctx.strokeStyle = team === "A" ? "#4db4ff" : "#ff5a44";
        ctx.beginPath(); ctx.arc(x * sx, y * sy, Math.max(12, w * 0.035), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      for (let i = 0; i < CAPTURE_POINTS.length; i++) {
        const cp = CAPTURE_POINTS[i], x = cp.x * sx, y = cp.y * sy;
        ctx.fillStyle = cp.owner === "A" ? "#4db4ff" : cp.owner === "B" ? "#ff5a44" : "#f3f6f8";
        ctx.strokeStyle = "#101416"; ctx.lineWidth = Math.max(2, w / 240);
        ctx.beginPath(); ctx.arc(x, y, Math.max(6, w / 75), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.max(10, w / 45)}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String.fromCharCode(65 + i), x, y);
      }
      const shown = clamp(reveal, 0, 1) * w;
      if (shown < w) { ctx.fillStyle = "rgba(5,9,11,.68)"; ctx.fillRect(shown, 0, w - shown, h); }
      ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, w - 1, h - 1);
    };
    paint(el["ld-map"], progress);
    paint(el["deploy-map-canvas"], 1);
  };
  H.setLoadingTeam = function (roster) {
    const rows = roster.map(r => ({ key: r[0], player: r[1], isPlayer: !!r[2] }));
    H.renderTeam(roster.length ? rows : [{ key: selectedKey, player: "Vous", isPlayer: true }], el["ld-team-list"]);
  };
  H.renderTeam = function (roster, container) {
    const svg = '<svg viewBox="0 0 96 52" aria-hidden="true"><path d="M12 34h72v8H12z" fill="#222b2e" stroke="#718087" stroke-width="2"/><path d="M20 24h48l12 10H16z" fill="#75806a" stroke="#d3d7c7" stroke-width="2"/><path d="M38 18h25l7 8H34z" fill="#8d9678" stroke="#d3d7c7" stroke-width="2"/><path d="M58 19 90 14" stroke="#d3d7c7" stroke-width="3"/><circle cx="25" cy="38" r="3" fill="#b9c1b2"/><circle cx="38" cy="38" r="3" fill="#b9c1b2"/><circle cx="51" cy="38" r="3" fill="#b9c1b2"/><circle cx="64" cy="38" r="3" fill="#b9c1b2"/></svg>';
    container.innerHTML = `<div class="team-roster">${roster.map(r => {
      const name = esc(r.key || "Char"), player = esc(r.player || "Joueur");
      return `<div class="team-row${r.isPlayer ? " player" : ""}"><span class="team-avatar">${svg}</span><span class="team-copy"><b>${name}</b><small>${player}${r.isPlayer ? " · VOUS" : ""}</small></span></div>`;
    }).join("")}</div>`;
  };
  H.setLoading = function (p, text) {
    const progress = clamp(p, 0, 1);
    el["ld-fill"].style.width = Math.round(progress * 100) + "%";
    el["ld-step"].textContent = Math.round(progress * 100) + " % — " + (text || "");
    H.drawMapPreview(Math.max(0.08, progress));
  };
  H.hideLoading = function () { el.loading.classList.add("hidden"); el.hud.classList.remove("hidden"); if (mobileMode) el.touch.classList.remove("hidden"); };
  H.showLoading = function () { el.loading.classList.remove("hidden"); };
  H.showDeployment = function (rules) {
    const roster = items.filter(t => t instanceof Tank && t.teamId === localTank.teamId && !t.destroyed);
    H.renderTeam(roster.map(t => ({ key: t._tankKey, player: t._playerName || t._tankKey, isPlayer: t === localTank })), el["deploy-team-list"]);
    H.drawMapPreview(1);
    el["deploy-mode"].textContent = MODE_LABEL[ARENA_CFG.mode] || "Combat";
    el["deploy-objective"].textContent = rules.objectiveText();
    el["deploy-description"].textContent = MAP_THEME_META[MAP_THEME].objective || "";
    el.deploy.classList.remove("hidden");
  };
  H.hideDeployment = function () { el.deploy.classList.add("hidden"); };
  H.showCinematic = function (kind, duration) {
    el["cinematic-kicker"].textContent = kind === "deathmatch" ? "Dernier tir" : "Fin de bataille";
    el["cinematic-title"].textContent = kind === "deathmatch" ? "TIR DÉCISIF" : "CONTRÔLE DU TERRAIN";
    el["cinematic-progress"].style.transition = "none";
    el["cinematic-progress"].style.width = "0%";
    el.cinematic.classList.remove("hidden");
    requestAnimationFrame(() => {
      el["cinematic-progress"].style.transition = `width ${duration}s linear`;
      el["cinematic-progress"].style.width = "100%";
    });
  };
  H.hideCinematic = function () { el.cinematic.classList.add("hidden"); };

  /* ───── Écrans ───── */
  H.showPause = function (on) { el.pause.classList.toggle("hidden", !on); };
  H.setScopeControls = function (on) {
    const controls = $("scope-touch-controls");
    if (controls) controls.classList.toggle("hidden", !on || !mobileMode);
  };
  H.showWait = function (title, html, onCancel) {
    el.wait.classList.remove("hidden"); $("wait-title").textContent = title; $("wait-body").innerHTML = html;
    $("b-wait-quit").onclick = onCancel || (() => location.href = "lobby.html");
  };
  H.updateWait = function (html) { $("wait-body").innerHTML = html; };
  H.hideWait = function () { el.wait.classList.add("hidden"); };
  H.toast = function (text, ms) { el.toast.textContent = text; el.toast.classList.remove("hidden"); H.toastT = ms || 2200; };
  H.showEnd = function (d) {
    const rows = d.stats.map(s => `<div><span>${s[0]}</span><b class="num">${s[1]}</b></div>`).join("");
    el.end.innerHTML = `<div class="end-card cut ${d.win ? "win" : "loss"}"><h2>${d.title}</h2><div class="end-sub">${d.sub}</div>
      <div class="end-grid">${rows}</div>
      <div class="end-xp"><div><span class="disp" style="font-size:13px;letter-spacing:.14em;color:var(--dim)">Expérience gagnée</span><small>${d.xpNote || ""}</small></div><b class="num">+${d.xp.toLocaleString("fr-FR")} XP</b></div>
      <div class="pa-btns"><button class="btn primary disp" id="e-again">${d.again || "Rejouer"}</button><button class="btn disp" id="e-lobby">Retour au QG</button></div></div>`;
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
  const esc = s => String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  H.event = function (type, detail, bearing, outgoing) {
    const d = esc(detail || "");
    switch (type) {
      case "ricochet": feed(outgoing ? "out" : "ric", `<b>${outgoing ? "TIR INFLIGÉ · RICOCHET" : "TIR REÇU · RICOCHET"}</b>${d}`); break;
      case "ricochet-out": feed("out", `<b>TIR INFLIGÉ · RICOCHET</b>${d}`); break;
      case "penetration": feed(outgoing ? "out" : "pen", `<b>${outgoing ? "TIR INFLIGÉ" : "TIR REÇU"}</b>${d}`); break;
      case "blocked": feed(outgoing ? "out" : "blk", `<b>${outgoing ? "TIR INFLIGÉ · ARRÊTÉ" : "TIR REÇU · ENCAISSÉ"}</b>${d}`); break;
      case "spall": feed(outgoing ? "out" : "pen", `<b>${outgoing ? "TIR INFLIGÉ · ÉCLATS" : "TIR REÇU · ÉCLATS"}</b>${d}`); break;
      case "module": feed("mod", `<b>Module</b>${d}`); break;
      case "fire": feed("pen", `<b>Incendie</b>${d}`); break;
      case "fire-out": feed("sys", `<b>Incendie</b>${d}`); break;
      case "canon": feed("mod", `<b>Canon</b>endommagé`); break;
      case "engine": feed("mod", `<b>Moteur</b>endommagé`); break;
      case "track": feed("mod", `<b>Chenille</b>${d || "touchée"}`); break;
      case "crew": feed("mod", `<b>Équipage</b>${d}`); break;
      case "ammo": feed("pen", `<b>TIR REÇU · SOUTE</b>${d}`); break;
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
  function hitMarker() {
    const g = el.aim; g.classList.add("hit"); g.style.transform = "scale(1.35)";
    setTimeout(() => { g.style.transform = ""; g.classList.remove("hit"); }, 160);
  }
  H.onPlayerDestroyed = function (killer) {
    el.respawn.classList.remove("hidden");
    $("respawn").querySelector(".rt").textContent = "Véhicule détruit";
    if (killer && killer !== localTank) feed("pen", `<b>Détruit par</b>${esc(killer._playerName || killer._tankKey || "l'ennemi")}`);
  };
  H.setRespawn = function (txt) { if (txt === null) el.respawn.classList.add("hidden"); else { el.respawn.classList.remove("hidden"); el["respawn-txt"].textContent = txt; } };

  /* ───── Modules internes : état du véhicule et rapport d'impact ───── */
  let rep = null;
  const OUT = { ricochet: "Ricochet", blocked: "Arrêté", pen: "Perforation", spall: "Éclats", overmatch: "Overmatch" };
  H.report = function (r, dir) {
    const majorReceived = dir === "in" && (r.detonated || r.fire || (r.changes || []).some(c => c.to <= 0 || c.m.kind === "crew"));
    rep = { r, dir, showGraph: majorReceived, until: performance.now() + 9000 };
    el["rep-title"].textContent = dir === "out" ? "TIR INFLIGÉ" : "TIR REÇU";
    el["rep-title"].className = dir === "out" ? "outgoing" : "incoming";
    el["rep-sub"].textContent = r.tank._tankKey || "";
    el["rep-cv"].classList.toggle("hidden", !majorReceived);
    const pen = r.outcome === "ricochet" ? "Ricochet" : r.outcome === "blocked" ? `Arrêté · ${r.pen} / ${r.eff} mm` : r.outcome === "spall" ? "Éclats" : `${r.shell} · ${r.pen} › ${r.eff} mm`;
    const li = (c, t) => `<li class="${c}">${esc(t)}</li>`;
    let h = `<li class="note" style="color:var(--text);font-weight:600">${esc(pen)}</li>` + li("note", r.zone + (r.outcome === "ricochet" ? " — l'obus rebondit" : r.outcome === "blocked" ? " — blindage non percé" : ""));
    for (const n of r.notes || []) h += li("note", n);
    for (const c of r.changes || []) h += li(c.to <= 0 ? "dead" : "dmg", c.m.label + " : " + Dmg.stateText(c.m));
    if (r.outcome !== "ricochet" && r.outcome !== "blocked" && !(r.changes || []).length && !r.detonated) h += li("ok", "Aucun module touché");
    if (r.detonated) h += li("dead", "Détonation de la soute !");
    if (r.fire) h += li("dmg", "Incendie déclenché");
    el["rep-list"].innerHTML = h; el.rep.classList.remove("hidden");
  };
  let dmgT = 0, dmgKey = "";
  function drawDamage(dt) {
    dmgT += dt;
    if (dmgT > 0.08) {
      dmgT = 0; const t = localTank;
      if (t && t.int) {
        Dmg.drawTank(el.dcv, 150, 150, t, null);
        const I = t.int, worst = ids => { let w = 1; for (const i of ids) w = Math.min(w, I.byId[i] ? I.byId[i].hp : 1); return w; };
        const cls = hp => hp <= 0 ? "dead" : hp < 0.999 ? "dmg" : "";
        const crewTot = Dmg.crewTotal(t), crewOk = Dmg.crewAlive(t);
        const racks = I.mods.filter(m => m.kind === "ammo").map(m => m.id), fuel = ["fuelL", "fuelR"];
        const chips = [["Équipage " + crewOk + "/" + crewTot, crewOk <= 1 ? 0 : crewOk < crewTot ? 0.5 : 1], ["Moteur", I.byId.engine.hp], ["Boîte", I.byId.trans.hp], ["Culasse", I.byId.breech.hp], ["Tourelle", I.byId.ring.hp], ["Soutes", worst(racks)], ["Réservoirs", worst(fuel)],
          ["Chenille G", t.modules.trackLeft ? 1 : 0], ["Chenille D", t.modules.trackRight ? 1 : 0]];
        let h = chips.map(c => `<span class="chip ${cls(c[1])}">${c[0]}</span>`).join("") + (I.fire ? `<span class="chip fire">Incendie</span>` : "") + `<span class="chip" style="color:var(--dim);border-color:transparent;background:none">Soutes : ${Math.round(I.fill * 100)} % pleines</span>`;
        if (h !== dmgKey) { el["dmg-chips"].innerHTML = h; dmgKey = h; }
        el["dmg-sum"].textContent = t.engineHealth + " % moteur";
      }
    }
    if (rep) {
      if (performance.now() > rep.until) { rep = null; el.rep.classList.add("hidden"); }
      else if (rep.showGraph && dmgT < 0.01) Dmg.drawTank(el.rcv, 150, 150, rep.r.tank, rep.r);
    }
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
        if (lv > 0) {
          const visible = !!it._spotVisibleNow;
          const px = visible ? it.x : it._lastKnownX, py = visible ? it.y : it._lastKnownY;
          if (Number.isFinite(px) && Number.isFinite(py)) {
            const level = visible ? lv : 1;
            const stale = Math.max(0, 1 - (it._spottedMemoryTimer || 0) / SPOT_MEMORY_TICKS);
            dot({ x: px, y: py, destroyed: false }, level >= 3 ? "#ff5a44" : level === 2 ? "#ff7a44" : "#ff9a60", level >= 3 ? 3.6 : level === 2 ? 2.8 : 1.9 - stale * 0.7);
          }
        }
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
    const t = localTank; const target = Cam && Cam.aim ? Cam.aim.target : null;
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

  /* ───── Mise à jour par image ───── */
  H.update = function (dt, cam, rules) {
    const t = localTank; if (!t) return;
    // FPS
    H.fpsAcc += dt; H.fpsN++;
    if (H.fpsAcc > 0.5) { if (Settings.get("showFps")) el.fps.textContent = Math.round(H.fpsN / H.fpsAcc) + " IPS"; H.fpsAcc = 0; H.fpsN = 0; }
    if (H.toastT > 0) { H.toastT -= dt * 1000; if (H.toastT <= 0) el.toast.classList.add("hidden"); }
    // Score
    { const mb = localTank && localTank.teamId === "B"; el["sc-a"].textContent = mb ? teamScore.B : teamScore.A; el["sc-b"].textContent = mb ? teamScore.A : teamScore.B; }
    el["sc-mode"].textContent = rules.modeLabel(); el["sc-obj"].textContent = rules.objectiveText();
    // Véhicule
    const kmh = Math.abs(t.speed) / (PIXELS_PER_METER * TICK_RATE) * 3.6;
    el.spd.textContent = Math.round(kmh);
    el.gear.textContent = t.gear > 0 ? t.gear : t.gear < 0 ? "R" + (t.gear === -2 ? "2" : "") : "N";
    el["veh-name"].textContent = t._tankKey; el["veh-cat"].textContent = t.profile.catLabel;
    const eh = t.engineHealth; el["eng-fill"].style.width = eh + "%"; el["eng-fill"].style.background = eh > 60 ? "var(--ok)" : eh > 25 ? "var(--warn)" : "var(--bad)";
    const mset = (id, ok, mid) => { const e = el[id]; e.className = ok ? (mid ? "mid" : "") : "bad"; };
    mset("m-engine", t.modules.engine && eh > 0, eh < 60); mset("m-canon", t.modules.canon); mset("m-trackL", t.modules.trackLeft); mset("m-trackR", t.modules.trackRight);
    const crewKeys = ["commander", "gunner", "loader", "driver", "radio"], nCrew = t._tankModules.crew || t.profile.crew || 4;
    let ch = ""; crewKeys.forEach((k, i) => { ch += `<i class="${i >= nCrew && !t.modules.crew[k] && k === "radio" ? "none" : t.modules.crew[k] ? "" : "dead"}"></i>`; });
    if (el.crew._h !== ch) { el.crew.innerHTML = ch; el.crew._h = ch; }
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
    drawOrient(); drawCompass(); drawDamage(dt);
    H.miniT += dt; if (H.miniT > 0.05) { H.miniT = 0; drawMinimap(); }
    // Viseur : point visé + marqueur de canon
    const aim = Cam.aim;
    const penState = getPenetrationState();
    el.range.textContent = Math.round(aim.dist) + " m";
    const zeroOffset = Cam.sniper ? Cam.zeroOffsetPixels() : 0;
    el.aim.style.top = `calc(50% + ${zeroOffset}px)`;
    el["scope-ret"].style.transform = `translateY(${zeroOffset}px)`;
    el.aim.classList.remove("neutral", "possible", "uncertain", "blocked");
    if (penState) {
      el.aim.classList.add(penState.kind);
    } else {
      el.aim.classList.add("neutral");
    }
    /* Point d'impact prévu (trajectoire balistique réelle depuis le canon), recalculé une image sur deux */
    H._impN = (H._impN || 0) + 1; const imp = (H._impN & 1) || !Cam.impact.valid ? Cam.predictImpact() : Cam.impact;
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
      const dd = Math.hypot(px - cx, py - cy); gm.classList.toggle("far", dd > 160 && !edge); gm.classList.toggle("edge", edge); gm.classList.toggle("onfoe", !!(imp.target && imp.target.teamId !== t.teamId));
    } else gm.style.display = "none";
    if (Cam.sniper) {
      const sc = el.scope;
      sc.classList.remove("possible", "uncertain", "blocked"); if (penState) sc.classList.add(penState.kind);
      el["sc-dist"].textContent = aim.kind === "none" ? "—" : Math.round(aim.dist) + " m";
      el["sc-zoom"].textContent = "×" + Cam.zoomLabel().toLocaleString("fr-FR");
      el["sc-zero"].textContent = "ZÉRO " + Cam.zeroMeters + " m";
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
      const visible = ally || !!tk._spotVisibleNow;
      const x = visible ? tk.x : tk._lastKnownX, y = visible ? tk.y : tk._lastKnownY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const level = visible ? lv : 1;
      const d = Math.hypot(x - t.x, y - t.y) * PX;
      const gz = visible ? (tk.gz || 0) : groundH(x, y);
      const p = Cam.project(x * PX, tk.profile.totalHeight + 1.4 + gz * PX, y * PX, cam, H._q || (H._q = {})); if (!p) return;
      const e = marker(mi++);
      e.style.display = "block"; e.style.left = p.x + "px"; e.style.top = p.y + "px";
      e.classList.toggle("mem", !visible);
      if (ally) {
        e.className = "mk a";
        const nm = tk._playerName || tk._tankKey;
        const html = esc(nm) + `<small class="num">${Math.round(d)} m</small><i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      } else if (level >= 3) {
        // Identified : nom + distance
        e.className = "mk b";
        const nm = tk._playerName || tk._tankKey;
        const html = esc(nm) + `<small class="num">${Math.round(d)} m</small><i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      } else if (level === 2) {
        // Silhouette : marqueur sans nom
        e.className = "mk b sil" + (visible ? "" : " mem");
        const html = `<i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      } else {
        // Contact : petit point
        e.className = "mk b contact" + (visible ? "" : " mem");
        const html = `<i></i>`;
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
      }
    };
    for (const it of items) if (it instanceof Tank) consider(it);
    for (let k = mi; k < markerPool.length; k++) markerPool[k].style.display = "none";
  };

  return H;
})();
