/* ==========================================================================
   ARENA-ENTITIES.JS — Simulation 3D : obus (balistique avec traînée, gravité
   et vent), chars (joueur / IA) avec volumes de collision réels (caisse +
   tourelle), blindage par zone dérivé de la hauteur et de l'angle d'impact,
   chars distants (réseau). Le moteur reste en pixels (18 px = 1 m) ; la vue
   (TankView, tank-models.js) est en mètres.
   Dépend de arena-constants.js, arena-terrain.js, tank-catalog.js,
   tank-models.js, arena-fx.js, arena-world.js, shared-data.js.
   ========================================================================== */
console.log("[TankArena] chargement : arena-entities.js");

/* ───────────── Données de munition ───────────── */
function getAmmoData(type, mods) {
  const m = mods || TankModules;
  const specific = (m.ammo || {})[type];
  if (specific) return specific;
  return (typeof globalAmmoData !== "undefined" && globalAmmoData[type]) || { muzzleVelocity: 800, mass: 6.8, caliber: 75, drag: 0.35, penetration: 92, damage: 130, explosion: 1.3, fuze: false };
}

/* ───────────── Balistique ───────────── */
const _g_px = GRAVITY * PIXELS_PER_METER * TICK_RATE * TICK_RATE;       // px/tick²
function stepBallistics(v, data) {
  // v = {vx,vy,vz} px/tick — traînée + gravité + vent, in place
  const rho = 1.225, A = Math.PI * Math.pow((data.subCaliber || data.caliber) / 2000, 2);
  const spPx = Math.hypot(v.vx, v.vy, v.vz), spMs = spPx / (PIXELS_PER_METER * TICK_RATE);
  const cd = getDragCoeff(data.drag, spMs);
  const Fd = 0.5 * rho * cd * A * spMs * spMs, dec = (Fd / data.mass) * TICK_RATE * PIXELS_PER_METER * TICK_RATE;
  if (spPx > 0.01) { const k = dec / spPx; v.vx -= v.vx * k; v.vy -= v.vy * k; v.vz -= v.vz * k; }
  v.vx += WIND.x * PIXELS_PER_METER * TICK_RATE * TICK_RATE;
  v.vz -= _g_px;
}

/* Trouve l'élévation (rad) qui amène l'obus au point cible (px). `muz` = {x,y,z} bouche. */
function solveElevation(data, muz, tx, ty, tz, azimuth) {
  const D = Math.hypot(tx - muz.x, ty - muz.y);
  if (D < 4) return Math.atan2(tz - muz.z, Math.max(D, 1));
  const v0 = data.muzzleVelocity * PIXELS_PER_METER * TICK_RATE;
  let el = Math.atan2(tz - muz.z, D) + (0.5 * GRAVITY * Math.pow(D * PX / data.muzzleVelocity, 2)) * M2PX / D;
  const cs = Math.cos(azimuth), sn = Math.sin(azimuth), vv = { vx: 0, vy: 0, vz: 0 };
  for (let it = 0; it < 4; it++) {
    vv.vx = v0 * Math.cos(el) * cs; vv.vy = v0 * Math.cos(el) * sn; vv.vz = v0 * Math.sin(el);
    let x = muz.x, y = muz.y, z = muz.z, prevZ = z, prevD = 0, zAt = null;
    for (let i = 0; i < 520; i++) {
      stepBallistics(vv, data);
      x += vv.vx; y += vv.vy; z += vv.vz;
      const d = (x - muz.x) * cs + (y - muz.y) * sn;
      if (d >= D) { const t = (D - prevD) / Math.max(1e-6, d - prevD); zAt = prevZ + (z - prevZ) * t; break; }
      prevZ = z; prevD = d;
      if (z < -400) break;
    }
    if (zAt === null) return el;     // hors de portée
    const err = zAt - tz;
    if (Math.abs(err) < 3) break;
    el -= err / D;
    el = clamp(el, -0.5, 0.9);
  }
  return el;
}

