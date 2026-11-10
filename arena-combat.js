/* ==========================================================================
   ARENA-COMBAT.JS — Règles de partie (entraînement, escarmouche, campagne,
   en ligne), IA des chars (visée balistique 3D avec anticipation, ligne de
   vue, évitement d'obstacles), apparition / réapparition, fin de partie et
   récompenses (XP réellement écrite pour le QG).
   ========================================================================== */
console.log("[TankArena] chargement : arena-combat.js");

/* ───────────── Règles ───────────── */
const Rules = (function () {
  const R = { time: 0, over: false };
  const mode = ARENA_CFG.mode, M = ARENA_CFG.mission;
  R.scoreToWin = (mode === "sandbox" || mode === "test") ? Infinity : mode === "campaign" ? (M ? M.kills : 5) : (ARENA_CFG.scoreToWin || 10);
  R.lives = mode === "campaign" && M ? M.lives : Infinity;
  R.timeLimit = mode === "campaign" && M && M.timeLimit ? M.timeLimit : 0;
  R.modeLabel = () => ({ sandbox: "Entraînement", test: "Champ d'essai", skirmish: "Escarmouche", deathmatch: "Deathmatch", campaign: M ? "Mission " + M.num : "Campagne", online: "Duel", multi: "Multijoueur" }[mode] || "Combat");
  R.objectiveText = function () {
    const mm = t => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
    if (mode === "sandbox") return mm(R.time);
    if (mode === "test") return "Cibles : " + livingTanksForTeam("B") + " · K = réinitialiser";
    if (mode === "deathmatch") return "Éliminez toute l'équipe ennemie";
    if (mode === "campaign") {
      let s = Math.max(0, R.scoreToWin - teamScore.A) + " cible" + (R.scoreToWin - teamScore.A > 1 ? "s" : "");
      if (R.lives !== Infinity) s += " · " + Math.max(0, R.lives - battleStats.deaths) + " vie" + (R.lives - battleStats.deaths > 1 ? "s" : "");
      if (R.timeLimit) s += " · " + mm(Math.max(0, R.timeLimit - R.time));
      return s;
    }
    return "Premier à " + R.scoreToWin;
  };
  R.captureScores = () => mode !== "campaign" && mode !== "deathmatch";
  R.respawnAllowed = () => !(mode === "campaign" && R.lives !== Infinity && battleStats.deaths >= R.lives);
  R.tick = function (dt) {
    if (R.over) return; R.time += dt;
    if (R.timeLimit && R.time >= R.timeLimit) endMatch(false, "Temps écoulé");
  };
  return R;
})();
function captureScores() { return Rules.captureScores(); }
let SCORE_TO_WIN_LIVE = Rules.scoreToWin;

function livingTanksForTeam(team) {
  return items.filter(it => it instanceof Tank && !it.destroyed && it.teamId === team).length;
}

function checkWinCondition() {
  if (gameOver) return;
  if (ARENA_CFG.mode === "deathmatch") {
    const aliveA = livingTanksForTeam("A");
    const aliveB = livingTanksForTeam("B");
    if (!aliveB) endMatch(teamId === "A", "Équipe alliée victorieuse");
    else if (!aliveA) endMatch(teamId === "B", "Équipe ennemie victorieuse");
    return;
  }
  if (teamScore.A >= Rules.scoreToWin) endMatch(teamId === "A", "Équipe alliée victorieuse");
  else if (teamScore.B >= Rules.scoreToWin) endMatch(teamId === "B", "Équipe ennemie victorieuse");
}

