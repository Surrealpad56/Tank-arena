/* ==========================================================================
   TANK-CATALOG.JS — Catégories, nations et gabarits 3D des véhicules.
   Chargé par lobby.html ET arena.html (après shared-data.js).

   Rôle : pour chaque char de TECH_TREE, fournir
     • une CATÉGORIE (léger, moyen, lourd, char de combat, chasseur de chars
       léger / moyen / lourd) qui pilote l'assemblage Three.js de secours,
     • des DIMENSIONS réelles en mètres (utilisées à la fois par le rendu 3D
       et par le moteur de combat : boîte de collision, zones de blindage),
     • les paramètres de la tourelle et du canon.

   Quand un vrai modèle 3D est fourni (models/models.js), il remplace
   l'assemblage procédural, mais ces dimensions restent la référence de
   mise à l'échelle et de collision.
   ========================================================================== */

const TANK_CATEGORIES = {
  light:     { label: "Char léger",                short: "LÉGER",    order: 1 },
  medium:    { label: "Char moyen",                short: "MOYEN",    order: 2 },
  heavy:     { label: "Char lourd",                short: "LOURD",    order: 3 },
  mbt:       { label: "Char de combat principal",  short: "MBT",      order: 4 },
  td_light:  { label: "Chasseur de chars léger",   short: "CC LÉGER", order: 5 },
  td_medium: { label: "Chasseur de chars moyen",   short: "CC MOYEN", order: 6 },
  td_heavy:  { label: "Chasseur de chars lourd",   short: "CC LOURD", order: 7 }
};

const NATIONS = {
  DE: { code: "DE", name: "Allemagne", color: "#9aa4ad", paint: { hull: 0x77745f, turret: 0x77745f, accent: 0x4c4a3c } },
  SU: { code: "SU", name: "URSS / Russie", color: "#d2543f", paint: { hull: 0x56653c, turret: 0x56653c, accent: 0x38442a } },
  GB: { code: "GB", name: "Royaume-Uni", color: "#c9a55a", paint: { hull: 0x6b6342, turret: 0x6b6342, accent: 0x474229 } },
  US: { code: "US", name: "États-Unis", color: "#8fae55", paint: { hull: 0x5f6a3a, turret: 0x5f6a3a, accent: 0x3e4726 } },
  FR: { code: "FR", name: "France", color: "#6d9fce", paint: { hull: 0x526b78, turret: 0x526b78, accent: 0x344753 } },
  JP: { code: "JP", name: "Japon", color: "#c7a75b", paint: { hull: 0x82784c, turret: 0x82784c, accent: 0x514a2d } },
  IT: { code: "IT", name: "Italie", color: "#78a879", paint: { hull: 0x667454, turret: 0x667454, accent: 0x414b35 } },
  SE: { code: "SE", name: "Suède", color: "#82b4c8", paint: { hull: 0x687a70, turret: 0x687a70, accent: 0x3d4c45 } },
  CN: { code: "CN", name: "Chine", color: "#c75d51", paint: { hull: 0x756d48, turret: 0x756d48, accent: 0x4c472e } },
  IL: { code: "IL", name: "Israël", color: "#9aa5b8", paint: { hull: 0x777b68, turret: 0x777b68, accent: 0x4c5144 } }
};
const NATION_FROM_FLAG = { "🇩🇪": "DE", "🇷🇺": "SU", "🇬🇧": "GB", "🇺🇸": "US", "🇫🇷": "FR", "🇯🇵": "JP", "🇮🇹": "IT", "🇸🇪": "SE", "🇨🇳": "CN", "🇮🇱": "IL" };

/* Valeurs par défaut par catégorie (mètres).
   L = longueur de caisse, W = largeur hors tout, hullTop = hauteur du pont,
   trackH = hauteur de chenille, nose = hauteur du bas du glacis,
   gl = longueur horizontale du glacis,
   tu = tourelle {k forme, l longueur, w largeur, h hauteur, x décalage avant}
   gun = canon {len, r rayon, brake, evac, sleeve}
   gp = pivot du canon {x devant le centre de la tourelle, y au-dessus du toit de caisse} */
