/* ==========================================================================
   SETTINGS.JS — Réglages joueur persistés (localStorage), partagés entre le
   lobby (écran Réglages) et le combat (qualité 3D, sensibilité, volume...).
   Tous les réglages affichés dans le lobby ont un effet réel en jeu.
   ========================================================================== */
const Settings = (function () {
  const KEY = "ta_settings_v3";
  const DEFAULTS = {
    quality: "ultra",     // qualité maximale par défaut
    sens: 1.0,            // sensibilité souris / tactile (0.3 – 2.5)
    invertY: false,
    fov: 70,              // champ de vision de la caméra de poursuite (55 – 95)
    volume: 0.8,          // volume des effets (0 – 1)
    showFps: false,
    camDist: 13,          // distance par défaut de la caméra de poursuite (m)
    devTools: false       // outils de test (XP gratuit) dans les réglages
  };
  let cache = null;
  function load() {
    if (cache) return cache;
    let o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { }
    cache = Object.assign({}, DEFAULTS, o);
    // Migration unique : cette version du projet démarre en qualité maximale,
    // y compris pour les installations qui avaient encore le réglage "high".
    if (!cache._graphicsMaxMigrated) {
      cache.quality = "ultra";
      cache._graphicsMaxMigrated = true;
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { }
    }
    return cache;
  }
  function get(k) { return load()[k]; }
  function set(k, v) {
    load()[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { }
  }
  function all() { return Object.assign({}, load()); }
  function reset() { cache = Object.assign({}, DEFAULTS); try { localStorage.removeItem(KEY); } catch (e) { } }

  /* Paramètres 3D dérivés de la qualité choisie */
  const QUALITY = {
    low:    { shadows: false, shadowMap: 1024, pixelRatio: 0.75, trees: 0.25, terrainTex: 1024, antialias: false, particles: 0.5, far: 520 },
    medium: { shadows: true,  shadowMap: 1024, pixelRatio: 1.0,  trees: 0.5,  terrainTex: 1536, antialias: false, particles: 0.75, far: 700 },
    high:   { shadows: true,  shadowMap: 2048, pixelRatio: 1.0,  trees: 1.0,  terrainTex: 2048, antialias: true,  particles: 1.0, far: 900 },
    ultra:  { shadows: true,  shadowMap: 4096, pixelRatio: 1.5,  trees: 1.8,  terrainTex: 4096, antialias: true,  particles: 1.5, far: 1800 }
  };
  function quality() { return QUALITY[get("quality")] || QUALITY.high; }

  return { get, set, all, reset, quality, DEFAULTS, QUALITY };
})();
