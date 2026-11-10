/* ==========================================================================
   TERRAIN-GEN.JS — Rendu de la texture du sol à partir des cartes (map-engine.js / map-defs.js).
   Partagé par arena.html (texture du sol 3D, mini-carte) et lobby.html
   (aperçus de carte réels).

   Version optimisée de l'ancien générateur par chunks : les champs de bruit
   à basse fréquence (altitude, humidité, forêts, dunes) sont pré-calculés sur
   une grille grossière puis interpolés ; seules les variations fines sont
   calculées par texel. Génération par tranches de temps (ne bloque pas
   l'interface) avec rapport de progression.
   ========================================================================== */
const TERRAIN_W = 12000, TERRAIN_H = 12000;

// ── Bruit de Perlin (2 tables indépendantes pour plus de variété) ──
        const _P = new Uint8Array(512);
        const _P2 = new Uint8Array(512);
        (() => {
            const p = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180];
            for (let i = 0; i < 512; i++) _P[i] = p[i & 255];
            for (let i = 0; i < 512; i++) _P2[i] = p[(i + 73) & 255];
        })();
        const _fade = t => t * t * t * (t * (t * 6 - 15) + 10);
        const _lerp = (a, b, t) => a + t * (b - a);
        const _grad = (h, x, y) => { const H = h & 3; return ((H < 2) ? x : -x) + ((H === 0 || H === 2) ? y : -y); };
        const _grad2 = (h, x, y) => { const H = h & 3; return ((H < 2) ? -x : x) + ((H === 0 || H === 2) ? -y : y); };
        function _pn(x, y) {
            const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
            const xf = x - Math.floor(x), yf = y - Math.floor(y);
            const u = _fade(xf), v = _fade(yf);
            const A = _P[X] + Y, B = _P[X + 1] + Y;
            return _lerp(_lerp(_grad(_P[A], xf, yf), _grad(_P[B], xf - 1, yf), u), _lerp(_grad(_P[A + 1], xf, yf - 1), _grad(_P[B + 1], xf - 1, yf - 1), u), v);
        }
        function _pn2(x, y) {
            const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
            const xf = x - Math.floor(x), yf = y - Math.floor(y);
            const u = _fade(xf), v = _fade(yf);
            const A = _P2[X] + Y, B = _P2[X + 1] + Y;
            return _lerp(_lerp(_grad2(_P2[A], xf, yf), _grad2(_P2[B], xf - 1, yf), u), _lerp(_grad2(_P2[A + 1], xf, yf - 1), _grad2(_P2[B + 1], xf - 1, yf - 1), u), v);
        }
        function _fbm(x, y, o = 4) { let v = 0, a = 0.5, f = 1, m = 0; for (let i = 0; i < o; i++) { v += _pn(x * f, y * f) * a; m += a; a *= 0.5; f *= 2.0; } return v / m; }
        function _fbm2(x, y, o = 3) { let v = 0, a = 0.5, f = 1, m = 0; for (let i = 0; i < o; i++) { v += _pn2(x * f, y * f) * a; m += a; a *= 0.5; f *= 2.1; } return v / m; }
        function _mix(a, b, t) { return a * (1 - t) + b * t; }
        function _clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
        function _smoothstep(e0, e1, x) { const t = _clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

        // ── Utilitaires de couleur ──
const _hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const _rgba = (h, a) => { const c = _hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

const TerrainGen = (function () {
  const G = 32;                       // pas de la grille grossière (px monde)
  const LAYER = { island: 0.5, patch: 1, fields: 1, river: 2, lake: 2, pool: 2, sea: 2, forest: 3, town: 4, ditch: 4.5, embank: 4.5, trench: 4.5, road: 5, bridge: 6, craters: 7, dunes: 7, mines: 7 };

  function buildFields() {
    const gx = Math.ceil(TERRAIN_W / G) + 2, gy = Math.ceil(TERRAIN_H / G) + 2, mk = () => new Float32Array(gx * gy);
    return { gx, gy, elev: mk(), moist: mk(), shadow: mk(), shade: mk(), slope: mk(), hh: mk() };
  }
  function fillGridRow(F, j, L) {
    const S = 0.00072, M = 0.0006, wy = j * G;
    for (let i = 0; i < F.gx; i++) {
      const wx = i * G, k = j * F.gx + i, elev = _fbm(wx * S, wy * S, 4) * 0.5 + 0.5;
      F.elev[k] = elev; F.moist[k] = _fbm2(wx * M + 33, wy * M + 33, 3) * 0.5 + 0.5;
      const eR = _fbm((wx + 4) * S, wy * S, 2) * 0.5 + 0.5, eD = _fbm(wx * S, (wy + 4) * S, 2) * 0.5 + 0.5;
      F.shadow[k] = _clamp((eR - elev) * 0.6 + (eD - elev) * 0.4, -1, 1) * 12;
      // relief réel : ombrage de colline (soleil au nord-ouest) et pente
      const d = G, gx = (L.heightAt(wx + d, wy) - L.heightAt(wx - d, wy)) / (2 * d / 18), gy = (L.heightAt(wx, wy + d) - L.heightAt(wx, wy - d)) / (2 * d / 18);
      F.shade[k] = 0.7 * (gx + gy); F.hh[k] = L.heightAt(wx, wy); F.slope[k] = Math.hypot(gx, gy);
    }
  }
  function sampleAt(F, wx, wy, out) {
    const fx = wx / G, fy = wy / G, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k00 = j * F.gx + i, k10 = k00 + 1, k01 = k00 + F.gx, k11 = k01 + 1;
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    out.e = F.elev[k00] * w00 + F.elev[k10] * w10 + F.elev[k01] * w01 + F.elev[k11] * w11;
    out.m = F.moist[k00] * w00 + F.moist[k10] * w10 + F.moist[k01] * w01 + F.moist[k11] * w11;
    out.h = F.shade[k00] * w00 + F.shade[k10] * w10 + F.shade[k01] * w01 + F.shade[k11] * w11;
    out.hh = F.hh[k00] * w00 + F.hh[k10] * w10 + F.hh[k01] * w01 + F.hh[k11] * w11;
    out.sl = F.slope[k00] * w00 + F.slope[k10] * w10 + F.slope[k01] * w01 + F.slope[k11] * w11;
    out.s = F.shadow[k00] * w00 + F.shadow[k10] * w10 + F.shadow[k01] * w01 + F.shadow[k11] * w11;
  }

  /* ───── Primitives de dessin (coordonnées en px de carte) ───── */
  function soft(ctx, x, y, rx, ry, color, a) {
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, _rgba(color, a)); g.addColorStop(0.62, _rgba(color, a * 0.85)); g.addColorStop(1, _rgba(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.2832); ctx.fill(); ctx.restore();
  }
  function trace(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
  function offsetPts(pts, d) {
    return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: p.x - dy / l * d, y: p.y + dx / l * d }; });
  }
  function circles(ctx, pts, color, k, extra) { ctx.fillStyle = color; for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + (extra || 0), 0, 6.2832); ctx.fill(); } }
  function coastPts(s) { const out = []; for (let t = -60; t <= (s.side === "N" || s.side === "S" ? TERRAIN_W : TERRAIN_H) + 60; t += 60) { const c = s.coast(t); out.push(s.side === "N" || s.side === "S" ? [t, c] : [c, t]); } return out; }

  const DRAW = {
    patch(ctx, o, L, P) { soft(ctx, o.x, o.y, o.rx, o.ry, o.color, o.a); const r = MapEngine.rng((o.seed * 1000) | 0); for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 0.6; soft(ctx, o.x + Math.cos(a) * o.rx * d, o.y + Math.sin(a) * o.ry * d, o.rx * (0.3 + r() * 0.3), o.ry * (0.3 + r() * 0.3), o.color, o.a * 0.45); } },
    fields(ctx, o, L, P) {
      for (const c of o.cells) {
        ctx.fillStyle = P[o.kinds[c.c % o.kinds.length]] || P.base; ctx.fillRect(c.x, c.y, c.w, c.h);
        if (o.furrow) { ctx.strokeStyle = "rgba(0,0,0,.075)"; ctx.lineWidth = 5; ctx.beginPath(); for (let t = 12; t < (c.dir ? c.w : c.h); t += 26) { if (c.dir) { ctx.moveTo(c.x + t, c.y); ctx.lineTo(c.x + t, c.y + c.h); } else { ctx.moveTo(c.x, c.y + t); ctx.lineTo(c.x + c.w, c.y + t); } } ctx.stroke(); }
        ctx.strokeStyle = "rgba(0,0,0,.13)"; ctx.lineWidth = 10; ctx.strokeRect(c.x, c.y, c.w, c.h);
      }
    },
    river(ctx, o, L, P) {
      const r = o.r, pts = r.pts;
      if (r.dry) { circles(ctx, pts, _rgba(P.bank, 0.9), 1.15); circles(ctx, pts, _rgba(r.color || P.dirt, 1), 0.86); circles(ctx, pts, "rgba(90,70,40,.25)", 0.45); return; }
      circles(ctx, pts, _rgba(P.bank, 0.85), 1, r.w * 0.2);
      circles(ctx, pts, r.ice ? "#cfe3ec" : P.water, 1);
      circles(ctx, pts, _rgba(P.deep, r.ice ? 0.35 : 0.8), 0.55);
      if (r.ice) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 6; trace(ctx, offsetPts(pts, r.w * 0.12)); ctx.stroke(); }
    },
    lake(ctx, o, L, P) { const l = o.l; soft(ctx, l.x, l.y, l.rx * 1.25, l.ry * 1.25, P.bank, 0.8); ctx.fillStyle = P.water; ctx.beginPath(); ctx.ellipse(l.x, l.y, l.rx, l.ry, 0, 0, 6.2832); ctx.fill(); soft(ctx, l.x, l.y, l.rx * 0.7, l.ry * 0.7, P.deep, 0.8); },
    pool(ctx, o, L, P) { const l = o.l; soft(ctx, l.x, l.y, l.rx * 1.2, l.ry * 1.2, P.bank, 0.7); soft(ctx, l.x, l.y, l.rx, l.ry, P.water, 0.95); soft(ctx, l.x, l.y, l.rx * 0.5, l.ry * 0.5, P.deep, 0.6); },
    sea(ctx, o, L, P) {
      const s = o.s, cp = coastPts(s), W = TERRAIN_W, H = TERRAIN_H;
      const path = () => { ctx.beginPath(); cp.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
      ctx.save(); path(); ctx.strokeStyle = _rgba(P.bank, 0.9); ctx.lineWidth = 220; ctx.lineJoin = "round"; ctx.stroke(); ctx.restore();
      ctx.save(); path();
      const corners = { N: [[W + 60, -100], [-60, -100]], S: [[W + 60, H + 100], [-60, H + 100]], W: [[-100, H + 100], [-100, -100]], E: [[W + 100, H + 100], [W + 100, -100]] }[s.side];
      for (const c of corners) ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fillStyle = P.deep; ctx.fill(); ctx.clip();
      path(); for (const [w, a] of [[520, 0.22], [320, 0.3], [170, 0.35]]) { ctx.strokeStyle = _rgba(P.shore || P.water, a); ctx.lineWidth = w; ctx.stroke(); }
      path(); ctx.strokeStyle = _rgba(P.water, 0.55); ctx.lineWidth = 800; ctx.stroke();
      ctx.restore(); path(); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 9; ctx.stroke();
    },
    forest(ctx, o, L, P) {
      soft(ctx, o.x, o.y, o.rx * 1.05, o.ry * 1.05, P.floor, 0.55 + 0.3 * o.d); const r = MapEngine.rng((o.seed * 1000) | 0);
      for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 0.85; soft(ctx, o.x + Math.cos(a) * o.rx * d, o.y + Math.sin(a) * o.ry * d, Math.max(40, o.rx * 0.18 * (0.5 + r())), Math.max(30, o.ry * 0.18 * (0.5 + r())), "#000000", 0.14); }
    },
    town(ctx, o, L, P) {
      ctx.fillStyle = _rgba(P.town, 0.78); ctx.fillRect(o.x, o.y, o.w, o.h);
      const cw = o.cell[0], ch = o.cell[1], r = MapEngine.rng((o.x * 7 + o.y) | 0);
      for (let y = o.y; y < o.y + o.h - 1; y += ch) for (let x = o.x; x < o.x + o.w - 1; x += cw) { ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.09})`; ctx.fillRect(x + 30, y + 30, cw - 60, ch - 60); }
      ctx.strokeStyle = _rgba(P.rubble, 0.85); ctx.lineWidth = 105; ctx.lineCap = "butt"; ctx.beginPath();
      for (let x = o.x; x <= o.x + o.w + 1; x += cw) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); }
      for (let y = o.y; y <= o.y + o.h + 1; y += ch) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
      ctx.stroke();
    },
    embank(ctx, o) {
      const seg = (a, b) => { if (o.dir === "h") { ctx.fillRect(o.x + a, o.y - o.th / 2, b - a, o.th); } else ctx.fillRect(o.x - o.th / 2, o.y + a, o.th, b - a); };
      ctx.fillStyle = "rgba(96,76,50,.85)"; let t = 0; const pts = [0, ...o.gaps.flatMap(g => g), o.len];
      for (let i = 0; i < pts.length; i += 2) seg(pts[i], pts[i + 1]);
    },
    ditch(ctx, o) {
      const off = 60; ctx.fillStyle = "rgba(34,27,19,.8)"; const pts = [0, ...o.gaps.flatMap(g => g), o.len];
      for (let i = 0; i < pts.length; i += 2) { const a = pts[i], b = pts[i + 1]; if (o.dir === "h") ctx.fillRect(o.x + a, o.y + off, b - a, o.w); else ctx.fillRect(o.x + off, o.y + a, o.w, b - a); }
    },
    trench(ctx, o) { trace(ctx, o.pts); ctx.strokeStyle = "rgba(34,27,19,.8)"; ctx.lineWidth = o.w; ctx.lineJoin = "round"; ctx.stroke(); trace(ctx, o.pts); ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = o.w + 14; ctx.globalCompositeOperation = "destination-over"; ctx.stroke(); ctx.globalCompositeOperation = "source-over"; },
    road(ctx, o, L, P) {
      const r = o.r, pts = r.pts; ctx.lineJoin = "round"; ctx.lineCap = "round";
      if (r.kind === "rail") {
        trace(ctx, pts); ctx.strokeStyle = "rgba(90,84,76,.8)"; ctx.lineWidth = r.w; ctx.stroke();
        ctx.setLineDash([5, 20]); ctx.lineCap = "butt"; ctx.strokeStyle = "rgba(48,38,30,.85)"; ctx.lineWidth = r.w * 0.8; ctx.stroke(); ctx.setLineDash([]);
        for (const s of [-1, 1]) { trace(ctx, offsetPts(pts, s * r.w * 0.28)); ctx.strokeStyle = "#bdbdb8"; ctx.lineWidth = 5; ctx.stroke(); }
        return;
      }
      trace(ctx, pts); ctx.strokeStyle = r.kind === "paved" ? "rgba(40,36,28,.28)" : "rgba(40,30,20,.24)"; ctx.lineWidth = r.w + (r.kind === "paved" ? 36 : 52); ctx.stroke();
      trace(ctx, pts); ctx.strokeStyle = r.kind === "paved" ? P.road : P.dirt; ctx.lineWidth = r.w; ctx.stroke();
      if (r.kind === "paved") { trace(ctx, pts); ctx.setLineDash([60, 70]); ctx.lineCap = "butt"; ctx.strokeStyle = "rgba(236,226,176,.7)"; ctx.lineWidth = 5; ctx.stroke(); ctx.setLineDash([]); }
      else for (const s of [-1, 1]) { trace(ctx, offsetPts(pts, s * r.w * 0.24)); ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 11; ctx.stroke(); }
    },
    bridge(ctx, o, L, P) {
      const b = o.b, hx = b.dir === "h" ? b.len : b.w, hy = b.dir === "h" ? b.w : b.len, x = b.x - hx / 2, y = b.y - hy / 2;
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x - 6, y - 6, hx + 12, hy + 12);
      ctx.fillStyle = b.kind === "wood" ? "#7a6446" : b.kind === "steel" ? "#7b7f84" : P.bridge; ctx.fillRect(x, y, hx, hy);
      ctx.strokeStyle = b.kind === "wood" ? "rgba(40,28,16,.4)" : "rgba(0,0,0,.18)"; ctx.lineWidth = 3; ctx.beginPath();
      for (let t = 20; t < (b.dir === "h" ? hx : hy); t += b.kind === "wood" ? 18 : 60) { if (b.dir === "h") { ctx.moveTo(x + t, y); ctx.lineTo(x + t, y + hy); } else { ctx.moveTo(x, y + t); ctx.lineTo(x + hx, y + t); } }
      ctx.stroke(); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 8; ctx.strokeRect(x, y, hx, hy);
      if (b.kind === "rail") { ctx.strokeStyle = "#bdbdb8"; ctx.lineWidth = 5; ctx.beginPath(); for (const s of [-0.2, 0.2]) { if (b.dir === "h") { ctx.moveTo(x, b.y + s * hy); ctx.lineTo(x + hx, b.y + s * hy); } else { ctx.moveTo(b.x + s * hx, y); ctx.lineTo(b.x + s * hx, y + hy); } } ctx.stroke(); }
    },
    craters(ctx, o, L) {
      const r = MapEngine.rng((o.seed * 1000) | 0);
      for (let i = 0; i < o.n; i++) { const a = r() * 6.28, d = Math.sqrt(r()), x = o.x + Math.cos(a) * o.rx * d, y = o.y + Math.sin(a) * o.ry * d, rad = o.rmin + r() * (o.rmax - o.rmin); if (L.exactBlocked(x, y) || L.exactSlow(x, y)) continue;
        soft(ctx, x, y, rad * 1.5, rad * 1.5, "#fff0d0", 0.12); soft(ctx, x, y, rad, rad, "#140f0a", 0.5); }
    },
    dunes(ctx, o) {
      const r = MapEngine.rng((o.seed * 1000) | 0);
      for (let i = 0; i < o.n; i++) { const a = r() * 6.28, d = Math.sqrt(r()), x = o.x + Math.cos(a) * o.rx * d, y = o.y + Math.sin(a) * o.ry * d, rad = 130 + r() * 200, a0 = Math.PI * (0.95 + r() * 0.1), a1 = a0 + Math.PI * (0.7 + r() * 0.3);
        ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,240,200,.38)"; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(x, y, rad, a0, a1); ctx.stroke();
        ctx.strokeStyle = "rgba(120,88,40,.3)"; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(x + 20, y + 26, rad, a0, a1); ctx.stroke(); }
    },
    mines(ctx, o) {
      const r = MapEngine.rng((o.seed * 1000) | 0); ctx.fillStyle = "rgba(120,96,56,.22)"; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "rgba(60,40,30,.6)"; ctx.lineWidth = 6; ctx.setLineDash([22, 16]); ctx.strokeRect(o.x, o.y, o.w, o.h); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(55,38,28,.55)"; for (let y = o.y + 30; y < o.y + o.h; y += 46) for (let x = o.x + 30; x < o.x + o.w; x += 46) { ctx.beginPath(); ctx.arc(x + r() * 12, y + r() * 12, 5, 0, 6.28); ctx.fill(); }
    },
    island(ctx, o, L, P, base) {
      const I = o.i, W = TERRAIN_W, H = TERRAIN_H, path = () => { ctx.beginPath(); for (let a = 0; a <= 6.2832 + 0.05; a += 0.02) { const f = I.f(a), x = I.cx + Math.cos(a) * I.rx * f, y = I.cy + Math.sin(a) * I.ry * f; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
      ctx.fillStyle = P.deep; ctx.fillRect(-10, -10, W + 20, H + 20); ctx.fillStyle = _rgba(P.water, 0.6); ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.lineJoin = "round"; path(); for (const [w, a] of [[900, 0.2], [620, 0.28], [380, 0.36], [200, 0.45]]) { ctx.strokeStyle = _rgba(P.shore || P.water, a); ctx.lineWidth = w; ctx.stroke(); }
      ctx.save(); path(); ctx.clip(); ctx.drawImage(base, 0, 0, W, H); path(); ctx.strokeStyle = _rgba(P.bank, 0.95); ctx.lineWidth = 300; ctx.stroke(); path(); ctx.strokeStyle = _rgba(P.bank, 0.6); ctx.lineWidth = 460; ctx.stroke(); ctx.restore();
      path(); ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 10; ctx.stroke();
    }
  };

  function paintObstacles(ctx, L, P) {
    for (const o of L.obs) {
      const [type, x, y, w, h, op] = o;
      if (type === "building") { ctx.fillStyle = op.ruin ? _rgba(P.rubble, 0.8) : "rgba(25,20,15,.4)"; ctx.fillRect(x - 10, y - 10, w + 20, h + 20); }
      else if (type === "hedge") { ctx.fillStyle = "rgba(20,44,18,.55)"; ctx.fillRect(x - 12, y - 12, w + 24, h + 24); }
      else if (type === "wall") { ctx.fillStyle = "rgba(40,36,30,.5)"; ctx.fillRect(x - 6, y - 6, w + 12, h + 12); }
      else if (type === "rock") { soft(ctx, x + w / 2, y + h / 2, w * 0.7, h * 0.7, "#1c1a16", 0.55); }
    }
  }

  /* generate(themeKey, texW, onProgress) → Promise<HTMLCanvasElement> (texW × texH) */
  function generate(themeKey, texW, onProgress, shadeK) {
    return new Promise(resolve => {
      const L = MapEngine.layout(themeKey); L.ensureHeight(); const SK = shadeK == null ? (onProgress ? 0.45 : 1) : shadeK, P = L.M.pal, texH = Math.round(texW * TERRAIN_H / TERRAIN_W);
      const c0 = _hex(P.base), c1 = _hex(P.base2), c2 = _hex(P.dark);
      const F = buildFields(), out = { e: 0, m: 0, s: 0 };
      const cv = document.createElement("canvas"); cv.width = texW; cv.height = texH;
      const cx = cv.getContext("2d"), img = cx.createImageData(texW, texH), data = img.data, sx = TERRAIN_W / texW, sy = TERRAIN_H / texH;
      let gridRow = 0, row = 0;
      function finish() {
        cx.putImageData(img, 0, 0);
        const ops = L.ops.map((o, i) => [o, i]).sort((a, b) => (LAYER[a[0].k] - LAYER[b[0].k]) || (a[1] - b[1])).map(a => a[0]);
        let base = null; if (L.island) { base = document.createElement("canvas"); base.width = texW; base.height = texH; base.getContext("2d").drawImage(cv, 0, 0); }
        cx.save(); cx.setTransform(texW / TERRAIN_W, 0, 0, texH / TERRAIN_H, 0, 0);
        for (const o of ops) { try { DRAW[o.k](cx, o, L, P, base); } catch (e) { console.warn("[terrain] op", o.k, e); } }
        paintObstacles(cx, L, P);
        cx.restore();
        resolve(cv);
      }
      function step() {
        const t0 = performance.now();
        while (gridRow < F.gy && performance.now() - t0 < 12) fillGridRow(F, gridRow++, L);
        if (gridRow < F.gy) { if (onProgress) onProgress(0.25 * gridRow / F.gy); return setTimeout(step, 0); }
        while (row < texH && performance.now() - t0 < 14) {
          const wy = (row + 0.5) * sy;
          for (let ix = 0; ix < texW; ix++) {
            const wx = (ix + 0.5) * sx; sampleAt(F, wx, wy, out);
            const t = _smoothstep(0.38, 0.62, out.e), dk = _smoothstep(0.55, 0.82, out.m) * 0.75;
            const micro = (_pn(wx * 0.014 + 55, wy * 0.014 + 55) * 14 + _pn2(wx * 0.03 + 88, wy * 0.03 + 88) * 8) + out.s * 1.6 + out.h * 330 * SK + out.hh * 0.5 * SK, o = (row * texW + ix) * 4, rk = _smoothstep(0.32, 0.75, out.sl) * 0.45;
            for (let k = 0; k < 3; k++) { const v = c0[k] * (1 - t) + c1[k] * t; data[o + k] = _clamp((v * (1 - dk) + c2[k] * dk) * (1 - rk * 0.35) + (rk * 118 * (k === 2 ? 0.8 : 1)) * 0.35 + micro * (1 - k * 0.1), 0, 255); }
            data[o + 3] = 255;
          }
          row++;
        }
        if (onProgress) onProgress(0.25 + 0.7 * row / texH);
        if (row < texH) return setTimeout(step, 0);
        finish();
      }
      step();
    });
  }

  const _fn = (x, y) => _fbm(x * 0.0018 + 200, y * 0.0018 + 200, 3) * 0.6 + _fbm2(x * 0.0018 + 400, y * 0.0018 + 400, 2) * 0.4;
  /* Un arbre peut-il pousser ici ? (forêts déclarées dans la carte, avec lisières et clairières) */
  function forestAt(themeKey, wx, wy) {
    const s = MapEngine.layout(themeKey).forestScore(wx, wy); if (s < 0) return false;
    return s + _fn(wx, wy) * 1.4 > 0.62;
  }
  /* Route, rivière, pont, lac ou zone interdite : pas d'arbre */
  function riverRoadAt(wx, wy, themeKey) { return MapEngine.layout(themeKey || (typeof MAP_THEME !== "undefined" ? MAP_THEME : MAP_THEMES[0])).treeBlocked(wx, wy); }

  return { generate, forestAt, riverRoadAt, labels: MAP_THEME_LABELS, themes: MAP_THEMES };
})();