/* ───────────── Géométrie partagée Tank / RemoteTank ───────────── */
const TankGeometry = {
  /* Repère coque : lx = le long de l'axe avant, lz = latéral (droite +), mètres, centré sur la coque */
  toHull(x, y, z) {
    const dx = (x - this.x) * PX, dz = (y - this.y) * PX, s = Math.sin(this.alphaTank), c = Math.cos(this.alphaTank);
    return { lx: dx * s - dz * c, lz: dx * c + dz * s, ly: (z - (this.gz || 0)) * PX };
  },
  /* Test de volume : renvoie {part:"hull"|"turret", ...} ou null. Marge en mètres. */
  hitTest(x, y, z, margin = 0) {
    const P = this.profile;
    // rejet rapide : hors du cercle englobant (m) -> pas de trigo ni d'allocation
    let R = P._hitR;
    if (R === undefined) R = P._hitR = (P.L + P.W + P.tu.l + P.tu.w) * 0.5 + Math.abs(P.tu.x) + Math.abs(P.pivotX) + 2;
    const bx = (x - this.x) * PX, by = (y - this.y) * PX, RR = R + margin;
    if (bx * bx + by * by > RR * RR) return null;
    const h = this.toHull(x, y, z);
    if (h.ly < -margin || h.ly > P.totalHeight + margin + 0.4) return null;
    // Tourelle (volume au-dessus de la caisse)
    const tu = P.tu;
    let relYaw = 0;
    if (!P.casemate) relYaw = wrapAngle(this.alphaTurret - (this.alphaTank - Math.PI / 2));
    // point dans le repère tourelle : on tourne autour de l'axe de rotation (pivotX)
    const px0 = h.lx - P.pivotX, cr = Math.cos(relYaw), sr = Math.sin(relYaw);
    const tlx = px0 * cr + h.lz * sr, tlz = -px0 * sr + h.lz * cr;
    const cxOff = tu.x - P.pivotX;
    if (h.ly >= P.hullTop - 0.05 && h.ly <= P.hullTop + tu.h + margin &&
      Math.abs(tlx - cxOff) <= tu.l / 2 + margin && Math.abs(tlz) <= tu.w / 2 + margin) {
      return { part: "turret", lx: tlx - cxOff, lz: tlz, ly: h.ly - P.hullTop, hx: tu.l / 2, hz: tu.w / 2, hy: tu.h, relYaw };
    }
    if (h.ly <= P.hullTop + margin && Math.abs(h.lx) <= P.L / 2 + margin && Math.abs(h.lz) <= P.W / 2 + margin) {
      return { part: "hull", lx: h.lx, lz: h.lz, ly: h.ly, hx: P.L / 2, hz: P.W / 2, hy: P.hullTop };
    }
    return null;
  },
  /* Position de la bouche et direction du tir (px) */
  muzzleState(azimuth, elevRad) {
    const P = this.profile, F = { x: Math.sin(this.alphaTank), y: -Math.cos(this.alphaTank) };
    const az = azimuth === undefined ? this.alphaTurret : azimuth, el = elevRad === undefined ? degToRad(this.gunElevation || 0) : elevRad;
    const pivX = this.x + F.x * P.pivotX * M2PX, pivY = this.y + F.y * P.pivotX * M2PX;
    const gx = pivX + Math.cos(az) * P.gunX * M2PX, gy = pivY + Math.sin(az) * P.gunX * M2PX, gz = (P.hullTop + P.gunY) * M2PX + (this.gz || 0);
    const L = P.gunLen * M2PX;
    return { x: gx + Math.cos(az) * Math.cos(el) * L, y: gy + Math.sin(az) * Math.cos(el) * L, z: gz + Math.sin(el) * L, gx, gy, gz, dx: Math.cos(az) * Math.cos(el), dy: Math.sin(az) * Math.cos(el), dz: Math.sin(el) };
  },
  /* Synchronise la vue 3D (alpha = interpolation entre deux ticks) */
  syncView(alpha, dt) {
    const v = this.view; if (!v) return;
    const a = alpha === undefined ? 1 : alpha;
    const x = lerp(this.px, this.x, a), y = lerp(this.py, this.y, a);
    const at = lerpAngle(this.pAT, this.alphaTank, a), atu = lerpAngle(this.pATu, this.alphaTurret, a);
    const yawHull = Math.PI / 2 - at;
    const turretRel = this.profile.casemate ? 0 : (-atu - yawHull);
    let elev = degToRad(lerp(this.pEl, this.gunElevation || 0, a));
    if (this.profile.casemate) {
      // casemate : seul le canon pivote — l'azimut relatif se traduit par le lacet du pivot de canon
      v.turretPivot.rotation.y = wrapAngle(-atu - yawHull);
    }
    const pit = this.pitch || 0, rol = this.roll || 0;
    v.setPose(x * PX, y * PX, yawHull, turretRel, elev - pit * Math.cos(turretRel), this.recoilOffset || 0, (this.gz || 0) * PX, pit + (this.accPitch || 0), rol + (this.accRoll || 0));
    if (this.profile.casemate && !this.destroyed) v.turretPivot.rotation.y = wrapAngle(-atu - yawHull);
    // chenilles
    const vm = (this.speed || 0) * PX, om = (this.angularVelocity || 0) * this.profile.W * 0.5;
    v.animateTracks(vm + om, vm - om);
    v.setTrackBroken(this.modules ? !this.modules.trackLeft : false, this.modules ? !this.modules.trackRight : false);
  },
  /* Position monde de l'œil / centre de la cible (px) */
  centerZ() { return this.profile.hullTop * 0.55 * M2PX + (this.profile.totalHeight - this.profile.hullTop) * 0.25 * M2PX + (this.gz || 0); }
};

/* ───────────── Résolution du blindage ───────────── */
function resolveShellImpact(target, shell, hit, hitPos) {
  const P = target.profile, mods = target._tankModules || {};
  const armor = target.armor || {}, ta = target.trackArmor || { front: 15, side: 18, rear: 15 };
  const gP = k => { const p = armor[k]; if (!p) return { thickness: 30, angle: 0 }; if (typeof p === "object" && "thickness" in p) return p; return { thickness: p, angle: 0 }; };

  // direction du projectile dans le repère du corps touché
  const sp = Math.hypot(shell.vx, shell.vy, shell.vz) || 1;
  const dX = shell.vx / sp, dZ = shell.vy / sp, dY = shell.vz / sp;     // scène : X, Z, Y
  let bodyYaw;                                                           // angle monde (x,y) de l'axe avant du corps
  if (hit.part === "turret" && !P.casemate) bodyYaw = target.alphaTurret; else bodyYaw = target.alphaTank - Math.PI / 2;
  const fx = Math.cos(bodyYaw), fz = Math.sin(bodyYaw);                  // avant (X,Z)
  const rx = -fz, rz = fx;                                               // droite
  const dl = { x: dX * fx + dZ * fz, y: dY, z: dX * rx + dZ * rz };
  // point d'impact dans le repère du corps (déjà donné par hit.lx / lz / ly)
  const p = { x: hit.lx, y: hit.ly - hit.hy / 2, z: hit.lz };
  const half = { x: hit.hx, y: hit.hy / 2, z: hit.hz };
  // face d'entrée : l'axe que le tir a franchi en dernier en remontant la trajectoire
  const tt = {};
  for (const a of ["x", "y", "z"]) {
    const d = dl[a]; if (Math.abs(d) < 1e-6) { tt[a] = 1e9; continue; }
    tt[a] = d > 0 ? (p[a] + half[a]) / d : (p[a] - half[a]) / d;
  }
  let axis = "x"; if (tt.y < tt[axis]) axis = "y"; if (tt.z < tt[axis]) axis = "z";
  const impactAngle = Math.acos(clamp(Math.abs(dl[axis]), 0, 1)) * 180 / Math.PI;
  let face, zone, plate;
  const vsign = dl[axis];
  if (axis === "x") face = vsign < 0 ? "avant" : "arriere"; else if (axis === "z") face = "flanc"; else face = "toit";
  const ratio = hit.ly / Math.max(0.01, hit.hy);
  if (hit.part === "turret") {
    zone = face === "toit" ? "tourelle_toit" : "tourelle";
    const base = face === "avant" ? gP("turretFront") : face === "flanc" ? gP("turretSide") : gP("turretRear");
    plate = face === "toit" ? { thickness: Math.max(10, gP("turretRear").thickness * 0.45), angle: 0 } : base;
  } else {
    if (face === "toit") { zone = "coque_haute"; plate = { thickness: Math.max(10, gP("hullRear").thickness * 0.5), angle: 0 }; }
    else if (face === "flanc" && hit.ly < Math.min(P.trackH + 0.1, P.hullTop * 0.55) && Math.abs(hit.lz) > P.W * 0.28) {
      zone = "chenilles"; plate = { thickness: ta.side, angle: 0 };
    } else {
      zone = ratio > 0.62 ? "coque_haute" : ratio > 0.3 ? "coque_centre" : "coque_basse";
      const base = face === "avant" ? gP("hullFront") : face === "flanc" ? gP("hullSide") : gP("hullRear");
      const k = zone === "coque_basse" ? (face === "avant" ? 0.8 : face === "flanc" ? 0.75 : 0.9) : 1;
      plate = { thickness: base.thickness * k, angle: base.angle || 0 };
      if (zone === "chenilles") plate = { thickness: ta.side, angle: 0 };
    }
  }
  // point et direction d'entrée dans le REPÈRE COQUE (mètres), pour les dégâts internes
  const hy = target.alphaTank - Math.PI / 2, hfx = Math.cos(hy), hfz = Math.sin(hy);
  const dirH = { x: dX * hfx + dZ * hfz, y: dY, z: dX * (-hfz) + dZ * hfx };
  let entryH;
  if (hit.part === "hull") entryH = { x: hit.lx, y: hit.ly, z: hit.lz };
  else {
    const ry = hit.relYaw || 0, cr = Math.cos(ry), sr = Math.sin(ry), u = hit.lx + (P.tu.x - P.pivotX);
    entryH = { x: P.pivotX + u * cr - hit.lz * sr, y: hit.ly + P.hullTop, z: u * sr + hit.lz * cr };
  }
  const zL = { tourelle_toit: "Toit tourelle", tourelle: "Tourelle", coque_haute: "Coque haute", coque_centre: "Coque", coque_basse: "Coque basse", chenilles: "Chenilles" };
  const fL = { avant: "Av.", flanc: "Fl.", arriere: "Ar.", toit: "Toit" };
  return {
    baseArmor: Math.round(plate.thickness), plateAngle: plate.angle || 0, impactAngle, zone, face,
    faceName: zL[zone] + (face === "toit" ? "" : " " + fL[face]), side: hit.lz >= 0 ? 1 : -1, relAngle: hit.lz >= 0 ? 1 : -1,
    attackerBearing: Math.atan2(-shell.vy, -shell.vx), entryH, dirH
  };
}

