/* ==========================================================================
   ARENA-DAMAGE.JS — Dégâts internes « à la War Thunder ».

   Principe : un obus qui perce le blindage continue dans le char. Chaque char
   possède des MODULES INTERNES en 3D (équipage, moteur, boîte, réservoirs,
   soutes, culasse, bague de tourelle) placés d'après ses dimensions réelles.
     • Tir plein (AP, APCR, APDS, APCBC, APBC) : le projectile traverse les
       modules sur sa trajectoire en perdant de l'énergie à chacun, puis
       ressort ou s'arrête ; des éclats de blindage (spall) partent de la face
       d'entrée.
     • Obus explosif à fusée (APHE) : la fusée ne s'arme que si la plaque est
       assez épaisse, puis explose après un retard (distance parcourue).
       S'il ressort avant, il explose DEHORS : aucun dégât interne.
     • HE : explose à l'entrée, éclats dans toutes les directions.
     • HEAT : jet étroit qui perce les modules alignés + éclats de revêtement.
   Les éclats sont des rayons : ils s'arrêtent sur le premier module « dense »
   rencontré (un équipier ou le moteur protègent ce qui est derrière).
   Conséquences : équipage hors de combat, moteur/boîte/culasse/tourelle
   dégradés ou détruits, incendie (extincteur automatique, une seule fois),
   détonation de soute (destruction immédiate, probabilité selon le
   remplissage). Un char est perdu s'il reste ≤ 1 membre d'équipage.
   ========================================================================== */
console.log("[TankArena] chargement : arena-damage.js");

