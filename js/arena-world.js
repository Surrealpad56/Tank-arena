/* ==========================================================================
   ARENA-WORLD.JS — Scène Three.js du champ de bataille : rendu, ciel,
   lumières, sol texturé (généré par terrain-gen.js), décor 3D (bâtiments,
   murs, rochers, haies), forêts instanciées, points de capture, limites.
   Dépend de three.min.js, terrain-gen.js, arena-terrain.js, settings.js.
   ========================================================================== */
console.log("[TankArena] chargement : arena-world.js");

/* Les ambiances (ciel, lumière, arbres, couleurs) sont définies par carte dans map-defs.js */
const THEME_VIS = Object.fromEntries(Object.keys(MAPS).map(k => [k, MAPS[k].vis]));

const World = (function () {
  const W = MAP_WIDTH * PX, H = MAP_HEIGHT * PX;      // 444 × 472 m
  const S = {
    renderer: null, scene: null, camera: null, sun: null, sky: null, terrain: null, terrainCanvas: null,
    quality: null, vis: THEME_VIS[MAP_THEME], treeChunks: [], capture: [], dynamicLights: [], cinematicWinner: null, ready: false
  };

  /* ───── Textures procédurales ───── */
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    return t;
  }
  function speckle(ctx, w, h, base, amt, n) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const v = Math.floor(128 + (Math.random() - 0.5) * amt);
      ctx.fillStyle = `rgba(${v},${v},${v},0.25)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  }
  function detailTexture() {
    return canvasTex(256, 256, (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      // bruit de valeur lissé (3 octaves) en niveaux de gris
      const grid = (n) => { const a = []; for (let i = 0; i < n * n; i++) a.push(Math.random()); return a; };
      const g1 = grid(16), g2 = grid(32), g3 = grid(64);
      const samp = (g, n, x, y) => { const fx = x / w * n, fy = y / h * n, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j; const at = (a, b) => g[((b % n) * n) + (a % n)]; const s = (t) => t * t * (3 - 2 * t); return (at(i, j) * (1 - s(u)) + at(i + 1, j) * s(u)) * (1 - s(v)) + (at(i, j + 1) * (1 - s(u)) + at(i + 1, j + 1) * s(u)) * s(v); };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = samp(g1, 16, x, y) * 0.5 + samp(g2, 32, x, y) * 0.3 + samp(g3, 64, x, y) * 0.2;
        const o = (y * w + x) * 4; const c = Math.floor(v * 255); img.data[o] = img.data[o + 1] = img.data[o + 2] = c; img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }, null);
  }

  /* ───── Fusion de géométries dans un tampon unique ───── */
  class Merge {
    constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.oy = 0; }
    add(geo, matrix, color, uvScale) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (matrix) g.applyMatrix4(matrix);
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      const c = new THREE.Color(color === undefined ? 0xffffff : color);
      for (let i = 0; i < p.count; i++) {
        this.pos.push(p.getX(i), p.getY(i) + this.oy, p.getZ(i)); this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
        if (u) this.uv.push(u.getX(i) * (uvScale ? uvScale[0] : 1), u.getY(i) * (uvScale ? uvScale[1] : 1)); else this.uv.push(0, 0);
        this.col.push(c.r, c.g, c.b);
      }
      g.dispose();
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
      g.computeBoundingSphere();
      return g;
    }
    get empty() { return this.pos.length === 0; }
  }
  const mT = (x, y, z, ry) => { const m = new THREE.Matrix4().makeTranslation(x, y, z); if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry)); return m; };
  const rand = (a, b) => a + Math.random() * (b - a);
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ───── Ciel ───── */
  function buildSky(vis) {
    const geo = new THREE.SphereGeometry(2500, 32, 16);
    const sd = new THREE.Vector3(...vis.sunDir).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { zenith: { value: new THREE.Color(vis.zenith) }, horizon: { value: new THREE.Color(vis.horizon) }, sunDir: { value: sd }, sunCol: { value: new THREE.Color(vis.sun) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `varying vec3 vP; uniform vec3 zenith, horizon, sunDir, sunCol;
        void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(horizon, zenith, pow(h, 0.55));
          if (vP.y < 0.0) c = horizon * 0.92;
          float s = max(dot(vP, sunDir), 0.0); c += sunCol * (pow(s, 600.0) * 1.4 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(c, 1.0); }`
    });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = -10; m.frustumCulled = false;
    return m;
  }

  /* ───── Sol ───── */
  function buildTerrain(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    const detail = detailTexture(); detail.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.detailRep = { value: new THREE.Vector2(W / 3.2, H / 3.2) };
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform sampler2D detailMap; uniform vec2 detailRep;\nvoid main() {")
        .replace("#include <map_fragment>", `#include <map_fragment>
          float dA = texture2D(detailMap, vUv * detailRep).r; float dB = texture2D(detailMap, vUv * detailRep * 0.21).r;
          diffuseColor.rgb *= (0.62 + 0.42 * dA) * (0.88 + 0.24 * dB);`);
    };
    /* maillage déformé par la grille de hauteurs de la carte (une case = 32 px = 1,8 m) */
    const Lr = MAP_LAYOUT, st = 2, cs = Lr.CS * st, nx = Math.ceil(MAP_WIDTH / cs), nz = Math.ceil(MAP_HEIGHT / cs), vx = nx + 1, vz = nz + 1;
    const pos = new Float32Array(vx * vz * 3), uv = new Float32Array(vx * vz * 2), idx = new Uint32Array(nx * nz * 6);
    for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
      const k = j * vx + i, x = Math.min(i * cs, MAP_WIDTH), y = Math.min(j * cs, MAP_HEIGHT);
      pos[k * 3] = x * PX; pos[k * 3 + 1] = Lr.heightAt(x, y); pos[k * 3 + 2] = y * PX; uv[k * 2] = x / MAP_WIDTH; uv[k * 2 + 1] = 1 - y / MAP_HEIGHT;
    }
    let q = 0; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    return mesh;
  }

  /* ───── Tabliers de ponts (au niveau du sol « jouable ») ───── */
  function buildBridges(scene, vis) {
    for (const b of MAP_LAYOUT.bridges) {
      const hx = (b.dir === "h" ? b.len : b.w) * PX, hz = (b.dir === "h" ? b.w : b.len) * PX, cx = b.x * PX, cz = b.y * PX, top = b.deck + 0.06;
      const col = b.kind === "wood" ? 0x7a6446 : b.kind === "steel" ? 0x6f7479 : b.kind === "rail" ? 0x5a554e : 0x9a9382;
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 }), grp = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(hx, 0.7, hz), mat); deck.position.set(cx, top - 0.35, cz); deck.castShadow = deck.receiveShadow = true; grp.add(deck);
      const n = Math.max(2, Math.round((b.dir === "h" ? hx : hz) / 22));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n - 0.5, pier = new THREE.Mesh(new THREE.BoxGeometry(b.dir === "h" ? 1.4 : hx * 0.8, 6, b.dir === "h" ? hz * 0.8 : 1.4), mat); pier.position.set(cx + (b.dir === "h" ? t * hx : 0), top - 3.6, cz + (b.dir === "h" ? 0 : t * hz)); grp.add(pier); }
      scene.add(grp);
    }
  }

  /* ───── Décor : bâtiments, murs, rochers, haies ───── */
  function buildProps(scene, vis) {
    const rnd = seeded(1234);
    const wallTex = canvasTex(128, 128, (c, w, h) => { speckle(c, w, h, "#d8d0bc", 50, 700); c.strokeStyle = "rgba(90,80,60,0.12)"; for (let y = 0; y < h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } });
    const roofTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#cfcfcf"; c.fillRect(0, 0, w, h); c.strokeStyle = "rgba(0,0,0,0.28)"; c.lineWidth = 2; for (let y = 0; y < h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } speckle(c, w, h, "rgba(0,0,0,0)", 60, 100); });
    const stoneTex = canvasTex(128, 64, (c, w, h) => { speckle(c, w, h, "#d6d2c6", 70, 600); c.strokeStyle = "rgba(60,55,45,0.35)"; for (let y = 0; y < h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); for (let x = (y / 16 % 2) * 16; x < w; x += 32) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 16); c.stroke(); } } });
    const leafTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#6a8a50"; c.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const g = 80 + Math.random() * 90; c.fillStyle = `rgba(${g * 0.5},${g},${g * 0.4},0.55)`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, 7); c.fill(); } });

    const walls = new Merge(), roofs = new Merge(), glass = new Merge(), stone = new Merge(), hedges = new Merge(), rocks = new Merge();
    const wallCol = new THREE.Color(vis.wall), roofCol = new THREE.Color(vis.roof), stoneCol = new THREE.Color(vis.stone);
    const flatRoof = !!vis.flatRoof;
    let bi = 0;
    for (const o of OBSTACLES) {
      const w = o.w * PX, d = o.h * PX, cx = (o.x + o.w / 2) * PX, cz = (o.y + o.h / 2) * PX, yb = o.g0, drop = (o.g0 - o.gmin) + 0.35;
      for (const mg of [walls, roofs, glass, stone, hedges]) mg.oy = yb;
      if (o.type === "building") {
        const op = o.opt || {}, ruin = !!op.ruin, flat = flatRoof || op.flat || op.conc;
        const hh = o.hm * (ruin ? 0.5 + rnd() * 0.5 : 0.85 + rnd() * 0.25), rh = flat ? 0.25 : 1.9 + rnd() * 0.8, tint = (0.9 + rnd() * 0.2) * (ruin ? 0.62 : 1);
        const bcol = op.conc ? new THREE.Color(0x8c8c86) : wallCol;
        if (drop > 0.4) walls.add(new THREE.BoxGeometry(w + 0.2, drop, d + 0.2), mT(cx, -drop / 2, cz), bcol.clone().multiplyScalar(0.6), [1, 1]);
        const body = new THREE.BoxGeometry(w, hh, d);
        walls.add(body, mT(cx, hh / 2, cz), bcol.clone().multiplyScalar(tint), [Math.max(1, w / 4), Math.max(1, hh / 4)]);
        const along = w >= d;                       // faîtage le long du grand côté
        const L = (along ? w : d) + 0.9, Wd = (along ? d : w) + 0.9;
        if (ruin) {
          // murs éventrés : pans surélevés et gravats
          for (let k = 0; k < 3; k++) { const bw = 1 + rnd() * Math.min(5, w * 0.5), bd = 0.5 + rnd() * 1.2, bh = 1 + rnd() * 2.2; walls.add(new THREE.BoxGeometry(bw, bh, bd), mT(cx + (rnd() - 0.5) * (w - bw), hh + bh / 2, cz + (rnd() - 0.5) * (d - bd), rnd() * 0.4), bcol.clone().multiplyScalar(tint * 0.9), [1, 1]); }
          for (let k = 0; k < 6; k++) stone.add(new THREE.BoxGeometry(0.6 + rnd() * 1.4, 0.4 + rnd() * 0.8, 0.6 + rnd() * 1.4), mT(cx + (rnd() - 0.5) * (w + 4), 0.3, cz + (rnd() - 0.5) * (d + 4), rnd() * 3), stoneCol.clone().multiplyScalar(0.7), [1, 1]);
        } else if (flat) {
          roofs.add(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), mT(cx, hh + 0.15, cz), op.conc ? new THREE.Color(0x7a7a74) : roofCol, [1, 1]);
        } else {
          // prisme de toit à deux pans
          const shp = new THREE.Shape(); shp.moveTo(-Wd / 2, 0); shp.lineTo(Wd / 2, 0); shp.lineTo(0, rh); shp.closePath();
          const prism = new THREE.ExtrudeGeometry(shp, { depth: L, bevelEnabled: false }); prism.translate(0, 0, -L / 2);
          const m = mT(cx, hh, cz); if (along) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
          roofs.add(prism, m, roofCol.clone().multiplyScalar(0.9 + rnd() * 0.2), [Math.max(1, L / 3), 1]);
          // cheminée
          walls.add(new THREE.BoxGeometry(0.7, 1.6, 0.7), mT(cx + (along ? w * 0.25 : 0), hh + rh * 0.55, cz + (along ? 0 : d * 0.25)), 0x7a5a48, [1, 1]);
        }
        // fenêtres et porte sur les deux grands côtés, un rang par étage
        const nWin = Math.max(2, Math.floor((along ? w : d) / 3.2)), floors = op.conc ? 0 : Math.max(1, Math.min(4, Math.floor(hh / 3.3)));
        for (const side of [-1, 1]) {
          for (let fl = 0; fl < floors; fl++) for (let k = 0; k < nWin; k++) {
            const t = ((k + 0.5) / nWin - 0.5) * (along ? w : d) * 0.86;
            const isDoor = (k === Math.floor(nWin / 2) && side === 1 && fl === 0);
            if (ruin && rnd() < 0.35) continue;
            const gw = new THREE.BoxGeometry(isDoor ? 1.1 : 0.95, isDoor ? 2.1 : 1.25, 0.1);
            const px = along ? cx + t : cx + side * (w / 2 + 0.03), pz = along ? cz + side * (d / 2 + 0.03) : cz + t;
            const y = isDoor ? 1.05 : Math.min(hh - 0.8, 1.5 + fl * 3.2);
            const m = mT(px, y, pz); if (!along) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
            glass.add(gw, m, isDoor ? 0x4a3322 : 0x1d2a38);
          }
        }
        bi++;
      } else if (o.type === "wall") {
        const horiz = o.w >= o.h, len = horiz ? w : d, th = horiz ? d : w;
        stone.add(new THREE.BoxGeometry(horiz ? len : th * 1.5, o.hm + drop, horiz ? th * 1.5 : len), mT(cx, (o.hm - drop) / 2, cz), stoneCol, [Math.max(1, len / 3), 1]);
        stone.add(new THREE.BoxGeometry(horiz ? len + 0.1 : th * 2, 0.18, horiz ? th * 2 : len + 0.1), mT(cx, o.hm + 0.09, cz), stoneCol.clone().multiplyScalar(0.8), [1, 1]);
      } else if (o.type === "hedge") {
        const horiz = o.w >= o.h, len = horiz ? w : d;
        const segs = Math.ceil(len / 1.6), gx = horiz ? segs : 2, gz = horiz ? 2 : segs;
        const geo = new THREE.BoxGeometry(horiz ? len : 1.9, o.hm + drop, horiz ? 1.9 : len, gx, 3, gz);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) { const k = Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * 0.15 + (Math.random() - 0.5) * 0.18; p.setXYZ(i, p.getX(i) + k * 0.5, p.getY(i) + (p.getY(i) > 0 ? k : 0), p.getZ(i) + k * 0.5); }
        geo.computeVertexNormals();
        hedges.add(geo, mT(cx, (o.hm - drop) / 2, cz), 0xffffff, [Math.max(1, len / 2), 1]);
      } else if (o.type === "rock") {
        const big = o.w > 300 || !!(o.opt && o.opt.big);
        const rr = Math.max(w, d) / 2;
        const geo = new THREE.IcosahedronGeometry(1, big ? 4 : 2);
        const p = geo.attributes.position;
        const base = new THREE.Color(vis.rock), grass = new THREE.Color(0x5a7a40);
        const cols = [];
        for (let i = 0; i < p.count; i++) {
          let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const n = 1 + (Math.sin(x * 5.1 + z * 3.7) * 0.11 + Math.sin(y * 7.3 + x * 4.1) * 0.08 + (Math.random() - 0.5) * 0.05);
          x *= n * (w / 2); z *= n * (d / 2); y = Math.max(0, y) * n * o.hm; if (p.getY(i) < 0) y = 0;
          p.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();
        const nrm = geo.attributes.normal, c2 = [];
        for (let i = 0; i < p.count; i++) { const up = Math.max(0, nrm.getY(i)); const c = base.clone().lerp(grass, big ? Math.max(0, up - 0.45) * 1.6 : 0).multiplyScalar(0.82 + Math.random() * 0.2); c2.push(c.r, c.g, c.b); }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(c2, 3));
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: !big }));
        mesh.position.set(cx, yb - 0.35, cz); mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
    const addMesh = (mg, mat, shadow) => { if (mg.empty) return; const m = new THREE.Mesh(mg.build(), mat); m.castShadow = shadow !== false; m.receiveShadow = true; scene.add(m); return m; };
    addMesh(walls, new THREE.MeshStandardMaterial({ map: wallTex, vertexColors: true, roughness: 0.95 }));
    addMesh(roofs, new THREE.MeshStandardMaterial({ map: roofTex, vertexColors: true, roughness: 0.85 }));
    addMesh(glass, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2 }), false);
    addMesh(stone, new THREE.MeshStandardMaterial({ map: stoneTex, vertexColors: true, roughness: 1 }));
    addMesh(hedges, new THREE.MeshStandardMaterial({ map: leafTex, roughness: 1 }));
  }

  /* ───── Forêts instanciées ───── */
  function treeGeometry(kind, vis) {
    const m = new Merge();
    const L = vis.leaf.map(c => new THREE.Color(c));
    const trunk = kind === "birch" ? 0xd9d4c4 : 0x5a4330;
    const cyl = (r0, r1, h, x, y, z, col, seg) => m.add(new THREE.CylinderGeometry(r0, r1, h, seg || 6), mT(x, y, z), col);
    if (kind === "pine") {
      cyl(0.18, 0.32, 3, 0, 1.5, 0, trunk);
      [[0, 2.2, 2.4, 3.6], [0, 4.6, 1.9, 3.1], [0, 6.7, 1.3, 2.6], [0, 8.4, 0.8, 2.0]].forEach(([x, y, r, h], i) => m.add(new THREE.ConeGeometry(r, h, 7), mT(x, y + h / 2 - 0.4, 0), L[i % 3]));
    } else if (kind === "birch") {
      cyl(0.13, 0.22, 5, 0, 2.5, 0, trunk);
      [[0, 5.6, 0, 1.7], [0.9, 4.6, 0.4, 1.2], [-0.8, 4.9, -0.5, 1.3], [0.2, 6.9, 0.2, 1.1]].forEach(([x, y, z, r], i) => m.add(new THREE.IcosahedronGeometry(r, 1), mT(x, y, z), L[i % 3]));
    } else if (kind === "acacia") {
      cyl(0.14, 0.26, 4.2, 0, 2.1, 0, 0x6a5a40);
      cyl(0.08, 0.1, 1.6, 0.8, 4.6, 0, 0x6a5a40); cyl(0.08, 0.1, 1.4, -0.7, 4.7, 0.3, 0x6a5a40);
      const cap = new THREE.SphereGeometry(1, 9, 6); cap.scale(3.3, 0.7, 3.0); m.add(cap, mT(0, 5.5, 0), L[0]);
      const cap2 = new THREE.SphereGeometry(1, 8, 5); cap2.scale(2, 0.5, 1.8); m.add(cap2, mT(0.6, 6.0, 0.2), L[1]);
    } else if (kind === "broad") {
      cyl(0.2, 0.34, 3.2, 0, 1.6, 0, 0x5a4330);
      [[0, 5.0, 0, 2.5], [1.5, 4.2, 0.5, 1.9], [-1.4, 4.4, -0.6, 2.0], [0.3, 6.4, 0.3, 1.7]].forEach(([x, y, z, r], i) => m.add(new THREE.IcosahedronGeometry(r, 1), mT(x, y, z), L[i % 3]));
    } else if (kind === "poplar") {
      cyl(0.14, 0.24, 3, 0, 1.5, 0, 0x5a4a38);
      const cone = new THREE.SphereGeometry(1, 8, 6); cone.scale(1.15, 4.6, 1.15); m.add(cone, mT(0, 7.0, 0), L[0]);
    } else if (kind === "dead") {
      cyl(0.16, 0.3, 6, 0, 3, 0, 0x3e342b);
      for (let i = 0; i < 4; i++) { const a = i * 1.7; const br = new THREE.CylinderGeometry(0.05, 0.1, 2.2, 4); br.rotateZ(0.9); br.translate(0.8, 0, 0); br.rotateY(a); m.add(br, mT(0, 4 + i * 0.5, 0), 0x3e342b); }
    } else { // palm
      for (let i = 0; i < 6; i++) { const t = i / 6; cyl(0.2 - t * 0.06, 0.24 - t * 0.06, 1.3, Math.sin(t * 1.1) * 0.6, 0.65 + i * 1.2, 0, 0x8a7352, 6); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const fr = new THREE.ConeGeometry(0.28, 3.4, 4); fr.rotateZ(-Math.PI / 2 + 0.55); fr.translate(1.6, 0, 0); fr.rotateY(a); m.add(fr, mT(0.7, 7.5, 0), L[i % 3]); }
    }
    return m.build();
  }

  function buildForests(scene, vis, q) {
    const geo = treeGeometry(vis.tree, vis);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const spacing = 78 / Math.sqrt(q.trees);
    const CH = 1600, cols = Math.ceil(MAP_WIDTH / CH), rows = Math.ceil(MAP_HEIGHT / CH);
    const buckets = Array.from({ length: cols * rows }, () => []);
    const rnd = seeded(777);
    let total = 0;
    for (let y = 60; y < MAP_HEIGHT - 60; y += spacing) {
      for (let x = 60; x < MAP_WIDTH - 60; x += spacing) {
        const wx = x + (rnd() - 0.5) * spacing * 0.9, wy = y + (rnd() - 0.5) * spacing * 0.9;
        if (!TerrainGen.forestAt(MAP_THEME, wx, wy)) continue;
        if (TerrainGen.riverRoadAt(wx, wy, MAP_THEME)) continue;
        if (obstacleBlocksPoint(wx, wy, 60)) continue;
        let nearCP = false; for (const cp of CAPTURE_POINTS) if (Math.hypot(cp.x - wx, cp.y - wy) < cp.radius + 60) { nearCP = true; break; }
        if (nearCP) continue;
        buckets[Math.floor(wy / CH) * cols + Math.floor(wx / CH)].push([wx, wy, rnd()]);
        total++;
      }
    }
    const tmp = new THREE.Matrix4(), col = new THREE.Color(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    S.treeChunks = [];
    buckets.forEach((arr, bi) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      arr.forEach((t, i) => {
        const s = 0.8 + t[2] * 0.6;
        qn.setFromAxisAngle(up, t[2] * 40);
        pos.set(t[0] * PX, groundH(t[0], t[1]) * PX - 0.15, t[1] * PX); sc.set(s, s * (0.9 + t[2] * 0.3), s);
        tmp.compose(pos, qn, sc); im.setMatrixAt(i, tmp);
        col.setScalar(0.82 + ((t[2] * 977) % 1) * 0.3); im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      im.castShadow = (Settings.get("quality") === "ultra");
      const cxm = ((bi % cols) + 0.5) * CH * PX, czm = (Math.floor(bi / cols) + 0.5) * CH * PX;
      im.userData.center = new THREE.Vector3(cxm, 3, czm); im.userData.radius = CH * PX * 0.75;
      scene.add(im); S.treeChunks.push(im);
    });
    console.log("[World] arbres :", total);
  }

  /* ───── Points de capture ───── */
  function labelSprite(text) {
    const c = document.createElement("canvas"); c.width = 384; c.height = 96;
    const x = c.getContext("2d"); x.font = "700 44px 'Roboto Condensed','Arial Narrow',sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = 8; x.strokeStyle = "rgba(0,0,0,0.65)"; x.strokeText(text, 192, 48); x.fillStyle = "#fff"; x.fillText(text, 192, 48);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(14, 3.5, 1);
    return sp;
  }
  function buildCapturePoints(scene) {
    S.capture = [];
    for (const cp of CAPTURE_POINTS) {
      const g = new THREE.Group(); g.position.set(cp.x * PX, groundH(cp.x, cp.y) * PX + 0.06, cp.y * PX);
      const r = cp.radius * PX;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 38, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 19;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 6), new THREE.MeshStandardMaterial({ color: 0x2a2d30 }));
      pole.position.y = 3.5;
      const flagMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3).translate(1.1, 0, 0), flagMat); flag.position.y = 6.2;
      const label = labelSprite(cp.label); label.position.y = 10;
      g.add(disc, ring, beam, pole, flag, label);
      scene.add(g);
      S.capture.push({ cp, g, disc, ring, beam, flag, flagMat, progMesh: null, lastProg: 99, lastOwner: "?", r });
    }
  }
  const CAP_COL = { A: 0x4db4ff, B: 0xff5a44, N: 0xffffff, C: 0xffc83a };
  function updateCapture(time) {
    for (const c of S.capture) {
      const cp = c.cp, col = cp.contested ? CAP_COL.C : cp.owner === "A" ? CAP_COL.A : cp.owner === "B" ? CAP_COL.B : CAP_COL.N;
      for (const m of [c.disc, c.ring, c.beam, c.flag]) m.material.color.setHex(col);
      c.flag.rotation.y = Math.sin(time * 2.2) * 0.25;
      const highlighted = S.cinematicWinner === cp.owner && !cp.contested;
      c.ring.material.opacity = highlighted ? 0.88 + 0.12 * Math.sin(time * 4) : 0.7;
      c.disc.material.opacity = highlighted ? 0.2 + 0.08 * Math.sin(time * 4) : 0.1;
      c.beam.material.opacity = highlighted ? 0.3 + 0.12 * Math.sin(time * 4) : cp.contested ? 0.1 + 0.08 * Math.sin(time * 9) : 0.08;
      const pk = Math.round(cp.progress * 80);
      if (pk !== c.lastProg) {
        c.lastProg = pk;
        if (c.progMesh) { c.g.remove(c.progMesh); c.progMesh.geometry.dispose(); c.progMesh = null; }
        if (Math.abs(cp.progress) > 0.015 && Math.abs(cp.progress) < 0.999) {
          const th = Math.abs(cp.progress) * Math.PI * 2;
          const geo = new THREE.RingGeometry(c.r - 1.4, c.r - 0.45, 64, 1, 0, th).rotateX(-Math.PI / 2);
          c.progMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cp.progress > 0 ? CAP_COL.A : CAP_COL.B, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
          c.progMesh.position.y = 0.02; c.g.add(c.progMesh);
        }
      }
    }
  }

  /* ───── Limite de zone ───── */
  function buildBorder(scene) {
    const tex = canvasTex(8, 128, (c, w, h) => { const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, "rgba(255,110,60,0.55)"); g.addColorStop(1, "rgba(255,110,60,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const hgt = 26;
    const mk = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat); m.position.set(x, hgt / 2, z); m.rotation.y = ry; scene.add(m); };
    mk(W, W / 2, 0, 0); mk(W, W / 2, H, 0); mk(H, 0, H / 2, Math.PI / 2); mk(H, W, H / 2, Math.PI / 2);
  }

  /* ───── Initialisation ───── */
  async function init(canvas, onProgress) {
    const q = Settings.quality(); S.quality = q;
    const rend = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: "high-performance" });
    rend.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    rend.setSize(window.innerWidth, window.innerHeight);
    rend.shadowMap.enabled = q.shadows; rend.shadowMap.type = THREE.PCFShadowMap;
    S.renderer = rend;
    const vis = S.vis;
    const scene = new THREE.Scene(); S.scene = scene;
    scene.fog = new THREE.Fog(vis.horizon, q.far * 0.28 * (vis.fogK || 1), q.far * (vis.fogF || 1));
    scene.background = new THREE.Color(vis.horizon);
    const cam = new THREE.PerspectiveCamera(Settings.get("fov"), window.innerWidth / window.innerHeight, 0.3, 3200); S.camera = cam;
    scene.add(cam);

    scene.add(new THREE.HemisphereLight(vis.hemiSky, vis.hemiGround, vis.hemiI * 0.62));
    const sun = new THREE.DirectionalLight(vis.sun, vis.sunI * 0.62);
    S.sunDir = new THREE.Vector3(...vis.sunDir).normalize();
    sun.castShadow = q.shadows;
    if (q.shadows) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      const sc = sun.shadow.camera; const R = 62; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 260;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
    }
    scene.add(sun); scene.add(sun.target); S.sun = sun;

    S.sky = buildSky(vis); scene.add(S.sky);
    // sol lointain
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(vis.horizon).lerp(new THREE.Color(vis.hemiGround), 0.55) }));
    far.position.set(W / 2, -7, H / 2); scene.add(far);

    if (onProgress) onProgress(0.02, "Génération du terrain…");
    const canvasTexSource = await TerrainGen.generate(MAP_THEME, q.terrainTex, p => { if (onProgress) onProgress(0.02 + p * 0.7, "Génération du terrain…"); });
    S.terrainCanvas = canvasTexSource;
    S.terrain = buildTerrain(canvasTexSource); scene.add(S.terrain);

    if (onProgress) onProgress(0.75, "Construction du décor…");
    await new Promise(r => setTimeout(r, 0));
    buildProps(scene, vis); buildBridges(scene, vis);
    if (onProgress) onProgress(0.85, "Plantation des forêts…");
    await new Promise(r => setTimeout(r, 0));
    buildForests(scene, vis, q);
    buildCapturePoints(scene);
    buildBorder(scene);
    if (onProgress) onProgress(0.92, "Préparation des véhicules…");
    S.ready = true;
  }

  function resize() {
    if (!S.renderer) return;
    S.renderer.setSize(window.innerWidth, window.innerHeight);
    S.camera.aspect = window.innerWidth / window.innerHeight; S.camera.updateProjectionMatrix();
  }

  /* Mise à jour par image : suit la cible pour les ombres, masque les forêts hors portée. */
  function update(time, focus) {
    const f = focus || S.camera.position;
    S.sun.position.copy(f).addScaledVector(S.sunDir, 120); S.sun.target.position.copy(f);
    // alignement de l'ombre sur la grille de texels (évite le scintillement)
    if (S.quality.shadows) {
      const step = 124 / S.quality.shadowMap; S.sun.position.x = Math.round(S.sun.position.x / step) * step; S.sun.position.z = Math.round(S.sun.position.z / step) * step; S.sun.target.position.x = S.sun.position.x - S.sunDir.x * 120; S.sun.target.position.z = S.sun.position.z - S.sunDir.z * 120;
    }
    S.sky.position.copy(S.camera.position);
    const far = S.quality.far, cp = S.camera.position;
    for (const im of S.treeChunks) { const d = im.userData.center.distanceTo(cp); im.visible = d < far + im.userData.radius; }
    updateCapture(time);
  }

  function render() { S.renderer.render(S.scene, S.camera); }

  function setCinematicWinner(team) { S.cinematicWinner = team; }

  return { S, init, resize, update, render, setCinematicWinner, W, H };
})();