/* Décision balistique commune : ricochet / overmatch / pénétration / blocage */
function decideImpact(shell, info) {
  const pen = shell.currentPenetration || shell.penetration0;
  const noRicochet = shell.type === "HEAT" || shell.type === "fumigène" || shell.type === "shrapnel" || shell.type === "HE";
  const ricochetAngle = noRicochet ? 999 : (shell.type === "APCR" || shell.type === "APDS") ? 80 : (shell.type === "APHE" || shell.type === "APCBC") ? 70 : 75;
  if (info.impactAngle > ricochetAngle) { const chance = (info.impactAngle - ricochetAngle) / 10; if (Math.random() < chance) return { outcome: "ricochet", pen }; }
  const overmatch = shell.caliber / Math.max(1, info.baseArmor);
  if (overmatch >= 3) return { outcome: "overmatch", pen, residual: 1.5, damage: Math.round(shell.damage * shell.explosionPower * 1.5), effective: info.baseArmor };
  const angleRad = degToRad(Math.min(info.impactAngle, 85));
  const normDeg = shell.type === "APHE" ? 4 : shell.type === "APCR" ? 2 : 0;
  const totalRad = Math.max(0, angleRad + degToRad(info.plateAngle || 0) - degToRad(normDeg));
  const effective = Math.round(info.baseArmor / Math.cos(Math.min(totalRad, degToRad(85))));
  if (pen >= effective) { const residual = Math.min(2.0, pen / effective); return { outcome: "pen", pen, effective, residual, damage: Math.round(shell.damage * shell.explosionPower * residual) }; }
  const r = pen / effective;
  if (r > 0.85 && shell.type === "APHE") return { outcome: "spall", pen, effective, ratio: r };
  return { outcome: "blocked", pen, effective };
}

/* ───────────── Item ───────────── */
class Item {
  constructor(x, y) { this.x = x; this.y = y; items.push(this); }
  kill() { const i = items.indexOf(this); if (i !== -1) items.splice(i, 1); }
}

/* ───────────── Obus ───────────── */
const _shellGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6).rotateZ(Math.PI / 2);   // axe X, longueur 1
const _shellMats = {};
function shellMat(type) {
  const c = type === "HEAT" ? 0xff7a30 : type === "HE" ? 0xffc040 : type === "fumigène" ? 0xdddddd : 0xffe58a;
  return _shellMats[c] || (_shellMats[c] = new THREE.MeshBasicMaterial({ color: c, fog: false }));
}

class Shell extends Item {
  /* origin = {x,y,z (px), dx,dy,dz (unitaires, scène X,Z,Y → ici x,y,z sim)} ; owner peut être null (obus réseau) */
  constructor(origin, ammoType, owner, ownerModules, ownerVel) {
    super(origin.x, origin.y);
    this.z = origin.z;
    this.owner = owner; this.type = ammoType; this.explode = false; this.nbImage = 0; this.age = 0; this.travel = 0;
    this.fuzeDelay = 0; this.pendingTarget = null; this.pendingInfo = null; this.networked = !owner;
    const data = getAmmoData(ammoType, ownerModules);
    this.data = data;
    this.muzzleVelocity = data.muzzleVelocity; this.mass = data.mass; this.caliber = data.caliber;
    this.subCaliber = data.subCaliber || null; this.drag = data.drag; this.penetration0 = data.penetration;
    this.damage = data.damage; this.explosionPower = data.explosion; this.hasFuze = data.fuze || false;
    const pxPerTick = this.muzzleVelocity * PIXELS_PER_METER * TICK_RATE;
    this.vx = pxPerTick * origin.dx + (ownerVel ? ownerVel.x : 0);
    this.vy = pxPerTick * origin.dy + (ownerVel ? ownerVel.y : 0);
    this.vz = pxPerTick * origin.dz;
    this.speedMs = this.muzzleVelocity;
    this.mesh = new THREE.Mesh(_shellGeo, shellMat(ammoType));
    this.mesh.position.set(this.x * PX, this.z * PX, this.y * PX); this.mesh.scale.set(1, 1, 1);
    this.mesh.frustumCulled = false;
    World.S.scene.add(this.mesh);
    this._orient();
    if (typeof Net !== "undefined" && Net.on && owner && !owner.remote && !origin.net) Net.shot(owner, origin, ammoType, ownerVel);
  }
  getPenetration(distM) { const k = this.drag * 0.0008, v = this.muzzleVelocity * Math.exp(-k * distM); return Math.round(this.penetration0 * Math.pow(v / this.muzzleVelocity, 1.4285)); }
  _orient() {
    const sp = Math.hypot(this.vx, this.vy, this.vz) || 1;
    const len = clamp(sp * PX * 0.9, 1.4, 11);          // traînée visible proportionnelle à la vitesse
    this.mesh.scale.set(len, 1 + len * 0.02, 1 + len * 0.02);
    const dir = new THREE.Vector3(this.vx, this.vz, this.vy).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    this.mesh.position.set(this.x * PX - dir.x * len * 0.5, this.z * PX - dir.y * len * 0.5, this.y * PX - dir.z * len * 0.5);
  }
  kill() { if (this.mesh) { World.S.scene.remove(this.mesh); this.mesh = null; } super.kill(); }
  _finish() { this.explode = true; if (this.mesh) { World.S.scene.remove(this.mesh); this.mesh = null; } }

