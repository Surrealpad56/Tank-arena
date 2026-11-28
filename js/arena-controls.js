/* ==========================================================================
   ARENA-CONTROLS.JS — Clavier (touches physiques : AZERTY et QWERTY),
   souris (verrouillage du pointeur), commandes tactiles (joystick, glisser
   pour regarder, boutons). Traduit les entrées en ordres pour le char local.
   ========================================================================== */
console.log("[TankArena] chargement : arena-controls.js");

const Input = { up: false, down: false, left: false, right: false, brake: false, fire: false, repair: false, joy: { active: false, x: 0, y: 0, id: null }, look: { id: null, x: 0, y: 0 } };
const Game = { paused: true, started: false, canvas: null };

function setPaused(p) {
  if (p === Game.paused) return;
  // En ligne, une pause locale laisserait le char immobile dans une simulation qui continue :
  // on interdit la pause pendant une partie multijoueur.
  if (p && typeof Net !== "undefined" && Net.on) return;
  Game.paused = p; HUD.showPause(p);
  if (p) { Input.fire = false; if (document.pointerLockElement) document.exitPointerLock(); }
}
function lockPointer() { if (mobileMode) return; try { const r = Game.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }

function setupControls(canvas) {
  Game.canvas = canvas;
  /* Repli des panneaux Véhicule / Modules : touche N ou clic sur les petits boutons du HUD. */
  const foldPanels = () => {
    const on = document.body.classList.toggle("hud-compact");
    try { Settings.set("hudCompact", on); } catch (e) { }
    for (const id of ["b-panel-veh", "b-panel-dmg"]) { const b = document.getElementById(id); if (b) b.textContent = on ? "+" : "–"; }
  };
  try {
    if (Settings.get("hudCompact")) {
      document.body.classList.add("hud-compact");
      for (const id of ["b-panel-veh", "b-panel-dmg"]) { const b = document.getElementById(id); if (b) b.textContent = "+"; }
    }
  } catch (e) { }
  for (const id of ["b-panel-veh", "b-panel-dmg"]) { const b = document.getElementById(id); if (b) b.onclick = foldPanels; }
  const setKey = (code, v) => {
    switch (code) {
      case "KeyW": case "ArrowUp": Input.up = v; break;
      case "KeyS": case "ArrowDown": Input.down = v; break;
      case "KeyA": case "ArrowLeft": Input.left = v; break;
      case "KeyD": case "ArrowRight": Input.right = v; break;
      case "Space": Input.brake = v; break;
      case "KeyR": Input.repair = v; break;
    }
  };
  window.addEventListener("keydown", e => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (e.code === "Escape" || e.code === "KeyH") { if (!gameOver && Game.started) { if (e.code === "KeyH" || !document.pointerLockElement) setPaused(!Game.paused); if (e.code === "KeyH" && Game.paused) HUD.showPause(true); } return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "KeyN" && Game.started && !e.repeat) { foldPanels(); return; }
    if (Game.paused) return;
    setKey(e.code, true);
    if (e.repeat) return;
    if (!localTank) return;
    if (e.code === "KeyQ") localTank.gear = Math.max(-2, localTank.gear - 1);
    else if (e.code === "KeyE") localTank.gear = Math.min(6, localTank.gear + 1);
    else if (e.code === "Digit1" || e.code === "Numpad1") switchAmmo(selectedAmmos[0]);
    else if (e.code === "Digit2" || e.code === "Numpad2") switchAmmo(selectedAmmos[1]);
    else if (e.code === "KeyV") Cam.setSniper(!Cam.sniper);
    else if (e.code === "KeyM") document.getElementById("mini").classList.toggle("big");
    else if (e.code === "KeyK") testReset();
  });
  window.addEventListener("keyup", e => setKey(e.code, false));
  window.addEventListener("blur", () => { Input.up = Input.down = Input.left = Input.right = Input.brake = Input.fire = Input.repair = false; });

  document.addEventListener("pointerlockchange", () => {
    Cam.locked = document.pointerLockElement === canvas;
    if (!Cam.locked && Game.started && !gameOver && !mobileMode && !Game.paused) setPaused(true);
  });
  document.addEventListener("mousemove", e => { if (Cam.locked && !Game.paused) Cam.look(e.movementX || 0, e.movementY || 0); });
  canvas.addEventListener("mousedown", e => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (Game.paused || mobileMode) return;
    if (!Cam.locked) { lockPointer(); return; }
    if (e.button === 0) Input.fire = true; else if (e.button === 2) Cam.setSniper(!Cam.sniper);
  });
  window.addEventListener("mouseup", e => { if (e.button === 0) Input.fire = false; });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("wheel", e => { e.preventDefault(); if (!Game.paused) Cam.zoom(e.deltaY > 0 ? 1.2 : -1.2); }, { passive: false });

  document.getElementById("b-resume").onclick = () => { setPaused(false); Game.started = true; lockPointer(); if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); };
  document.getElementById("b-quit").onclick = () => { location.href = "lobby.html"; };
  setupTouch();
}