const Dmg = (function () {
  const D = {};
  const ROLE_FR = { commander: "Chef de char", gunner: "Tireur", loader: "Chargeur", driver: "Pilote", radio: "Radio" };
  const COL = { ok: "#5fd38a", dmg: "#ffb000", dead: "#ff5a44", line: "rgba(190,215,230,.55)" };
  const SOLID = ["AP", "APCR", "APDS", "APCBC", "APBC", "APHE_nofuze"];
  const rnd = Math.random;

  /* ───── Équipier assis, vu de côté : tête, buste, haut des jambes (cuisses), bas des jambes ─────
     Repère du module (x avant, y haut, z latéral). Dimensions en mètres, mises à l'échelle si la place manque. */
  const PART = {
    head:  { fr: "tête",            lethal: true },
    torso: { fr: "buste",           lethal: true },
    thigh: { fr: "haut des jambes", wound: 0.6, frag: 0.45 },
    shin:  { fr: "bas des jambes",  wound: 0.35, frag: 0.3 }
  };
  const PART_RANK = { head: 3, torso: 2, thigh: 1, shin: 0 };
  function crewParts(cx, cz, headTop, floor) {
    const sc = clamp((headTop - floor) / 1.25, 0.62, 1), q = v => v * sc;
    const hd = q(0.23), nk = q(0.03), to = q(0.52), tk = q(0.15);
    const x0 = cx - q(0.14);                                                      // torse légèrement en arrière du point d'assise
    const torsoTop = headTop - hd - nk, thighTop = torsoTop - to + tk * 0.45, kneeY = thighTop - tk * 0.9;
    const shinH = Math.max(0.12, Math.min(q(0.42), kneeY - floor));
    const P = [
      { n: "head",  c: [x0 + q(0.02), headTop - hd / 2, cz], h: [q(0.10), hd / 2, q(0.095)] },
      { n: "torso", c: [x0, torsoTop - to / 2, cz],          h: [q(0.13), to / 2, q(0.2)] },
      { n: "thigh", c: [x0 + q(0.22), thighTop - tk / 2, cz], h: [q(0.27), tk / 2, q(0.18)] },
      { n: "shin",  c: [x0 + q(0.46), kneeY - shinH / 2, cz], h: [q(0.075), shinH / 2, q(0.16)] }
    ];
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const p of P) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.c[i] - p.h[i]); hi[i] = Math.max(hi[i], p.c[i] + p.h[i]); }
    return { parts: P, c: lo.map((v, i) => (v + hi[i]) / 2), h: lo.map((v, i) => (hi[i] - v) / 2) };
  }

  /* ───── Construction des modules d'un char ───── */
  D.build = function (tank) {
    const P = tank.profile, tu = P.tu, H = P.hullTop, L = P.L, W = P.W, mods = [];
    const y0 = Math.max(0.25, (P.trackH || 0.5) * 0.5), hh = Math.max(0.3, H - y0);
    const mk = (id, kind, label, frame, c, h, o = {}) => {
      const entry = Object.assign({
        id, kind, label, frame, c, h: h.map(v => Math.max(0.08, v)), hp: 1,
        dense: true, res: 10, shape: "box", vuln: 1, present: true, role: null
      }, o);
      entry.h = entry.h.map(v => Math.max(0.08, v));
      if (entry.present === false) entry.hp = 0;
      mods.push(entry);
      return entry;
    };

    const hullHalf = { x: L * 0.5, y: Math.max(0.6, H * 0.55), z: W * 0.5 };
    const turretHalf = { x: tu.l * 0.5, y: Math.max(0.45, tu.h * 0.55), z: tu.w * 0.5 };

    // — Coque —
    mk("engine", "engine", "Moteur", "h", [-L * 0.28, y0 + hh * 0.42, 0], [L * 0.14, hh * 0.42, W * 0.28], { res: 30, dense: true, vuln: 1.15, shape: "box" });
    mk("trans", "trans", "Transmission", "h", [L * 0.34, y0 + hh * 0.3, 0], [L * 0.09, hh * 0.3, W * 0.2], { res: 35, dense: true, vuln: 1.0, shape: "box" });
    mk("fuelL", "fuel", "Réservoir G", "h", [-L * 0.02, y0 + hh * 0.25, -W * 0.36], [L * 0.12, hh * 0.25, W * 0.07], { res: 4, dense: false, vuln: 1.6, shape: "box" });
    mk("fuelR", "fuel", "Réservoir D", "h", [-L * 0.02, y0 + hh * 0.25, W * 0.36], [L * 0.12, hh * 0.25, W * 0.07], { res: 4, dense: false, vuln: 1.6, shape: "box" });
    const bh = Math.min(0.42, hh * 0.42);
    const hullHead = Math.min(H - 0.08, y0 + hh * 0.55 + bh);
    const crew = (id, role, frame, cx, cz, headTop, floor, vuln) => {
      const g = crewParts(cx, cz, headTop, floor);
      return mk(id, "crew", ROLE_FR[role], frame, g.c, g.h, { role, res: 6, vuln, shape: "box", parts: g.parts });
    };
    if (tank.modules.crew.driver) crew("driver", "driver", "h", L * 0.3, -W * 0.22, hullHead, y0, 1.8);
    if (tank.modules.crew.radio) crew("radio", "radio", "h", L * 0.3, W * 0.22, hullHead, y0, 1.6);
    if (!P.casemate) {
      mk("rackH", "ammo", "Soute coque", "h", [L * 0.1, y0 + hh * 0.22, W * 0.3], [L * 0.07, hh * 0.22, W * 0.07], { res: 8, dense: false, vuln: 2.4, shape: "box" });
      mk("rackH2", "ammo", "Soute coque", "h", [L * 0.1, y0 + hh * 0.22, -W * 0.3], [L * 0.07, hh * 0.22, W * 0.07], { res: 8, dense: false, vuln: 2.4, shape: "box" });
    }

    // — Tourelle —
    const tl = tu.l, tw = tu.w, th = tu.h, cb = Math.min(0.45, th * 0.5);
    const tHead = th * 0.35 + cb, tFloor = y0 - H;                       // repère tourelle : y = 0 au toit de la caisse
    if (tank.modules.crew.gunner) crew("gunner", "gunner", "t", tl * 0.02, -tw * 0.24, tHead, tFloor, 1.9);
    if (tank.modules.crew.loader) crew("loader", "loader", "t", tl * 0.02, tw * 0.24, tHead, tFloor, 1.9);
    if (tank.modules.crew.commander) crew("commander", "commander", "t", -tl * 0.22, tw * 0.2, tHead, tFloor, 1.9);
    mk("breech", "breech", "Culasse", "t", [tl * 0.05, P.gunY, 0], [tl * 0.14, Math.min(0.2, th * 0.18), Math.min(0.18, tw * 0.12)], { res: 25, dense: true, vuln: 1.2, shape: "cylinder" });
    mk("ring", "ring", "Entraînement de tourelle", "t", [0, 0.06, 0], [tl * 0.38, 0.1, tw * 0.38], { res: 8, dense: false, vuln: 1.4, shape: "ring" });
    if (P.casemate) {
      mk("rackT", "ammo", "Soute", "t", [-tl * 0.34, th * 0.25, tw * 0.28], [tl * 0.08, th * 0.22, tw * 0.1], { res: 8, dense: false, vuln: 2.1, shape: "box" });
      mk("rackT2", "ammo", "Soute", "t", [-tl * 0.34, th * 0.25, -tw * 0.28], [tl * 0.08, th * 0.22, tw * 0.1], { res: 8, dense: false, vuln: 2.1, shape: "box" });
    } else mk("rackT", "ammo", "Soute tourelle", "t", [-tl * 0.34, th * 0.3, 0], [tl * 0.1, th * 0.25, tw * 0.28], { res: 8, dense: false, vuln: 2.2, shape: "box" });

    // — modules d’appoint pour stabilité / surcoût —
    mk("stabilizer", "ring", "Stabilisateur", "t", [0, th * 0.12, 0], [tl * 0.18, 0.12, tw * 0.18], { res: 12, dense: false, vuln: 1.3, shape: "cylinder" });
    mk("vision", "ring", "Periscope / optique", "h", [L * 0.05, H * 0.8, 0], [0.18, 0.16, W * 0.1], { res: 4, dense: false, vuln: 1.5, shape: "box" });
    mk("battery", "engine", "Batterie", "h", [-L * 0.11, y0 + hh * 0.62, 0], [L * 0.08, hh * 0.14, W * 0.18], { res: 6, dense: false, vuln: 1.2, shape: "box" });

    return { mods, fill: 1, fire: null, extinguisher: 1, reloadMult: 1, xray: null, byId: Object.fromEntries(mods.map(m => [m.id, m])) };
  };

  /* ───── Géométrie : repères coque / tourelle ───── */
  function relYawOf(t) { return t.profile.casemate ? 0 : wrapAngle(t.alphaTurret - (t.alphaTank - Math.PI / 2)); }
  function toT(P, ry, p) { const cr = Math.cos(ry), sr = Math.sin(ry), u = p.x - P.pivotX; return { x: u * cr + p.z * sr - (P.tu.x - P.pivotX), y: p.y - P.hullTop, z: -u * sr + p.z * cr }; }
  function dirT(ry, d) { const cr = Math.cos(ry), sr = Math.sin(ry); return { x: d.x * cr + d.z * sr, y: d.y, z: -d.x * sr + d.z * cr }; }
  function fromT(P, ry, q) { const cr = Math.cos(ry), sr = Math.sin(ry), u = q.x + (P.tu.x - P.pivotX); return { x: P.pivotX + u * cr - q.z * sr, y: q.y + P.hullTop, z: u * sr + q.z * cr }; }
  function slab(o, d, c, h, mg) {
    let t0 = -1e9, t1 = 1e9;
    for (const a of ["x", "y", "z"]) {
      const lo = c[a] - h[a] - mg, hi = c[a] + h[a] + mg;
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return null; continue; }
      let a0 = (lo - o[a]) / d[a], a1 = (hi - o[a]) / d[a]; if (a0 > a1) { const k = a0; a0 = a1; a1 = k; }
      if (a0 > t0) t0 = a0; if (a1 < t1) t1 = a1; if (t0 > t1) return null;
    }
    return [t0, t1];
  }
    function frameCtx(tank) { return { P: tank.profile, ry: relYawOf(tank) }; }
  /* Modules rencontrés par un rayon (repère coque), triés. */
  function trace(tank, fc, o, d, maxT, mg) {
    const P = fc.P, ot = toT(P, fc.ry, o), dt = dirT(fc.ry, d), out = [];
    for (const m of tank.int.mods) {
      const oo = m.frame === "h" ? o : ot, dd = m.frame === "h" ? d : dt;
      if (!m.parts) {
        const r = slab(oo, dd, { x: m.c[0], y: m.c[1], z: m.c[2] }, { x: m.h[0], y: m.h[1], z: m.h[2] }, mg || 0);
        if (r && r[1] > 0 && r[0] < maxT) out.push({ m, t0: Math.max(0, r[0]), t1: r[1], part: null });
        continue;
      }
      let t0 = 1e9, t1 = -1e9, part = null;                                      // forme composée : on garde la partie la plus vitale touchée
      for (const pt of m.parts) {
        const r = slab(oo, dd, { x: pt.c[0], y: pt.c[1], z: pt.c[2] }, { x: pt.h[0], y: pt.h[1], z: pt.h[2] }, mg || 0);
        if (!r || r[1] <= 0 || r[0] >= maxT) continue;
        t0 = Math.min(t0, r[0]); t1 = Math.max(t1, r[1]);
        if (!part || PART_RANK[pt.n] > PART_RANK[part]) part = pt.n;
      }
      if (part) out.push({ m, t0: Math.max(0, t0), t1, part });
    }
    return out.sort((a, b) => a.t0 - b.t0);
  }
  /* Distance de sortie de l'enveloppe du char (caisse ∪ tourelle) depuis un point intérieur. */
  function envExit(tank, fc, o, d) {
    const P = fc.P; let best = 0;
    const r1 = slab(o, d, { x: 0, y: P.hullTop / 2, z: 0 }, { x: P.L / 2, y: P.hullTop / 2, z: P.W / 2 }, 0); if (r1) best = Math.max(best, r1[1]);
    const r2 = slab(toT(P, fc.ry, o), dirT(fc.ry, d), { x: 0, y: P.tu.h / 2, z: 0 }, { x: P.tu.l / 2, y: P.tu.h / 2, z: P.tu.w / 2 }, 0); if (r2) best = Math.max(best, r2[1]);
    return best;
  }
  const add = (o, d, t) => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });
  function randCone(d, half) {
    const a = rnd() * Math.PI * 2, r = Math.tan(half) * Math.sqrt(rnd());
    let u = Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let s = { x: d.y * u.z - d.z * u.y, y: d.z * u.x - d.x * u.z, z: d.x * u.y - d.y * u.x }; const sl = Math.hypot(s.x, s.y, s.z) || 1; s = { x: s.x / sl, y: s.y / sl, z: s.z / sl };
    const w = { x: d.y * s.z - d.z * s.y, y: d.z * s.x - d.x * s.z, z: d.x * s.y - d.y * s.x };
    const v = { x: d.x + (s.x * Math.cos(a) + w.x * Math.sin(a)) * r, y: d.y + (s.y * Math.cos(a) + w.y * Math.sin(a)) * r, z: d.z + (s.z * Math.cos(a) + w.z * Math.sin(a)) * r };
    const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l };
  }
  function randSphere(fwd, bias) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); let v = { x: r * Math.cos(a), y: z, z: r * Math.sin(a) };
    if (fwd && v.x * fwd.x + v.y * fwd.y + v.z * fwd.z < -0.2 && rnd() < bias) v = { x: -v.x, y: -v.y, z: -v.z };
    return v;
  }

  /* ───── Effets d'un impact sur un module ───── */
  function hurt(ctx, m, amount) {
    if (m.hp <= 0) return; m.hp = Math.max(0, m.hp - amount); ctx.touched.add(m);
  }
  function killMod(ctx, m) { if (m.hp > 0) { m.hp = 0; ctx.touched.add(m); } }
  /* Équipier touché : tête et buste sont mortels ; les jambes blessent (deux touches = hors de combat, un gros calibre tue) */
  function crewHit(ctx, m, part, how, e) {
    if (m.hp <= 0) return;
    const R = PART[part] || PART.torso; ctx.touched.add(m);
    if (R.lethal || how === "jet" || (how === "solid" && (ctx.cal || 0) >= 85)) { m.lastPart = R.fr; killMod(ctx, m); return; }
    if (how === "frag") {
      const pr = ((0.28 + 0.65 * e) / Math.max(0.6, m.vuln || 1)) * R.frag;
      if (rnd() < pr) { m.lastPart = R.fr; hurt(ctx, m, R.wound * (0.6 + 0.6 * e)); }
      return;
    }
    m.lastPart = R.fr; hurt(ctx, m, R.wound);
  }
  function ignite(ctx) { ctx.ignited = true; }
  function rackBoom(ctx, p) { if (rnd() < ctx.fill * p) ctx.detonated = true; }
  /* Éclat d'énergie e (0..1) sur un module */
  function fragHit(ctx, m, e, part) {
    const vuln = Math.max(0.6, m.vuln || 1);
    switch (m.kind) {
      case "crew":
        if (!m.parts) { if (m.hp > 0 && rnd() < (0.28 + 0.65 * e) / vuln) killMod(ctx, m); else ctx.touched.add(m); }
        else if (part === "head" || part === "torso") { if (m.hp > 0 && rnd() < (0.28 + 0.65 * e) / vuln) { m.lastPart = PART[part].fr; killMod(ctx, m); } else ctx.touched.add(m); }
        else crewHit(ctx, m, part, "frag", e);
        break;
      case "engine": hurt(ctx, m, (0.05 + 0.1 * e) * vuln); if (rnd() < 0.012 * e * vuln) ignite(ctx); break;
      case "trans": hurt(ctx, m, (0.04 + 0.08 * e) * vuln); break;
      case "fuel": hurt(ctx, m, (0.08 * e + 0.02) * vuln); if (rnd() < 0.008 + 0.02 * e * vuln) ignite(ctx); break;
      case "ammo": hurt(ctx, m, 0.05 * vuln); rackBoom(ctx, 0.025 + 0.07 * e * vuln); break;
      case "breech": hurt(ctx, m, (0.03 + 0.06 * e) * vuln); break;
      case "ring": hurt(ctx, m, 0.04 * e * vuln); break;
    }
  }
  /* Projectile plein d'énergie E (mm équivalents d'acier) sur un module : renvoie l'énergie restante */
  function solidHit(ctx, m, E, part) {
    const vuln = Math.max(0.6, m.vuln || 1);
    switch (m.kind) {
      case "crew": { const lethal = !m.parts || part === "head" || part === "torso"; crewHit(ctx, m, part || "torso", "solid", 1); return E - m.res * vuln * (lethal ? 0.85 : 0.35); }
      case "engine": { const f = clamp(E / (m.res * vuln), 0.25, 1.4); hurt(ctx, m, f * 0.75); if (rnd() < 0.12 * Math.min(1, f) * vuln) ignite(ctx); return E - m.res * 0.6 * vuln; }
      case "trans": { const f = clamp(E / (m.res * vuln), 0.25, 1.4); hurt(ctx, m, f * 0.75); return E - m.res * 0.6 * vuln; }
      case "fuel": hurt(ctx, m, 0.7 * vuln); if (rnd() < 0.22 * vuln) ignite(ctx); return E - m.res * vuln;
      case "ammo": hurt(ctx, m, 0.5 * vuln); rackBoom(ctx, 0.55 * vuln); return E - m.res * vuln;
      case "breech": hurt(ctx, m, clamp(E / 60, 0.3, 1.2) * 0.9 * vuln); return E - m.res * vuln;
      case "ring": hurt(ctx, m, 0.5 * vuln); return E - m.res * vuln;
    }
    return E;
  }
  /* Parcours d'un projectile plein de t=0 jusqu'à tmax. Renvoie {t (où il s'arrête), E} */
  function walkSolid(ctx, o, d, E, tmax) {
    const hits = trace(ctx.tank, ctx.fc, o, d, tmax, 0.02);
    let t = tmax, e = E;
    for (const h of hits) {
      if (h.t0 > tmax) break;
      e = solidHit(ctx, h.m, e, h.part); if (ctx.detonated) { t = h.t0; break; }
      if (e <= 0) { t = h.t1; break; }
    }
    return { t, E: e };
  }
  /* Un éclat : rayon depuis o, portée range, énergie e. Renvoie le segment dessiné. */
  function fragment(ctx, o, d, range, e) {
    const lim0 = Math.min(range, envExit(ctx.tank, ctx.fc, o, d) || range);
    let lim = lim0;
    for (const h of trace(ctx.tank, ctx.fc, o, d, lim0, 0)) {
      if (h.t0 > lim) break;
      fragHit(ctx, h.m, e, h.part);
      if (h.m.dense) { lim = h.t0 + 0.04; break; }
    }
    ctx.segs.push({ a: o, b: add(o, d, lim), k: "frag" });
  }
  function burst(ctx, p, n, range, fwd, bias, cone) {
    for (let i = 0; i < n; i++) {
      const d = cone ? randCone(fwd, cone) : randSphere(fwd, bias);
      fragment(ctx, p, d, range * (0.7 + rnd() * 0.5), 0.35 + rnd() * 0.65);
    }
  }
  function kindOf(shell) {
    const t = shell.type;
    const fuze = shell.hasFuze === undefined ? (shell.fuze === true) : (shell.hasFuze === true);
    if (t === "HEAT") return "heat"; if (t === "HE" || t === "shrapnel") return "he";
    if (t === "APHE") return fuze ? "aphe" : "solid";
    if ((t === "APCBC" || t === "APBC") && fuze) return "aphe";
    return "solid";
  }

  /* ───── Résolution complète d'une perforation ─────
     info.entryH / info.dirH : point et direction d'entrée (repère coque, mètres). */
  D.penetrate = function (tank, shell, info, res) {
    const I = tank.int; if (!I) return null;
    const fc = frameCtx(tank), cal = shell.caliber || 75;
    const ctx = { tank, fc, cal, touched: new Set(), segs: [], fill: I.fill, ignited: false, detonated: false, notes: [] };
    const before = I.mods.map(m => m.hp);
    const d = info.dirH, o0 = add(info.entryH, d, -0.04);
    const kind = kindOf(shell), pen = res.pen || 0, eff = Math.max(1, res.effective || info.baseArmor);
    const ratio = clamp(pen / eff, 0.6, 2.2);
    let entry = add(o0, d, 0.06), endPt = entry, outcome = "pen";
    const tEnv = envExit(tank, fc, entry, d) || 1.2;

    if (res.outcome === "spall") {
      burst(ctx, entry, 4 + Math.round(cal * 0.04), 1.4, d, 0, 0.5);
      ctx.notes.push("Éclats de blindage"); outcome = "spall";
    } else if (kind === "heat") {
      const jetLen = clamp((pen - eff) / Math.max(1, pen), 0.15, 1) * 3 + 0.3;
      const hits = trace(tank, fc, entry, d, jetLen, 0.07);
      let stop = jetLen;
      for (const h of hits) {
        const m = h.m;
        if (m.kind === "crew") crewHit(ctx, m, h.part || "torso", "jet", 1);
        else if (m.kind === "ammo") { hurt(ctx, m, 0.6); rackBoom(ctx, 0.8); }
        else if (m.kind === "fuel") { hurt(ctx, m, 0.7); if (rnd() < 0.3) ignite(ctx); }
        else if (m.kind === "engine") { hurt(ctx, m, 0.8); if (rnd() < 0.12) ignite(ctx); }
        else hurt(ctx, m, 0.8);
        if (ctx.detonated) { stop = h.t0; break; }
      }
      ctx.segs.push({ a: entry, b: add(entry, d, Math.min(stop, tEnv + 0.3)), k: "path" });
      endPt = add(entry, d, Math.min(stop, tEnv));
      burst(ctx, entry, 14, 2.6, d, 0, 0.26); burst(ctx, entry, 10, 1.8, d, 0, 0.8);
      ctx.notes.push("Jet de charge creuse");
    } else if (kind === "he") {
      const p = add(entry, d, 0.08); endPt = p;
      burst(ctx, p, 22 + Math.round(cal * 0.7), 2.5 + cal * 0.03, d, 0.85, 0);
      ctx.notes.push("Explosion interne");
    } else if (kind === "aphe") {
      const armed = info.baseArmor >= Math.max(8, cal * 0.14);
      let E = res.outcome === "overmatch" ? pen * 0.3 + cal * 0.15 : Math.max(0, pen - eff) + cal * 0.15;
      if (!armed) {
        const w = walkSolid(ctx, entry, d, E, tEnv); ctx.segs.push({ a: entry, b: add(entry, d, Math.min(w.t, tEnv)), k: "path" });
        endPt = add(entry, d, Math.min(w.t, tEnv)); ctx.notes.push("Fusée non armée : obus plein"); burst(ctx, entry, 3 + Math.round(cal * 0.05), 1.6, d, 0, 0.45);
      } else {
        const delay = 0.45 + 0.4 * clamp(ratio, 0.6, 2);          // distance de fonctionnement de la fusée (m)
        const w = walkSolid(ctx, entry, d, E, Math.min(delay, tEnv + 0.2));
        const stopT = Math.min(w.t, delay);
        ctx.segs.push({ a: entry, b: add(entry, d, Math.min(stopT, tEnv)), k: "path" });
        if (!ctx.detonated && delay > tEnv && w.E > 0) {
          ctx.notes.push("Obus ressorti avant l'explosion"); endPt = add(entry, d, tEnv);
          const exit = add(entry, d, tEnv + 0.05); ctx.exit = exit;
        } else {
          const p = add(entry, d, Math.min(stopT, tEnv)); endPt = p; ctx.burstAt = p;
          burst(ctx, p, 16 + Math.round(cal * 0.5), 2.2 + cal * 0.025, d, 0.6, 0);
          ctx.notes.push("Explosion interne");
        }
      }
      burst(ctx, entry, 3, 1.2, d, 0, 0.5);
    } else {
      let E = res.outcome === "overmatch" ? pen * 0.3 + cal * 0.15 : Math.max(0, pen - eff) + cal * 0.15;
      const w = walkSolid(ctx, entry, d, E, tEnv);
      const stopT = Math.min(w.t, tEnv); ctx.segs.push({ a: entry, b: add(entry, d, stopT), k: "path" });
      endPt = add(entry, d, stopT);
      if (!ctx.detonated && w.E > 0 && w.t >= tEnv - 1e-3) { ctx.notes.push("Obus traversant"); ctx.exit = add(entry, d, tEnv + 0.05); }
      burst(ctx, entry, 3 + Math.round(cal * 0.08 * Math.min(2, ratio)), 2.0, d, 0, 0.44);
    }

    // — Conséquences —
    const changes = [];
    I.mods.forEach((m, i) => { if (m.hp < before[i]) changes.push({ m, from: before[i], to: m.hp }); });
    if (ctx.ignited && !I.fire) D.startFire(tank);
    D.sync(tank);
    const rep = { tank, outcome, kind, pen, eff, shell: shell.type, zone: info.faceName, entry, endPt, exit: ctx.exit || null, segs: ctx.segs, changes, notes: ctx.notes, detonated: ctx.detonated, fire: ctx.ignited, t: performance.now(), faceHit: info.entryH };
    D.tracers(tank, ctx.segs, ctx.exit);
    return { rep, detonated: ctx.detonated };
  };

  /* Impact sans perforation (ricochet / arrêté) : rapport seulement */
  D.noPen = function (tank, shell, info, outcome, res) {
    return { tank, outcome, kind: kindOf(shell), pen: res.pen, eff: res.effective, shell: shell.type, zone: info.faceName, entry: info.entryH, endPt: info.entryH, segs: [], changes: [], notes: [], t: performance.now(), faceHit: info.entryH };
  };

  /* ───── Synchronisation avec l'état de jeu du char ───── */
  D.sync = function (tank) {
    const I = tank.int; if (!I) return; const M = I.byId;
    for (const m of I.mods) if (m.kind === "crew") tank.modules.crew[m.role] = m.hp > 0;
    const driverOk = !M.driver || M.driver.hp > 0;
    tank.modules.canon = M.breech.hp > 0;
    I.reloadMult = 1 + (1 - M.breech.hp) * 0.8;
    const eng = M.engine.hp, tr = M.trans.hp;
    tank.engineHealth = tr <= 0 ? 0 : Math.round(100 * Math.min(eng, 0.3 + 0.7 * tr));
    tank.modules.engine = driverOk && eng > 0 && tr > 0;
    if (!driverOk) tank.engineHealth = 0;
    const ringMult = M.ring.hp <= 0 ? 0.2 : M.ring.hp < 1 ? 0.6 : 1;
    tank.turretSpeedMult = (M.gunner.hp > 0 ? 1 : 0.15) * ringMult * (M.gunner.hp > 0 ? 0.65 + 0.35 * M.gunner.hp : 1);
    if (M.loader && M.loader.hp > 0 && M.loader.hp < 1) I.reloadMult += (1 - M.loader.hp) * 0.6;   // chargeur blessé : rechargement plus lent
  };
  D.crewAlive = tank => tank.int.mods.filter(m => m.kind === "crew" && m.hp > 0).length;
  D.crewTotal = tank => tank.int.mods.filter(m => m.kind === "crew").length;

  /* ───── Incendie ───── */
  D.startFire = function (tank) {
    const I = tank.int; if (I.fire) return;
    I.fire = { t: 0, tried: false };
    tank._ev("fire", "Incendie !");
  };
  D.tick = function (tank) {
    const I = tank.int; if (!I || !I.fire || tank.destroyed) return;
    const f = I.fire; f.t++;
    if (f.t === 150 && I.extinguisher > 0) {
      I.extinguisher--;
      if (rnd() < 0.8) { I.fire = null; tank._ev("fire-out", "Extincteur : incendie maîtrisé"); return; }
      tank._ev("fire", "Extincteur sans effet");
    }
    if (f.t % 60 === 0) {
      const eng = I.byId.engine; eng.hp = Math.max(0, eng.hp - 0.08);
      if (f.t > 360 && rnd() < 0.35) { const alive = I.mods.filter(m => m.kind === "crew" && m.hp > 0); if (alive.length) { const v = alive[Math.floor(rnd() * alive.length)]; v.hp = 0; tank._ev("crew", v.label + " : brûlé"); } }
      D.sync(tank); D.afterDamage(tank);
    }
    if (f.t > 20 * 60 && !tank.destroyed) { tank._ev("killed"); tank._destroyTank(); }
  };
  /* Destruction par perte d'équipage */
  D.afterDamage = function (tank) {
    if (tank.destroyed) return;
    const alive = D.crewAlive(tank);
    if (alive <= 1) { tank._ev("killed"); tank._destroyTank(); }
  };

  /* ───── Réparation (touche R à l'arrêt) : renvoie un texte ou null ───── */
  D.repairStep = function (tank) {
    const I = tank.int, order = ["trans", "engine", "breech", "ring"];
    for (const id of order) {
      const m = I.byId[id];
      if (m.hp < 1) { m.hp = m.hp <= 0 ? 0.5 : Math.min(1, m.hp + 0.35); D.sync(tank); return m.label + (m.hp >= 1 ? " réparé" : " remis en état partiel"); }
    }
    return null;
  };

  /* ───── Traceurs 3D (trajectoire interne + éclats) ───── */
  const tr = []; let scene = null;
  function worldPt(tank, p) { const s = Math.sin(tank.alphaTank), c = Math.cos(tank.alphaTank); return [tank.x * PX + p.x * s + p.z * c, p.y + (tank.gz || 0) * PX, tank.y * PX - p.x * c + p.z * s]; }
  D.tracers = function (tank, segs, exit) {
    scene = World.S.scene; if (!segs.length) return;
    const pos = [], col = [];
    for (const sg of segs) {
      const a = worldPt(tank, sg.a), b = worldPt(tank, sg.b), c = sg.k === "path" ? [1, 0.85, 0.35] : [1, 0.55, 0.2];
      pos.push(...a, ...b); col.push(...c, ...c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthTest: false, fog: false });
    const ln = new THREE.LineSegments(g, mat); ln.renderOrder = 998; ln.frustumCulled = false; scene.add(ln); tr.push({ ln, life: 2.2 });
  };

  /* ───── Vue radiographique 3D (modules translucides sur le char touché) ───── */
  const BOXG = new THREE.BoxGeometry(1, 1, 1);
  const stCol = m => m.hp <= 0 ? 0xff5a44 : m.hp < 0.999 ? 0xffb000 : 0x5fd38a;
  D.showXray = function (tank, seconds) {
    const I = tank.int; if (!I) return; D.hideXray(tank);
    const root = new THREE.Group(), hullG = new THREE.Group(), turG = new THREE.Group(); root.add(hullG); hullG.add(turG);
    const items = [];
    for (const m0 of I.mods) for (const m of (m0.parts ? m0.parts.map(pt => ({ shape: "box", kind: m0.kind, frame: m0.frame, c: pt.c, h: pt.h, _m: m0 })) : [m0])) {
      const base = m.shape === "cylinder" ? new THREE.CylinderGeometry(0.5, 0.5, 1, 12) : m.shape === "ring" ? new THREE.TorusGeometry(0.7, 0.12, 8, 24) : new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(base, new THREE.MeshBasicMaterial({ color: stCol(m), transparent: true, opacity: m.kind === "ring" ? 0.12 : 0.42, depthTest: false, fog: false }));
      mesh.scale.set(m.h[0] * 2, m.h[1] * 2, m.h[2] * 2);
      if (m.shape === "cylinder") mesh.rotation.z = Math.PI / 2;
      if (m.shape === "ring") mesh.rotation.x = Math.PI / 2;
      mesh.renderOrder = 997; mesh.frustumCulled = false;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(base), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, fog: false })); edge.renderOrder = 997; mesh.add(edge);
      if (m.frame === "h") { mesh.position.set(m.c[0], m.c[1], m.c[2]); hullG.add(mesh); } else { mesh.position.set(m.c[0] + (tank.profile.tu.x - tank.profile.pivotX), m.c[1], m.c[2]); turG.add(mesh); }
      items.push({ m: m._m || m, mesh });
    }
    World.S.scene.add(root); I.xray = { root, hullG, turG, items, life: seconds || 8 };
  };
  D.hideXray = function (tank) {
    const x = tank.int && tank.int.xray; if (!x) return;
    World.S.scene.remove(x.root);
    x.items.forEach(i => {
      // EdgesGeometry est construite à partir de base : il faut libérer les deux géométries.
      const edge = i.mesh.children && i.mesh.children[0];
      if (edge) { edge.geometry.dispose(); edge.material.dispose(); }
      i.mesh.geometry.dispose(); i.mesh.material.dispose();
    });
    tank.int.xray = null;
  };
  D.update = function (dt) {
    for (let i = tr.length - 1; i >= 0; i--) { const t = tr[i]; t.life -= dt; t.ln.material.opacity = clamp(t.life / 1.2, 0, 1); if (t.life <= 0) { World.S.scene.remove(t.ln); t.ln.geometry.dispose(); t.ln.material.dispose(); tr.splice(i, 1); } }
    for (const it of items) if (it instanceof Tank && it.int && it.int.xray) {
      const x = it.int.xray; x.life -= dt; if (x.life <= 0 || it.destroyed && x.life < 5) { D.hideXray(it); continue; }
      const P = it.profile, ry = relYawOf(it);
      x.root.position.set(it.x * PX, 0, it.y * PX); x.hullG.rotation.y = Math.PI / 2 - it.alphaTank;
      x.turG.position.set(P.pivotX, P.hullTop, 0); x.turG.rotation.y = -ry;
      for (const i of x.items) i.mesh.material.color.setHex(stCol(i.m));
    }
  };

  /* ───── Schéma 2D (vue de dessus) : état des modules, impact, trajectoire ───── */
  D.drawTank = function (ctx, w, h, tank, rep) {
    ctx.clearRect(0, 0, w, h);
    const P = tank.profile, I = tank.int; if (!I) return;
    const s = Math.min((w - 10) / (P.W + 0.8), (h - 16) / (P.L + 0.8)), cx = w / 2, cy = h / 2;
    const X = (lz) => cx + lz * s, Y = (lx) => cy - lx * s;
    // chenilles + caisse
    ctx.lineWidth = 1.2; ctx.strokeStyle = COL.line; ctx.fillStyle = "rgba(255,255,255,.06)";
    const tw = Math.min(0.5, P.W * 0.16);
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.rect(X(sg * (P.W / 2 + tw * 0.2) - tw / 2), Y(P.L / 2), tw * s, P.L * s); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.rect(X(-P.W / 2 + tw * 0.4), Y(P.L / 2), (P.W - tw * 0.8) * s, P.L * s); ctx.fill(); ctx.stroke();
    if (!tank.modules.trackLeft) { ctx.strokeStyle = COL.dead; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(-P.W / 2 - tw * 0.2), Y(P.L / 2)); ctx.lineTo(X(-P.W / 2 - tw * 0.2), Y(-P.L / 2)); ctx.stroke(); }
    if (!tank.modules.trackRight) { ctx.strokeStyle = COL.dead; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(P.W / 2 + tw * 0.2), Y(P.L / 2)); ctx.lineTo(X(P.W / 2 + tw * 0.2), Y(-P.L / 2)); ctx.stroke(); }
    const box = (m, tx, tz, rot) => {
      const c = m.hp <= 0 ? COL.dead : m.hp < 0.999 ? COL.dmg : COL.ok;
      ctx.save(); ctx.translate(X(tz), Y(tx)); if (rot) ctx.rotate(rot);
      const shape = m.shape || "box";
      if (m.kind === "crew") {
        if (m.parts) {
          ctx.globalAlpha = m.hp > 0 ? 0.9 : 0.55; ctx.fillStyle = c; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1;
          for (const pt of m.parts) {
            const px = (pt.c[2] - m.c[2]) * s, py = -(pt.c[0] - m.c[0]) * s, hw = Math.max(1.2, pt.h[2] * s), hl = Math.max(1.2, pt.h[0] * s);
            if (pt.n === "head") { ctx.beginPath(); ctx.arc(px, py, Math.max(2.2, pt.h[2] * s), 0, 6.283); ctx.fill(); ctx.stroke(); }
            else { ctx.fillRect(px - hw, py - hl, hw * 2, hl * 2); ctx.strokeRect(px - hw, py - hl, hw * 2, hl * 2); }
          }
          ctx.globalAlpha = 1; ctx.fillStyle = "#0b0f12"; ctx.font = "700 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(m.hp > 0 ? m.role[0].toUpperCase() : "✕", 0, 0.5);
        } else {
        ctx.beginPath(); ctx.arc(0, 0, Math.max(3.5, 0.26 * s), 0, 6.283); ctx.fillStyle = c; ctx.globalAlpha = m.hp > 0 ? 0.9 : 0.55; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.stroke(); ctx.fillStyle = "#0b0f12"; ctx.font = "700 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(m.hp > 0 ? m.role[0].toUpperCase() : "✕", 0, 0.5);
        }
      } else if (shape === "cylinder") {
        const r = Math.max(3.2, (m.h[2] || 0.24) * s * 1.2);
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.6, 0, 0, 6.283); ctx.fillStyle = c; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
      } else if (shape === "ring") {
        const r = Math.max(4, (m.h[0] || 0.32) * s * 1.5);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
      } else {
        const bw = m.h[2] * 2, bl = m.h[0] * 2; ctx.globalAlpha = 0.7; ctx.fillStyle = c; ctx.fillRect(-bw * s / 2, -bl * s / 2, bw * s, bl * s); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = m.hp <= 0 ? COL.dead : "rgba(0,0,0,.5)"; ctx.strokeRect(-bw * s / 2, -bl * s / 2, bw * s, bl * s); if (m.hp <= 0) { ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-bw * s / 2, -bl * s / 2); ctx.lineTo(bw * s / 2, bl * s / 2); ctx.moveTo(bw * s / 2, -bl * s / 2); ctx.lineTo(-bw * s / 2, bl * s / 2); ctx.stroke(); }
      }
      ctx.restore();
    };
    for (const m of I.mods) if (m.frame === "h") box(m, m.c[0], m.c[2], 0);
    // tourelle (tournée)
    const ry = relYawOf(tank), tu = P.tu, cr = Math.cos(ry), sr = Math.sin(ry);
    const tcx = P.pivotX + (tu.x - P.pivotX) * cr, tcz = (tu.x - P.pivotX) * sr;
    ctx.save(); ctx.translate(X(tcz), Y(tcx)); ctx.rotate(ry);
    ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.strokeStyle = COL.line; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.rect(-tu.w * s / 2, -tu.l * s / 2, tu.w * s, tu.l * s); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = Math.max(2, 0.12 * s); ctx.beginPath(); ctx.moveTo(0, -tu.l * s / 2); ctx.lineTo(0, -(tu.l / 2 + Math.max(P.gunLen * 0.55, 1)) * s); ctx.stroke();
    ctx.restore();
    for (const m of I.mods) if (m.frame === "t") {
      const u = m.c[0] + (tu.x - P.pivotX), px = P.pivotX + u * cr - m.c[2] * sr, pz = u * sr + m.c[2] * cr; box(m, px, pz, ry);
    }
    if (I.fire) { ctx.fillStyle = "#ff7a30"; ctx.font = "700 11px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("🔥 INCENDIE", 4, 3); }
    // trajectoire de l'impact
    if (rep) {
      const pt = p => [X(p.z), Y(p.x)];
      for (const sg of rep.segs) { const a = pt(sg.a), b = pt(sg.b); ctx.strokeStyle = sg.k === "path" ? "#ffe58a" : "rgba(255,150,60,.55)"; ctx.lineWidth = sg.k === "path" ? 2.2 : 0.8; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      if (rep.entry) { const e = pt(rep.entry); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e[0], e[1], 4, 0, 6.283); ctx.fill(); ctx.stroke(); }
      if (rep.exit) { const e = pt(rep.exit); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e[0] - 4, e[1] - 4); ctx.lineTo(e[0] + 4, e[1] + 4); ctx.moveTo(e[0] + 4, e[1] - 4); ctx.lineTo(e[0] - 4, e[1] + 4); ctx.stroke(); }
    }
  };
  D.stateText = m => (m.hp <= 0 ? (m.kind === "crew" ? "hors de combat" : "détruit") : m.hp < 0.999 ? (m.kind === "crew" ? "blessé" : "endommagé") : "intact") + (m.kind === "crew" && m.lastPart && m.hp < 0.999 ? " (" + m.lastPart + ")" : "");
  D.COL = COL;
  return D;
})();