  live() {
    if (this.explode) { if (++this.nbImage > 2) this.kill(); return; }
    this.age += TICK_RATE;
    stepBallistics(this, this.data);
    const spN = Math.hypot(this.vx, this.vy, this.vz);
    this.speedMs = spN / (PIXELS_PER_METER * TICK_RATE);
    const SS = Math.max(4, Math.min(48, Math.ceil(spN / 5)));
    const dx = this.vx / SS, dy = this.vy / SS, dz = this.vz / SS, stepLen = spN / SS;
    for (let s = 0; s < SS; s++) {
      this.x += dx; this.y += dy; this.z += dz; this.travel += stepLen;
      const wx = this.x * PX, wy = this.z * PX, wz = this.y * PX;
      // Chars locaux / IA
      for (const item of items) {
        if (item instanceof Tank && item !== this.owner && !item.destroyed) {
          const hit = item.hitTest(this.x, this.y, this.z, 0.05);
          if (hit) { this._hitTank(item, hit, false); return; }
        }
      }
      // Décor
      if (obstacleHit3(this.x, this.y, this.z)) {
        this._finish(); FX.impact(wx, wy, wz, "blocked"); playImpactSound("blocked", this.x, this.y);
        if (this.type === "HE" || this.type === "HEAT") FX.explosion(wx, wy, wz, 0.35);
        return;
      }
      const gh = groundH(this.x, this.y);
      if (this.z <= gh) {
        const gy = gh * PX;
        this._finish(); FX.groundHit(wx, gy + 0.05, wz, this.caliber > 90); playImpactSound("blocked", this.x, this.y);
        if (this.type === "HE") FX.explosion(wx, gy + 0.4, wz, 0.55);
        if (this.type === "fumigène") FX.smokeScreen(wx, gy + 0.4, wz);
        return;
      }
      if (this.x < 0 || this.y < 0 || this.x > MAP_WIDTH || this.y > MAP_HEIGHT) { this._finish(); this.kill(); return; }
    }
    if (this.age > 12) { this.kill(); return; }
    this._orient();
  }

  _hitTank(target, hit, remote, pid) {
    this.currentPenetration = this.getPenetration(this.travel * PX);
    if (this.type === "HEAT") this.currentPenetration = this.penetration0;
    if (this.type === "shrapnel") this.damage = Math.round(this.damage * 0.65);
    const wx = this.x * PX, wy = this.z * PX, wz = this.y * PX;
    this._finish();
    if (this.type === "fumigène") { FX.smokeScreen(wx, wy, wz); addDamageEvent("blocked", "FUMÉE déployée"); return; }
    if (this.owner === localTank) battleStats.shotsHit++;
    if (remote) { target.takeShellHitNet(this, hit, pid); return; }
    target.takeShellHit(this, hit);
  }
}

/* ───────────── Création de la vue d'un char ───────────── */
function makeView(key, team, isLocal) {
  const view = TankModels.create(key);
  World.S.scene.add(view.root);
  view.setTeam(team);
  view.setShadow(Settings.quality().shadows);
  return view;
}

/* ───────────── Char (joueur local & IA) ───────────── */
class Tank extends Item {
  constructor(x, y, modulesOverride, teamIdParam, key) {
    super(x, y);
    this._tankKey = key || selectedKey;
    this.profile = getTankProfile(this._tankKey);
    this.px = x; this.py = y; this.pAT = 0; this.pATu = 0; this.pEl = 0;
    this.alphaTank = 0; this.alphaTurret = 0;
    this.turretAngVel = 0; this.gunElevation = 0;
    this.reload = 0; this.reloadMax = 8 * 60;
    this.speed = 0; this.angularVelocity = 0; this.gear = 0;
    this.currentAmmo = "APHE";
    this.isEnemy = false; this.destroyed = false; this.fireTimer = 0;
    this.recoilOffset = 0;
    this._repairTimer = 0;
    this.teamId = teamIdParam || "A";
    this.spotted = false; this._spottedMemoryTimer = 0; this._lastKnownX = null; this._lastKnownY = null; this._firedTimer = 0;
    this._tankModules = modulesOverride || TankModules;
    this._eyeRel = (this.profile.hullTop + this.profile.tu.h * 0.7) * M2PX;
    this.gz = groundH(x, y); this.pitch = 0; this.roll = 0;
    this.aimTarget = null;
    this.wreckTimer = 0; this.dustTimer = 0;

    const maxMs = (this._tankModules.speed || 40) / 3.6, revMs = Math.abs(this._tankModules.reverseSpeed || -6) / 3.6;
    const maxPxTick = maxMs * PIXELS_PER_METER * TICK_RATE, revPxTick = revMs * PIXELS_PER_METER * TICK_RATE;
    const weightT = this._tankModules.weightTons || this.profile.weightTons || 30;
    this._accInertia = Math.pow(weightT / 30, 0.55); this._rotInertia = Math.pow(weightT / 30, 0.65);
    /* Groupe motopropulseur : puissance massique déduite de la vitesse de pointe (pas de donnée moteur dans les fiches). */
    const vKmh = this._tankModules.speed || 40;
    this._hpt = clamp(8 + vKmh * 0.28, 10, 26);                                   // ch / tonne
    this._pw = this._hpt * 0.7457 * 0.9;                                          // W/kg utile aux chenilles (= m²/s³)
    this._aMax = clamp(3.5 * Math.pow(30 / weightT, 0.2), 2.0, 4.6);              // adhérence / couple maxi au démarrage (m/s²)
    this._yawMax = clamp(36 * Math.pow(this._hpt / 17, 0.4) * Math.pow(30 / weightT, 0.25), 20, 52) * Math.PI / 180;   // rad/s, rotation sur place
    this._yawT = clamp(0.5 * Math.sqrt(weightT / 30), 0.32, 1.1);                   // s pour atteindre cette rotation (inertie en lacet)
    this._steerIn = 0; this.lat = 0; this._flipT = 0; this._flipDir = 1; this._brk = 0; this._driven = false; this.accPitch = 0; this.accRoll = 0;
    this.maxPxTick = maxPxTick; this.revPxTick = revPxTick;
    this.gearSpeed = { "-2": -revPxTick, "-1": -revPxTick * 0.5, "0": 0, "1": maxPxTick * 0.15, "2": maxPxTick * 0.30, "3": maxPxTick * 0.50, "4": maxPxTick * 0.68, "5": maxPxTick * 0.85, "6": maxPxTick };
    this.maxTurretRad = degToRad(this._tankModules.turretRotSpeed ?? 15) * TICK_RATE;
    this.elevMin = this.profile.casemate ? -6 : (this.profile.cat === "heavy" ? -6 : -8);
    this.elevMax = this.profile.casemate ? 14 : (this.profile.cat === "td_heavy" ? 15 : 20);
    this.collideMargin = clamp(this.profile.radiusPx * 0.62, 26, 46);
    this.engineHealth = 100;
    const defaultArmor = { hullFront: { thickness: 50, angle: 0 }, hullSide: { thickness: 30, angle: 0 }, hullRear: { thickness: 20, angle: 0 }, turretFront: { thickness: 50, angle: 0 }, turretSide: { thickness: 30, angle: 0 }, turretRear: { thickness: 20, angle: 0 } };
    this.armor = this._tankModules.armor || defaultArmor;
    this.caliber = Object.values(this._tankModules.ammo || {})[0]?.caliber || 75;
    this.trackArmor = this._tankModules.trackArmor || { front: 15, side: 18, rear: 15 };
    this.resetModules();
    this.view = makeView(this._tankKey, this.teamId, false);
    this.syncView(1);
  }
  resetModules() {
    const crewCount = this._tankModules.crew || this.profile.crew || 4;
    this.modules = { engine: true, canon: true, trackLeft: true, trackRight: true, crew: { commander: true, gunner: true, loader: true, driver: crewCount >= 1, radio: crewCount >= 5 } };
    this.turretSpeedMult = 1.0; this.engineHealth = 100; this._netHPLeft = 300;
    if (this.int && this.int.xray) Dmg.hideXray(this);
    this.int = Dmg.build(this); Dmg.sync(this);
  }
  get eyeZ() { return this._eyeRel + this.gz; }
  get crewAlive() { return Object.values(this.modules.crew).filter(Boolean).length; }
  get internals() { return this.int; }
  setTeam(t) { this.teamId = t; this.view.setTeam(t); }