const CATEGORY_DEFAULTS = {
  light:     { L: 5.0, W: 2.9, hullTop: 1.6, trackH: 0.95, nose: 0.8, gl: 1.3, tu: { k: "angular", l: 1.9, w: 1.9, h: 0.8, x: 0.1 }, gun: { len: 2.6, r: 0.045 }, depress: 10, elevate: 20, traverse: 360 },
  medium:    { L: 6.0, W: 3.0, hullTop: 1.9, trackH: 1.0,  nose: 0.8, gl: 1.5, tu: { k: "box",     l: 2.2, w: 2.2, h: 0.85, x: 0.2 }, gun: { len: 3.4, r: 0.05  }, depress: 8,  elevate: 18, traverse: 360 },
  heavy:     { L: 6.8, W: 3.4, hullTop: 2.1, trackH: 1.1,  nose: 0.9, gl: 1.6, tu: { k: "box",     l: 2.8, w: 2.6, h: 0.95, x: 0.2 }, gun: { len: 4.4, r: 0.06  }, depress: 7,  elevate: 15, traverse: 360 },
  mbt:       { L: 7.0, W: 3.3, hullTop: 1.9, trackH: 1.0,  nose: 0.8, gl: 1.9, tu: { k: "wedge",   l: 3.2, w: 2.7, h: 0.85, x: 0.2 }, gun: { len: 5.3, r: 0.065 }, depress: 8,  elevate: 17, traverse: 360 },
  td_light:  { L: 6.3, W: 2.9, hullTop: 1.9, trackH: 1.0,  nose: 0.8, gl: 1.7, tu: { k: "open",    l: 2.5, w: 2.5, h: 0.75, x: 0.2 }, gun: { len: 4.0, r: 0.05  }, depress: 10, elevate: 19, traverse: 360 },
  td_medium: { L: 5.6, W: 2.95, hullTop: 1.75, trackH: 0.95, nose: 0.8, gl: 1.3, tu: { k: "casemate", l: 2.4, w: 2.6, h: 0.75, x: 0.5 }, gun: { len: 3.3, r: 0.05 }, depress: 6, elevate: 16, traverse: 24 },
  td_heavy:  { L: 7.4, W: 3.5, hullTop: 2.0, trackH: 1.05, nose: 0.9, gl: 1.9, tu: { k: "casemate", l: 3.2, w: 3.0, h: 0.9, x: 0.6 }, gun: { len: 5.5, r: 0.07 }, depress: 6, elevate: 15, traverse: 20 }
};

