/* ==========================================================================
   ARENA-CONSTANTS.JS — Constantes, configuration de partie, repérage
   (spotting) avec ligne de vue 3D, état global, audio, utilitaires.
   Dépend de shared-data.js, tank-catalog.js, settings.js, terrain-gen.js.

   Convention d'unités : le moteur de simulation reste en « pixels de carte »
   (18 px = 1 m) ; la scène Three.js est en mètres (X = x/18, Z = y/18,
   Y = hauteur). Les hauteurs de simulation (z) sont aussi en pixels.
   ========================================================================== */
console.log("[TankArena] chargement : arena-constants.js");

/* ========== CONSTANTES ========== */
const MAP_WIDTH = 12000;
const MAP_HEIGHT = 12000;
const GRAVITY = 9.81;
const PIXELS_PER_METER = 18;
const PX = 1 / PIXELS_PER_METER;           // pixel → mètre
const M2PX = PIXELS_PER_METER;             // mètre → pixel
const TICK_RATE = 1 / 60;
const WIND = { x: 1.5, y: 0 };

/* ========== CONFIGURATION DE PARTIE (écrite par le lobby) ========== */
const ARENA_CFG = (function () {
  let c = {};
  try { c = JSON.parse(localStorage.getItem("arenaConfig") || "{}"); } catch (e) { }
  const cfg = Object.assign({
    mode: "sandbox",        // sandbox | skirmish | campaign | online
    theme: "random",        // random | identifiant de carte (voir map-defs.js)
    enemies: 1, allies: 0,
    difficulty: "normal",   // easy | normal | hard
    scoreToWin: 10,
    respawnBots: true,
    enemyTanks: null,       // liste de clés de chars pour les bots ennemis (campagne)
    mission: null           // { num, name, kills, lives, timeLimit, reward }
  }, c);
  cfg.enemies = Math.max(0, Math.min(8, cfg.enemies | 0));
  cfg.allies = Math.max(0, Math.min(7, cfg.allies | 0));
  return cfg;
})();
const MAP_THEME = (ARENA_CFG.theme && MAP_THEMES.includes(ARENA_CFG.theme)) ? ARENA_CFG.theme : MAP_THEMES[Math.floor(Math.random() * MAP_THEMES.length)];

/* ========== SPOTTING RÉALISTE — 3 NIVEAUX ==========
   Distances en pixels de carte (18 px = 1 m).
   Niveaux : 0 none · 1 contact · 2 silhouette · 3 identified
   Mémoire ~12 s après perte de vue. Partage d’équipe (joueur + bots alliés). */
const SPOT_CONTACT_RANGE   = 4200;   // ~233 m — premier contact possible
const SPOT_SILHOUETTE_RANGE = 2800;  // ~155 m
const SPOT_IDENTIFY_RANGE  = 1800;   // ~100 m
const SPOT_NOISE_RANGE     = 3200;   // bruit de chenilles
const SPOT_MEMORY_TICKS    = 720;    // ~12 s à 60 Hz
const SPOT_IDENTIFY_TIME   = 150;    // ~2.5 s d’observation pour identifier pleinement

/* Œil d'un char (centre de la tourelle) : hauteur en pixels */
function tankEye(t) { return t.eyeZ !== undefined ? t.eyeZ : 2.6 * M2PX; }

/* Facteur de taille du char (plus grand = plus facile à détecter) */
function spotSizeFactor(tank) {
  const L = (tank.profile && tank.profile.L) || 6;
  const W = (tank.profile && tank.profile.W) || 3;
  return clamp((L * W) / 18, 0.7, 1.45);
}

