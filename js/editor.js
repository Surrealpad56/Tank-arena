/* ==========================================================================
   EDITOR.JS — Atelier de chars : modélisation 3D (Three.js) de véhicules.
   Pièces paramétriques (boîte, cylindre, dôme, coin, profil de caisse, train de
   roulement, canon), symétrie, répétition, bibliothèque de détails, peinture /
   camouflage, historique, sauvegarde locale, export / import JSON.
   Les modèles enregistrés et « utilisés en jeu » remplacent l'aspect du char
   dans le hangar et au combat (voir tank-designs.js / tank-models.js).
   ========================================================================== */
(function () {
  "use strict";
  const TD = window.TankDesigns, $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const fmt = v => (v === undefined || v === null || isNaN(v)) ? "" : Math.round(v * 1000) / 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const S = { design: null, sel: null, tool: "move", axis: null, snap: 0.05, hist: [], hi: -1, tab: "parts", dirty: false, grid: true, ref: true, wire: false, sym: true, addGrp: "hull", roll: false };
  const pose = { tur: 0, gun: 0, rec: 0 };
  const cam = { theta: 0.75, phi: 0.32, dist: 13, t: new THREE.Vector3(0, 1.2, 0) };
  let renderer, scene, camera, B = null, helpers = null, selBoxes = [], needRebuild = true, drag = null, lastT = 0;
  const ray = new THREE.Raycaster();

  /* ───────────── Profils de chars du jeu ───────────── */
  const profileOf = key => (key && typeof TECH_TREE !== "undefined" && TECH_TREE[key]) ? getTankProfile(key) : null;
  function styleFor(p) {
    if (!p) return "sloped";
    if (p.casemate) return "casemate";
    if (p.cat === "mbt") return "modern";
    if (p.cat === "heavy" || p.cat === "td_heavy") return "heavy";
    if (p.cat === "light" || p.cat === "td_light") return "light";
    return p.tier >= 3 ? "sloped" : "classic";
  }
  function tankSelectHTML(cur, withNone) {
    const keys = Object.keys(TECH_TREE), groups = {};
    for (const k of keys) { const p = getTankProfile(k), g = (NATIONS[p.nation] || {}).name || "?"; (groups[g] = groups[g] || []).push([k, p.tier]); }
    let h = withNone ? `<option value="">— aucun (gabarit libre) —</option>` : "";
    for (const g of Object.keys(groups).sort()) h += `<optgroup label="${esc(g)}">${groups[g].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k, t]) => `<option value="${esc(k)}" ${k === cur ? "selected" : ""}>${"I II III IV V VI VII VIII".split(" ")[t - 1] || t} · ${esc(k)}</option>`).join("")}</optgroup>`;
    return h;
  }

  /* ───────────── Historique / persistance ───────────── */
  const snapStr = () => JSON.stringify(S.design);
  function snap() { const s = snapStr(); if (S.hist[S.hi] === s) return; S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s); if (S.hist.length > 120) S.hist.shift(); S.hi = S.hist.length - 1; }
  function restore(i) { if (i < 0 || i >= S.hist.length) return; S.hi = i; S.design = JSON.parse(S.hist[i]); if (!S.design.parts.some(p => p.id === S.sel)) S.sel = null; S.dirty = true; needRebuild = true; renderAll(); }
  let draftT = 0;
  function touch(commit) {
    needRebuild = true; S.dirty = true;
    if (commit) { snap(); clearTimeout(draftT); draftT = setTimeout(() => { try { localStorage.setItem("tankDesignDraft", snapStr()); } catch (e) { } }, 400); }
    updateTitle();
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2600); }
  function updateTitle() { document.title = (S.dirty ? "• " : "") + (S.design ? S.design.name : "") + " — Atelier de chars"; }

  /* ───────────── Scène ───────────── */
  function initScene() {
    const cv = $("#cv");
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0, 0); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xcfe3f2, 0x2a3036, 0.62));
    const k = new THREE.DirectionalLight(0xfff0d8, 0.95); k.position.set(-8, 14, 9); k.castShadow = true; k.shadow.mapSize.set(2048, 2048);
    const c = k.shadow.camera; c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 1; c.far = 60; k.shadow.bias = -0.0006; scene.add(k);
    const r = new THREE.DirectionalLight(0x6cb8ff, 0.45); r.position.set(10, 5, -9); scene.add(r);
    const fill = new THREE.DirectionalLight(0xffffff, 0.18); fill.position.set(6, 3, 10); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b242a, roughness: 1 }));
    floor.receiveShadow = true; floor.position.y = -0.01; scene.add(floor);
    const grid = new THREE.GridHelper(32, 32, 0x44525c, 0x2a343b); grid.name = "grid"; grid.position.y = 0.002; scene.add(grid);
    camera = new THREE.PerspectiveCamera(36, 1.5, 0.1, 300);
    new ResizeObserver(resize).observe($("#vp")); resize();
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("wheel", e => { e.preventDefault(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 2.5, 70); }, { passive: false });
    cv.addEventListener("contextmenu", e => e.preventDefault());
    requestAnimationFrame(loop);
  }
  function resize() { const vp = $("#vp"), w = vp.clientWidth, h = vp.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
    if (needRebuild) { needRebuild = false; rebuild(); }
    if (B) {
      if (pose.rec > 0) pose.rec = Math.max(0, pose.rec - dt * 1.6);
      B.barrel.position.x = -Math.sin(Math.min(1, pose.rec) * Math.PI * 0.5) * 0.45 * (pose.rec > 0 ? 1 : 0);
      if (S.roll) B.root.traverse(o => { if (o.userData.spin !== undefined) o.rotation.z -= 3 * dt / (o.userData.r || 0.4); });
      B.turretPivot.rotation.y = pose.tur * Math.PI / 180; B.gunPivot.rotation.z = pose.gun * Math.PI / 180;
    }
    const cp = Math.cos(cam.phi);
    camera.position.set(cam.t.x + Math.cos(cam.theta) * cp * cam.dist, cam.t.y + Math.sin(cam.phi) * cam.dist, cam.t.z + Math.sin(cam.theta) * cp * cam.dist);
    camera.lookAt(cam.t);
    for (const b of selBoxes) b.update();
    renderer.render(scene, camera);
  }

  function rebuild() {
    if (B) { scene.remove(B.root); B.mats.forEach(m => m.dispose()); }
    B = TD.build(S.design, 1); scene.add(B.root);
    B.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material.wireframe = S.wire; } });
    buildHelpers(); updateSelBoxes(); updateStats();
  }
  function buildHelpers() {
    if (helpers) { scene.remove(helpers); helpers.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    helpers = new THREE.Group();
    const d = S.design, p = profileOf(d.base);
    const dot = (x, y, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 })); m.position.set(x, y, 0); m.renderOrder = 999; return m; };
    helpers.add(dot(d.tp[0], d.tp[1], 0xffb000)); helpers.add(dot(d.tp[0] + d.gp[0], d.tp[1] + d.gp[1], 0x4db4ff));
    if (p && S.ref) {
      const mk = (L, H, W, col, op) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })); l.position.y = H / 2; return l; };
      helpers.add(mk(p.L, p.totalHeight, p.W, 0xffb000, 0.5)); helpers.add(mk(p.L, p.hullTop, p.W, 0x4db4ff, 0.3));
    }
    scene.add(helpers); const g = scene.getObjectByName("grid"); if (g) g.visible = S.grid;
  }
  function updateSelBoxes() {
    selBoxes.forEach(b => scene.remove(b)); selBoxes = [];
    if (!S.sel || !B || !B.byId[S.sel]) return;
    for (const o of B.byId[S.sel]) { const b = new THREE.BoxHelper(o, 0xffb000); b.material.depthTest = false; b.renderOrder = 998; scene.add(b); selBoxes.push(b); }
  }
  function updateStats() {
    const el = $("#stats"); if (!el || !B) return;
    const bb = new THREE.Box3().setFromObject(B.hull), sz = bb.getSize(new THREE.Vector3()), p = profileOf(S.design.base);
    el.innerHTML = `Caisse : <b>${fmt(sz.x)} × ${fmt(sz.z)} × ${fmt(sz.y)} m</b> · ${S.design.parts.length} pièces` + (p ? `<br>Gabarit ${esc(p.key)} : ${p.L} × ${p.W} m — en jeu le char est mis à l'échelle <b>×${fmt(clamp(p.L / sz.x, .4, 3))}</b>` : "");
  }

  /* ───────────── Sélection / pièces ───────────── */
  const selPart = () => S.design.parts.find(p => p.id === S.sel) || null;
  function select(id) { S.sel = id; updateSelBoxes(); renderLeft(); renderRight(); }
  function addParts(list, grp) {
    for (const p of list) { if (grp) p.grp = grp; S.design.parts.push(p); }
    if (list.length) S.sel = list[0].id; touch(true); renderAll();
  }
  const dims = () => S.design.meta || TD.dimsFrom(profileOf(S.design.base) || { L: 6, W: 3, hullTop: 1.9, trackH: 1, tu: { l: 2.2, w: 2.2, h: .85, x: .2 }, gun: { len: 3.4, r: .05 } });
  function newPrimitive(type) {
    const D = dims(), g = S.addGrp, y = g === "hull" ? D.Ht + 0.25 : g === "turret" ? D.th + 0.2 : 0, x = g === "gun" ? D.gl * 0.4 : 0;
    const base = { name: TD.TYPES[type], grp: g, type, p: [x, y, 0], mirror: S.sym && type !== "gun", paint: type !== "gun", params: {} };
    const o = {
      box: { s: [0.7, 0.3, 0.6] }, cyl: { s: [0.4, 0.4, 0.4], params: { seg: 16, rt: 1 } }, sphere: { s: [0.5, 0.5, 0.5], params: { half: false } },
      wedge: { s: [0.9, 0.4, 0.8], params: { dir: 1 } }, prism: { s: [D.L * 0.9, 1, D.W * 0.7], p: [0, D.Ht * 0.6, 0], mirror: false, params: { pts: TD.PROFILES.classic.map(a => a.slice()), topW: 1, frontW: 1 } },
      tracks: { p: [0, D.tH / 2, D.W / 2 - 0.3], paint: false, col: "#2a2c2e", params: { len: D.L * 0.9, h: D.tH, w: 0.55, wr: D.tH * 0.36, nw: 6, fender: true, skirt: false } },
      gun: { paint: false, col: "#4a4e52", metal: 0.55, rough: 0.5, grp: "gun", p: [0, 0, 0], params: { len: D.gl, r: Math.max(0.04, D.gr), brake: "single", evac: false, sleeve: false, taper: 0.88 } }
    }[type];
    const part = TD.part(Object.assign(base, o, { params: Object.assign({}, base.params, o.params) }));
    if (o.p) part.p = o.p.slice(); if (o.s) part.s = o.s.slice();
    addParts([part]);
  }
  function duplicate(id) {
    const p = S.design.parts.find(x => x.id === id); if (!p) return;
    const c = JSON.parse(JSON.stringify(p)); c.id = TD.part({}).id; c.name = p.name + " (copie)"; c.p[0] += 0.3; c.p[1] += 0.0;
    S.design.parts.push(c); S.sel = c.id; touch(true); renderAll();
  }
  function remove(id) { const i = S.design.parts.findIndex(x => x.id === id); if (i < 0) return; S.design.parts.splice(i, 1); if (S.sel === id) S.sel = null; touch(true); renderAll(); }

  /* ───────────── Interaction 3D ───────────── */
  function ndc(e) { const r = $("#cv").getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  function pick(e) {
    if (!B) return null; ray.setFromCamera(ndc(e), camera);
    for (const h of ray.intersectObject(B.root, true)) if (h.object.userData.partId) return h; return null;
  }
  const isIn = (o, root) => { for (let n = o; n; n = n.parent) if (n === root) return true; return false; };
  function onDown(e) {
    $("#cv").setPointerCapture(e.pointerId);
    const h = e.button === 0 ? pick(e) : null;
    drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: false, hit: h, mode: e.button === 0 ? "orbit" : "pan" };
    const part = selPart();
    if (e.button === 0 && h && part && h.object.userData.partId === part.id && !part.locked) {
      pose.tur = 0; pose.gun = 0; $("#p-tur").value = 0; $("#p-gun").value = 0;
      const list = B.byId[part.id] || [];
      drag.mode = S.tool; drag.flip = list[1] && isIn(h.object, list[1]);
      drag.p0 = part.p.slice(); drag.r0 = part.r.slice(); drag.s0 = part.s.slice(); drag.pr0 = JSON.parse(JSON.stringify(part.params || {}));
      const n = camera.getWorldDirection(new THREE.Vector3()); drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, h.point); drag.pt0 = h.point.clone();
    }
  }
  const AXV = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, AXI = { x: 0, y: 1, z: 2 };
  const snapV = v => S.snap > 0 ? Math.round(v / S.snap) * S.snap : v;
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.mode === "orbit") { cam.theta -= (e.clientX - drag.x) * 0.0085; cam.phi = clamp(cam.phi + (e.clientY - drag.y) * 0.0065, -0.2, 1.52); drag.x = e.clientX; drag.y = e.clientY; return; }
    if (drag.mode === "pan") {
      const f = cam.dist * 0.0017, right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      cam.t.addScaledVector(right, -(e.clientX - drag.x) * f).addScaledVector(up, (e.clientY - drag.y) * f); drag.x = e.clientX; drag.y = e.clientY; return;
    }
    const part = selPart(); if (!part || !drag.moved) return;
    if (drag.mode === "move") {
      ray.setFromCamera(ndc(e), camera); const pt = new THREE.Vector3();
      if (!ray.ray.intersectPlane(drag.plane, pt)) return;
      let d = pt.sub(drag.pt0);
      if (S.axis) d = AXV[S.axis].clone().multiplyScalar(d.dot(AXV[S.axis]));
      if (drag.flip) d.z = -d.z;
      part.p = [snapV(drag.p0[0] + d.x), snapV(drag.p0[1] + d.y), snapV(drag.p0[2] + d.z)].map(v => Math.round(v * 1000) / 1000);
    } else if (drag.mode === "rotate") {
      const i = S.axis ? AXI[S.axis] : 1; let a = dx * 0.5; if (drag.flip && i < 2) a = -a;
      const v = drag.r0[i] + a; part.r = drag.r0.slice(); part.r[i] = S.snap > 0 ? Math.round(v / 5) * 5 : Math.round(v * 10) / 10;
    } else if (drag.mode === "scale") {
      const f = Math.exp(dx * 0.006);
      if (part.type === "gun" || part.type === "tracks") part.params.len = Math.max(0.3, Math.round(drag.pr0.len * f * 100) / 100);
      else { part.s = drag.s0.slice(); const ids = S.axis ? [AXI[S.axis]] : [0, 1, 2]; for (const i of ids) part.s[i] = Math.max(0.02, Math.round(snapV(drag.s0[i] * f) * 1000) / 1000 || 0.02); }
    }
    needRebuild = true; syncInspectorValues();
  }
  function onUp() {
    if (!drag) return;
    if (drag.mode === "orbit" && !drag.moved) { const id = drag.hit ? drag.hit.object.userData.partId : null; select(id); }
    else if (["move", "rotate", "scale"].includes(drag.mode) && drag.moved) { touch(true); renderRight(); }
    drag = null;
  }

  /* ───────────── Champs de l'inspecteur ───────────── */
  const getPath = (o, path) => path.split(".").reduce((a, k) => a == null ? a : a[k], o);
  function setPath(o, path, v) { const ks = path.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] === undefined) a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }
  const target = path => path.startsWith("d:") ? [S.design, path.slice(2)] : [selPart(), path];
  const valOf = path => { const [o, p] = target(path); return o ? getPath(o, p) : undefined; };
  const fnum = (label, path, step, min, max) => `<label class="f"><span data-sc="${path}">${label}</span><input type="number" data-path="${path}" step="${step}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""} value="${fmt(valOf(path))}"></label>`;
  const f3 = (label, path, step) => `<div class="f"><span>${label}</span><div class="f3">${["x", "y", "z"].map((a, i) => `<span class="ax ${a}" data-sc="${path}.${i}">${a.toUpperCase()}</span><input type="number" data-path="${path}.${i}" step="${step}" value="${fmt(valOf(path + "." + i))}">`).join("")}</div></div>`;
  const fchk = (label, path, re) => `<label class="f"><span>${label}</span><input type="checkbox" data-path="${path}" ${valOf(path) ? "checked" : ""} ${re ? 'data-re="1"' : ""}></label>`;
  const fsel = (label, path, opts, num) => `<label class="f"><span>${label}</span><select data-path="${path}" ${num ? 'data-t="n"' : ""}>${opts.map(([v, l]) => `<option value="${v}" ${String(valOf(path)) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
  const fcol = (label, path) => `<label class="f"><span>${label}</span><input type="color" data-path="${path}" value="${valOf(path) || "#888888"}"></label>`;
  const frange = (label, path, min, max, step) => `<label class="f"><span>${label}</span><input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${valOf(path) ?? min}"></label>`;

  function applyField(el, commit) {
    const path = el.dataset.path, [o, p] = target(path); if (!o) return;
    if (path === "_prof") { if (el.value && TD.PROFILES[el.value]) { o.params.pts = TD.PROFILES[el.value].map(a => a.slice()); touch(true); renderRight(); } return; }
    let v;
    if (el.type === "checkbox") v = el.checked; else if (el.type === "number" || el.type === "range" || el.dataset.t === "n") { v = parseFloat(el.value); if (isNaN(v)) return; if (/\.(nw|seg)$|^arr\.0$/.test(path)) v = Math.round(v); } else v = el.value;
    setPath(o, p, v);
    if (path === "d:name") { updateTitle(); }
    if (path === "d:tp.0" || path === "d:tp.1" || path === "d:gp.0" || path === "d:gp.1") needRebuild = true;
    touch(commit);
    if (commit && (el.dataset.re || path === "grp" || path === "name" || path === "type")) { renderRight(); renderLeft(); }
  }
  function syncInspectorValues() {
    document.querySelectorAll("#rbody input[data-path]").forEach(el => { if (el === document.activeElement) return; const v = valOf(el.dataset.path); if (el.type === "checkbox") el.checked = !!v; else if (v !== undefined) el.value = fmt(v); });
  }

  /* ───────────── Panneau gauche ───────────── */
  const TABS = [["parts", "Pièces"], ["add", "Ajouter"], ["lib", "Détails"], ["tank", "Char"]];
  function renderTabs() { $("#tabs").innerHTML = TABS.map(([id, l]) => `<button class="${S.tab === id ? "on" : ""}" data-a="tab" data-v="${id}">${l}</button>`).join(""); }
  function renderLeft() {
    renderTabs(); const el = $("#lbody"), d = S.design;
    if (S.tab === "parts") {
      el.innerHTML = Object.keys(TD.GROUPS).map(g => {
        const list = d.parts.filter(p => (p.grp || "hull") === g);
        return `<div class="og"><div class="oh">${TD.GROUPS[g]} <span class="muted">(${list.length})</span></div>${list.map(p => `<div class="row ${p.id === S.sel ? "sel" : ""} ${p.hidden ? "hid" : ""}" data-a="sel" data-id="${p.id}"><button data-a="hide" data-id="${p.id}" title="Afficher / masquer">${p.hidden ? "◌" : "●"}</button><span class="nm">${esc(p.name)}</span>${p.mirror || p.type === "tracks" ? "<i>⇋</i>" : ""}${p.arr && p.arr[0] > 1 ? `<i>×${p.arr[0]}</i>` : ""}<button data-a="dup" data-id="${p.id}" title="Dupliquer (Ctrl+D)">⧉</button><button data-a="del" data-id="${p.id}" title="Supprimer (Suppr)">✕</button></div>`).join("") || `<div class="muted" style="padding:2px 6px">vide</div>`}</div>`;
      }).join("") + `<div class="muted" style="margin-top:8px">Cliquez une pièce dans la vue 3D ou dans cette liste, puis faites-la glisser (G), pivoter (R) ou redimensionner (S).</div>`;
    } else if (S.tab === "add") {
      el.innerHTML = `<h4>Ajouter dans</h4><div class="grp" style="background:none;border:0;padding:0">${Object.keys(TD.GROUPS).map(g => `<button class="${S.addGrp === g ? "on" : ""}" data-a="addgrp" data-v="${g}">${TD.GROUPS[g]}</button>`).join("")}</div>
        <h4>Formes</h4><div class="pgrid">${Object.keys(TD.TYPES).map(t => `<button class="btn" data-a="add" data-v="${t}">＋ ${TD.TYPES[t]}</button>`).join("")}</div>
        <div class="muted" style="margin-top:10px"><b>Caisse</b> : plaques et superstructure. <b>Tourelle</b> : tourne avec le canon. <b>Canon</b> : lève et recule au tir.<br><br><b>Profil de caisse</b> : un polygone vu de côté, modifiable point par point : idéal pour un glacis incliné.<br><b>Train de roulement</b> : chenille, galets, barbotin, garde-boue et jupes, en symétrie.</div>
        <h4>Symétrie</h4><label class="f"><span style="width:auto">Nouvelles pièces symétriques</span><input type="checkbox" id="symchk" ${S.sym ? "checked" : ""}></label>`;
    } else if (S.tab === "lib") {
      const sec = (g, t) => `<h4>${t}</h4>` + TD.LIB.filter(x => x.g === g).map(x => `<div class="lib"><span>${x.n}</span><button class="btn sm" data-a="lib" data-v="${x.id}">Ajouter</button></div>`).join("");
      el.innerHTML = sec("turret", "Tourelle") + sec("hull", "Caisse") + `<div class="muted">Chaque détail est placé automatiquement d'après les dimensions du char, puis reste modifiable comme n'importe quelle pièce.</div>`;
    } else {
      const p = profileOf(d.base);
      const pa = d.paint || (d.paint = {}); if (pa.wear === undefined) { pa.wear = 0.35; pa.mud = 0.3; pa.dust = 0.2; pa.rust = 0.08; }
      el.innerHTML = `<h4>Gabarit de référence</h4><label class="f" style="display:block"><select id="basesel" style="width:100%;background:var(--raised);color:var(--text);border:1px solid var(--line-strong);padding:5px">${tankSelectHTML(d.base, true)}</select></label>
        <div class="muted" id="stats" style="margin-top:6px"></div>
        <h4>Axes de pivot</h4>${fnum("Tourelle X", "d:tp.0", 0.01)}${fnum("Tourelle Y", "d:tp.1", 0.01)}${fnum("Canon X", "d:gp.0", 0.01)}${fnum("Canon Y", "d:gp.1", 0.01)}
        <div class="muted">● ambre : axe de rotation de la tourelle · ● bleu : axe d'élévation du canon. La culasse doit rester à l'intérieur de la tourelle.</div>
        <h4>Peinture</h4><div class="pal">${TD.PALETTES.map((c, i) => `<button data-a="pal" data-v="${i}" title="${c.n}" style="background:${c.c1}"><i style="background:${c.c2}"></i></button>`).join("")}</div>
        ${fcol("Couleur 1", "d:paint.c1")}${fcol("Couleur 2", "d:paint.c2")}${fcol("Couleur 3", "d:paint.c3")}
        ${fsel("Camouflage", "d:paint.camo", Object.entries(TD.CAMOS))}<div class="btnrow"><button class="btn sm" data-a="seed">Autre motif</button></div>
        <h4>Usure et saleté</h4>${frange("Usure", "d:paint.wear", 0, 1, 0.01)}${frange("Boue", "d:paint.mud", 0, 1, 0.01)}${frange("Poussière", "d:paint.dust", 0, 1, 0.01)}${frange("Rouille", "d:paint.rust", 0, 1, 0.01)}
        <div class="muted">Éraflures, boue sur le bas de caisse et les chenilles, poussière, coulures de rouille : visibles aussi en jeu, avec la météo.</div>
        <h4>Repartir d'un modèle</h4><label class="f" style="display:block"><select id="stylesel" style="width:100%;background:var(--raised);color:var(--text);border:1px solid var(--line-strong);padding:5px">${Object.entries(TD.STYLES).map(([k, s]) => `<option value="${k}">${s.n}</option>`).join("")}</select></label>
        <div class="btnrow"><button class="btn sm danger" data-a="regen">Remplacer toutes les pièces</button></div>
        <div class="muted" style="margin-top:6px">Génère un char complet aux dimensions du gabarit choisi : un bon point de départ à affiner.</div>`;
      updateStats();
    }
    const sc = $("#symchk"); if (sc) sc.onchange = () => { S.sym = sc.checked; };
    const bs = $("#basesel"); if (bs) bs.onchange = () => { d.base = bs.value || null; const p2 = profileOf(d.base); if (p2) d.meta = TD.dimsFrom(p2); touch(true); renderLeft(); };
  }

  /* ───────────── Inspecteur ───────────── */
  function renderRight() {
    const el = $("#rbody"), p = selPart();
    if (!p) { el.innerHTML = `<h4>Aucune sélection</h4><div class="muted">Cliquez une pièce du char pour la modifier.<br><br><b>Souris</b><br>• Clic gauche : sélectionner<br>• Glisser sur la pièce choisie : la déplacer<br>• Glisser ailleurs : tourner autour du char<br>• Clic droit / molette cliquée : déplacer la vue<br>• Molette : zoom<br><br><b>Clavier</b><br>G / R / S : déplacer, pivoter, échelle<br>X / Y / Z : verrouiller un axe<br>Flèches : pousser la pièce (Maj = ×10)<br>Ctrl+D dupliquer · Suppr effacer<br>Ctrl+Z / Ctrl+Y annuler / rétablir<br>Ctrl+S enregistrer · F cadrer</div>`; return; }
    const P = p.params || (p.params = {});
    if (!p.arr) p.arr = [1, 0, 0, 0];
    if (p.type === "box" && !P.taper) P.taper = [1, 1]; if (p.type === "box" && P.skew === undefined) P.skew = 0;
    if (p.type === "cyl") { if (P.seg === undefined) P.seg = 16; if (P.rt === undefined) P.rt = 1; }
    if (p.type === "prism") { if (P.topW === undefined) P.topW = 1; if (P.frontW === undefined) P.frontW = 1; }
    if (p.type === "gun") { if (P.taper === undefined) P.taper = 0.85; if (!P.brake) P.brake = "none"; }
    let h = `<h4>${TD.TYPES[p.type] || p.type}</h4><label class="f"><span>Nom</span><input type="text" data-path="name" value="${esc(p.name)}"></label>${fsel("Groupe", "grp", Object.entries(TD.GROUPS))}`;
    h += `<h4>Transformation</h4>${f3("Position", "p", 0.01)}${f3("Rotation °", "r", 1)}`;
    if (["box", "cyl", "sphere", "wedge", "prism"].includes(p.type)) h += f3("Taille", "s", 0.01);
    h += `<h4>Forme</h4>`;
    if (p.type === "box") h += fnum("Rétrécir haut X", "params.taper.0", 0.01, 0.2, 1.6) + fnum("Rétrécir haut Z", "params.taper.1", 0.01, 0.2, 1.6) + fnum("Inclinaison haut", "params.skew", 0.01, -0.5, 0.5);
    if (p.type === "cyl") h += fnum("Facettes", "params.seg", 1, 3, 40) + fnum("Rayon haut ×", "params.rt", 0.01, 0, 1.6);
    if (p.type === "sphere") h += fchk("Demi-sphère (dôme)", "params.half");
    if (p.type === "wedge") h += fsel("Pente vers", "params.dir", [[1, "l'avant (haut devant)"], [-1, "l'arrière (haut derrière)"]], true);
    if (p.type === "prism") h += fnum("Rétrécir le haut", "params.topW", 0.01, 0.3, 1.2) + fnum("Rétrécir l'avant", "params.frontW", 0.01, 0.3, 1.2) + `<div class="muted" style="margin:6px 0 3px">Profil de côté (avant à droite) · glisser un point · double-clic : ajouter · Maj+clic : supprimer</div><canvas id="prof" width="296" height="130"></canvas>${fsel("Profil prêt à l'emploi", "_prof", [["", "— choisir —"], ...Object.keys(TD.PROFILES).map(k => [k, { classic: "Classique", sloped: "Profilé (glacis long)", boxy: "Cubique (lourd)", modern: "Moderne" }[k]])])}`;
    if (p.type === "tracks") h += fnum("Longueur", "params.len", 0.05, 1) + fnum("Hauteur", "params.h", 0.05, 0.3) + fnum("Largeur", "params.w", 0.01, 0.15) + fnum("Rayon galets", "params.wr", 0.01, 0.1) + fnum("Nb galets", "params.nw", 1, 2, 14) + fchk("Garde-boue", "params.fender") + fchk("Jupe latérale", "params.skirt") + `<div class="muted">Toujours symétrique. Position Z = écart au centre.</div>`;
    if (p.type === "gun") h += fnum("Longueur", "params.len", 0.05, 0.5) + fnum("Rayon", "params.r", 0.005, 0.02) + fnum("Effilement", "params.taper", 0.01, 0.4, 1.2) + fsel("Frein de bouche", "params.brake", [["none", "Aucun"], ["muzzle", "Embout simple"], ["single", "Simple chambre"], ["double", "Double chambre"], ["tbrake", "En T (Patton)"], ["slotted", "À fentes"]]) + fchk("Évacuateur de fumées", "params.evac") + fchk("Manchon thermique", "params.sleeve");
    h += `<h4>Matière</h4>`;
    if (p.type !== "tracks") h += fchk("Peinture du char", "paint", true);
    if (!p.paint && p.type !== "tracks") h += fcol("Couleur", "col");
    if (p.type !== "tracks") h += frange("Métal", "metal", 0, 1, 0.01) + frange("Rugosité", "rough", 0.1, 1, 0.01);
    else h += `<div class="muted">Chenilles, roues : matière automatique. Garde-boue et jupes prennent la peinture du char.</div>`;
    if (p.type !== "tracks") h += `<h4>Symétrie et répétition</h4>` + fchk("Symétrique (gauche/droite)", "mirror") + fnum("Copies", "arr.0", 1, 1, 40) + `<div class="f"><span>Pas</span><div class="f3">${["x", "y", "z"].map((a, i) => `<span class="ax ${a}" data-sc="arr.${i + 1}">${a.toUpperCase()}</span><input type="number" data-path="arr.${i + 1}" step="0.01" value="${fmt(valOf("arr." + (i + 1)))}">`).join("")}</div></div>`;
    h += `<div class="btnrow"><button class="btn sm" data-a="dup" data-id="${p.id}">Dupliquer</button><button class="btn sm" data-a="zero" data-id="${p.id}">Centrer Z</button><button class="btn sm" data-a="rot0" data-id="${p.id}">Rotation 0</button><button class="btn sm danger" data-a="del" data-id="${p.id}">Supprimer</button></div>`;
    el.innerHTML = h;
    if (p.type === "prism") { drawProf(); profEvents(); }
  }

  /* éditeur de profil (polygone vu de côté) */
  function drawProf() {
    const c = $("#prof"), p = selPart(); if (!c || !p) return;
    const x = c.getContext("2d"), W = c.width, H = c.height, m = 12, pts = p.params.pts || TD.DEF_PROFILE, X = v => m + v * (W - 2 * m), Y = v => H - m - v * (H - 2 * m);
    x.clearRect(0, 0, W, H); x.strokeStyle = "rgba(190,215,230,.12)"; x.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { x.beginPath(); x.moveTo(X(i / 10), Y(0)); x.lineTo(X(i / 10), Y(1)); x.moveTo(X(0), Y(i / 10)); x.lineTo(X(1), Y(i / 10)); x.stroke(); }
    x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.closePath(); x.fillStyle = "rgba(255,176,0,.16)"; x.fill(); x.strokeStyle = "#ffb000"; x.lineWidth = 2; x.stroke();
    x.fillStyle = "#fff"; pts.forEach(q => { x.beginPath(); x.arc(X(q[0]), Y(q[1]), 4.5, 0, 6.3); x.fill(); });
    x.fillStyle = "#93a1ab"; x.font = "11px sans-serif"; x.fillText("arrière", 4, H - 1); x.fillText("avant", W - 34, H - 1);
  }
  function profEvents() {
    const c = $("#prof"); if (!c) return; let di = -1;
    const pos = e => { const r = c.getBoundingClientRect(), sx = c.width / r.width, m = 12; return [clamp(((e.clientX - r.left) * sx - m) / (c.width - 2 * m), 0, 1), clamp(1 - ((e.clientY - r.top) * sx - m) / (c.height - 2 * m), 0, 1)]; };
    const near = (pts, q) => { let bi = -1, bd = 0.06; pts.forEach((a, i) => { const d = Math.hypot(a[0] - q[0], (a[1] - q[1]) * 0.6); if (d < bd) { bd = d; bi = i; } }); return bi; };
    c.onpointerdown = e => {
      const p = selPart(); if (!p) return; if (!p.params.pts) p.params.pts = TD.DEF_PROFILE.map(a => a.slice()); const q = pos(e), i = near(p.params.pts, q);
      if (e.shiftKey && i >= 0 && p.params.pts.length > 3) { p.params.pts.splice(i, 1); touch(true); drawProf(); return; }
      if (i >= 0) { di = i; c.setPointerCapture(e.pointerId); }
    };
    c.onpointermove = e => { if (di < 0) return; const p = selPart(), q = pos(e); p.params.pts[di] = [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]; needRebuild = true; drawProf(); };
    c.onpointerup = () => { if (di >= 0) { di = -1; touch(true); } };
    c.ondblclick = e => {
      const p = selPart(), q = pos(e), pts = p.params.pts; let bi = 0, bd = 9;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1]); if (d < bd) { bd = d; bi = i; } }
      pts.splice(bi + 1, 0, [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]); touch(true); drawProf();
    };
  }

  /* ───────────── Barres d'outils de la vue ───────────── */
  const VIEWS = { "3/4": [0.75, 0.32], Côté: [Math.PI / 2, 0.02], Dessus: [Math.PI / 2, 1.5], Face: [0, 0.08], Arrière: [Math.PI, 0.08] };
  function frame() { if (!B) return; const bb = new THREE.Box3().setFromObject(B.root); if (bb.isEmpty()) return; const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()); cam.t.copy(c); cam.dist = clamp(Math.max(s.x, s.z * 1.4, s.y * 2) * 1.35 + 2, 5, 40); }
  function renderBars() {
    $("#views").innerHTML = Object.keys(VIEWS).map(k => `<button data-a="view" data-v="${k}">${k}</button>`).join("") + `<button data-a="frame" title="Cadrer (F)">Cadrer</button>`;
    $("#toggles").innerHTML = [["grid", "Grille"], ["ref", "Gabarit"], ["wire", "Fil de fer"]].map(([k, l]) => `<button class="${S[k] ? "on" : ""}" data-a="tog" data-v="${k}">${l}</button>`).join("");
    $("#tools").innerHTML = [["move", "Déplacer", "G"], ["rotate", "Pivoter", "R"], ["scale", "Échelle", "S"]].map(([k, l, key]) => `<button class="${S.tool === k ? "on" : ""}" data-a="tool" data-v="${k}" title="Touche ${key}">${l}</button>`).join("");
    $("#axes").innerHTML = `<span>Axe</span>` + ["x", "y", "z"].map(a => `<button class="${S.axis === a ? "on" : ""}" data-a="axis" data-v="${a}">${a.toUpperCase()}</button>`).join("") + `<button class="${!S.axis ? "on" : ""}" data-a="axis" data-v="">libre</button>`;
    $("#hint").textContent = "Clic : sélectionner · Glisser la pièce choisie : " + { move: "déplacer", rotate: "pivoter", scale: "redimensionner" }[S.tool] + (S.axis ? " sur l'axe " + S.axis.toUpperCase() : "") + " · Glisser le fond : orbiter · Clic droit : déplacer la vue · Molette : zoom";
  }

  /* ───────────── Actions ───────────── */
  const A = {
    tab: d => { S.tab = d.v; renderLeft(); }, sel: d => select(d.id), hide: (d, b, e) => { e.stopPropagation(); const p = S.design.parts.find(x => x.id === d.id); p.hidden = !p.hidden; touch(true); renderLeft(); },
    dup: (d, b, e) => { e.stopPropagation(); duplicate(d.id); }, del: (d, b, e) => { e.stopPropagation(); remove(d.id); },
    add: d => newPrimitive(d.v), addgrp: d => { S.addGrp = d.v; renderLeft(); },
    lib: d => { const it = TD.LIB.find(x => x.id === d.v); addParts(it.make(dims())); toast(it.n + " ajouté"); },
    view: d => { cam.theta = VIEWS[d.v][0]; cam.phi = VIEWS[d.v][1]; }, frame: () => frame(),
    tog: d => { S[d.v] = !S[d.v]; if (d.v === "wire") needRebuild = true; else buildHelpers(); renderBars(); },
    tool: d => { S.tool = d.v; renderBars(); }, axis: d => { S.axis = d.v || null; renderBars(); },
    pal: d => { const c = TD.PALETTES[+d.v]; Object.assign(S.design.paint, { c1: c.c1, c2: c.c2, c3: c.c3 }); touch(true); renderLeft(); },
    seed: () => { S.design.paint.seed = (Math.random() * 9999) | 0; if (S.design.paint.camo === "none") S.design.paint.camo = "woodland"; touch(true); renderLeft(); },
    zero: d => { const p = selPart(); p.p[2] = 0; touch(true); renderRight(); }, rot0: d => { const p = selPart(); p.r = [0, 0, 0]; touch(true); renderRight(); },
    regen: () => {
      if (!confirm("Remplacer toutes les pièces actuelles par un modèle de départ ?")) return;
      const st = $("#stylesel").value, d = TD.starter(st, profileOf(S.design.base), S.design.name); d.id = S.design.id; d.paint = S.design.paint; d.base = S.design.base; S.design = d; S.sel = null; touch(true); renderAll(); frame();
    }
  };
  function delegate(root) { root.addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (!b || b.disabled) return; const f = A[b.dataset.a]; if (f) f(b.dataset, b, e); }); }

  /* ───────────── Fichiers, modales ───────────── */
  function modal(html) { const m = $("#modal"); m.innerHTML = `<div class="mbox">${html}</div>`; m.classList.remove("hidden"); m.onclick = e => { if (e.target === m) closeModal(); }; }
  function closeModal() { $("#modal").classList.add("hidden"); $("#modal").innerHTML = ""; }
  function save(silent) {
    const d = S.design; d.name = d.name.trim() || "Sans nom"; const id = TD.save(d); S.dirty = false; updateTitle(); try { localStorage.removeItem("tankDesignDraft"); } catch (e) { }
    let msg = "Enregistré";
    if (d.base && !TD.activeMap()[d.base]) { TD.setActive(d.base, id); msg += " et activé pour " + d.base; }
    if (!silent) toast(msg); return id;
  }
  function openList() {
    const all = Object.values(TD.all()).sort((a, b) => (b.updated || 0) - (a.updated || 0)), act = TD.activeMap();
    modal(`<h3>Mes chars</h3>${all.map(d => { const on = Object.keys(act).filter(k => act[k] === d.id); return `<div class="dl"><b>${esc(d.name)}${on.map(k => `<span class="tag">${esc(k)}</span>`).join("")}<br><small>${d.parts.length} pièces · ${new Date(d.updated || 0).toLocaleString("fr-FR")}</small></b><button class="btn sm" data-m="open" data-id="${d.id}">Ouvrir</button><button class="btn sm danger" data-m="del" data-id="${d.id}">Supprimer</button></div>`; }).join("") || `<div class="empty">Aucun char enregistré pour l'instant.</div>`}<div class="btnrow"><button class="btn sm" data-m="close">Fermer</button></div>`);
  }
  function openNew() {
    modal(`<h3>Nouveau char</h3><div class="muted" style="margin-bottom:8px">Choisissez un gabarit (dimensions du véhicule du jeu) et un style de départ.</div><label class="f" style="display:block"><select id="n-base" style="width:100%;background:var(--raised);color:var(--text);border:1px solid var(--line-strong);padding:6px">${tankSelectHTML(S.design.base || Object.keys(TECH_TREE)[0], true)}</select></label><h4>Style de départ</h4><div class="pgrid">${Object.entries(TD.STYLES).map(([k, s]) => `<button class="btn" data-m="new" data-v="${k}">${s.n}</button>`).join("")}</div><div class="btnrow"><button class="btn sm" data-m="close">Annuler</button></div>`);
    $("#n-base").onchange = () => { };
  }
  function newDesign(style, baseKey) {
    const p = profileOf(baseKey), d = TD.starter(style || styleFor(p), p, baseKey ? baseKey + " — version perso" : "Nouveau char");
    S.design = d; S.sel = null; S.hist = []; S.hi = -1; S.dirty = false; snap(); needRebuild = true; renderAll(); setTimeout(frame, 30);
  }
  function openApply() {
    const id = save(true), act = TD.activeMap(), d = S.design;
    const mine = Object.keys(act).filter(k => act[k] === id);
    modal(`<h3>Utiliser en jeu</h3><div class="muted" style="margin-bottom:8px">Le char <b>${esc(d.name)}</b> remplacera l'apparence du véhicule choisi dans le hangar et au combat (les statistiques ne changent pas). Il sera mis à l'échelle sur les dimensions du véhicule.</div><label class="f" style="display:block"><select id="a-tank" style="width:100%;background:var(--raised);color:var(--text);border:1px solid var(--line-strong);padding:6px">${tankSelectHTML(d.base, false)}</select></label><div class="btnrow"><button class="btn sm primary" data-m="apply">Activer pour ce véhicule</button></div>${mine.length ? `<h4>Actuellement actif sur</h4>${mine.map(k => `<div class="dl"><b>${esc(k)}</b><button class="btn sm danger" data-m="unapply" data-v="${esc(k)}">Retirer</button></div>`).join("")}` : ""}<div class="btnrow"><button class="btn sm" data-m="close">Fermer</button></div>`);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-m]"); if (!b) return; const a = b.dataset.m;
    if (a === "close") closeModal();
    else if (a === "open") { const d = TD.get(b.dataset.id); if (d) { S.design = d; S.sel = null; S.hist = []; S.hi = -1; S.dirty = false; snap(); needRebuild = true; closeModal(); renderAll(); setTimeout(frame, 30); } }
    else if (a === "del") { if (confirm("Supprimer ce char ?")) { TD.remove(b.dataset.id); if (S.design.id === b.dataset.id) S.design.id = null; openList(); } }
    else if (a === "new") { const k = $("#n-base").value || null; if (S.dirty && !confirm("Abandonner les modifications non enregistrées ?")) return; closeModal(); newDesign(b.dataset.v, k); }
    else if (a === "apply") { const k = $("#a-tank").value; TD.setActive(k, S.design.id); S.design.base = S.design.base || k; toast("Actif sur " + k + " — visible dans le hangar et au combat"); openApply(); }
    else if (a === "unapply") { TD.setActive(b.dataset.v, null); openApply(); }
  });
  function exportJSON() {
    const blob = new Blob([JSON.stringify(S.design, null, 1)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = (S.design.name || "char").replace(/[^\w\-]+/g, "_") + ".tankdesign.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importJSON(file) {
    const r = new FileReader(); r.onload = () => {
      try {
        const d = JSON.parse(r.result); if (!d || !Array.isArray(d.parts)) throw new Error("format");
        d.id = null; d.paint = d.paint || { c1: "#5b6b3a", c2: "#3d4a27", c3: "#7e8a52", camo: "none", seed: 1 }; d.tp = d.tp || [0, 1.9]; d.gp = d.gp || [1, 0.5];
        S.design = d; S.sel = null; S.hist = []; S.hi = -1; snap(); S.dirty = true; needRebuild = true; renderAll(); setTimeout(frame, 30); toast("Char importé");
      } catch (e) { toast("Fichier invalide"); }
    }; r.readAsText(file);
  }
  function screenshot() { renderer.render(scene, camera); const a = document.createElement("a"); a.href = renderer.domElement.toDataURL("image/png"); a.download = (S.design.name || "char").replace(/[^\w\-]+/g, "_") + ".png"; a.click(); }

  /* ───────────── Clavier ───────────── */
  window.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase(), typing = tag === "input" && e.target.type !== "range" && e.target.type !== "checkbox" || tag === "textarea" || tag === "select";
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === "KeyS") { e.preventDefault(); save(); return; }
    if (typing) return;
    if (ctrl && e.code === "KeyZ") { e.preventDefault(); e.shiftKey ? restore(S.hi + 1) : restore(S.hi - 1); return; }
    if (ctrl && e.code === "KeyY") { e.preventDefault(); restore(S.hi + 1); return; }
    if (ctrl && e.code === "KeyD") { e.preventDefault(); if (S.sel) duplicate(S.sel); return; }
    const k = e.code, p = selPart();
    if (k === "KeyG") { S.tool = "move"; renderBars(); } else if (k === "KeyR") { S.tool = "rotate"; renderBars(); } else if (k === "KeyS" && !ctrl) { S.tool = "scale"; renderBars(); }
    else if (k === "KeyX" || k === "KeyY" || k === "KeyZ") { const a = k.slice(3).toLowerCase(); S.axis = S.axis === a ? null : a; renderBars(); }
    else if (k === "Escape") { S.axis = null; select(null); renderBars(); }
    else if (k === "KeyF") frame();
    else if (k === "Delete" || k === "Backspace") { if (S.sel) { e.preventDefault(); remove(S.sel); } }
    else if (p && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(k)) {
      e.preventDefault(); const st = (S.snap > 0 ? S.snap : 0.02) * (e.shiftKey ? 10 : 1);
      if (k === "ArrowRight") p.p[0] += st; else if (k === "ArrowLeft") p.p[0] -= st; else if (k === "ArrowUp") p.p[2] -= st; else if (k === "ArrowDown") p.p[2] += st; else if (k === "PageUp") p.p[1] += st; else p.p[1] -= st;
      p.p = p.p.map(v => Math.round(v * 1000) / 1000); touch(true); renderRight();
    }
  });
  window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ───────────── Initialisation de l'interface ───────────── */
  function renderAll() { renderBars(); renderLeft(); renderRight(); $("#dname").value = S.design.name; updateTitle(); }
  function initUI() {
    delegate($("#left")); delegate($("#right")); delegate($("#vp"));
    document.addEventListener("input", e => { const el = e.target; if (el.dataset && el.dataset.path && !el.dataset.noinput) applyField(el, false); });
    document.addEventListener("change", e => { const el = e.target; if (el.dataset && el.dataset.path) applyField(el, true); });
    $("#dname").oninput = e => { S.design.name = e.target.value; S.dirty = true; updateTitle(); }; $("#dname").onchange = () => touch(true);
    $("#snap").onchange = e => { S.snap = parseFloat(e.target.value); };
    $("#p-tur").oninput = e => { pose.tur = +e.target.value; }; $("#p-gun").oninput = e => { pose.gun = +e.target.value; };
    $("#p-fire").onclick = () => { pose.rec = 1; }; $("#p-roll").onclick = e => { S.roll = !S.roll; e.target.classList.toggle("on", S.roll); };
    $("#b-new").onclick = openNew; $("#b-open").onclick = openList; $("#b-save").onclick = () => save(); $("#b-apply").onclick = openApply;
    $("#b-export").onclick = exportJSON; $("#b-import").onclick = () => $("#f-import").click(); $("#f-import").onchange = e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; }; $("#b-shot").onclick = screenshot;
    // « glisser sur l'étiquette » pour faire varier une valeur
    let sc = null;
    document.addEventListener("pointerdown", e => {
      const t = e.target.closest("[data-sc]"); if (!t) return; const inp = document.querySelector(`input[data-path="${t.dataset.sc}"]`); if (!inp) return;
      sc = { inp, x: e.clientX, v: parseFloat(inp.value) || 0, step: parseFloat(inp.step) || 0.01, min: inp.min !== "" ? +inp.min : -1e9, max: inp.max !== "" ? +inp.max : 1e9 }; t.setPointerCapture(e.pointerId); e.preventDefault();
    });
    document.addEventListener("pointermove", e => { if (!sc) return; const v = clamp(sc.v + Math.round((e.clientX - sc.x) / 3) * sc.step * (e.shiftKey ? 5 : 1), sc.min, sc.max); sc.inp.value = fmt(v); sc.inp.dispatchEvent(new Event("input", { bubbles: true })); });
    document.addEventListener("pointerup", () => { if (!sc) return; sc.inp.dispatchEvent(new Event("change", { bubbles: true })); sc = null; });
  }

  window.addEventListener("DOMContentLoaded", () => {
    initUI(); initScene();
    const q = new URLSearchParams(location.search); let d = null;
    if (q.get("id")) d = TD.get(q.get("id"));
    if (!d && q.get("tank") && TECH_TREE[q.get("tank")]) { d = TD.activeFor(q.get("tank")); if (!d) { newDesign(null, q.get("tank")); return; } }
    if (!d && !q.get("tank")) { try { d = JSON.parse(localStorage.getItem("tankDesignDraft")); if (d) toast("Brouillon restauré"); } catch (e) { d = null; } }
    if (d && Array.isArray(d.parts)) { S.design = d; snap(); S.dirty = false; renderAll(); setTimeout(frame, 30); } else newDesign("sloped", "T-34 (1941)");
  });
})();