/* Surcharges par véhicule. Les clés suivent EXACTEMENT TECH_TREE. */
const TANK_OVERRIDES = {
  // ── Tier 1 ──
  "Panzer III Ausf. L":       { cat: "medium", assembly: "p3", L: 5.56, W: 2.95, hullTop: 1.95, trackH: 0.95, gl: 1.25, tu: { k: "box", l: 1.9, w: 2.0, h: 0.8, x: 0.15 }, gun: { len: 3.0, r: 0.042 }, fenders: true, wheels: 6, mantlet: "box", cupola: "left" },
  "T-28E":                    { cat: "medium", assembly: "t28", L: 7.4, W: 2.9, hullTop: 1.95, trackH: 1.0, gl: 1.4, tu: { k: "hex", l: 2.0, w: 2.1, h: 0.8, x: 0.4 }, gun: { len: 3.2, r: 0.05 }, fenders: true, wheels: 8, mantlet: "box", multiTurret: true },
  "Matilda Mk.II":            { cat: "heavy",  assembly: "matilda", L: 5.6, W: 2.6, hullTop: 1.75, trackH: 1.3, gl: 1.1, tu: { k: "oval", l: 1.7, w: 1.7, h: 0.75, x: 0.0 }, gun: { len: 2.1, r: 0.04 }, skirts: true, wheels: 9, mantlet: "round", slab: true },
  "M24 Chaffee":              { cat: "light",  assembly: "chaffee", L: 5.0, W: 2.95, hullTop: 1.55, trackH: 0.95, gl: 1.35, tu: { k: "angular", l: 2.0, w: 2.0, h: 0.8, x: 0.0 }, gun: { len: 2.5, r: 0.045, brake: "single" }, wheels: 5, mantlet: "box", cupola: "right" },
  // ── Tier 2 ──
  "STuG III Ausf. F":         { cat: "td_medium", assembly: "stug", L: 5.4, W: 2.95, hullTop: 1.65, trackH: 0.95, gl: 1.3, tu: { k: "casemate", l: 2.5, w: 2.55, h: 0.78, x: 0.55 }, gun: { len: 3.2, r: 0.048, brake: "single" }, fenders: true, wheels: 6, traverse: 24 },
  "T-34 (1941)":              { cat: "medium", assembly: "t34_41", L: 6.1, W: 3.0, hullTop: 1.65, trackH: 1.0, nose: 0.6, gl: 1.9, tu: { k: "hex", l: 2.3, w: 2.3, h: 0.85, x: 0.35 }, gun: { len: 3.1, r: 0.045 }, wheels: 5, mantlet: "round", fenders: true },
  "Comet I":                  { cat: "medium", L: 6.6, W: 3.05, hullTop: 1.9, trackH: 1.0, gl: 1.6, tu: { k: "box", l: 2.8, w: 2.5, h: 0.9, x: 0.2 }, gun: { len: 3.9, r: 0.05, brake: "single" }, wheels: 6, mantlet: "box", cupola: "right", fenders: true },
  "M4A1 Sherman":             { cat: "medium", L: 5.8, W: 2.62, hullTop: 1.95, trackH: 1.05, gl: 1.45, round: true, tu: { k: "oval", l: 2.3, w: 2.1, h: 0.85, x: 0.0 }, gun: { len: 3.0, r: 0.045 }, wheels: 3, mantlet: "round", cupola: "right" },
  // ── Tier 3 ──
  "Panzer IV Ausf. H":        { cat: "medium", assembly: "p4", L: 5.9, W: 2.88, hullTop: 1.9, trackH: 0.95, gl: 1.3, tu: { k: "box", l: 2.0, w: 2.2, h: 0.85, x: 0.25 }, gun: { len: 3.6, r: 0.048, brake: "double" }, skirts: true, wheels: 8, mantlet: "round", cupola: "center" },
  "KV-1 (ZiS 5)":             { cat: "heavy",  assembly: "kv1", L: 6.7, W: 3.25, hullTop: 1.95, trackH: 1.05, gl: 1.6, tu: { k: "box", l: 2.9, w: 2.7, h: 1.0, x: 0.35 }, gun: { len: 3.1, r: 0.048 }, wheels: 6, mantlet: "box", cupola: "right", fenders: true },
  "Avenger":                  { cat: "td_light", L: 6.3, W: 3.0, hullTop: 1.8, trackH: 1.0, gl: 1.5, tu: { k: "open", l: 2.8, w: 2.6, h: 0.8, x: 0.5 }, gun: { len: 3.9, r: 0.05, brake: "single" }, wheels: 5, mantlet: "box" },
  "M4 Calliopé":              { cat: "medium", L: 5.8, W: 2.62, hullTop: 1.95, trackH: 1.05, gl: 1.45, round: true, tu: { k: "oval", l: 2.3, w: 2.1, h: 0.85, x: 0.0 }, gun: { len: 2.9, r: 0.045 }, wheels: 3, mantlet: "round", cupola: "right", rocket: true },
  // ── Tier 4 ──
  "Panzer V Panther Ausf. D": { cat: "medium", assembly: "panther", L: 6.9, W: 3.4, hullTop: 1.95, trackH: 1.05, nose: 0.55, gl: 2.0, tu: { k: "angular", l: 2.9, w: 2.5, h: 0.95, x: 0.25 }, gun: { len: 5.0, r: 0.052, brake: "double" }, skirts: true, wheels: 8, mantlet: "saukopf", cupola: "left" },
  "KV-2 (ZiS 6)":             { cat: "heavy",  assembly: "kv2", L: 6.8, W: 3.25, hullTop: 1.95, trackH: 1.05, gl: 1.6, tu: { k: "tall", l: 3.2, w: 3.0, h: 1.65, x: 0.3 }, gun: { len: 3.1, r: 0.085 }, wheels: 6, mantlet: "box", fenders: true },
  "Churchill Mk.VII":         { cat: "heavy",  L: 7.4, W: 3.25, hullTop: 2.0, trackH: 1.9, gl: 1.1, tu: { k: "oval", l: 2.4, w: 2.4, h: 0.85, x: 0.1 }, gun: { len: 3.4, r: 0.048 }, slab: true, wheels: 11, mantlet: "round", cupola: "center" },
  "M-18 Hellcat":             { cat: "td_light", L: 6.65, W: 2.87, hullTop: 1.65, trackH: 0.95, nose: 0.55, gl: 1.9, tu: { k: "open", l: 2.7, w: 2.45, h: 0.8, x: 0.3 }, gun: { len: 4.3, r: 0.048, brake: "tbrake" }, wheels: 5, mantlet: "round" },
  // ── Tier 5 ──
  "Panzer VI Tiger Ausf. H":  { cat: "heavy",  assembly: "tiger", L: 6.3, W: 3.7, hullTop: 2.1, trackH: 1.1, gl: 1.15, tu: { k: "box", l: 2.5, w: 2.5, h: 0.95, x: 0.05 }, gun: { len: 4.9, r: 0.055, brake: "double" }, overlap: true, wheels: 8, mantlet: "round", cupola: "left", fenders: true },
  "IS-2 (1944)":              { cat: "heavy",  assembly: "is2", L: 6.8, W: 3.1, hullTop: 1.8, trackH: 1.05, nose: 0.6, gl: 1.9, tu: { k: "oval", l: 2.8, w: 2.4, h: 0.95, x: 0.2 }, gun: { len: 5.2, r: 0.062, brake: "double" }, wheels: 6, mantlet: "round", cupola: "right" },
  "Black Prince":             { cat: "heavy",  L: 8.8, W: 3.4, hullTop: 2.0, trackH: 1.9, gl: 1.1, tu: { k: "box", l: 3.3, w: 2.8, h: 1.0, x: 0.2 }, gun: { len: 4.3, r: 0.052, brake: "single" }, slab: true, wheels: 12, mantlet: "box", cupola: "center" },
  "M-26 Pershing":            { cat: "medium", L: 6.3, W: 3.5, hullTop: 1.9, trackH: 1.05, nose: 0.6, gl: 1.8, tu: { k: "angular", l: 2.9, w: 2.6, h: 0.9, x: 0.15 }, gun: { len: 4.5, r: 0.052, brake: "tbrake" }, wheels: 6, mantlet: "round", cupola: "right" },
  // ── Tier 6 ──
  "Panzer VI Ausf. B King Tiger": { cat: "heavy", assembly: "kingtiger", L: 7.4, W: 3.75, hullTop: 2.15, trackH: 1.1, nose: 0.65, gl: 1.9, tu: { k: "box", l: 3.2, w: 2.8, h: 1.05, x: 0.1 }, gun: { len: 6.3, r: 0.06, brake: "double" }, overlap: true, wheels: 9, mantlet: "round", cupola: "left", fenders: true },
  "T-10A":                    { cat: "heavy",  assembly: "t10", L: 7.2, W: 3.5, hullTop: 1.75, trackH: 1.1, nose: 0.6, gl: 2.0, tu: { k: "oval", l: 3.3, w: 2.8, h: 0.85, x: 0.25 }, gun: { len: 5.9, r: 0.062, brake: "double", evac: true }, wheels: 7, mantlet: "round", cupola: "right" },
  "FV4202":                   { cat: "mbt",    L: 7.6, W: 3.4, hullTop: 1.95, trackH: 1.05, gl: 1.7, tu: { k: "box", l: 3.0, w: 2.7, h: 0.95, x: 0.25 }, gun: { len: 5.3, r: 0.058, evac: true }, skirts: true, wheels: 6, mantlet: "round", cupola: "right" },
  "T-34 heavy tank":          { cat: "heavy",  assembly: "t34heavy", L: 7.3, W: 3.8, hullTop: 2.0, trackH: 1.1, nose: 0.7, gl: 1.9, tu: { k: "angular", l: 3.2, w: 2.9, h: 1.0, x: 0.2 }, gun: { len: 5.0, r: 0.058, brake: "tbrake" }, wheels: 8, mantlet: "round", cupola: "right" },
  // ── Tier 7 ──
  "Leopard 1":                { cat: "mbt",    assembly: "leopard1", L: 7.1, W: 3.3, hullTop: 1.75, trackH: 1.0, nose: 0.6, gl: 1.9, tu: { k: "wedge", l: 3.4, w: 2.7, h: 0.8, x: 0.3 }, gun: { len: 5.4, r: 0.06, evac: true }, skirts: true, wheels: 7, mantlet: "none", cupola: "right" },
  "T-55A":                    { cat: "mbt",    assembly: "t55", L: 6.4, W: 3.3, hullTop: 1.5, trackH: 1.0, nose: 0.6, gl: 2.0, tu: { k: "dome", l: 2.9, w: 2.9, h: 0.85, x: 0.1 }, gun: { len: 5.6, r: 0.055, evac: true }, wheels: 5, mantlet: "none", cupola: "right", log: true },
  "Chieftain Mk.X":           { cat: "mbt",    L: 7.5, W: 3.5, hullTop: 1.95, trackH: 1.05, nose: 0.6, gl: 2.1, tu: { k: "wedge", l: 3.6, w: 2.9, h: 0.85, x: 0.2 }, gun: { len: 6.6, r: 0.07, sleeve: true, evac: true }, skirts: true, wheels: 6, mantlet: "none", cupola: "right" },
  "M-46 Patton":              { cat: "mbt",    L: 6.9, W: 3.5, hullTop: 1.85, trackH: 1.05, nose: 0.6, gl: 1.8, round: true, tu: { k: "oval", l: 3.3, w: 2.9, h: 1.05, x: 0.2 }, gun: { len: 4.5, r: 0.052, brake: "tbrake" }, wheels: 6, mantlet: "round", cupola: "right" }
};