/* ───────────── Apparition ───────────── */
function getSpawnPoint(team, slot, n) {
  const k = slot === undefined ? Math.random() * 6 : slot, cnt = n || 6, c = MAP_LAYOUT.spawn[team === "A" ? "A" : "B"];
  const dx = MAP_WIDTH / 2 - c[0], dy = MAP_HEIGHT / 2 - c[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;   // direction vers le centre
  let x = c[0], y = c[1];
  for (let t = 0; t < 10; t++) {
    const off = (k - (cnt - 1) / 2) * 300 + (Math.random() - 0.5) * 60, depth = (Math.random() - 0.5) * 240;
    x = clamp(c[0] - uy * off + ux * depth, 200, MAP_WIDTH - 200); y = clamp(c[1] + ux * off + uy * depth, 200, MAP_HEIGHT - 200);
    if (!obstacleBlocksPoint(x, y, 70)) break;
  }
  return { x, y, heading: Math.atan2(ux, -uy) };
}

/* Champ d'essai : place la cible i/n à ARENA_CFG.testDist mètres devant le joueur, de face */
function placeTestTarget(bot, i, n) {
  const lt = localTank, h = lt.alphaTank, F = { x: Math.sin(h), y: -Math.cos(h) }, Rr = { x: Math.cos(h), y: Math.sin(h) };
  const dist = (ARENA_CFG.testDist || 150) * M2PX, lat = (i - (n - 1) / 2) * 26 * M2PX;
  let x = lt.x, y = lt.y;
  for (let t = 0; t < 14; t++) {
    const dd = dist - t * 8 * M2PX * (t % 2 ? 1 : -1) * 0.5;
    x = clamp(lt.x + F.x * dd + Rr.x * lat, 250, MAP_WIDTH - 250); y = clamp(lt.y + F.y * dd + Rr.y * lat, 250, MAP_HEIGHT - 250);
    if (!obstacleBlocksPoint(x, y, 80)) break;
  }
  const facing = ARENA_CFG.testBehavior === "patrol" ? h + Math.PI / 2 : h + Math.PI;   // de face (ou de profil s'il roule)
  bot.x = bot.px = x; bot.y = bot.py = y; bot.alphaTank = bot.pAT = facing; bot.alphaTurret = bot.pATu = facing - Math.PI / 2;
  bot._home = { x, y, heading: facing };
}
function testReset() {
  if (ARENA_CFG.mode !== "test" || !localTank) return;
  for (const it of items) if (it instanceof Tank && it._home) { it._respawnIn = 0; respawnBot(it); it.reload = 0; }
  if (localTank.destroyed) respawnLocalPlayer();
  localTank.resetModules(); localTank.reload = 0;
  HUD.toast("Champ d'essai réinitialisé");
}

function pickBotKey() {
  if (ARENA_CFG.mode === "test" && ARENA_CFG.testTarget && ARENA_CFG.testTarget !== "random" && TANK_MODULES[ARENA_CFG.testTarget]) return ARENA_CFG.testTarget;
  const list = ARENA_CFG.enemyTanks && ARENA_CFG.enemyTanks.length ? ARENA_CFG.enemyTanks : null;
  if (list) return list[Math.floor(Math.random() * list.length)];
  const tier = (TECH_TREE[selectedKey] || {}).tier || 1;
  const cands = Object.keys(TANK_MODULES).filter(k => TECH_TREE[k] && Math.abs(TECH_TREE[k].tier - tier) <= 1 && TANK_MODULES[k].ammo);
  return cands[Math.floor(Math.random() * cands.length)] || "Panzer IV Ausf. H";
}

function spawnBot(team, slot, n, key) {
  const k = key || pickBotKey();
  const sp = getSpawnPoint(team, slot, n);
  const mods = TANK_MODULES[k];
  const bot = new Tank(sp.x, sp.y, mods, team, k);
  bot.alphaTank = sp.heading; bot.alphaTurret = sp.heading - Math.PI / 2; bot.pAT = bot.alphaTank; bot.pATu = bot.alphaTurret;
  bot.isEnemy = team !== (localTank ? localTank.teamId : "A");
  bot._playerName = k;
  bot.currentAmmo = Object.keys(mods.ammo || {})[0] || "APHE";
  bot._slot = slot; bot._n = n;
  createBotAI(bot);
  return bot;
}

function respawnBot(bot) {
  const sp = bot._home ? { x: bot._home.x, y: bot._home.y, heading: bot._home.heading } : getSpawnPoint(bot.teamId, bot._slot, bot._n);
  bot.x = bot.px = sp.x; bot.y = bot.py = sp.y; bot.alphaTank = bot.pAT = sp.heading; bot.alphaTurret = bot.pATu = sp.heading - Math.PI / 2;
  bot.destroyed = false; bot.lat = 0; bot._flipT = 0; bot.accRoll = 0; bot.speed = 0; bot.angularVelocity = 0; bot.reload = 60; bot.gunElevation = bot.pEl = 0;
  bot.resetModules(); bot.view.setDestroyed(false); bot.spotted = false; bot._target = null;
}

/* ───────────── Mort / réapparition du joueur ───────────── */
function onLocalPlayerDestroyed() {
  if (teamId === "A") teamScore.B++; else teamScore.A++;
  if (gameOver) return;
  Cam.setSniper(false);
  if (!Rules.respawnAllowed()) { setTimeout(() => endMatch(false, "Plus aucune vie"), 2200); return; }
  localTank._respawnIn = 5 * 60;
  checkWinCondition();
}
function respawnLocalPlayer() {
  if (gameOver) return;
  const t = localTank, sp = getSpawnPoint(teamId, undefined, 6);
  t.x = t.px = sp.x; t.y = t.py = sp.y; t.alphaTank = t.pAT = sp.heading; t.alphaTurret = t.pATu = sp.heading - Math.PI / 2;
  t.destroyed = false; t.lat = 0; t._flipT = 0; t.accRoll = 0; t.speed = 0; t.angularVelocity = 0; t.gear = 0; t.reload = 0; t.gunElevation = 0;
  t.resetModules(); t.view.setDestroyed(false);
  Cam.yaw = t.alphaTank - Math.PI / 2; HUD.setRespawn(null);
  HUD.toast("De retour au combat");
}
/* Un char non-joueur vient d'être détruit */
function onTankKilled(tank, killer) {
  const kn = killer ? (killer === localTank ? "Vous" : (killer._playerName || killer._tankKey)) : "Un tir";
  if (killer && killer === localTank) HUD.event("kill", `Vous avez détruit ${tank._playerName || tank._tankKey}`);
  else if (killer && tank.teamId === localTank.teamId) HUD.event("kill", `${tank._playerName || tank._tankKey} a été détruit`);
  const canRespawnBot = ARENA_CFG.mode === "sandbox" || ARENA_CFG.mode === "test" || (ARENA_CFG.mode !== "deathmatch" && ARENA_CFG.respawnBots);
  if (tank._botTick && !gameOver && canRespawnBot) {
    tank._respawnIn = (ARENA_CFG.mode === "sandbox" || ARENA_CFG.mode === "test" ? 4 : 9) * 60;
  } else if (ARENA_CFG.mode === "deathmatch") {
    tank._respawnIn = 0;
  }
}

/* ───────────── Changement d'obus ───────────── */
function switchAmmo(type) {
  const t = localTank;
  if (!type || !selectedAmmos.includes(type) || !t || t.currentAmmo === type || t.destroyed) return;
  const reloadTimes = { AP: 8, APBC: 8, APCBC: 8, APHE: 8, APCR: 7, HE: 9, HEAT: 10, APDS: 10, fumigène: 6, shrapnel: 9 };
  const baseTicks = (t._tankModules.reloadSec ? t._tankModules.reloadSec : (reloadTimes[type] || 8)) * 60;
  const crewRatio = t.crewAlive / Object.keys(t.modules.crew).length, crewP = crewRatio < 1 ? 1 + (1 - crewRatio) * 1.5 : 1, loaderP = t.modules.crew.loader ? 1 : 2.5;
  t.reload = Math.round(baseTicks * crewP * loaderP * (t.reload <= 5 ? 0.8 : 0.5)); t.reloadMax = Math.max(t.reload, 1);
  t.currentAmmo = type; t._aimKey = null;
}

/* ───────────── IA ───────────── */
const DIFF = {
  easy: { err: 70, tol: 0.10, think: 28, speed: 0.7, range: 2300 },
  normal: { err: 30, tol: 0.06, think: 18, speed: 0.9, range: 2900 },
  hard: { err: 9, tol: 0.035, think: 10, speed: 1.0, range: 3500 }
};
function enemiesOf(bot) {
  const out = [];
  if (localTank && !localTank.destroyed && localTank.teamId !== bot.teamId) out.push(localTank);
  for (const it of items) if (it instanceof Tank && it !== bot && !it.destroyed && it.teamId !== bot.teamId) out.push(it);
  return out;
}
function objectiveFor(bot) {
  let best = null, bd = 1e12;
  for (const cp of CAPTURE_POINTS) {
    if (cp.owner === bot.teamId && !cp.contested) continue;
    const d = Math.hypot(cp.x - bot.x, cp.y - bot.y); if (d < bd) { bd = d; best = cp; }
  }
  if (best) return { x: best.x, y: best.y, cp: best };
  // Pas de zone (deathmatch) : on chasse l'ennemi vivant le plus proche, même hors de vue
  let hunt = null, hd = 1e12;
  for (const e of enemiesOf(bot)) { const d = Math.hypot(e.x - bot.x, e.y - bot.y); if (d < hd) { hd = d; hunt = e; } }
  if (hunt) return { x: hunt.x, y: hunt.y };
  return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
}

/* Champ d'essai : trajet circulaire des cibles « en mouvement » autour de leur point d'origine */
function patrolGoal(bot) {
  const h = bot._home || { x: bot.x, y: bot.y }, R = 30 * M2PX;       // cercle de 30 m de rayon
  if (bot._pw === undefined) { bot._pw = 0; bot._pdir = Math.random() < 0.5 ? 1 : -1; }
  const pt = k => { const a = k * Math.PI / 4; return { x: clamp(h.x + Math.cos(a) * R - R, 250, MAP_WIDTH - 250), y: clamp(h.y + Math.sin(a) * R, 250, MAP_HEIGHT - 250) }; };
  let p = pt(bot._pw);
  if (Math.hypot(p.x - bot.x, p.y - bot.y) < 170) { bot._pw = (bot._pw + bot._pdir + 8) % 8; p = pt(bot._pw); }
  return p;
}

function createBotAI(bot) {
  const D = () => DIFF[ARENA_CFG.difficulty] || DIFF.normal;
  bot._behav = ARENA_CFG.mode === "test" && bot.teamId === "B" ? (ARENA_CFG.testBehavior || "static") : "combat";
  bot._think = Math.floor(Math.random() * 20); bot._clearT = 0; bot._clearTg = null; bot._clear = false; bot._target = null; bot._strafe = Math.random() < 0.5 ? 1 : -1; bot._strafeT = 0;
  bot._lastPos = { x: bot.x, y: bot.y }; bot._stuck = 0; bot._reverseT = 0; bot._noise = { x: 0, y: 0 };
  bot._botTick = function () {
    if (this.destroyed || gameOver) return;
    const d = D();
    const bh = this._behav;
    if (bh === "static") {                       // cible inerte : ne bouge pas, ne tire pas
      this.aimTarget = { x: this.x + Math.sin(this.alphaTank) * 1500, y: this.y - Math.cos(this.alphaTank) * 1500, z: 40 };
      this.drive(0, 0); return;
    }
    const enemies = bh === "patrol" ? [] : enemiesOf(this);   // cible en mouvement : ne réagit pas au joueur

    if (--this._think <= 0) {
      this._think = d.think + Math.floor(Math.random() * 6);
      let best = null, bestScore = Infinity;
      for (const e of enemies) {
        if (!e || e.destroyed) continue;
        const dist = Math.hypot(e.x - this.x, e.y - this.y);
        if (dist > d.range * 1.25) continue;
        const los = losInfo(this.x, this.y, this.eyeZ, e.x, e.y, e.eyeZ || 2.4 * M2PX);
        if (los.blocked) continue;
        const danger = e.teamId !== this.teamId && (e.health || 1) < 100 ? 0.8 : 1;
        const score = dist * danger + (e === this._target ? -180 : 0);
        if (score < bestScore) { bestScore = score; best = e; }
      }
      this._target = best || this._target;
      if (this._target && !this._target.destroyed) this._lastSeen = { x: this._target.x, y: this._target.y, t: 0 };
      this._noise.x = (Math.random() - 0.5) * d.err * 2; this._noise.y = (Math.random() - 0.5) * d.err * 2;
    }

    const tg = this._target;
    let goalX = this.x, goalY = this.y, throttle = 0.3, wantFire = false;
    if (tg && !tg.destroyed) {
      const dx = tg.x - this.x, dy = tg.y - this.y, dist = Math.hypot(dx, dy);
      const data = getAmmoData(this.currentAmmo, this._tankModules) || { muzzleVelocity: 780 };
      const vpx = (data.muzzleVelocity || 780) * M2PX * TICK_RATE * 0.9;
      let tt = Math.max(0.15, dist / Math.max(120, vpx));
      const tvx = Math.sin(tg.alphaTank) * (tg.speed || 0), tvy = -Math.cos(tg.alphaTank) * (tg.speed || 0);
      for (let i = 0; i < 2; i++) {
        const ax = tg.x + tvx * tt, ay = tg.y + tvy * tt;
        tt = Math.max(0.15, Math.hypot(ax - this.x, ay - this.y) / Math.max(120, vpx));
      }
      const scaleErr = clamp(dist / 1800, 0.35, 2.2);
      this.aimTarget = {
        x: tg.x + tvx * tt + this._noise.x * scaleErr,
        y: tg.y + tvy * tt + this._noise.y * scaleErr,
        z: tg.centerZ ? tg.centerZ() : 40
      };

      const az = Math.atan2(this.aimTarget.y - this.y, this.aimTarget.x - this.x);
      const turretDiff = Math.abs(wrapAngle(az - this.alphaTurret));
      if (--this._clearT <= 0 || this._clearTg !== tg) { this._clearT = 6; this._clearTg = tg; this._clear = !losInfo(this.x, this.y, this.eyeZ, tg.x, tg.y, tg.eyeZ || 2.4 * M2PX).blocked; }
      const clear = this._clear;
      const canFire = dist < d.range * 0.92 && clear && turretDiff < d.tol * 4.5 && Math.abs(this.gunElevation) < 18;
      wantFire = canFire;

      const near = 700, far = 1800;
      if (dist > far) {
        goalX = tg.x; goalY = tg.y; throttle = 0.9;
      } else if (dist < near) {
        goalX = this.x - dx; goalY = this.y - dy; throttle = -0.75;
      } else {
        if (--this._strafeT <= 0) { this._strafeT = 90 + Math.random() * 180; this._strafe *= -1; }
        const orbit = 420;
        goalX = this.x + (-dy / dist) * orbit * this._strafe + dx * 0.25;
        goalY = this.y + (dx / dist) * orbit * this._strafe + dy * 0.25;
        throttle = 0.75;
      }
    } else {
      const o = bh === "patrol" ? patrolGoal(this) : (this._lastSeen && this._lastSeen.t < 600 ? this._lastSeen : objectiveFor(this));
      if (this._lastSeen) this._lastSeen.t += 1;
      goalX = o.x; goalY = o.y;
      this.aimTarget = { x: this.x + Math.sin(this.alphaTank) * 1500, y: this.y - Math.cos(this.alphaTank) * 1500, z: 40 };
      const dd = Math.hypot(goalX - this.x, goalY - this.y);
      if (dd < 140) throttle = 0.15;
      else throttle = 0.55;
    }

    if (bh === "static_fire") {                  // immobile mais vise et tire
      this.drive(0, 0);
      if (wantFire && this.reload <= 0) this.fire();
      return;
    }
    if (this._reverseT > 0) {
      this._reverseT--;
      this.drive(-0.8, this._rev || 1);
    } else {
      let ang = Math.atan2(goalX - this.x, -(goalY - this.y));
      const fw = throttle >= 0 ? 1 : -1; const m = this.collideMargin + 8;
      const probe = (dist, off) => {
        const a = this.alphaTank + off;
        return obstacleBlocksPoint(this.x + Math.sin(a) * dist * fw, this.y - Math.cos(a) * dist * fw, m);
      };
      let avoid = 0;
      if (probe(95, 0) || probe(170, 0)) avoid = probe(110, 0.7) ? (probe(110, -0.7) ? 1 : -1) : 1;
      else if (probe(95, 0.7)) avoid = -1; else if (probe(95, -0.7)) avoid = 1;
      if (throttle < 0) ang = wrapAngle(ang + Math.PI);
      const diff = wrapAngle(ang - this.alphaTank);
      let steer = clamp(diff * 2.2, -1, 1);
      if (avoid) { steer = avoid; throttle = Math.min(throttle, 0.45); }
      const fwdFactor = Math.abs(diff) > 1.1 && throttle > 0 ? 0.3 : 1;
      this.drive(throttle * fwdFactor * d.speed, steer);

      if (this.age_ === undefined) this.age_ = 0; this.age_++;
      if (this.age_ % 60 === 0) {
        const moved = Math.hypot(this.x - this._lastPos.x, this.y - this._lastPos.y);
        if (moved < 12 && throttle > 0.2) {
          this._stuck++;
          if (this._stuck >= 1) {
            this._reverseT = 50 + Math.random() * 70;
            this._rev = Math.random() < 0.5 ? 1 : -1;
            this._stuck = 0;
          }
        } else this._stuck = 0;
        this._lastPos = { x: this.x, y: this.y };
      }
    }

    if (wantFire && this.reload <= 0) this.fire();
  };
}

/* ───────────── Fin de partie & récompenses ───────────── */
function persistMatchResults(win, reason) {
  const inc = (key, amount) => localStorage.setItem(key, (parseInt(localStorage.getItem(key) || "0") || 0) + amount);
  const mode = ARENA_CFG.mode, M = ARENA_CFG.mission;
  let xpGain = 0, note = "";
  const free = mode === "sandbox" || mode === "test";
  if (free) note = "L'entraînement ne rapporte pas d'XP.";
  else {
    const part = 100, killsXp = battleStats.kills * 150, dmgXp = Math.round(battleStats.damageDealt * 0.5), winXp = win ? 500 : 0;
    const diffMult = mode === "skirmish" || mode === "campaign" ? ({ easy: 0.7, normal: 1, hard: 1.4 }[ARENA_CFG.difficulty] || 1) : 1;
    xpGain = Math.round((part + killsXp + dmgXp + winXp) * diffMult);
    note = `Participation ${part} · éliminations ${killsXp} · dégâts ${dmgXp}` + (win ? ` · victoire ${winXp}` : "") + (diffMult !== 1 ? ` · difficulté ×${diffMult}` : "");
    if (win && mode === "campaign" && M) { xpGain += M.reward || 0; note += ` · mission +${M.reward || 0}`; }
    inc("XP", xpGain); inc("XPEarned", xpGain);
  }
  if (!free) {
    inc("stat_parties", 1); inc("stat_kills", battleStats.kills); inc("stat_deaths", battleStats.deaths); inc("stat_damage", battleStats.damageDealt);
    inc("stat_shots", battleStats.shotsFired); inc("stat_hits", battleStats.shotsHit); if (win) inc("stat_wins", 1);
    if (battleStats.kills > (parseInt(localStorage.getItem("stat_maxkills") || "0") || 0)) localStorage.setItem("stat_maxkills", battleStats.kills);
    if (win && mode === "campaign" && M) {
      const key = "camp_completed_" + selectedKey, set = new Set((localStorage.getItem(key) || "").split(",").filter(Boolean).map(Number)); set.add(M.idx);
      localStorage.setItem(key, [...set].join(","));
    }
    let history = []; try { history = JSON.parse(localStorage.getItem("match_history") || "[]"); } catch (e) { }
    history.unshift({ result: win ? "WIN" : "LOSS", map: MAP_THEME, mode, tank: selectedKey, kills: battleStats.kills, damage: Math.round(battleStats.damageDealt), score: teamScore.A + "-" + teamScore.B, xp: xpGain, t: Date.now() });
    localStorage.setItem("match_history", JSON.stringify(history.slice(0, 12)));
  }
  return { xp: xpGain, note };
}

function endMatch(win, reason) {
  if (gameOver) return; gameOver = true; Rules.over = true;
  Cam.setSniper(false);
  const res = persistMatchResults(win, reason);
  const acc = battleStats.shotsFired > 0 ? Math.round(battleStats.shotsHit / battleStats.shotsFired * 100) + " %" : "—";
  const mm = t => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  const canNext = true;
  HUD.showEnd({
    win, title: win ? "Victoire" : "Défaite", sub: reason || "", xp: res.xp, xpNote: res.note,
    stats: [["Éliminations", battleStats.kills], ["Dégâts infligés", Math.round(battleStats.damageDealt).toLocaleString("fr-FR")], ["Précision", acc], ["Destructions subies", battleStats.deaths], ["Score", teamScore.A + " – " + teamScore.B], ["Durée", mm(Rules.time)]],
    again: canNext ? "Rejouer" : "Retour au QG", onAgain: canNext ? () => location.reload() : () => location.href = "lobby.html"
  });
}
