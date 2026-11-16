/* ==========================================================================
   LOBBY-SECTIONS.JS — Les six sections du poste de commandement :
   01 QG · 02 Combat · 03 Hangar · 04 Recherche · 05 Carrière · 06 Réglages.
   Toutes les valeurs affichées proviennent des données réelles du jeu
   (shared-data.js, tank-catalog.js, Store) — aucune information factice.
   ========================================================================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

function toast(msg) { const t = $("#toast-l"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2400); }
function confirmBox(title, text, ok, onOk, danger) {
  const m = $("#modal"); m.innerHTML = `<div class="box"><h3>${title}</h3><p>${text}</p><div class="row"><button class="btn" id="mb-no">Annuler</button><button class="btn ${danger ? "danger" : "primary"}" id="mb-ok">${ok}</button></div></div>`;
  m.classList.remove("hidden"); $("#mb-no").onclick = () => m.classList.add("hidden"); $("#mb-ok").onclick = () => { m.classList.add("hidden"); onOk(); };
}
function on(sec, handlers) {
  sec.onclick = e => { const b = e.target.closest("[data-a]"); if (!b || b.disabled) return; const f = handlers[b.dataset.a]; if (f) f(b.dataset, b, e); };
}

/* ───── Données de jeu ───── */
const MODES = [
  { id: "test", n: "01", name: "Champ d'essai", desc: "Testez n'importe quel char contre des cibles inertes, mobiles ou agressives. Sans XP ni limite." },
  { id: "sandbox", n: "02", name: "Entraînement", desc: "Terrain libre contre des cibles qui reviennent. Aucune limite, aucune récompense." },
  { id: "skirmish", n: "03", name: "Escarmouche", desc: "Équipes de chars contre l'IA, zones à capturer. Premier à atteindre le score." },
  { id: "deathmatch", n: "04", name: "Deathmatch", desc: "Éliminez toute l'équipe ennemie. Pas de zones à capturer, seulement des destructions." },
  { id: "campaign", n: "05", name: "Campagne", desc: "Dix missions aux objectifs précis : cibles, vies, temps. Progression par véhicule." },
  { id: "multi", n: "06", name: "Multijoueur", desc: "Salons en ligne : choisissez votre équipe, voyez qui est connecté, l'hôte règle la partie." }
];

/* ───── Champ d'essai ───── */
const TEST_BEHAV = { static: "inertes", static_fire: "fixes, tirent", patrol: "en mouvement", combat: "en combat" };
function tankOptions(cur, withRandom) {
  const keys = Object.keys(TANK_MODULES).filter(k => TECH_TREE[k]);
  const groups = {};
  for (const k of keys) { const I = tankInfo(k), g = I.nation.name; (groups[g] = groups[g] || []).push([k, I.tier, I.cat]); }
  let h = withRandom ? `<option value="random" ${cur === "random" ? "selected" : ""}>Aléatoire</option>` : `<option value="" ${!cur ? "selected" : ""}>Mon véhicule du hangar</option>`;
  for (const g of Object.keys(groups).sort()) h += `<optgroup label="${escHTML(g)}">${groups[g].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k, t, c]) => `<option value="${escHTML(k)}" ${cur === k ? "selected" : ""}>${ROMAN[t]} · ${escHTML(k)} (${escHTML(c)})</option>`).join("")}</optgroup>`;
  return h;
}

