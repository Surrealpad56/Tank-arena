/* ==========================================================================
   TANK-MODELS.JS — Véhicules 3D (Three.js) : assemblage procédural par
   catégorie + chargement de vrais modèles (GLB / glTF / OBJ).

   Utilisé par le garage du lobby (aperçu 3D) ET par le combat.

   Interface commune d'une instance (TankView), identique que le char soit
   procédural ou issu d'un modèle fourni :
       view.root          Group positionné au sol, +X = avant du char
       view.turretPivot   Group qui tourne en lacet (tourelle)
       view.gunPivot      Group qui tourne en tangage (élévation du canon)
       view.barrel        Group qui coulisse en X (recul)
       view.muzzle        Object3D à la bouche du canon
       view.setPose(...)  position / cap / tourelle / canon / recul
       view.animateTracks(distG, distD)
       view.setTeam("A"|"B"|null), view.setDestroyed(b), view.setTrackBroken(g,d)

   Dépend de three.min.js, tank-catalog.js, model-loaders.js (optionnel).
   ========================================================================== */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  if (!THREE) { console.error("[TankModels] THREE introuvable"); return; }

  /* ─────────────── Utilitaires de construction ─────────────── */
  const TMP_M = new THREE.Matrix4();
  const TMP_V = new THREE.Vector3();
  const TMP_N = new THREE.Matrix3();

  /* GeoBuilder : accumule des géométries (avec couleur par sommet) dans un
     seul BufferGeometry → 1 draw call par pièce, et un faux "ambient
     occlusion" (assombrissement près du sol) pour du volume sans textures. */
  class GeoBuilder {
    constructor(aoBase) { this.pos = []; this.nor = []; this.col = []; this.aoBase = aoBase || 0; }
    add(geo, color, matrix) {
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (matrix) g.applyMatrix4(matrix);
      const p = g.attributes.position, n = g.attributes.normal;
      const c = new THREE.Color(color);
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + this.aoBase;
        const ao = 0.66 + 0.34 * Math.min(1, Math.max(0, y / 1.7));
        this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
        this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
        this.col.push(c.r * ao, c.g * ao, c.b * ao);
      }
      g.dispose();
      return this;
    }
    box(x, y, z, w, h, d, color, ry) {
      const m = new THREE.Matrix4().makeTranslation(x, y, z);
      if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry));
      return this.add(new THREE.BoxGeometry(w, h, d), color, m);
    }
    /* Cylindre d'axe 'x', 'y' ou 'z' centré en (x,y,z) */
    cyl(x, y, z, rTop, rBot, h, axis, color, seg) {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, seg || 14);
      const m = new THREE.Matrix4().makeTranslation(x, y, z);
      if (axis === "x") m.multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
      else if (axis === "z") m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      return this.add(g, color, m);
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
  }

  function shapeFrom(pts, holes) {
    const s = new THREE.Shape();
    pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    s.closePath();
    (holes || []).forEach(h => { const path = new THREE.Path(); h.forEach((p, i) => i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])); path.closePath(); s.holes.push(path); });
    return s;
  }
  const scalePts = (pts, sx, sy) => pts.map(p => [p[0] * sx, p[1] * sy]);

  /* Profil de côté (x avant, y haut) extrudé sur la largeur `depth` (axe Z) */
  function extrudeSide(pts, depth, bevel) {
    const b = bevel || 0;
    const g = new THREE.ExtrudeGeometry(shapeFrom(pts), { depth: Math.max(0.02, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -(depth - 2 * b) / 2);
    return g;
  }
  /* Forme vue de dessus (x avant, y latéral) extrudée vers le haut, base à y=0 */
  function extrudeTop(pts, h, bevel, holes) {
    const b = Math.min(bevel || 0, h * 0.45);
    const g = new THREE.ExtrudeGeometry(shapeFrom(pts, holes), { depth: Math.max(0.02, h - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: b > 0.08 ? 2 : 1, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, b, 0);
    return g;
  }

  /* Contours de tourelle (vue de dessus), centrés, longueur l (x) × largeur w */
  function turretOutline(kind, l, w) {
    const hl = l / 2, hw = w / 2;
    switch (kind) {
      case "hex": return [[hl, -w * .26], [l * .12, -hw], [-l * .36, -hw], [-hl, -w * .3], [-hl, w * .3], [-l * .36, hw], [l * .12, hw], [hl, w * .26]];
      case "angular": return [[hl, -w * .2], [l * .2, -hw], [-l * .34, -hw], [-hl, -w * .4], [-hl, w * .4], [-l * .34, hw], [l * .2, hw], [hl, w * .2]];
      case "wedge": return [[hl, -w * .12], [l * .04, -hw], [-l * .4, -hw], [-hl, -w * .4], [-hl, w * .4], [-l * .4, hw], [l * .04, hw], [hl, w * .12]];
      case "dome":
      case "oval": {
        const pts = [], n = 22;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          const front = c > 0 ? 1 - 0.18 * c : 1;
          pts.push([c * hl, s * hw * front]);
        }
        return pts;
      }
      case "tall":
      case "box":
      default: return [[-hl, -hw + w * .09], [-hl + w * .09, -hw], [hl - w * .1, -hw], [hl, -hw + w * .13], [hl, hw - w * .13], [hl - w * .1, hw], [-hl + w * .09, hw], [-hl, hw - w * .09]];
    }
  }

  /* ─────────────── Matériaux ─────────────── */
  function paintMaterial(opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.82, metalness: 0.12 }, opts || {}));
  }

  function assemblyStyle(profile) {
    return profile.assembly || (() => {
      switch (profile.key) {
        case "Panzer III Ausf. L": return "p3";
        case "T-28E": return "t28";
        case "Matilda Mk.II": return "matilda";
        case "M24 Chaffee": return "chaffee";
        case "T-34 (1941)": return "t34_41";
        case "KV-1 (ZiS 5)": return "kv1";
        case "KV-2 (ZiS 6)": return "kv2";
        case "IS-2 (1944)": return "is2";
        case "T-10A": return "t10";
        case "T-34 heavy tank": return "t34heavy";
        case "T-55A": return "t55";
        default: return "generic";
      }
    })();
  }

  /* ─────────────── Assemblage procédural ─────────────── */
  const geoCache = {};

  function buildProceduralParts(profile) {
    if (geoCache[profile.key]) return geoCache[profile.key];
    const P = profile, nat = NATIONS[P.nation].paint;
    const hullC = nat.hull, turC = nat.turret, accC = nat.accent;
    const DARK = 0x23262a, RUBBER = 0x1a1c1e, METAL = 0x3a3d40, GUNMETAL = 0x2c2f32, LIGHTMETAL = 0x55595d;
    const L = P.L, W = P.W, trackH = P.trackH;
    const tw = Math.min(0.66, Math.max(0.5, W * 0.17));           // largeur de chenille
    const hullW = W - 2 * tw * 0.92;                              // largeur de caisse entre chenilles
    const clear = Math.max(0.35, trackH * 0.42);
    const hullTop = P.hullTop;
    const gl = P.gl, noseY = P.nose || 0.8;
    const style = assemblyStyle(P);

    /* ── Caisse ── */
    const hull = new GeoBuilder(0);
    const hullPts = [
      [-L / 2 + 0.12, clear], [L / 2 - 0.5, clear], [L / 2 - 0.02, Math.max(noseY, clear + 0.1)],
      [L / 2 - gl, hullTop], [-L / 2 + 0.6, hullTop], [-L / 2 + 0.02, hullTop - 0.32]
    ];
    hull.add(extrudeSide(hullPts, hullW, P.round ? 0.2 : 0.06), hullC);
    switch (style) {
      case "p3":
        hull.box(-0.25, hullTop + 0.12, 0, 1.2, 0.18, hullW * 0.75, accC);
        hull.box(L / 2 - 0.72, hullTop - 0.12, 0, 0.44, 0.08, hullW * 0.86, accC);
        hull.box(L / 2 - 1.2, hullTop - 0.42, 0, 0.9, 0.1, hullW * 0.48, DARK);
        break;
      case "t28":
        hull.box(-0.5, hullTop + 0.1, 0, 1.8, 0.12, hullW * 0.82, accC);
        hull.box(0.5, hullTop + 0.24, 0, 1.2, 0.20, hullW * 0.66, DARK);
        hull.box(-L / 2 + 0.8, hullTop + 0.18, 0, 0.8, 0.1, hullW * 0.9, accC);
        break;
      case "matilda":
        hull.box(-0.05, hullTop + 0.18, 0, 2.2, 0.12, hullW * 0.9, accC);
        hull.box(L / 2 - 0.08, hullTop - 0.18, 0, 0.8, 0.18, hullW * 0.72, DARK);
        hull.box(-L / 2 + 1.2, hullTop + 0.06, 0, 0.7, 0.14, hullW * 0.98, accC);
        break;
      case "chaffee":
        hull.box(0.2, hullTop + 0.16, 0, 2.0, 0.18, hullW * 0.72, accC);
        hull.cyl(L / 2 - 0.8, hullTop - 0.15, 0, 0.18, 0.18, 0.7, "y", accC, 12);
        hull.box(-L / 2 + 0.8, hullTop + 0.12, 0, 1.0, 0.10, hullW * 0.78, DARK);
        break;
      case "stug":
        hull.box(0.3, hullTop + 0.22, 0, 1.65, 0.18, hullW * 0.82, accC);
        hull.box(-L / 2 + 0.9, hullTop + 0.1, 0, 0.95, 0.12, hullW * 0.9, DARK);
        hull.box(L / 2 - 0.85, hullTop - 0.25, 0, 0.45, 0.12, hullW * 0.76, accC);
        break;
      case "p4":
        hull.box(0.2, hullTop + 0.16, 0, 2.0, 0.16, hullW * 0.74, accC);
        hull.box(-L / 2 + 0.9, hullTop + 0.08, 0, 0.95, 0.12, hullW * 0.9, DARK);
        hull.box(L / 2 - 0.7, hullTop - 0.2, 0, 0.4, 0.10, hullW * 0.7, accC);
        break;
      case "panther":
        hull.box(0.1, hullTop + 0.12, 0, 2.25, 0.18, hullW * 0.78, accC);
        hull.box(-0.2, hullTop - 0.12, 0, 1.5, 0.12, hullW * 0.82, DARK);
        hull.box(L / 2 - 0.6, hullTop - 0.2, 0, 0.7, 0.12, hullW * 0.7, accC);
        break;
      case "tiger":
        hull.box(0.0, hullTop + 0.20, 0, 2.3, 0.18, hullW * 0.82, accC);
        hull.box(-L / 2 + 0.8, hullTop + 0.12, 0, 1.2, 0.12, hullW * 0.9, DARK);
        hull.box(L / 2 - 0.8, hullTop - 0.15, 0, 0.55, 0.12, hullW * 0.7, accC);
        break;
      case "kingtiger":
        hull.box(-0.2, hullTop + 0.18, 0, 2.4, 0.20, hullW * 0.84, accC);
        hull.box(-L / 2 + 1.2, hullTop + 0.12, 0, 1.0, 0.14, hullW * 0.96, DARK);
        hull.box(L / 2 - 0.9, hullTop - 0.18, 0, 0.6, 0.12, hullW * 0.72, accC);
        break;
      case "leopard1":
        hull.box(0.1, hullTop + 0.16, 0, 2.1, 0.14, hullW * 0.78, accC);
        hull.box(-L / 2 + 0.7, hullTop + 0.14, 0, 1.2, 0.10, hullW * 0.88, DARK);
        hull.box(L / 2 - 0.55, hullTop - 0.24, 0, 0.55, 0.12, hullW * 0.66, accC);
        break;
      case "t34_41":
        hull.box(-0.1, hullTop + 0.16, 0, 1.9, 0.18, hullW * 0.78, accC);
        hull.box(-L / 2 + 0.9, hullTop + 0.06, 0, 1.1, 0.10, hullW * 0.9, DARK);
        hull.box(L / 2 - 0.6, hullTop - 0.18, 0, 0.7, 0.12, hullW * 0.74, accC);
        break;
      case "kv1":
        hull.box(-0.2, hullTop + 0.20, 0, 2.15, 0.18, hullW * 0.82, accC);
        hull.box(-L / 2 + 1.0, hullTop + 0.08, 0, 1.15, 0.12, hullW * 0.92, DARK);
        hull.box(L / 2 - 0.85, hullTop - 0.22, 0, 0.5, 0.10, hullW * 0.70, accC);
        break;
      case "kv2":
        hull.box(-0.1, hullTop + 0.20, 0, 2.2, 0.22, hullW * 0.86, accC);
        hull.box(-L / 2 + 1.1, hullTop + 0.10, 0, 1.05, 0.15, hullW * 0.96, DARK);
        hull.box(L / 2 - 0.7, hullTop - 0.16, 0, 0.45, 0.12, hullW * 0.68, accC);
        break;
      case "is2":
        hull.box(-0.15, hullTop + 0.18, 0, 2.1, 0.18, hullW * 0.82, accC);
        hull.box(-L / 2 + 1.1, hullTop + 0.04, 0, 0.85, 0.12, hullW * 0.90, DARK);
        hull.box(L / 2 - 0.8, hullTop - 0.18, 0, 0.7, 0.12, hullW * 0.66, accC);
        break;
      case "t10":
        hull.box(-0.2, hullTop + 0.18, 0, 2.2, 0.20, hullW * 0.80, accC);
        hull.box(-L / 2 + 1.0, hullTop + 0.10, 0, 1.15, 0.12, hullW * 0.90, DARK);
        hull.box(L / 2 - 0.8, hullTop - 0.18, 0, 0.6, 0.12, hullW * 0.68, accC);
        break;
      case "t34heavy":
        hull.box(-0.1, hullTop + 0.18, 0, 2.1, 0.20, hullW * 0.82, accC);
        hull.box(-L / 2 + 0.9, hullTop + 0.05, 0, 1.2, 0.12, hullW * 0.92, DARK);
        hull.box(L / 2 - 0.7, hullTop - 0.18, 0, 0.6, 0.14, hullW * 0.74, accC);
        break;
      case "t55":
        hull.box(0.15, hullTop + 0.18, 0, 2.0, 0.15, hullW * 0.80, accC);
        hull.box(-L / 2 + 0.8, hullTop + 0.08, 0, 1.15, 0.10, hullW * 0.88, DARK);
        hull.box(L / 2 - 0.55, hullTop - 0.18, 0, 0.55, 0.12, hullW * 0.66, accC);
        break;
    }
    // Pont arrière (ventilation moteur) + grille
    hull.box(-L / 2 + 1.05, hullTop + 0.04, 0, 1.25, 0.1, hullW * 0.74, accC);
    hull.box(-L / 2 + 1.05, hullTop + 0.1, 0, 1.0, 0.03, hullW * 0.6, DARK);
    // Écoutilles pilote / radio
    const frontDeck = L / 2 - gl - 0.35;
    hull.cyl(frontDeck, hullTop + 0.06, hullW * 0.27, 0.2, 0.2, 0.1, "y", accC, 12);
    hull.cyl(frontDeck, hullTop + 0.06, -hullW * 0.27, 0.2, 0.2, 0.1, "y", accC, 12);
    // Fentes de visée + phares sur le glacis
    hull.box(L / 2 - gl * 0.48, hullTop - 0.16, hullW * 0.27, 0.1, 0.07, 0.34, DARK);
    hull.cyl(L / 2 - 0.12, Math.max(noseY, clear + 0.1) + 0.3, hullW * 0.42, 0.07, 0.07, 0.1, "x", LIGHTMETAL, 8);
    hull.cyl(L / 2 - 0.12, Math.max(noseY, clear + 0.1) + 0.3, -hullW * 0.42, 0.07, 0.07, 0.1, "x", LIGHTMETAL, 8);
    // Mitrailleuse de caisse
    hull.cyl(L / 2 - gl * 0.5 + 0.2, hullTop - 0.2, -hullW * 0.15, 0.025, 0.025, 0.55, "x", GUNMETAL, 6);
    // Échappements
    hull.cyl(-L / 2 - 0.02, hullTop - 0.55, hullW * 0.36, 0.07, 0.07, 0.34, "x", DARK, 8);
    hull.cyl(-L / 2 - 0.02, hullTop - 0.55, -hullW * 0.36, 0.07, 0.07, 0.34, "x", DARK, 8);
    // Remorquage / outils sur le pont arrière
    hull.box(-L / 2 + 0.75, hullTop + 0.12, hullW * 0.4, 0.55, 0.13, 0.2, accC);
    hull.cyl(L / 2 - gl - 0.1, hullTop + 0.06, hullW * 0.44, 0.045, 0.045, 0.9, "z", METAL, 6);
    // Bille de glacis / plaque avant supérieure
    if (P.log) hull.box(-L / 2 + 0.6, hullTop + 0.2, 0, 0.18, 0.18, hullW * 0.95, 0x4a3a28);
    if (P.multiTurret) {
      for (const s of [-1, 1]) {
        hull.cyl(L / 2 - gl - 0.1, hullTop + 0.27, s * hullW * 0.34, 0.42, 0.46, 0.5, "y", hullC, 14);
        hull.cyl(L / 2 - gl + 0.45, hullTop + 0.3, s * hullW * 0.34, 0.03, 0.03, 0.8, "x", GUNMETAL, 6);
      }
    }
    // Garde-boue
    if (P.fenders) {
      for (const s of [-1, 1]) {
        hull.box(0.0, trackH + 0.04, s * (hullW / 2 + tw * 0.5), L - 0.35, 0.06, tw + 0.14, hullC);
        hull.box(L / 2 - 0.15, trackH + 0.1, s * (hullW / 2 + tw * 0.5), 0.4, 0.05, tw + 0.14, hullC, 0);
      }
    }
    // Jupes latérales (Schürzen / blindages additionnels)
    if (P.skirts) {
      for (const s of [-1, 1]) hull.box(-0.1, trackH * 0.62 + 0.12, s * (W / 2 - 0.04), L - 1.5, trackH * 0.9, 0.06, accC);
      for (const s of [-1, 1]) hull.box(-0.1, trackH + 0.38, s * (W / 2 - 0.04), L - 1.5, 0.12, 0.08, hullC);
    }
    // Plaques de chenille lourdes (Churchill/Matilda) : flancs pleins
    if (P.slab) {
      for (const s of [-1, 1]) hull.box(0, trackH * 0.5 + 0.12, s * (W / 2 - 0.05), L - 1.0, trackH * 0.7, 0.06, accC);
    }

    /* ── Chenilles : structure fixe + roues (les patins sont animés) ── */
    const loopL = L - 0.3, rl = trackH * 0.5, straight = Math.max(0.5, loopL - 2 * rl);
    const trackStatic = new GeoBuilder(0);
    for (const s of [-1, 1]) {
      const zc = s * (hullW / 2 + tw * 0.48);
      // fond de chenille : plaque en stade (derrière les roues)
      const stadium = [];
      const N = 12;
      for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + (i / N) * Math.PI; stadium.push([straight / 2 + Math.cos(a) * (rl - 0.03), trackH / 2 + Math.sin(a) * (rl - 0.03)]); }
      for (let i = 0; i <= N; i++) { const a = Math.PI / 2 + (i / N) * Math.PI; stadium.push([-straight / 2 + Math.cos(a) * (rl - 0.03), trackH / 2 + Math.sin(a) * (rl - 0.03)]); }
      const plate = new THREE.ExtrudeGeometry(shapeFrom(stadium), { depth: 0.08, bevelEnabled: false });
      plate.translate(0, 0, zc - s * tw * 0.3);
      trackStatic.add(plate, 0x16181a);
      // roues de route
      const nW = Math.max(3, P.wheels || 6);
      const wr = rl * 0.9;
      for (let i = 0; i < nW; i++) {
        const x = -straight / 2 + (straight * i) / (nW - 1);
        const r = (i === 0 || i === nW - 1) ? rl * 0.93 : wr * (P.overlap ? 1.08 : 0.97);
        trackStatic.cyl(x, trackH / 2 - (r < rl * 0.93 ? rl * 0.05 : 0), zc + s * tw * 0.05, r * 0.98, r * 0.98, tw * 0.46, "z", RUBBER, 14);
        trackStatic.cyl(x, trackH / 2 - (r < rl * 0.93 ? rl * 0.05 : 0), zc + s * (tw * 0.05 + tw * 0.24), r * 0.62, r * 0.62, 0.03, "z", METAL, 12);
        trackStatic.cyl(x, trackH / 2 - (r < rl * 0.93 ? rl * 0.05 : 0), zc + s * (tw * 0.05 + tw * 0.27), r * 0.2, r * 0.2, 0.04, "z", LIGHTMETAL, 8);
      }
      // galets supérieurs
      if (!P.fenders && !P.slab) for (let i = 1; i < 4; i++) trackStatic.cyl(-straight / 2 + straight * i / 4, trackH * 0.93, zc + s * tw * 0.05, 0.09, 0.09, tw * 0.3, "z", METAL, 8);
    }

    /* ── Tourelle ── */
    const tu = P.tu;
    const turret = new GeoBuilder(P.hullTop);
    const tuBevel = tu.k === "dome" ? 0.28 : (tu.k === "oval" ? 0.16 : 0.07);
    const outline = turretOutline(tu.k === "tall" ? "box" : tu.k, tu.l - 2 * tuBevel * 0.9, tu.w - 2 * tuBevel * 0.9);
    if (P.casemate) {
      // La casemate fait partie de la caisse (immobile) ; seul le canon pivote.
      const cm = new GeoBuilder(0);
      const cl = tu.l, cw = tu.w;
      const cpts = [[-cl / 2, -cw / 2], [cl / 2 - 0.1, -cw * 0.4], [cl / 2 - 0.1, cw * 0.4], [-cl / 2, cw / 2]];
      cm.add(extrudeTop(scalePts(cpts, 1, 1), tu.h, 0.08).translate(tu.x, hullTop, 0), hullC);
      cm.cyl(tu.x - cl * 0.15, hullTop + tu.h + 0.04, cw * 0.18, 0.2, 0.2, 0.1, "y", accC, 10);
      cm.cyl(tu.x - cl * 0.15, hullTop + tu.h + 0.04, -cw * 0.18, 0.2, 0.2, 0.1, "y", accC, 10);
      hull.pos.push(...cm.pos); hull.nor.push(...cm.nor); hull.col.push(...cm.col);
    } else if (P.openTop) {
      const inner = scalePts(outline, 0.86, 0.86);
      turret.add(extrudeTop(outline, tu.h, 0.03, [inner]), hullC);
      turret.add(extrudeTop(inner, 0.1, 0), accC);
      // pare-brise / bouclier avant incliné
      turret.box(tu.l * 0.5 - 0.1, tu.h * 0.45, 0, 0.12, tu.h * 0.9, tu.w * 0.55, hullC);
      // anneau de mitrailleuse
      turret.cyl(-tu.l * 0.15, tu.h + 0.04, tu.w * 0.25, 0.28, 0.28, 0.06, "y", METAL, 12);
      turret.cyl(-tu.l * 0.15, tu.h + 0.18, tu.w * 0.25, 0.02, 0.02, 0.5, "x", GUNMETAL, 6);
    } else {
      turret.add(extrudeTop(outline, tu.h, tuBevel), turC);
      // Bustle / panier arrière
      if (tu.k !== "dome" && tu.k !== "tall") turret.box(-tu.l / 2 - 0.12, tu.h * 0.45, 0, 0.34, tu.h * 0.7, tu.w * 0.62, turC);
      if (tu.k === "tall") turret.box(0, tu.h + 0.02, 0, tu.l * 0.7, 0.06, tu.w * 0.7, accC);
      // Écoutille chef + coupole
      const cup = P.cupola || (tu.k === "dome" ? "right" : "right");
      if (cup !== "none") {
        const cz = cup === "left" ? -tu.w * 0.2 : cup === "center" ? 0 : tu.w * 0.2;
        const cx = -tu.l * 0.14;
        turret.cyl(cx, tu.h + 0.1, cz, 0.27, 0.3, 0.2, "y", turC, 14);
        turret.cyl(cx, tu.h + 0.22, cz, 0.22, 0.22, 0.04, "y", DARK, 14);
        turret.cyl(cx + 0.05, tu.h + 0.32, cz, 0.018, 0.018, 0.5, "x", GUNMETAL, 6);
      }
      // Écoutille chargeur
      turret.cyl(-tu.l * 0.26, tu.h + 0.05, -tu.w * 0.24, 0.2, 0.2, 0.09, "y", accC, 12);
      // Fumigènes / lance-grenades
      for (const s of [-1, 1]) turret.cyl(tu.l * 0.1, tu.h * 0.55, s * (tu.w / 2 + 0.03), 0.05, 0.05, 0.22, "z", METAL, 6);
      // Boîtes de rangement
      turret.box(-tu.l * 0.33, tu.h * 0.35, tu.w / 2 + 0.07, 0.5, 0.26, 0.14, accC);
      switch (style) {
        case "stug":
          turret.box(-tu.l * 0.12, tu.h * 0.55, 0, 0.8, 0.22, tu.w * 0.72, accC);
          turret.box(tu.l * 0.08, tu.h * 0.45, 0, 0.35, 0.18, tu.w * 0.48, DARK);
          break;
        case "p4":
          turret.box(-tu.l * 0.08, tu.h * 0.7, 0, 1.05, 0.28, tu.w * 0.76, accC);
          turret.box(tu.l * 0.18, tu.h * 0.3, 0, 0.4, 0.22, tu.w * 0.58, DARK);
          break;
        case "panther":
          turret.box(-tu.l * 0.18, tu.h * 0.72, 0, 1.25, 0.28, tu.w * 0.8, accC);
          turret.box(tu.l * 0.1, tu.h * 0.45, 0, 0.35, 0.18, tu.w * 0.54, DARK);
          break;
        case "tiger":
          turret.box(-tu.l * 0.10, tu.h * 0.74, 0, 1.12, 0.26, tu.w * 0.78, accC);
          turret.box(-tu.l * 0.28, tu.h * 0.35, 0, 0.45, 0.20, tu.w * 0.48, DARK);
          break;
        case "kingtiger":
          turret.box(-tu.l * 0.08, tu.h * 0.86, 0, 1.30, 0.32, tu.w * 0.86, accC);
          turret.box(-tu.l * 0.24, tu.h * 0.30, 0, 0.52, 0.22, tu.w * 0.52, DARK);
          break;
        case "leopard1":
          turret.box(-tu.l * 0.14, tu.h * 0.72, 0, 1.38, 0.22, tu.w * 0.78, accC);
          turret.box(tu.l * 0.12, tu.h * 0.42, 0, 0.28, 0.18, tu.w * 0.44, DARK);
          break;
      case "t34_41":
          turret.box(-tu.l * 0.10, tu.h * 0.62, 0, 1.12, 0.22, tu.w * 0.72, accC);
          turret.box(tu.l * 0.12, tu.h * 0.34, 0, 0.34, 0.18, tu.w * 0.46, DARK);
          break;
      case "kv1":
          turret.box(-tu.l * 0.16, tu.h * 0.78, 0, 1.22, 0.26, tu.w * 0.82, accC);
          turret.box(tu.l * 0.10, tu.h * 0.34, 0, 0.30, 0.18, tu.w * 0.48, DARK);
          break;
      case "kv2":
          turret.box(-tu.l * 0.08, tu.h * 0.90, 0, 1.55, 0.28, tu.w * 0.90, accC);
          turret.box(-tu.l * 0.26, tu.h * 0.35, 0, 0.42, 0.20, tu.w * 0.50, DARK);
          break;
      case "is2":
          turret.box(-tu.l * 0.12, tu.h * 0.72, 0, 1.25, 0.25, tu.w * 0.82, accC);
          turret.box(tu.l * 0.12, tu.h * 0.38, 0, 0.35, 0.18, tu.w * 0.46, DARK);
          break;
      case "t10":
          turret.box(-tu.l * 0.09, tu.h * 0.74, 0, 1.30, 0.26, tu.w * 0.82, accC);
          turret.box(tu.l * 0.10, tu.h * 0.38, 0, 0.32, 0.18, tu.w * 0.44, DARK);
          break;
      case "t34heavy":
          turret.box(-tu.l * 0.14, tu.h * 0.70, 0, 1.15, 0.24, tu.w * 0.80, accC);
          turret.box(tu.l * 0.12, tu.h * 0.36, 0, 0.30, 0.18, tu.w * 0.42, DARK);
          break;
      case "t55":
          turret.box(-tu.l * 0.12, tu.h * 0.60, 0, 1.25, 0.22, tu.w * 0.74, accC);
          turret.box(tu.l * 0.10, tu.h * 0.32, 0, 0.24, 0.16, tu.w * 0.40, DARK);
          break;
      }
    }
    // Lance-roquettes (Calliopé)
    if (P.rocket) {
      turret.box(-0.1, tu.h + 0.52, 0, 1.55, 0.78, 1.7, 0x3d4228);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) turret.cyl(0.7, tu.h + 0.28 + r * 0.25, -0.72 + c * 0.2, 0.07, 0.07, 0.08, "x", DARK, 8);
    }

    /* ── Canon ── */
    const gun = new GeoBuilder(P.hullTop + P.gunY);
    const gr = P.gun.r, gl2 = P.gun.len;
    const mant = P.mantlet || "round";
    if (mant === "round") gun.cyl(0.05, 0, 0, tu.h * 0.3, tu.h * 0.3, Math.min(tu.w * 0.5, 0.95), "z", turC, 16);
    else if (mant === "box") gun.box(0.08, 0, 0, 0.42, tu.h * 0.75, Math.min(tu.w * 0.55, 1.0), turC);
    else if (mant === "saukopf") { gun.box(0.12, 0, 0, 0.5, tu.h * 0.8, 0.8, turC); gun.cyl(0.38, 0, 0, tu.h * 0.34, tu.h * 0.2, 0.55, "z", turC, 14); }
    else gun.cyl(0.05, 0, 0, gr * 2.1, gr * 2.1, 0.5, "x", turC, 10);
    // tube
    gun.cyl(gl2 / 2 - 0.12, 0, 0, gr * 0.86, gr, gl2 + 0.24, "x", GUNMETAL, 14);
    if (P.gun.sleeve) gun.cyl(gl2 * 0.45, 0, 0, gr * 1.42, gr * 1.42, gl2 * 0.58, "x", 0x35383b, 14);
    if (P.gun.evac) gun.cyl(gl2 * 0.58, 0, 0, gr * 1.38, gr * 1.38, 0.5, "x", 0x35383b, 12);
    if (P.gun.brake === "double") { gun.cyl(gl2 - 0.22, 0, 0, gr * 1.9, gr * 1.9, 0.14, "x", 0x303335, 12); gun.cyl(gl2 - 0.05, 0, 0, gr * 1.9, gr * 1.9, 0.14, "x", 0x303335, 12); gun.cyl(gl2 - 0.14, 0, 0, gr * 1.35, gr * 1.35, 0.3, "x", 0x303335, 12); }
    else if (P.gun.brake === "single") gun.cyl(gl2 - 0.1, 0, 0, gr * 1.7, gr * 1.7, 0.26, "x", 0x303335, 12);
    else if (P.gun.brake === "tbrake") gun.box(gl2 - 0.12, 0, 0, 0.34, gr * 2.1, gr * 5.2, 0x303335);
    else gun.cyl(gl2 + 0.02, 0, 0, gr * 1.18, gr * 1.18, 0.1, "x", 0x303335, 12);
    switch (style) {
      case "stug":
      case "p4":
      case "panther":
      case "tiger":
      case "kingtiger":
      case "leopard1":
        gun.box(gl2 * 0.48, 0, 0, 0.22, gr * 2.8, gr * 3.8, 0x2d3033);
        break;
    }

    const parts = {
      profile: P, tw, hullW, trackStatic: trackStatic.build(), hull: hull.build(), turret: turret.pos.length ? turret.build() : null, gun: gun.build(),
      loop: { straight, rl, trackH, zc: hullW / 2 + tw * 0.48, tw }
    };
    geoCache[profile.key] = parts;
    return parts;
  }

  /* Position/orientation d'un patin le long de la boucle de chenille */
  function loopPoint(loop, s, out) {
    const { straight, rl, trackH } = loop;
    const arc = Math.PI * rl;
    const P = 2 * straight + 2 * arc;
    s = ((s % P) + P) % P;
    const yc = trackH / 2;
    if (s < straight) { out.x = -straight / 2 + s; out.y = yc - rl; out.a = 0; }
    else if (s < straight + arc) { const t = (s - straight) / rl; out.x = straight / 2 + Math.sin(t) * rl; out.y = yc - Math.cos(t) * rl; out.a = t; }
    else if (s < 2 * straight + arc) { out.x = straight / 2 - (s - straight - arc); out.y = yc + rl; out.a = Math.PI; }
    else { const t = (s - 2 * straight - arc) / rl; out.x = -straight / 2 - Math.sin(t) * rl; out.y = yc + Math.cos(t) * rl; out.a = Math.PI + t; }
    return out;
  }

  /* ─────────────── Instance de char ─────────────── */
  const TRACK_LINK = 0.17;
  const cleatGeo = new THREE.BoxGeometry(TRACK_LINK * 0.82, 0.07, 1);
  let sharedFlagGeo = null;

  class TankView {
    constructor(profile) {
      this.profile = profile;
      this.root = new THREE.Group();
      this.root.name = "tank:" + profile.key;
      this.turretPivot = new THREE.Group();
      this.gunPivot = new THREE.Group();
      this.barrel = new THREE.Group();
      this.muzzle = new THREE.Object3D();
      this.materials = [];
      this.tracks = [null, null];
      this.trackOffset = [0, 0];
      this.isModel = false;
      this.destroyed = false;
      this.flagMat = null;
      this.turretOffsetNominal = new THREE.Vector3();
      this._damageTilt = 0;
    }

    static fromProcedural(profile) {
      const v = new TankView(profile);
      const parts = buildProceduralParts(profile);
      const mk = () => { const m = paintMaterial(); v.materials.push(m); return m; };
      const hullMesh = new THREE.Mesh(parts.hull, mk());
      hullMesh.castShadow = true; hullMesh.receiveShadow = true;
      v.root.add(hullMesh);
      const trk = new THREE.Mesh(parts.trackStatic, mk());
      trk.castShadow = true; v.root.add(trk);

      // Patins animés (instanciés)
      const loop = parts.loop;
      const perim = 2 * loop.straight + 2 * Math.PI * loop.rl;
      const count = Math.max(24, Math.round(perim / TRACK_LINK));
      v.loop = loop; v.perim = perim; v.count = count;
      const cleatMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.9, metalness: 0.25 });
      v.materials.push(cleatMat);
      for (let side = 0; side < 2; side++) {
        const geo = cleatGeo.clone(); geo.scale(1, 1, loop.tw * 0.9);
        const im = new THREE.InstancedMesh(geo, cleatMat, count);
        im.frustumCulled = false; im.castShadow = false;
        const s = side === 0 ? -1 : 1;     // 0 = gauche (z-), 1 = droite (z+)
        im.position.set(0, 0, s * loop.zc);
        v.root.add(im);
        v.tracks[side] = im;
      }
      v.animateTracks(0, 0, true);

      // Tourelle
      v.turretPivot.position.set(profile.pivotX, profile.hullTop, 0);
      v.root.add(v.turretPivot);
      if (parts.turret) {
        const tm = new THREE.Mesh(parts.turret, mk());
        tm.castShadow = true; tm.receiveShadow = true;
        tm.position.set(profile.casemate ? 0 : 0, 0, 0);
        v.turretPivot.add(tm);
        v.turretMesh = tm;
      }
      v.gunPivot.position.set(profile.gunX, profile.gunY, 0);
      v.turretPivot.add(v.gunPivot);
      v.gunPivot.add(v.barrel);
      const gm = new THREE.Mesh(parts.gun, mk());
      gm.castShadow = true;
      v.barrel.add(gm);
      v.gunMesh = gm;
      v.muzzle.position.set(profile.gunLen, 0, 0);
      v.barrel.add(v.muzzle);
      v.hullMesh = hullMesh;

      // Antenne + fanion d'équipe
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 2.6, 5), new THREE.MeshBasicMaterial({ color: 0x15171a }));
      ant.position.set(-profile.L / 2 + 0.55, profile.hullTop + 1.3, profile.W * 0.28);
      v.root.add(ant);
      if (!sharedFlagGeo) { sharedFlagGeo = new THREE.PlaneGeometry(0.55, 0.32); sharedFlagGeo.translate(0.27, 0, 0); }
      v.flagMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(sharedFlagGeo, v.flagMat);
      flag.position.set(-profile.L / 2 + 0.55, profile.hullTop + 2.45, profile.W * 0.28);
      flag.rotation.y = Math.PI / 2; v.flag = flag;
      v.root.add(flag);
      return v;
    }

    /* Instance depuis un modèle 3D normalisé (cf. buildFromModel) */
    static fromModelTemplate(profile, tpl) {
      const v = new TankView(profile);
      v.isModel = true;
      const body = tpl.root.clone(true);
      // Clone des matériaux pour pouvoir teinter chaque char indépendamment
      body.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (Array.isArray(o.material)) o.material = o.material.map(m => { const c = m.clone(); v.materials.push(c); return c; });
          else if (o.material) { o.material = o.material.clone(); v.materials.push(o.material); }
        }
      });
      // Retrouver les nœuds par chemin d'indices (le clone garde la même structure)
      const find = path => path.reduce((n, i) => n && n.children[i], body);
      v.root.add(body);
      v.spinners = []; body.traverse(o => { if (o.userData && o.userData.spin !== undefined) v.spinners.push(o); });
      v.turretPivot = tpl.turretPath ? find(tpl.turretPath) : new THREE.Group();
      v.gunPivot = tpl.gunPath ? find(tpl.gunPath) : new THREE.Group();
      v.barrel = tpl.barrelPath ? find(tpl.barrelPath) : new THREE.Group();
      v.muzzle = tpl.muzzlePath ? find(tpl.muzzlePath) : new THREE.Object3D();
      v.turretRest = v.turretPivot.position.clone();
      v.barrelRest = v.barrel.position.clone();
      v.hasTurret = !!tpl.turretPath;
      v.modelInfo = tpl.info;
      // Fanion d'équipe
      if (!sharedFlagGeo) { sharedFlagGeo = new THREE.PlaneGeometry(0.55, 0.32); sharedFlagGeo.translate(0.27, 0, 0); }
      v.flagMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(sharedFlagGeo, v.flagMat);
      flag.position.set(-profile.L / 2 + 0.5, profile.totalHeight + 1.1, profile.W * 0.25);
      flag.rotation.y = Math.PI / 2;
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 1.3, 5), new THREE.MeshBasicMaterial({ color: 0x15171a }));
      ant.position.set(-profile.L / 2 + 0.5, profile.totalHeight + 0.5, profile.W * 0.25);
      v.root.add(ant); v.root.add(flag); v.flag = flag;
      return v;
    }

    setTeam(team) {
      const c = team === "A" ? 0x4db4ff : team === "B" ? 0xff5a44 : 0xd9d9d9;
      if (this.flagMat) this.flagMat.color.setHex(c);
    }

    /* Pose : x,z en mètres ; yawHull = rotation Y du châssis ; turretRel = lacet relatif tourelle ;
       elev = élévation canon (rad) ; recoil = recul en mètres */
    setPose(x, z, yawHull, turretRel, elev, recoil, gy, pitch, roll) {
      this.root.position.set(x, gy || 0, z);
      this.root.rotation.order = "YZX";
      this.root.rotation.set(roll || 0, yawHull, pitch || 0);
      if (this.destroyed) return;
      this.turretPivot.rotation.y = turretRel;
      this.gunPivot.rotation.z = elev;
      this.barrel.position.x = (this.barrelRest ? this.barrelRest.x : 0) - recoil;
    }

    /* Anime les patins : distG/distD = distance parcourue (m) par chaque chenille */
    animateTracks(distG, distD, force) {
      if (this.isModel && this.spinners && this.spinners.length) {      // roues des chars de l'Atelier
        if (this.trackBroken && this.trackBroken[0]) distG = 0; if (this.trackBroken && this.trackBroken[1]) distD = 0;
        for (const w of this.spinners) w.rotation.z -= (w.userData.spin ? distD : distG) / (w.userData.r || 0.4);
        return;
      }
      if (this.isModel || !this.loop) return;
      const d = [distG, distD];
      const tmp = { x: 0, y: 0, a: 0 };
      for (let side = 0; side < 2; side++) {
        if (!force && Math.abs(d[side]) < 1e-5) continue;
        this.trackOffset[side] += this.trackBroken && this.trackBroken[side] ? 0 : d[side];
        const im = this.tracks[side], off = this.trackOffset[side];
        for (let i = 0; i < this.count; i++) {
          loopPoint(this.loop, off + (i * this.perim) / this.count, tmp);
          TMP_M.makeRotationZ(tmp.a);
          TMP_M.setPosition(tmp.x, tmp.y, 0);
          im.setMatrixAt(i, TMP_M);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    }

    setTrackBroken(left, right) { this.trackBroken = [left, right]; }

    setDestroyed(flag) {
      if (flag === this.destroyed) return;
      this.destroyed = flag;
      for (const m of this.materials) {
        if (!m.color) continue;
        if (flag) { m.userData._c = m.color.getHex(); m.color.multiplyScalar(0.28); }
        else if (m.userData._c !== undefined) { m.color.setHex(m.userData._c); }
      }
      if (flag) {
        // Tourelle arrachée / de travers, canon qui retombe
        this.turretPivot.rotation.y += (Math.random() - 0.5) * 1.4;
        this.turretPivot.position.y += 0.25; this.turretPivot.rotation.z = 0.12 + Math.random() * 0.1;
        this.gunPivot.rotation.z = -0.12;
        this.barrel.position.x = 0;
      } else {
        this.turretPivot.position.y = this.isModel ? this.turretRest.y : this.profile.hullTop;
        this.turretPivot.rotation.z = 0;
      }
      if (this.flagMat) this.flagMat.visible = !flag;
    }

    setVisible(v) { this.root.visible = v; }
    setShadow(on) { this.root.traverse(o => { if (o.isMesh && o.userData.noShadowToggle !== true) o.castShadow = on && !o.isInstancedMesh; }); }

    dispose() {
      this.root.traverse(o => { if (o.isInstancedMesh) { o.dispose(); } });
      for (const m of this.materials) m.dispose();
    }
  }

  /* ─────────────── Modèles fournis (GLB/OBJ) ─────────────── */
  const modelState = {};   // key → {status: 'loading'|'ready'|'failed', tpl, callbacks:[]}

  const FORWARD_YAW = { "+x": 0, "-x": Math.PI, "+z": Math.PI / 2, "-z": -Math.PI / 2 };  // rotation Y pour amener l'avant sur +X
  const NAME_TURRET = /(turret|tourelle|tower|tour\b|cupola_?base)/i;
  const NAME_GUN = /(gun|barrel|canon|cannon|tube|mantlet)/i;
  const NAME_BARREL_ONLY = /(barrel|tube|canon|cannon|gun_?barrel)/i;

  function bboxOf(obj, exclude) {
    obj.updateMatrixWorld(true);
    if (!exclude) return new THREE.Box3().setFromObject(obj);
    const box = new THREE.Box3();
    obj.traverse(o => {
      if (!o.isMesh) return;
      for (let p = o; p; p = p.parent) if (p === exclude) return;
      box.expandByObject(o);
    });
    return box;
  }

  /* Normalise un modèle chargé : orientation, échelle, centrage, détection
     de la tourelle / du canon, pivots. Retourne un "template" cloneable. */
  function buildFromModel(profile, loaded, cfg) {
    cfg = cfg || {};
    const wrapper = new THREE.Group();
    const model = loaded;
    wrapper.add(model);

    // 1) Orientation
    const fw = (cfg.forward || "+x").toLowerCase();
    model.rotation.y = (FORWARD_YAW[fw] !== undefined ? FORWARD_YAW[fw] : 0) + (cfg.yaw ? THREE.MathUtils.degToRad(cfg.yaw) : 0);
    if (cfg.flipX) model.scale.x *= -1;
    wrapper.updateMatrixWorld(true);

    // 2) Détection des parties
    const nodes = [];
    model.traverse(o => { if (o !== model) nodes.push(o); });
    const byName = (name) => name ? nodes.find(o => o.name === name) : null;
    let turretNode = byName(cfg.turret) || null, gunNode = byName(cfg.gun) || null;
    if (!turretNode && cfg.turret !== false) turretNode = nodes.find(o => NAME_TURRET.test(o.name) && !NAME_BARREL_ONLY.test(o.name)) || null;
    if (!gunNode && cfg.gun !== false) {
      // le canon : préférer un nœud dédié sous la tourelle, sinon n'importe où
      const pool = [];
      if (turretNode) turretNode.traverse(o => { if (o !== turretNode) pool.push(o); });
      const pickGun = list => list.find(o => NAME_BARREL_ONLY.test(o.name)) || list.find(o => NAME_GUN.test(o.name)) || null;
      gunNode = pickGun(pool) || pickGun(nodes);
      if (gunNode === turretNode) gunNode = null;
    }

    // 3) Échelle : longueur de coque visée (hors canon si identifié)
    let sizeBox;
    sizeBox = bboxOf(wrapper, gunNode);
    const size = sizeBox.getSize(new THREE.Vector3());
    let target = profile.L + (gunNode ? 0 : profile.gunLen * 0.45);
    let scale = cfg.scale || (size.x > 1e-6 ? target / size.x : 1);
    model.scale.multiplyScalar(scale);
    wrapper.updateMatrixWorld(true);

    // 4) Recentrage : centre X/Z de la caisse (hors canon), base posée sur y=0
    let box;
    box = bboxOf(wrapper, gunNode);
    const ctr = box.getCenter(new THREE.Vector3());
    model.position.x -= ctr.x - (cfg.offsetX || 0);
    model.position.z -= ctr.z - (cfg.offsetZ || 0);
    model.position.y -= box.min.y - (cfg.offsetY || 0);
    wrapper.updateMatrixWorld(true);

    // 5) Séparation tourelle/canon avec pivots propres
    const root = new THREE.Group();
    root.add(wrapper);
    const info = { forward: fw, scale, turret: turretNode && turretNode.name, gun: gunNode && gunNode.name, bbox: size.toArray(), length: size.x * scale };
    const tpl = { root, info };

    function reparent(node, pivotWorld) {
      // Place `node` sous un nouveau Group (pivot) situé en pivotWorld, sans bouger visuellement
      const pivot = new THREE.Group();
      root.add(pivot);
      root.updateMatrixWorld(true);
      const wm = node.matrixWorld.clone();
      pivot.parent.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(pivot.parent.matrixWorld).invert();
      pivot.position.copy(pivotWorld.clone().applyMatrix4(inv));
      pivot.updateMatrixWorld(true);
      pivot.attach(node);
      return pivot;
    }
    function localCenter(obj) { const b = bboxOf(obj); return b.getCenter(new THREE.Vector3()); }

    if (turretNode) {
      const tb = bboxOf(turretNode);
      let pivotW = cfg.turretPivot ? new THREE.Vector3(...cfg.turretPivot) : new THREE.Vector3((tb.min.x + tb.max.x) / 2, tb.min.y, (tb.min.z + tb.max.z) / 2);
      if (cfg.turretPivot) pivotW.applyMatrix4(root.matrixWorld);
      // Le canon, s'il est hors de la tourelle dans le modèle, doit la suivre
      const tPivot = reparent(turretNode, pivotW);
      tpl.turretPivotRef = tPivot;
      if (gunNode && !turretNode.getObjectById(gunNode.id) && gunNode.parent !== tPivot) { tPivot.attach(gunNode); }
    }
    if (gunNode) {
      const gb = bboxOf(gunNode);
      const parentPivot = tpl.turretPivotRef || root;
      // Pivot de tangage : à l'arrière du tube (côté culasse), à hauteur du centre du tube
      let pw = cfg.gunPivot ? new THREE.Vector3(...cfg.gunPivot).applyMatrix4(root.matrixWorld) : new THREE.Vector3(gb.min.x + (gb.max.x - gb.min.x) * 0.06, (gb.min.y + gb.max.y) / 2, (gb.min.z + gb.max.z) / 2);
      if (cfg.gunPivot === undefined) {
        // si le tube est long et fin, la culasse est à l'arrière ; sinon (mantelet inclus) viser le centre du bloc
        const lenX = gb.max.x - gb.min.x;
        if (lenX < profile.gunLen * 0.6) pw.x = (gb.min.x + gb.max.x) / 2;
      }
      const gp = new THREE.Group();
      parentPivot.add(gp);
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(gp.parent.matrixWorld).invert();
      gp.position.copy(pw.clone().applyMatrix4(inv));
      gp.updateMatrixWorld(true);
      const barrel = new THREE.Group();
      gp.add(barrel); barrel.updateMatrixWorld(true);
      barrel.attach(gunNode);
      const muzzle = new THREE.Object3D();
      barrel.add(muzzle);
      // bouche : extrémité avant du volume du canon dans le repère du pivot
      root.updateMatrixWorld(true);
      const gb2 = bboxOf(gunNode);
      const tip = new THREE.Vector3(gb2.max.x, (gb2.min.y + gb2.max.y) / 2, (gb2.min.z + gb2.max.z) / 2);
      muzzle.position.copy(barrel.worldToLocal(tip.clone()));
      tpl.gunPivotRef = gp; tpl.barrelRef = barrel; tpl.muzzleRef = muzzle;
      info.muzzleLocal = muzzle.position.toArray();
    } else {
      // Pas de canon séparé : pivots fictifs (le char tire depuis la position nominale du catalogue)
      const gp = new THREE.Group(), barrel = new THREE.Group(), muzzle = new THREE.Object3D();
      const holder = tpl.turretPivotRef || root;
      holder.add(gp); gp.add(barrel); barrel.add(muzzle);
      gp.position.set(profile.gunX, profile.gunY, 0);
      muzzle.position.set(profile.gunLen, 0, 0);
      tpl.gunPivotRef = gp; tpl.barrelRef = barrel; tpl.muzzleRef = muzzle;
      info.noSeparateGun = true;
    }
    // Chemins d'indices (pour retrouver les nœuds dans les clones)
    const pathOf = (node) => { const p = []; let n = node; while (n && n !== root) { p.unshift(n.parent.children.indexOf(n)); n = n.parent; } return p; };
    tpl.turretPath = tpl.turretPivotRef ? pathOf(tpl.turretPivotRef) : null;
    tpl.gunPath = pathOf(tpl.gunPivotRef);
    tpl.barrelPath = pathOf(tpl.barrelRef);
    tpl.muzzlePath = pathOf(tpl.muzzleRef);
    root.updateMatrixWorld(true);
    // Si le canon est séparé, mémoriser ses vraies cotes pour le moteur de tir
    if (gunNode && tpl.turretPivotRef) {
      const tp = tpl.turretPivotRef;
      info.pivotX = tp.getWorldPosition(new THREE.Vector3()).x;
      const gp = tpl.gunPivotRef.getWorldPosition(new THREE.Vector3());
      info.gunX = gp.x - info.pivotX; info.gunY = gp.y - tp.getWorldPosition(new THREE.Vector3()).y;
      const mz = tpl.muzzleRef.getWorldPosition(new THREE.Vector3());
      info.gunLen = Math.abs(mz.x - gp.x);
    }
    return tpl;
  }

  /* Charge (une fois) le modèle déclaré dans le manifeste pour ce char.
     Retourne une Promise<boolean> : true si un modèle a été chargé. */
  function loadModelFor(key) {
    // Char dessiné dans l'Atelier (editor.html) et activé pour ce véhicule : prioritaire
    const dsg = global.TankDesigns && global.TankDesigns.activeFor(key);
    if (dsg) {
      const st0 = modelState[key];
      if (st0 && st0.designId === dsg.id + ":" + dsg.updated) return st0.promise;
      try {
        const profile = getTankProfile(key), tpl = global.TankDesigns.template(profile, dsg);
        if (tpl) {
          const i = tpl.info; profile.pivotX = i.pivotX; profile.gunX = i.gunX; profile.gunY = i.gunY; profile.gunLen = i.gunLen;
          modelState[key] = { status: "ready", tpl, designId: dsg.id + ":" + dsg.updated, promise: Promise.resolve(true) };
          console.log("[TankModels] char de l'Atelier :", key, dsg.name, i);
          return modelState[key].promise;
        }
      } catch (e) { console.warn("[TankModels] design invalide", key, e); }
    }
    const man = (global.TANK_MODEL_MANIFEST || {})[key];
    if (!man || !man.file) return Promise.resolve(false);
    const st = modelState[key];
    if (st) return st.promise;
    const entry = modelState[key] = { status: "loading" };
    const profile = getTankProfile(key);
    entry.promise = (global.ModelLoaders ? global.ModelLoaders.load(man.file, man) : Promise.reject(new Error("model-loaders.js absent")))
      .then(obj => {
        entry.tpl = buildFromModel(profile, obj, man);
        entry.status = "ready";
        // Aligne le moteur de tir sur les vraies cotes du modèle
        const i = entry.tpl.info;
        if (!i.noSeparateGun && i.gunLen) { profile.pivotX = i.pivotX; profile.gunX = i.gunX; profile.gunY = i.gunY; profile.gunLen = i.gunLen; }
        console.log("[TankModels] modèle chargé :", key, man.file, i);
        return true;
      })
      .catch(err => { entry.status = "failed"; entry.error = err; console.warn("[TankModels] échec du modèle", key, man.file, err && err.message || err); return false; });
    return entry.promise;
  }

  function create(key) {
    const profile = getTankProfile(key);
    const st = modelState[key];
    if (st && st.status === "ready") return TankView.fromModelTemplate(profile, st.tpl);
    return TankView.fromProcedural(profile);
  }
  function hasRealModel(key) { const s = modelState[key]; return !!(s && s.status === "ready"); }
  function modelStatus(key) { const s = modelState[key]; return s ? s.status : ((global.TANK_MODEL_MANIFEST || {})[key] ? "pending" : "procedural"); }

  global.TankModels = { create, loadModelFor, hasRealModel, modelStatus, buildFromModel, TankView, loopPoint };
})(typeof window !== "undefined" ? window : globalThis);