/* ───── Tactile ───── */
function setupTouch() {
  const joy = document.getElementById("joy"), knob = joy.firstElementChild, R = 55;
  const hit = (id, fn) => { const b = document.getElementById(id); b.addEventListener("touchstart", e => { e.preventDefault(); fn(true); }, { passive: false }); b.addEventListener("touchend", e => { e.preventDefault(); fn(false); }, { passive: false }); b.addEventListener("touchcancel", e => { e.preventDefault(); fn(false); }, { passive: false }); };
  hit("t-fire", v => Input.fire = v);
  hit("t-snipe", v => { if (v) Cam.setSniper(!Cam.sniper); });
  hit("t-repair", v => {
    const b = document.getElementById("t-repair");
    if (v && localTank && Math.abs(localTank.speed) <= 0.3 && !localTank.destroyed && !Game.paused) Input.repair = true;
    else if (!v) Input.repair = false;
    if (b) b.setAttribute("aria-pressed", String(Input.repair));
  });
  hit("t-ammo", v => { if (v && localTank) switchAmmo(selectedAmmos[selectedAmmos.indexOf(localTank.currentAmmo) === 0 ? 1 : 0]); });
  hit("t-pause", v => { if (v && Game.started && !gameOver) setPaused(!Game.paused); });
  // Empêche qu'un appui tactile maintenu reste bloqué après un changement d'application.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { Input.fire = Input.brake = Input.repair = false; Input.joy.active = false; Input.joy.x = Input.joy.y = 0; }
  });
  const upd = t => {
    const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy; const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; }
    Input.joy.x = dx / R; Input.joy.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  joy.addEventListener("touchstart", e => { e.preventDefault(); const t = e.changedTouches[0]; Input.joy.active = true; Input.joy.id = t.identifier; upd(t); }, { passive: false });
  joy.addEventListener("touchmove", e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === Input.joy.id) upd(t); }, { passive: false });
  const endJoy = e => { for (const t of e.changedTouches) if (t.identifier === Input.joy.id) { Input.joy.active = false; Input.joy.x = Input.joy.y = 0; knob.style.transform = ""; } };
  joy.addEventListener("touchend", endJoy); joy.addEventListener("touchcancel", endJoy);
  // regarder : glisser n'importe où ailleurs sur la vue
  const cv = document.getElementById("Game");
  cv.addEventListener("touchstart", e => { if (Game.paused) { return; } const t = e.changedTouches[0]; if (Input.look.id === null) { Input.look.id = t.identifier; Input.look.x = t.clientX; Input.look.y = t.clientY; } if (!mobileMode) { mobileMode = true; document.body.classList.add("touch"); document.getElementById("touch").classList.remove("hidden"); } e.preventDefault(); }, { passive: false });
  cv.addEventListener("touchmove", e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === Input.look.id) { Cam.look((t.clientX - Input.look.x) * 1.4, (t.clientY - Input.look.y) * 1.4); Input.look.x = t.clientX; Input.look.y = t.clientY; } }, { passive: false });
  const endLook = e => { for (const t of e.changedTouches) if (t.identifier === Input.look.id) Input.look.id = null; };
  cv.addEventListener("touchend", endLook); cv.addEventListener("touchcancel", endLook);
}

/* Appelée à chaque tick de simulation */
function applyPlayerInput() {
  const t = localTank;
  if (!t || t.destroyed || gameOver || (Game.paused)) { return; }
  if (Input.joy.active && mobileMode) {
    const j = Input.joy;
    if (Math.abs(j.y) > 0.15) t.drive(-j.y, Math.abs(j.x) > 0.15 ? j.x * (j.y > 0 ? -1 : 1) : 0);
    else if (Math.abs(j.x) > 0.15) t.rotate(j.x);
  }
  if (Input.up) t.move(1);
  if (Input.down) { if (t.speed > 0.05) t.brake(); else t.move(-1); }
  if (Input.brake) t.brake();
  if (Input.left) t.rotate(-1);
  if (Input.right) t.rotate(1);
  // La réparation est autorisée uniquement à l'arrêt (même seuil que Tank.repair()).
  const repairBtn = document.getElementById("t-repair");
  const canRepair = Math.abs(t.speed) <= 0.3 && !t.destroyed && !Game.paused;
  if (repairBtn) {
    repairBtn.disabled = !canRepair;
    repairBtn.classList.toggle("is-disabled", !canRepair);
    repairBtn.setAttribute("aria-disabled", String(!canRepair));
    repairBtn.title = canRepair ? "Maintenir pour réparer (3 s)" : "Réparation indisponible pendant le mouvement";
  }
  if (Input.repair && canRepair) {
    const previousRepairTimer = t._repairTimer;
    t.repair();
    // Un seul cycle de réparation par appui : il faut relâcher puis maintenir à nouveau.
    if (previousRepairTimer < 180 && t._repairTimer === 0 && previousRepairTimer >= 179) {
      Input.repair = false;
      if (repairBtn) repairBtn.setAttribute("aria-pressed", "false");
    }
  } else {
    Input.repair = false;
    if (t._repairTimer > 0 && t._repairTimer < 180) t._repairTimer = 0;
  }
  if (Input.fire) t.fire();
}
