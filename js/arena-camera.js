/* ==========================================================================
   ARENA-CAMERA.JS — Caméra orbitale de poursuite + mode visée (lunette),
   calcul du point visé par tracé de rayon sur la géométrie de simulation
   (sol, décor, chars), projection du viseur et du marqueur de canon.
   ========================================================================== */
console.log("[TankArena] chargement : arena-camera.js");

const Cam = (function () {
  const C = {
    yaw: 0, pitch: -0.18, dist: 13, distTarget: 13, sniper: false, shakeAmt: 0,
    fovBase: 70, fovSniper: 16, pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0),
    aim: { x: 0, y: 0, z: 0, dist: 300, kind: "none", target: null }, locked: false,
    _fov: 70
  };
  const _v = new THREE.Vector3(), _o = new THREE.Vector3();

  C.init = function () {
    C.fovBase = Settings.get("fov"); C._fov = C.fovBase;
    const p = localTank.profile;
    C.distTarget = C.dist = Settings.get("camDist") * (0.78 + 0.22 * p.L / 6.5);
    C.yaw = localTank.alphaTank - Math.PI / 2; C.pitch = -0.2;
  };
  C.shake = function (k) { C.shakeAmt = Math.min(1.2, C.shakeAmt + k * 0.55); };
  C.look = function (dx, dy) {
    const sens = Settings.get("sens") * 0.0022 * (C.sniper ? C._fov / C.fovBase * 0.9 : 1);
    C.yaw += dx * sens;
    C.pitch += dy * sens * (Settings.get("invertY") ? 1 : -1);
    C.pitch = clamp(C.pitch, C.sniper ? -0.35 : -0.75, C.sniper ? 0.5 : 0.62);
  };
  C.zoom = function (d) { C.distTarget = clamp(C.distTarget + d, 5.5, 28); };
  C.setSniper = function (on) {
    if (on === C.sniper || !localTank || localTank.destroyed) return;
    C.sniper = on;
    document.body.classList.toggle("sniper", on);
    document.getElementById("scope").classList.toggle("hidden", !on);
    if (on && window.HUD && HUD.buildScope) HUD.buildScope();
    document.getElementById("aim").style.opacity = on ? 0.0 : 1;
  };

  /* Prédicat « point solide » en pixels de sim — renvoie le type d'obstacle ou null */
  function solidAt(Px, Py, Pz, exclude) {
    if (Pz <= groundH(Px, Py)) return { kind: "ground" };
    if (obstacleHit3(Px, Py, Pz)) return { kind: "obstacle" };
    for (const it of items) if (it instanceof Tank && it !== exclude && !it.destroyed) { if (it.hitTest(Px, Py, Pz, 0.1)) return { kind: "tank", target: it }; }
    return null;
  }

  /* Point d'impact prévu : on rejoue la trajectoire réelle de l'obus (traînée, gravité, vent, vitesse du char)
     depuis l'orientation ACTUELLE du canon — pas depuis la caméra. */
  C.impact = { x: 0, y: 0, z: 0, kind: "none", target: null, dist: 0, valid: false };
  C.predictImpact = function () {
    const t = localTank, I = C.impact;
    if (!t || t.destroyed) { I.valid = false; return I; }
    const data = getAmmoData(t.currentAmmo, t._tankModules), m = t.muzzleState(), v0 = data.muzzleVelocity * PIXELS_PER_METER * TICK_RATE;
    const sa = Math.sin(t.alphaTank), ca = Math.cos(t.alphaTank), lat = t.lat || 0;
    const vv = { vx: m.dx * v0 + sa * t.speed + ca * lat, vy: m.dy * v0 - ca * t.speed + sa * lat, vz: m.dz * v0 };
    let x = m.x, y = m.y, z = m.z, hit = null;
    outer: for (let i = 0; i < 1800; i++) {
      stepBallistics(vv, data);
      const n = Math.max(1, Math.ceil(Math.hypot(vv.vx, vv.vy, vv.vz) / 14)), dx = vv.vx / n, dy = vv.vy / n, dz = vv.vz / n;
      for (let s = 0; s < n; s++) {
        const sol = solidAt(x + dx, y + dy, z + dz, t);
        if (sol) {
          let lo = 0, hi = 1, last = sol;
          for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2, sm = solidAt(x + dx * mid, y + dy * mid, z + dz * mid, t); if (sm) { hi = mid; last = sm; } else lo = mid; }
          x += dx * hi; y += dy * hi; z += dz * hi; hit = last; break outer;
        }
        x += dx; y += dy; z += dz;
        if (x < -300 || y < -300 || x > MAP_WIDTH + 300 || y > MAP_HEIGHT + 300 || z < -600) break outer;
      }
    }
    I.x = x; I.y = y; I.z = z; I.kind = hit ? hit.kind : "none"; I.target = hit && hit.target || null; I.valid = true;
    I.dist = Math.hypot(x - m.x, y - m.y, z - m.z) * PX;
    return I;
  };

  /* Tracé de rayon depuis la caméra */
  C.computeAim = function () {
    const O = C.pos, D = C.dir, ex = localTank;
    let prevT = 0, hit = null, t = 2;
    const maxT = 900;
    while (t < maxT) {
      const x = (O.x + D.x * t) * M2PX, y = (O.z + D.z * t) * M2PX, z = (O.y + D.y * t) * M2PX;
      if (x < -200 || y < -200 || x > MAP_WIDTH + 200 || y > MAP_HEIGHT + 200) { if (D.y >= 0) break; }
      const s = solidAt(x, y, z, ex);
      if (s) {
        // bissection sur [prevT, t]
        let a = prevT, b = t, last = s;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) / 2, sm = solidAt((O.x + D.x * m) * M2PX, (O.z + D.z * m) * M2PX, (O.y + D.y * m) * M2PX, ex);
          if (sm) { b = m; last = sm; } else a = m;
        }
        hit = { t: b, s: last }; break;
      }
      prevT = t; t += t < 60 ? 1.5 : t < 220 ? 3 : 6;
    }
    const tt = hit ? hit.t : Math.min(maxT, 700);
    const a = C.aim;
    a.x = (O.x + D.x * tt) * M2PX; a.y = (O.z + D.z * tt) * M2PX; a.z = Math.max(groundH(a.x, a.y), (O.y + D.y * tt) * M2PX);
    a.kind = hit ? hit.s.kind : "none"; a.target = hit && hit.s.target || null;
    a.dist = Math.hypot(a.x - ex.x, a.y - ex.y, a.z - ex.eyeZ) * PX;
    // viser le centre de masse d'un char plutôt que sa surface
    if (a.target) a.z = Math.max(a.z, a.target.centerZ() * 0.9);
    return a;
  };

  C.update = function (dt, cam) {
    const t = localTank, P = t.profile;
    C._fov += ((C.sniper ? C.fovSniper : C.fovBase) - C._fov) * Math.min(1, dt * 12);
    cam.fov = C._fov; cam.updateProjectionMatrix();
    const cp = Math.cos(C.pitch);
    C.dir.set(cp * Math.cos(C.yaw), Math.sin(C.pitch), cp * Math.sin(C.yaw));
    const root = t.view.root.position;
    C.dist += (C.distTarget - C.dist) * Math.min(1, dt * 8);
    if (C.sniper && !t.destroyed) {
      // œil au niveau du pivot de canon, légèrement en retrait
      const m = t.muzzleState(C.yaw, degToRad(t.gunElevation));
      _o.set(m.gx * PX, m.gz * PX + 0.35, m.gy * PX);
      t.view.root.visible = false;
      C.pos.copy(_o);
    } else {
      t.view.root.visible = true;
      const fh = P.hullTop + P.tu.h * 0.6 + 0.9 + (t.gz || 0) * PX;
      _o.set(root.x, fh, root.z);
      // distance libre : on recule le long de -dir tant que ce n'est pas solide
      let d = C.dist;
      for (let s = 1.5; s <= d; s += 1.0) {
        const x = (_o.x - C.dir.x * s) * M2PX, y = (_o.z - C.dir.z * s) * M2PX, z = (_o.y - C.dir.y * s) * M2PX;
        if (z < groundH(x, y) + 0.7 * M2PX * 0.4 || obstacleHit3(x, y, z)) { d = Math.max(2.2, s - 1.2); break; }
      }
      C.pos.set(_o.x - C.dir.x * d, _o.y - C.dir.y * d, _o.z - C.dir.z * d);
      { const gmin = groundH(C.pos.x * M2PX, C.pos.z * M2PX) * PX + 0.7; if (C.pos.y < gmin) C.pos.y = gmin; }
    }
    C.pos.x = clamp(C.pos.x, -40, MAP_WIDTH * PX + 40); C.pos.z = clamp(C.pos.z, -40, MAP_HEIGHT * PX + 40);
    cam.position.copy(C.pos);
    // tremblement
    C.shakeAmt *= Math.pow(0.0008, dt);
    const sh = C.shakeAmt * (C.sniper ? 0.004 : 0.012);
    cam.position.x += (Math.random() - 0.5) * sh * 12; cam.position.y += (Math.random() - 0.5) * sh * 12;
    _v.copy(C.pos).add(C.dir);
    cam.lookAt(_v.x + (Math.random() - 0.5) * sh, _v.y + (Math.random() - 0.5) * sh, _v.z);
    cam.updateMatrixWorld(true);
  };

  /* Projection monde (m) → écran (px) ; renvoie null si derrière la caméra */
  C.project = function (x, y, z, cam, out) {
    _v.set(x, y, z).project(cam);
    if (_v.z > 1 || _v.z < -1) return null;
    const o = out || {}; o.x = (_v.x * 0.5 + 0.5) * window.innerWidth; o.y = (-_v.y * 0.5 + 0.5) * window.innerHeight; o.z = _v.z;
    return o;
  };
  return C;
})();