  /* Pose actuelle du point visé en azimut/élévation, puis tir si ordonné */
  _aimStep() {
    const t = this.aimTarget;
    const maxRot = this.maxTurretRad * this.turretSpeedMult;
    if (t) {
      const az = Math.atan2(t.y - this.y, t.x - this.x);
      let diff = wrapAngle(az - this.alphaTurret);
      // limite de débattement (casemate)
      if (this.profile.casemate) {
        const half = degToRad(this.profile.traverse / 2), fwd = this.alphaTank - Math.PI / 2;
        const relNow = wrapAngle(this.alphaTurret - fwd), relTarget = clamp(wrapAngle(az - fwd), -half, half);
        diff = relTarget - relNow;
      }
      const tv = clamp(diff, -maxRot, maxRot);
      this.turretAngVel += (tv - this.turretAngVel) * 0.2; this.turretAngVel = clamp(this.turretAngVel, -maxRot, maxRot);
      this.alphaTurret += this.turretAngVel;
      // élévation balistique
      const muz = this.muzzleState(this.alphaTurret, 0);
      const data = getAmmoData(this.currentAmmo, this._tankModules);
      const target = this._aimElev !== undefined && this._aimKey === (this.currentAmmo + "|" + Math.round(t.x / 6) + "|" + Math.round(t.y / 6) + "|" + Math.round(t.z / 6) + "|" + Math.round(this.x / 8) + "|" + Math.round(this.y / 8)) ? this._aimElev : null;
      let el = target;
      if (el === null) {
        el = radToDeg(solveElevation(data, { x: muz.gx, y: muz.gy, z: muz.gz }, t.x, t.y, t.z, this.alphaTurret));
        this._aimElev = el; this._aimKey = this.currentAmmo + "|" + Math.round(t.x / 6) + "|" + Math.round(t.y / 6) + "|" + Math.round(t.z / 6) + "|" + Math.round(this.x / 8) + "|" + Math.round(this.y / 8);
      }
      el = clamp(el, this.elevMin, this.elevMax);
      const rate = 22 * TICK_RATE * (this.modules.crew.gunner ? 1 : 0.2);
      this.gunElevation += clamp(el - this.gunElevation, -rate, rate);
    } else this.turretAngVel *= 0.85;
  }

  live() {
    this.px = this.x; this.py = this.y; this.pAT = this.alphaTank; this.pATu = this.alphaTurret; this.pEl = this.gunElevation;
    if (this.destroyed) {
      this.speed *= 0.9; this.recoilOffset = 0;
      this.wreckTimer++;
      return;
    }
    if (this.reload > 0) this.reload--;
    Dmg.tick(this); if (this.destroyed) return;
    this._aimStep();

    this.recoilOffset *= 0.82;
    if (this._flipT > 0) { this._driven = true; this._steerIn = 0; }
    const prevX = this.x, prevY = this.y;
    this.x += Math.sin(this.alphaTank) * this.speed + Math.cos(this.alphaTank) * this.lat; this.y += -Math.cos(this.alphaTank) * this.speed + Math.sin(this.alphaTank) * this.lat;

    this._terrain();
    /* Marche libre : pas d'accélérateur ni de frein ce tick → frottements + frein moteur */
    const v0 = this.speed;
    if (!this._driven) this._coast();
    if (Math.abs(this.speed) < 0.0015 && !this._driven) this.speed = 0;
    this._driven = false;
    this._yawStep();
    if (this._flipT > 0) this._flipStep(); if (this.destroyed) return;
    /* le char qui tourne en roulant perd de la vitesse (patinage des chenilles) */
    this.speed *= 1 - Math.abs(this.angularVelocity) * 60 * 57.3 * 0.00002;
    const accMs2 = (this.speed - v0) * 200;                                         // px/tick² → m/s²
    this.accPitch += (clamp(accMs2 * 0.022, -0.075, 0.075) - this.accPitch) * 0.09;
    if (!this._flipT) this.accRoll += (clamp(this.angularVelocity * this.speed * -0.9 + this.lat * 0.05, -0.12, 0.12) - this.accRoll) * 0.1;

    const prevAlpha = this.alphaTank;
    this.alphaTank += this.angularVelocity;
    this.alphaTurret += this.alphaTank - prevAlpha;
    this._slide(this.angularVelocity);
    if (!this.modules.trackLeft && !this.modules.trackRight) { this.speed = 0; this.angularVelocity = 0; }
    else if (!this.modules.trackLeft) this.angularVelocity = clamp(this.angularVelocity, 0, 0.06);
    else if (!this.modules.trackRight) this.angularVelocity = clamp(this.angularVelocity, -0.06, 0);
    if (!this.modules.trackLeft || !this.modules.trackRight) this.speed *= 0.995;
    this.x = clamp(this.x, 50, MAP_WIDTH - 50); this.y = clamp(this.y, 50, MAP_HEIGHT - 50);
    const m = this.collideMargin;
    if (obstacleBlocksPoint(this.x, this.y, m)) {
      if (this._tripCheck(true)) return;
      this.lat *= -0.1;
      const blockX = obstacleBlocksPoint(prevX, this.y, m), blockY = obstacleBlocksPoint(this.x, prevY, m);
      if (!blockX) this.x = prevX; else if (!blockY) this.y = prevY; else { this.x = prevX; this.y = prevY; this.speed *= -0.15; }
      this.angularVelocity *= 0.5;
    }
    if (this._firedTimer > 0) this._firedTimer--;
  }