/* Défauts de repli par ancienne catégorie "visual" / tier si une clé manque. */
function _deepMerge(base, extra) {
  const out = Object.assign({}, base);
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k])) out[k] = Object.assign({}, base[k] || {}, extra[k]);
    else out[k] = extra[k];
  }
  return out;
}

const _profileCache = {};

/* getTankProfile(key) → gabarit complet (mètres) + dérivés (pixels du moteur).
   Les champs `px*` sont des convertissements prêts à l'emploi pour le moteur
   2D/3D de combat (18 px = 1 m, cf. PIXELS_PER_METER dans arena-constants). */
function getTankProfile(key) {
  if (_profileCache[key]) return _profileCache[key];
  const tt = (typeof TECH_TREE !== "undefined" && TECH_TREE[key]) || {};
  const tm = (typeof TANK_MODULES !== "undefined" && TANK_MODULES[key]) || {};
  const ov = TANK_OVERRIDES[key] || {};
  const cat = ov.cat || "medium";
  const base = CATEGORY_DEFAULTS[cat] || CATEGORY_DEFAULTS.medium;
  const p = _deepMerge(base, ov);
  p.key = key;
  p.cat = cat;
  p.catLabel = (TANK_CATEGORIES[cat] || TANK_CATEGORIES.medium).label;
  p.nation = NATION_FROM_FLAG[tt.nation] || Object.keys(NATIONS).find(k => NATIONS[k].name === tt.nationName) || "DE";
  p.nationName = (NATIONS[p.nation] || NATIONS.DE).name;
  p.tier = tt.tier || 1;
  p.assembly = ov.assembly || "generic";
  const firstAmmo = Object.values(tm.ammo || {})[0] || {};
  p.caliber = firstAmmo.caliber || 75;
  p.weightTons = tm.weightTons || 30;
  p.crew = tm.crew || 4;
  p.reloadSec = tm.reloadSec || 6;
  p.speedKmh = tm.speed || 40;
  p.casemate = p.tu.k === "casemate";
  p.openTop = p.tu.k === "open";
  p.traverse = p.casemate ? (ov.traverse || base.traverse) : 360;
  /* Géométrie du pivot de tir (tout en mètres, repère du char : +X = avant) :
       pivotX : axe de rotation de la tourelle, depuis le centre de la caisse
       gunX   : pivot du canon, devant l'axe de la tourelle
       gunY   : hauteur du pivot du canon au-dessus du pont de la caisse
     Pour un chasseur de chars à casemate, l'axe de rotation est reporté à
     l'avant de la casemate (la masse reste fixe, seul le canon pivote). */
  if (p.casemate) {
    p.pivotX = p.tu.x + p.tu.l * 0.5 - 0.3; p.gunX = 0.3; p.gunY = p.tu.h * 0.55;
  } else {
    p.pivotX = p.tu.x; p.gunX = p.tu.l * (p.tu.k === "wedge" ? 0.5 : 0.44); p.gunY = Math.min(p.tu.h * 0.62, p.tu.h - 0.12);
  }
  p.gunLen = p.gun.len;
  // Hauteurs
  p.turretBase = p.hullTop;
  p.totalHeight = p.hullTop + p.tu.h + (p.cupola && p.cupola !== "none" ? 0.22 : 0) + (p.rocket ? 0.3 : 0);
  // Moteur : tout en pixels (18 px / m)
  const PPM = 18;
  p.pxL = p.L * PPM; p.pxW = p.W * PPM;
  p.radiusPx = Math.max(p.L * 0.46, 1.6) * PPM;   // rayon de collision avec le décor
  _profileCache[key] = p;
  return p;
}

/* Liste exhaustive (utile aux outils / au laboratoire de modèles). */
function getAllTankKeys() { return Object.keys(TECH_TREE); }
