/* ==========================================================================
   SETTINGS.JS — Réglages joueur persistés (localStorage), partagés entre le
   lobby (écran Réglages) et le combat (qualité 3D, sensibilité, volume...).
   Tous les réglages affichés dans le lobby ont un effet réel en jeu.
   ========================================================================== */
const Settings = (function () {
  const KEY = "ta_settings_v3";
  const DEFAULTS = {
    quality: "high",      // low | medium | high | ultra  (ombres, densité d'arbres, résolution du sol)
    sens: 1.0,            // sensibilité souris / tactile (0.3 – 2.5)
    invertY: false,
    fov: 70,              // champ de vision de la caméra de poursuite (55 – 95)
    volume: 0.8,          // volume des effets (0 – 1)
    showFps: false,
    camDist: 13,          // distance par défaut de la caméra de poursuite (m)
    post: true,           // effets cinématiques (bloom, occlusion ambiante, étalonnage, grain)
    dynres: true,         // résolution dynamique (baisse l'échelle de rendu si la fluidité chute)
    weatherFx: true,      // météo animée (nuages, pluie, neige, foudre)
    toneMap: true,        // tone mapping ACES dans le passage final
    shadows: 0,           // 0 = suivre le préréglage, 1 = forcé, -1 = désactivé
    antialias: 0,         // idem
    ao: 0,                // idem (occlusion ambiante)
    renderScale: 0,       // 0 = automatique, sinon échelle de rendu (0.5 – 2)
    viewDistance: 0,      // 0 = automatique, sinon distance de brouillard / culling (m)
    hudCompact: false,    // panneaux Véhicule / Modules réduits
    devTools: false       // outils de test (XP gratuit) dans les réglages
  };
  let cache = null;
  function load() {
    if (cache) return cache;
    let o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { }
    cache = Object.assign({}, DEFAULTS, o);
    return cache;
  }
  function get(k) { return load()[k]; }
  function set(k, v) {
    load()[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { }
  }
  function all() { return Object.assign({}, load()); }
  function reset() {
    cache = Object.assign({}, DEFAULTS);
    try { localStorage.removeItem(KEY); localStorage.removeItem("TaSafe"); sessionStorage.removeItem("TaSafe"); } catch (e) { }
    SAFE = false;
  }

  /* Paramètres 3D dérivés de la qualité choisie */
  /* Mode sans échec : ?safe=1 désactive les effets avancés ; ?safe=0 le retire vraiment.
     Le drapeau n'est plus piégé dans localStorage par une simple visite. */
  let SAFE = (function () {
    try {
      const m = String(location.search).match(/[?&]safe=(\d)/);
      if (m) {
        if (m[1] === "1") { sessionStorage.setItem("TaSafe", "1"); localStorage.setItem("TaSafe", "1"); }
        else { sessionStorage.removeItem("TaSafe"); localStorage.removeItem("TaSafe"); }
        return m[1] === "1";
      }
      return sessionStorage.getItem("TaSafe") === "1" || localStorage.getItem("TaSafe") === "1";
    } catch (e) { return false; }
  })();
  const QUALITY = {
    low:    { shadows: false, shadowMap: 1024, pixelRatio: 0.75, trees: 0.25, terrainTex: 1024, antialias: false, particles: 0.5, far: 520,
              post: false, env: false, grass: 0,     decals: 200,  precip: 0.5, clouds: 2, softShadows: false },
    medium: { shadows: true,  shadowMap: 1024, pixelRatio: 1.0,  trees: 0.5,  terrainTex: 1536, antialias: false, particles: 0.75, far: 700,
              post: true, bloom: true, bloomLevels: 4, ssao: false, fxaa: true, msaa: false, grain: false, ca: false, env: true, envI: 0.8, grass: 2500, decals: 600,  precip: 0.7, clouds: 3, softShadows: false },
    high:   { shadows: true,  shadowMap: 2048, pixelRatio: 1.0,  trees: 1.0,  terrainTex: 2048, antialias: true,  particles: 1.0, far: 900,
              post: true, bloom: true, bloomLevels: 5, ssao: true, aoSamples: 8, fxaa: true, msaa: false, grain: true, ca: false, env: true, envI: 0.85, grass: 6000, decals: 1200, precip: 1.0, clouds: 4, softShadows: true },
    ultra:  { shadows: true,  shadowMap: 4096, pixelRatio: 1.5,  trees: 1.5,  terrainTex: 3072, antialias: true,  particles: 1.4, far: 1200,
              post: true, bloom: true, bloomLevels: 5, ssao: true, aoSamples: 12, fxaa: true, msaa: false, grain: true, ca: true, env: true, envI: 0.9, grass: 12000, decals: 1800, precip: 1.4, clouds: 5, softShadows: true }
  };
  function quality() {
    const q = Object.assign({}, QUALITY[get("quality")] || QUALITY.high);
    const tri = (k, target) => { const v = get(k); if (v === 1 || v === true) q[target] = true; else if (v === -1 || v === false) q[target] = false; };
    tri("shadows", "shadows"); tri("antialias", "antialias"); tri("ao", "ssao");
    const rs = +get("renderScale"); if (rs > 0) q.pixelRatio = Math.max(0.5, Math.min(2, rs));
    const vd = +get("viewDistance"); if (vd > 0) q.far = Math.max(300, Math.min(2000, vd));
    return SAFE ? Object.assign({}, q, { post: false, env: false, grass: 0, decals: 0, weatherFx: false, precip: 0, softShadows: false }) : q;
  }

  function setSafe(v) {
    SAFE = !!v;
    try {
      if (SAFE) { localStorage.setItem("TaSafe", "1"); sessionStorage.setItem("TaSafe", "1"); }
      else { localStorage.removeItem("TaSafe"); sessionStorage.removeItem("TaSafe"); }
    } catch (e) { }
  }

  return { get, set, all, reset, quality, DEFAULTS, QUALITY, safe: () => SAFE, setSafe };
})();