  /* Relief : altitude sous la coque, tangage / roulis, pente et eau peu profonde */
  _terrain() {
    this._pose();
    if (this.destroyed) return;
    const tn = Math.tan(this.pitch), up = this.speed * tn;                 // > 0 : on monte la pente
    if (up > 0) this.speed *= 1 - Math.min(0.5, Math.abs(tn)) * 0.08;      // montée : la vitesse chute
    else if (up < 0) this.speed *= 1 + Math.min(0.5, Math.abs(tn)) * 0.012; // descente : léger gain
    if (Math.abs(tn) > 0.6) this.speed -= tn * 0.02;                        // trop raide : le char glisse
    if (inShallowWater(this.x, this.y)) this.speed *= 0.955;
  }
  /* altitude sous la coque + tangage / roulis (aussi utilisé par les chars distants) */
  _pose() {
    const P = this.profile, a = this.alphaTank, fx = Math.sin(a), fy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
    const hl = P.L * 0.5 * M2PX * 0.85, hw = P.W * 0.5 * M2PX;
    const hF = groundH(this.x + fx * hl, this.y + fy * hl), hB = groundH(this.x - fx * hl, this.y - fy * hl);
    const hR = groundH(this.x + rx * hw, this.y + ry * hw), hL = groundH(this.x - rx * hw, this.y - ry * hw);
    const gTarget = (hF + hB + hR + hL) / 4, pT = Math.atan2(hF - hB, hl * 2), rT = Math.atan2(hL - hR, hw * 2);
    this.gz += (gTarget - this.gz) * 0.5; this.pitch += (pT - this.pitch) * 0.25; this.roll += (rT - this.roll) * 0.25;
  }

  /* Effets visuels continus (une fois par image) */
  fxUpdate(dt) {
    const P = this.profile, wx = this.x * PX, wz = this.y * PX, gy = (this.gz || 0) * PX;
    if (this.destroyed) {
      const fresh = this.wreckTimer < 60 * 28;
      if (Math.random() < (fresh ? 0.9 : 0.25)) FX.fire(wx, gy + P.hullTop + 0.8, wz, fresh ? 1.3 : 0.7);
      if (Math.random() < 0.35) FX.damageSmoke(wx, gy + P.totalHeight + 0.5, wz, true);
      return;
    }
    if (this.int && this.int.fire && Math.random() < 0.7) FX.fire(wx - Math.sin(this.alphaTank) * P.L * 0.3, gy + P.hullTop + 0.3, wz + Math.cos(this.alphaTank) * P.L * 0.3, 0.8);
    if (this.engineHealth < 50 && Math.random() < 0.3) FX.damageSmoke(wx - Math.sin(this.alphaTank) * P.L * 0.35, gy + P.hullTop + 0.2, wz + Math.cos(this.alphaTank) * P.L * 0.35, this.engineHealth < 20);
    if (Math.abs(this.speed) > 0.6) {
      this.dustTimer += Math.abs(this.speed);
      if (this.dustTimer > 2.2) {
        this.dustTimer = 0;
        const bx = -Math.sin(this.alphaTank) * Math.sign(this.speed), bz = Math.cos(this.alphaTank) * Math.sign(this.speed);
        for (const s of [-1, 1]) FX.dust(wx + bx * P.L * 0.45 + Math.cos(this.alphaTank) * s * P.W * 0.4, wz + bz * P.L * 0.45 + Math.sin(this.alphaTank) * s * P.W * 0.4, Math.abs(this.speed) * 0.5, gy);
      }
    }
  }