/* Le char `enemy` est-il détecté par le joueur ou un allié ? */
function tickEnemySpotting(enemy) {
  if (!localTank || !enemy || enemy === localTank) return;

  // Alliés toujours connus
  if (enemy.teamId === localTank.teamId) {
    enemy.spotLevel = 3;
    enemy.spotted = true;
    enemy._spotProgress = 1;
    enemy._spottedMemoryTimer = SPOT_MEMORY_TICKS;
    return;
  }

  // Collecte des observateurs (joueur + bots alliés vivants)
  const viewers = [];
  if (localTank && !localTank.destroyed) viewers.push(localTank);
  for (const it of items) {
    if (it instanceof Tank && !it.destroyed && it !== localTank && it.teamId === localTank.teamId) viewers.push(it);
  }

  const ez = tankEye(enemy);
  const sizeF = spotSizeFactor(enemy);
  const speed = Math.abs(enemy.speed || 0);
  const moving = speed > 1.2;
  const fired = (enemy._firedTimer || 0) > 0;
  const onFire = !!(enemy.int && enemy.int.fire);

  let bestLevel = 0;
  let bestProgressGain = 0;

  for (const v of viewers) {
    const dist = Math.hypot(v.x - enemy.x, v.y - enemy.y);
    if (dist > SPOT_CONTACT_RANGE * 1.15) continue;

    const los = losInfo(v.x, v.y, tankEye(v), enemy.x, enemy.y, ez);
    if (los.blocked) continue;

    // Couverture végétale
    const cover = los.hedges > 0 ? 0.5 : 1;
    const rangeMul = cover * sizeF;

    // Camouflage statique : immobile depuis un moment → plus difficile
    const staticCamo = !moving && !fired && !onFire ? 0.65 : 1;
    const effectiveDist = dist / (rangeMul * staticCamo);

    let level = 0;
    if (fired || onFire) {
      // Tir ou feu : très visible
      if (dist < SPOT_CONTACT_RANGE * 1.3) level = 1;
      if (dist < SPOT_SILHOUETTE_RANGE * 1.2) level = 2;
      if (dist < SPOT_IDENTIFY_RANGE * 1.1) level = 3;
    } else {
      if (effectiveDist < SPOT_CONTACT_RANGE) level = 1;
      if (effectiveDist < SPOT_SILHOUETTE_RANGE) level = 2;
      if (effectiveDist < SPOT_IDENTIFY_RANGE) level = 3;
      // Bruit de chenilles aide le contact
      if (moving && dist < SPOT_NOISE_RANGE * cover && level < 1) level = 1;
    }

    if (level > bestLevel) bestLevel = level;

    // Progression d’identification (pour monter de silhouette → identified)
    if (level >= 2 && dist < SPOT_IDENTIFY_RANGE * 1.3) {
      const gain = (level >= 3 ? 1.0 : 0.45) * (1.2 - dist / (SPOT_IDENTIFY_RANGE * 1.3));
      if (gain > bestProgressGain) bestProgressGain = gain;
    }
  }

  // Application du meilleur résultat
  if (bestLevel > 0) {
    enemy._spottedMemoryTimer = SPOT_MEMORY_TICKS;
    enemy._lastKnownX = enemy.x;
    enemy._lastKnownY = enemy.y;

    if (bestLevel >= 3) {
      enemy.spotLevel = 3;
      enemy._spotProgress = 1;
    } else if (bestLevel === 2) {
      enemy._spotProgress = Math.min(1, (enemy._spotProgress || 0) + bestProgressGain / SPOT_IDENTIFY_TIME);
      enemy.spotLevel = enemy._spotProgress >= 1 ? 3 : 2;
    } else {
      // contact seulement
      if ((enemy.spotLevel || 0) < 1) enemy.spotLevel = 1;
      // on ne fait pas redescendre un niveau supérieur juste parce qu’on n’a que du contact cette frame
      if ((enemy.spotLevel || 0) < 2) enemy.spotLevel = 1;
    }
  } else if (enemy._spottedMemoryTimer > 0) {
    // Mémoire : on garde le dernier niveau connu un moment
    enemy._spottedMemoryTimer--;
    // légère dégradation après la moitié du temps de mémoire
    if (enemy._spottedMemoryTimer < SPOT_MEMORY_TICKS * 0.4 && enemy.spotLevel > 1) {
      enemy.spotLevel = Math.max(1, enemy.spotLevel - 1);
      enemy._spotProgress = 0;
    }
  } else {
    enemy.spotLevel = 0;
    enemy._spotProgress = 0;
  }

  // Compatibilité avec le reste du code
  enemy.spotted = (enemy.spotLevel || 0) >= 1;
}

/* hasLineOfSight : compatibilité 2D (hauteur d'œil par défaut). */
function hasLineOfSight(x1, y1, x2, y2) {
  return !losInfo(x1, y1, 2.5 * M2PX, x2, y2, 2.5 * M2PX).blocked;
}

/* ========== MULTIJOUEUR — ÉTAT GLOBAL ========== */
let teamId = null;
let localTank = null;

let teamScore = { A: 0, B: 0 };
let gameOver = false;
let SCORE_TO_WIN = ARENA_CFG.scoreToWin || 10;

/* ========== GLOBAUX ========== */
let items = [];
let keyDowns = new Set();
let mobileMode = localStorage.getItem("mobileMode") === "true" || /Android|iPhone|iPad/i.test(navigator.userAgent);
let battleStats = { kills: 0, damageDealt: 0, shotsFired: 0, shotsHit: 0, deaths: 0 };

