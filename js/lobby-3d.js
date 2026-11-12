/* ==========================================================================
   LOBBY-3D.JS — Aperçu 3D des véhicules (plateau tournant, glisser pour
   orbiter, molette pour zoomer) et générateur de vignettes pour l'arbre
   technologique. Utilise TankModels : modèle fourni si présent, sinon
   assemblage procédural de la catégorie.
   ========================================================================== */
const Preview = (function () {
  const P = { key: null, ready: false };
  let renderer, scene, camera, pivot, view = null, canvas, host = null, raf = 0, last = 0;
  let theta = 0.7, phi = 0.26, dist = 12, distT = 12, auto = true, resumeT = 0, drag = null, loadTok = 0;

  function lights(sc) {
    sc.add(new THREE.HemisphereLight(0xcfe3f2, 0x2a3036, 0.9));
    const k = new THREE.DirectionalLight(0xfff0d8, 1.25); k.position.set(-8, 14, 9); k.castShadow = true;
    k.shadow.mapSize.set(1024, 1024); const c = k.shadow.camera; c.left = -12; c.right = 12; c.top = 12; c.bottom = -12; c.near = 1; c.far = 50; k.shadow.bias = -0.0008; sc.add(k);
    const r = new THREE.DirectionalLight(0x6cb8ff, 0.7); r.position.set(10, 5, -9); sc.add(r);
  }
  function floorTex() {
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, "#27333b"); g.addColorStop(.7, "#182026"); g.addColorStop(1, "rgba(16,22,26,0)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(255,176,0,.5)"; x.lineWidth = 1.5; for (const r of [60, 96, 124]) { x.beginPath(); x.arc(128, 128, r, 0, 6.283); x.setLineDash(r === 96 ? [4, 6] : []); x.stroke(); }
    x.setLineDash([]); x.strokeStyle = "rgba(190,215,230,.12)"; for (let a = 0; a < 12; a++) { x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a / 12 * 6.283) * 124, 128 + Math.sin(a / 12 * 6.283) * 124); x.stroke(); }
    return new THREE.CanvasTexture(c);
  }

  P.init = function () {
    if (renderer) return;
    canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); lights(scene);
    camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 200);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(15, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex(), transparent: true, roughness: 1 }));
    floor.receiveShadow = true; floor.position.y = -0.02; scene.add(floor);
    pivot = new THREE.Group(); scene.add(pivot);
    canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; auto = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", e => { if (!drag) return; theta -= (e.clientX - drag.x) * 0.008; phi = Math.max(0.02, Math.min(1.25, phi + (e.clientY - drag.y) * 0.006)); drag.x = e.clientX; drag.y = e.clientY; });
    const end = () => { drag = null; resumeT = 3; };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", e => { e.preventDefault(); distT = Math.max(dMin(), Math.min(dMin() * 2.2, distT + e.deltaY * 0.01)); auto = false; resumeT = 3; }, { passive: false });
    new ResizeObserver(() => P.resize()).observe(document.body);
    P.ready = true;
  };
  const dMin = () => (view ? view.profile.L : 6) * 1.1 + 2.5;

  P.attach = function (el) {
    P.init(); host = el; el.insertBefore(canvas, el.firstChild); P.resize();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  P.resize = function () {
    if (!host || !renderer) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  P.show = async function (key) {
    P.init(); P.key = key; const tok = ++loadTok;
    await TankModels.loadModelFor(key);
    if (tok !== loadTok) return;
    if (view) { pivot.remove(view.root); view.dispose(); view = null; }
    view = TankModels.create(key); view.setTeam(null); view.setShadow(true);
    view.turretPivot.rotation.y = 0.1; view.gunPivot.rotation.z = 0.04;
    pivot.add(view.root);
    distT = dist = view.profile.L * 1.5 + 5.5;
    P.model = TankModels.hasRealModel(key);
  };
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!host || !host.isConnected || !canvas.isConnected || host.offsetParent === null) return;
    if (!auto) { resumeT -= dt; if (resumeT <= 0 && !drag) auto = true; } else theta += dt * 0.3;
    dist += (distT - dist) * Math.min(1, dt * 6);
    const tgtY = view ? view.profile.totalHeight * 0.45 : 1;
    camera.position.set(Math.cos(theta) * Math.cos(phi) * dist, tgtY + Math.sin(phi) * dist, Math.sin(theta) * Math.cos(phi) * dist);
    camera.lookAt(0, tgtY, 0);
    if (view) { view.animateTracks(0, 0); }
    renderer.render(scene, camera);
  }

  /* ───── Vignettes (file d'attente) ───── */
  const thumbs = {}, queue = []; let busy = false, tr = null, ts = null, tc = null;
  function thumbInit() {
    tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    tr.setClearColor(0, 0); tr.setSize(240, 150, false); ts = new THREE.Scene(); lights(ts); tr.shadowMap.enabled = false;
    ts.traverse(o => { if (o.isDirectionalLight) o.castShadow = false; });
    tc = new THREE.PerspectiveCamera(30, 240 / 150, 0.1, 100);
  }
  async function makeThumb(key) {
    if (!tr) thumbInit();
    await TankModels.loadModelFor(key);
    const v = TankModels.create(key); v.setTeam(null); ts.add(v.root);
    v.turretPivot.rotation.y = 0.15; v.gunPivot.rotation.z = 0.03;
    const p = v.profile, r = Math.max(p.L, p.W * 1.6, p.totalHeight * 1.8) * 0.78, d = r / Math.sin(15 * Math.PI / 180);
    const th = 0.78, ph = 0.34;
    tc.position.set(Math.cos(th) * Math.cos(ph) * d, p.totalHeight * 0.4 + Math.sin(ph) * d, Math.sin(th) * Math.cos(ph) * d); tc.lookAt(0, p.totalHeight * 0.4, 0);
    tr.render(ts, tc); const url = tr.domElement.toDataURL("image/png");
    ts.remove(v.root); v.dispose(); return url;
  }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) { const { key, cb } = queue.shift(); try { thumbs[key] = thumbs[key] || await makeThumb(key); cb(thumbs[key]); } catch (e) { console.warn("vignette", key, e); } await new Promise(r => setTimeout(r, 0)); }
    busy = false;
  }
  P.thumb = function (key, cb) { if (thumbs[key]) { cb(thumbs[key]); return; } queue.push({ key, cb }); pump(); };
  return P;
})();
