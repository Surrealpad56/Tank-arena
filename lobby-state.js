/* ==========================================================================
   LOBBY-STATE.JS — État persistant du joueur (localStorage) : XP, niveau,
   recherche, char et obus sélectionnés, statistiques, historique, jalons,
   configuration de partie. Source unique pour toutes les sections du QG ;
   le combat (arena-combat.js) écrit les mêmes clés.
   ========================================================================== */
const Store = (function () {
  const L = localStorage;
  const int = (k) => parseInt(L.getItem(k) || "0") || 0;
  const S = {};

  /* ───── XP / niveau ───── */
  S.xp = () => int("XP");
  S.xpEarned = () => Math.max(int("XPEarned"), S.xp());
  S.addXP = (n) => { L.setItem("XP", S.xp() + n); L.setItem("XPEarned", S.xpEarned() + n); };
  S.level = function () {
    // Niveau d'après l'XP gagnée à vie (dépenser en recherche ne fait pas baisser le niveau)
    let lvl = 1, cum = 0, step = 1500; const total = S.xpEarned();
    while (total >= cum + step) { cum += step; step += 500; lvl++; }
    return { level: lvl, into: total - cum, next: step };
  };

  /* ───── Recherche ───── */
  S.isStarter = (n) => !!TECH_TREE[n] && !TECH_TREE[n].previous;
  S.isResearched = (n) => !!TECH_TREE[n] && (S.isStarter(n) || !!L.getItem("researched_" + n));
  /* Porte de rang (façon War Thunder) : pour ouvrir le rang R d'une nation, il faut posséder
     RANK_NEED[R] véhicules du rang inférieur le plus proche de cette nation. */
  S.rankGate = function (n) {
    const t = TECH_TREE[n]; if (!t || t.tier <= 1) return { ok: true, need: 0, have: 0, from: 0 };
    const nat = t.nation, tiers = Object.keys(TECH_TREE).filter(k => TECH_TREE[k].nation === nat && TECH_TREE[k].tier < t.tier).map(k => TECH_TREE[k].tier);
    if (!tiers.length) return { ok: true, need: 0, have: 0, from: 0 };
    const from = Math.max(...tiers), pool = Object.keys(TECH_TREE).filter(k => TECH_TREE[k].nation === nat && TECH_TREE[k].tier === from);
    const need = Math.min((window.RANK_NEED || [])[t.tier] || 0, pool.length), have = pool.filter(S.isResearched).length;
    return { ok: have >= need, need, have, from };
  };
  S.canResearch = (n) => { if (!TECH_TREE[n]) return false; const p = TECH_TREE[n].previous; return !S.isStarter(n) && !S.isResearched(n) && S.isResearched(p) && S.rankGate(n).ok; };
  S.research = function (n) {
    if (!S.canResearch(n) || S.xp() < TECH_TREE[n].cost) return false;
    L.setItem("XP", S.xp() - TECH_TREE[n].cost); L.setItem("researched_" + n, "1"); return true;
  };
  S.researchedList = () => Object.keys(TECH_TREE).filter(S.isResearched);

  /* ───── Sélection ───── */
  S.tank = function () {
    let t = L.getItem("SelectedTank");
    if (!TECH_TREE[t]) { const n = normalizeTankKey(t); t = TECH_TREE[n] ? n : null; }
    if (!t || !S.isResearched(t)) { t = "Panzer III Ausf. L"; L.setItem("SelectedTank", t); }
    return t;
  };
  S.setTank = function (n) {
    if (!S.isResearched(n)) return false; L.setItem("SelectedTank", n);
    const av = getAvailableAmmos(n); let a1 = L.getItem("SelectedAmmo1"), a2 = L.getItem("SelectedAmmo2");
    if (!av.includes(a1)) a1 = av[0]; if (!av.includes(a2) || a2 === a1) a2 = av.find(a => a !== a1) || a1;
    L.setItem("SelectedAmmo1", a1); L.setItem("SelectedAmmo2", a2); return true;
  };
  S.ammo = function () {
    const n = S.tank(), av = getAvailableAmmos(n); let a1 = L.getItem("SelectedAmmo1"), a2 = L.getItem("SelectedAmmo2");
    if (!av.includes(a1)) a1 = av[0]; if (!av.includes(a2) || a2 === a1) a2 = av.find(a => a !== a1) || a1;
    L.setItem("SelectedAmmo1", a1); L.setItem("SelectedAmmo2", a2); return [a1, a2];
  };
  S.setAmmo = function (slot, key) {
    const [a1, a2] = S.ammo();
    if (slot === 1) { L.setItem("SelectedAmmo1", key); if (key === a2) L.setItem("SelectedAmmo2", a1); }
    else { L.setItem("SelectedAmmo2", key); if (key === a1) L.setItem("SelectedAmmo1", a2); }
  };
  S.name = () => L.getItem("PlayerName") || "Recrue";
  S.setName = (v) => L.setItem("PlayerName", (v || "").trim().slice(0, 16) || "Recrue");

  /* ───── Statistiques ───── */
  S.stats = function () {
    const p = int("stat_parties"), w = int("stat_wins"), k = int("stat_kills"), d = int("stat_deaths"), sh = int("stat_shots"), hi = int("stat_hits"), dm = int("stat_damage");
    return { parties: p, wins: w, losses: p - w, kills: k, deaths: d, shots: sh, hits: hi, damage: dm, maxKills: int("stat_maxkills"),
      winrate: p ? Math.round(w / p * 100) : null, kd: d ? +(k / d).toFixed(2) : (k ? k : null), acc: sh ? Math.round(hi / sh * 100) : null, avgDmg: p ? Math.round(dm / p) : null };
  };
  S.history = function () { try { return JSON.parse(L.getItem("match_history") || "[]"); } catch (e) { return []; } };
  S.campaignDone = function (tank) { return new Set((L.getItem("camp_completed_" + tank) || "").split(",").filter(Boolean).map(Number)); };
  S.campaignTotal = () => Object.keys(TECH_TREE).reduce((s, n) => s + S.campaignDone(n).size, 0);

  /* ───── Jalons (récompenses en XP, réclamées par le joueur) ───── */
  S.milestones = function () {
    const st = S.stats();
    const M = [
      ["win1", "Premier sang", "Remporter une partie", st.wins, 1, 150], ["parties5", "Sous le feu", "Jouer 5 parties", st.parties, 5, 250], ["parties25", "Vétéran", "Jouer 25 parties", st.parties, 25, 800],
      ["kills10", "Chasseur", "Détruire 10 chars", st.kills, 10, 200], ["kills50", "Fléau blindé", "Détruire 50 chars", st.kills, 50, 600], ["kills150", "Légende de l'acier", "Détruire 150 chars", st.kills, 150, 1500],
      ["dmg5k", "Artilleur", "Infliger 5 000 dégâts", st.damage, 5000, 300], ["dmg25k", "Marteau-pilon", "Infliger 25 000 dégâts", st.damage, 25000, 900],
      ["streak5", "Carnage", "Détruire 5 chars en une partie", st.maxKills, 5, 400], ["camp3", "Stratège", "Terminer 3 missions de campagne", S.campaignTotal(), 3, 500]
    ];
    return M.map(([id, name, desc, cur, goal, xp]) => ({ id, name, desc, cur: Math.min(cur, goal), goal, xp, ready: cur >= goal && !L.getItem("claimed_" + id), claimed: !!L.getItem("claimed_" + id) }));
  };
  S.claim = function (id) { const m = S.milestones().find(x => x.id === id); if (!m || !m.ready) return 0; L.setItem("claimed_" + id, "1"); S.addXP(m.xp); return m.xp; };
  S.readyMilestones = () => S.milestones().filter(m => m.ready).length;

  /* ───── Configuration de partie ───── */
  const CFG_DEF = { mode: "skirmish", theme: "random", allies: 1, enemies: 2, difficulty: "normal", scoreToWin: 10, respawnBots: true, mission: 0, testTarget: "random", testBehavior: "static", testDist: 150, testSelf: "" };
  S.cfg = function () { let c = {}; try { c = JSON.parse(L.getItem("lobbyConfig") || "{}"); } catch (e) { } const r = Object.assign({}, CFG_DEF, c); if (r.mode === "online") r.mode = "skirmish"; if (r.theme !== "random" && !MAP_THEMES.includes(r.theme)) r.theme = "random"; return r; };
  S.setCfg = function (patch) { const c = Object.assign(S.cfg(), patch); L.setItem("lobbyConfig", JSON.stringify(c)); return c; };

  /* ───── Remises à zéro ───── */
  S.resetResearch = function () {
    Object.keys(TECH_TREE).forEach(n => { L.removeItem("researched_" + n); L.removeItem("camp_completed_" + n); });
    L.setItem("XP", "0"); L.removeItem("SelectedTank"); L.removeItem("SelectedAmmo1"); L.removeItem("SelectedAmmo2");
  };
  S.resetAll = function () {
    S.resetResearch();
    ["XPEarned", "stat_parties", "stat_kills", "stat_deaths", "stat_damage", "stat_shots", "stat_hits", "stat_wins", "stat_maxkills", "match_history", "Credits", "lobbyConfig"].forEach(k => L.removeItem(k));
    Object.keys(L).filter(k => k.startsWith("claimed_")).forEach(k => L.removeItem(k));
  };
  return S;
})();

/* ───── Aides d'affichage communes ───── */
const NATION_KEYS = ["DE", "SU", "GB", "US", "FR", "JP", "IT", "SE", "CN", "IL"];
const fmt = n => (n === null || n === undefined) ? "—" : Number(n).toLocaleString("fr-FR");
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
function tankInfo(name) {
  const p = getTankProfile(name), t = TECH_TREE[name], m = TANK_MODULES[name] || {};
  return { name, p, t, m, nation: NATIONS[p.nation], tier: t.tier, cat: p.catLabel };
}
function escHTML(s) { return String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
