/* ==========================================================================
   TANK-DESIGNS.JS — Chars dessinés dans l'Atelier (editor.html).
   Un « design » est un simple JSON (liste de pièces paramétriques) :
     { id, name, base, paint:{c1,c2,c3,camo,seed}, tp:[x,y], gp:[x,y], parts:[…] }
   Repère : mètres, +X = avant du char, +Y = haut, +Z = côté droit, origine au sol
   au centre de la caisse.  Trois groupes de pièces :
     hull   (caisse)   coordonnées de la caisse
     turret (tourelle) coordonnées relatives à l'axe de la tourelle  tp
     gun    (canon)    coordonnées relatives à l'axe du canon         gp (dans la tourelle)
   Ce module sert à l'éditeur (aperçu), au hangar et au combat (via tank-models.js).
   ========================================================================== */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  if (!THREE) { console.error("[TankDesigns] THREE introuvable"); return; }
  const TD = {};
  const LS_D = "customTankDesigns", LS_A = "customTankActive";
  const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

  /* ───────────── Stockage ───────────── */
  TD.uid = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  /* Les designs peuvent venir d'un fichier importé : on ne garde que des identifiants
     sûrs et une structure attendue avant toute lecture/rendu. */
  TD.all = () => {
    const raw = rd(LS_D, {}), out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw).slice(0, 200)) {
      const d = raw[k];
      if (!SAFE_ID.test(k) || !d || typeof d !== "object" || !Array.isArray(d.parts)) continue;
      if (typeof d.name !== "string") d.name = "Char"; else d.name = d.name.slice(0, 60);
      out[k] = d;
    }
    return out;
  };
  TD.get = id => (SAFE_ID.test(String(id || "")) ? TD.all()[id] : null);
  TD.save = d => { const a = TD.all(); d.id = SAFE_ID.test(String(d.id || "")) ? d.id : TD.uid(); d.updated = Date.now(); a[d.id] = d; localStorage.setItem(LS_D, JSON.stringify(a)); return d.id; };
  TD.remove = id => {
    const a = TD.all(); delete a[id]; localStorage.setItem(LS_D, JSON.stringify(a));
    const m = TD.activeMap(); for (const k of Object.keys(m)) if (m[k] === id) delete m[k]; localStorage.setItem(LS_A, JSON.stringify(m));
  };
  TD.activeMap = () => {
    const raw = rd(LS_A, {}), out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw).slice(0, 60)) if (SAFE_ID.test(String(raw[k] || ""))) out[k.slice(0, 60)] = raw[k];
    return out;
  };
  TD.activeFor = key => { const id = TD.activeMap()[key]; return id ? TD.get(id) : null; };
  TD.setActive = (key, id) => { const m = TD.activeMap(); if (id) m[key] = id; else delete m[key]; localStorage.setItem(LS_A, JSON.stringify(m)); };

  /* ───────────── Peinture / camouflage ───────────── */
  TD.CAMOS = { none: "Unie", woodland: "Taches (forêt)", stripes: "Bandes ondulées", spots: "Léopard", streaks: "Traînées (hiver)" };
  TD.PALETTES = [
    { n: "Gris Panzer", c1: "#58595a", c2: "#3e3f40", c3: "#7a7b7a" }, { n: "Vert olive", c1: "#5b6b3a", c2: "#3d4a27", c3: "#7e8a52" },
    { n: "Jaune sable", c1: "#b59d62", c2: "#8c7a45", c3: "#d2bf88" }, { n: "Vert soviétique", c1: "#4f5d37", c2: "#2f3a20", c3: "#6c7a49" },
    { n: "Kaki britannique", c1: "#6b6a45", c2: "#4a4a2e", c3: "#8a8860" }, { n: "Gris-bleu", c1: "#5f6a73", c2: "#434c54", c3: "#7e8a94" },
    { n: "Blanc d'hiver", c1: "#e4e6e4", c2: "#b4b8b4", c3: "#f4f6f4" }, { n: "Noir mat", c1: "#2c2e30", c2: "#1d1f20", c3: "#40434a" }
  ];
  const _camo = {};
  function camoTex(P) {
    if (!P || !P.camo || P.camo === "none" || typeof document === "undefined") return null;
    const key = [P.camo, P.c1, P.c2, P.c3, P.seed || 1].join("|");
    if (_camo[key]) return _camo[key];
    const S = 512, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
    let s = ((P.seed || 1) * 2654435761) >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    x.fillStyle = P.c1; x.fillRect(0, 0, S, S);
    const wrap = fn => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.save(); x.translate(ox, oy); fn(); x.restore(); } };
    const blob = (cx, cy, r, col, sx) => wrap(() => {
      x.fillStyle = col; x.beginPath(); const n = 10;
      for (let i = 0; i <= n; i++) { const a = i / n * 6.2832, rr = r * (0.6 + rnd() * 0.8); const px = cx + Math.cos(a) * rr * (sx || 1.25), py = cy + Math.sin(a) * rr * 0.8; i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.closePath(); x.fill();
    });
    if (P.camo === "woodland") { for (let i = 0; i < 26; i++) blob(rnd() * S, rnd() * S, 28 + rnd() * 46, P.c2); for (let i = 0; i < 20; i++) blob(rnd() * S, rnd() * S, 16 + rnd() * 34, P.c3); }
    else if (P.camo === "spots") { for (let i = 0; i < 40; i++) { const cx = rnd() * S, cy = rnd() * S, r = 14 + rnd() * 20; blob(cx, cy, r, P.c2, 1); blob(cx, cy, r * 0.55, P.c3, 1); } }
    else if (P.camo === "stripes") {
      for (let k = 0; k < 7; k++) {
        const col = k % 2 ? P.c3 : P.c2, y0 = k * S / 7 + rnd() * 20, amp = 14 + rnd() * 22, ph = rnd() * 6.28, th = 26 + rnd() * 26;
        wrap(() => { x.strokeStyle = col; x.lineWidth = th; x.lineCap = "round"; x.beginPath(); for (let px = -20; px <= S + 20; px += 8) { const py = y0 + Math.sin(px / S * 6.2832 * 2 + ph) * amp; px === -20 ? x.moveTo(px, py) : x.lineTo(px, py); } x.stroke(); });
      }
    } else if (P.camo === "streaks") { for (let i = 0; i < 46; i++) { const cx = rnd() * S, cy = rnd() * S, l = 30 + rnd() * 70, a = (rnd() - 0.5) * 0.9, col = i % 3 ? P.c2 : P.c3; wrap(() => { x.strokeStyle = col; x.globalAlpha = 0.55; x.lineWidth = 6 + rnd() * 14; x.lineCap = "round"; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); }); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.45, 0.45); t.anisotropy = 4;
    return (_camo[key] = t);
  }

  /* ───────────── Géométries (mises en cache) ───────────── */
  const _geo = new Map();
  const cached = (key, make) => { let g = _geo.get(key); if (!g) { if (_geo.size > 400) _geo.clear(); g = make(); _geo.set(key, g); } return g; };
  TD.DEF_PROFILE = [[0, 0.1], [0.04, 0], [0.93, 0], [1, 0.3], [1, 0.5], [0.82, 1], [0.12, 1], [0, 0.9]];

  function geoBox(P) {
    const t = P.taper || [1, 1], sk = P.skew || 0;
    return cached("box|" + t + "|" + sk, () => {
      const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * t[0] + sk); p.setZ(i, p.getZ(i) * t[1]); }
      g.computeVertexNormals(); return g;
    });
  }
  function geoCyl(P) { const rt = P.rt === undefined ? 1 : P.rt, seg = P.seg || 16; return cached("cyl|" + rt + "|" + seg, () => new THREE.CylinderGeometry(0.5 * rt, 0.5, 1, seg, 1)); }
  function geoSphere(P) { const half = !!P.half; return cached("sph|" + half, () => new THREE.SphereGeometry(0.5, 22, 14, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI)); }
  function geoWedge(P) {
    const dir = P.dir === -1 ? -1 : 1;
    return cached("wed|" + dir, () => {
      const sh = new THREE.Shape(); sh.moveTo(-0.5, -0.5); sh.lineTo(0.5, -0.5); sh.lineTo(dir > 0 ? 0.5 : -0.5, 0.5); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); g.computeVertexNormals(); return g;
    });
  }
  function geoPrism(P) {
    const pts = P.pts && P.pts.length >= 3 ? P.pts : TD.DEF_PROFILE, tw = P.topW === undefined ? 1 : P.topW, fw = P.frontW === undefined ? 1 : P.frontW;
    return cached("pri|" + JSON.stringify(pts) + "|" + tw + "|" + fw, () => {
      const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x - 0.5, y - 0.5) : sh.moveTo(x - 0.5, y - 0.5));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5);
      if (tw !== 1 || fw !== 1) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yN = p.getY(i) + 0.5, xN = p.getX(i) + 0.5; p.setZ(i, p.getZ(i) * (1 - (1 - tw) * yN) * (1 - (1 - fw) * xN)); } }
      g.computeVertexNormals(); return g;
    });
  }
  const mesh = (geo, mat, sc, pos, rot) => { const m = new THREE.Mesh(geo, mat); if (sc) m.scale.set(sc[0], sc[1], sc[2]); if (pos) m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); m.castShadow = true; m.receiveShadow = true; return m; };

  /* Canon : tube + manchon, évent, frein de bouche */
  function gunObj(P, mat) {
    const g = new THREE.Group(), len = P.len || 3, r = P.r || 0.06, tp = P.taper === undefined ? 0.85 : P.taper;
    const cylX = (x0, x1, r0, r1, seg) => { const m = new THREE.Mesh(cached("gx|" + r1 / r0 + "|" + (seg || 16), () => new THREE.CylinderGeometry(r1 / r0, 1, 1, seg || 16, 1)), mat); m.rotation.z = -Math.PI / 2; m.scale.set(r0, x1 - x0, r0); m.position.x = (x0 + x1) / 2; m.castShadow = true; return m; };
    g.add(cylX(0, len, r, r * tp));
    if (P.sleeve) g.add(cylX(len * 0.2, len * 0.8, r * 1.45, r * 1.45));
    if (P.evac) g.add(cylX(len * 0.52, len * 0.52 + 0.42, r * 1.6, r * 1.6));
    const b = P.brake || "none";
    if (b === "single") g.add(cylX(len - 0.34, len, r * 1.9, r * 1.9, 14));
    else if (b === "double") { g.add(cylX(len - 0.42, len - 0.24, r * 1.9, r * 1.9, 14)); g.add(cylX(len - 0.18, len, r * 1.9, r * 1.9, 14)); }
    else if (b === "tbrake") { const m = mesh(geoBox({}), mat, [0.34, r * 2.1, r * 5.2], [len - 0.17, 0, 0]); g.add(m); }
    else if (b === "slotted") { g.add(cylX(len - 0.5, len, r * 1.65, r * 1.65, 12)); for (let i = 0; i < 3; i++) g.add(cylX(len - 0.43 + i * 0.14, len - 0.37 + i * 0.14, r * 1.75, r * 1.75, 12)); }
    else if (b === "muzzle") g.add(cylX(len - 0.12, len, r * 1.3, r * 1.3, 14));
    return g;
  }

  /* Train de roulement : chenille (boucle), galets, barbotin, garde-boue, jupe */
  function tracksObj(P, mats, partPaint) {
    const g = new THREE.Group(), len = P.len || 5.5, h = P.h || 1, w = P.w || 0.5, R = h / 2, th = Math.min(0.09, R * 0.3);
    const stadium = (L, r) => { const s = new THREE.Path(); const a = L / 2 - r; s.moveTo(-a, -r); s.lineTo(a, -r); s.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-a, r); s.absarc(-a, 0, r, Math.PI / 2, Math.PI * 1.5, false); return s; };
    const belt = new THREE.Shape(stadium(len, R).getPoints(14)); belt.holes.push(new THREE.Path(stadium(len - 2 * th, R - th).getPoints(14)));
    const bg = cached("belt|" + len + "|" + h + "|" + w, () => { const e = new THREE.ExtrudeGeometry(belt, { depth: w, bevelEnabled: false, curveSegments: 14 }); e.translate(0, 0, -w / 2); return e; });
    g.add(mesh(bg, mats.track));
    const n = Math.max(3, P.nw || 6), wr = P.wr || R * 0.72, a = len / 2 - R, wm = mats.wheel, cap = mats.cap;
    const wheel = (x, y, r, ww) => {
      const h = new THREE.Group(); h.position.set(x, y, 0); h.userData = { spin: 1, r };
      h.add(mesh(geoCyl({ seg: 18 }), wm, [r * 2, ww, r * 2], [0, 0, 0], [Math.PI / 2, 0, 0]));
      h.add(mesh(geoCyl({ seg: 10 }), cap, [r * 0.8, ww + 0.04, r * 0.8], [0, 0, 0], [Math.PI / 2, 0, 0]));
      if (r > 0.12) for (let i = 0; i < 3; i++) h.add(mesh(geoBox({}), cap, [r * 1.7, r * 0.13, ww + 0.07], [0, 0, 0], [0, 0, i * Math.PI / 3]));
      return h;
    };
    const roadY = -R + th + wr;
    const x0 = -a + (len * 0.02), x1 = a - len * 0.02;
    for (let i = 0; i < n; i++) g.add(wheel(x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)), roadY, wr, w * 0.78));
    g.add(wheel(-a, 0, R - th, w * 0.78));            // barbotin / poulie
    g.add(wheel(a, 0, R - th, w * 0.78));
    for (let i = 0; i < 3; i++) g.add(wheel(-a * 0.5 + i * a * 0.5, R - th - 0.07, 0.07, w * 0.5));   // galets porteurs
    if (P.fender) g.add(mesh(geoBox({}), mats.paint, [len + 0.36, 0.05, w + 0.16], [0.05, R + 0.1, 0]));
    if (P.skirt) g.add(mesh(geoBox({ taper: [1, 1] }), mats.paint, [len * 0.82, h * 0.66, 0.035], [len * 0.02, R * 0.12, w / 2 + 0.07]));
    return g;
  }

  /* Construit l'objet 3D d'une pièce (hors transformation globale) */
  function partObject(part, mats, partMat) {
    const P = part.params || {}, s = part.s || [1, 1, 1], g = new THREE.Group();
    const one = () => {
      switch (part.type) {
        case "box": return mesh(geoBox(P), partMat, s);
        case "cyl": return mesh(geoCyl(P), partMat, s);
        case "sphere": return mesh(geoSphere(P), partMat, s);
        case "wedge": return mesh(geoWedge(P), partMat, s);
        case "prism": return mesh(geoPrism(P), partMat, s);
        case "gun": return gunObj(P, partMat);
        case "tracks": return tracksObj(P, mats, part.paint);
        default: return mesh(geoBox({}), partMat, s);
      }
    };
    const arr = part.arr && part.arr[0] > 1 ? part.arr : [1, 0, 0, 0];
    for (let i = 0; i < Math.min(arr[0], 60); i++) { const o = one(); o.position.x += arr[1] * i; o.position.y += arr[2] * i; o.position.z += arr[3] * i; g.add(o); }
    return g;
  }

  /* ───────────── Construction complète ───────────── */
  TD.build = function (design, k) {
    k = k || 1;
    const M = new Map(), P0 = design.paint || {};
    const tex = camoTex(P0);
    const lookIt = m => { if (global.Look) global.Look.tank(m, LPref.v, null); return m; };      // usure, boue, poussière (arena-look.js)
    const LPref = { v: null };
    const stat = (key, col, r, m) => { if (!M.has(key)) M.set(key, lookIt(new THREE.MeshStandardMaterial({ color: col, roughness: r, metalness: m }))); return M.get(key); };
    const paintMat = part => {
      const key = "P|" + (part.rough ?? 0.85) + "|" + (part.metal ?? 0.12);
      if (!M.has(key)) M.set(key, lookIt(new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : new THREE.Color(P0.c1 || "#5b6b3a"), map: tex || null, roughness: part.rough ?? 0.85, metalness: part.metal ?? 0.12 })));
      return M.get(key);
    };
    const LP = { wear: P0.wear === undefined ? 0.35 : P0.wear, mud: P0.mud === undefined ? 0.3 : P0.mud, dust: P0.dust === undefined ? 0.2 : P0.dust, rust: P0.rust === undefined ? 0.08 : P0.rust };
    LPref.v = LP;
    const mats = { track: stat("track", 0x2a2b2a, 0.95, 0.2), wheel: stat("wheel", 0x45484b, 0.7, 0.35), cap: stat("cap", 0x66696c, 0.6, 0.4), paint: null };
    const root = new THREE.Group(), hull = new THREE.Group(), turretPivot = new THREE.Group(), turretMeshes = new THREE.Group(), gunPivot = new THREE.Group(), barrel = new THREE.Group(), gunMeshes = new THREE.Group(), muzzle = new THREE.Object3D();
    root.add(hull); root.add(turretPivot); turretPivot.add(turretMeshes); turretPivot.add(gunPivot); gunPivot.add(barrel); barrel.add(gunMeshes); barrel.add(muzzle);
    const tp = design.tp || [0, 1.9], gp = design.gp || [1, 0.5];
    turretPivot.position.set(tp[0] * k, tp[1] * k, 0); gunPivot.position.set(gp[0] * k, gp[1] * k, 0);
    const byId = {}, host = { hull, turret: turretMeshes, gun: gunMeshes };
    for (const part of design.parts || []) {
      if (part.hidden) continue;
      const pm = paintMat(part);
      mats.paint = pm;
      const partMat = part.paint ? pm : stat("c|" + part.col + "|" + (part.rough ?? 0.7) + "|" + (part.metal ?? 0.3), part.col || "#888888", part.rough ?? 0.7, part.metal ?? 0.3);
      const place = (o, mirror) => {
        const p = part.p || [0, 0, 0], r = part.r || [0, 0, 0], d = Math.PI / 180;
        o.position.set(p[0] * k, p[1] * k, (mirror ? -p[2] : p[2]) * k);
        o.rotation.set((mirror ? -r[0] : r[0]) * d, (mirror ? -r[1] : r[1]) * d, r[2] * d);
        o.scale.setScalar(k);
        o.traverse(c => { if (c.isMesh) c.userData.partId = part.id; if (c.userData.spin !== undefined) { if (mirror) c.userData.spin = 1 - c.userData.spin; c.userData.r = (c.userData.r || 1) * k; } });
        return o;
      };
      const base = place(partObject(part, mats, partMat), false); host[part.grp || "hull"].add(base);
      const list = [base];
      if (part.mirror || part.type === "tracks") { const o2 = place(partObject(part, mats, partMat), true); host[part.grp || "hull"].add(o2); list.push(o2); }
      byId[part.id] = list;
    }
    return { root, hull, turretPivot, gunPivot, barrel, muzzle, gunMeshes, turretMeshes, byId, k, mats: [...M.values()] };
  };

  /* Modèle prêt pour tank-models.js (buildFromModel-like) : mis à l'échelle sur le profil du char */
  TD.template = function (profile, design) {
    if (!(design.parts || []).length) return null;
    const raw = TD.build(design, 1); raw.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(raw.hull), size = bb.getSize(new THREE.Vector3());
    const k = design.noScale || size.x < 0.5 ? 1 : clamp(profile.L / size.x, 0.4, 3);
    const b = TD.build(design, k); b.root.updateMatrixWorld(true);
    const hb = new THREE.Box3().setFromObject(b.hull);
    b.root.position.x = -(hb.min.x + hb.max.x) / 2; b.root.position.y = -hb.min.y; b.root.updateMatrixWorld(true);
    const tpW = b.turretPivot.getWorldPosition(new THREE.Vector3()), gpW = b.gunPivot.getWorldPosition(new THREE.Vector3());
    const gb = new THREE.Box3().setFromObject(b.gunMeshes);
    const gunLen = gb.isEmpty() ? profile.gunLen : Math.max(0.8, gb.max.x - gpW.x);
    b.muzzle.position.set(gunLen, 0, 0);
    const info = { design: true, scale: k, length: size.x * k, pivotX: tpW.x, gunX: gpW.x - tpW.x, gunY: gpW.y - profile.hullTop, gunLen };
    return { root: b.root, info, turretPath: [1], gunPath: [1, 1], barrelPath: [1, 1, 0], muzzlePath: [1, 1, 0, 1] };
  };

  /* ───────────── Pièces : fabrique ───────────── */
  TD.part = o => Object.assign({ id: "p" + Math.random().toString(36).slice(2, 8), name: "Pièce", grp: "hull", type: "box", p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], col: "#4a4d50", paint: true, metal: 0.12, rough: 0.85, mirror: false, arr: [1, 0, 0, 0], params: {} }, o);
  const DARK = { paint: false, col: "#2a2c2e", metal: 0.4, rough: 0.6 }, STEEL = { paint: false, col: "#4a4e52", metal: 0.55, rough: 0.5 }, WOOD = { paint: false, col: "#6b5230", metal: 0.02, rough: 0.9 };
  TD.TYPES = { box: "Boîte", cyl: "Cylindre / cône", sphere: "Sphère / dôme", wedge: "Coin", prism: "Profil de caisse", tracks: "Train de roulement", gun: "Canon" };
  TD.GROUPS = { hull: "Caisse", turret: "Tourelle", gun: "Canon" };

  /* Dimensions de référence (depuis un profil de char du jeu) */
  TD.dimsFrom = pr => {
    const tu = pr.tu || { l: 2.2, w: 2.2, h: 0.85, x: 0.2 };
    return { L: pr.L || 6, W: pr.W || 3, Ht: pr.hullTop || 1.9, tH: pr.trackH || 1, tl: tu.l, tw: tu.w, th: tu.h, tx: tu.x, gl: (pr.gun && pr.gun.len) || 3.4, gr: (pr.gun && pr.gun.r) || 0.05, wheels: pr.wheels || 6, k: tu.k };
  };

  /* ───────────── Bibliothèque de détails ───────────── */
  const rowN = (n, d) => [n, d[0], d[1], d[2]];
  TD.LIB = [
    { id: "cupola", n: "Coupole de commandant", g: "turret", make: D => [
      TD.part({ name: "Coupole", grp: "turret", type: "cyl", p: [-D.tl * 0.18, D.th + 0.1, D.tw * 0.18], s: [0.62, 0.22, 0.62], params: { seg: 14 } }),
      TD.part({ name: "Trappe cdt", grp: "turret", type: "cyl", p: [-D.tl * 0.18, D.th + 0.23, D.tw * 0.18], s: [0.5, 0.05, 0.5], params: { seg: 14 } }),
      TD.part({ ...DARK, name: "Périscopes cdt", grp: "turret", type: "box", p: [-D.tl * 0.18 - 0.31, D.th + 0.12, D.tw * 0.18 - 0.2], s: [0.04, 0.07, 0.07], arr: rowN(4, [0, 0, 0.13]), params: {} })] },
    { id: "hatch", n: "Trappe de chargeur", g: "turret", make: D => [
      TD.part({ name: "Trappe chargeur", grp: "turret", type: "cyl", p: [-D.tl * 0.12, D.th + 0.03, -D.tw * 0.2], s: [0.55, 0.07, 0.55], r: [0, 0, 8], params: { seg: 14 } })] },
    { id: "mgcoax", n: "Mitrailleuse coaxiale", g: "turret", make: D => [
      TD.part({ ...DARK, name: "MG coaxiale", grp: "turret", type: "cyl", p: [D.tl * 0.5 + 0.12, D.th * 0.62 - 0.02, D.tw * 0.16], s: [0.05, 0.6, 0.05], r: [0, 0, 90], params: { seg: 8 } })] },
    { id: "aamg", n: "Mitrailleuse antiaérienne", g: "turret", make: D => [
      TD.part({ ...DARK, name: "Affût MG", grp: "turret", type: "cyl", p: [-D.tl * 0.18, D.th + 0.35, D.tw * 0.18], s: [0.06, 0.28, 0.06], params: { seg: 8 } }),
      TD.part({ ...DARK, name: "MG AA", grp: "turret", type: "cyl", p: [-D.tl * 0.18 + 0.32, D.th + 0.52, D.tw * 0.18], s: [0.05, 0.75, 0.05], r: [0, 0, 90], params: { seg: 8 } })] },
    { id: "smoke", n: "Lance-fumigènes", g: "turret", make: D => [
      TD.part({ ...DARK, name: "Fumigènes", grp: "turret", type: "cyl", p: [D.tl * 0.3, D.th * 0.72, D.tw / 2 + 0.05], s: [0.1, 0.2, 0.1], r: [0, 0, 0], mirror: true, arr: rowN(4, [0, 0, 0.12]), params: { seg: 8 } })] },
    { id: "bustle", n: "Coffre arrière de tourelle", g: "turret", make: D => [
      TD.part({ name: "Coffre de tourelle", grp: "turret", type: "box", p: [-D.tl * 0.5 - 0.12, D.th * 0.4, 0], s: [0.5, D.th * 0.7, D.tw * 0.82], params: { taper: [0.92, 0.95] } })] },
    { id: "mantlet", n: "Mantelet de canon", g: "turret", make: D => [
      TD.part({ name: "Mantelet", grp: "turret", type: "box", p: [D.tl * 0.46, D.th * 0.6, 0], s: [0.32, D.th * 0.62, D.tw * 0.46], params: { taper: [0.9, 0.9] } })] },
    { id: "ammo", n: "Blindage additionnel de tourelle", g: "turret", make: D => [
      TD.part({ name: "Blocs additionnels", grp: "turret", type: "box", p: [D.tl * 0.38, D.th * 0.35, -D.tw * 0.36], s: [0.28, D.th * 0.28, 0.22], arr: rowN(4, [0, 0, 0.24]), mirror: false, params: { taper: [0.9, 0.9] } })] },
    { id: "headlight", n: "Phares avant", g: "hull", make: D => [
      TD.part({ ...DARK, name: "Phare", grp: "hull", type: "cyl", p: [D.L * 0.43, D.Ht + 0.05, D.W * 0.34], s: [0.18, 0.1, 0.18], r: [0, 0, 90], mirror: true, params: { seg: 12 } })] },
    { id: "exhaust", n: "Pots d'échappement", g: "hull", make: D => [
      TD.part({ ...DARK, name: "Échappement", grp: "hull", type: "cyl", p: [-D.L * 0.46, D.Ht * 0.82, D.W * 0.28], s: [0.2, 0.8, 0.2], r: [0, 0, 90], mirror: true, params: { seg: 10 } })] },
    { id: "toolbox", n: "Caisse à outils", g: "hull", make: D => [
      TD.part({ ...STEEL, name: "Caisse à outils", grp: "hull", type: "box", p: [-D.L * 0.05, D.Ht + 0.2, D.W * 0.4], s: [0.95, 0.28, 0.3], params: { taper: [0.95, 0.9] } })] },
    { id: "jerry", n: "Jerricans", g: "hull", make: D => [
      TD.part({ ...DARK, col: "#3c4026", name: "Jerricans", grp: "hull", type: "box", p: [-D.L * 0.42, D.Ht + 0.2, D.W * 0.28], s: [0.18, 0.34, 0.28], arr: rowN(3, [0, 0, 0.32]), params: {} })] },
    { id: "spare", n: "Maillons de chenille de rechange", g: "hull", make: D => [
      TD.part({ ...DARK, name: "Maillons de rechange", grp: "hull", type: "box", p: [D.L * 0.3, D.Ht * 0.78, -D.W * 0.2], s: [0.04, 0.2, 0.4], r: [0, 0, -38], arr: rowN(6, [0, 0, 0.14]), params: {} })] },
    { id: "grille", n: "Grilles de moteur", g: "hull", make: D => [
      TD.part({ ...DARK, name: "Grille moteur", grp: "hull", type: "box", p: [-D.L * 0.3, D.Ht + 0.03, -D.W * 0.18], s: [0.7, 0.05, 0.05], arr: rowN(7, [0.0, 0, 0.09]), r: [0, 90, 0], mirror: true, params: {} }),
      TD.part({ ...DARK, name: "Cadre grille", grp: "hull", type: "box", p: [-D.L * 0.3, D.Ht + 0.015, 0], s: [0.75, 0.03, D.W * 0.4], params: {} })] },
    { id: "cable", n: "Câbles de remorquage", g: "hull", make: D => [
      TD.part({ ...DARK, name: "Câble", grp: "hull", type: "cyl", p: [0, D.Ht + 0.1, D.W * 0.46], s: [0.07, D.L * 0.78, 0.07], r: [0, 0, 90], mirror: true, params: { seg: 6 } })] },
    { id: "skirts", n: "Jupes latérales (Schürzen)", g: "hull", make: D => [
      TD.part({ name: "Jupes", grp: "hull", type: "box", p: [0, D.tH * 0.8, D.W / 2 + 0.03], s: [D.L * 0.74, D.tH * 0.62, 0.035], mirror: true, params: {} })] },
    { id: "antenna", n: "Antenne radio", g: "hull", make: D => [
      TD.part({ ...DARK, name: "Antenne", grp: "hull", type: "cyl", p: [-D.L * 0.38, D.Ht + 0.9, D.W * 0.3], s: [0.025, 1.8, 0.025], params: { seg: 5 } })] },
    { id: "visor", n: "Poste de pilotage + mitrailleuse de caisse", g: "hull", make: D => [
      TD.part({ name: "Trappe pilote", grp: "hull", type: "box", p: [D.L * 0.34, D.Ht + 0.06, -D.W * 0.17], s: [0.5, 0.1, 0.5], params: { taper: [0.9, 0.9] } }),
      TD.part({ ...DARK, name: "MG de caisse", grp: "hull", type: "sphere", p: [D.L * 0.46, D.Ht - 0.08, D.W * 0.12], s: [0.2, 0.2, 0.2], params: {} })] },
    { id: "rivets", n: "Rangée de rivets / boulons", g: "hull", make: D => [
      TD.part({ ...STEEL, name: "Boulons", grp: "hull", type: "sphere", p: [D.L * 0.08, D.Ht + 0.01, -D.W * 0.34], s: [0.06, 0.04, 0.06], arr: rowN(14, [0.16, 0, 0]), mirror: true, params: { half: true } })] },
    { id: "fenderf", n: "Garde-boue avant relevé", g: "hull", make: D => [
      TD.part({ name: "Garde-boue avant", grp: "hull", type: "box", p: [D.L * 0.5 + 0.1, D.tH + 0.05, D.W / 2 - 0.3], s: [0.7, 0.04, 0.55], r: [0, 0, 14], mirror: true, params: {} })] },
    { id: "era", n: "Blindage réactif (briques)", g: "hull", make: D => [
      TD.part({ ...DARK, col: "#3a3d38", name: "Briques réactives", grp: "hull", type: "box", p: [D.L * 0.3, D.Ht * 0.7, D.W / 2 + 0.07], s: [0.38, 0.38, 0.1], arr: rowN(5, [0.42, 0, 0]), mirror: true, params: {} })] }
  ];

  /* ───────────── Modèles de départ ───────────── */
  const PROF = {
    classic: [[0, 0.1], [0.04, 0], [0.93, 0], [1, 0.3], [1, 0.52], [0.84, 1], [0.1, 1], [0, 0.9]],
    sloped: [[0, 0.15], [0.03, 0], [0.88, 0], [1, 0.12], [1, 0.3], [0.76, 1], [0.12, 1], [0.02, 0.92], [0, 0.6]],
    boxy: [[0, 0.08], [0.03, 0], [0.95, 0], [1, 0.12], [1, 0.8], [0.94, 1], [0.06, 1], [0, 0.9]],
    modern: [[0, 0.12], [0.03, 0], [0.88, 0], [1, 0.1], [1, 0.22], [0.72, 1], [0.1, 1], [0, 0.8]]
  };
  TD.PROFILES = PROF;
  TD.STYLES = {
    classic: { n: "Moyen classique (type Panzer III/IV)", prof: "classic", hull: "inner", tur: "box", fender: true, skirt: false, brake: "double" },
    sloped: { n: "Moyen profilé (type T-34 / Panther)", prof: "sloped", hull: "flush", tur: "hex", fender: false, skirt: false, brake: "single" },
    sherman: { n: "Moyen arrondi (type Sherman)", prof: "classic", hull: "flush", tur: "oval", fender: false, skirt: false, brake: "none" },
    heavy: { n: "Lourd (type Tiger / KV)", prof: "boxy", hull: "inner", tur: "box", fender: true, skirt: true, brake: "double" },
    casemate: { n: "Chasseur de chars à casemate", prof: "classic", hull: "inner", tur: "casemate", fender: true, skirt: false, brake: "single" },
    modern: { n: "Char moderne (type Leopard / Chieftain)", prof: "modern", hull: "flush", tur: "wedge", fender: false, skirt: true, brake: "none", evac: true },
    light: { n: "Char léger", prof: "sloped", hull: "flush", tur: "oval", fender: false, skirt: false, brake: "none" },
    empty: { n: "Vide (partir de zéro)", empty: true }
  };
  TD.starter = function (styleId, profile, name) {
    const st = TD.STYLES[styleId] || TD.STYLES.classic, D = TD.dimsFrom(profile || { L: 6, W: 3, hullTop: 1.9, trackH: 1, tu: { l: 2.2, w: 2.2, h: 0.85, x: 0.2 }, gun: { len: 3.4, r: 0.05 } });
    const d = { v: 1, id: null, name: name || "Nouveau char", base: profile && profile.key || null, paint: { c1: "#5b6b3a", c2: "#3d4a27", c3: "#7e8a52", camo: "none", seed: 7 }, tp: [D.tx, D.Ht], gp: [D.tl * 0.44, D.th * 0.6], meta: D, parts: [] };
    if (st.empty) { d.tp = [0, D.Ht]; return d; }
    const L = D.L, W = D.W, Ht = D.Ht, tH = D.tH, tw = clamp(W * 0.16, 0.38, 0.72), flush = st.hull === "flush";
    const yb = tH * (flush ? 0.62 : 0.42), hH = Ht - yb, hw = flush ? W - 2 * tw * 0.55 : W - 2 * tw + 0.12;
    d.parts.push(TD.part({ name: "Caisse", grp: "hull", type: "prism", p: [0, yb + hH / 2, 0], s: [L * 0.97, hH, hw], params: { pts: PROF[st.prof], topW: flush ? 0.88 : 1, frontW: flush ? 0.9 : 1 } }));
    d.parts.push(TD.part({ ...DARK, name: "Train de roulement", grp: "hull", type: "tracks", p: [0, tH / 2, W / 2 - tw / 2], params: { len: L * 0.93, h: tH, w: tw, wr: tH * 0.37, nw: D.wheels, fender: st.fender, skirt: st.skirt } }));
    const lib = id => TD.LIB.find(x => x.id === id).make(D);
    ["grille", "headlight", "exhaust", "visor", "spare", "antenna"].forEach(id => d.parts.push(...lib(id)));
    if (st.fender) d.parts.push(...lib("toolbox"));
    // tourelle
    const tl = D.tl, tuw = D.tw, th = D.th, T = (o) => d.parts.push(TD.part(Object.assign({ grp: "turret" }, o)));
    if (st.tur === "box") T({ name: "Tourelle", type: "box", p: [0, th / 2, 0], s: [tl, th, tuw], params: { taper: [0.9, 0.93], skew: 0.04 } });
    else if (st.tur === "hex") T({ name: "Tourelle", type: "cyl", p: [0, th / 2, 0], s: [tl * 1.1, th, tuw * 1.05], r: [0, 90, 0], params: { seg: 6, rt: 0.8 } });
    else if (st.tur === "oval") { T({ name: "Tourelle", type: "cyl", p: [0, th * 0.4, 0], s: [tl, th * 0.8, tuw], params: { seg: 22, rt: 0.82 } }); T({ name: "Dôme de tourelle", type: "sphere", p: [0, th * 0.78, 0], s: [tl * 0.78, th * 0.42, tuw * 0.78], params: { half: true } }); }
    else if (st.tur === "wedge") T({ name: "Tourelle", type: "prism", p: [0, th / 2, 0], s: [tl, th, tuw], params: { pts: [[0, 0], [1, 0], [1, 0.45], [0.55, 1], [0.06, 1], [0, 0.65]], topW: 0.84, frontW: 0.8 } });
    else if (st.tur === "casemate") {
      d.parts.push(TD.part({ name: "Casemate", grp: "hull", type: "box", p: [D.tx + tl * 0.1, Ht + th * 0.5 - 0.02, 0], s: [tl * 1.15, th, tuw * 1.05], params: { taper: [0.8, 0.82] } }));
      d.tp = [D.tx + tl * 0.45, Ht + th * 0.35]; d.gp = [0.25, 0.05];
      T({ name: "Mantelet", type: "box", p: [0.12, 0.05, 0], s: [0.5, th * 0.55, tuw * 0.38], params: { taper: [0.9, 0.9] } });
    }
    const csm = st.tur === "casemate";
    if (!csm) { d.parts.push(...lib("mantlet"), ...lib("cupola"), ...lib("hatch"), ...lib("smoke")); if (st.tur !== "wedge") d.parts.push(...lib("bustle")); }
    d.parts.push(TD.part({ ...STEEL, name: "Canon", grp: "gun", type: "gun", p: [0, 0, 0], params: { len: D.gl, r: Math.max(0.04, D.gr), brake: st.brake, evac: !!st.evac, sleeve: false, taper: 0.88 } }));
    return d;
  };

  global.TankDesigns = TD;
})(typeof window !== "undefined" ? window : globalThis);