  /* ───── Groupe motopropulseur ───── */
  /* accélération disponible (m/s²) à la vitesse v (m/s) : couple limité à bas régime, puissance constante ensuite */
  _driveAcc(v, em) { return Math.max(0.04, Math.min(this._aMax, this._pw * em / Math.max(v, 1.2)) - (0.25 + 0.0008 * v * v)); }
  /* marche libre : roulement + frein moteur, plus fort à haute vitesse */
  _coast() {
    const v = Math.abs(this.speed) * 3.333, d = (1.6 + 0.002 * v * v) * 0.005;
    this._brk = Math.max(0, this._brk - 0.1);
    this.speed = Math.abs(this.speed) <= d ? 0 : this.speed - Math.sign(this.speed) * d;
  }
  /* pousse la vitesse vers `target` (px/tick, signée) avec la puissance et l'inertie du char */
  _throttle(target) {
    if (!this.modules.engine || this.engineHealth <= 0 || this._flipT > 0) return;
    this._driven = true; this._brk = Math.max(0, this._brk - 0.1);
    const em = clamp(this.engineHealth / 100, 0.15, 1), v = Math.abs(this.speed) * 3.333;
    const sp = this.speed;
    if (Math.abs(target) < 1e-4) return this._coast();
    if (sp !== 0 && Math.sign(sp) !== Math.sign(target)) {                         // inversion : on freine d'abord
      const d = (2.8 + 2.0 * this._brk) * 0.005; this._brk = Math.min(1, this._brk + 0.08);
      this.speed = Math.abs(sp) <= d ? 0 : sp - Math.sign(sp) * d; return;
    }
    const dir = Math.sign(target) || 1, rev = dir < 0 ? 0.7 : 1;
    if (Math.abs(target) > Math.abs(sp)) {                                          // accélération
      this.speed = sp + dir * this._driveAcc(v, em) * rev * 0.005;
      if (Math.abs(this.speed) > Math.abs(target)) this.speed = target;
    } else {                                                                        // on lève le pied : frein moteur
      const d = (1.8 + 0.002 * v * v) * 0.005;
      this.speed = Math.abs(sp) - Math.abs(target) <= d ? target : sp - dir * d;
    }
  }
  /* freinage de service : monte progressivement, bloque le char à l'arrêt */
  brake() {
    this._driven = true; this._brk = Math.min(1, this._brk + 0.12);
    const sp = this.speed, d = (2.4 + 3.2 * this._brk) * 0.005;
    this.speed = Math.abs(sp) <= d ? 0 : sp - Math.sign(sp) * d;
    if (this.speed === 0) this.gear = 0;
  }
  /* ───── Dérapage et renversement ───── */
  /* La vitesse du char est conservée quand la caisse tourne ; seule l'adhérence des chenilles la ramène dans l'axe. */
  _slide(dA) {
    const f = this.speed, l = this.lat, c = Math.cos(dA), sn = Math.sin(dA);
    this.speed = f * c + l * sn; this.lat = l * c - f * sn;
    const mu = inShallowWater(this.x, this.y) ? 0.4 : 0.85, d = mu * 9.81 * 0.005;     // adhérence latérale (px/tick²)
    this.lat = Math.abs(this.lat) <= d ? 0 : this.lat - Math.sign(this.lat) * d;
    this.speed *= 1 - Math.abs(this.lat) * 0.004;                                    // le patinage freine
    if (this._flipT > 0) return;
    this._tripCheck(false);
  }
  /* Renversement : glissement latéral rapide + butée (obstacle, fossé, pente, eau) */
  _tripCheck(hitObstacle) {
    if (this._flipT > 0 || this.destroyed) return false;
    const P = this.profile, ratio = (P.W * 0.5) / Math.max(0.6, P.totalHeight * 0.4);   // facteur de stabilité statique
    const tripV = 5.5 * ratio, latMs = Math.abs(this.lat) * 3.333;
    if (latMs < tripV) return false;
    if (hitObstacle || Math.abs(this.roll) > 0.2 || inShallowWater(this.x, this.y) || latMs > tripV * 1.8) {
      this._flipT = 1; this._flipDir = Math.sign(this.lat) || 1;
      this._ev("module", "Char renversé !");
      return true;
    }
    return false;
  }
  _flipStep() {
    this._flipT++;
    this.accRoll = this._flipDir * Math.PI * Math.min(1, this._flipT / 50);
    this.speed *= 0.96; this.lat *= 0.96; this.angularVelocity *= 0.9;
    if (this._flipT < 50) return;
    for (const k of Object.keys(this.modules.crew)) this.modules.crew[k] = false;
    if (this.int) for (const m of this.int.mods) if (m.kind === "crew") m.hp = 0;
    this._destroyTank(false);
  }
  /* lacet : couple limité, inertie selon la masse, rotation sur place plus vive qu'en roulant */
  _yawStep() {
    const em = clamp(this.engineHealth / 100, 0.3, 1), L = this.modules.trackLeft, R = this.modules.trackRight;
    const one = (L && R) ? 1 : 0.4;                                                 // une seule chenille motrice : couple de rotation très réduit
    const v = Math.abs(this.speed) * 3.333, vmax = Math.max(1, this.maxPxTick * 3.333);
    let s = clamp(this._steerIn, -1, 1); this._steerIn = 0;
    if (!this.modules.engine || this.engineHealth <= 0) s = 0;
    if (!L && R && s < 0) s = 0; else if (L && !R && s > 0) s = 0;                  // ne peut pivoter que du côté de la chenille valide
    const lim = this._yawMax * (0.5 + 0.5 * em) * one * (1 - 0.15 * Math.min(1, v / vmax)) / 60;   // rad/tick
    const a = this._yawMax / 60 / (this._yawT * 60) * (0.5 + 0.5 * em) * one;       // rad/tick²
    const w = this.angularVelocity, tgt = s * lim;
    if (s !== 0) this.angularVelocity = w + clamp(tgt - w, -a * (Math.sign(w) !== Math.sign(tgt) && w !== 0 ? 1.8 : 1), a * (Math.sign(w) !== Math.sign(tgt) && w !== 0 ? 1.8 : 1));
    else this.angularVelocity = Math.abs(w) <= a * 2 ? 0 : w - Math.sign(w) * a * 2;       // frottement latéral du sol
  }
  /* Commande d'IA / manette : accélérateur et braquage normalisés (−1..1) */
  drive(throttle, steer) {
    this._steerIn += steer;
    if (!this.modules.engine || this.engineHealth <= 0) return;
    this._throttle(throttle >= 0 ? this.maxPxTick * throttle : -this.revPxTick * -throttle);
  }
  move(dir = 1) {
    if (!this.modules.engine || this.engineHealth <= 0) return;
    if (dir > 0) {
      if (this.gear <= 0) this.gear = 1;
      this._throttle(this.gearSpeed[String(this.gear)] || 0);
    } else if (Math.abs(this.speed) < 0.05) {
      if (this.gear >= 0) this.gear = -1;
      this._throttle(this.gearSpeed[String(this.gear)] || 0);
    } else this.brake();
  }
  rotate(dir) { this._steerIn += dir; }
  repair() {
    if (Math.abs(this.speed) > 0.3) { this._repairTimer = 0; return; }
    this._repairTimer++;
    if (this._repairTimer % 60 === 0) addDamageEvent(" ", "Réparation… " + Math.floor(this._repairTimer / 60) + " s / 3 s");
    if (this._repairTimer >= 180) {
      this._repairTimer = 0;
      if (!this.modules.trackLeft) { this.modules.trackLeft = true; addDamageEvent("track", "Chenille gauche réparée"); }
      else if (!this.modules.trackRight) { this.modules.trackRight = true; addDamageEvent("track", "Chenille droite réparée"); }
      else { const r = Dmg.repairStep(this); addDamageEvent("track", r || "Rien à réparer"); }
    }
  }
  /* Le canon est-il aligné (écart en radians) sur l'azimut demandé ? */
  fire() {
    if (this.destroyed || !this.modules.canon || this.reload > 0 || this.crewAlive <= 0) return false;
    const data = getAmmoData(this.currentAmmo, this._tankModules);
    const baseSec = this._tankModules.reloadSec || (4 + data.caliber * 0.045);
    const loaderP = this.modules.crew.loader ? 1 : 2.5;
    const crewR = this.crewAlive / Object.keys(this.modules.crew).length, crewP = crewR < 1 ? 1 + (1 - crewR) * 1.5 : 1;
    const diffMult = this.isEnemy ? (ARENA_CFG.difficulty === "easy" ? 1.35 : ARENA_CFG.difficulty === "hard" ? 0.9 : 1) : 1;
    this.reload = Math.round(baseSec * crewP * loaderP * 60 * diffMult * (this.int ? this.int.reloadMult : 1));
    if (this.int) this.int.fill = Math.max(0.25, this.int.fill - 0.025); this.reloadMax = this.reload;
    this.recoilOffset = Math.min(0.9, data.caliber * 0.0075);
    const muz = this.muzzleState();
    // dispersion
    const disp = (this.isEnemy ? (ARENA_CFG.difficulty === "easy" ? 2.6 : ARENA_CFG.difficulty === "hard" ? 0.8 : 1.4) : 0.7) * 0.0009;
    const ox = (Math.random() - 0.5) * 2 * disp, oy = (Math.random() - 0.5) * 2 * disp;
    const dir = { x: muz.dx - muz.dy * ox, y: muz.dy + muz.dx * ox, z: muz.dz + oy };
    const dl = Math.hypot(dir.x, dir.y, dir.z); dir.x /= dl; dir.y /= dl; dir.z /= dl;
    const lat = this.lat || 0, vel = { x: Math.sin(this.alphaTank) * this.speed + Math.cos(this.alphaTank) * lat, y: -Math.cos(this.alphaTank) * this.speed + Math.sin(this.alphaTank) * lat };
    new Shell({ x: muz.x, y: muz.y, z: muz.z, dx: dir.x, dy: dir.y, dz: dir.z }, this.currentAmmo, this, this._tankModules, vel);
    FX.muzzleFlash(muz.x * PX, muz.z * PX, muz.y * PX, dir.x, dir.z, dir.y, data.caliber);
    playFireSound(muz.x, muz.y, data.caliber);
    this._firedTimer = 180;
    if (this === localTank) { battleStats.shotsFired++; HUD.shake(Math.min(1, data.caliber / 110)); }
    return true;
  }