const rawSelected = (ARENA_CFG.mode === "test" && ARENA_CFG.selfTank) || localStorage.getItem("SelectedTank") || "Panzer III Ausf. L";
const selected = TANK_MODULES[rawSelected] ? rawSelected : normalizeTankKey(rawSelected);
const TankModules = TANK_MODULES[selected] || TANK_MODULES["Panzer III Ausf. L"];
const selectedKey = TANK_MODULES[selected] ? selected : "Panzer III Ausf. L";
const _ammoKeys = Object.keys(TankModules.ammo || { APHE: 1 });
const _useOwnAmmo = !(ARENA_CFG.mode === "test" && ARENA_CFG.selfTank && ARENA_CFG.selfTank !== localStorage.getItem("SelectedTank"));
const _pickAmmo = (k, fb) => (_useOwnAmmo && k && _ammoKeys.includes(k)) ? k : fb;
const selectedAmmos = [
  _pickAmmo(localStorage.getItem("SelectedAmmo1"), _ammoKeys[0]),
  _pickAmmo(localStorage.getItem("SelectedAmmo2"), _ammoKeys[1] || _ammoKeys[0])
];

/* ========== AUDIO ==========
   Sons synthétisés ; volume global réglable (Réglages → Volume des effets)
   et atténuation avec la distance. */
let audioCtx = null, engineGainNode = null, engineOscNode = null, masterGain = null;
const VOLUME = () => Settings.get("volume");

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain(); masterGain.gain.value = VOLUME(); masterGain.connect(audioCtx.destination);
    engineOscNode = audioCtx.createOscillator();
    engineGainNode = audioCtx.createGain();
    const dist = audioCtx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i * 2) / 256 - 1; curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x)); }
    dist.curve = curve;
    engineOscNode.type = "sawtooth"; engineOscNode.frequency.value = 45; engineGainNode.gain.value = 0.025;
    const lp = audioCtx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
    engineOscNode.connect(dist); dist.connect(lp); lp.connect(engineGainNode); engineGainNode.connect(masterGain);
    engineOscNode.start();
  } catch (e) { console.warn("Audio indisponible", e); }
}
function updateEngineSound(speedMs) {
  if (!audioCtx || !engineOscNode) return;
  engineOscNode.frequency.setTargetAtTime(38 + Math.abs(speedMs) * 3.2, audioCtx.currentTime, 0.1);
  engineGainNode.gain.setTargetAtTime(0.02 + Math.min(0.03, Math.abs(speedMs) * 0.003), audioCtx.currentTime, 0.2);
}
function distGain(x, y) {
  if (!localTank || x === undefined) return 1;
  const d = Math.hypot(x - localTank.x, y - localTank.y) * PX;
  return Math.max(0.06, 1 / (1 + d / 60));
}
function _noiseBurst(dur, decay, gain, lowpass, x, y) {
  if (!audioCtx) return;
  try {
    const n = Math.floor(audioCtx.sampleRate * dur), buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / audioCtx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay); }
    const src = audioCtx.createBufferSource(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = lowpass; g.gain.value = gain * distGain(x, y);
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(masterGain); src.start();
  } catch (e) { }
}
function _thump(freq, dur, gain, x, y) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(freq, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(freq * 0.3, audioCtx.currentTime + dur);
    g.gain.setValueAtTime(gain * distGain(x, y), audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(masterGain); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { }
}
function playFireSound(x, y, caliber) { const k = Math.min(1.6, (caliber || 75) / 75); _noiseBurst(0.5, 9 / k, 0.9, 2600, x, y); _thump(90 / k, 0.35, 0.9, x, y); }
function playImpactSound(type, x, y) {
  if (type === "ricochet") { _noiseBurst(0.18, 24, 0.5, 6000, x, y); _thump(1400, 0.12, 0.25, x, y); }
  else if (type === "blocked") { _noiseBurst(0.22, 18, 0.55, 3000, x, y); _thump(180, 0.2, 0.6, x, y); }
  else { _noiseBurst(0.45, 10, 0.8, 1800, x, y); _thump(70, 0.5, 0.9, x, y); }
}
function playExplosionSound(x, y) { _noiseBurst(1.1, 4, 1.0, 900, x, y); _thump(50, 0.9, 1.0, x, y); }

/* ========== UTILITAIRES ========== */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const degToRad = d => d * Math.PI / 180;
const radToDeg = r => r * 180 / Math.PI;
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) { return a + wrapAngle(b - a) * t; }

function getDragCoeff(baseCd, speedMs) {
  const mach = speedMs / 343;
  if (mach > 1.2) return baseCd * 0.85;
  if (mach > 0.8) return baseCd * 1.35;
  return baseCd;
}

function addDamageEvent(type, detail = "", fromAngle = null) { HUD.event(type, detail, fromAngle); }
