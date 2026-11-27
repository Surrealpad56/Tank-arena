/* ==========================================================================
   ARENA-LOOK.JS — Réalisme visuel : environnement (reflets), sol (relief, eau, pluie,
   neige), arbres (vent), herbe, traces de chenilles, débris, usure / boue / poussière des
   chars, cratères. Fonctionne dans l'arène, le hangar et l'Atelier (sans dépendre du monde).
   Les conditions météo viennent de arena-weather.js (Look.U est lu par tous les shaders).
   ========================================================================== */
const Look = (function () {
  "use strict";
  const T = THREE;
  const U = {                                   // uniformes partagés par tous les matériaux modifiés
    time: { value: 0 }, wet: { value: 0 }, snow: { value: 0 }, wind: { value: new T.Vector2(0, 0) }, windK: { value: 0.5 }, dust: { value: 0 }
  };
  const off = () => { try { return typeof Settings !== "undefined" && Settings.safe && Settings.safe(); } catch (e) { return false; } };   // mode sans échec : aucun shader modifié
  const hasWorld = () => { try { return typeof MAP_LAYOUT !== "undefined" && typeof PX !== "undefined"; } catch (e) { return false; } };
  const gh = (xm, zm) => { try { return hasWorld() ? MAP_LAYOUT.heightAt(xm / PX, zm / PX) : 0; } catch (e) { return 0; } };   // hauteur du sol (m) en x,z mètres

  /* ───── GLSL commun : bruit de valeur 3D ───── */
  const NOISE = `
    float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
  const inject = (src, token, add, before) => src.replace(token, before ? add + "\n" + token : token + "\n" + add);

  function legacyTerrain(mat, detail, W, H) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.detailMap = { value: detail }; sh.uniforms.detailRep = { value: new T.Vector2(W / 3.2, H / 3.2) };
      sh.fragmentShader = "uniform sampler2D detailMap; uniform vec2 detailRep;\n" + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n float dA = texture2D(detailMap, vUv * detailRep).r; float dB = texture2D(detailMap, vUv * detailRep * 0.21).r; diffuseColor.rgb *= (0.62 + 0.42 * dA) * (0.88 + 0.24 * dB);");
    };
    mat.needsUpdate = true;
  }

  /* ───── Sol : détail, relief (bump), roche sur les pentes, eau, pluie, neige ───── */
  function terrain(mat, detail, W, H, vis) {
    if (off()) { legacyTerrain(mat, detail, W, H); return; }
    mat.extensions = Object.assign(mat.extensions || {}, { derivatives: true });
    const rock = new T.Color(vis && vis.rock !== undefined ? vis.rock : 0x7b766a);
    mat.customProgramCacheKey = () => "look-terrain";
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { detailMap: { value: detail }, detailRep: { value: new T.Vector2(W / 3.2, H / 3.2) }, uRock: { value: new T.Vector3(rock.r, rock.g, rock.b) }, uWet: U.wet, uSnow: U.snow, uTime: U.time, uBump: { value: 1.0 } });
      sh.vertexShader = "varying float vTUp; varying vec3 vWP;\n" + sh.vertexShader;
      sh.vertexShader = inject(sh.vertexShader, "#include <beginnormal_vertex>", "vTUp = objectNormal.y;");
      sh.vertexShader = inject(sh.vertexShader, "#include <project_vertex>", "vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = "uniform sampler2D detailMap; uniform vec2 detailRep; uniform vec3 uRock; uniform float uWet, uSnow, uTime, uBump; varying float vTUp; varying vec3 vWP;\n" + NOISE + "\n" + sh.fragmentShader;
      sh.fragmentShader = inject(sh.fragmentShader, "#include <map_fragment>", `
        float dA = texture2D(detailMap, vUv * detailRep).r; float dB = texture2D(detailMap, vUv * detailRep * 0.21).r;
        diffuseColor.rgb *= (0.62 + 0.42 * dA) * (0.88 + 0.24 * dB);
        float rockA = smoothstep(0.80, 0.58, vTUp);
        diffuseColor.rgb = mix(diffuseColor.rgb, uRock * (0.62 + 0.55 * dA), rockA * 0.6);
        float wat = smoothstep(0.012, 0.06, diffuseColor.b - max(diffuseColor.r, diffuseColor.g) * 0.92);
        float wetK = uWet * (1.0 - wat);
        diffuseColor.rgb *= 1.0 - 0.36 * wetK;
        float snA = clamp(uSnow * smoothstep(0.42, 0.85, vTUp) * (0.55 + 0.9 * vn(vWP * 0.31)) * (1.0 - wat), 0.0, 1.0);
        float snowK = smoothstep(0.22, 0.55, snA);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.93, 0.97) * (0.9 + 0.1 * dA), snowK);`);
      sh.fragmentShader = inject(sh.fragmentShader, "#include <roughnessmap_fragment>", "roughnessFactor = mix(roughnessFactor, 0.10, wat); roughnessFactor = mix(roughnessFactor, 0.38, wetK * 0.65); roughnessFactor = mix(roughnessFactor, 0.8, snowK);");
      sh.fragmentShader = inject(sh.fragmentShader, "#include <normal_fragment_maps>", `
        { float hC = dA * 0.55 + dB * 0.45;
          float rip = vn(vec3(vWP.xz * 1.3, uTime * 0.7)) * 0.6 + vn(vec3(vWP.xz * 3.7, -uTime * 1.1)) * 0.4;
          hC = mix(hC, rip, wat);
          float fd = exp(-length(vViewPosition) / 85.0) * uBump * (1.0 + wat * 2.5);
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(hC), dhy = dFdy(hC);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - fd * 0.9 * grad); }`);
    };
    mat.roughness = 0.95; mat.needsUpdate = true;
  }

  /* ───── Arbres : balancement au vent, neige, pluie ───── */
  function tree(mat) {
    if (off()) return;
    mat.customProgramCacheKey = () => "look-tree";
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uTime: U.time, uWind: U.wind, uWindK: U.windK, uSnow: U.snow, uWet: U.wet });
      sh.vertexShader = "uniform float uTime, uWindK; uniform vec2 uWind; varying float vNY;\n" + sh.vertexShader;
      sh.vertexShader = inject(sh.vertexShader, "#include <beginnormal_vertex>", "vNY = objectNormal.y;");
      sh.vertexShader = inject(sh.vertexShader, "#include <begin_vertex>", `
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.17;
        #else
          float ph = 0.0;
        #endif
        float sw = max(0.0, position.y) / 9.0; sw *= sw;
        float gust = sin(uTime * 1.7 + ph) + 0.5 * sin(uTime * 3.1 + ph * 1.7);
        transformed.x += (uWind.x * (0.55 + 0.45 * gust) + 0.12 * gust) * sw * uWindK;
        transformed.z += (uWind.y * (0.55 + 0.45 * gust) + 0.12 * gust) * sw * uWindK;`);
      sh.fragmentShader = "uniform float uSnow, uWet; varying float vNY;\n" + sh.fragmentShader;
      sh.fragmentShader = inject(sh.fragmentShader, "#include <color_fragment>", `
        diffuseColor.rgb *= 1.0 - 0.22 * uWet;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), clamp(uSnow * smoothstep(0.05, 0.75, vNY) * 0.9, 0.0, 0.92));`);
    };
    mat.needsUpdate = true;
  }

  /* ───── Chars : boue, poussière, éraflures, rouille, humidité, neige ───── */
  function tank(mat, p, groundU) {
    if (off()) return; p = p || {}; if (mat.userData.looked) return; mat.userData.looked = true;
    mat.customProgramCacheKey = () => "look-tank";
    const L = { uGround: groundU || { value: -9999 }, uMud: { value: p.mud || 0 }, uDust: { value: p.dust || 0 }, uWear: { value: p.wear || 0 }, uRust: { value: p.rust || 0 } };
    mat.userData.look = L; mat.userData.lookP = { mud: p.mud || 0, dust: p.dust || 0, wear: p.wear || 0, rust: p.rust || 0 };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, L, { uWet: U.wet, uSnow: U.snow });
      sh.vertexShader = "varying vec3 vWP; varying float vNY;\n" + sh.vertexShader;
      sh.vertexShader = inject(sh.vertexShader, "#include <beginnormal_vertex>", "vNY = objectNormal.y;");
      sh.vertexShader = inject(sh.vertexShader, "#include <project_vertex>", `
        vec4 lwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lwp = instanceMatrix * lwp;
        #endif
        vWP = (modelMatrix * lwp).xyz;`);
      sh.fragmentShader = "uniform float uGround, uMud, uDust, uWear, uRust, uWet, uSnow; varying vec3 vWP; varying float vNY;\n" + NOISE + "\n" + sh.fragmentShader;
      sh.fragmentShader = inject(sh.fragmentShader, "#include <color_fragment>", `
        float hA = vWP.y - (uGround < -9000.0 ? 0.0 : uGround);
        float n1 = vn(vWP * 7.0), n2 = vn(vWP * 23.0 + 3.1), n3 = vn(vWP * 2.3), n4 = vn(vWP * 41.0);
        float mud = clamp(uMud * smoothstep(1.7, 0.05, hA) * (0.45 + 0.95 * n1), 0.0, 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.145, 0.095) * (0.8 + 0.4 * n2), mud);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.54, 0.42), uDust * (0.3 + 0.7 * n3) * 0.28);
        diffuseColor.rgb *= 1.0 - 0.30 * smoothstep(0.6, 0.92, n2) * uWear;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.38, 0.36), smoothstep(0.80, 0.94, n4) * uWear * 0.55);
        float rst = uRust * smoothstep(0.55, 0.85, vn(vec3(vWP.x * 6.0, vWP.y * 1.6, vWP.z * 6.0))) * (0.35 + 0.65 * smoothstep(0.0, 2.4, 2.4 - hA));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.17, 0.07), rst * 0.7);
        diffuseColor.rgb *= 1.0 - 0.2 * uWet;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), clamp(uSnow * smoothstep(0.55, 0.95, vNY) * (0.6 + 0.8 * n1), 0.0, 0.85));`);
      sh.fragmentShader = inject(sh.fragmentShader, "#include <roughnessmap_fragment>", "roughnessFactor = mix(roughnessFactor, 0.32, uWet * 0.7);");
    };
    mat.needsUpdate = true;
  }
  /* valeurs d'usure par défaut selon la carte et la météo (le joueur peut les régler dans l'Atelier) */
  function tankDefaults() {
    const w = (typeof Weather !== "undefined" && Weather.cond) ? Weather.cond : {};
    let desert = false; try { desert = (typeof MAP_THEME !== "undefined") && (MAP_THEME === "alamein" || MAP_THEME === "golan"); } catch (e) { }
    return { wear: 0.45, mud: Math.min(1, (desert ? 0.1 : 0.45) + (w.wet || 0) * 0.5), dust: desert ? 0.85 : 0.3, rust: 0.12 };
  }
  function tankView(v) {                         // appelé pour chaque véhicule créé (arène, hangar)
    const g = { value: -9999 }; v.groundU = g;
    for (const m of v.materials || []) {
      if (!m || !m.isMeshStandardMaterial) continue;
      const p = m.userData && m.userData.lookP ? m.userData.lookP : tankDefaults();
      m.userData.looked = false; m.envMapIntensity = 0.85; tank(m, p, g);
    }
  }

  /* ───── Environnement : reflets du ciel sur la peinture, l'acier et l'eau ───── */
  function environment(renderer, scene, skyMesh, intensity) {
    try {
      const pm = new T.PMREMGenerator(renderer), es = new T.Scene();
      const sky = skyMesh.clone(); sky.position.set(0, 0, 0); es.add(sky);
      const rt = pm.fromScene(es, 0.03, 0.1, 3200);
      scene.environment = rt.texture; pm.dispose();
      scene.traverse(o => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = intensity; });
      return rt;
    } catch (e) { console.warn("[Look] environnement indisponible :", e.message); return null; }
  }

  /* ───── Herbe : touffes instanciées autour de la caméra, sur les zones vertes du sol ───── */
  const Grass = (function () {
    let im = null, mask = null, mw = 0, mh = 0, last = null, N = 0, mat = null;
    const dummy = new T.Object3D(), col = new T.Color();
    const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    function tex() {
      const c = document.createElement("canvas"); c.width = 128; c.height = 128; const x = c.getContext("2d");
      for (let i = 0; i < 16; i++) { const bx = 8 + (i / 15) * 112 + (Math.random() - 0.5) * 8, h = 70 + Math.random() * 54, lean = (Math.random() - 0.5) * 22, w = 3 + Math.random() * 3;
        const g = x.createLinearGradient(0, 128, 0, 128 - h); g.addColorStop(0, "#5a7a3a"); g.addColorStop(1, "#c8e08a"); x.fillStyle = g;
        x.beginPath(); x.moveTo(bx - w, 128); x.quadraticCurveTo(bx - w * 0.4 + lean * 0.4, 128 - h * 0.55, bx + lean, 128 - h); x.quadraticCurveTo(bx + w * 0.4 + lean * 0.4, 128 - h * 0.55, bx + w, 128); x.fill(); }
      const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
    }
    function init(scene, terrainCanvas, q) {
      N = Math.round((q.grass || 0)); if (!N || !terrainCanvas) return;
      mw = 256; mh = 256; const c = document.createElement("canvas"); c.width = mw; c.height = mh; const x = c.getContext("2d"); x.drawImage(terrainCanvas, 0, 0, mw, mh);
      const d = x.getImageData(0, 0, mw, mh).data; mask = new Uint8Array(mw * mh * 3);
      for (let i = 0; i < mw * mh; i++) { mask[i * 3] = d[i * 4]; mask[i * 3 + 1] = d[i * 4 + 1]; mask[i * 3 + 2] = d[i * 4 + 2]; }
      const g1 = new T.PlaneGeometry(1, 1).translate(0, 0.5, 0), g2 = g1.clone().rotateY(Math.PI / 2);
      const pos = new Float32Array([...g1.attributes.position.array, ...g2.attributes.position.array]), uv = new Float32Array([...g1.attributes.uv.array, ...g2.attributes.uv.array]), nor = new Float32Array(pos.length); for (let i = 0; i < nor.length; i += 3) nor[i + 1] = 1;
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(pos, 3)); geo.setAttribute("uv", new T.BufferAttribute(uv, 2)); geo.setAttribute("normal", new T.BufferAttribute(nor, 3));
      geo.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
      mat = new T.MeshStandardMaterial({ map: tex(), alphaTest: 0.45, side: T.DoubleSide, roughness: 0.9, metalness: 0 });
      mat.customProgramCacheKey = () => "look-grass";
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, { uTime: U.time, uWind: U.wind, uWindK: U.windK, uSnow: U.snow, uWet: U.wet });
        sh.vertexShader = "uniform float uTime, uWindK; uniform vec2 uWind;\n" + sh.vertexShader;
        sh.vertexShader = inject(sh.vertexShader, "#include <begin_vertex>", `
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 1.3;
          #else
            float ph = 0.0;
          #endif
          float sw = position.y * position.y; float gs = sin(uTime * 2.3 + ph) * 0.6 + sin(uTime * 4.1 + ph * 1.7) * 0.25;
          transformed.x += (uWind.x * 0.5 + 0.18) * (0.5 + gs) * sw * uWindK * 0.7; transformed.z += (uWind.y * 0.5 + 0.1) * (0.5 + gs) * sw * uWindK * 0.7;`);
        sh.fragmentShader = "uniform float uSnow, uWet;\n" + sh.fragmentShader;
        sh.fragmentShader = inject(sh.fragmentShader, "#include <color_fragment>", "diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.2 * uWet), vec3(0.9, 0.93, 0.98), clamp(uSnow * 0.95, 0.0, 0.95));");
      };
      im = new T.InstancedMesh(geo, mat, N); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
      im.setColorAt(0, col.setRGB(1, 1, 1)); scene.add(im); im.count = 0;
    }
    function sample(xp, yp) {                               // x,y en pixels de carte → couleur du sol
      if (!hasWorld()) return null; const u = Math.min(mw - 1, Math.max(0, Math.floor(xp / MAP_WIDTH * mw))), v = Math.min(mh - 1, Math.max(0, Math.floor(yp / MAP_HEIGHT * mh))), i = (v * mw + u) * 3;
      return [mask[i], mask[i + 1], mask[i + 2]];
    }
    function update(cam) {
      if (!im || !hasWorld()) return; const cx = cam.position.x, cz = cam.position.z;
      if (last && Math.hypot(cx - last[0], cz - last[1]) < 7) return; last = [cx, cz];
      const R = 46, step = Math.max(0.55, Math.sqrt((Math.PI * R * R) / N) * 1.9); let n = 0;
      const gx0 = Math.floor((cx - R) / step), gx1 = Math.floor((cx + R) / step), gz0 = Math.floor((cz - R) / step), gz1 = Math.floor((cz + R) / step);
      for (let gx = gx0; gx <= gx1 && n < N; gx++) for (let gz = gz0; gz <= gz1 && n < N; gz++) {
        const jx = (gx + hash(gx, gz) * 0.95) * step, jz = (gz + hash(gz + 7.3, gx - 2.1) * 0.95) * step, d = Math.hypot(jx - cx, jz - cz); if (d > R) continue;
        const px = jx / PX, py = jz / PX; if (px < 30 || py < 30 || px > MAP_WIDTH - 30 || py > MAP_HEIGHT - 30) continue;
        const c = sample(px, py); if (!c) continue; const gr = c[1] > c[0] * 1.07 && c[1] > c[2] * 1.12 && c[1] > 55; if (!gr) continue;
        const r = hash(gx * 3.7, gz * 1.9); if (r > 0.88) continue;
        const fade = Math.min(1, (R - d) / 12), s = (0.5 + r * 0.55) * fade;
        dummy.position.set(jx, gh(jx, jz) - 0.02, jz); dummy.rotation.set(0, hash(gz, gx) * 6.283, 0); dummy.scale.set(s * 1.1, s * 0.85, s * 1.1); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix);
        col.setRGB(c[0] / 255 * 1.25 + 0.04, c[1] / 255 * 1.3 + 0.06, c[2] / 255 * 1.1); im.setColorAt(n, col); n++;
      }
      im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    return { init, update, get count() { return im ? im.count : 0; } };
  })();

  /* ───── Traces de chenilles (ruban de décalques instanciés) ───── */
  const Tracks = (function () {
    let im = null, alpha = null, base = null, born = null, idx = 0, MAX = 0, t = 0, mat = null, tint = new T.Color(0x1d140c), acc = 0;
    const dummy = new T.Object3D(), LIFE = 45;
    function pattern() {
      const c = document.createElement("canvas"); c.width = 64; c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 8; i++) { x.fillStyle = "rgba(255,255,255," + (0.55 + Math.random() * 0.35) + ")"; x.fillRect(4, 3 + i * 8, 56, 4); }
      x.fillStyle = "rgba(255,255,255,0.35)"; x.fillRect(0, 0, 5, 64); x.fillRect(59, 0, 5, 64);
      const tex = new T.CanvasTexture(c); tex.anisotropy = 4; return tex;
    }
    function init(scene, q) {
      MAX = Math.round(q.decals || 0); if (!MAX) return;
      const geo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); alpha = new Float32Array(MAX); base = new Float32Array(MAX); born = new Float32Array(MAX).fill(-999);
      geo.setAttribute("aAlpha", new T.InstancedBufferAttribute(alpha, 1));
      mat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false,
        uniforms: { map: { value: pattern() }, uCol: { value: tint } },
        vertexShader: "attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform sampler2D map; uniform vec3 uCol; varying vec2 vUv; varying float vA; void main(){ float k = texture2D(map, vUv).r; gl_FragColor = vec4(uCol, k * vA); }"
      });
      im = new T.InstancedMesh(geo, mat, MAX); im.frustumCulled = false; im.renderOrder = 2;
      dummy.scale.set(0, 0, 0); dummy.updateMatrix(); for (let i = 0; i < MAX; i++) im.setMatrixAt(i, dummy.matrix);
      scene.add(im);
    }
    function place(x, z, fx, fz, len, w, a) {
      if (!im) return; const i = idx; idx = (idx + 1) % MAX;
      dummy.position.set(x, gh(x, z) + 0.05, z); dummy.rotation.set(0, Math.atan2(fx, fz), 0); dummy.scale.set(w, 1, len); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      alpha[i] = a; base[i] = a; born[i] = t; im.instanceMatrix.needsUpdate = true; im.geometry.attributes.aAlpha.needsUpdate = true;
    }
    function mark(tk, speedPx) {                           // appelé chaque image pour un char ; x,y en pixels de carte
      if (!im || tk.destroyed || Math.abs(speedPx) < 0.35) return;
      const P = tk.profile || {}, lx = tk._tx, ly = tk._ty;
      if (lx === undefined) { tk._tx = tk.x; tk._ty = tk.y; return; }
      const dpx = Math.hypot(tk.x - lx, tk.y - ly), stepPx = 9; if (dpx < stepPx) return;
      const a = tk.alphaTank, fx = Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = Math.sin(a), half = Math.max(0.5, (P.W || 3) * 0.5 - 0.3);
      const mx = (tk.x + lx) * 0.5 * PX, mz = (tk.y + ly) * 0.5 * PX, len = Math.max(0.75, dpx * PX * 1.15), w = Math.max(0.3, (P.trackW || 0.55));
      const w0 = (typeof Weather !== "undefined" && Weather.cond && Weather.cond.snow) ? 0.5 : 0.42;
      for (const s of [-1, 1]) place(mx + rx * half * s, mz + rz * half * s, fx, fz, len, w, w0);
      tk._tx = tk.x; tk._ty = tk.y;
    }
    function update(dt) {
      if (!im) return; t += dt; acc += dt; if (acc < 0.25) return; acc = 0; let ch = false;
      for (let i = 0; i < MAX; i++) {
        if (born[i] < 0) continue; const age = t - born[i];
        if (age > LIFE) { born[i] = -999; alpha[i] = 0; ch = true; continue; }
        alpha[i] = base[i] * (age > LIFE - 12 ? (LIFE - age) / 12 : 1); ch = true;
      }
      if (ch) im.geometry.attributes.aAlpha.needsUpdate = true;
    }
    function setTint(hex) { tint.setHex(hex); }
    return { init, mark, update, place, setTint };
  })();

  /* ───── Débris de char détruit ───── */
  const Debris = (function () {
    const N = 56; let im = null; const P = []; const dummy = new T.Object3D();
    function init(scene) {
      const g = new T.BoxGeometry(1, 1, 1), m = new T.MeshStandardMaterial({ color: 0x2a2b2a, roughness: 0.6, metalness: 0.5 });
      im = new T.InstancedMesh(g, m, N); im.frustumCulled = false; im.castShadow = true; scene.add(im);
      dummy.scale.set(0, 0, 0); dummy.updateMatrix(); for (let i = 0; i < N; i++) { im.setMatrixAt(i, dummy.matrix); P.push({ life: 0 }); }
    }
    function burst(x, y, z, k) {
      if (!im) return; const n = Math.round(14 * (k || 1)); let c = 0;
      for (const p of P) { if (p.life > 0) continue; const a = Math.random() * 6.283, sp = (4 + Math.random() * 9) * (k || 1);
        p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * sp; p.vy = 4 + Math.random() * 9; p.vz = Math.sin(a) * sp; p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.rz = Math.random() * 6;
        p.wx = (Math.random() - 0.5) * 12; p.wy = (Math.random() - 0.5) * 12; p.wz = (Math.random() - 0.5) * 12; p.s = 0.12 + Math.random() * 0.34; p.sy = p.s * (0.3 + Math.random() * 0.8); p.life = 7 + Math.random() * 4; if (++c >= n) break; }
    }
    function update(dt) {
      if (!im) return; let any = false;
      for (let i = 0; i < N; i++) { const p = P[i]; if (p.life <= 0) continue; any = true; p.life -= dt;
        p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        const g = gh(p.x, p.z) + p.sy * 0.5; if (p.y < g) { p.y = g; if (p.vy < -1.5) p.vy = -p.vy * 0.32; else p.vy = 0; p.vx *= 0.62; p.vz *= 0.62; p.wx *= 0.6; p.wy *= 0.6; p.wz *= 0.6; }
        const sc = p.life < 1 ? Math.max(0, p.life) : 1; dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rz); dummy.scale.set(p.s * sc, p.sy * sc, p.s * 0.8 * sc); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
      if (any) im.instanceMatrix.needsUpdate = true;
    }
    return { init, burst, update };
  })();

  /* ───── Cratère d'impact : brûlé au centre, terre projetée autour ───── */
  let _crater = null;
  function craterTexture() {
    if (_crater) return _crater; const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, "rgba(8,6,4,0.95)"); g.addColorStop(0.35, "rgba(16,12,8,0.8)"); g.addColorStop(0.62, "rgba(54,40,26,0.5)"); g.addColorStop(0.85, "rgba(70,54,36,0.18)"); g.addColorStop(1, "rgba(70,54,36,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, r = 38 + Math.random() * 24; x.fillStyle = "rgba(20,14,9," + (0.2 + Math.random() * 0.3) + ")"; x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1 + Math.random() * 3, 0, 6.283); x.fill(); }
    return (_crater = new T.CanvasTexture(c));
  }

  /* ───── Boucle ───── */
  function update(dt, cam) { U.time.value += dt; Grass.update(cam); Tracks.update(dt); Debris.update(dt); }
  function init(scene, renderer, q, terrainCanvas) { Grass.init(scene, terrainCanvas, q); Tracks.init(scene, q); Debris.init(scene); }

  return { U, terrain, tree, tank, tankView, tankDefaults, environment, init, update, Grass, Tracks, Debris, craterTexture, gh };
})();
