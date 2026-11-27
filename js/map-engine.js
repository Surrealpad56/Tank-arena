/* ==========================================================================
   MAP-ENGINE.JS — Moteur de cartes. Chaque carte (voir map-defs.js) décrit un
   THÉÂTRE D'OPÉRATIONS avec des éléments cohérents : fleuves, routes, ponts,
   villes, champs, forêts, reliefs… Le moteur transforme cette description en :
     • obstacles de collision (bâtiments, murs, haies, rochers),
     • zones d'eau (infranchissables ou ralentissantes), forêts, clairières,
     • instructions de dessin pour la texture du sol (terrain-gen.js),
     • points de capture et zones d'apparition.
   Tout est déterministe (graine fixe par carte). Aucune ressource externe.
   ========================================================================== */
const MAPS = {};
const MAP_W = 12000, MAP_H = 12000;
/* Les cartes sont écrites dans un repère de 8000 × 8500 ; le moteur place tout en 12000 × 12000
   (positions et étendues mises à l'échelle, tailles d'objets inchangées → plus de bâtiments, plus de champs). */
const MAP_SX = MAP_W / 8000, MAP_SY = MAP_H / 8500, MAP_SR = Math.sqrt(MAP_SX * MAP_SY);

const PX_M = 1 / 18; /* mètres par pixel */
const MapEngine = (function () {
  const cache = {};
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function vnoise(seed) { const r = rng(seed), a = []; for (let i = 0; i < 128; i++) a.push(r() * 2 - 1); return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return a[i & 127] * (1 - u) + a[(i + 1) & 127] * u; }; }

  function vnoise2(seed) { const r = rng(seed), a = new Float32Array(4096); for (let i = 0; i < 4096; i++) a[i] = r() * 2 - 1; const g = (i, j) => a[(j & 63) * 64 + (i & 63)];
    return (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v; }; }

  /* Courbe de Catmull-Rom échantillonnée tous les `step` px, avec ondulation latérale optionnelle. */
  function dense(pts, step, wob, nz) {
    const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2], len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.ceil(len / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t, f = j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push({ x: f(0), y: f(1) });
      }
    }
    const l = pts[pts.length - 1]; out.push({ x: l[0], y: l[1] });
    if (wob) for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, off = nz(i * 0.05) * wob;
      out[i].x += -dy / d * off; out[i].y += dx / d * off;
    }
    return out;
  }

  function build(id) {
    const M = MAPS[id], R = rng(M.seed || 7), nz = vnoise((M.seed || 7) * 31 + 5);
    const sp = M.spawn || {}, SA = sp.A ? [sp.A[0] * MAP_SX, sp.A[1] * MAP_SY] : [700, MAP_H / 2], SB = sp.B ? [sp.B[0] * MAP_SX, sp.B[1] * MAP_SY] : [MAP_W - 700, MAP_H / 2];
    const L = { id, M, ops: [], obs: [], roads: [], rivers: [], lakes: [], pools: [], bridges: [], forests: [], clears: [], zones: [], sea: null, island: null,
      caps: (M.caps || []).map((c, i) => ({ id: "cp" + i, x: Math.round(c[0] * MAP_SX), y: Math.round(c[1] * MAP_SY), label: c[2], radius: c[3] || 260, team: null, progress: 0, owner: null })),
      spawn: { A: SA, B: SB }, rel: [], bridgeDecks: [] };
    const R2 = (a, b) => a + R() * (b - a);
    /* ───── Tests de place ───── */
    function inLand(x, y, m) {
      if (L.island) { const I = L.island, dx = (x - I.cx) / I.rx, dy = (y - I.cy) / I.ry, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx); return d <= I.f(th) - m / Math.min(I.rx, I.ry); }
      if (L.sea) { const c = L.sea.coast(L.sea.side === "N" || L.sea.side === "S" ? x : y); const v = L.sea.side === "N" ? y - c : L.sea.side === "S" ? c - y : L.sea.side === "W" ? x - c : c - x; return v > m; }
      return true;
    }
    L.inLand = inLand;
    function inBridge(x, y, pad) { for (const b of L.bridges) if (Math.abs(x - b.x) <= (b.dir === "h" ? b.len : b.w) / 2 + pad && Math.abs(y - b.y) <= (b.dir === "h" ? b.w : b.len) / 2 + pad) return true; return false; }
    L.inBridge = inBridge;
    /* index spatial par tracé (cases de 128 px) : évite de balayer tous les points d'un fleuve ou d'une route */
    function mkIdx(pts) { const g = new Map(); for (const p of pts) { const R = p.r + 170, i0 = Math.floor((p.x - R) / 128), i1 = Math.floor((p.x + R) / 128), j0 = Math.floor((p.y - R) / 128), j1 = Math.floor((p.y + R) / 128); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * 4096 + i; let a = g.get(k); if (!a) g.set(k, a = []); a.push(p); } } return g; }
    function nearPts(arr, x, y, extra) {
      for (const r of arr) {
        if (extra > 165) { for (const p of r.pts) if (Math.hypot(p.x - x, p.y - y) < p.r + extra) return true; continue; }
        const g = r._g || (r._g = mkIdx(r.pts)), a = g.get(Math.floor(y / 128) * 4096 + Math.floor(x / 128)); if (!a) continue;
        for (const p of a) { const dx = p.x - x, dy = p.y - y, rr = p.r + extra; if (dx * dx + dy * dy < rr * rr) return true; }
      }
      return false;
    }
    function ptBad(x, y, pad, ign) {
      ign = ign || {};
      if (x < 130 || y < 130 || x > MAP_W - 130 || y > MAP_H - 130) return true;
      if (!ign.spawn) for (const s of [SA, SB]) if (Math.abs(x - s[0]) < 700 && Math.abs(y - s[1]) < 1100) return true;
      if (!ign.caps) for (const c of L.caps) if (Math.hypot(c.x - x, c.y - y) < c.radius + pad + 30) return true;
      if (!ign.roads && nearPts(L.roads, x, y, pad)) return true;
      if (!ign.water) {
        if (!inBridge(x, y, 20)) { if (nearPts(L.rivers, x, y, pad)) return true; }
        for (const k of L.lakes.concat(L.pools)) { const dx = (x - k.x) / (k.rx + pad), dy = (y - k.y) / (k.ry + pad); if (dx * dx + dy * dy < 1) return true; }
        if (!inLand(x, y, pad + 30)) return true;
      }
      return false;
    }
    function rectBad(x, y, w, h, pad, ign) {
      const nx = Math.max(1, Math.ceil(w / 50)), ny = Math.max(1, Math.ceil(h / 50));
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) if (ptBad(x + w * i / nx, y + h * j / ny, pad, ign)) return true;
      return false;
    }
    function overlaps(x, y, w, h, gap) {
      for (const o of L.obs) { if (o.type === "hedge") continue; if (x < o.x + o.w + gap && x + w > o.x - gap && y < o.y + o.h + gap && y + h > o.y - gap) return true; }
      return false;
    }
    function put(type, x, y, w, h, opt, pad, ign, gap) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      if (rectBad(x, y, w, h, pad == null ? 20 : pad, ign)) return false;
      if (gap !== undefined && overlaps(x, y, w, h, gap)) return false;
      L.obs.push([type, x, y, w, h, opt || {}]); return true;
    }
    /* ───── API de construction ───── */
    const later = [];
    const B0 = {
      R, rand: R2, W: MAP_W, H: MAP_H,
      patch(x, y, rx, ry, color, a) { L.ops.push({ k: "patch", x, y, rx, ry, color, a: a == null ? 0.7 : a, seed: R() * 99 }); },
      river(pts, w, o) {
        o = o || {}; const d = dense(pts, 30, w * 0.35, nz);
        const r = { pts: d.map((p, i) => Object.assign(p, { r: w / 2 * (0.82 + 0.3 * (nz(i * 0.11 + 9) * 0.5 + 0.5)) })), w, block: !!o.block, ice: !!o.ice, dry: !!o.dry, color: o.color };
        L.rivers.push(r); L.ops.push({ k: "river", r }); return r;
      },
      lake(x, y, rx, ry, o) { const k = { x, y, rx, ry, o: o || {} }; L.lakes.push(k); L.ops.push({ k: "lake", l: k }); },
      pool(x, y, rx, ry) { const k = { x, y, rx, ry }; L.pools.push(k); L.ops.push({ k: "pool", l: k }); },
      sea(side, depth, wob) {
        const n2 = vnoise((M.seed || 7) * 13 + 2);
        const base = side === "N" || side === "W" ? depth : (side === "S" ? MAP_H : MAP_W) - depth, sg = side === "N" || side === "W" ? 1 : -1;
        L.sea = { side, depth, coast: t => base + sg * (n2(t / 420) * wob + n2(t / 130) * wob * 0.3) };
        L.ops.push({ k: "sea", s: L.sea });
      },
      island(cx, cy, rx, ry, amp) {
        const n2 = vnoise((M.seed || 7) * 17 + 3);
        L.island = { cx, cy, rx, ry, f: th => 1 + amp * (n2(Math.cos(th) * 3 + 20) * 0.7 + n2(Math.sin(th) * 5 + 40) * 0.5 + n2(th * 9) * 0.25) };
        L.ops.push({ k: "island", i: L.island });
      },
      road(pts, w, kind) { const d = dense(pts, 30); const r = { pts: d.map(p => Object.assign(p, { r: w / 2 })), w, kind: kind || "paved" }; L.roads.push(r); L.ops.push({ k: "road", r }); return r; },
      /* Pont sur un cours d'eau déjà défini : coordonnée le long de l'axe (y pour dir "h", x pour dir "v") */
      bridge(river, at, dir, len, w, o) {
        let best = null; for (const p of river.pts) { const d = dir === "h" ? Math.abs(p.y - at) : Math.abs(p.x - at); if (!best || d < best.d) best = { d, p }; }
        const bx = best.p.x, by = best.p.y, bl = len || river.w * 1.6, bw = w || 170;
        const b = { x: bx, y: by, dir, len: bl, w: bw, kind: (o && o.kind) || "stone" }; L.bridges.push(b); L.ops.push({ k: "bridge", b });
        const hx = dir === "h" ? bl : bw, hy = dir === "h" ? bw : bl;
        if (dir === "h") { for (const s of [-1, 1]) L.obs.push(["wall", Math.round(bx - bl / 2), Math.round(by + s * (bw / 2 + 4) - 9), Math.round(bl), 18, { hm: 1.0 }]); }
        else for (const s of [-1, 1]) L.obs.push(["wall", Math.round(bx + s * (bw / 2 + 4) - 9), Math.round(by - bl / 2), 18, Math.round(bl), { hm: 1.0 }]);
        return b;
      },
      /* hameaux semés sur les terres libres : 3×3 parcelles environ, rues entre les maisons */
      _hamlets(n, o) {
        o = o || {}; let p = 0, t = 0;
        while (p < n && t < n * 80) {
          t++; const cols = 2 + Math.floor(R() * 2), rows = 2 + Math.floor(R() * 2), cell = o.cell || [270, 240], w = cols * cell[0], h = rows * cell[1], x = 400 + R() * (MAP_W - 800 - w), y = 400 + R() * (MAP_H - 800 - h);
          if (rectBad(x - 60, y - 60, w + 120, h + 120, 60)) continue; if (overlaps(x - 80, y - 80, w + 160, h + 160, 0)) continue; if (L.zones.some(z => x < z.x + z.w + 100 && x + w > z.x - 100 && y < z.y + z.h + 100 && y + h > z.y - 100)) continue;
          B0.town(x, y, w, h, { cell, house: [0.42, 0.58], skip: 0.3, hm: o.hm || [4.5, 6.5], flat: o.flat, ruin: o.ruin, walls: 0.3 }); p++;
        }
      },
      /* bosquets semés au hasard sur les terres libres (rayons en px de carte finale) */
      _groves(n, r0, r1, d) { let p = 0, t = 0; while (p < n && t < n * 80) { t++; const rx = r0 + R() * (r1 - r0), ry = rx * (0.6 + R() * 0.6), x = 300 + R() * (MAP_W - 600), y = 300 + R() * (MAP_H - 600); if (rectBad(x - rx, y - ry, rx * 2, ry * 2, 80)) continue; if (L.forests.some(f => Math.hypot(f.x - x, f.y - y) < f.rx + rx)) continue; if (L.zones.some(z => x > z.x - rx && x < z.x + z.w + rx && y > z.y - ry && y < z.y + z.h + ry)) continue; B0.forest(x, y, rx, ry, d || 0.8); p++; } },
      forest(x, y, rx, ry, d) { L.forests.push({ x, y, rx, ry, d: d == null ? 0.7 : d }); L.ops.push({ k: "forest", x, y, rx, ry, d: d == null ? 0.7 : d, seed: R() * 99 }); },
      clearing(x, y, rx, ry) { L.clears.push({ x, y, rx, ry }); },
      /* Champs rectangulaires, avec haies de bocage optionnelles */
      fields(x, y, w, h, cw, ch, o) {
        o = o || {}; const cols = Math.max(1, Math.round(w / cw)), rows = Math.max(1, Math.round(h / ch)), fw = w / cols, fh = h / rows, cells = [];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push({ x: x + i * fw, y: y + j * fh, w: fw, h: fh, c: Math.floor(R() * (o.n || 3)), dir: R() < 0.5 ? 0 : 1 });
        L.ops.push({ k: "fields", cells, kinds: o.kinds || ["fieldA", "fieldB", "fieldC"], furrow: o.furrow !== false });
        if (o.hedge) {
          const gap = o.gap || 240, piece = 120, hmH = o.hm || 1.5;
          const line = (ax, ay, len, vert, withGap) => {
            const g0 = withGap ? len * (0.25 + R() * 0.5) : -1, kept = []; let cur = null;
            for (let t = 0; t < len; t += piece) {
              const l = Math.min(piece, len - t), cx = vert ? ax : ax + t + l / 2, cy = vert ? ay + t + l / 2 : ay;
              const inGap = withGap && t + l > g0 && t < g0 + gap, bad = inGap || rectBad(vert ? ax - 10 : ax + t, vert ? ay + t : ay - 10, vert ? 20 : l, vert ? l : 20, 30);
              if (bad) { cur = null; continue; }
              if (cur) cur.l += l; else { cur = { t, l }; kept.push(cur); }
            }
            for (const k of kept) L.obs.push(vert ? ["hedge", Math.round(ax - 10), Math.round(ay + k.t), 20, Math.round(k.l), { hm: hmH }] : ["hedge", Math.round(ax + k.t), Math.round(ay - 10), Math.round(k.l), 20, { hm: hmH }]);
          };
          for (let i = 0; i <= cols; i++) for (let j = 0; j < rows; j++) if (R() > (o.open || 0.1)) line(x + i * fw, y + j * fh, fh, true, R() < 0.9);
          for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) if (R() > (o.open || 0.1)) line(x + i * fw, y + j * fh, fw, false, R() < 0.9);
        }
      },
      /* Bourg / ville : grille de parcelles (rues laissées entre les bâtiments) */
      town(x, y, w, h, o) {
        o = o || {}; const cell = o.cell || [320, 280], cols = Math.floor(w / cell[0]), rows = Math.floor(h / cell[1]), ox = x + (w - cols * cell[0]) / 2, oy = y + (h - rows * cell[1]) / 2, ratio = o.house || [0.42, 0.58];
        L.zones.push({ x, y, w, h }); L.ops.push({ k: "town", x: ox, y: oy, w: cols * cell[0], h: rows * cell[1], cell, o });
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (R() < (o.skip == null ? 0.15 : o.skip)) continue;
          const lx = ox + c * cell[0], ly = oy + r * cell[1], bw = cell[0] * (ratio[0] + R() * (ratio[1] - ratio[0])), bh = cell[1] * (ratio[0] + R() * (ratio[1] - ratio[0]));
          const bx = lx + (cell[0] - bw) / 2 + (R() - 0.5) * (cell[0] - bw) * 0.2, by = ly + (cell[1] - bh) / 2 + (R() - 0.5) * (cell[1] - bh) * 0.2;
          const hm = (o.hm ? R2(o.hm[0], o.hm[1]) : R2(5, 7.5)) * (R() < (o.tall || 0) ? 1.7 : 1);
          put("building", bx, by, bw, bh, { hm, ruin: R() < (o.ruin || 0), flat: !!o.flat, tone: o.tone }, 14, null, 40);
          if (o.walls && R() < o.walls) put("wall", lx + 6, ly + cell[1] - 24, cell[0] * 0.45, 16, { hm: 1.6 }, 14, null, 20);
        }
      },
      building(x, y, w, h, o) { return put("building", x, y, w, h, Object.assign({ hm: 6.4 }, o || {}), 14, null, 20); },
      /* Fermes, cabanes ou ruines dispersées au hasard dans une zone */
      _scatter(x, y, w, h, n, o) {
        o = o || {}; let placed = 0, tries = 0; const kind = o.kind || "farm";
        while (placed < n && tries < n * 40) {
          tries++; const px = x + R() * w, py = y + R() * h; let ok = false;
          if (kind === "farm") {
            const bw = R2(150, 190), bh = R2(110, 130);
            if (put("building", px, py, bw, bh, { hm: R2(5, 6), flat: !!o.flat }, 40, null, 120)) { ok = true; put("building", px + bw + 50, py + R2(0, 25), R2(170, 220), R2(90, 110), { hm: R2(5, 6.5), flat: !!o.flat }, 30, null, 40); put("wall", px - 30, py + bh + 40, bw + 240, 16, { hm: 1.4 }, 10, null, 20); L.zones.push({ x: px - 60, y: py - 60, w: bw + 360, h: bh + 180 }); L.ops.push({ k: "patch", x: px + bw / 2 + 60, y: py + bh / 2 + 50, rx: 210, ry: 150, color: M.pal.dirt, a: 0.45, seed: R() * 99 }); }
          } else if (put("building", px, py, R2(90, 130), R2(80, 110), { hm: R2(3, 4.2), flat: !!o.flat, ruin: o.ruin && R() < 0.6 }, 40, null, 100)) { ok = true; L.zones.push({ x: px - 60, y: py - 60, w: 250, h: 230 }); }
          if (ok) placed++;
        }
      },
      bunker(x, y, w, h) { return put("building", x, y, w || 120, h || 90, { hm: 2.4, flat: true, conc: true }, 8, null, 20); },
      wall(x, y, w, h, hm) { return put("wall", x, y, w, h, { hm: hm || 2.3 }, 8, null, 0); },
      /* Enceinte rectangulaire avec portes */
      enclosure(x, y, w, h, o) {
        o = o || {}; const th = o.th || 22, hm = o.hm || 2.6, gate = o.gate || 280;
        const side = (ax, ay, len, vert) => { const g = len / 2 - gate / 2; if (o.noGate) { put("wall", ax, ay, vert ? th : len, vert ? len : th, { hm }, 6, { roads: true, caps: true }, -1); return; }
          put("wall", ax, ay, vert ? th : g, vert ? g : th, { hm }, 6, { roads: true, caps: true }, -1); put("wall", vert ? ax : ax + g + gate, vert ? ay + g + gate : ay, vert ? th : g, vert ? g : th, { hm }, 6, { roads: true, caps: true }, -1); };
        side(x, y, w, false); side(x, y + h - th, w, false); side(x, y, h, true); side(x + w - th, y, h, true);
      },
      /* Talus / levée de terre avec brèches (axe "h" ou "v") */
      embank(x, y, len, dir, o) {
        o = o || {}; const th = o.th || 46, hm = o.hm || 2.0, gaps = o.gaps || [], step = 100; let cur = null; const keep = [];
        for (let t = 0; t < len; t += step) {
          const l = Math.min(step, len - t), mid = t + l / 2, inGap = gaps.some(g => mid > g[0] && mid < g[1]);
          const px = dir === "h" ? x + t : x - th / 2, py = dir === "h" ? y - th / 2 : y + t, bad = inGap || rectBad(px, py, dir === "h" ? l : th, dir === "h" ? th : l, 6, { roads: true });
          if (bad) { cur = null; continue; } if (cur) cur.l += l; else { cur = { t, l }; keep.push(cur); }
        }
        for (const k of keep) L.obs.push(dir === "h" ? ["wall", Math.round(x + k.t), Math.round(y - th / 2), Math.round(k.l), th, { hm }] : ["wall", Math.round(x - th / 2), Math.round(y + k.t), th, Math.round(k.l), { hm }]);
        L.ops.push({ k: "embank", x, y, len, dir, th, gaps });
      },
      ditch(x, y, len, dir, w, gaps) { L.ops.push({ k: "ditch", x, y, len, dir, w: w || 60, gaps: gaps || [] }); },
      rocks(x, y, rx, ry, n, smin, smax, o) {
        o = o || {}; let placed = 0, tries = 0;
        while (placed < n && tries < n * 14) { tries++; const a = R() * 6.283, d = Math.sqrt(R()), px = x + Math.cos(a) * rx * d, py = y + Math.sin(a) * ry * d, w = smin + R() * (smax - smin), h = w * (0.65 + R() * 0.35); if (put("rock", px - w / 2, py - h / 2, w, h, { low: o.low }, 30, null, 12)) placed++; }
      },
      /* Chaîne de rochers le long d'une ligne, avec passages libres [{x,y,r}] */
      ridge(pts, smin, smax, passes, o) {
        o = o || {}; const d = dense(pts, 30);
        let acc = 0; for (let i = 0; i < d.length; i++) {
          acc += 30; const w = smin + R() * (smax - smin); if (acc < w * (o.sp || 0.6)) continue; acc = 0;
          if ((passes || []).some(p => Math.hypot(d[i].x - p.x, d[i].y - p.y) < p.r)) continue;
          const j = (R() - 0.5) * (o.jit == null ? w * 0.5 : o.jit), h = w * (0.7 + R() * 0.4);
          put("rock", d[i].x + j - w / 2, d[i].y + j * 0.7 - h / 2, w, h, {}, 20, null, 0);
        }
      },
      craters(x, y, rx, ry, n, rmin, rmax) { L.ops.push({ k: "craters", x, y, rx, ry, n, rmin: rmin || 25, rmax: rmax || 70, seed: R() * 99 }); },
      dunes(x, y, rx, ry, n) { L.ops.push({ k: "dunes", x, y, rx, ry, n, seed: R() * 99 }); },
      minefield(x, y, w, h) { L.ops.push({ k: "mines", x, y, w, h, seed: R() * 99 }); },
      trench(pts, w) { L.ops.push({ k: "trench", pts: dense(pts, 30), w: w || 40 }); },
      raw(type, x, y, w, h, o) { L.obs.push([type, Math.round(x), Math.round(y), Math.round(w), Math.round(h), o || {}]); }
    };
    for (const nm of ["scatter", "hamlets", "groves"]) { const f = B0["_" + nm]; B0[nm] = (...a) => { later.push(() => f(...a)); }; }
    /* ───── Relief (en mètres) : voir ensureHeight ───── */
    B0.rise = (x, y, rx, ry, h) => L.rel.push({ k: "rise", x, y, rx, ry, h });
    B0.crest = (pts, hw, h) => L.rel.push({ k: "crest", pts: dense(pts, 40), hw, h });
    B0.valley = (pts, hw, d) => L.rel.push({ k: "crest", pts: dense(pts, 40), hw, h: -d });
    B0.plateau = (x, y, rx, ry, h) => L.rel.push({ k: "plat", x, y, rx, ry, h });
    /* ───── Mise à l'échelle 8000×8500 → 12000×12000 ───── */
    const X = v => v * MAP_SX, Y = v => v * MAP_SY, SR = MAP_SR, P = pts => pts.map(p => [p[0] * MAP_SX, p[1] * MAP_SY]);
    const AL = (dir, v) => dir === "h" ? v * MAP_SX : v * MAP_SY, GP = (dir, gs) => (gs || []).map(g => [AL(dir, g[0]), AL(dir, g[1])]);
    const B = Object.assign({}, B0, {
      patch: (x, y, rx, ry, c, a) => B0.patch(X(x), Y(y), rx * SR, ry * SR, c, a),
      river: (pts, w, o) => B0.river(P(pts), w * 1.1, o),
      lake: (x, y, rx, ry, o) => B0.lake(X(x), Y(y), rx * SR * 1.1, ry * SR * 1.1, o),
      pool: (x, y, rx, ry) => B0.pool(X(x), Y(y), rx * SR * 1.1, ry * SR * 1.1),
      sea: (side, depth, wob) => B0.sea(side, depth * ((side === "N" || side === "S") ? MAP_SY : MAP_SX), wob * SR),
      island: (cx, cy, rx, ry, amp) => B0.island(X(cx), Y(cy), rx * MAP_SX, ry * MAP_SY, amp),
      road: (pts, w, k) => B0.road(P(pts), w * 1.1, k),
      bridge: (rv, at, dir, len, w, o) => B0.bridge(rv, dir === "h" ? Y(at) : X(at), dir, len * 1.1, w, o),
      forest: (x, y, rx, ry, d) => B0.forest(X(x), Y(y), rx * SR, ry * SR, d),
      clearing: (x, y, rx, ry) => B0.clearing(X(x), Y(y), rx * SR, ry * SR),
      fields: (x, y, w, h, cw, ch, o) => B0.fields(X(x), Y(y), w * MAP_SX, h * MAP_SY, cw, ch, o),
      town: (x, y, w, h, o) => B0.town(X(x), Y(y), w * MAP_SX, h * MAP_SY, o),
      building: (x, y, w, h, o) => B0.building(X(x), Y(y), w, h, o),
      bunker: (x, y, w, h) => B0.bunker(X(x), Y(y), w, h),
      wall: (x, y, w, h, hm) => B0.wall(X(x), Y(y), w, h, hm),
      enclosure: (x, y, w, h, o) => B0.enclosure(X(x), Y(y), w * SR, h * SR, o),
      scatter: (x, y, w, h, n, o) => B0.scatter(X(x), Y(y), w * MAP_SX, h * MAP_SY, Math.round(n * 3), o),
      embank: (x, y, len, dir, o) => B0.embank(X(x), Y(y), AL(dir, len), dir, o && Object.assign({}, o, { gaps: GP(dir, o.gaps) })),
      ditch: (x, y, len, dir, w, gaps) => B0.ditch(X(x), Y(y), AL(dir, len), dir, w, GP(dir, gaps)),
      rocks: (x, y, rx, ry, n, a, b, o) => B0.rocks(X(x), Y(y), rx * SR, ry * SR, Math.round(n * 2.6), a, b, o),
      ridge: (pts, a, b, passes, o) => B0.ridge(P(pts), a, b, (passes || []).map(p => ({ x: X(p.x), y: Y(p.y), r: p.r * SR })), o),
      craters: (x, y, rx, ry, n, a, b) => B0.craters(X(x), Y(y), rx * SR, ry * SR, Math.round(n * 2), a, b),
      dunes: (x, y, rx, ry, n) => B0.dunes(X(x), Y(y), rx * SR, ry * SR, Math.round(n * 2)),
      minefield: (x, y, w, h) => B0.minefield(X(x), Y(y), w * SR, h * SR),
      trench: (pts, w) => B0.trench(P(pts), w),
      raw: (t, x, y, w, h, o) => B0.raw(t, X(x), Y(y), w, h, o),
      /* relief : positions et étendues mises à l'échelle, hauteurs en mètres */
      hill: (x, y, w, h, hm) => B0.rise(X(x), Y(y), w * SR * 0.62, h * SR * 0.62, hm || Math.max(9, Math.min(26, Math.min(w, h) / 38))),
      rise: (x, y, rx, ry, hm) => B0.rise(X(x), Y(y), rx * SR, ry * SR, hm),
      crest: (pts, hw, hm) => B0.crest(P(pts), hw * SR, hm),
      valley: (pts, hw, d) => B0.valley(P(pts), hw * SR, d),
      plateau: (x, y, rx, ry, hm) => B0.plateau(X(x), Y(y), rx * SR, ry * SR, hm)
    });
    M.build(B);
    for (const f of later) f();
    /* Les obstacles posés sur le tracé d'un pont/route ajoutés avant coup sont déjà filtrés ; on compte les zones */
    L.mask = null; L.H = null;
    // ───── requêtes de jeu ─────
    function exactBlocked(x, y) {
      if (!inLand(x, y, 0)) return true;
      if (inBridge(x, y, 0)) return false;
      for (const k of L.lakes) { const dx = (x - k.x) / k.rx, dy = (y - k.y) / k.ry; if (dx * dx + dy * dy < 1) return true; }
      for (const r of L.rivers) if (r.block && nearPts([r], x, y, -r.w * 0.05)) return true;
      return false;
    }
    function exactSlow(x, y) {
      if (inBridge(x, y, 0) || nearPts(L.roads, x, y, 2)) return false;
      for (const k of L.pools) { const dx = (x - k.x) / k.rx, dy = (y - k.y) / k.ry; if (dx * dx + dy * dy < 1) return true; }
      for (const r of L.rivers) if (!r.block && !r.ice && !r.dry && nearPts([r], x, y, -r.w * 0.12)) return true;
      return false;
    }
    L.exactBlocked = exactBlocked; L.exactSlow = exactSlow;
    const CS = 32, CW = Math.ceil(MAP_W / CS), CH = Math.ceil(MAP_H / CS);
    L.CS = CS; L.CW = CW; L.CH = CH;
    /* ───── Relief : grille de hauteurs (mètres), un point par case de 32 px ───── */
    const n2 = vnoise2((M.seed || 7) * 7 + 1), sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    function ensureWet() { if (L.wet) return; const w = new Uint8Array(CW * CH); for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) { const x = (i + 0.5) * CS, y = (j + 0.5) * CS; w[j * CW + i] = exactBlocked(x, y) ? 1 : exactSlow(x, y) ? 2 : 0; } L.wet = w; }
    function ensureHeight() {
      if (L.H) return;
      const H = new Float32Array(CW * CH), rl = M.relief || {}, amp = rl.amp == null ? 2.4 : rl.amp, fr = rl.freq || 1;
      const cx = i => (i + 0.5) * CS;
      for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) { const x = cx(i), y = cx(j); H[j * CW + i] = amp * (n2(x / 2800 * fr, y / 2800 * fr) * 0.62 + n2(x / 950 * fr + 7, y / 950 * fr + 3) * 0.3 + n2(x / 310 + 3, y / 310 + 9) * 0.08); }
      const box = (x0, y0, x1, y1, fn) => { const i0 = Math.max(0, Math.floor(x0 / CS)), i1 = Math.min(CW - 1, Math.floor(x1 / CS)), j0 = Math.max(0, Math.floor(y0 / CS)), j1 = Math.min(CH - 1, Math.floor(y1 / CS)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, cx(i), cx(j), j * CW + i); };
      const avg = (x0, y0, x1, y1) => { let s = 0, n = 0; box(x0, y0, x1, y1, (i, j, x, y, k) => { s += H[k]; n++; }); return n ? s / n : 0; };
      for (const f of L.rel) {
        if (f.k === "rise") box(f.x - f.rx * 2.4, f.y - f.ry * 2.4, f.x + f.rx * 2.4, f.y + f.ry * 2.4, (i, j, x, y, k) => { const d2 = ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2; if (d2 < 5.7) H[k] += f.h * Math.exp(-d2); });
        else if (f.k === "plat") box(f.x - f.rx * 1.3, f.y - f.ry * 1.3, f.x + f.rx * 1.3, f.y + f.ry * 1.3, (i, j, x, y, k) => { const d = Math.hypot((x - f.x) / f.rx, (y - f.y) / f.ry), w = 1 - sstep(0.7, 1.15, d); if (w > 0) H[k] += (f.h + n2(x / 400, y / 400) * 0.4 - H[k]) * w; });
        else if (f.k === "crest") {
          const T = new Map(), R = f.hw * 2.4;
          for (const p of f.pts) box(p.x - R, p.y - R, p.x + R, p.y + R, (i, j, x, y, k) => { const d = Math.hypot(x - p.x, y - p.y) / f.hw; if (d > 2.4) return; const v = f.h * Math.exp(-d * d), o = T.get(k) || 0; if (f.h > 0 ? v > o : v < o) T.set(k, v); });
          for (const [k, v] of T) H[k] += v;
        }
      }
      const flat = (x0, y0, x1, y1, feather, target, circ, str) => { const hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, mx = (x0 + x1) / 2, my = (y0 + y1) / 2; if (target == null) target = avg(x0, y0, x1, y1);
        box(x0 - feather, y0 - feather, x1 + feather, y1 + feather, (i, j, x, y, k) => { const dx = Math.max(Math.abs(x - mx) - hx, 0), dy = Math.max(Math.abs(y - my) - hy, 0), dd = circ ? Math.max(Math.hypot(x - mx, y - my) - hx, 0) : Math.hypot(dx, dy), w = (1 - sstep(0, feather, dd)) * (str == null ? 1 : str); if (w > 0) H[k] += (target - H[k]) * w; }); };
      for (const z of L.zones) flat(z.x - 40, z.y - 40, z.x + z.w + 40, z.y + z.h + 40, z.w < 700 && z.h < 700 ? 320 : 240, null, false, z.w < 700 && z.h < 700 ? 0.6 : 0.92);
      for (const c of L.caps) flat(c.x - c.radius - 80, c.y - c.radius - 80, c.x + c.radius + 80, c.y + c.radius + 80, 380, null, true);
      for (const s of [SA, SB]) flat(s[0] - 520, s[1] - 800, s[0] + 520, s[1] + 800, 320);
      for (const b of L.bridges) {
        const e = b.dir === "h" ? [[b.x - b.len / 2 - 150, b.y], [b.x + b.len / 2 + 150, b.y]] : [[b.x, b.y - b.len / 2 - 150], [b.x, b.y + b.len / 2 + 150]];
        const hAt = (x, y) => { const i = Math.max(0, Math.min(CW - 1, Math.floor(x / CS))), j = Math.max(0, Math.min(CH - 1, Math.floor(y / CS))); return H[j * CW + i]; };
        b.deck = (hAt(e[0][0], e[0][1]) + hAt(e[1][0], e[1][1])) / 2;
        const hx = (b.dir === "h" ? b.len : b.w) / 2 + 250, hy = (b.dir === "h" ? b.w : b.len) / 2 + 250;
        flat(b.x - hx, b.y - hy, b.x + hx, b.y + hy, 160, b.deck);
      }
      // eau : lits creusés puis adoucis en berges
      ensureWet(); for (let k = 0; k < H.length; k++) { const w = L.wet[k]; if (w === 1) H[k] = -2.4 + H[k] * 0.05; else if (w === 2) H[k] = Math.min(H[k], -0.9) * 0.5 - 0.5; }
      for (const r of L.rivers) if (r.dry || r.ice) { const T = new Float32Array(H.length); for (const p of r.pts) box(p.x - p.r * 2, p.y - p.r * 2, p.x + p.r * 2, p.y + p.r * 2, (i, j, x, y, k) => { const d = Math.hypot(x - p.x, y - p.y) / p.r; if (d < 2) T[k] = Math.max(T[k], 1.1 * (1 - sstep(0.5, 2, d)) * (r.dry ? 1 : 0.6)); }); for (let k = 0; k < H.length; k++) H[k] -= T[k]; }
      const tmp = new Float32Array(H.length);
      for (let pass = 0; pass < 3; pass++) { for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) { let s = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= CW || jj >= CH) continue; const w = (di === 0 && dj === 0) ? 2 : 1; s += H[jj * CW + ii] * w; n += w; } tmp[j * CW + i] = s / n; } H.set(tmp); }
      // bord de carte : légère remontée pour fermer l'horizon
      L.H = H;
    }
    L.ensureHeight = ensureHeight;
    /* hauteur du sol en mètres (interpolation bilinéaire) */
    L.heightAt = (x, y) => {
      ensureHeight(); const H = L.H; let fx = x / CS - 0.5, fy = y / CS - 0.5; fx = fx < 0 ? 0 : fx > CW - 1.001 ? CW - 1.001 : fx; fy = fy < 0 ? 0 : fy > CH - 1.001 ? CH - 1.001 : fy;
      const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * CW + i;
      return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + CW] * (1 - u) + H[k + CW + 1] * u) * v;
    };
    /* sol « jouable » : le tablier d'un pont remplace le lit de la rivière */
    L.groundM = (x, y) => {
      for (const b of L.bridges) if (Math.abs(x - b.x) <= (b.dir === "h" ? b.len : b.w) / 2 && Math.abs(y - b.y) <= (b.dir === "h" ? b.w : b.len) / 2) return b.deck;
      return L.heightAt(x, y);
    };
    L.slopeAt = (x, y) => { const d = 24, gx = (L.groundM(x + d, y) - L.groundM(x - d, y)) / (2 * d * PX_M), gy = (L.groundM(x, y + d) - L.groundM(x, y - d)) / (2 * d * PX_M); return Math.hypot(gx, gy); };
    function ensureMask() {
      if (L.mask) return; ensureWet(); ensureHeight(); const mk = new Uint8Array(CW * CH);
      for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
        const x = (i + 0.5) * CS, y = (j + 0.5) * CS; let v = L.wet[j * CW + i];
        if (v === 0 && i > 0 && j > 0 && i < CW - 1 && j < CH - 1 && !inBridge(x, y, 0)) { const gx = (L.H[j * CW + i + 1] - L.H[j * CW + i - 1]) / (2 * CS * PX_M), gy = (L.H[(j + 1) * CW + i] - L.H[(j - 1) * CW + i]) / (2 * CS * PX_M); if (Math.hypot(gx, gy) > 0.8) v = 1; }
        mk[j * CW + i] = v;
      }
      L.mask = mk;
    }
    const at = (x, y) => { const i = Math.floor(x / CS), j = Math.floor(y / CS); return i < 0 || j < 0 || i >= CW || j >= CH ? 1 : L.mask[j * CW + i]; };
    L.waterBlocks = (x, y, m) => { ensureMask(); if (at(x, y) === 1) return true; if (m > 0) { const k = m * 0.75; return at(x + k, y) === 1 || at(x - k, y) === 1 || at(x, y + k) === 1 || at(x, y - k) === 1; } return false; };
    L.waterSlows = (x, y) => { ensureMask(); return at(x, y) === 2; };
    /* Forêt : renvoie vrai si un arbre peut pousser ici (voir terrain-gen.js pour le bruit) */
    L.forestScore = (x, y) => {
      for (const c of L.clears) { const dx = (x - c.x) / c.rx, dy = (y - c.y) / c.ry; if (dx * dx + dy * dy < 1) return -1; }
      for (const z of L.zones) if (x > z.x - 60 && x < z.x + z.w + 60 && y > z.y - 60 && y < z.y + z.h + 60) return -1;
      let best = -1;
      for (const f of L.forests) { const dx = (x - f.x) / f.rx, dy = (y - f.y) / f.ry, d = Math.hypot(dx, dy); if (d < 1) { const e = Math.min(1, (1 - d) / 0.35) * (0.5 + 0.5 * f.d) + f.d * 0.5; if (e > best) best = e; } }
      return best;
    };
    L.treeBlocked = (x, y) => ptBad(x, y, 140, { spawn: false });
    return L;
  }
  function layout(id) { if (!MAPS[id]) id = Object.keys(MAPS)[0]; return cache[id] || (cache[id] = build(id)); }
  return { layout, rng, vnoise, dense };
})();
