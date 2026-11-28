/* ==========================================================================
   LOBBY-MAIN.JS — Navigation, bandeau joueur, initialisation du QG.
   ========================================================================== */
const SECTIONS = [
  { id: "hq", n: "01", label: "QG", title: "Poste de commandement", el: "s-hq", mod: SecHQ },
  { id: "play", n: "02", label: "Combat", title: "Préparer le combat", el: "s-play", mod: SecPlay },
  { id: "hangar", n: "03", label: "Hangar", title: "Hangar", el: "s-hangar", mod: SecHangar },
  { id: "research", n: "04", label: "Recherche", title: "Arbre de recherche", el: "s-research", mod: SecResearch },
  { id: "career", n: "05", label: "Carrière", title: "Carrière", el: "s-career", mod: SecCareer },
  { id: "settings", n: "06", label: "Réglages", title: "Réglages", el: "s-settings", mod: SecSettings },
  { id: "atelier", n: "07", label: "Atelier", title: "Atelier de chars", el: "s-atelier", mod: SecAtelier },
  { id: "compte", n: "08", label: "Compte", title: "Compte, sauvegarde et amis", el: "s-compte", mod: SecCompte }
];
const Nav = {
  cur: null,
  build() {
    $("#nav").innerHTML = SECTIONS.map(s => `<button class="nv" data-id="${s.id}"><span class="n">${s.n}</span><span class="l">${s.label}</span><i class="dot hidden"></i></button>`).join("");
    $("#nav").onclick = e => { const b = e.target.closest(".nv"); if (b) Nav.go(b.dataset.id); };
  },
  go(id) {
    const s = SECTIONS.find(x => x.id === id) || SECTIONS[0];
    Nav.cur = s.id; history.replaceState(null, "", "#" + s.id);
    SECTIONS.forEach(x => $("#" + x.el).classList.toggle("on", x === s));
    $$(".nv").forEach(b => b.classList.toggle("on", b.dataset.id === s.id));
    $("#crumb-idx").textContent = s.n; $("#crumb-title").textContent = s.title; document.title = "Tank Arena — " + s.title;
    s.mod.render($("#" + s.el));
    refreshHeader();
  }
};
function refreshHeader() {
  const L = Store.level(), t = Store.tank(), I = tankInfo(t);
  $("#p-lvl").textContent = L.level; $("#p-xpfill").style.width = Math.round(L.into / L.next * 100) + "%";
  $("#p-xp").textContent = fmt(Store.xp()) + " XP";
  $("#sel-chip-name").textContent = t; $("#sel-chip-cat").textContent = I.nation.name + " · rang " + ROMAN[I.tier] + " · " + I.cat;
  // pastilles de notification
  const rs = Object.keys(TECH_TREE).some(n => Store.canResearch(n) && Store.xp() >= TECH_TREE[n].cost);
  $(`.nv[data-id=research] .dot`).classList.toggle("hidden", !rs);
  $(`.nv[data-id=career] .dot`).classList.toggle("hidden", Store.readyMilestones() === 0);
}
function refreshAll() { refreshHeader(); }

window.addEventListener("DOMContentLoaded", () => {
  Store.tank(); Store.ammo();
  Nav.build();
  if (Account.saveWarning && Account.saveWarning()) { toast(Account.saveWarning()); Account.clearSaveWarning(); }
  const nm = $("#p-name"); nm.value = Store.name(); nm.onchange = () => { Store.setName(nm.value); nm.value = Store.name(); };
  const lockName = () => { nm.value = Store.name(); nm.disabled = Account.loggedIn(); nm.title = Account.loggedIn() ? "Nom de votre compte" : ""; };     // connecté : le nom est celui du compte
  Account.on(() => { lockName(); refreshHeader(); }); lockName();
  $("#sel-chip").onclick = () => Nav.go("hangar");
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== Nav.cur) Nav.go(id); });
  Nav.go(location.hash.slice(1) || "hq");
});
