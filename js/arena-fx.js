/* ==========================================================================
   ARENA-FX.JS — Effets visuels 3D : particules (fumée, feu, étincelles,
   poussière) en deux systèmes de Points (normal / additif), flash de bouche
   avec lumière dynamique, cratères d'impact.
   Tout est en mètres (repère de la scène Three.js).
   ========================================================================== */
console.log("[TankArena] chargement : arena-fx.js");

const FX = (function () {
  let scene = null, camera = null, renderer = null;
  const SYS = {};           // "smoke" | "glow"
  let flashLight = null, flashTimer = 0;
  const craters = []; let craterIdx = 0;
  let density = 1, puffTex = null;

  /* couleur de la poussière projetée : neige, sol détrempé ou terre sèche */
  const dustCol = () => { const c = (typeof Weather !== "undefined" && Weather.cond) || {}; return c.snow ? [0.86, 0.88, 0.92] : c.wet > 0.5 ? [0.28, 0.24, 0.18] : [0.55, 0.47, 0.35]; };

  /* Une seule puff procédurale (dégradé + quelques boursouflures) : évite l'empilement de disques parfaits. */
  function makePuffTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.45, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283, r = Math.random() * 18, px = 32 + Math.cos(a) * r, py = 32 + Math.sin(a) * r, rad = 4 + Math.random() * 11;
      const b = x.createRadialGradient(px, py, 0, px, py, rad);
      b.addColorStop(0, "rgba(255,255,255,0.28)");
      b.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = b; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.flipY = false; t.needsUpdate = true;
    return t;
  }

  function makeSystem(max, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), siz = new Float32Array(max), seed = new Float32Array(max);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 4));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 500 }, uTex: { value: puffTex } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; attribute float aSeed; uniform float uScale; varying vec4 vC; varying float vSeed;
        void main(){ vC = aColor; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(aSize * uScale / max(0.1,-mv.z), 0.0, 480.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vC; varying float vSeed;
        void main(){ float c = cos(vSeed), s = sin(vSeed); vec2 uv = mat2(c,-s,s,c) * (gl_PointCoord - 0.5) + 0.5;
          float m = texture2D(uTex, uv).a; if (m < 0.02) discard;
          gl_FragColor = vec4(vC.rgb * (0.78 + 0.42 * m), vC.a * m);
          #include <encodings_fragment>
        }`
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5;
    const s = { max, pts, geo, pos, col, siz, seed, p: [], mat, additive };
    for (let i = 0; i < max; i++) s.p.push({ i, alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, fade: 1 });
    s.cursor = 0;
    return s;
  }

  function init(sceneRef, cameraRef, rendererRef) {
    scene = sceneRef; camera = cameraRef; renderer = rendererRef;
    density = Settings.quality().particles;
    if (!puffTex) puffTex = makePuffTexture();
    SYS.smoke = makeSystem(Math.round(2200 * Math.max(0.5, density)), false);
    SYS.glow = makeSystem(Math.round(1800 * Math.max(0.5, density)), true);
    scene.add(SYS.smoke.pts); scene.add(SYS.glow.pts);
    flashLight = new THREE.PointLight(0xffb060, 0, 60, 2); scene.add(flashLight);
    // cratères (pool)
    const cm = new THREE.MeshBasicMaterial({ map: Look.craterTexture(), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const cg = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(cg, cm.clone()); m.visible = false; m.position.y = 0.04; scene.add(m); craters.push({ m, life: 0 }); }
  }

  function emit(sys, x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag) {
    const S = SYS[sys]; if (!S) return;
    let tries = 0, p;
    do { p = S.p[S.cursor]; S.cursor = (S.cursor + 1) % S.max; tries++; } while (p.alive && tries < 8);
    p.alive = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1;
    p.r = c[0]; p.g = c[1]; p.b = c[2]; p.a = a; p.grav = grav || 0; p.drag = drag || 0;
    S.seed[p.i] = Math.random() * 6.283; S.geo.attributes.aSeed.needsUpdate = true;
  }
  const R = (a, b) => a + Math.random() * (b - a);
  const rn = () => Math.random() - 0.5;
  const cnt = n => Math.max(1, Math.round(n * density));

  /* ───── Spawners (mètres) ───── */
  function muzzleFlash(x, y, z, dx, dy, dz, caliber) {
    const k = Math.min(2.2, 0.6 + (caliber || 75) / 90);
    for (let i = 0; i < cnt(16); i++) { const sp = R(6, 26) * k; emit("glow", x, y, z, (dx + rn() * 0.5) * sp, (dy + rn() * 0.5) * sp, (dz + rn() * 0.5) * sp, R(0.06, 0.16), R(0.6, 1.1) * k, 0.1, [1, R(0.7, 0.95), R(0.2, 0.5)], 0.95, 0, 2); }
    emit("glow", x + dx * 0.5, y + dy * 0.5, z + dz * 0.5, 0, 0, 0, 0.07, 3.4 * k, 1.2 * k, [1, 0.85, 0.5], 1, 0, 0);
    for (let i = 0; i < cnt(12); i++) { const sp = R(2, 11) * k; emit("smoke", x, y, z, (dx + rn() * 0.9) * sp, (dy + rn() * 0.9) * sp + 0.3, (dz + rn() * 0.9) * sp, R(1.2, 2.6), R(0.5, 0.9) * k, R(2.4, 4.6) * k, [0.62, 0.6, 0.57], 0.5, -0.04, 1.6); }
    flashLight.position.set(x + dx, y + dy + 0.3, z + dz); flashLight.intensity = 6 * k; flashTimer = 0.09;
    const gy = Look.gh(x, z);                                         // souffle du canon : nuage de poussière rasant le sol
    if (y - gy < 5) { const dc = dustCol(); for (let i = 0; i < cnt(10); i++) { const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 2.4, sp = R(2, 7) * k; emit("smoke", x + dx * 1.2 + rn() * 1.2, gy + 0.3, z + dz * 1.2 + rn() * 1.2, Math.cos(a) * sp, R(0.2, 1.1), Math.sin(a) * sp, R(1.1, 2.3), R(0.7, 1.4) * k, R(2.6, 5) * k, dc, 0.34, -0.1, 1.5); } }
  }
  function impact(x, y, z, kind) {
    const spark = kind === "ricochet" ? [0.6, 0.85, 1] : [1, 0.62, 0.18];
    const n = kind === "dust" ? 0 : kind === "ricochet" ? 18 : 22;
    for (let i = 0; i < cnt(n); i++) { const sp = R(3, 14); emit("glow", x, y, z, rn() * sp, R(0.2, 1) * sp * 0.8, rn() * sp, R(0.15, 0.45), R(0.12, 0.26), 0.02, spark, 1, 12, 0.4); }
    if (kind !== "dust") { emit("glow", x, y, z, 0, 0, 0, 0.12, 1.6, 0.4, [1, 0.8, 0.45], 0.9, 0, 0); }
    const dustCol = kind === "blocked" || kind === "ricochet" ? [0.55, 0.55, 0.55] : [0.5, 0.42, 0.3];
    for (let i = 0; i < cnt(kind === "dust" ? 12 : 6); i++) emit("smoke", x, y, z, rn() * 2.5, R(0.6, 3), rn() * 2.5, R(0.9, 1.8), R(0.4, 0.8), R(1.8, 3.4), dustCol, 0.45, -0.05, 1.3);
  }
  function groundHit(x, y, z, big) {
    for (let i = 0; i < cnt(big ? 20 : 12); i++) emit("smoke", x + rn() * 0.6, y, z + rn() * 0.6, rn() * 6, R(1.5, 7), rn() * 6, R(0.8, 1.8), R(0.5, 1), R(2.2, 5), [0.46, 0.38, 0.28], 0.6, 6, 1.5);
    for (let i = 0; i < cnt(8); i++) emit("glow", x, y, z, rn() * 5, R(2, 8), rn() * 5, R(0.15, 0.35), R(0.1, 0.18), 0.03, [1, 0.7, 0.3], 0.9, 12, 0.5);
    crater(x, z, big ? 1.4 : 0.9, y);
  }
  function crater(x, z, r, gy) {
    const c = craters[craterIdx]; craterIdx = (craterIdx + 1) % craters.length;
    c.m.visible = true; c.m.position.x = x; c.m.position.z = z; if (c.y0 === undefined) c.y0 = c.m.position.y; c.m.position.y = c.y0 + (gy || 0); c.m.scale.setScalar(r * R(0.8, 1.2)); c.life = 60; c.m.material.opacity = 0.9; c.m.rotation.y = Math.random() * 6.283;
  }
  function explosion(x, y, z, scale) {
    const k = scale || 1, gy = Look.gh(x, z);
    /* Cœur blanc-jaune très court, puis boule de feu orange : l'explosion ne doit pas être une simple boule noire. */
    for (let i = 0; i < cnt(24); i++) { const a = Math.random() * 6.283, e = R(-0.1, 1), sp = R(2, 11) * k; emit("glow", x, y, z, Math.cos(a) * sp * (1 - e * 0.4), e * sp * 0.9 + 1, Math.sin(a) * sp * (1 - e * 0.4), R(0.12, 0.32), R(0.5, 1.4) * k, 0.15, [1, 0.94, 0.72], 1, 2, 1.4); }
    for (let i = 0; i < cnt(70); i++) { const a = Math.random() * 6.283, e = R(-0.2, 1), sp = R(2, 14) * k; emit("glow", x, y, z, Math.cos(a) * sp * (1 - e * 0.4), e * sp * 0.9 + 2, Math.sin(a) * sp * (1 - e * 0.4), R(0.35, 1.0), R(1.2, 2.8) * k, 0.2, [1, R(0.4, 0.8), R(0.05, 0.25)], 0.85, 4, 1.2); }
    /* Fumée chaude mais diluée : la puff texturée + l'alpha plus bas laissent voir le feu derrière. */
    for (let i = 0; i < cnt(38); i++) { const a = Math.random() * 6.283, sp = R(1, 8) * k; emit("smoke", x, y, z, Math.cos(a) * sp, R(2, 9), Math.sin(a) * sp, R(2.5, 6), R(1.8, 3.2) * k, R(4, 9) * k, [0.34, 0.30, 0.27], 0.42, -0.2, 1.1); }
    for (let i = 0; i < cnt(30); i++) { const a = Math.random() * 6.283, sp = R(6, 22) * k; emit("glow", x, y, z, Math.cos(a) * sp, R(3, 14), Math.sin(a) * sp, R(0.4, 1.0), R(0.1, 0.22), 0.02, [1, 0.85, 0.5], 1, 18, 0.2); }
    flashLight.position.set(x, y + 2, z); flashLight.intensity = 14 * k; flashTimer = 0.25;
    crater(x, z, 2.4 * k, gy);                                       // le cratère est au sol, pas à la hauteur du toit du char
    if (k >= 1) { Look.Debris.burst(x, y, z, k); if (typeof Post !== "undefined") Post.pulse(Math.min(0.5, 0.18 * k)); }
    const dc = dustCol();                                              // onde de choc : anneau de poussière qui s'étale
    for (let i = 0; i < cnt(34); i++) { const a = (i / 34) * 6.283 + rn() * 0.2, sp = R(10, 19) * k; emit("smoke", x, gy + 0.35, z, Math.cos(a) * sp, R(0.2, 1), Math.sin(a) * sp, R(1.4, 2.8), R(1.2, 2.2) * k, R(3, 6) * k, dc, 0.5, 0.5, 2.4); }
  }
  function fire(x, y, z, k) {
    const s = k || 1;
    emit("glow", x + rn() * 1.4 * s, y + rn() * 0.3, z + rn() * 1.4 * s, rn() * 0.6, R(1.5, 3.6), rn() * 0.6, R(0.4, 0.9), R(0.9, 1.5) * s, 0.2, [1, R(0.35, 0.65), 0.08], 0.7, -1, 0.6);
    if (Math.random() < 0.55) emit("smoke", x + rn() * 1.2, y + 0.6, z + rn() * 1.2, rn() * 0.8 + 0.5, R(2, 3.6), rn() * 0.8, R(3, 6), R(0.8, 1.2) * s, R(3.5, 6) * s, [0.22, 0.20, 0.18], 0.45, -0.1, 0.5);
  }
  function damageSmoke(x, y, z, heavy) {
    emit("smoke", x + rn() * 0.6, y, z + rn() * 0.6, rn() * 0.5 + 0.6, R(1.4, 2.6), rn() * 0.5, R(2, 4), R(0.5, 0.8), R(2, 3.6), heavy ? [0.22, 0.21, 0.20] : [0.42, 0.40, 0.38], heavy ? 0.5 : 0.38, -0.1, 0.6);
  }
  function dust(x, z, strength, gy) {
    emit("smoke", x + rn() * 0.8, 0.25 + (gy || 0), z + rn() * 0.8, rn() * 0.8 + 0.4, R(0.4, 1.3), rn() * 0.8, R(0.8, 1.6), R(0.4, 0.7), R(1.6, 2.8) * Math.min(1.6, strength), dustCol(), 0.28, -0.1, 1.4);
  }
  function smokeScreen(x, y, z) {
    for (let i = 0; i < cnt(55); i++) { const a = Math.random() * 6.283, sp = R(0.3, 3.8); emit("smoke", x, y + 0.4, z, Math.cos(a) * sp, R(0.3, 2.2), Math.sin(a) * sp, R(14, 24), R(1.6, 2.4), R(8, 13), [0.86, 0.86, 0.86], 0.85, -0.05, 0.9); }
  }

  /* ───── Mise à jour (dt en secondes) ───── */
  function stepSystem(S, dt) {
    const p = S.p, pos = S.pos, col = S.col, siz = S.siz;
    for (let i = 0; i < S.max; i++) {
      const q = p[i];
      if (!q.alive) { siz[i] = 0; col[i * 4 + 3] = 0; continue; }
      q.life -= dt;
      if (q.life <= 0) { q.alive = false; siz[i] = 0; col[i * 4 + 3] = 0; continue; }
      const k = 1 - q.life / q.max;
      q.vy -= q.grav * dt;
      const dr = Math.max(0, 1 - q.drag * dt); q.vx *= dr; q.vz *= dr; q.vy *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) { q.y = 0.05; q.vy = Math.abs(q.vy) * 0.2; q.vx *= 0.6; q.vz *= 0.6; }
      pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z;
      const fadeIn = Math.min(1, k * 8), fadeOut = S.additive ? (1 - k) : Math.min(1, (1 - k) * 1.6);
      col[i * 4] = q.r; col[i * 4 + 1] = q.g; col[i * 4 + 2] = q.b; col[i * 4 + 3] = q.a * fadeIn * fadeOut;
      siz[i] = q.s0 + (q.s1 - q.s0) * k;
    }
    S.geo.attributes.position.needsUpdate = true; S.geo.attributes.aColor.needsUpdate = true; S.geo.attributes.aSize.needsUpdate = true;
  }

  function update(dt) {
    if (!scene) return;
    const scale = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    SYS.smoke.mat.uniforms.uScale.value = scale; SYS.glow.mat.uniforms.uScale.value = scale;
    stepSystem(SYS.smoke, dt); stepSystem(SYS.glow, dt);
    /* Décroissance exponentielle en fonction du temps, pas du nombre d'images. */
    if (flashTimer > 0) { flashTimer -= dt; flashLight.intensity *= Math.exp(-dt * 11); if (flashTimer <= 0) flashLight.intensity = 0; }
    for (const c of craters) if (c.m.visible) { c.life -= dt; if (c.life < 8) c.m.material.opacity = Math.max(0, c.life / 8 * 0.9); if (c.life <= 0) c.m.visible = false; }
  }

  return { init, update, muzzleFlash, impact, groundHit, explosion, fire, damageSmoke, dust, smokeScreen, crater };
})();