/* ───── Multijoueur local : adresse du serveur et état de la salle (server.js) ───── */
const Multi = {
  room: null,
  server() { return (location.protocol === "https:" ? location.host : null) || localStorage.getItem("mpServer") || (location.protocol === "file:" || !location.host ? "localhost:3000" : location.host); },   // la page est servie par server.js : même adresse
  setServer(v) { localStorage.setItem("mpServer", (v || "").trim().replace(/^(https?|wss?):\/\//, "").replace(/\/.*$/, "")); },
  async refresh() {
    try { const r = await fetch((location.protocol === "https:" ? "https://" : "http://") + Multi.server() + "/api/room", { cache: "no-store" }); Multi.room = await r.json(); } catch (e) { Multi.room = null; return null; }
    return Multi.room;
  },
  statusHTML() {
    const r = Multi.room;
    if (!r) return `<b style="color:var(--warn,#ff8a3d)">Serveur introuvable.</b> Lancez <code>node server.js</code> sur le PC hôte puis vérifiez l'adresse ci-dessus.`;
    if (!r.open) return `Serveur joignable · aucune partie en cours : <b>vous la créez</b> et devenez l'hôte.`;
    const th = r.cfg && r.cfg.theme ? (MAP_THEME_LABELS[r.cfg.theme] || r.cfg.theme) : "?";
    return `Partie de <b>${escHTML(r.host || "?")}</b> · ${th} · ${r.players.length} joueur${r.players.length > 1 ? "s" : ""} (${r.players.map(p => escHTML(p.name)).join(", ")}) → <b>vous la rejoignez</b>.`;
  }
};
/* ───── Réglages → Multijoueur : lien public (tunnel) piloté par server.js ───── */
const MultiHost = {
  st: undefined, poll: null,
  async call(method) {
    try { const r = await fetch("/api/tunnel", { method, cache: "no-store", headers: { "X-TA": "1" } }); if (!r.ok) throw new Error("HTTP " + r.status); MultiHost.st = await r.json(); } catch (e) { MultiHost.st = null; }
    return MultiHost.st;
  },
  html() {
    const s = MultiHost.st;
    if (s === undefined) return `<div class="note">Recherche du serveur…</div>`;
    if (s === null) return `<div class="note"><b>Serveur non détecté.</b> Fermez cette page, double-cliquez sur <b>Lancer_serveur.bat</b> (dans le dossier du jeu), puis ouvrez <b>http://localhost:3000</b> dans le navigateur.</div>`;
    const ctl = s.canControl ? "" : "disabled";
    const lan = s.lan && s.lan.length ? `<div class="field"><div><b>Même wifi</b><small>Fonctionne seulement si le pare-feu Windows l'autorise</small></div><span class="num">${s.lan.map(escHTML).join("<br>")}</span></div>` : "";
    let t;
    if (s.state === "starting") t = `<div class="field"><div><b>Lien public</b><small>Connexion au service de tunnel…</small></div><span class="tag amber">Démarrage</span></div>`;
    else if (s.state === "on") t = `<div class="field"><div><b>Lien public</b><small>Envoyez-le à vos amis : ils l'ouvrent dans leur navigateur</small></div><span class="tag ok">Actif</span></div>
      <div style="display:flex;gap:8px;margin-top:6px"><input class="inp" id="mh-url" readonly value="${escHTML(s.url)}" style="flex:1;min-width:0"><button class="btn sm" data-a="mhCopy">Copier</button><button class="btn sm danger" data-a="mhStop" ${ctl}>Arrêter</button></div>`;
    else if (s.state === "error") t = `<div class="note" style="margin-top:8px"><b>${escHTML(s.error || "Erreur")}</b></div><div style="margin-top:8px"><button class="btn sm" data-a="mhStart" ${ctl}>Réessayer</button></div>`;
    else t = `<div class="field"><div><b>Lien public</b><small>Joue hors du wifi, sans droits administrateur · nécessite internet</small></div><button class="btn sm" data-a="mhStart" ${ctl}>Démarrer</button></div>`;
    return lan + t + (s.canControl ? "" : `<div class="note" style="margin-top:8px">Les boutons sont réservés au PC qui héberge le serveur.</div>`);
  },
  bind(el) {
    const box = el.querySelector("#mh-box"); if (!box) return;
    clearTimeout(MultiHost.poll);
    const tick = async () => {
      if (!document.body.contains(box)) return;
      await MultiHost.call("GET"); box.innerHTML = MultiHost.html();
      if (MultiHost.st && MultiHost.st.state === "starting") MultiHost.poll = setTimeout(tick, 1200);
    };
    box.innerHTML = MultiHost.html(); tick();
  },
  copy() {
    const u = MultiHost.st && MultiHost.st.url; if (!u) return;
    const done = () => toast("Lien copié");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(done, () => MultiHost.copyOld(done)); else MultiHost.copyOld(done);
  },
  copyOld(done) { const i = document.getElementById("mh-url"); if (!i) return; i.select(); try { if (document.execCommand("copy")) done(); } catch (e) { } }
};
const DIFFS = { easy: "Facile", normal: "Normal", hard: "Difficile" };
const MODE_NAME = Object.fromEntries(MODES.map(m => [m.id, m.name]));

function missionsFor(tank) {
  const M = [
    ["Première patrouille", "Éliminez 2 chars ennemis isolés.", 2, 2, 3, 0, "easy", 0], ["Baptême du feu", "Trois cibles à détruire, renforts limités.", 3, 2, 3, 0, "easy", 0],
    ["Avance éclair", "Percez avant la fin du temps imparti.", 3, 3, 2, 360, "normal", 0], ["Embuscade", "Ennemis de rang supérieur : mieux vaut ne pas se découvrir.", 4, 3, 2, 0, "normal", 1],
    ["Contre-offensive", "Brisez la contre-attaque adverse.", 5, 3, 2, 0, "normal", 1], ["Percée blindée", "Quatre ennemis, temps compté.", 5, 4, 2, 420, "hard", 1],
    ["Siège de fer", "Tenez la ligne : deux vies seulement.", 6, 4, 2, 0, "hard", 1], ["Offensive finale", "Détruisez sept chars en huit minutes.", 7, 5, 2, 480, "hard", 1],
    ["Bataille de l'acier", "Une seule vie, ennemis de rang supérieur.", 8, 5, 1, 0, "hard", 2], ["Couronnement", "Dix cibles, six adversaires, dix minutes.", 10, 6, 2, 600, "hard", 2]
  ];
  const tier = TECH_TREE[tank].tier;
  return M.map((m, i) => {
    const t = Math.min(12, Math.max(1, tier + m[7]));
    return { idx: i, num: i + 1, name: m[0], desc: m[1], kills: m[2], enemies: m[3], lives: m[4], timeLimit: m[5], difficulty: m[6], tierOffset: m[7], enemyTier: t, reward: (i + 1) * 200,
      enemyTanks: Object.keys(TECH_TREE).filter(k => TECH_TREE[k].tier === t && TANK_MODULES[k]) };
  });
}

/* ───── Cartes (vignettes réelles issues du générateur de terrain) ───── */
const MapImgs = { data: {}, pending: null };
MapImgs.load = function () {
  if (MapImgs.pending) return MapImgs.pending;
  MapImgs.pending = (async () => {
    for (const t of MAP_THEMES) { const c = await TerrainGen.generate(t, 220); MapImgs.data[t] = c.toDataURL("image/jpeg", 0.8); const imgs = $$(`img[data-map="${t}"]`); imgs.forEach(i => i.src = MapImgs.data[t]); }
  })();
  return MapImgs.pending;
};
function mapTile(id, label, on) {
  const inner = id === "random" ? `<div class="rnd">?</div>` : `<img data-map="${id}" src="${MapImgs.data[id] || "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="}" alt="" style="display:block;width:100%;aspect-ratio:1/1.06;object-fit:cover;background:#10181d">`;
  return `<button class="map ${on ? "on" : ""}" data-a="theme" data-v="${id}" title="${id === "random" ? "Carte aléatoire" : (MAP_THEME_META[id]?.vibe || label)}">${inner}<span>${label}</span></button>`;
}

/* ───── Lancement ───── */
function launch(over) {
  const cfg = Object.assign(Store.cfg(), over || {}), tank = Store.tank();
  const a = { mode: cfg.mode, theme: cfg.theme, allies: cfg.allies, enemies: cfg.enemies, difficulty: cfg.difficulty, scoreToWin: cfg.scoreToWin, respawnBots: cfg.respawnBots };
  if (cfg.mode === "sandbox") { a.scoreToWin = 0; a.respawnBots = true; }
  if (cfg.mode === "deathmatch") { a.respawnBots = false; }
  if (cfg.mode === "test") { a.scoreToWin = 0; a.respawnBots = true; a.allies = 0; a.testTarget = cfg.testTarget; a.testBehavior = cfg.testBehavior; a.testDist = cfg.testDist; a.selfTank = cfg.testSelf || tank; }
  if (cfg.mode === "multi") {
    const rm = Multi.room;
    if (rm && rm.open && rm.cfg) Object.assign(a, rm.cfg);          // on rejoint : la salle impose la carte et les règles
    if (!a.theme || a.theme === "random") a.theme = MAP_THEMES[Math.floor(Math.random() * MAP_THEMES.length)];
    a.net = { server: Multi.server() };
  }
  if (cfg.mode === "campaign") {
    const m = missionsFor(tank)[Math.min(cfg.mission, 9)]; a.mission = { idx: m.idx, num: m.num, name: m.name, kills: m.kills, lives: m.lives, timeLimit: m.timeLimit, reward: m.reward };
    a.enemies = m.enemies; a.allies = 0; a.difficulty = m.difficulty; a.enemyTanks = m.enemyTanks; a.respawnBots = true;
  }
  localStorage.setItem("arenaConfig", JSON.stringify(a));
  location.href = "arena.html";
}
function cfgSummary(cfg) {
  const map = cfg.theme === "random" ? "Carte aléatoire" : MAP_THEME_LABELS[cfg.theme];
  switch (cfg.mode) {
    case "test": return [`Champ d'essai`, `${map} · ${cfg.enemies} cible${cfg.enemies > 1 ? "s" : ""} · ${TEST_BEHAV[cfg.testBehavior]} · ${cfg.testDist} m`];
    case "sandbox": return [`Entraînement`, `${map} · ${cfg.enemies} cible${cfg.enemies > 1 ? "s" : ""}`];
    case "skirmish": return [`Escarmouche · ${cfg.allies + 1} contre ${cfg.enemies}`, `${map} · ${DIFFS[cfg.difficulty]} · premier à ${cfg.scoreToWin}`];
    case "deathmatch": return [`Deathmatch · ${cfg.allies + 1} contre ${cfg.enemies}`, `${map} · ${DIFFS[cfg.difficulty]} · but : éliminer toute l'équipe ennemie`];
    case "multi": return [`Multijoueur local`, `${map} · équipes automatiques · premier à ${cfg.scoreToWin}`];
    case "campaign": { const m = missionsFor(Store.tank())[Math.min(cfg.mission, 9)]; return [`Mission ${m.num} — ${m.name}`, `${map} · ${m.kills} cibles · ${m.lives} vie${m.lives > 1 ? "s" : ""}${m.timeLimit ? " · " + Math.round(m.timeLimit / 60) + " min" : ""}`]; }
  }
}

/* ===================================================================
   01 QG
   =================================================================== */
const SecHQ = {
  render(el) {
    const tank = Store.tank(), I = tankInfo(tank), cfg = Store.cfg(), L = Store.level(), hist = Store.history()[0];
    const [sum, sub] = cfgSummary(cfg);
    const avail = Object.keys(TECH_TREE).filter(Store.canResearch).sort((a, b) => TECH_TREE[a].cost - TECH_TREE[b].cost)[0];
    const ready = Store.milestones().filter(m => m.ready), next = Store.milestones().filter(m => !m.claimed && !m.ready).sort((a, b) => b.cur / b.goal - a.cur / a.goal)[0];
    const menuCards = [
      { id: "hangar", action: "goHangar", label: "Hangar", desc: "Sélectionner le char", icon: "H" },
      { id: "play", action: "goPlay", label: "Combat", desc: "Configurer et lancer", icon: "C" },
      { id: "research", action: "goResearch", label: "Recherche", desc: "Arbre technologique", icon: "R" },
      { id: "career", action: "goCareer", label: "Carrière", desc: "Statistiques", icon: "K" },
      { id: "settings", action: "goSettings", label: "Réglages", desc: "Contrôles & rendu", icon: "S" }
    ];

    el.innerHTML = `<div class="wt-lobby">
      <div class="wt-viewport card cut" id="hq-view">
        <div class="wt-topbar">
          <div class="wt-pill"><span>Véhicule</span><strong>${escHTML(tank)}</strong></div>
          <div class="wt-pill"><span>Déploiement</span><strong>${sum}</strong></div>
        </div>
        <div class="wt-bottombar">
          <div class="wt-meta-tags">
            <span class="tag amber">${I.nation.name}</span>
            <span class="tag">Rang ${ROMAN[I.tier]}</span>
            <span class="tag">${I.cat}</span>
          </div>
          <div class="wt-stat-grid">
            <div class="wt-stat"><label>Vitesse</label><strong>${I.p.speedKmh} km/h</strong></div>
            <div class="wt-stat"><label>Canon</label><strong>${I.p.caliber} mm</strong></div>
            <div class="wt-stat"><label>Poids</label><strong>${I.p.weightTons.toFixed(0)} t</strong></div>
            <div class="wt-stat"><label>Équipage</label><strong>${I.p.crew}</strong></div>
          </div>
          <div class="wt-actions">
            <button class="btn primary big" data-a="launch">Combattre</button>
            <button class="btn" data-a="goPlay">Modifier</button>
            <button class="btn" data-a="goHangar">Hangar</button>
          </div>
        </div>
      </div>

      <div class="wt-sidebar">
        

        <div class="wt-panel card cut">
          <div class="wt-panel-head">Progression</div>
          <div class="wt-panel-body">
            <div class="wt-level-row">
              <strong>Niveau ${L.level}</strong>
              <span class="tag amber num">${fmt(Store.xp())} XP</span>
            </div>
            <div class="wt-level-sub">${fmt(L.next - L.into)} vers le niveau suivant</div>
            <div class="bar"><i style="width:${Math.round(L.into / L.next * 100)}%"></i></div>
            <div class="wt-line"><span>Recherche</span><b>${avail ? `${escHTML(avail)} · ${fmt(TECH_TREE[avail].cost)} XP` : "Arbre terminé"}</b></div>
            <div class="wt-mini-actions">
              <button class="btn sm primary" data-a="goResearch">Recherche</button>
              <button class="btn sm" data-a="goCareer">Carrière</button>
            </div>
          </div>
        </div>

        <div class="wt-panel card cut">
          <div class="wt-panel-head">Jalons</div>
          <div class="wt-panel-body">
            ${ready.length ? ready.slice(0, 2).map(m => `<div class="wt-mission"><div><strong>${m.name}</strong><small>${m.desc}</small></div><button class="btn sm primary" data-a="claim" data-id="${m.id}">+${m.xp}</button></div>`).join("") : next ? `<div class="wt-mission"><div><strong>${next.name}</strong><small>${next.desc}</small></div><span class="tag">+${next.xp}</span></div>` : `<div class="muted">Tous les jalons sont réclamés.</div>`}
          </div>
        </div>

        <div class="wt-panel card cut">
          <div class="wt-panel-head">Dernière partie</div>
          <div class="wt-panel-body">
            ${hist ? `<div class="wt-history"><span class="r ${hist.result === "WIN" ? "w" : "l"}">${hist.result === "WIN" ? "V" : "D"}</span><div><strong>${escHTML(hist.tank || "")}</strong><small>${MODE_NAME[hist.mode] || hist.mode} · ${MAP_THEME_LABELS[hist.map] || hist.map}</small></div><b class="num">+${fmt(hist.xp || 0)}</b></div>` : `<div class="muted">Aucune partie jouée.</div>`}
          </div>
        </div>
      </div>
    </div>`;

    Preview.attach($("#hq-view")); Preview.show(tank).then(() => { const s = $("#hq-model"); if (s) { s.textContent = Preview.model ? "Modèle 3D fourni" : "Assemblage procédural"; s.className = "status tag " + (Preview.model ? "ok" : ""); } });
    on(el, {
      launch: () => launch(),
      goPlay: () => Nav.go("play"),
      goHangar: () => Nav.go("hangar"),
      goResearch: () => Nav.go("research"),
      goCareer: () => Nav.go("career"),
      goSettings: () => Nav.go("settings"),
      claim: d => { const x = Store.claim(d.id); if (x) { toast(`+${x} XP`); refreshAll(); } }
    });
  }
};

/* ===================================================================
   02 COMBAT
   =================================================================== */
const SecPlay = {
  render(el) {
    const cfg = Store.cfg(), tank = Store.tank(), I = tankInfo(tank), mode = cfg.mode;
    MapImgs.load();
    const stepper = (k, v, mn, mx) => `<div class="stepper"><button data-a="step" data-k="${k}" data-d="-1">−</button><output>${v}</output><button data-a="step" data-k="${k}" data-d="1">+</button></div>`;
    const seg = (k, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? "on" : ""}" data-a="set" data-k="${k}" data-v="${v}">${l}</button>`).join("")}</div>`;
    const sm = MAPS[cfg.theme];
    const mapInfo = sm ? `<div class="mapinfo"><b>${escHTML(sm.label)}</b><span>${escHTML(sm.place)}</span><p>${escHTML(sm.desc)}</p><em>${escHTML(sm.tags)}</em></div>` : `<div class="mapinfo"><b>Carte aléatoire</b><p>Une des ${MAP_THEMES.length} cartes est tirée au sort au lancement.</p></div>`;
    const maps = `<div class="maps">${mapTile("random", "Aléatoire", cfg.theme === "random")}${MAP_THEMES.map(t => mapTile(t, MAP_THEME_META[t]?.name || MAP_THEME_LABELS[t], cfg.theme === t)).join("")}</div>${mapInfo}`;
    let left = "";
    if (mode === "test") {
      left = `<div class="card"><h3>Cibles et adversaires</h3><div class="body">
          <div class="field"><div><b>Mon char pour l'essai</b><small>Tous les véhicules sont disponibles ici, sans recherche</small></div><select class="inp" data-sel="testSelf">${tankOptions(cfg.testSelf, false)}</select></div>
          <div class="field"><div><b>Char des cibles</b><small>Le modèle adverse à tester (blindage, zones de touche)</small></div><select class="inp" data-sel="testTarget">${tankOptions(cfg.testTarget, true)}</select></div>
          <div class="field"><div><b>Comportement</b><small>Inertes : mannequins. Fixes : ils vous visent. Mouvement : ils roulent sans tirer.</small></div>${seg("testBehavior", [["static", "Inertes"], ["static_fire", "Fixes, tirent"], ["patrol", "Mouvement"], ["combat", "Combat"]], cfg.testBehavior)}</div>
          <div class="field"><div><b>Nombre de cibles</b><small>Alignées face à vous</small></div>${stepper("enemies", cfg.enemies)}</div>
          <div class="field"><div><b>Distance</b><small>Entre votre char et les cibles</small></div>${seg("testDist", [[50, "50 m"], [100, "100 m"], [150, "150 m"], [250, "250 m"], [350, "350 m"]], cfg.testDist)}</div>
          <div class="field"><div><b>Précision de l'IA</b><small>Pour les cibles qui tirent</small></div>${seg("difficulty", [["easy", "Facile"], ["normal", "Normal"], ["hard", "Difficile"]], cfg.difficulty)}</div>
        </div></div>
        <div class="card" style="margin-top:16px"><h3>Carte</h3><div class="body">${maps}</div></div>`;
    } else if (mode === "sandbox" || mode === "skirmish" || mode === "deathmatch") {
      left = `<div class="card"><h3>Carte</h3><div class="body">${maps}</div></div>
        <div class="card" style="margin-top:16px"><h3>Effectifs et règles</h3><div class="body">
          ${mode === "skirmish" || mode === "deathmatch" ? `<div class="field"><div><b>Alliés</b><small>Chars de votre camp contrôlés par l'IA</small></div>${stepper("allies", cfg.allies)}</div>` : ""}
          <div class="field"><div><b>${mode === "sandbox" ? "Cibles" : "Ennemis"}</b><small>${mode === "sandbox" ? "Chars adverses, réapparition après destruction" : "Chars adverses contrôlés par l'IA"}</small></div>${stepper("enemies", cfg.enemies)}</div>
          <div class="field"><div><b>Difficulté de l'IA</b><small>Précision, anticipation et cadence de tir</small></div>${seg("difficulty", [["easy", "Facile"], ["normal", "Normal"], ["hard", "Difficile"]], cfg.difficulty)}</div>
          ${mode === "skirmish" ? `<div class="field"><div><b>Score à atteindre</b><small>Destructions + points de zones capturées</small></div>${seg("scoreToWin", [[5, "5"], [10, "10"], [15, "15"], [20, "20"]], cfg.scoreToWin)}</div>
          <div class="field"><div><b>Réapparition de l'IA</b><small>Les chars détruits reviennent après 9 secondes</small></div><button class="toggle ${cfg.respawnBots ? "on" : ""}" data-a="toggleRespawn" aria-label="Réapparition"></button></div>` : ""}
          ${mode === "deathmatch" ? `<div class="field"><div><b>Objectif</b><small>Éliminer toute l'équipe adverse, sans capture de zones.</small></div><span class="tag amber">Deathmatch</span></div>` : ""}
        </div></div>`;
    } else if (mode === "multi") {
      left = `<div class="card"><h3>Serveur local</h3><div class="body">
        <div class="field"><div><b>Adresse du serveur</b><small>Affichée par « node server.js » sur le PC hôte (ex. 192.168.1.23:3000)</small></div><input class="inp" id="mp-srv" value="${escHTML(Multi.server())}" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><div><b>Votre nom</b><small>Visible par les autres joueurs</small></div><input class="inp" id="mp-name" maxlength="16" value="${escHTML(Store.name())}"></div>
        <div class="note" id="mp-status" style="margin-top:8px">Recherche du serveur…</div></div></div>
        <div class="card" style="margin-top:16px"><h3>Carte</h3><div class="body">${maps}</div></div>
        <div class="card" style="margin-top:16px"><h3>Règles de la partie</h3><div class="body"><small class="muted">Appliquées seulement si vous créez la partie ; sinon vous rejoignez celle de l'hôte.</small>
          <div class="field"><div><b>Bots alliés</b><small>Chars IA dans l'équipe A (gérés par l'hôte)</small></div>${stepper("allies", cfg.allies)}</div>
          <div class="field"><div><b>Bots ennemis</b><small>Chars IA dans l'équipe B</small></div>${stepper("enemies", cfg.enemies)}</div>
          <div class="field"><div><b>Score à atteindre</b><small>Destructions + zones capturées</small></div>${seg("scoreToWin", [[5, "5"], [10, "10"], [15, "15"], [20, "20"]], cfg.scoreToWin)}</div>
          <div class="field"><div><b>Réapparition de l'IA</b><small>Les bots détruits reviennent après 9 secondes</small></div><button class="toggle ${cfg.respawnBots ? "on" : ""}" data-a="toggleRespawn" aria-label="Réapparition"></button></div>
        </div></div>`;
    } else if (mode === "campaign") {
      const ms = missionsFor(tank), done = Store.campaignDone(tank), cur = Math.min(cfg.mission, 9);
      const unlocked = i => i === 0 || done.has(i - 1) || done.has(i);
      left = `<div class="card"><h3>Missions — ${escHTML(tank)} <span class="num muted">${done.size}/10</span></h3><div class="body"><div class="missions">${ms.map((m, i) => `<button class="ms ${i === cur ? "on" : ""} ${done.has(i) ? "done" : ""}" ${unlocked(i) ? "" : "disabled"} data-a="mission" data-i="${i}">
        <span class="mn">MISSION ${m.num}</span><b>${m.name}</b><small>${m.desc}<br>${m.kills} cibles · ${m.lives} vie${m.lives > 1 ? "s" : ""}${m.timeLimit ? " · " + m.timeLimit / 60 + " min" : ""} · ennemis rang ${ROMAN[m.enemyTier]}</small>
        <span class="st tag ${done.has(i) ? "ok" : unlocked(i) ? "amber" : ""}">${done.has(i) ? "Réussie" : unlocked(i) ? "+" + m.reward + " XP" : "Verrouillée"}</span></button>`).join("")}</div></div></div>
        <div class="card" style="margin-top:16px"><h3>Carte</h3><div class="body">${maps}</div></div>`;
    }
    // récapitulatif
    const [sum, sub] = cfgSummary(cfg);
    const xpRule = mode === "test" ? "Pas d'XP : touche K pour réinitialiser cibles et dégâts en plein essai." : mode === "sandbox" ? "Pas d'XP en entraînement." : mode === "campaign" ? "XP de partie + récompense de mission en cas de victoire." : mode === "deathmatch" ? "XP de partie, score basé sur les éliminations et les dégâts." : `XP de partie, ×${{ easy: 0.7, normal: 1, hard: 1.4 }[cfg.difficulty]} selon la difficulté.`;
    const canGo = true;
    if (mode === "multi") {                       // Multijoueur : salons actifs, joueurs en ligne, salle d'attente (lobby-rooms.js)
      el.innerHTML = `<div class="modes">${MODES.map(m => `<button class="mode ${m.id === mode ? "on" : ""}" data-a="mode" data-id="${m.id}"><span class="mi">${m.n}</span><h3>${m.name}</h3><p>${m.desc}</p></button>`).join("")}</div><div id="salons"></div>`;
      on(el, { mode: d => { Salons.stop(); Store.setCfg({ mode: d.id }); SecPlay.render(el); } });
      Salons.mount(el.querySelector("#salons")); return;
    }
    Salons.stop();
    el.innerHTML = `<div class="modes">${MODES.map(m => `<button class="mode ${m.id === mode ? "on" : ""}" data-a="mode" data-id="${m.id}"><span class="mi">${m.n}</span><h3>${m.name}</h3><p>${m.desc}</p></button>`).join("")}</div>
      <div class="play-grid"><div>${left}</div>
      <div class="card cut recap" style="position:sticky;top:0"><h3>Récapitulatif</h3><div class="body">
        <div class="big">${sum}</div><div class="muted" style="margin:3px 0 12px">${sub}</div>
        <div class="kv"><span>Véhicule</span><b>${escHTML(mode === "test" && cfg.testSelf ? cfg.testSelf : tank)}</b></div><div class="kv"><span>Classe</span><b>${I.cat} · rang ${ROMAN[I.tier]}</b></div><div class="kv"><span>Obus</span><b>${Store.ammo().join(" / ")}</b></div>
        <div class="note" style="margin:12px 0">${xpRule}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary big" data-a="go" ${canGo ? "" : "disabled"}>Déployer</button><button class="btn" data-a="goHangar">Changer de véhicule</button></div></div></div></div>`;
    const rerender = () => SecPlay.render(el);
    el.querySelectorAll("select[data-sel]").forEach(s => s.addEventListener("change", () => { Store.setCfg({ [s.dataset.sel]: s.value }); rerender(); }));
    if (mode === "multi") {
      const st = el.querySelector("#mp-status"), srv = el.querySelector("#mp-srv"), nm = el.querySelector("#mp-name");
      const upd = () => Multi.refresh().then(() => { const s2 = el.querySelector("#mp-status"); if (s2) s2.innerHTML = Multi.statusHTML(); });
      srv.addEventListener("change", () => { Multi.setServer(srv.value); st.textContent = "Recherche du serveur…"; upd(); });
      nm.addEventListener("change", () => Store.setName(nm.value));
      upd();
    }
    on(el, {
      mode: d => { Store.setCfg({ mode: d.id }); rerender(); }, theme: d => { Store.setCfg({ theme: d.v }); rerender(); },
      set: d => { const v = isNaN(+d.v) ? d.v : +d.v; Store.setCfg({ [d.k]: v }); rerender(); },
      step: d => { const c = Store.cfg(), lim = { allies: [0, 7], enemies: [c.mode === "sandbox" || c.mode === "multi" ? 0 : 1, 8] }[d.k]; Store.setCfg({ [d.k]: Math.max(lim[0], Math.min(lim[1], c[d.k] + +d.d)) }); rerender(); },
      toggleRespawn: () => { Store.setCfg({ respawnBots: !Store.cfg().respawnBots }); rerender(); },
      mission: d => { Store.setCfg({ mission: +d.i }); rerender(); }, goHangar: () => Nav.go("hangar"),
      go: () => { if (mode === "multi") { const n = el.querySelector("#mp-name"), s = el.querySelector("#mp-srv"); if (n) Store.setName(n.value); if (s) Multi.setServer(s.value); Multi.refresh().then(() => launch()); } else launch(); }
    });
  }
};

/* ===================================================================
   03 HANGAR
   =================================================================== */
const hg = { cat: "all", nat: "all", sel: null };
function armorSVG(I) {
  const a = I.m.armor || {}, g = k => { const p = a[k]; if (!p) return null; return typeof p === "object" ? p : { thickness: p, angle: 0 }; };
  const t = (p, dx, dy, anchor = "middle") => p ? `<text x="${dx}" y="${dy}" text-anchor="${anchor}" fill="#e8eef2" font-size="15" font-weight="700" font-family="Roboto Condensed, Arial Narrow, sans-serif">${Math.round(p.thickness)}<tspan font-size="10" fill="#93a1ab" dx="2">${p.angle ? p.angle + "°" : ""}</tspan></text>` : "";
  const W = 74, Ln = Math.max(110, Math.min(170, W * I.p.L / I.p.W * 0.82)), cx = 110, top = 120 - Ln / 2;
  const tr = Math.max(20, Math.min(34, I.p.tu.w * 9));
  return `<svg class="armor-svg" viewBox="0 0 220 240"><defs><pattern id="hh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(190,215,230,.18)" stroke-width="2"/></pattern></defs>
    <rect x="${cx - W / 2}" y="${top}" width="${W}" height="${Ln}" fill="url(#hh)" stroke="#6f8796" stroke-width="2"/>
    <rect x="${cx - W / 2 - 9}" y="${top + 4}" width="9" height="${Ln - 8}" fill="#1a232a" stroke="#6f8796"/><rect x="${cx + W / 2}" y="${top + 4}" width="9" height="${Ln - 8}" fill="#1a232a" stroke="#6f8796"/>
    <circle cx="${cx}" cy="${120 + (I.p.tu.x || 0) * -2}" r="${tr}" fill="rgba(255,176,0,.14)" stroke="#ffb000" stroke-width="2"/>
    <line x1="${cx}" y1="${120 + (I.p.tu.x || 0) * -2}" x2="${cx}" y2="${top - 8}" stroke="#ffb000" stroke-width="3"/>
    ${t(g("hullFront"), cx, top - 12)}${t(g("hullRear"), cx, top + Ln + 18)}${t(g("hullSide"), cx - W / 2 - 16, 124, "end")}${t(g("hullSide"), cx + W / 2 + 16, 124, "start")}
    ${t(g("turretFront"), cx, 120 - tr - 4 + (I.p.tu.x || 0) * -2)}${t(g("turretSide"), cx + tr + 6, 124 + (I.p.tu.x || 0) * -2, "start")}${t(g("turretRear"), cx, 120 + tr + 16 + (I.p.tu.x || 0) * -2)}
    <text x="6" y="14" fill="#93a1ab" font-size="11" font-family="Roboto Condensed, Arial Narrow, sans-serif" letter-spacing="1.5">BLINDAGE (mm · inclinaison)</text></svg>`;
}
function specBlock(I) {
  const m = I.m, p = I.p;
  return `<div class="kv"><span>Canon</span><b>${I.t.canon || "—"}</b></div><div class="kv"><span>Calibre</span><b>${p.caliber} mm</b></div><div class="kv"><span>Rechargement</span><b>${(m.reloadSec || p.reloadSec).toFixed(1)} s</b></div>
    <div class="kv"><span>Vitesse max.</span><b>${m.speed || p.speedKmh} km/h</b></div><div class="kv"><span>Masse</span><b>${(m.weightTons || p.weightTons).toFixed(1)} t</b></div><div class="kv"><span>Équipage</span><b>${m.crew || p.crew}</b></div>
    <div class="kv"><span>Rotation de la tourelle</span><b>${m.turretRotSpeed || 15} °/s</b></div><div class="kv"><span>Débattement du canon</span><b>${p.casemate ? "±" + p.traverse / 2 + "° (casemate)" : "360°"}</b></div>
    <div class="kv"><span>Longueur × largeur</span><b>${p.L.toFixed(1)} × ${p.W.toFixed(1)} m</b></div>`;
}
const SecHangar = {
  render(el) {
    const cur = Store.tank(); if (!hg.sel || !Store.isResearched(hg.sel)) hg.sel = cur;
    const all = Store.researchedList();
    const cats = [...new Set(all.map(n => tankInfo(n).p.cat))];
    const list = all.filter(n => (hg.cat === "all" || tankInfo(n).p.cat === hg.cat) && (hg.nat === "all" || tankInfo(n).p.nation === hg.nat)).sort((a, b) => TECH_TREE[a].tier - TECH_TREE[b].tier || a.localeCompare(b));
    const I = tankInfo(hg.sel), [a1, a2] = Store.ammo(), isCur = hg.sel === cur, nTo = Object.keys(TECH_TREE).length - all.length;
    const ammoKeys = getAvailableAmmos(hg.sel);
    el.innerHTML = `<div class="hangar">
      <div class="card hg-list cut"><div class="filters">
        <button class="fchip ${hg.cat === "all" ? "on" : ""}" data-a="cat" data-v="all">Tous</button>${cats.map(c => `<button class="fchip ${hg.cat === c ? "on" : ""}" data-a="cat" data-v="${c}">${TANK_CATEGORIES[c].label}</button>`).join("")}
        <span style="width:100%"></span>${NATION_KEYS.map(n => `<button class="fchip ${hg.nat === n ? "on" : ""}" data-a="nat" data-v="${n}" style="${hg.nat === n ? "" : "border-left:3px solid " + NATIONS[n].color}">${NATIONS[n].name}</button>`).join("")}${hg.nat !== "all" ? `<button class="fchip" data-a="nat" data-v="all">✕</button>` : ""}</div>
        <div class="tlist">${list.map(n => { const x = tankInfo(n); return `<button class="trow ${n === hg.sel ? "on" : ""} ${n === cur ? "cur" : ""}" data-a="pick" data-n="${escHTML(n)}"><i style="background:${x.nation.color}"></i><span><b>${escHTML(n)}</b><small>${x.nation.name} · rang ${ROMAN[x.tier]} · ${x.cat}</small></span></button>`; }).join("") || `<div class="empty">Aucun véhicule pour ce filtre.</div>`}</div>
        <div class="filters" style="border-top:1px solid var(--line);border-bottom:0;justify-content:space-between;align-items:center"><span class="muted" style="font-size:13px">${nTo} à rechercher</span><button class="btn sm" data-a="goResearch">Recherche</button></div></div>
      <div class="hg-mid"><div class="card cut viewer" id="hg-view"><span class="status tag" id="hg-model">…</span><span class="hint">Glisser · molette</span>
        <div class="ov"><div><h2>${escHTML(hg.sel)}</h2><div class="sub">${I.nation.name} · rang ${ROMAN[I.tier]} · ${I.cat}</div></div><div style="pointer-events:auto">${isCur ? `<span class="tag ok">Véhicule actif</span>` : `<button class="btn primary" data-a="choose">Choisir ce véhicule</button>`}</div></div></div>
        <div class="card"><h3>Munitions <span class="muted" style="font-size:13px;letter-spacing:.06em;text-transform:none">Touches 1 et 2 en combat</span></h3><div class="body"><div class="ammo-row">${ammoKeys.map(k => { const d = I.m.ammo[k], sel1 = isCur && k === a1, sel2 = isCur && k === a2; const info = ammoData[k] || {}; return `<div class="am ${sel1 ? "s1" : sel2 ? "s2" : ""}" title="${escHTML(info.desc || "")}"><b style="color:${info.color || "#fff"}">${k}</b>${sel1 ? `<span class="sl tag" style="color:var(--ally);border-color:var(--ally)">Obus 1</span>` : sel2 ? `<span class="sl tag amber">Obus 2</span>` : ""}<small>Pénétration ${d.penetration} mm · dégâts ${d.damage}</small><small>${d.muzzleVelocity} m/s · ${d.caliber} mm</small><div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm" data-a="ammo" data-s="1" data-k="${k}" ${isCur ? "" : "disabled"}>1</button><button class="btn sm" data-a="ammo" data-s="2" data-k="${k}" ${isCur ? "" : "disabled"}>2</button></div></div>`; }).join("")}</div>
        ${isCur ? "" : `<div class="note" style="margin-top:10px">Choisissez ce véhicule pour configurer ses munitions.</div>`}</div></div></div>
      <div class="card hg-spec cut"><h3>Fiche technique</h3><div class="body">${specBlock(I)}${armorSVG(I)}<div class="note" style="margin-top:10px">Valeurs réellement utilisées par le moteur de combat.</div><div style="margin-top:12px"><button class="btn" data-a="atelier">Modifier l'apparence (Atelier)</button></div></div></div></div>`;
    Preview.attach($("#hg-view")); Preview.show(hg.sel).then(() => { const s = $("#hg-model"); if (s) { s.textContent = Preview.model ? "Modèle 3D fourni" : "Assemblage procédural"; s.className = "status tag " + (Preview.model ? "ok" : ""); } });
    const re = () => SecHangar.render(el);
    on(el, {
      cat: d => { hg.cat = d.v; re(); }, nat: d => { hg.nat = d.v; re(); }, pick: d => { hg.sel = d.n; re(); }, goResearch: () => Nav.go("research"), atelier: () => { location.href = "editor.html?tank=" + encodeURIComponent(hg.sel); },
      choose: () => { Store.setTank(hg.sel); refreshAll(); toast("Véhicule actif : " + hg.sel); },
      ammo: d => { Store.setAmmo(+d.s, d.k); re(); }
    });
  }
};

/* ===================================================================
   07 ATELIER — liste des chars dessinés (éditeur 3D : editor.html)
   =================================================================== */
const SecAtelier = {
  render(el) {
    const all = Object.values(TankDesigns.all()).sort((a, b) => (b.updated || 0) - (a.updated || 0)), act = TankDesigns.activeMap();
    el.innerHTML = `<div class="card cut"><h3>Atelier de chars</h3><div class="body">
        <div class="muted" style="margin-bottom:12px;font-size:14px">Modélisez vos propres véhicules en 3D (caisse, tourelle, canon, chenilles, détails, peinture et camouflage), puis activez-les : ils remplacent l'apparence du char choisi dans le hangar et au combat. Les statistiques ne changent pas.</div>
        <button class="btn primary" data-a="open">Ouvrir l'atelier</button></div></div>
      <div class="card" style="margin-top:16px"><h3>Mes chars <span class="num muted">${all.length}</span></h3><div class="body">${all.map(d => { const on = Object.keys(act).filter(k => act[k] === d.id); return `<div class="field"><div><b>${escHTML(d.name)}</b><small>${d.parts.length} pièces${on.length ? " · actif sur " + on.map(escHTML).join(", ") : " · non utilisé en jeu"}</small></div><div style="display:flex;gap:8px"><button class="btn" data-a="edit" data-id="${d.id}">Modifier</button><button class="btn" data-a="del" data-id="${d.id}">Supprimer</button></div></div>`; }).join("") || `<div class="muted">Aucun char pour l'instant : ouvrez l'atelier, choisissez un style de départ et commencez à modeler.</div>`}</div></div>`;
    on(el, {
      open: () => { location.href = "editor.html"; }, edit: d => { location.href = "editor.html?id=" + d.id; },
      del: d => { if (confirm("Supprimer ce char ?")) { TankDesigns.remove(d.id); SecAtelier.render(el); } }
    });
  }
};

/* ===================================================================
   04 RECHERCHE
   =================================================================== */
const rs = { sel: null, nationIndex: 0, orient: (function () { try { return localStorage.getItem("researchOrient") || "h"; } catch (e) { return "h"; } })() };

/* Drapeaux dessinés en SVG (les emoji de drapeaux ne s'affichent pas sous Windows). */
const RS_FLAGS = (function () {
  const star = (cx, cy, R, r, n) => { let p = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r : R; p.push((cx + d * Math.cos(a)).toFixed(1) + "," + (cy + d * Math.sin(a)).toFixed(1)); } return p.join(" "); };
  const w = c => `<svg class="flag" viewBox="0 0 30 20" aria-hidden="true">${c}</svg>`, V = (a, b, c) => `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`;
  return {
    DE: w(`<rect width="30" height="7" fill="#111"/><rect y="7" width="30" height="6.7" fill="#d00"/><rect y="13.4" width="30" height="6.6" fill="#ffce00"/>`),
    SU: w(`<rect width="30" height="20" fill="#c8102e"/><polygon points="${star(7, 6, 4.2, 1.7, 5)}" fill="#ffd400"/>`),
    GB: w(`<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.5"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#c8102e" stroke-width="3.4"/>`),
    US: w(`<rect width="30" height="20" fill="#fff"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect y="${(i * 2 * 20 / 13).toFixed(2)}" width="30" height="${(20 / 13).toFixed(2)}" fill="#b22234"/>`).join("")}<rect width="13" height="10.8" fill="#3c3b6e"/>`),
    FR: w(V("#0055a4", "#fff", "#ef4135")),
    JP: w(`<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>`),
    IT: w(V("#009246", "#fff", "#ce2b37")),
    SE: w(`<rect width="30" height="20" fill="#006aa7"/><rect x="9" width="4" height="20" fill="#fecc00"/><rect y="8" width="30" height="4" fill="#fecc00"/>`),
    CN: w(`<rect width="30" height="20" fill="#de2910"/><polygon points="${star(7, 7, 4.4, 1.8, 5)}" fill="#ffde00"/>`),
    IL: w(`<rect width="30" height="20" fill="#fff"/><rect y="2.5" width="30" height="2.6" fill="#0038b8"/><rect y="14.9" width="30" height="2.6" fill="#0038b8"/><polygon points="${star(15, 10, 4.2, 4.2, 3)}" fill="none" stroke="#0038b8" stroke-width="1"/><polygon points="${star(15, 10, 4.2, 4.2, 3).split(" ").map((s, i) => { const [x, y] = s.split(",").map(Number); return (30 - x).toFixed(1) + "," + (20 - y).toFixed(1); }).join(" ")}" fill="none" stroke="#0038b8" stroke-width="1"/>`)
  };
})();

/* Pictogrammes de classe (silhouettes simplifiées). */
function rsGlyph(cat) {
  const hull = (y, h) => `<rect x="2" y="${y}" width="22" height="${h}" rx="2"/>`;
  const g = {
    light: hull(9, 3) + `<rect x="9" y="5" width="8" height="4" rx="1"/><rect x="17" y="6" width="9" height="1.4"/>`,
    medium: hull(8, 4) + `<rect x="8" y="3.5" width="10" height="4.5" rx="1"/><rect x="18" y="4.8" width="9" height="1.6"/>`,
    heavy: hull(7, 5) + `<rect x="6.5" y="2" width="13" height="5" rx="1"/><rect x="19.5" y="3.4" width="8" height="2"/>`,
    mbt: hull(9, 3) + `<polygon points="7,9 9.5,4 19,4 21,9"/><rect x="19" y="5.2" width="9" height="1.5"/>`,
    td_light: hull(9, 3) + `<polygon points="5,9 8,5 19,5 21,9"/><rect x="19" y="6.2" width="7" height="1.5"/>`,
    td_medium: hull(8, 4) + `<polygon points="4,8 8,3.5 19,3.5 22,8"/><rect x="21" y="4.8" width="7" height="1.8"/>`,
    td_heavy: hull(7, 5) + `<polygon points="3,7 7,2.5 20,2.5 23,7"/><rect x="22" y="3.6" width="6" height="2.2"/>`
  };
  return `<svg class="glyph" viewBox="0 0 28 14" fill="currentColor" aria-hidden="true">${g[cat] || g.medium}</svg>`;
}

/* Disposition en arbre : un rang = une colonne ; la 1re suite d'un véhicule reste sur sa ligne,
   les embranchements descendent d'une ligne (comme dans l'arbre de War Thunder). */
function rsLayout(nationKey) {
  const CAT_ORDER = ["light", "medium", "heavy", "mbt", "td_light", "td_medium", "td_heavy"];
  const names = Object.keys(TECH_TREE).filter(n => getTankProfile(n).nation === nationKey), kids = {}, roots = [];
  names.forEach(n => { kids[n] = []; });
  names.forEach(n => { const p = TECH_TREE[n].previous; if (p && kids[p]) kids[p].push(n); else roots.push(n); });
  const cmp = (a, b) => (CAT_ORDER.indexOf(getTankProfile(a).cat) - CAT_ORDER.indexOf(getTankProfile(b).cat)) || (TECH_TREE[a].tier - TECH_TREE[b].tier) || a.localeCompare(b);
  roots.sort(cmp); names.forEach(n => kids[n].sort(cmp));
  const row = {}; let next = 0;
  const walk = n => { const k = kids[n]; if (!k.length) { row[n] = next++; return row[n]; } const r = walk(k[0]); k.slice(1).forEach(walk); row[n] = r; return r; };
  roots.forEach(walk);
  return { names, row, rows: next, maxTier: Math.max(...names.map(n => TECH_TREE[n].tier)) };
}

const SecResearch = {
  render(el) {
    if (!rs.sel || !TECH_TREE[rs.sel]) rs.sel = Store.tank();
    const nationKey = NATION_KEYS[((rs.nationIndex % NATION_KEYS.length) + NATION_KEYS.length) % NATION_KEYS.length];
    const nation = NATIONS[nationKey], xp = Store.xp(), cur = Store.tank(), H = rs.orient !== "v";
    const L = rsLayout(nationKey);
    if (!L.names.includes(rs.sel)) rs.sel = L.names.find(n => n === cur) || L.names.find(Store.canResearch) || L.names.find(Store.isStarter) || L.names[0];
    const W = 150, CH = 108, GX = H ? 52 : 40, GY = 16, PAD = 14, HEAD = 46, SIDE = 70;
    const cx = (t, r) => H ? PAD + (t - 1) * (W + GX) : PAD + r * (W + GY);
    const cy = (t, r) => H ? PAD + r * (CH + GY) : PAD + (t - 1) * (CH + GX);
    const cw = H ? PAD * 2 + L.maxTier * (W + GX) - GX : PAD * 2 + L.rows * (W + GY) - GY;
    const ch = H ? PAD * 2 + L.rows * (CH + GY) - GY : PAD * 2 + L.maxTier * (CH + GX) - GX;
    const have = L.names.filter(Store.isResearched).length;

    /* tabs nations */
    const tabs = NATION_KEYS.map((k, i) => {
      const nm = Object.keys(TECH_TREE).filter(n => getTankProfile(n).nation === k), h = nm.filter(Store.isResearched).length;
      return `<button class="nt ${k === nationKey ? "on" : ""}" data-a="nat" data-i="${i}" style="--nc:${NATIONS[k].color}" title="${escHTML(NATIONS[k].name)}">${RS_FLAGS[k] || ""}<span class="nt-name">${escHTML(NATIONS[k].name)}</span><small class="num">${h}/${nm.length}</small></button>`;
    }).join("");

    /* bandes + étiquettes de rang */
    let bands = "", labels = "";
    for (let t = 1; t <= L.maxTier; t++) {
      const inRank = L.names.filter(n => TECH_TREE[n].tier === t), brs = inRank.map(n => TECH_TREE[n].br);
      const gate = inRank.length ? Store.rankGate(inRank[0]) : { ok: true, need: 0, have: 0, from: 0 };
      const brTxt = inRank.length ? `BR ${Math.min(...brs).toFixed(1)}–${Math.max(...brs).toFixed(1)}` : "—";
      const lock = !gate.ok ? `<span class="rk-lock" title="Il faut ${gate.need} véhicule(s) du rang ${ROMAN[gate.from]} (${gate.have}/${gate.need})">🔒 ${gate.have}/${gate.need}</span>` : "";
      const lab = `<div class="rk-label ${!gate.ok ? "closed" : ""} ${inRank.length ? "" : "empty"}" style="${H ? `left:${cx(t, 0) - GX / 2 + 2}px;width:${W + GX - 4}px` : `top:${cy(t, 0) - GX / 2 + 2}px;height:${CH + GX - 4}px`}"><b class="disp">Rang ${ROMAN[t]}</b><small class="num">${brTxt}</small>${lock}</div>`;
      labels += lab;
      bands += `<div class="rk-band ${t % 2 ? "odd" : ""} ${!gate.ok ? "closed" : ""}" style="${H ? `left:${cx(t, 0) - GX / 2}px;width:${W + GX}px;top:0;bottom:0` : `top:${cy(t, 0) - GX / 2}px;height:${CH + GX}px;left:0;right:0`}"></div>`;
    }

    /* liaisons orthogonales */
    let links = "";
    L.names.forEach(n => {
      const p = TECH_TREE[n].previous; if (!p || L.row[p] === undefined) return;
      const a = { t: TECH_TREE[p].tier, r: L.row[p] }, b = { t: TECH_TREE[n].tier, r: L.row[n] };
      const done = Store.isResearched(n), open = Store.isResearched(p) && !done, cls = done ? "done" : open ? "open" : "";
      let d;
      if (H) { const x1 = cx(a.t, a.r) + W, y1 = cy(a.t, a.r) + CH / 2, x2 = cx(b.t, b.r) - 1, y2 = cy(b.t, b.r) + CH / 2, xm = b.t - a.t === 1 ? x1 + GX / 2 : x2 - GX / 2; d = `M${x1} ${y1}H${xm}V${y2}H${x2}`; }
      else { const x1 = cx(a.t, a.r) + W / 2, y1 = cy(a.t, a.r) + CH, x2 = cx(b.t, b.r) + W / 2, y2 = cy(b.t, b.r) - 1, ym = b.t - a.t === 1 ? y1 + GX / 2 : y2 - GX / 2; d = `M${x1} ${y1}V${ym}H${x2}V${y2}`; }
      links += `<path class="lk ${cls}" d="${d}" marker-end="url(#ar-${done ? "ok" : open ? "op" : "no"})"/>`;
    });

    /* cartes de véhicule */
    const cards = L.names.map(n => {
      const t = TECH_TREE[n], hv = Store.isResearched(n), can = Store.canResearch(n), prevOk = !t.previous || Store.isResearched(t.previous);
      const gate = Store.rankGate(n), rlock = prevOk && !hv && !gate.ok, starter = Store.isStarter(n);
      const st = hv ? "have" : can ? "avail" : "lock", pc = getTankProfile(n);
      const foot = hv ? (starter ? "DÉPART" : "ACQUIS ✓") : can ? `<span class="num ${xp >= t.cost ? "" : "poor"}">${fmt(t.cost)} XP</span>` : rlock ? `RANG ${ROMAN[t.tier]} 🔒` : "🔒 VERROUILLÉ";
      return `<button class="vn ${st} ${rlock ? "rlock" : ""} ${n === rs.sel ? "sel" : ""} ${n === cur ? "cur" : ""}" data-a="sel" data-n="${escHTML(n)}" title="${escHTML(n)}" style="left:${cx(t.tier, L.row[n])}px;top:${cy(t.tier, L.row[n])}px;width:${W}px;height:${CH}px">
        <span class="vn-br num">${t.br.toFixed(1)}</span><span class="vn-cls">${rsGlyph(pc.cat)}</span>
        <span class="vn-img" data-th="${escHTML(n)}"></span><b class="vn-name">${escHTML(n)}</b><span class="vn-foot">${foot}</span></button>`;
    }).join("");

    const dirCls = rs.transitionDirection ? "nation-enter-" + rs.transitionDirection : ""; rs.transitionDirection = null;
    el.innerHTML = `<div class="sec-head" style="margin-bottom:10px"><div class="rs-tools"><span class="tag amber num">${fmt(xp)} XP</span><button class="btn sm" data-a="orient" title="Changer l'orientation de l'arbre">${H ? "↔ Rangs en colonnes" : "↕ Rangs en lignes"}</button><button class="btn sm" data-a="center">Véhicule actif</button></div></div>
      <div class="rs-layout"><div class="rs-main">
        <div class="nt-bar" id="nt-bar" style="--nc:${nation.color}">${tabs}</div>
        <div class="nt-sub"><span><b class="disp">${escHTML(nation.name)}</b> · <span class="num">${have}/${L.names.length}</span> véhicules recherchés</span>
          <span class="rs-legend"><i class="lg have"></i>Acquis<i class="lg avail"></i>Disponible<i class="lg lock"></i>Verrouillé</span></div>
        <div class="tree-view" id="tree-view" style="--nc:${nation.color}"><div class="tree-wrap ${H ? "h" : "v"} ${dirCls}" style="${H ? `width:${cw}px` : `width:${cw + SIDE}px`}">
          <div class="rk-bar" style="${H ? `height:${HEAD}px` : `width:${SIDE}px;height:${ch}px`}">${labels}</div>
          <div class="tree-canvas" style="width:${cw}px;height:${ch}px">${bands}
            <svg class="tree-links" width="${cw}" height="${ch}"><defs>
              <marker id="ar-ok" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#6fdc8c"/></marker>
              <marker id="ar-op" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#ffb000"/></marker>
              <marker id="ar-no" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#52626b"/></marker></defs>${links}</svg>${cards}</div></div></div>
      </div><aside class="rs-panel" id="rs-panel"></aside></div>`;

    SecResearch.panel(el);
    /* vignettes 3D */
    $$(".vn-img", el).forEach(d => Preview.thumb(d.dataset.th, url => { d.style.backgroundImage = `url(${url})`; d.classList.add("ready"); }));

    const view = $("#tree-view", el), changeNation = delta => { rs.nationIndex = (rs.nationIndex + delta + NATION_KEYS.length) % NATION_KEYS.length; rs.transitionDirection = delta > 0 ? "next" : "prev"; SecResearch.render(el); };
    const centerOn = n => { const b = $(`.vn[data-n="${CSS.escape ? CSS.escape(n) : n}"]`, el); if (b && view) view.scrollTo({ left: Math.max(0, b.offsetLeft - view.clientWidth / 2 + b.offsetWidth / 2 + (H ? 0 : SIDE)), top: Math.max(0, b.offsetTop - view.clientHeight / 2 + b.offsetHeight / 2), behavior: "smooth" }); };
    on(el, {
      sel: d => { rs.sel = d.n; $$(".vn", el).forEach(x => x.classList.toggle("sel", x.dataset.n === d.n)); SecResearch.panel(el); },
      nat: d => { const i = +d.i; if (i === rs.nationIndex) return; rs.transitionDirection = i > rs.nationIndex ? "next" : "prev"; rs.nationIndex = i; SecResearch.render(el); },
      orient: () => { rs.orient = H ? "v" : "h"; try { localStorage.setItem("researchOrient", rs.orient); } catch (e) {} SecResearch.render(el); },
      center: () => { const nk = getTankProfile(cur).nation; if (nk !== nationKey) { rs.nationIndex = NATION_KEYS.indexOf(nk); rs.sel = cur; SecResearch.render(el); } requestAnimationFrame(() => centerOn(cur)); }
    });

    /* glisser pour naviguer (souris) + balayage sur la barre des nations (tactile) */
    let drag = null, moved = false;
    view.onpointerdown = e => { if (e.pointerType !== "mouse" || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop }; moved = false; };
    window.onpointermove = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) { moved = true; view.classList.add("grabbing"); } if (moved) { view.scrollLeft = drag.sl - dx; view.scrollTop = drag.st - dy; } };
    window.onpointerup = () => { drag = null; view.classList.remove("grabbing"); };
    view.addEventListener("click", e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    let sx = null; const bar = $("#nt-bar", el);
    bar.ontouchstart = e => { sx = e.touches[0].clientX; }; bar.ontouchend = e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 70) changeNation(dx < 0 ? 1 : -1); };
    const act = $(".vn.cur", el) || $(".vn.sel", el); if (act && !rs.noAutoCenter) requestAnimationFrame(() => { const b = act; view.scrollLeft = Math.max(0, b.offsetLeft - view.clientWidth / 3); view.scrollTop = Math.max(0, b.offsetTop - view.clientHeight / 3); });
    const on_ = $(".nt.on", el); if (on_ && bar.scrollTo) bar.scrollTo({ left: on_.offsetLeft - bar.clientWidth / 2 + on_.offsetWidth / 2 });
  },
  panel(el) {
    const n = rs.sel, I = tankInfo(n), t = TECH_TREE[n], have = Store.isResearched(n), can = Store.canResearch(n), cost = t.cost, xp = Store.xp(), prev = t.previous;
    const gate = Store.rankGate(n), prevOk = !prev || Store.isResearched(prev);
    const nexts = Object.keys(TECH_TREE).filter(k => TECH_TREE[k].previous === n);
    const p = $("#rs-panel");
    let action;
    if (have) action = n === Store.tank() ? `<span class="tag ok">Véhicule actif</span>` : `<button class="btn primary" data-a="use">Choisir ce véhicule</button>`;
    else if (can) action = `<button class="btn primary" data-a="buy" ${xp >= cost ? "" : "disabled"}>Rechercher · ${fmt(cost)} XP</button>${xp >= cost ? "" : `<div class="muted" style="margin-top:8px;font-size:13px">Il vous manque ${fmt(cost - xp)} XP.</div>`}`;
    else if (!prevOk) action = `<div class="note warn">Recherchez d'abord <button class="lnk" data-a="sel" data-n="${escHTML(prev)}">${escHTML(prev)}</button>.</div>`;
    else action = `<div class="note warn">Rang ${ROMAN[t.tier]} verrouillé : possédez ${gate.need} véhicule(s) du rang ${ROMAN[gate.from]} de cette nation <span class="num">(${gate.have}/${gate.need})</span>.</div>`;
    p.innerHTML = `<div class="card cut"><div class="viewer" id="rs-view" style="border-bottom:1px solid var(--line)"></div><div class="body">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b class="disp" style="font-size:26px;line-height:1.05">${escHTML(n)}</b><span class="tag amber num">Rang ${ROMAN[I.tier]} · BR ${t.br.toFixed(1)}</span></div>
      <div class="muted" style="margin:2px 0 10px">${I.nation.name} · ${I.cat}</div>${specBlock(I)}
      ${nexts.length ? `<div class="muted" style="margin-top:12px;font-size:12px">Débloque : ${nexts.map(k => `<button class="lnk" data-a="sel" data-n="${escHTML(k)}">${escHTML(k)}</button>`).join(" · ")}</div>` : ""}
      <div style="margin-top:14px">${action}</div></div></div>`;
    Preview.attach($("#rs-view")); Preview.show(n);
    on(p, { buy: () => { if (Store.research(n)) { toast(n + " recherché"); refreshAll(); SecResearch.render(el); } }, use: () => { Store.setTank(n); refreshAll(); SecResearch.render(el); toast("Véhicule actif : " + n); } });
  }
};

/* ===================================================================
   05 CARRIÈRE
   =================================================================== */
const SecCareer = {
  render(el) {
    const s = Store.stats(), H = Store.history(), M = Store.milestones();
    el.innerHTML = `<div class="kpis">${[["Parties", fmt(s.parties)], ["Victoires", s.winrate === null ? "—" : s.wins + " (" + s.winrate + " %)"], ["Éliminations", fmt(s.kills)], ["Ratio élim./morts", s.kd === null ? "—" : s.kd], ["Dégâts infligés", fmt(s.damage)], ["Précision", s.acc === null ? "—" : s.acc + " %"]].map(([k, v]) => `<div class="kpi"><span>${k}</span><b class="num">${v}</b></div>`).join("")}</div>
      <div class="grid2" style="margin-top:20px;align-items:start">
        <div class="card"><h3>Jalons <span class="muted" style="text-transform:none;letter-spacing:.04em;font-size:13px">XP à réclamer</span></h3><div class="body"><div class="miles" style="grid-template-columns:1fr">${M.map(m => `<div class="mil ${m.claimed ? "claimed" : ""}"><div class="top"><b>${m.name}</b><span class="rw">+${fmt(m.xp)} XP</span></div><small>${m.desc}</small><div class="bar"><i style="width:${Math.round(m.cur / m.goal * 100)}%;${m.claimed ? "background:var(--ok)" : ""}"></i></div><div class="row"><span class="num muted" style="font-size:13px">${fmt(m.cur)} / ${fmt(m.goal)}</span>${m.claimed ? `<span class="tag ok">Réclamé</span>` : `<button class="btn sm primary" data-a="claim" data-id="${m.id}" ${m.ready ? "" : "disabled"}>Réclamer</button>`}</div></div>`).join("")}</div></div></div>
        <div class="card"><h3>Historique <span class="muted" style="text-transform:none;letter-spacing:.04em;font-size:13px">12 dernières parties</span></h3><div class="body" style="padding:0">${H.length ? `<table class="hist-t"><thead><tr><th>Issue</th><th>Véhicule</th><th>Mode · carte</th><th>Élim.</th><th>XP</th></tr></thead><tbody>${H.map(h => `<tr><td class="${h.result === "WIN" ? "w" : "l"}">${h.result === "WIN" ? "Victoire" : "Défaite"}</td><td>${escHTML(h.tank || "—")}</td><td>${MODE_NAME[h.mode] || h.mode || "—"} · ${MAP_THEME_LABELS[h.map] || h.map}<div class="faint" style="font-size:12px">${h.score || ""}</div></td><td class="num">${h.kills}</td><td class="num" style="color:var(--amber)">+${fmt(h.xp || 0)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Aucune partie jouée. Les statistiques apparaissent après votre premier combat (hors entraînement).</div>`}</div></div></div>`;
    on(el, { claim: d => { const x = Store.claim(d.id); if (x) { toast(`+${x} XP réclamés`); refreshAll(); SecCareer.render(el); } } });
  }
};

/* ===================================================================
   06 RÉGLAGES
   =================================================================== */
const QDESC = { low: "Sans ombres · fluide", medium: "Ombres légères", high: "Ombres nettes", ultra: "ACES · 4K textures · ombres 4K · distance étendue" };
const SecSettings = {
  render(el) {
    const S = Settings.all(), sl = (k, mn, mx, st, fmtv) => `<input type="range" min="${mn}" max="${mx}" step="${st}" value="${S[k]}" data-a="slide" data-k="${k}"><span class="val num" id="v-${k}">${fmtv(S[k])}</span>`;
    const tg = (k) => `<button class="toggle ${S[k] ? "on" : ""}" data-a="tog" data-k="${k}"></button>`;
    const man = window.TANK_MODEL_MANIFEST || {}, keys = Object.keys(TECH_TREE);
    el.innerHTML = `<div class="set-grid"><div>
      <div class="card"><h3>Graphismes</h3><div class="body"><div style="font-size:14px;margin-bottom:2px"><b>Qualité du combat 3D</b><div class="muted" style="font-size:13px">Ombres, densité des forêts, résolution du sol, particules</div></div>
        <div class="qual">${["low", "medium", "high", "ultra"].map(q => `<button class="${S.quality === q ? "on" : ""}" data-a="quality" data-q="${q}"><b>${{ low: "Basse", medium: "Moyenne", high: "Haute", ultra: "Ultra" }[q]}</b><small>${QDESC[q]}</small></button>`).join("")}</div>
        <div class="field"><div><b>Champ de vision</b><small>Caméra de poursuite</small></div><div style="display:flex;align-items:center;gap:10px">${sl("fov", 55, 95, 1, v => v + "°")}</div></div>
        <div class="field"><div><b>Distance de caméra</b><small>Valeur par défaut (molette en combat)</small></div><div style="display:flex;align-items:center;gap:10px">${sl("camDist", 8, 22, 1, v => v + " m")}</div></div>
        <div class="field"><div><b>Compteur d'images par seconde</b></div>${tg("showFps")}</div></div></div>
      <div class="card" style="margin-top:18px"><h3>Contrôles et son</h3><div class="body">
        <div class="field"><div><b>Sensibilité de la souris</b><small>Caméra et visée</small></div><div style="display:flex;align-items:center;gap:10px">${sl("sens", 0.3, 2.5, 0.1, v => (+v).toFixed(1) + "×")}</div></div>
        <div class="field"><div><b>Inverser l'axe vertical</b></div>${tg("invertY")}</div>
        <div class="field"><div><b>Volume des effets</b><small>Tirs, impacts, moteur</small></div><div style="display:flex;align-items:center;gap:10px">${sl("volume", 0, 1, 0.05, v => Math.round(v * 100) + " %")}</div></div>
        <div class="note" style="margin-top:12px">Les touches suivent la position physique (ZQSD et WASD fonctionnent). Les commandes complètes sont rappelées dans le menu pause du combat.</div></div></div></div>
      <div>
      <div class="card"><h3>Multijoueur</h3><div class="body">
        <ol class="note" style="margin:0 0 10px;padding-left:28px">
          <li>Double-cliquez sur <b>Lancer_serveur.bat</b> et laissez la fenêtre noire ouverte.</li>
          <li>Ouvrez le jeu à l'adresse <b>http://localhost:3000</b> (pas depuis un fichier).</li>
          <li>Ici, cliquez sur <b>Démarrer</b> pour obtenir un lien public, puis envoyez-le à vos amis.</li>
          <li><b>Jouer → Multijoueur → Déployer</b> : le premier crée la partie, les autres la rejoignent.</li>
        </ol><div id="mh-box"></div></div></div>
      <div class="card" style="margin-top:18px"><h3>Modèles 3D <span class="num muted">${keys.filter(k => man[k]).length} / ${keys.length} fournis</span></h3><div class="body">
        <div class="note" style="margin-bottom:10px">Déposez vos fichiers <b>.glb / .gltf / .obj</b> dans <b>models/</b> puis déclarez-les dans <b>js/models.js</b>. Un char sans modèle utilise l'assemblage procédural de sa catégorie. Un serveur HTTP local est nécessaire pour charger les fichiers.</div>
        <table class="mtable">${keys.map(k => `<tr><td>${escHTML(k)}</td><td><span class="tag ${man[k] ? "ok" : ""}">${man[k] ? "Modèle déclaré" : "Procédural · " + getTankProfile(k).catLabel}</span></td></tr>`).join("")}</table></div></div>
      <div class="card" style="margin-top:18px"><h3>Données</h3><div class="body">
        <div class="field"><div><b>Réinitialiser la recherche</b><small>Efface les véhicules acquis, l'XP disponible et la campagne</small></div><button class="btn sm danger" data-a="rsRes">Réinitialiser</button></div>
        <div class="field"><div><b>Réinitialiser tout le profil</b><small>Recherche, statistiques, historique, jalons</small></div><button class="btn sm danger" data-a="rsAll">Tout effacer</button></div>
        <div class="field"><div><b>Réglages par défaut</b></div><button class="btn sm" data-a="rsSet">Rétablir</button></div>
        <div class="field"><div><b>Outils de test</b><small>Affiche un bouton pour gagner de l'XP (essais de l'arbre)</small></div>${tg("devTools")}</div>
        ${S.devTools ? `<div style="text-align:right;margin-top:8px"><button class="btn sm" data-a="devxp">+1 000 XP</button></div>` : ""}</div></div>
      </div></div>`;
    const re = () => SecSettings.render(el);
    MultiHost.bind(el);
    el.querySelectorAll("input[type=range]").forEach(r => r.oninput = () => { const k = r.dataset.k; Settings.set(k, +r.value); const o = $("#v-" + k); o.textContent = { fov: v => v + "°", camDist: v => v + " m", sens: v => (+v).toFixed(1) + "×", volume: v => Math.round(v * 100) + " %" }[k](+r.value); });
    on(el, {
      mhStart: async () => { await MultiHost.call("POST"); MultiHost.bind(el); }, mhStop: async () => { await MultiHost.call("DELETE"); MultiHost.bind(el); }, mhCopy: () => MultiHost.copy(),
      quality: d => { Settings.set("quality", d.q); re(); }, tog: d => { Settings.set(d.k, !Settings.get(d.k)); re(); },
      rsRes: () => confirmBox("Réinitialiser la recherche ?", "Les véhicules recherchés, l'XP disponible et la progression de campagne seront effacés. Les statistiques sont conservées.", "Réinitialiser", () => { Store.resetResearch(); refreshAll(); re(); }, true),
      rsAll: () => confirmBox("Effacer tout le profil ?", "Recherche, statistiques, historique et jalons seront définitivement supprimés.", "Tout effacer", () => { Store.resetAll(); refreshAll(); re(); }, true),
      rsSet: () => { Settings.reset(); re(); toast("Réglages rétablis"); }, devxp: () => { refreshAll();}
    });
  }
};
