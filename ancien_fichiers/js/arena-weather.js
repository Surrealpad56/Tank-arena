/* ==========================================================================
   ARENA-WEATHER.JS — Météo et heure du jour.
   Météo : clair · nuageux · pluie · orage · neige · brouillard · tempête de sable.
   Heure : aube · jour · crépuscule · nuit.
   « auto » = tirage selon la carte (désert : sable, Ardennes : neige…). En multijoueur le salon
   fixe la météo pour tous. Le module agit à deux niveaux :
     1) avant la construction de la scène (vis) : couleurs du ciel, lumière, brouillard ;
     2) en cours de partie : nuages, précipitations, foudre + tonnerre, vent (arbres, herbe),
        humidité / neige sur le sol et les véhicules, ambiance sonore, étalonnage (Post).
   ========================================================================== */
const Weather = (function () {
  "use strict";
  const T = THREE;
  const W3 = [1, 1, 1];
  const CONDS = {
    clear:  { label: "Clair",             cloud: 0.28, dark: 0.0,  wet: 0,   snow: 0,   fogK: 1,    fogF: 1,    wind: 0.25, sunK: 1,    hemiK: 1,    mix: 0,    col: 0xb0b8bc, sat: 1.08, con: 1.05, gain: [1.02, 1.0, 0.97], exp: 1.0 },
    cloudy: { label: "Nuageux",           cloud: 0.74, dark: 0.35, wet: 0,   snow: 0,   fogK: 0.85, fogF: 0.95, wind: 0.45, sunK: 0.62, hemiK: 1.1,  mix: 0.35, col: 0xa4acb2, sat: 0.92, con: 1.02, gain: [0.99, 1.0, 1.02], exp: 1.02 },
    rain:   { label: "Pluie",             cloud: 0.95, dark: 0.62, wet: 1,   snow: 0,   fogK: 0.6,  fogF: 0.72, wind: 0.6,  sunK: 0.42, hemiK: 1.05, mix: 0.55, col: 0x8a949c, sat: 0.82, con: 1.04, gain: [0.95, 1.0, 1.06], exp: 1.04, precip: "rain", amount: 0.7 },
    storm:  { label: "Orage",             cloud: 1.0,  dark: 0.92, wet: 1,   snow: 0,   fogK: 0.5,  fogF: 0.6,  wind: 1.0,  sunK: 0.28, hemiK: 0.85, mix: 0.75, col: 0x4d545c, sat: 0.72, con: 1.1,  gain: [0.92, 0.99, 1.08], exp: 1.08, precip: "rain", amount: 1.0, lightning: true },
    snow:   { label: "Neige",             cloud: 0.86, dark: 0.3,  wet: 0.3, snow: 1,   fogK: 0.5,  fogF: 0.6,  wind: 0.35, sunK: 0.6,  hemiK: 1.2,  mix: 0.5,  col: 0xcdd5db, sat: 0.82, con: 1.02, gain: [0.97, 1.0, 1.05], exp: 1.05, precip: "snow", amount: 0.8 },
    fog:    { label: "Brouillard",        cloud: 0.62, dark: 0.2,  wet: 0.2, snow: 0,   fogK: 0.05, fogF: 0.34, wind: 0.1,  sunK: 0.5,  hemiK: 1.1,  mix: 0.7,  col: 0xb7bfc2, sat: 0.75, con: 0.94, gain: [0.98, 1.0, 1.03], exp: 1.05 },
    sand:   { label: "Tempête de sable",  cloud: 0.4,  dark: 0.12, wet: 0,   snow: 0,   fogK: 0.1,  fogF: 0.38, wind: 1.0,  sunK: 0.55, hemiK: 1.0,  mix: 0.65, col: 0xc2905a, sat: 1.05, con: 1.02, gain: [1.12, 0.97, 0.78], exp: 1.06, precip: "sand", amount: 0.8 }
  };
  const TODS = {
    day:   { label: "Jour",         lum: 1.0,  elev: null, sun: null,     sunK: 1.0,  hemiK: 1.0,  zen: null,     hor: null,     hemiS: null,     hemiG: null,     exp: 1.0,  gain: W3,                 sat: 1.0,  bloom: 1.0, stars: 0 },
    dawn:  { label: "Aube",         lum: 0.7,  elev: 0.16, sun: 0xffb27a, sunK: 0.85, hemiK: 0.72, zen: 0x5878a8, hor: 0xf2b58c, hemiS: 0xd6b9aa, hemiG: 0x4a4038, exp: 1.02, gain: [1.1, 0.97, 0.86], sat: 1.05, bloom: 1.15, stars: 0 },
    dusk:  { label: "Crépuscule",   lum: 0.55, elev: 0.11, sun: 0xff9650, sunK: 0.8,  hemiK: 0.62, zen: 0x3b4a78, hor: 0xe5885a, hemiS: 0xc29aa0, hemiG: 0x40342f, exp: 1.04, gain: [1.12, 0.95, 0.82], sat: 1.06, bloom: 1.25, stars: 0.25 },
    night: { label: "Nuit",         lum: 0.14, elev: 0.52, sun: 0x9db6ea, sunK: 0.34, hemiK: 0.55, zen: 0x050a18, hor: 0x131c32, hemiS: 0x2c3c62, hemiG: 0x0f1420, exp: 1.14, gain: [0.82, 0.93, 1.16], sat: 0.72, bloom: 1.5, stars: 1 }
  };
  const AUTO = {
    normandie: { clear: 3, cloudy: 3, rain: 2.5, fog: 1, storm: 0.5 }, stalingrad: { snow: 4, cloudy: 2.5, fog: 2, clear: 1.5 },
    koursk: { clear: 4, cloudy: 2.5, storm: 2, rain: 1.5 }, ardennes: { snow: 4, fog: 3, cloudy: 2, clear: 1 },
    alamein: { clear: 5.5, sand: 3, cloudy: 1.5 }, cassino: { rain: 3.5, cloudy: 3, clear: 2.5, fog: 1 },
    peleliu: { clear: 4, storm: 3, rain: 2, cloudy: 1 }, marais: { fog: 4, rain: 3, cloudy: 2, clear: 1 },
    golan: { clear: 5, sand: 3, cloudy: 2 }, arnhem: { rain: 3, cloudy: 3, fog: 2, clear: 2 }
  };
  const AUTO_T = { day: 6, dusk: 1.8, dawn: 1.2, night: 1 };
  const pick = tbl => { let tot = 0; for (const k in tbl) tot += tbl[k]; let r = Math.random() * tot; for (const k in tbl) { r -= tbl[k]; if (r <= 0) return k; } return Object.keys(tbl)[0]; };

  const W = { cond: null, tod: null, id: "clear", todId: "day", grade: null, flash: 0, dir: Math.random() * 6.283 };
  let S = null, clouds = null, stars = null, precip = null, bolts = [], timer = 6, audio = null, hemiBase = 1, sunBase = 1, fl = { t: 99 };

  function resolve() {
    if (W.cond) return;
    const c = (typeof ARENA_CFG !== "undefined" && ARENA_CFG) || {}; let theme = "normandie"; try { theme = MAP_THEME; } catch (e) { }
    W.id = c.weather && CONDS[c.weather] ? c.weather : pick(AUTO[theme] || { clear: 1 });
    W.todId = c.tod && TODS[c.tod] ? c.tod : pick(AUTO_T);
    W.cond = CONDS[W.id]; W.tod = TODS[W.todId];
    const g = W.cond, t = W.tod;
    W.grade = { exp: g.exp * t.exp, sat: g.sat * t.sat, con: g.con, gain: [g.gain[0] * t.gain[0], g.gain[1] * t.gain[1], g.gain[2] * t.gain[2]], bloom: t.bloom * (g.lightning ? 1.2 : 1) };
    console.log("[Météo] " + g.label + " · " + t.label);
  }
  const mixHex = (a, b, k) => new T.Color(a).lerp(b instanceof T.Color ? b : new T.Color(b), k).getHex();

  /* 1) ambiance (couleurs / lumière / brouillard) appliquée AVANT la création de la scène */
  function vis(base) {
    resolve(); const v = Object.assign({}, base), C = W.cond, D = W.tod;
    const wc = new T.Color(C.col).multiplyScalar(D.lum);
    if (D.zen !== null) { v.zenith = D.zen; v.horizon = D.hor; v.hemiSky = D.hemiS; v.hemiGround = D.hemiG; v.sun = D.sun; }
    const d = new T.Vector3(...base.sunDir).normalize(), az = Math.atan2(d.z, d.x); let sinE = D.elev !== null ? D.elev : d.y; sinE = Math.max(0.08, Math.min(0.98, sinE));
    const cosE = Math.sqrt(1 - sinE * sinE); v.sunDir = [Math.cos(az) * cosE, sinE, Math.sin(az) * cosE];
    if (C.mix > 0) {
      for (const k of ["zenith", "horizon", "hemiSky"]) v[k] = mixHex(v[k], wc, C.mix);
      v.hemiGround = mixHex(v.hemiGround, wc, C.mix * 0.35); v.sun = mixHex(v.sun, wc.clone().lerp(new T.Color(0xffffff), 0.4), C.mix * 0.5);
    }
    v.sunI = base.sunI * D.sunK * C.sunK; v.hemiI = base.hemiI * D.hemiK * C.hemiK;
    v.fogK = (base.fogK || 1) * C.fogK; v.fogF = (base.fogF || 1) * C.fogF;
    v.stars = D.stars * (1 - C.cloud * 0.8);
    return v;
  }

  /* ───── nuages (dôme à bruit fractal) ───── */
  function buildClouds(q) {
    const oct = Math.max(2, Math.min(5, q.clouds || 3)), C = W.cond, D = W.tod;
    const lit = new T.Color(0xffffff).lerp(new T.Color(S.vis.sun), 0.35).multiplyScalar(0.55 + 0.6 * D.lum), shade = new T.Color(0x6d7a8c).lerp(new T.Color(C.col), 0.4).multiplyScalar(0.25 + 0.7 * D.lum * (1 - C.dark * 0.6));
    const mat = new T.ShaderMaterial({
      side: T.BackSide, transparent: true, depthWrite: false, fog: false, defines: { OCT: oct },
      uniforms: { uTime: { value: 0 }, uCov: { value: C.cloud }, uDark: { value: C.dark }, uLit: { value: lit }, uShade: { value: shade }, uSun: { value: S.sunDir.clone() }, uWind: { value: new T.Vector2(Math.cos(W.dir), Math.sin(W.dir)) }, uFlash: { value: 0 }, uSunCol: { value: new T.Color(S.vis.sun).multiplyScalar(D.sunK) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `varying vec3 vP; uniform float uTime, uCov, uDark, uFlash; uniform vec3 uLit, uShade, uSun, uSunCol; uniform vec2 uWind;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < OCT; i++) { s += a * vn2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
        void main(){
          if (vP.y < 0.015) discard;
          vec2 uv = vP.xz / (vP.y + 0.22); uv = uv * 1.25 + uWind * uTime * 0.012;
          float n = fbm(uv), n2 = fbm(uv + uSun.xz * 0.07);
          float dens = smoothstep(1.0 - uCov, 1.0 - uCov + 0.28, n);
          float lit = clamp(0.55 + (n - n2) * 3.2, 0.0, 1.0);
          vec3 col = mix(uShade, uLit, lit); col *= mix(1.0, 0.5, uDark * dens);
          col += uSunCol * pow(max(dot(vP, uSun), 0.0), 6.0) * 0.5 * (1.0 - dens * 0.5);
          col += vec3(0.75, 0.85, 1.0) * uFlash * 1.4;
          float a = dens * smoothstep(0.015, 0.16, vP.y);
          gl_FragColor = vec4(col, a * 0.94);
        }`
    });
    const m = new T.Mesh(new T.SphereGeometry(2300, 32, 16), mat); m.frustumCulled = false; m.renderOrder = -9; return m;
  }
  function buildStars(amount) {
    const n = 1400, pos = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * 0.92 + 0.04, th = u * 6.283, ph = Math.acos(v); pos[i * 3] = Math.sin(ph) * Math.cos(th) * 2400; pos[i * 3 + 1] = Math.cos(ph) * 2400; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 2400; sz[i] = 1 + Math.random() * 2.4; }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("aS", new T.BufferAttribute(sz, 1));
    const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending, uniforms: { uA: { value: amount } },
      vertexShader: "attribute float aS; void main(){ gl_PointSize = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a * uA); }" });
    const p = new T.Points(g, mat); p.frustumCulled = false; p.renderOrder = -9.5; return p;
  }

  /* ───── précipitations : pluie (traînées), neige, sable ───── */
  function buildPrecip(kind, count) {
    const seeds = new Float32Array(count * 3); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const common = { uTime: { value: 0 }, uCam: { value: new T.Vector3() }, uWind: { value: new T.Vector2() }, uBox: { value: new T.Vector3(70, 34, 70) }, uAlpha: { value: 1 }, uColor: { value: new T.Color(0xcfd8e0) } };
    let obj;
    if (kind === "rain") {
      const geo = new T.InstancedBufferGeometry(); const base = new T.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      geo.index = base.index; geo.setAttribute("position", base.attributes.position); geo.setAttribute("aSeed", new T.InstancedBufferAttribute(seeds, 3)); geo.instanceCount = count;
      const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: Object.assign({ uSpeed: { value: 24 }, uLen: { value: 0.9 }, uWidth: { value: 0.012 } }, common),
        vertexShader: `attribute vec3 aSeed; uniform float uTime, uSpeed, uLen, uWidth; uniform vec3 uCam, uBox; uniform vec2 uWind; varying float vA;
          void main(){ vec3 b = uBox; float h = mod(uTime * uSpeed + aSeed.y * b.y, b.y); vec3 p; p.y = b.y - h;
            p.xz = aSeed.xz * b.xz + uWind * h * 0.11; vec2 rel = p.xz - uCam.xz; rel = mod(rel + b.xz * 0.5, b.xz) - b.xz * 0.5; p.xz = uCam.xz + rel; p.y += uCam.y - 9.0;
            vec3 dir = normalize(vec3(uWind.x * 0.11, -1.0, uWind.y * 0.11)); vec4 mv = viewMatrix * vec4(p, 1.0); vec3 dv = mat3(viewMatrix) * dir;
            vec3 a = mv.xyz; vec3 c = mix(a, a - dv * uLen, position.y); vec3 side = normalize(cross(dv, a)); float dist = max(1.0, -a.z);
            c += side * position.x * max(uWidth, dist * 0.0016); gl_Position = projectionMatrix * vec4(c, 1.0);
            vA = (1.0 - position.y * 0.8) * smoothstep(58.0, 8.0, dist) * smoothstep(0.0, 2.0, dist); }`,
        fragmentShader: "uniform vec3 uColor; uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uAlpha * 0.55); }" });
      obj = new T.Mesh(geo, mat);
    } else {
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(new Float32Array(count * 3), 3)); geo.setAttribute("aSeed", new T.BufferAttribute(seeds, 3));
      const sand = kind === "sand";
      const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: Object.assign({ uSpeed: { value: sand ? 0.6 : 1.5 }, uSize: { value: sand ? 0.34 : 0.09 }, uScale: { value: 800 }, uFlow: { value: sand ? 9 : 0 }, uVar: { value: sand ? 0.0 : 1.3 } }, common),
        vertexShader: `attribute vec3 aSeed; uniform float uTime, uSpeed, uSize, uScale, uFlow, uVar; uniform vec3 uCam, uBox; uniform vec2 uWind; varying float vA;
          void main(){ vec3 b = uBox; float h = mod(uTime * uSpeed + aSeed.y * b.y, b.y); vec3 p; p.y = b.y - h;
            p.xz = aSeed.xz * b.xz + uWind * (h * 0.35 + uTime * uFlow) + vec2(sin(uTime * 0.7 + aSeed.x * 40.0), cos(uTime * 0.6 + aSeed.z * 37.0)) * uVar;
            vec2 rel = p.xz - uCam.xz; rel = mod(rel + b.xz * 0.5, b.xz) - b.xz * 0.5; p.xz = uCam.xz + rel; p.y += uCam.y - 7.0;
            vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = clamp(uSize * uScale / max(0.5, -mv.z), 1.0, 40.0); vA = smoothstep(62.0, 10.0, -mv.z) * 0.9; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: "uniform vec3 uColor; uniform float uAlpha; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = 1.0 - r * r; gl_FragColor = vec4(uColor, a * vA * uAlpha * 0.8); }" });
      if (sand) { mat.uniforms.uColor.value.set(0xc89a62); mat.uniforms.uBox.value.set(90, 30, 90); } else mat.uniforms.uColor.value.set(0xffffff);
      obj = new T.Points(geo, mat);
    }
    obj.frustumCulled = false; obj.renderOrder = 8; obj.userData.kind = kind; return obj;
  }

  /* ───── foudre + tonnerre ───── */
  function bolt(cam) {
    const a = Math.random() * 6.283, dist = 140 + Math.random() * 560, cx = cam.position.x + Math.cos(a) * dist, cz = cam.position.z + Math.sin(a) * dist;
    const pts = []; let x = cx, z = cz, y = 460; const gy = (typeof Look !== "undefined") ? Look.gh(cx, cz) : 0; const segs = 18;
    for (let i = 0; i <= segs; i++) { pts.push(new T.Vector3(x, y, z)); const j = (1 - i / segs) * 26 + 3; x += (Math.random() - 0.5) * j; z += (Math.random() - 0.5) * j; y = 460 - (460 - gy) * ((i + 1) / segs); }
    const mk = (pp, w) => { const g = new T.BufferGeometry().setFromPoints(pp); const l = new T.Line(g, new T.LineBasicMaterial({ color: 0xd6e4ff, transparent: true, opacity: w, blending: T.AdditiveBlending, fog: false, depthWrite: false })); l.frustumCulled = false; S.scene.add(l); return l; };
    const lines = [mk(pts, 1)];
    const f = pts.slice(6, 12).map(p => p.clone().add(new T.Vector3((Math.random() - 0.5) * 40, -Math.random() * 30, (Math.random() - 0.5) * 40))); lines.push(mk(f, 0.6));
    bolts.push({ lines, t: 0 }); fl = { t: 0 }; thunder(dist);
  }
  function thunder(dist) {
    let ac = null; try { ac = audioCtx; } catch (e) { }
    if (!ac || ac.state !== "running") return;
    const delay = Math.min(7, dist / 340), vol = Math.max(0.15, 1 - dist / 900);
    setTimeout(() => { try {
      const len = ac.sampleRate * 3.2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); let l = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; l = l * 0.985 + w * 0.015; d[i] = l * 9 * Math.pow(1 - i / len, 1.4) * (0.6 + 0.4 * Math.sin(i / len * 40)); }
      const src = ac.createBufferSource(); src.buffer = buf; const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220 + 300 * vol;
      const g = ac.createGain(); g.gain.value = 0.9 * vol; src.connect(lp); lp.connect(g); let mg = null; try { mg = masterGain; } catch (e) { } g.connect(mg || ac.destination); src.start();
    } catch (e) { } }, delay * 1000);
  }

  /* ───── ambiance sonore : pluie et vent ───── */
  function buildAudio() {
    let ac = null, mg = null; try { ac = audioCtx; } catch (e) { } try { mg = masterGain; } catch (e) { }
    if (!ac) return null;
    try {
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const mk = (type, f, q) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; const fl2 = ac.createBiquadFilter(); fl2.type = type; fl2.frequency.value = f; fl2.Q.value = q; const g = ac.createGain(); g.gain.value = 0; s.connect(fl2); fl2.connect(g); g.connect(mg || ac.destination); s.start(); return g; };
      return { rain: W.cond.precip === "rain" ? mk("bandpass", 1900, 0.4) : null, wind: mk("lowpass", 380, 0.7), sand: W.cond.precip === "sand" ? mk("bandpass", 2600, 0.5) : null };
    } catch (e) { return null; }
  }

  /* 2) mise en route dans la scène */
  function init(world) {
    resolve(); S = world; const q = Settings.quality(), C = W.cond, D = W.tod, sc = S.scene;
    hemiBase = S.hemi ? S.hemi.intensity : 1; sunBase = S.sun ? S.sun.intensity : 1;
    if (q.weatherFx !== false && Settings.get("weatherFx") !== false) {
      clouds = buildClouds(q); sc.add(clouds);
      if (S.vis.stars > 0.02) { stars = buildStars(S.vis.stars); sc.add(stars); }
      if (C.precip) { const cnt = Math.round((C.precip === "rain" ? 9000 : C.precip === "snow" ? 6000 : 4200) * (q.precip || 1) * C.amount); if (cnt > 0) { precip = buildPrecip(C.precip, cnt); sc.add(precip); } }
      audio = buildAudio();
    }
    const L = Look.U; L.wet.value = C.wet; L.snow.value = C.snow; L.dust.value = C.precip === "sand" ? 1 : 0;
    Look.Tracks.setTint(C.snow ? 0x3a3d44 : C.wet > 0.5 ? 0x120d08 : 0x1d140c);
    timer = 3 + Math.random() * 5;
  }

  function update(dt, cam, t) {
    if (!S || !W.cond) return; const C = W.cond, L = Look.U;
    const gust = 0.6 + 0.4 * Math.sin(t * 0.31) + 0.15 * Math.sin(t * 1.3), spd = C.wind * gust;
    L.wind.value.set(Math.cos(W.dir) * spd * 4, Math.sin(W.dir) * spd * 4); L.windK.value = 0.35 + C.wind * 1.5;
    if (clouds) { clouds.position.copy(cam.position); const u = clouds.material.uniforms; u.uTime.value = t; u.uFlash.value = W.flash * 0.6; }
    if (stars) stars.position.copy(cam.position);
    if (precip) {
      const u = precip.material.uniforms; u.uTime.value = t; u.uCam.value.copy(cam.position); u.uWind.value.copy(L.wind.value);
      if (u.uScale) u.uScale.value = S.renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
      if (precip.userData.kind === "rain") u.uWind.value.multiplyScalar(1.6);
    }
    if (C.lightning) { timer -= dt; if (timer <= 0) { bolt(cam); timer = 4 + Math.random() * 9; } }
    fl.t += dt; const f = fl.t < 0.07 ? 1 : fl.t < 0.13 ? 0.15 : fl.t < 0.2 ? 0.8 : Math.max(0, 0.8 * (1 - (fl.t - 0.2) / 0.25)); W.flash = f;
    for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t += dt; const a = b.t < 0.07 ? 1 : b.t < 0.13 ? 0.1 : b.t < 0.22 ? 0.8 : 0; b.lines.forEach((l, k) => l.material.opacity = a * (k ? 0.6 : 1)); if (b.t > 0.3) { b.lines.forEach(l => { S.scene.remove(l); l.geometry.dispose(); l.material.dispose(); }); bolts.splice(i, 1); } }
    if (S.hemi) S.hemi.intensity = hemiBase + W.flash * 1.7; if (S.sun) S.sun.intensity = sunBase + W.flash * 1.4;
    if (audio) { const k = (typeof Settings !== "undefined" && Settings.get("volume") !== undefined ? Settings.get("volume") : 1); const set = (g, v) => { if (g) g.gain.value += (v * k - g.gain.value) * Math.min(1, dt * 2); }; set(audio.rain, C.precip === "rain" ? C.amount * 0.11 : 0); set(audio.wind, C.wind * (0.04 + 0.05 * gust)); set(audio.sand, C.precip === "sand" ? 0.09 : 0); }
  }

  W.vis = vis; W.init = init; W.update = update; W.resolve = resolve;
  W.names = { weather: Object.fromEntries(Object.entries(CONDS).map(([k, v]) => [k, v.label])), tod: Object.fromEntries(Object.entries(TODS).map(([k, v]) => [k, v.label])) };
  return W;
})();
