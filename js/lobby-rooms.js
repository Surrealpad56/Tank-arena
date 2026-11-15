/* ==========================================================================
   LOBBY-ROOMS.JS — Multijoueur : salons actifs, joueurs en ligne, salle d'attente.
   • Liste des salons (hôte, carte, joueurs, équipes, bots, règles) rafraîchie toutes les ~2,5 s.
   • Création d'un salon avec toutes les options ; l'HÔTE contrôle carte, bots, score, difficulté,
     règle des équipes, mot de passe, expulsions et lancement. Les autres voient les options
     verrouillées (🔒) et gèrent leur char, leur équipe (si autorisé) et « prêt ».
   • Choix de l'équipe : libre / automatique / placée par l'hôte.
   Protocole : voir server.js (WebSocket, messages hello / create / join / cfg / team / ready / kick / start…).
   ========================================================================== */
const Salons = (function () {
  const E = escHTML, S = { root: null, ws: null, ok: false, rooms: [], online: [], room: null, you: null, chat: [], pollT: null, retryT: null, err: null, launching: false, tankSent: null };
  const TM = { free: "Libre : chacun choisit", auto: "Automatique : équilibrée", host: "Placées par l'hôte" };
  const TM_HINT = { free: "Chaque joueur choisit son équipe (limite : moitié des places par équipe).", auto: "Le serveur équilibre les équipes à l'arrivée ; seul l'hôte peut déplacer un joueur.", host: "Seul l'hôte place les joueurs dans les équipes." };
  const DIFF = { easy: "Facile", normal: "Normal", hard: "Difficile" };
  const themeName = t => t === "random" ? "Aléatoire" : ((typeof MAP_THEME_META !== "undefined" && MAP_THEME_META[t] && MAP_THEME_META[t].name) || (typeof MAP_THEME_LABELS !== "undefined" && MAP_THEME_LABELS[t]) || t);
  const form = { rname: "", pass: "", team: "A", cfg: { theme: "random", botsA: 0, botsB: 2, difficulty: "normal", scoreToWin: 10, respawnBots: true, maxPlayers: 8, teamMode: "free", caps: true, allowLate: true } };

  const cid = () => { let c = localStorage.getItem("MpCid"); if (!c) { c = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9-]/gi, ""); localStorage.setItem("MpCid", c); } return c; };
  const base = () => (location.protocol === "https:" ? "https://" : "http://") + Multi.server();
  const me = () => S.room && S.room.members.find(m => m.mid === S.you);
  const isHost = () => { const m = me(); return !!(m && m.host); };
  const send = o => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); };

  /* ───── Connexion ───── */
  function connect() {
    if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)) return;
    let ws; try { ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + Multi.server()); } catch (e) { S.ok = false; S.err = "Adresse du serveur invalide."; return; }
    S.ws = ws;
    ws.onopen = () => { S.ok = true; S.err = null; send({ t: "hello", cid: cid(), name: Store.name(), token: Account.token() }); draw(); if (S.pendingJoin) { const f = S.pendingJoin; S.pendingJoin = null; setTimeout(f, 250); } };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    ws.onclose = () => { S.ok = false; if (S.ws === ws) S.ws = null; if (alive()) { draw(); clearTimeout(S.retryT); S.retryT = setTimeout(connect, 2500); } };
    ws.onerror = () => { };
  }
  const alive = () => S.root && S.root.isConnected;
  function onMsg(m) {
    if (m.t === "room") { S.room = m.room; S.you = m.you; if (m.room.chat) S.chat = m.room.chat.slice(); S.err = null; if (m.room.state === "lobby") S.launching = false; draw(); }
    else if (m.t === "hi") { S.room = null; S.you = null; S.chat = []; draw(); }
    else if (m.t === "chat") { S.chat.push(m.m); if (S.chat.length > 60) S.chat.shift(); drawChat(); }
    else if (m.t === "err") { S.err = m.msg; toast(m.msg); draw(); }
    else if (m.t === "kicked") { S.room = null; S.you = null; toast(m.why || "Vous avez quitté le salon"); draw(); }
    else if (m.t === "start") { S.room = m.room; launchRoom(m.room); }
  }
  async function poll() {
    if (!alive()) return stop();
    try { const r = await fetch(base() + "/api/lobby?cid=" + encodeURIComponent(cid()) + "&name=" + encodeURIComponent(Store.name()), { cache: "no-store", headers: Account.headers() }); const d = await r.json(); S.rooms = d.rooms; S.online = d.online; S.pollOk = true; }
    catch (e) { S.pollOk = false; }
    if (alive() && !S.launching) draw(true);
    S.pollT = setTimeout(poll, 2500);
  }
  function stop() { clearTimeout(S.pollT); clearTimeout(S.retryT); if (S.ws) { const w = S.ws; S.ws = null; w.onclose = null; try { w.close(); } catch (e) { } } S.ok = false; }

  /* ───── Lancement de l'arène ───── */
  function launchRoom(room) {
    if (S.launching) return; S.launching = true;
    const c = room.cfg, a = { mode: "multi", theme: c.theme, allies: 0, enemies: 0, difficulty: c.difficulty, scoreToWin: c.scoreToWin, respawnBots: c.respawnBots, caps: c.caps, net: { server: Multi.server(), room: room.id } };
    toast("La partie démarre…"); localStorage.setItem("arenaConfig", JSON.stringify(a)); setTimeout(() => { location.href = "arena.html"; }, 350);
  }

  /* ───── Rendu : options (créateur / hôte / lecture seule) ───── */
  function ctl(k, cfg, ed) {
    const v = cfg[k];
    const seg = opts => `<div class="seg">${opts.map(([x, l]) => `<button class="${String(v) === String(x) ? "on" : ""}" data-sa="opt" data-k="${k}" data-v="${x}">${l}</button>`).join("")}</div>`;
    const stp = (mn, mx) => `<div class="stepper"><button data-sa="step" data-k="${k}" data-d="-1" data-mn="${mn}" data-mx="${mx}">−</button><output>${v}</output><button data-sa="step" data-k="${k}" data-d="1" data-mn="${mn}" data-mx="${mx}">+</button></div>`;
    const tog = () => `<button class="toggle ${v ? "on" : ""}" data-sa="tog" data-k="${k}" aria-label="${k}"></button>`;
    switch (k) {
      case "theme": return `<select class="inp" data-sel="theme"><option value="random" ${v === "random" ? "selected" : ""}>Aléatoire</option>${MAP_THEMES.map(t => `<option value="${t}" ${v === t ? "selected" : ""}>${E(themeName(t))}</option>`).join("")}</select>`;
      case "botsA": return stp(0, 8); case "botsB": return stp(0, 8); case "maxPlayers": return stp(2, 12);
      case "difficulty": return seg([["easy", "Facile"], ["normal", "Normal"], ["hard", "Difficile"]]);
      case "scoreToWin": return seg([[5, "5"], [10, "10"], [15, "15"], [20, "20"], [30, "30"]]);
      case "teamMode": return seg([["free", "Libre"], ["auto", "Auto"], ["host", "Hôte"]]);
      case "respawnBots": case "caps": case "allowLate": return tog();
    }
  }
  const showVal = (k, v) => ({ theme: themeName(v), difficulty: DIFF[v], teamMode: TM[v], respawnBots: v ? "Oui" : "Non", caps: v ? "Oui" : "Non", allowLate: v ? "Oui" : "Non", scoreToWin: "Premier à " + v })[k] ?? String(v);
  const ROWS = [
    ["theme", "Carte", "Le terrain de la partie"], ["maxPlayers", "Joueurs maximum", "Places humaines dans le salon"],
    ["teamMode", "Choix des équipes", null], ["botsA", "Bots équipe A", "Chars IA gérés par l'hôte"], ["botsB", "Bots équipe B", "Chars IA gérés par l'hôte"],
    ["difficulty", "Difficulté de l'IA", "Précision et cadence de tir des bots"], ["scoreToWin", "Score à atteindre", "Destructions + zones capturées"],
    ["respawnBots", "Réapparition des bots", "Les bots détruits reviennent"], ["caps", "Zones de capture", "Désactivées : combat pur, les bots traquent l'ennemi"], ["allowLate", "Entrée en cours de partie", "Un joueur peut rejoindre un match commencé"]
  ];
  function optRows(cfg, ed, hostName) {
    return ROWS.map(([k, l, h]) => `<div class="field"><div><b>${l}</b><small>${k === "teamMode" ? TM_HINT[cfg.teamMode] : h}</small></div>${ed ? ctl(k, cfg, true) : `<span class="sl-ro" title="Réglé par l'hôte (${E(hostName || "?")})">🔒 ${E(showVal(k, cfg[k]))}</span>`}</div>`).join("");
  }

  /* ───── Rendu : liste des salons ───── */
  function roomCard(r) {
    const full = r.players >= r.max, playing = r.state === "playing", cannotLate = playing && !r.late;
    const teamBtns = r.teamMode === "free" && !full && !cannotLate
      ? `<button class="btn" data-sa="join" data-id="${r.id}" data-team="A">Rejoindre A <span class="muted">(${r.a})</span></button><button class="btn" data-sa="join" data-id="${r.id}" data-team="B">Rejoindre B <span class="muted">(${r.b})</span></button>`
      : `<button class="btn primary" data-sa="join" data-id="${r.id}" ${full || cannotLate ? "disabled" : ""}>${full ? "Complet" : cannotLate ? "En cours" : "Rejoindre"}</button>`;
    return `<div class="sl-room ${playing ? "playing" : ""}"><div class="sl-rh"><b>${r.locked ? "🔒 " : ""}${E(r.name)}</b><span class="tag ${playing ? "amber" : ""}">${playing ? "En cours" : "En préparation"}</span></div>
      <div class="sl-meta"><span>Hôte : <b>${E(r.host)}</b></span><span>${E(themeName(r.theme))}</span><span>${r.online}/${r.max} joueurs</span><span>${DIFF[r.difficulty]}</span><span>Premier à ${r.score}</span></div>
      <div class="sl-meta"><span class="sl-ta">A : ${r.a} + ${r.botsA} bot${r.botsA > 1 ? "s" : ""}</span><span class="sl-tb">B : ${r.b} + ${r.botsB} bot${r.botsB > 1 ? "s" : ""}</span><span>Équipes : ${E(TM[r.teamMode].split(":")[0])}</span></div>
      <div class="sl-act">${teamBtns}</div></div>`;
  }
  const netNote = () => S.pollOk === false || !S.ok ? `<div class="note" style="border-color:var(--warn,#ff8a3d)"><b>${S.pollOk === false ? "Serveur introuvable." : "Connexion au serveur…"}</b> ${S.pollOk === false ? "Vérifiez l'adresse ci-dessous ou lancez <code>node server.js</code> sur le PC hôte." : ""}</div>` : "";
  const roomsHTML = () => netNote() + (S.rooms.map(roomCard).join("") || `<div class="muted" style="padding:6px 2px">Aucun salon pour l'instant : créez le premier avec le formulaire.</div>`);
  const statusHTML = () => `<span style="color:${S.ok && S.pollOk !== false ? "var(--ok,#6fdc8c)" : "var(--warn,#ff8a3d)"}">${S.ok && S.pollOk !== false ? "● connecté" : "● hors ligne"}</span>`;
  function viewList() {
    const adv = location.protocol === "https:" ? "" : `<div class="field"><div><b>Adresse du serveur</b><small>Affichée par « node server.js » (ex. 192.168.1.23:3000)</small></div><input class="inp" data-in="srv" value="${E(Multi.server())}" autocapitalize="off" spellcheck="false"></div>`;
    return `<div class="sl-grid"><div>
      <div class="card"><h3>Salons ouverts <span class="num muted" id="sl-count">${S.rooms.length}</span></h3><div class="body" id="sl-rooms">${roomsHTML()}</div></div>
      <div class="card" style="margin-top:16px"><h3>Créer un salon</h3><div class="body">
        <div class="field"><div><b>Nom du salon</b><small>Visible dans la liste</small></div><input class="inp" data-in="rname" maxlength="24" placeholder="Salon de ${E(Store.name())}" value="${E(form.rname)}"></div>
        <div class="field"><div><b>Mot de passe</b><small>Facultatif : seuls ceux qui le connaissent entrent</small></div><input class="inp" data-in="pass" maxlength="20" value="${E(form.pass)}" autocomplete="off"></div>
        <div class="field"><div><b>Votre équipe</b><small>Vous serez l'hôte</small></div><div class="seg"><button class="${form.team === "A" ? "on" : ""}" data-sa="fteam" data-v="A">Équipe A</button><button class="${form.team === "B" ? "on" : ""}" data-sa="fteam" data-v="B">Équipe B</button></div></div>
        ${optRows(form.cfg, true)}
        <div style="margin-top:12px"><button class="btn primary big" data-sa="create" ${S.ok ? "" : "disabled"}>Créer le salon</button></div></div></div>
    </div><div>
      <div class="card"><h3>Votre profil</h3><div class="body">
        <div class="field"><div><b>Votre nom</b><small>Visible par les autres joueurs</small></div><input class="inp" data-in="name" maxlength="16" value="${E(Store.name())}" ${Account.loggedIn() ? "disabled title=\"Nom du compte\"" : ""}></div>${Account.loggedIn() ? `<div class="kv"><span>Compte</span><b style="color:var(--ok,#6fdc8c)">✔ ${E(Account.name())}</b></div>` : `<div class="note" style="margin:8px 0">Jouez en invité ou <a href="#" data-sa="gocompte">connectez-vous</a> pour garder votre progression et retrouver vos amis.</div>`}
        <div class="kv"><span>Véhicule</span><b>${E(Store.tank())}</b></div>${adv}
        <div class="kv"><span>Serveur</span><b id="sl-status">${statusHTML()}</b></div></div></div>
      <div class="card" style="margin-top:16px"><h3>Joueurs en ligne <span class="num muted" id="sl-ocount">${S.online.length}</span></h3><div class="body" id="sl-online">${onlineHTML()}</div></div>
    </div></div>`;
  }
  const onlineHTML = () => S.online.map(p => `<div class="sl-pl"><span class="sl-dot"></span><b>${E(p.name)}</b><small>${p.room ? E(p.where) + " · " + E(p.room) : E(p.where)}</small></div>`).join("") || `<div class="muted">Personne d'autre pour l'instant.</div>`;

  /* ───── Rendu : salle d'attente ───── */
  function memberRow(m, r, mine, host) {
    const canSelf = m.mid === S.you && (host || r.cfg.teamMode === "free") && r.state === "lobby";
    const other = m.team === "A" ? "B" : "A";
    const acts = [];
    if (r.state === "lobby" && (canSelf || (host && m.mid !== S.you))) acts.push(`<button data-sa="team" data-mid="${m.mid}" data-t="${other}" title="Changer d'équipe">→ ${other}</button>`);
    if (host && m.mid !== S.you) acts.push(`<button data-sa="mkhost" data-mid="${m.mid}" title="Donner l'hôte">👑</button>`, `<button data-sa="kick" data-mid="${m.mid}" title="Expulser">✕</button>`);
    return `<div class="sl-m ${m.mid === S.you ? "me" : ""}"><span class="sl-dot ${m.online ? "" : "off"}" title="${m.online ? "connecté" : "déconnecté"}"></span><b>${m.host ? "👑 " : ""}${E(m.name)}${m.mid === S.you ? " (vous)" : ""}</b><small>${E(m.key || "")}</small>
      ${m.inGame ? `<span class="tag amber">en jeu</span>` : m.host ? "" : m.ready ? `<span class="tag ok">prêt</span>` : `<span class="tag">attente</span>`}<span class="sl-macts">${acts.join("")}</span></div>`;
  }
  function viewRoom() {
    const r = S.room, mm = me(), host = isHost(), hostM = r.members.find(m => m.host), cap = Math.ceil(r.cfg.maxPlayers / 2);
    const col = t => { const list = r.members.filter(m => m.team === t).sort((a, b) => b.host - a.host); const bots = t === "A" ? r.cfg.botsA : r.cfg.botsB;
      return `<div class="sl-team t${t}"><div class="sl-th">Équipe ${t} <span class="muted">${list.length}/${cap}</span>${bots ? `<span class="tag">+${bots} bot${bots > 1 ? "s" : ""}</span>` : ""}</div>${list.map(m => memberRow(m, r, mm, host)).join("") || `<div class="muted" style="padding:8px">Aucun joueur</div>`}</div>`; };
    const notReady = r.members.filter(m => !m.host && !m.ready && m.online).length;
    const playing = r.state === "playing";
    let cta;
    if (playing) cta = `<button class="btn primary big" data-sa="enter">Rejoindre la partie en cours</button>${host ? `<button class="btn" data-sa="reset">Rouvrir le salon</button>` : ""}`;
    else if (host) cta = `<button class="btn primary big" data-sa="start">Lancer la partie</button><span class="muted">${notReady ? notReady + " joueur" + (notReady > 1 ? "s" : "") + " pas prêt" + (notReady > 1 ? "s" : "") : "Tout le monde est prêt"} · ${r.members.length} joueur${r.members.length > 1 ? "s" : ""}</span>`;
    else cta = `<button class="btn ${mm && mm.ready ? "" : "primary"} big" data-sa="ready">${mm && mm.ready ? "Annuler « prêt »" : "Je suis prêt"}</button><span class="muted">En attente du lancement par ${E(hostM ? hostM.name : "l'hôte")}</span>`;
    const ctrl = host
      ? `<div class="sl-who host">Vous êtes <b>l'hôte</b> : vous réglez la carte, les bots, le score, la difficulté, les équipes, vous expulsez et lancez la partie.</div>`
      : `<div class="sl-who">Les options sont réglées par l'hôte <b>👑 ${E(hostM ? hostM.name : "?")}</b> (🔒). Vous gérez <b>votre char</b>, <b>votre équipe</b>${r.cfg.teamMode === "free" ? "" : " <i>(verrouillée par l'hôte)</i>"}, « prêt » et le chat.</div>`;
    return `<div class="sl-banner"><div><div class="sl-title">${r.locked ? "🔒 " : ""}${E(r.name)} <span class="tag ${playing ? "amber" : ""}">${playing ? "Partie en cours" : "En préparation"}</span></div>${ctrl}${S.err ? `<div class="note" style="margin-top:8px;border-color:var(--warn,#ff8a3d)">${E(S.err)}</div>` : ""}</div>
        <div class="sl-cta">${cta}<button class="btn" data-sa="leave">Quitter le salon</button></div></div>
      <div class="sl-grid room"><div>
        <div class="sl-teams">${col("A")}${col("B")}</div>
        ${host && !playing ? `<div class="btnrow-sl"><button class="btn" data-sa="balance">Équilibrer les équipes</button></div>` : ""}
        <div class="card" style="margin-top:16px"><h3>Discussion</h3><div class="body"><div class="sl-chat" id="sl-chat"></div><input class="inp" id="sl-say" maxlength="200" placeholder="Écrire un message…" style="width:100%;margin-top:8px" autocomplete="off"></div></div>
      </div><div>
        <div class="card"><h3>Options du salon ${host ? "" : "🔒"}</h3><div class="body">
          ${host ? `<div class="field"><div><b>Nom</b></div><input class="inp" data-in="rrname" maxlength="24" value="${E(r.name)}"></div><div class="field"><div><b>Mot de passe</b><small>${r.locked ? "Actif" : "Aucun"}</small></div><input class="inp" data-in="rpass" maxlength="20" placeholder="${r.locked ? "nouveau mot de passe…" : "facultatif"}" autocomplete="off"></div>` : ""}
          ${optRows(r.cfg, host && !playing, hostM && hostM.name)}
          ${playing && host ? `<div class="muted">Les options sont figées pendant la partie.</div>` : ""}</div></div>
        <div class="card" style="margin-top:16px"><h3>Joueurs en ligne <span class="num muted">${S.online.length}</span></h3><div class="body" id="sl-online">${onlineHTML()}</div></div>
      </div></div>`;
  }

  /* ───── Dessin ───── */
  function drawChat() {
    const el = S.root && S.root.querySelector("#sl-chat"); if (!el) return; const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.innerHTML = S.chat.map(c => c.sys ? `<div class="sl-c sys">${E(c.text)}</div>` : `<div class="sl-c"><b class="${c.team === "B" ? "tb" : "ta"}">${E(c.from)}</b> ${E(c.text)}</div>`).join(""); if (stick) el.scrollTop = el.scrollHeight;
  }
  function draw(soft) {
    if (!alive()) return;
    const root = S.root, ae = document.activeElement, keep = ae && root.contains(ae) && (ae.dataset.in || ae.id) ? { sel: ae.dataset.in ? `[data-in="${ae.dataset.in}"]` : "#" + ae.id, v: ae.value, s: ae.selectionStart } : null;
    if (soft) {            // rafraîchissement automatique : on ne touche qu'aux zones dynamiques (un menu déroulant ouvert ne se ferme pas)
      const set = (id, h) => { const n = root.querySelector(id); if (n && n.innerHTML !== h) n.innerHTML = h; };
      set("#sl-online", onlineHTML()); if (!S.room) { set("#sl-rooms", roomsHTML()); set("#sl-status", statusHTML()); const c = root.querySelector("#sl-count"); if (c) c.textContent = S.rooms.length; }
      const oc = root.querySelector("#sl-ocount"); if (oc) oc.textContent = S.online.length; return;
    }
    root.innerHTML = S.room ? viewRoom() : viewList();
    if (keep) { const n = root.querySelector(keep.sel); if (n) { n.value = keep.v; n.focus(); try { n.setSelectionRange(keep.s, keep.s); } catch (e) { } } }
    if (S.room) { drawChat(); const mm = me(); const k = Store.tank(); if (mm && mm.key !== k && S.tankSent !== k) { S.tankSent = k; send({ t: "tank", key: k }); } }
  }

  /* ───── Actions ───── */
  const A = {
    join: d => { const r = S.rooms.find(x => x.id === d.id); let pass = ""; if (r && r.locked) { pass = prompt("Mot de passe du salon « " + r.name + " » :") || ""; if (!pass) return; } send({ t: "join", room: d.id, pass, team: d.team, name: Store.name(), key: Store.tank() }); },
    create: () => { send({ t: "create", rname: form.rname, pass: form.pass, cfg: form.cfg, team: form.team, name: Store.name(), key: Store.tank() }); },
    fteam: d => { form.team = d.v; draw(); },
    leave: () => send({ t: "leave" }), ready: () => { const m = me(); send({ t: "ready", v: !(m && m.ready) }); },
    start: () => { const t = S.room.cfg.theme === "random" ? MAP_THEMES[Math.floor(Math.random() * MAP_THEMES.length)] : undefined; send({ t: "start", theme: t }); },
    reset: () => send({ t: "reset" }), balance: () => send({ t: "balance" }), enter: () => launchRoom(S.room),
    team: d => send({ t: "team", mid: d.mid, team: d.t }), kick: d => { if (confirm("Expulser ce joueur du salon ?")) send({ t: "kick", mid: d.mid }); }, mkhost: d => { if (confirm("Donner l'hôte à ce joueur ? Vous perdrez le contrôle des options.")) send({ t: "host", mid: d.mid }); },
    opt: d => setOpt(d.k, isNaN(+d.v) ? d.v : +d.v), step: d => { const cur = (S.room ? S.room.cfg : form.cfg)[d.k]; setOpt(d.k, Math.max(+d.mn, Math.min(+d.mx, cur + +d.d))); },
    tog: d => setOpt(d.k, !(S.room ? S.room.cfg : form.cfg)[d.k]), gocompte: () => Nav.go("compte")
  };
  function setOpt(k, v) { if (S.room) { if (isHost()) send({ t: "cfg", cfg: { [k]: v } }); } else { form.cfg[k] = v; draw(); } }

  function mount(root) {
    if (S.root !== root) { S.root = root; root.onclick = e => { const b = e.target.closest("[data-sa]"); if (!b || b.disabled) return; const f = A[b.dataset.sa]; if (f) { e.preventDefault(); f(b.dataset); } }; }
    root.onchange = e => {
      const t = e.target;
      if (t.dataset.sel === "theme") return setOpt("theme", t.value);
      const k = t.dataset.in; if (!k) return;
      if (k === "name") { Store.setName(t.value); send({ t: "hello", cid: cid(), name: Store.name(), token: Account.token() }); }
      else if (k === "srv") { Multi.setServer(t.value); stop(); connect(); poll(); }
      else if (k === "rname") form.rname = t.value; else if (k === "pass") form.pass = t.value;
      else if (k === "rrname") send({ t: "cfg", rname: t.value }); else if (k === "rpass") send({ t: "cfg", pass: t.value });
    };
    root.onkeydown = e => { if (e.target.id === "sl-say" && e.key === "Enter") { const v = e.target.value.trim(); if (v) send({ t: "chat", text: v }); e.target.value = ""; } };
    clearTimeout(S.pollT); poll(); connect(); draw();
  }
  /* Rejoindre un salon précis (depuis la liste d'amis) */
  function joinRoom(id, locked, rname) {
    const go = () => { let pass = ""; if (locked) { pass = prompt("Mot de passe du salon « " + (rname || "") + " » :") || ""; if (!pass) return; } send({ t: "join", room: id, pass, key: Store.tank() }); };
    if (S.ok) go(); else S.pendingJoin = go;
  }
  Account.on(() => { if (S.ok) send({ t: "hello", cid: cid(), name: Store.name(), token: Account.token() }); });
  return { mount, stop, joinRoom, state: S };
})();
