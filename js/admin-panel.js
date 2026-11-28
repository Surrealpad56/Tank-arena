/* Panneau d'administration — réservé au compte Surrealpad. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const gate = $("gate"), app = $("app");
  let selected = null, users = [];

  function showMsg(el, text, kind) {
    el.classList.remove("hidden", "err", "ok");
    if (kind) el.classList.add(kind);
    el.textContent = text;
  }

  function fmtDate(t) {
    if (!t) return "—";
    try { return new Date(t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); }
    catch (e) { return "—"; }
  }

  function requireAdmin() {
    if (!Account.loggedIn()) return false;
    if (!Account.isAdmin()) {
      showMsg($("g-msg"), "Ce compte n'est pas administrateur.", "err");
      return false;
    }
    return true;
  }

  function enterApp() {
    gate.classList.add("hidden");
    app.classList.remove("hidden");
    $("who").textContent = Account.name();
    loadUsers();
  }

  async function trySession() {
    if (!Account.loggedIn()) return;
    try {
      const me = await Account.api("GET", "/api/me");
      if (me.admin || Account.isAdmin()) enterApp();
      else showMsg($("g-msg"), "Connecté en tant que " + Account.name() + " — pas de droits admin.", "err");
    } catch (e) {
      showMsg($("g-msg"), e.message || "Session invalide", "err");
    }
  }

  $("g-login").onclick = async () => {
    const n = $("g-name").value.trim();
    const p = $("g-pass").value;
    showMsg($("g-msg"), "Connexion…");
    try {
      await Account.login(n, p);
      if (!Account.isAdmin()) {
        showMsg($("g-msg"), "Compte connecté, mais ce n'est pas Surrealpad.", "err");
        return;
      }
      enterApp();
    } catch (e) {
      showMsg($("g-msg"), e.message || "Échec", "err");
    }
  };

  $("b-logout").onclick = async () => {
    try { await Account.logout(); } catch (e) { }
    location.reload();
  };

  $("b-refresh").onclick = () => loadUsers();

  async function loadUsers() {
    $("users-body").innerHTML = "<tr><td colspan='7' class='muted'>Chargement…</td></tr>";
    try {
      const r = await Account.adminUsers();
      users = r.users || [];
      $("users-meta").textContent = users.length + " compte(s) · stockage " + (r.storage || "?");
      if (!users.length) {
        $("users-body").innerHTML = "<tr><td colspan='7' class='muted'>Aucun compte.</td></tr>";
        return;
      }
      $("users-body").innerHTML = users.map(u => `
        <tr>
          <td>${esc(u.name)}${u.admin ? " <span class='badge'>admin</span>" : ""}</td>
          <td>${u.xp}</td>
          <td>${u.researched}</td>
          <td>${u.friends}</td>
          <td>${fmtDate(u.last)}</td>
          <td class="${u.online ? "online" : "muted"}">${u.online ? "En ligne" : "Hors ligne"}</td>
          <td><button class="btn sm" data-name="${escAttr(u.name)}">Éditer</button></td>
        </tr>`).join("");
      $("users-body").querySelectorAll("button[data-name]").forEach(b => {
        b.onclick = () => selectUser(b.getAttribute("data-name"));
      });
    } catch (e) {
      $("users-body").innerHTML = "<tr><td colspan='7' class='muted'>" + esc(e.message) + "</td></tr>";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escAttr(s) { return esc(s).replace(/`/g, ""); }

  async function selectUser(name) {
    selected = name;
    $("edit-name").textContent = name;
    $("edit-name").classList.remove("hidden");
    $("edit-body").classList.remove("hidden");
    $("edit-msg").classList.add("hidden");
    try {
      const r = await Account.adminUser(name);
      const data = (r.save && r.save.data) || {};
      $("e-xp").value = Number(data.XP) || 0;
      $("e-save").value = JSON.stringify(data, null, 2);
    } catch (e) {
      showMsg($("edit-msg"), e.message, "err");
    }
  }

  $("e-xp-save").onclick = async () => {
    if (!selected) return;
    try {
      const xp = Number($("e-xp").value) || 0;
      await Account.adminSetXp(selected, xp);
      showMsg($("edit-msg"), "XP mis à " + xp, "ok");
      loadUsers();
    } catch (e) { showMsg($("edit-msg"), e.message, "err"); }
  };

  $("e-pass-save").onclick = async () => {
    if (!selected) return;
    const pass = $("e-pass").value;
    if (pass.length < 6) { showMsg($("edit-msg"), "Mot de passe trop court", "err"); return; }
    if (!confirm("Réinitialiser le mot de passe de " + selected + " ? Toutes ses sessions seront coupées.")) return;
    try {
      await Account.adminSetPassword(selected, pass);
      $("e-pass").value = "";
      showMsg($("edit-msg"), "Mot de passe réinitialisé", "ok");
    } catch (e) { showMsg($("edit-msg"), e.message, "err"); }
  };

  $("e-unlock-all").onclick = async () => {
    if (!selected) return;
    if (!confirm("Débloquer toute la recherche pour " + selected + " ?")) return;
    try {
      await Account.adminSetResearch(selected, [], true);
      showMsg($("edit-msg"), "Recherche débloquée (flag researched_ALL)", "ok");
      loadUsers();
    } catch (e) { showMsg($("edit-msg"), e.message, "err"); }
  };

  $("e-delete").onclick = async () => {
    if (!selected) return;
    if (!confirm("SUPPRIMER définitivement le compte " + selected + " ?")) return;
    try {
      await Account.adminDeleteUser(selected);
      selected = null;
      $("edit-body").classList.add("hidden");
      $("edit-name").classList.add("hidden");
      showMsg($("edit-msg"), "Compte supprimé", "ok");
      loadUsers();
    } catch (e) { showMsg($("edit-msg"), e.message, "err"); }
  };

  $("e-save-apply").onclick = async () => {
    if (!selected) return;
    try {
      const data = JSON.parse($("e-save").value);
      await Account.adminPatchSave(selected, data);
      showMsg($("edit-msg"), "Sauvegarde mise à jour (clés autorisées uniquement)", "ok");
      loadUsers();
    } catch (e) { showMsg($("edit-msg"), e.message || "JSON invalide", "err"); }
  };

  // Client-side researched_ALL support hint for the game
  trySession();
})();