  /* ───── Dégâts ───── */
  takeShellHit(shell, hit) {
    const info = resolveShellImpact(this, shell, hit);
    const res = decideImpact(shell, info);
    const hp = new THREE.Vector3(shell.x * PX, shell.z * PX, shell.y * PX);
    const bearing = info.attackerBearing;
    const lcl = this === localTank, mineS = shell.owner === localTank, involved = lcl || mineS;
    const addDamageEvent = (t, d, br) => { if (involved) HUD.event(t, d, lcl ? br : null, !lcl && mineS); };
    const report = r => { if (involved && r) HUD.report(r, lcl ? "in" : "out"); };
    if (res.outcome === "ricochet") {
      addDamageEvent(lcl ? "ricochet" : "ricochet-out", info.faceName, bearing);
      FX.impact(hp.x, hp.y, hp.z, "ricochet"); playImpactSound("ricochet", shell.x, shell.y);
      report(Dmg.noPen(this, shell, info, "ricochet", res)); return;
    }
    if (res.outcome === "pen" || res.outcome === "overmatch" || res.outcome === "spall") {
      this._lastHitBy = shell.owner;
      if (res.outcome === "spall") addDamageEvent("spall", "Éclats ! (" + Math.round(res.ratio * 100) + " %)", bearing);
      else {
        if (mineS) battleStats.damageDealt += res.damage;
        addDamageEvent("penetration", res.outcome === "overmatch" ? "Overmatch · " + info.faceName : res.pen + " mm › " + res.effective + " mm · " + info.faceName, bearing);
      }
      FX.impact(hp.x, hp.y, hp.z, res.outcome === "spall" ? "blocked" : "penetration"); playImpactSound(res.outcome === "spall" ? "blocked" : "penetration", shell.x, shell.y);
      this._interior(shell, info, res, lcl, mineS);
      return;
    }
    addDamageEvent("blocked", res.pen + " mm / " + res.effective + " mm · " + info.faceName, bearing);
    FX.impact(hp.x, hp.y, hp.z, "blocked"); playImpactSound("blocked", shell.x, shell.y);
    report(Dmg.noPen(this, shell, info, "blocked", res));
  }

  /* Dégâts internes : voir arena-damage.js */
  _interior(shell, info, res, lcl, mineS) {
    const out = Dmg.penetrate(this, shell, info, res); if (!out) return;
    if (lcl || mineS) { HUD.report(out.rep, lcl ? "in" : "out"); if (mineS && !this.destroyed) Dmg.showXray(this, 8); }
    if (lcl) for (const c of out.rep.changes) this._ev(c.m.kind === "crew" ? "crew" : "module", c.m.kind === "crew" ? (c.to <= 0 ? c.m.label + " hors de combat" : c.m.label + " blessé") + (c.m.lastPart ? " (" + c.m.lastPart + ")" : "") : c.m.label + (c.to <= 0 ? " détruit" : " endommagé"));
    if (out.detonated) { this._ev("ammo", "Soute touchée — explosion !"); this._ammoRack(); }
    else Dmg.afterDamage(this);
  }
  _ev(type, detail) { if (this === localTank) HUD.event(type, detail); }
  _ammoRack() {
    for (const k of Object.keys(this.modules.crew)) this.modules.crew[k] = false;
    if (this.int) for (const m of this.int.mods) if (m.kind === "crew" || m.kind === "ammo") m.hp = 0;
    this._ev("killed"); this._destroyTank(true);
  }
  _destroyTank(big) {
    if (this.destroyed) return;
    this.destroyed = true; this.wreckTimer = 0; this.speed = 0; this.angularVelocity = 0;
    const P = this.profile, wx = this.x * PX, wz = this.y * PX;
    FX.explosion(wx, (this.gz || 0) * PX + P.hullTop + 0.6, wz, big ? 1.5 : 1.1); playExplosionSound(this.x, this.y);
    this.view.setDestroyed(true);
    const killer = this._lastHitBy;
    if (typeof Net !== "undefined" && Net.on && !this.remote) Net.dead(this, killer, big);
    if (this === localTank) {
      battleStats.deaths++; HUD.onPlayerDestroyed(killer);
      onLocalPlayerDestroyed();
    } else {
      if (killer === localTank) battleStats.kills++;
      if (this.teamId === "B") teamScore.A++; else teamScore.B++;
      onTankKilled(this, killer);
      checkWinCondition();
    }
  }
  dispose() { World.S.scene.remove(this.view.root); this.view.dispose(); }
}
const CREW_LABEL = { commander: "Chef de char tué", gunner: "Tireur tué", loader: "Chargeur tué", driver: "Pilote tué", radio: "Radio tué" };
Object.assign(Tank.prototype, TankGeometry);

/* ───────────── Séparation des chars (pas de superposition) ───────────── */
function separateTanks() {
  const list = [];
  for (const it of items) if (it instanceof Tank && !it.destroyed) list.push(it);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const ra = a.profile.radiusPx * 0.85, rb = b.profile.radiusPx * 0.85;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = ra + rb;
    if (d < min && d > 0.01) {
      const push = (min - d) * 0.5, nx = dx / d, ny = dy / d;
      if (a instanceof Tank) { a.x -= nx * push; a.y -= ny * push; a.speed *= 0.97; }
      if (b instanceof Tank) { b.x += nx * push; b.y += ny * push; b.speed *= 0.97; }
    }
  }
}
