/* ==========================================================================
   MODEL-LOADERS.JS — Chargeurs de modèles 3D compatibles avec three.min.js r128
   (le build fourni ne contient pas GLTFLoader / OBJLoader).

   Formats pris en charge :
     • .glb / .gltf  — maillages, hiérarchie de nœuds (noms conservés),
                       matériaux PBR (couleur, métal/rugosité, émissif,
                       textures de couleur / normales / émissives), double face,
                       textures intégrées ou externes.
                       NON gérés : animations, skinning, compression Draco /
                       meshopt, KTX2, extensions de matériaux avancées.
     • .obj (+ .mtl optionnel, même dossier) — groupes/objets nommés,
                       normales, UV, couleurs Kd, textures map_Kd.

   API : ModelLoaders.load(url, opts) → Promise<THREE.Group>
   ========================================================================== */
(function (global) {
  "use strict";
  const THREE = global.THREE;

  const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const CTOR = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

  function dirOf(url) { const i = url.lastIndexOf("/"); return i >= 0 ? url.slice(0, i + 1) : ""; }
  function fetchBuf(url) { return fetch(url).then(r => { if (!r.ok) throw new Error("HTTP " + r.status + " — " + url); return r.arrayBuffer(); }); }
  function fetchText(url) { return fetch(url).then(r => { if (!r.ok) throw new Error("HTTP " + r.status + " — " + url); return r.text(); }); }

  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("image illisible : " + String(src).slice(0, 80))); im.src = src; });
  }

  /* ───────── glTF / GLB ───────── */
  function parseGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("GLB invalide (magic)");
    const total = dv.getUint32(8, true);
    let off = 12, json = null, bin = null;
    while (off < total) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      const chunk = buf.slice(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942 && !bin) bin = chunk;
      off += 8 + len;
    }
    return { json, bin };
  }

  async function loadGLTF(url, opts) {
    const isGLB = /\.glb(\?|$)/i.test(url);
    let json, bin = null;
    if (isGLB) { ({ json, bin } = parseGLB(await fetchBuf(url))); }
    else json = JSON.parse(await fetchText(url));
    const base = dirOf(url);
    if (json.extensionsRequired && json.extensionsRequired.some(e => /draco|meshopt|basisu/i.test(e)))
      throw new Error("Extension non supportée : " + json.extensionsRequired.join(", ") + " — ré-exporter sans compression");

    const buffers = await Promise.all((json.buffers || []).map((b, i) => {
      if (b.uri === undefined) return Promise.resolve(bin);
      if (b.uri.startsWith("data:")) return fetchBuf(b.uri);
      return fetchBuf(base + decodeURI(b.uri));
    }));
    const viewData = i => { const v = json.bufferViews[i]; return { buf: buffers[v.buffer], off: v.byteOffset || 0, len: v.byteLength, stride: v.byteStride || 0 }; };

    function accessor(i) {
      const a = json.accessors[i], n = TYPE_SIZE[a.type], C = CTOR[a.componentType];
      let arr;
      if (a.bufferView === undefined) arr = new C(a.count * n);
      else {
        const v = viewData(a.bufferView), byteOff = v.off + (a.byteOffset || 0), elemBytes = n * C.BYTES_PER_ELEMENT;
        if (v.stride && v.stride !== elemBytes) {
          arr = new C(a.count * n);
          const src = new DataView(v.buf);
          for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
            const p = byteOff + k * v.stride + c * C.BYTES_PER_ELEMENT;
            arr[k * n + c] = C === Float32Array ? src.getFloat32(p, true) : C === Uint16Array ? src.getUint16(p, true) : C === Uint32Array ? src.getUint32(p, true) : C === Int16Array ? src.getInt16(p, true) : C === Int8Array ? src.getInt8(p) : src.getUint8(p);
          }
        } else arr = new C(v.buf.slice(byteOff, byteOff + a.count * elemBytes));
      }
      if (a.normalized && C !== Float32Array) {
        const f = new Float32Array(arr.length), d = C === Uint8Array ? 255 : C === Uint16Array ? 65535 : C === Int8Array ? 127 : 32767;
        for (let k = 0; k < arr.length; k++) f[k] = Math.max(arr[k] / d, -1);
        return { array: f, itemSize: n };
      }
      return { array: arr, itemSize: n };
    }

    // Textures
    const texCache = {};
    async function getTexture(info, srgb) {
      if (!info) return null;
      const key = info.index + (srgb ? "s" : "l");
      if (texCache[key]) return texCache[key];
      const t = json.textures[info.index], img = json.images[t.source];
      let src;
      if (img.uri !== undefined) src = img.uri.startsWith("data:") ? img.uri : base + decodeURI(img.uri);
      else { const v = viewData(img.bufferView); src = URL.createObjectURL(new Blob([v.buf.slice(v.off, v.off + v.len)], { type: img.mimeType || "image/png" })); }
      const p = loadImage(src).then(im => {
        const tex = new THREE.Texture(im);
        tex.flipY = false; tex.needsUpdate = true;
        if (srgb) tex.encoding = THREE.sRGBEncoding;
        const s = t.sampler !== undefined && json.samplers ? json.samplers[t.sampler] : {};
        tex.wrapS = s.wrapS === 33071 ? THREE.ClampToEdgeWrapping : s.wrapS === 33648 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
        tex.wrapT = s.wrapT === 33071 ? THREE.ClampToEdgeWrapping : s.wrapT === 33648 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
        tex.anisotropy = 4;
        return tex;
      }).catch(() => null);
      texCache[key] = p; return p;
    }

    const matCache = {};
    async function getMaterial(i) {
      if (i === undefined) return new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.8, metalness: 0.1 });
      if (matCache[i]) return matCache[i];
      const m = json.materials[i], pbr = m.pbrMetallicRoughness || {};
      const bc = pbr.baseColorFactor || [1, 1, 1, 1];
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(bc[0], bc[1], bc[2]), opacity: bc[3],
        roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1,
        metalness: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1,
        side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide, name: m.name || ""
      });
      if (m.alphaMode === "BLEND") mat.transparent = true;
      if (m.alphaMode === "MASK") mat.alphaTest = m.alphaCutoff !== undefined ? m.alphaCutoff : 0.5;
      const [map, nrm, emi, mr] = await Promise.all([getTexture(pbr.baseColorTexture, true), getTexture(m.normalTexture, false), getTexture(m.emissiveTexture, true), getTexture(pbr.metallicRoughnessTexture, false)]);
      if (map) mat.map = map;
      if (nrm) { mat.normalMap = nrm; if (m.normalTexture.scale !== undefined) mat.normalScale = new THREE.Vector2(m.normalTexture.scale, m.normalTexture.scale); }
      if (mr) { mat.roughnessMap = mr; mat.metalnessMap = mr; }
      if (m.emissiveFactor) mat.emissive = new THREE.Color(m.emissiveFactor[0], m.emissiveFactor[1], m.emissiveFactor[2]);
      if (emi) { mat.emissiveMap = emi; if (!m.emissiveFactor) mat.emissive = new THREE.Color(1, 1, 1); }
      mat.needsUpdate = true;
      matCache[i] = mat; return mat;
    }

    const meshCache = {};
    async function buildMesh(mi) {
      if (meshCache[mi]) return meshCache[mi];
      const def = json.meshes[mi], group = new THREE.Group(); group.name = def.name || "";
      for (const prim of def.primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;   // seulement les triangles
        const g = new THREE.BufferGeometry(), at = prim.attributes;
        const P = accessor(at.POSITION); g.setAttribute("position", new THREE.BufferAttribute(P.array, 3));
        if (at.NORMAL !== undefined) { const N = accessor(at.NORMAL); g.setAttribute("normal", new THREE.BufferAttribute(N.array, 3)); }
        if (at.TEXCOORD_0 !== undefined) { const U = accessor(at.TEXCOORD_0); g.setAttribute("uv", new THREE.BufferAttribute(U.array, 2)); }
        let vc = false;
        if (at.COLOR_0 !== undefined) { const C = accessor(at.COLOR_0); g.setAttribute("color", new THREE.BufferAttribute(C.array, C.itemSize)); vc = true; }
        if (prim.indices !== undefined) { const I = accessor(prim.indices); g.setIndex(new THREE.BufferAttribute(I.array instanceof Uint8Array ? new Uint16Array(I.array) : I.array, 1)); }
        if (!g.attributes.normal) g.computeVertexNormals();
        const mat = await getMaterial(prim.material);
        if (vc) { mat.vertexColors = true; mat.needsUpdate = true; }
        const mesh = new THREE.Mesh(g, mat); mesh.name = def.name || "";
        group.add(mesh);
      }
      meshCache[mi] = group; return group;
    }

    async function buildNode(ni) {
      const n = json.nodes[ni], o = new THREE.Group();
      o.name = n.name || ("node" + ni);
      if (n.matrix) { const m = new THREE.Matrix4().fromArray(n.matrix); m.decompose(o.position, o.quaternion, o.scale); }
      else {
        if (n.translation) o.position.fromArray(n.translation);
        if (n.rotation) o.quaternion.fromArray(n.rotation);
        if (n.scale) o.scale.fromArray(n.scale);
      }
      if (n.mesh !== undefined) {
        const src = await buildMesh(n.mesh);
        // clone léger (géométrie et matériau partagés)
        src.children.forEach(c => { const m = new THREE.Mesh(c.geometry, c.material); m.name = o.name; o.add(m); });
      }
      for (const c of (n.children || [])) o.add(await buildNode(c));
      return o;
    }

    const root = new THREE.Group(); root.name = "gltf";
    const sceneDef = json.scenes && json.scenes[json.scene || 0];
    const roots = sceneDef ? sceneDef.nodes : (json.nodes || []).map((_, i) => i);
    for (const r of roots) root.add(await buildNode(r));
    return root;
  }

  /* ───────── OBJ + MTL ───────── */
  function parseMTL(text, base) {
    const mats = {}; let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if (!line || line[0] === "#") continue;
      const sp = line.split(/\s+/), key = sp[0].toLowerCase(), rest = line.slice(sp[0].length).trim();
      if (key === "newmtl") { cur = mats[rest] = { name: rest, kd: [0.7, 0.7, 0.7], ks: 0.1, ns: 30, d: 1 }; }
      else if (!cur) continue;
      else if (key === "kd") cur.kd = [+sp[1], +sp[2], +sp[3]];
      else if (key === "ks") cur.ks = (+sp[1] + +sp[2] + +sp[3]) / 3;
      else if (key === "ns") cur.ns = +sp[1];
      else if (key === "d") cur.d = +sp[1];
      else if (key === "map_kd") cur.map = base + rest.split(/\s+/).pop();
      else if (key === "ke") cur.ke = [+sp[1], +sp[2], +sp[3]];
    }
    return mats;
  }

  async function loadOBJ(url) {
    const base = dirOf(url);
    const text = await fetchText(url);
    let mtlLib = {};
    const m = text.match(/^\s*mtllib\s+(.+)$/m);
    if (m) { try { mtlLib = parseMTL(await fetchText(base + m[1].trim()), base); } catch (e) { console.warn("[OBJ] MTL introuvable :", m[1]); } }

    const V = [], VN = [], VT = [];
    const root = new THREE.Group(); root.name = "obj";
    let group = null, mtlName = null, gname = "object";
    const buckets = {};     // (groupe|matériau) → {pos, nor, uv}
    function bucket() {
      const k = gname + "|" + (mtlName || "");
      return buckets[k] || (buckets[k] = { gname, mtl: mtlName, pos: [], nor: [], uv: [] });
    }
    const idx = (s, len) => { const i = parseInt(s, 10); return i < 0 ? len + i : i - 1; };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if (!line || line[0] === "#") continue;
      const sp = line.split(/\s+/);
      switch (sp[0]) {
        case "v": V.push([+sp[1], +sp[2], +sp[3]]); break;
        case "vn": VN.push([+sp[1], +sp[2], +sp[3]]); break;
        case "vt": VT.push([+sp[1], +sp[2]]); break;
        case "o": case "g": gname = line.slice(sp[0].length).trim() || "object"; break;
        case "usemtl": mtlName = line.slice(7).trim(); break;
        case "f": {
          const b = bucket(), face = sp.slice(1).map(t => { const p = t.split("/"); return { v: idx(p[0], V.length), t: p[1] ? idx(p[1], VT.length) : -1, n: p[2] ? idx(p[2], VN.length) : -1 }; });
          for (let i = 1; i < face.length - 1; i++) for (const f of [face[0], face[i], face[i + 1]]) {
            b.pos.push(...V[f.v]);
            if (f.n >= 0 && VN[f.n]) b.nor.push(...VN[f.n]); else b.nor.push(0, 0, 0);
            if (f.t >= 0 && VT[f.t]) b.uv.push(VT[f.t][0], VT[f.t][1]); else b.uv.push(0, 0);
          }
          break;
        }
      }
    }
    const loaders = [];
    for (const k of Object.keys(buckets)) {
      const b = buckets[k]; if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      let hasN = b.nor.some(v => v !== 0);
      if (hasN) g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3)); else g.computeVertexNormals();
      const md = mtlLib[b.mtl] || { kd: [0.62, 0.62, 0.62], ks: 0.1, ns: 20, d: 1 };
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(md.kd[0], md.kd[1], md.kd[2]), roughness: THREE.MathUtils.clamp(1 - md.ns / 1000, 0.35, 1), metalness: 0.1, side: THREE.DoubleSide, transparent: md.d < 1, opacity: md.d, name: md.name || "" });
      if (md.map) loaders.push(loadImage(md.map).then(im => { const t = new THREE.Texture(im); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; mat.map = t; mat.color.setRGB(1, 1, 1); mat.needsUpdate = true; }).catch(() => { }));
      const mesh = new THREE.Mesh(g, mat); mesh.name = b.gname;
      // chaque groupe OBJ devient un nœud nommé (tourelle, canon…)
      let holder = root.children.find(c => c.name === b.gname && c.isGroup);
      if (!holder) { holder = new THREE.Group(); holder.name = b.gname; root.add(holder); }
      mesh.name = b.gname + "_mesh";
      holder.add(mesh);
    }
    await Promise.all(loaders);
    return root;
  }

  function load(url, opts) {
    const u = String(url);
    if (/\.(glb|gltf)(\?|$)/i.test(u)) return loadGLTF(u, opts);
    if (/\.obj(\?|$)/i.test(u)) return loadOBJ(u, opts);
    return Promise.reject(new Error("Format non supporté (utiliser .glb, .gltf ou .obj) : " + u));
  }

  global.ModelLoaders = { load, loadGLTF, loadOBJ };
})(typeof window !== "undefined" ? window : globalThis);
