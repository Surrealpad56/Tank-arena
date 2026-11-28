/* ==========================================================================
   LOBBY-ACCOUNT.JS — Section « Compte » : connexion / inscription, état de la sauvegarde
   en ligne, sauvegarde par fichier, amis (demandes, état en ligne, rejoindre leur salon).
   Cœur du système : account.js.
   ========================================================================== */
const SecCompte = (function () {
  const E = escHTML;
  const S = { el: null, mode: "login", msg: null, err: null, friends: null, busy: false, timer: null, health: null };
  const fdate = t => t ? new Date(t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "jamais";
  const alive = () => S.el && S.el.isConnected && S.el.classList.contains("on");

  function metaLine(m) { return `${fmt(m.xpe || 0)} XP gagnés à vie · ${m.res || 0} véhicule${m.res > 1 ? "s" : ""} recherché${m.res > 1 ? "s" : ""}${m.tank ? " · " + E(m.tank) : ""}`; }
  const stateBadge = () => {
    if (Account.pending) return `<span class="tag amber">choix à faire</span>`;
    if (Account.state === "sending") return `<span class="tag">envoi…</span>`;
    if (Account.state === "error") return `<span class="tag" style="border-color:var(--bad,#ff6b5e);color:var(--bad,#ff6b5e)">erreur</span>`;
    return Account.isDirty() ? `<span class="tag amber">modifications non envoyées</span>` : `<span class="tag ok">à jour</span>`;
  };

  /* ───── Vues ───── */
  function viewOut() {
    const reg = S.mode === "register", warn = S.health && S.health.persistent === false
      ? `<div class="note" style="border-color:var(--warn,#ff8a3d);margin-bottom:12px"><b>Stockage non durable.</b> Ce serveur enregistre les comptes dans un simple fichier : sur un hébergement gratuit (Render) ils peuvent être effacés à chaque redémarrage. Branchez Upstash (gratuit) : voir <code>HEBERGER_GRATUITEMENT.md</code>.</div>` : "";
    return `<div class="sl-grid"><div class="card cut"><h3>${reg ? "Créer un compte" : "Connexion"}</h3><div class="body">
        <div class="seg" style="margin-bottom:14px"><button class="${!reg ? "on" : ""}" data-a="mode" data-v="login">J'ai un compte</button><button class="${reg ? "on" : ""}" data-a="mode" data-v="register">Nouveau compte</button></div>${warn}
        <div class="field"><div><b>Pseudo</b><small>3 à 16 caractères : lettres, chiffres, - et _</small></div><input class="inp" id="ac-name" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false" value="${E(S.nameVal || "")}"></div>
        <div class="field"><div><b>Mot de passe</b><small>6 caractères minimum</small></div><input class="inp" id="ac-pass" type="password" maxlength="100" autocomplete="${reg ? "new-password" : "current-password"}"></div>
        ${reg ? `<div class="field"><div><b>Confirmer</b></div><input class="inp" id="ac-pass2" type="password" maxlength="100" autocomplete="new-password"></div>` : ""}
        ${S.err ? `<div class="note" style="border-color:var(--bad,#ff6b5e);margin-top:10px">${E(S.err)}</div>` : ""}
        <div style="margin-top:14px"><button class="btn primary big" data-a="submit" ${S.busy ? "disabled" : ""}>${S.busy ? "…" : reg ? "Créer mon compte" : "Me connecter"}</button></div>
        <div class="muted" style="margin-top:12px;font-size:13px;line-height:1.5">Aucun e-mail demandé. Choisissez un pseudo sans nom réel et un mot de passe que vous n'utilisez nulle part ailleurs. Le mot de passe est stocké haché, jamais en clair.</div></div></div>
      <div><div class="card"><h3>Pourquoi un compte ?</h3><div class="body"><div class="muted" style="line-height:1.6">• Votre progression (XP, chars débloqués, statistiques, succès, chars de l'Atelier) se retrouve sur <b>n'importe quel ordinateur</b>.<br>• Une <b>liste d'amis</b> : voyez qui est en ligne et rejoignez leur salon.<br>• Votre pseudo est <b>protégé</b> : personne d'autre ne peut l'utiliser.</div></div></div>${fileCard()}</div></div>`;
  }
  const fileCard = () => `<div class="card" style="margin-top:16px"><h3>Sauvegarde par fichier</h3><div class="body"><div class="muted" style="margin-bottom:10px;line-height:1.5">Sans compte, emportez votre progression dans un fichier.</div><div class="btnrow-sl" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-a="export">Exporter ma progression</button><button class="btn" data-a="import">Importer un fichier</button></div><input type="file" id="ac-file" accept=".json,application/json" hidden></div></div>`;

  function viewIn() {
    const i = Account.info, sv = i && i.save, loc = Account.localMeta(), pend = Account.pending;
    const ask = pend ? `<div class="card" style="border-color:var(--amber);margin-bottom:16px"><h3 style="color:var(--amber)">Deux sauvegardes différentes</h3><div class="body">
        <div class="muted" style="margin-bottom:12px;line-height:1.5">Ce compte a déjà une progression en ligne, et cet ordinateur en a une autre. Laquelle garder ? <b>L'autre sera remplacée.</b></div>
        <div class="sl-teams"><div class="sl-team tA" style="padding:12px"><b>Sauvegarde du compte</b><div class="muted">${metaLine(pend.server)}<br>${fdate(pend.server.t)}</div><button class="btn primary" style="margin-top:10px" data-a="resolve" data-v="server">Charger celle du compte</button></div>
        <div class="sl-team tB" style="padding:12px"><b>Cet ordinateur</b><div class="muted">${metaLine(pend.local)}<br>(en cours)</div><button class="btn" style="margin-top:10px" data-a="resolve" data-v="local">Garder cet ordinateur</button></div></div></div></div>` : "";
    return `${ask}<div class="sl-grid"><div>
      <div class="card cut"><h3>Mon compte</h3><div class="body">
        <div class="kv"><span>Pseudo</span><b>✔ ${E(Account.name())}</b></div>
        <div class="kv"><span>Membre depuis</span><b>${fdate(i && i.user.created)}</b></div>
        <div class="kv"><span>Sauvegarde en ligne</span><b>${sv ? fdate(sv.t) : "aucune"}</b></div>
        ${sv ? `<div class="kv"><span>Contenu</span><b style="text-align:right">${metaLine(sv)}</b></div>` : ""}
        <div class="kv"><span>État</span><b id="ac-state">${stateBadge()}</b></div>
        ${i && i.persistent === false ? `<div class="note" style="border-color:var(--warn,#ff8a3d);margin-top:10px">Stockage non durable sur ce serveur : les comptes peuvent disparaître au redémarrage. Voir <code>HEBERGER_GRATUITEMENT.md</code>.</div>` : ""}
        ${S.msg ? `<div class="note" style="margin-top:10px">${E(S.msg)}</div>` : ""}${S.err ? `<div class="note" style="border-color:var(--bad,#ff6b5e);margin-top:10px">${E(S.err)}</div>` : ""}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-a="push" ${S.busy ? "disabled" : ""}>Sauvegarder maintenant</button><button class="btn" data-a="pull" ${sv ? "" : "disabled"}>Charger la sauvegarde du compte</button>${typeof Account !== "undefined" && Account.isAdmin && Account.isAdmin() ? `<a class="btn" href="admin.html" style="text-decoration:none">Administration</a>` : ""}</div>
        <div class="muted" style="margin-top:10px;font-size:13px">La sauvegarde part automatiquement quelques secondes après chaque partie ou recherche.</div></div></div>
      <div class="card" style="margin-top:16px"><h3>Sécurité</h3><div class="body">
        <div class="field"><div><b>Changer le mot de passe</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><input class="inp" id="ac-old" type="password" placeholder="actuel" autocomplete="current-password" style="min-width:0;width:130px"><input class="inp" id="ac-new" type="password" placeholder="nouveau" autocomplete="new-password" style="min-width:0;width:130px"><button class="btn" data-a="chpw">OK</button></div></div>
        <div class="field"><div><b>Se déconnecter</b><small>Sur un ordinateur partagé, effacez aussi la progression locale</small></div><div style="display:flex;gap:8px"><button class="btn" data-a="logout" data-w="1">Déconnexion + effacer ce PC</button><button class="btn" data-a="logout" data-w="0">Déconnexion</button></div></div>
        <div class="field"><div><b>Supprimer mon compte</b><small>Efface le compte, la sauvegarde en ligne et vos liens d'amitié. Irréversible.</small></div><button class="btn" data-a="delacc" style="border-color:var(--bad,#ff6b5e);color:var(--bad,#ff6b5e)">Supprimer…</button></div></div></div>
      ${fileCard()}
    </div><div><div class="card"><h3>Amis <span class="num muted" id="ac-fcount"></span></h3><div class="body">
      <div style="margin-bottom:8px"><b>Ajouter un ami</b> <span class="muted" style="font-size:13px">· son pseudo exact</span><div style="display:flex;gap:6px;margin-top:6px"><input class="inp" id="ac-add" maxlength="16" autocapitalize="off" spellcheck="false" style="flex:1;min-width:0"><button class="btn" data-a="fadd">Ajouter</button></div></div>
      <div id="ac-friends">${friendsHTML()}</div></div></div></div></div>`;
  }

  function friendsHTML() {
    const f = S.friends; if (!f) return `<div class="muted">Chargement…</div>`;
    let h = "";
    if (f.incoming.length) h += `<h4 style="margin:6px 0">Demandes reçues</h4>` + f.incoming.map(n => `<div class="sl-pl"><b>${E(n)}</b><span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-a="fresp" data-n="${E(n)}" data-v="1">Accepter</button><button class="btn sm" data-a="fresp" data-n="${E(n)}" data-v="0">Refuser</button></span></div>`).join("");
    h += `<h4 style="margin:10px 0 6px">Mes amis</h4>` + (f.friends.map(x => {
      const r = x.room, canJoin = r && !r.full && (r.state === "lobby" || (r.state === "playing" && r.late));
      return `<div class="sl-pl"><span class="sl-dot ${x.online ? "" : "off"}"></span><b>${E(x.name)}</b><small>${x.online ? E(x.where) + (r ? " · " + E(r.name) : "") : "hors ligne"}</small>${canJoin ? `<button class="btn sm" data-a="fjoin" data-id="${E(r.id)}" data-l="${r.locked ? 1 : 0}" data-rn="${E(r.name)}">Rejoindre</button>` : ""}<button class="sl-x" data-a="frem" data-n="${E(x.name)}" title="Retirer">✕</button></div>`;
    }).join("") || `<div class="muted">Aucun ami pour l'instant : ajoutez-en avec leur pseudo.</div>`);
    if (f.outgoing.length) h += `<h4 style="margin:10px 0 6px">Demandes envoyées</h4>` + f.outgoing.map(n => `<div class="sl-pl"><b>${E(n)}</b><small>en attente</small></div>`).join("");
    return h;
  }

  /* ───── Dessin / rafraîchissement ───── */
  function draw() {
    if (!S.el) return;
    const keep = document.activeElement && S.el.contains(document.activeElement) && document.activeElement.id ? { id: document.activeElement.id, v: document.activeElement.value } : null;
    S.el.innerHTML = Account.loggedIn() ? viewIn() : viewOut();
    if (keep) { const n = S.el.querySelector("#" + keep.id); if (n) { n.value = keep.v; n.focus(); } }
    const c = S.el.querySelector("#ac-fcount"); if (c && S.friends) c.textContent = S.friends.friends.length;
  }
  async function loadFriends() {
    if (!Account.loggedIn()) return; try { S.friends = await Account.friends(); } catch (e) { if (!S.friends) S.friends = { friends: [], incoming: [], outgoing: [] }; }
    const box = S.el && S.el.querySelector("#ac-friends"); if (box && alive()) { box.innerHTML = friendsHTML(); const c = S.el.querySelector("#ac-fcount"); if (c) c.textContent = S.friends.friends.length; }
  }
  function tick() { clearTimeout(S.timer); if (!alive()) return; loadFriends(); const st = S.el.querySelector("#ac-state"); if (st) st.innerHTML = stateBadge(); S.timer = setTimeout(tick, 5000); }

  const wrap = async fn => { S.busy = true; S.err = null; S.msg = null; draw(); try { await fn(); } catch (e) { S.err = e.message; } S.busy = false; draw(); };
  const A = {
    mode: d => { S.mode = d.v; S.err = null; draw(); },
    submit: () => {
      const n = S.el.querySelector("#ac-name").value.trim(), p = S.el.querySelector("#ac-pass").value, p2 = S.el.querySelector("#ac-pass2");
      if (p2 && p2.value !== p) { S.err = "Les deux mots de passe ne correspondent pas."; return draw(); }
      wrap(async () => { const r = await (S.mode === "register" ? Account.register(n, p) : Account.login(n, p)); S.friends = null; if (r.reload) { location.reload(); return; } if (r.did === "ok" || r.did === "pushed") S.msg = "Connecté. Votre progression est synchronisée."; refreshHeader(); loadFriends(); });
    },
    push: () => wrap(async () => { const j = await Account.push(); S.msg = j && j.conflict ? "Un autre appareil a sauvegardé entre-temps : choisissez ci-dessus." : "Progression sauvegardée en ligne."; }),
    pull: () => { if (!confirm("Remplacer la progression de cet ordinateur par la sauvegarde du compte ?")) return; wrap(async () => { await Account.pull(); location.reload(); }); },
    resolve: d => wrap(async () => { const r = await Account.resolve(d.v); if (r && r.reload) location.reload(); else S.msg = "Cet ordinateur est maintenant la référence du compte."; }),
    logout: d => { const w = d.w === "1"; if (w && !confirm("Effacer la progression de cet ordinateur ? (elle reste sur votre compte)")) return; wrap(async () => { await Account.logout(w); S.friends = null; if (w) { location.reload(); } }); },
    chpw: () => wrap(async () => { await Account.changePassword(S.el.querySelector("#ac-old").value, S.el.querySelector("#ac-new").value); S.msg = "Mot de passe modifié."; }),
    delacc: () => {
      const p = prompt("Supprimer définitivement le compte « " + Account.name() + " » ?\nTapez votre mot de passe pour confirmer :"); if (!p) return;
      const keep = confirm("Garder la progression sur CET ordinateur ?\nOK = la garder · Annuler = l'effacer aussi"); wrap(async () => { await Account.deleteAccount(p, !keep); S.friends = null; S.msg = "Compte supprimé."; if (!keep) location.reload(); });
    },
    export: () => Account.exportFile(),
    import: () => S.el.querySelector("#ac-file").click(),
    fadd: () => { const n = S.el.querySelector("#ac-add").value.trim(); if (!n) return; wrap(async () => { const r = await Account.addFriend(n); S.friends = r; S.msg = r.msg; }); },
    fresp: d => wrap(async () => { const r = await Account.respondFriend(d.n, d.v === "1"); S.friends = r; S.msg = r.msg; }),
    frem: d => { if (!confirm("Retirer " + d.n + " de vos amis ?")) return; wrap(async () => { const r = await Account.removeFriend(d.n); S.friends = r; S.msg = r.msg; }); },
    fjoin: d => { Store.setCfg({ mode: "multi" }); Nav.go("play"); Salons.joinRoom(d.id, d.l === "1", d.rn); }
  };

  function render(el) {
    S.el = el; S.err = null; S.msg = null;
    if (!S.health) fetch("/api/health", { cache: "no-store" }).then(r => r.json()).then(h => { S.health = h; if (!Account.loggedIn() && alive()) draw(); }).catch(() => { });
    if (Account.loggedIn()) Account.refresh().then(() => { if (alive()) draw(); });
    el.onclick = e => { const b = e.target.closest("[data-a]"); if (!b || b.disabled) return; const f = A[b.dataset.a]; if (f) f(b.dataset); };
    el.oninput = e => { if (e.target.id === "ac-name") S.nameVal = e.target.value; };
    el.onkeydown = e => { if (e.key === "Enter" && (e.target.id === "ac-name" || e.target.id === "ac-pass" || e.target.id === "ac-pass2")) A.submit(); else if (e.key === "Enter" && e.target.id === "ac-add") A.fadd(); };
    el.onchange = e => { if (e.target.id === "ac-file" && e.target.files[0]) Account.importFile(e.target.files[0]).then(m => { alert("Progression importée (" + m.xpe + " XP).\nLa page va se recharger."); location.reload(); }).catch(err => { S.err = err.message; draw(); }); };
    draw(); tick();
  }
  Account.on(() => { if (alive()) { const st = S.el.querySelector("#ac-state"); if (st) st.innerHTML = stateBadge(); } });
  return { render };
})();
