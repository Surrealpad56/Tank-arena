/* ==========================================================================
   ARENA-POST.JS — Post-traitement « cinéma » en WebGL2, sans bibliothèque externe :
     scène (HDR demi-flottant si disponible) → bloom (chaîne de flous) → occlusion ambiante
     (SSAO demi-résolution) → étalonnage (exposition, roll-off des hautes lumières, contraste,
     saturation, teinte selon météo / heure) → vignettage, grain, aberration chromatique,
     flashs (foudre, dégâts) → FXAA.
   Résolution dynamique : réduit l'échelle de rendu si la fluidité baisse, la remonte ensuite.
   Repli automatique sur le rendu direct si WebGL2 / les cibles de rendu sont indisponibles.
   ========================================================================== */
const Post = (function () {
  "use strict";
  const T = THREE;
  const P = { ok: false, scale: 1, stats: {} };
  let R, S, C, cfg, hf = false, w = 0, h = 0, rt = null, ldr = null, bd = [], bu = [], ao = null, aob = null, qs, qcam, quad, M = {}, t = 0, pulse = 0, hit = 0, ema = 0.016, adaptT = 0, goodT = 0;
  const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  const mk = (frag, uniforms, defines) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false });

  function makeRT(ww, hh, opts) { return new T.WebGLRenderTarget(Math.max(2, ww | 0), Math.max(2, hh | 0), Object.assign({ minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: hf ? T.HalfFloatType : T.UnsignedByteType, depthBuffer: false, stencilBuffer: false }, opts || {})); }

  function dispose() { for (const o of [rt, ldr, ao, aob, ...bd, ...bu]) if (o) { if (o.depthTexture) o.depthTexture.dispose(); o.dispose(); } rt = ldr = ao = aob = null; bd = []; bu = []; }

  function build() {
    dispose();
    const pr = R.getPixelRatio(); w = Math.max(2, Math.floor(window.innerWidth * pr * P.scale)); h = Math.max(2, Math.floor(window.innerHeight * pr * P.scale));
    const depthFx = cfg.ssao;
    rt = makeRT(w, h, { depthBuffer: true });
    if (depthFx) { const dt = new T.DepthTexture(w, h); dt.type = T.UnsignedIntType; dt.minFilter = dt.magFilter = T.NearestFilter; rt.depthTexture = dt; }
    else if (cfg.msaa && R.capabilities.isWebGL2) rt.samples = 4;
    if (cfg.fxaa) ldr = makeRT(w, h, { type: T.UnsignedByteType });
    if (cfg.bloom) { let bw = w >> 1, bh = h >> 1; for (let i = 0; i < cfg.bloomLevels; i++) { bd.push(makeRT(bw, bh)); bu.push(makeRT(bw, bh)); bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); } }
    if (depthFx) { ao = makeRT(w >> 1, h >> 1, { type: T.UnsignedByteType }); aob = makeRT(w >> 1, h >> 1, { type: T.UnsignedByteType }); }
  }

  function materials() {
    M.bright = mk(`uniform sampler2D tScene; uniform vec2 uT; uniform float uTh, uKnee; varying vec2 vUv;
      void main(){ vec3 s = (texture2D(tScene, vUv + uT * vec2(-1.0,-1.0)).rgb + texture2D(tScene, vUv + uT * vec2(1.0,-1.0)).rgb + texture2D(tScene, vUv + uT * vec2(-1.0,1.0)).rgb + texture2D(tScene, vUv + uT * vec2(1.0,1.0)).rgb) * 0.25;
        float br = max(s.r, max(s.g, s.b)); float soft = clamp(br - uTh + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4); float k = max(soft, br - uTh) / max(br, 1e-4); gl_FragColor = vec4(s * k, 1.0); }`,
      { tScene: { value: null }, uT: { value: new T.Vector2() }, uTh: { value: 0.82 }, uKnee: { value: 0.3 } });
    M.down = mk(`uniform sampler2D tSrc; uniform vec2 uT; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.0; c += texture2D(tSrc, vUv + uT * vec2(-1.0,-1.0)).rgb + texture2D(tSrc, vUv + uT * vec2(1.0,-1.0)).rgb + texture2D(tSrc, vUv + uT * vec2(-1.0,1.0)).rgb + texture2D(tSrc, vUv + uT * vec2(1.0,1.0)).rgb; gl_FragColor = vec4(c / 8.0, 1.0); }`,
      { tSrc: { value: null }, uT: { value: new T.Vector2() } });
    M.up = mk(`uniform sampler2D tLow, tHigh; uniform vec2 uT; uniform float uMix; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tLow, vUv + uT * vec2(-1.0, 0.0)).rgb + texture2D(tLow, vUv + uT * vec2(1.0, 0.0)).rgb + texture2D(tLow, vUv + uT * vec2(0.0, -1.0)).rgb + texture2D(tLow, vUv + uT * vec2(0.0, 1.0)).rgb
          + 2.0 * (texture2D(tLow, vUv + uT * vec2(-0.7,-0.7)).rgb + texture2D(tLow, vUv + uT * vec2(0.7,-0.7)).rgb + texture2D(tLow, vUv + uT * vec2(-0.7,0.7)).rgb + texture2D(tLow, vUv + uT * vec2(0.7,0.7)).rgb);
        c /= 12.0; gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + c * uMix, 1.0); }`,
      { tLow: { value: null }, tHigh: { value: null }, uT: { value: new T.Vector2() }, uMix: { value: 1 } });
    M.ssao = mk(`uniform sampler2D tDepth; uniform mat4 uProj, uProjInv; uniform float uRad; varying vec2 vUv;
      vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ float d0 = texture2D(tDepth, vUv).x; if (d0 >= 0.99995) { gl_FragColor = vec4(1.0); return; }
        vec3 P = vpos(vUv); vec3 N = normalize(cross(dFdx(P), dFdy(P))); if (dot(N, -P) < 0.0) N = -N;
        vec3 Tn = normalize(abs(N.y) < 0.99 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0))); vec3 Bn = cross(N, Tn);
        float ang = rnd(gl_FragCoord.xy) * 6.2831; float occ = 0.0;
        for (int i = 0; i < SAMPLES; i++) { float fi = float(i); float a = ang + fi * 2.39996; float r = (fi + 0.5) / float(SAMPLES);
          vec3 dir = vec3(cos(a) * sqrt(r), sin(a) * sqrt(r), sqrt(1.0 - r)); vec3 Sp = P + (Tn * dir.x + Bn * dir.y + N * dir.z) * uRad * (0.2 + 0.8 * r);
          vec4 q = uProj * vec4(Sp, 1.0); vec2 suv = q.xy / q.w * 0.5 + 0.5; if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
          float sz = vpos(suv).z; float diff = sz - Sp.z; float rc = smoothstep(0.0, 1.0, uRad / max(0.001, abs(P.z - sz))); occ += step(0.03, diff) * rc; }
        float ao = 1.0 - occ / float(SAMPLES); float fade = smoothstep(75.0, 28.0, -P.z); gl_FragColor = vec4(vec3(mix(1.0, ao, fade)), 1.0); }`,
      { tDepth: { value: null }, uProj: { value: new T.Matrix4() }, uProjInv: { value: new T.Matrix4() }, uRad: { value: 1.0 } }, { SAMPLES: cfg.aoSamples || 10 });
    M.aoblur = mk(`uniform sampler2D tAO; uniform vec2 uT; varying vec2 vUv;
      void main(){ float s = 0.0; for (int x = -2; x <= 1; x++) for (int y = -2; y <= 1; y++) s += texture2D(tAO, vUv + (vec2(float(x), float(y)) + 0.5) * uT).r; gl_FragColor = vec4(vec3(s / 16.0), 1.0); }`,
      { tAO: { value: null }, uT: { value: new T.Vector2() } });
    const defs = {}; if (cfg.bloom) defs.BLOOM = 1; if (cfg.ssao) defs.SSAO = 1; if (cfg.grain) defs.GRAIN = 1; if (cfg.ca) defs.CA = 1;
    M.comp = mk(`uniform sampler2D tScene, tBloom, tAO; uniform float uExp, uBloom, uVig, uGrain, uCA, uSat, uCon, uAO, uTime, uHit, uFlash; uniform vec3 uGain; uniform vec2 uRes; varying vec2 vUv;
      float hsh(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
      vec3 roll(vec3 x){ vec3 hi = max(x - 0.72, 0.0); return min(x, vec3(0.72)) + 0.28 * (1.0 - exp(-hi / 0.28)); }
      void main(){ vec2 c = vUv - 0.5; vec3 col;
        #ifdef CA
          col = vec3(texture2D(tScene, vUv + c * uCA).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - c * uCA).b);
        #else
          col = texture2D(tScene, vUv).rgb;
        #endif
        #ifdef SSAO
          col *= mix(1.0, texture2D(tAO, vUv).r, uAO);
        #endif
        #ifdef BLOOM
          col += texture2D(tBloom, vUv).rgb * uBloom;
        #endif
        col *= uExp * uGain; col = roll(col);
        col = (col - 0.5) * uCon + 0.5; col = max(col, 0.0);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(vec3(lum), col, uSat);
        float v = smoothstep(0.95, 0.28, length(c * vec2(1.05, 0.9))); col *= mix(1.0 - uVig, 1.0, v);
        col += vec3(0.55, 0.02, 0.0) * uHit * pow(length(c) * 1.7, 2.2);
        col += vec3(0.5, 0.6, 0.85) * uFlash * 0.22;
        #ifdef GRAIN
          col += (hsh(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain * (1.15 - lum);
        #endif
        gl_FragColor = vec4(col, 1.0); }`,
      { tScene: { value: null }, tBloom: { value: null }, tAO: { value: null }, uExp: { value: 1 }, uBloom: { value: 0.5 }, uVig: { value: 0.3 }, uGrain: { value: 0.035 }, uCA: { value: 0.003 }, uSat: { value: 1 }, uCon: { value: 1.05 }, uAO: { value: 0.8 }, uTime: { value: 0 }, uHit: { value: 0 }, uFlash: { value: 0 }, uGain: { value: new T.Vector3(1, 1, 1) }, uRes: { value: new T.Vector2(1, 1) } }, defs);
    M.fxaa = mk(`uniform sampler2D tLdr; uniform vec2 uT; varying vec2 vUv;
      void main(){ vec3 rgbNW = texture2D(tLdr, vUv + vec2(-1.0, -1.0) * uT).rgb, rgbNE = texture2D(tLdr, vUv + vec2(1.0, -1.0) * uT).rgb, rgbSW = texture2D(tLdr, vUv + vec2(-1.0, 1.0) * uT).rgb, rgbSE = texture2D(tLdr, vUv + vec2(1.0, 1.0) * uT).rgb, rgbM = texture2D(tLdr, vUv).rgb;
        vec3 L = vec3(0.299, 0.587, 0.114); float lNW = dot(rgbNW, L), lNE = dot(rgbNE, L), lSW = dot(rgbSW, L), lSE = dot(rgbSE, L), lM = dot(rgbM, L);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
        float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0); float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
        dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uT;
        vec3 rgbA = 0.5 * (texture2D(tLdr, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tLdr, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
        vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tLdr, vUv + dir * -0.5).rgb + texture2D(tLdr, vUv + dir * 0.5).rgb);
        float lB = dot(rgbB, L); gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0); }`,
      { tLdr: { value: null }, uT: { value: new T.Vector2() } });
  }

  function pass(mat, target, uni) { quad.material = mat; for (const k in uni) mat.uniforms[k].value = uni[k]; R.setRenderTarget(target); R.render(qs, qcam); }

  function init(renderer, scene, camera, q) {
    R = renderer; S = scene; C = camera; P.ok = false;
    try {
      const user = typeof Settings !== "undefined" ? Settings.get("post") : true;
      if (!q.post || user === false || !R.capabilities.isWebGL2) return false;
      hf = R.extensions.has("EXT_color_buffer_float") || R.extensions.has("EXT_color_buffer_half_float");
      cfg = { bloom: !!q.bloom, bloomLevels: q.bloomLevels || 4, ssao: !!q.ssao, aoSamples: q.aoSamples || 10, fxaa: !!q.fxaa, msaa: !!q.msaa, grain: !!q.grain, ca: !!q.ca };
      P.scale = 1; qs = new T.Scene(); qcam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad = new T.Mesh(new T.PlaneGeometry(2, 2), null); quad.frustumCulled = false; qs.add(quad);
      materials(); build(); P.ok = true; P.cfg = cfg; P.hdr = hf;
      console.log("[Post] actif — HDR:" + hf + " bloom:" + cfg.bloom + " ssao:" + cfg.ssao + " fxaa:" + cfg.fxaa + " grain:" + cfg.grain);
    } catch (e) { console.warn("[Post] indisponible :", e.message); P.ok = false; try { dispose(); } catch (x) { } }
    return P.ok;
  }

  function resize() { if (!P.ok) return; try { build(); } catch (e) { console.warn("[Post] resize :", e.message); P.ok = false; } }

  function render(dt) {
    if (!P.ok) { R.render(S, C); return; }
    t += dt; pulse = Math.max(0, pulse - dt * 3); hit = Math.max(0, hit - dt * 1.3);
    if (typeof Settings !== "undefined" && Settings.get("dynres") !== false && dt > 0) {          // résolution dynamique
      ema += (dt - ema) * 0.04; adaptT += dt;
      if (adaptT > 1.5) { adaptT = 0;
        if (ema > 0.027 && P.scale > 0.61) { P.scale = Math.max(0.6, +(P.scale - 0.1).toFixed(2)); goodT = 0; try { build(); } catch (e) { } }
        else if (ema < 0.0165) { goodT += 1.5; if (goodT > 6 && P.scale < 1) { P.scale = Math.min(1, +(P.scale + 0.1).toFixed(2)); goodT = 0; try { build(); } catch (e) { } } } else goodT = 0; }
    }
    const g = (typeof Weather !== "undefined" && Weather.grade) ? Weather.grade : { exp: 1, sat: 1, con: 1.04, gain: [1, 1, 1], bloom: 1 };
    const fl = (typeof Weather !== "undefined" ? Weather.flash : 0) + pulse;
    R.setRenderTarget(rt); R.render(S, C);
    let bloomTex = null;
    if (cfg.bloom) {
      const L = cfg.bloomLevels; pass(M.bright, bd[0], { tScene: rt.texture, uT: new T.Vector2(0.5 / w, 0.5 / h) });
      for (let i = 1; i < L; i++) pass(M.down, bd[i], { tSrc: bd[i - 1].texture, uT: new T.Vector2(0.5 / bd[i - 1].width, 0.5 / bd[i - 1].height) });
      pass(M.up, bu[L - 1], { tLow: bd[L - 1].texture, tHigh: bd[L - 1].texture, uT: new T.Vector2(1 / bd[L - 1].width, 1 / bd[L - 1].height), uMix: 0 });
      for (let i = L - 2; i >= 0; i--) pass(M.up, bu[i], { tLow: bu[i + 1].texture, tHigh: bd[i].texture, uT: new T.Vector2(1 / bu[i + 1].width, 1 / bu[i + 1].height), uMix: 1.0 });
      bloomTex = bu[0].texture;
    }
    let aoTex = null;
    if (cfg.ssao) {
      C.updateMatrixWorld(); pass(M.ssao, ao, { tDepth: rt.depthTexture, uProj: C.projectionMatrix, uProjInv: C.projectionMatrixInverse, uRad: 1.0 });
      pass(M.aoblur, aob, { tAO: ao.texture, uT: new T.Vector2(1 / ao.width, 1 / ao.height) }); aoTex = aob.texture;
    }
    const night = (typeof Weather !== "undefined" && Weather.tod) ? Weather.tod.bloom : 1;
    const u = { tScene: rt.texture, tBloom: bloomTex, tAO: aoTex, uExp: g.exp * 1.06, uBloom: 0.42 * g.bloom * (night > 1.3 ? 1.1 : 1) + fl * 0.3, uVig: 0.26 + (g.sat < 0.8 ? 0.06 : 0), uGrain: 0.04, uCA: 0.0026 + hit * 0.006, uSat: g.sat, uCon: g.con, uAO: 0.85, uTime: t, uHit: hit, uFlash: Math.min(1, fl), uRes: new T.Vector2(w, h) };
    M.comp.uniforms.uGain.value.set(g.gain[0], g.gain[1], g.gain[2]);
    pass(M.comp, cfg.fxaa ? ldr : null, u);
    if (cfg.fxaa) pass(M.fxaa, null, { tLdr: ldr.texture, uT: new T.Vector2(1 / w, 1 / h) });
    R.setRenderTarget(null);
  }

  P.init = init; P.resize = resize; P.render = render; P.pulse = v => { pulse = Math.max(pulse, v); }; P.hit = v => { hit = Math.min(1, hit + v); };
  return P;
})();
