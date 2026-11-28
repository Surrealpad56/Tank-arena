/* ==========================================================================
   ARENA-MAIN.JS — Démarrage (chargement réel avec progression), mise en
   place de la partie selon la configuration du QG, boucle principale à pas
   fixe (60 Hz) avec interpolation de rendu.
   Doit être chargé en dernier.
   ========================================================================== */
console.log("[TankArena] chargement : arena-main.js");

const STEP = 1 / 60;
let _acc = 0, _last = 0, _time = 0, _running = false;
const AUTO = /[?&]auto=1/.test(location.search);

function spawnLocalPlayer() {
  const sp = getSpawnPoint(teamId, ARENA_CFG.mode === "test" ? 2.5 : Math.floor(Math.random() * 6), 6);
  localTank = new Tank(sp.x, sp.y, TankModules, teamId, selectedKey);
  localTank.alphaTank = localTank.pAT = sp.heading; localTank.alphaTurret = localTank.pATu = sp.heading - Math.PI / 2;
  localTank.currentAmmo = selectedAmmos[0];
  localTank._playerName = localStorage.getItem("PlayerName") || "Vous";
  localTank.setTeam(teamId);
}

function populateBots() {
  const cfg = ARENA_CFG;
  const keys = [];
  const mine = teamId || "A", other = mine === "A" ? "B" : "A";      // alliés = équipe du joueur, ennemis = l'autre
  for (let i = 0; i < cfg.allies; i++) keys.push([mine, i, pickBotKey()]);
  for (let i = 0; i < cfg.enemies; i++) keys.push([other, i, pickBotKey()]);
  if (cfg.mode === "campaign" && cfg.mission && cfg.mission.enemyTanks) { /* déjà géré par pickBotKey (enemyTanks) */ }
  return keys;
}

async function boot() {
  const canvas = document.getElementById("Game");
  HUD.init(); HUD.showLoading();
  if (typeof THREE === "undefined") { HUD.setLoading(0, "Three.js introuvable"); return; }
  try {
    teamId = "A";
    initAudio();
    if (ARENA_CFG.mode === "multi") { HUD.setLoading(0.01, "Connexion au salon…"); await Net.connect(); teamId = Net.team || "A"; }
    await World.init(canvas, (p, text) => HUD.setLoading(p * 0.8, text));
    FX.init(World.S.scene, World.S.camera, World.S.renderer);
    HUD.setLoading(0.82, "Chargement des véhicules…");
    const bots = (ARENA_CFG.mode === "multi" && !Net.host) ? [] : populateBots();
    const keys = new Set([selectedKey, ...bots.map(b => b[2])]);
    await Promise.all([...keys].map(k => TankModels.loadModelFor(k)));
    HUD.setLoading(0.92, "Mise en place des équipes…");
    await new Promise(r => setTimeout(r, 0));
    spawnLocalPlayer();
    bots.forEach(([team, i, key]) => { const b = spawnBot(team, i, 6, key); if (ARENA_CFG.mode === "test" && team === "B") placeTestTarget(b, i, ARENA_CFG.enemies); Net.regBot(b); });
    if (Net.on) Net.populate();
    HUD.prepareMinimap();
    Cam.init(); setupControls(canvas);
    window.addEventListener("resize", World.resize);
    HUD.setLoading(1, "Prêt");
    HUD.hideLoading();
    window.__ready = true;

    beginPlay();
    _last = performance.now(); _running = true; requestAnimationFrame(frame);
  } catch (e) {
    console.error(e); HUD.setLoading(0, "Erreur : " + (e && e.message || e));
    console.error(e);
  }
}

function beginPlay() {
  try { setTimeout(() => HUD.toast("Météo : " + Weather.cond.label + " · " + Weather.tod.label), 1800); } catch (e) { }
  try { HUD.toast("Météo : " + Weather.cond.label + " · " + Weather.tod.label); } catch (e) { }
  if (AUTO) { Game.started = true; Game.paused = false; HUD.showPause(false); return; }
  document.querySelector("#pause .ld-tag").textContent = "Prêt au combat";
  document.querySelector("#pause h2").textContent = "Commandes";
  document.getElementById("b-resume").textContent = "Prendre le commandement";
  if (ARENA_CFG.mode === "test" && !document.getElementById("b-test")) {
    const b = document.createElement("button"); b.className = "btn disp"; b.id = "b-test"; b.textContent = "Changer d'essai";
    b.onclick = () => { location.href = "lobby.html#play"; };
    document.querySelector("#pause .pa-btns").insertBefore(b, document.getElementById("b-quit"));
  }
  HUD.showPause(true);
}

/* Une erreur dans un pas de simulation ne doit jamais figer la partie : le temps est consommé
   avant le pas (sinon le même pas est rejoué en boucle à chaque image) et l'erreur est journalisée. */
let _simErrs = 0;
function reportSimError(e) { if (_simErrs++ < 5) console.error("[Arena] erreur de simulation :", e); }

/* ───── Simulation (60 Hz) ───── */
function simStep() {
  Rules.tick(STEP);
  tickCapturePoints();
  for (const it of items) if (it instanceof Tank) tickEnemySpotting(it);
  applyPlayerInput();
  for (const it of [...items]) {
    if (it._botTick) it._botTick();
    it.live();
    if (it instanceof Tank && it.destroyed && it._respawnIn > 0 && it !== localTank && ARENA_CFG.mode !== "deathmatch") { if (--it._respawnIn === 0 && !gameOver) respawnBot(it); }
    if (it instanceof Tank && it.destroyed && ARENA_CFG.mode === "deathmatch") it._respawnIn = 0;
  }
  separateTanks();
  if (Net.on) Net.tick();
  if (localTank.destroyed && localTank._respawnIn > 0) {
    localTank._respawnIn--; HUD.setRespawn("Réapparition dans " + Math.ceil(localTank._respawnIn / 60) + " s");
    if (localTank._respawnIn === 0) respawnLocalPlayer();
  }
}

/* ───── Rendu ───── */
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - _last) / 1000; _last = now; if (dt > 0.25) dt = 0.25; if (dt <= 0) dt = 0.0001;
  const live = !Game.paused || Net.on;   // en multijoueur la partie ne s'arrête pas
  if (live) { _acc += dt; let n = 0; while (_acc >= STEP && n < 5) { _acc -= STEP; n++; try { simStep(); } catch (e) { reportSimError(e); } } if (n === 5) _acc = 0; }
  _time += dt;
  const a = live ? _acc / STEP : 1, fdt = live ? dt : 0;
  const S = World.S;
  // vues
  for (const it of items) if (it instanceof Tank) {
    it.syncView(a, fdt);
    if (it !== localTank) it.view.setVisible(it.teamId === localTank.teamId || (it.spotLevel || 0) >= 2 || it.destroyed);
    if (live) it.fxUpdate(dt);
  }
  Cam.update(dt, S.camera);
  Cam.computeAim();
  if (!localTank.destroyed) {
    localTank.aimTarget = Cam.aim;
    // Trajectoire réelle pour l'indicateur PEN/BLOQ (calcul coûteux, 8 Hz suffisent).
    if (!frame._pred || now - frame._pred > 125) { frame._pred = now; Cam.predictImpact(); }
  } else if (Cam.impact) { Cam.impact.valid = false; }
  World.update(_time, localTank.view.root.position);
  FX.update(live ? dt : 0); Dmg.update(live ? dt : 0);
  updateEngineSound(Math.abs(localTank.speed) / (PIXELS_PER_METER * TICK_RATE));
  HUD.update(dt, S.camera, Rules);
  World.render();
}

window.addEventListener("DOMContentLoaded", boot);
