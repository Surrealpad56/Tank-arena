/* ==========================================================================
   ROSTER-WT.JS — Roster étendu façon « arbre technologique » (10 nations, 12 rangs).
   À charger APRÈS shared-data.js et tank-catalog.js (lobby.html ET arena.html).

   Ce fichier :
     1. ajoute ~140 véhicules réels (TECH_TREE + TANK_MODULES + gabarit 3D),
     2. re-relie TOUS les véhicules (anciens compris) en branches cohérentes,
        avec rang (tier) strictement croissant le long d'une branche,
     3. calcule pour chaque véhicule un BR (rapport de combat, façon War Thunder)
        et un coût de recherche dépendant du rang et du BR,
     4. expose RANK_NEED : nombre de véhicules du rang précédent à posséder
        pour débloquer un rang (porte de rang, utilisée par Store.rankGate).

   Les valeurs ajoutées sont des estimations de JEU (échelle des véhicules
   existants), pas des fiches historiques certifiées.

   FORMAT D'UNE LIGNE  [nom, rang, catégorie, prérequis, année, canon, km/h,
                        équipage, tonnes, [hf,hs,hr,tf,ts,tr], options?]
     • ligne COURTE [nom, rang, catégorie, prérequis] = véhicule déjà défini
       ailleurs : on ne change que son rang, sa branche (et sa catégorie
       s'il n'avait pas de gabarit 3D). Avec l'option redo:true, la fiche d'un
       véhicule existant est entièrement reconstruite (correction de nation/stats).
     • prérequis : null = véhicule de départ gratuit · "^" = ligne précédente
       de la même nation · sinon le nom exact.
     • options : sl = pente du glacis (°), tl = pente de la tourelle (°),
       k = forme de tourelle (box/angular/wedge/oval/hex/dome/tall/casemate/open),
       sk = jupes, L / W = dimensions imposées (m).
   ========================================================================== */
console.log("[TankArena] chargement : roster-wt.js");

(function installWTRoster() {
  "use strict";

  const FLAG = { DE: "🇩🇪", SU: "🇷🇺", GB: "🇬🇧", US: "🇺🇸", FR: "🇫🇷", JP: "🇯🇵", IT: "🇮🇹", SE: "🇸🇪", CN: "🇨🇳", IL: "🇮🇱" };

  /* ───── CANONS : [libellé, calibre mm, V0 m/s, masse obus kg, pénétration, obus, rechargement s, pénétration HEAT] ───── */
  const GUNS = {
    "20KwK":   ["20mm KwK 30", 20, 780, 0.12, 20, ["AP", "HE"]],
    "20Br":    ["20mm Breda 35", 20, 830, 0.14, 22, ["AP", "HE"]],
    "37A7":    ["37mm Škoda A7", 37, 750, 0.85, 38, ["AP", "HE"]],
    "37M6":    ["37mm M6", 37, 884, 0.87, 48, ["AP", "HE"]],
    "37T94":   ["37mm Type 94", 37, 575, 0.7, 30, ["AP", "HE"]],
    "37SA38":  ["37mm SA38", 37, 705, 0.7, 36, ["AP", "HE"]],
    "37Bo":    ["37mm Bofors m/38", 37, 730, 0.85, 40, ["AP", "HE"]],
    "2pdr":    ["2pdr QF", 42, 792, 1.1, 66, ["AP", "APDS", "HE"]],
    "45K":     ["45mm 20K", 45, 760, 1.43, 45, ["AP", "HE"]],
    "47Sk":    ["47mm Pak 36(t)", 47, 775, 1.65, 52, ["AP", "HE"]],
    "47Vi":    ["47mm Vickers", 47, 610, 1.5, 40, ["AP", "HE"]],
    "47FR":    ["47mm SA35", 47, 660, 1.6, 56, ["AP", "HE"]],
    "47IT":    ["47mm/32 Ansaldo", 47, 630, 1.4, 45, ["AP", "HE"]],
    "47T1":    ["47mm Type 1", 47, 810, 1.5, 80, ["AP", "HE"]],
    "50K39":   ["50mm KwK 39 L/60", 50, 835, 2.06, 72, ["AP", "APCR", "HE"]],
    "QF6":     ["6pdr QF Mk.V", 57, 900, 2.85, 92, ["APCBC", "APDS", "HE"]],
    "75L24":   ["75mm KwK 37 L/24", 75, 385, 6.8, 41, ["AP", "HEAT", "HE"], null, 91],
    "75L43":   ["75mm KwK 40 L/43", 75, 740, 6.8, 103, ["APCBC", "APCR", "HEAT", "HE"], null, 100],
    "75L48":   ["75mm KwK 40 L/48", 75, 790, 6.8, 115, ["APCBC", "APCR", "HEAT", "HE"], null, 100],
    "75L70":   ["75mm KwK 42 L/70", 75, 925, 6.8, 165, ["APCBC", "APCR", "HE"]],
    "75M3":    ["75mm M3", 75, 619, 6.3, 96, ["AP", "APCBC", "HE", "SM"]],
    "QF75":    ["75mm QF", 75, 619, 6.3, 96, ["AP", "APCBC", "HE", "SM"]],
    "75IT18":  ["75mm/18 M35", 75, 435, 6.3, 42, ["AP", "HEAT", "HE"], null, 75],
    "75IT34":  ["75mm/34 Ansaldo", 75, 620, 6.3, 76, ["AP", "HE"]],
    "75SA44":  ["75mm SA44", 75, 880, 6.4, 125, ["AP", "HEAT", "HE"], null, 130],
    "75T90":   ["75mm Type 90", 75, 680, 6.5, 95, ["AP", "HE"]],
    "75T3":    ["75mm Type 3", 75, 680, 6.5, 95, ["AP", "HEAT", "HE"], null, 90],
    "75T5":    ["75mm Type 5", 75, 850, 6.5, 140, ["APCBC", "HE"]],
    "75Bo":    ["75mm Bofors m/44", 75, 700, 6.3, 100, ["AP", "HE"]],
    "75CN50":  ["75mm CN 75-50", 75, 1000, 6.6, 150, ["APCBC", "HEAT", "HE"], null, 160],
    "76ZiS3":  ["76mm ZiS-3", 76, 680, 6.2, 78, ["APBC", "HE"]],
    "76M1":    ["76mm M1A2", 76, 792, 7.0, 116, ["AP", "APCBC", "APCR", "HE", "SM"]],
    "17pdr":   ["17pdr QF", 76, 884, 7.7, 148, ["APCBC", "APDS", "HE"]],
    "76D56":   ["76mm D-56T", 76, 655, 6.5, 85, ["APBC", "HEAT", "HE"], null, 150],
    "76L23":   ["76mm L23A1", 76, 530, 6.0, 60, ["HEAT", "HE"], 5, 180],
    "20pdr":   ["20pdr QF", 84, 1020, 9.1, 215, ["APCBC", "APDS", "HE"]],
    "85D5":    ["85mm D-5S", 85, 792, 9.2, 111, ["APBC", "APCR", "HE"]],
    "85T62":   ["85mm Type 62-85TC", 85, 800, 9.0, 120, ["APBC", "HEAT", "HE"], null, 220],
    "88L56":   ["88mm KwK 36 L/56", 88, 773, 10.2, 165, ["APCBC", "APCR", "HEAT", "HE"], null, 90],
    "88L71":   ["88mm KwK 43 L/71", 88, 1000, 10.2, 238, ["APCBC", "APCR", "HE"]],
    "88T99":   ["88mm Type 99", 88, 800, 10.2, 150, ["APCBC", "HE"]],
    "90M3":    ["90mm M3", 90, 853, 10.9, 122, ["AP", "APCBC", "HE", "SM"]],
    "90M41":   ["90mm M41", 90, 914, 10.9, 148, ["AP", "HEAT", "HE", "SM"], null, 305],
    "90IT53":  ["90mm/53 Ansaldo", 90, 860, 10.3, 135, ["APCBC", "HE"]],
    "90SA45":  ["90mm SA45", 90, 950, 10.0, 160, ["AP", "HEAT", "HE"], null, 220],
    "90F3":    ["90mm CN-90-F3", 90, 950, 10.0, 170, ["AP", "HEAT", "HE"], null, 250],
    "90Kan":   ["90mm Bk 90", 90, 1000, 4.0, 150, ["AP", "HEAT", "HE"], 6, 340],
    "90Ikv":   ["90mm Ikv 91", 90, 980, 4.2, 150, ["AP", "HEAT", "HE"], 5.5, 305],
    "100D10":  ["100mm D-10S", 100, 895, 15.9, 185, ["APBC", "APCBC", "HE"]],
    "100T54":  ["100mm D-10T", 100, 895, 15.9, 185, ["APBC", "APDS", "HEAT", "HE"], null, 380],
    "100SA47": ["100mm SA47", 100, 1000, 15.0, 230, ["APCBC", "HEAT", "HE"], null, 300],
    "100T69":  ["100mm Type 69", 100, 1000, 15.0, 230, ["AP", "HEAT", "HE"], null, 340],
    "105T92":  ["105mm Type 92", 105, 550, 15.8, 90, ["AP", "HE"], 10],
    "105T5":   ["105mm T5E1", 105, 945, 17.2, 210, ["APCBC", "HE"], 12],
    "105L7":   ["105mm L7A3", 105, 1470, 10.9, 303, ["APDS", "HEAT", "HE", "SM"], null, 400],
    "105M68":  ["105mm M68", 105, 1470, 10.9, 303, ["APDS", "HEAT", "HE", "SM"], null, 400],
    "105M68A1": ["105mm M68A1", 105, 1500, 10.9, 360, ["APDS", "HEAT", "HE", "SM"], null, 420],
    "105F1":   ["105mm CN-105-F1", 105, 1000, 10.9, 250, ["APDS", "HEAT", "HE", "SM"], null, 270],
    "105CN":   ["105mm CN 105-F1 (M-51)", 105, 1000, 10.9, 230, ["APDS", "HEAT", "HE"], null, 260],
    "105T83":  ["105mm Type 83", 105, 1450, 10.9, 320, ["APDS", "HEAT", "HE"], null, 400],
    "115U5":   ["115mm U-5TS", 115, 1615, 4.5, 330, ["APDS", "HEAT", "HE"], 8, 380],
    "120L1":   ["120mm L1A1", 120, 1020, 17.2, 260, ["AP", "HE"], 12],
    "120M58":  ["120mm M58", 120, 1030, 20.1, 260, ["AP", "HE"], 14],
    "120SA46": ["120mm SA46", 120, 1000, 18.0, 250, ["AP", "HEAT", "HE"], 12, 300],
    "120L11A7": ["120mm L11A7", 120, 1550, 7.2, 460, ["AP", "HEAT", "HE"], 9],
    "120L44":  ["120mm Rh120 L/44", 120, 1650, 7.2, 450, ["AP", "HEAT", "HE"]],
    "120L55":  ["120mm Rh120 L/55", 120, 1750, 7.4, 550, ["AP", "HEAT", "HE"]],
    "120L30":  ["120mm L30A1", 120, 1750, 7.4, 560, ["AP", "HEAT", "HE"]],
    "120M256": ["120mm M256", 120, 1750, 7.2, 520, ["AP", "HEAT", "HE"]],
    "120MG253B": ["120mm MG253 Barak", 120, 1750, 7.2, 650, ["AP", "HEAT", "HE"]],
    "122A19":  ["122mm A-19", 122, 800, 25.0, 185, ["APBC", "HE"], 17],
    "122D25":  ["122mm D-25T", 122, 795, 25.0, 185, ["APBC", "HE"], 18],
    "125A26":  ["125mm 2A26", 125, 1700, 7.0, 400, ["AP", "HEAT", "HE"], 6.5, 450],
    "125A46":  ["125mm 2A46M", 125, 1780, 7.1, 480, ["AP", "HEAT", "HE"], 6.5, 520],
    "125A46M5": ["125mm 2A46M-5", 125, 1800, 7.1, 550, ["AP", "HEAT", "HE"], 6.5, 580],
    "125A75":  ["125mm 2A75", 125, 1750, 7.1, 450, ["AP", "HEAT", "HE"], 6.5, 500],
    "125A82":  ["125mm 2A82-1M", 125, 1900, 7.2, 700, ["AP", "HEAT", "HE"], 6, 700],
    "128L55":  ["128mm PaK 44 L/55", 128, 920, 26.4, 290, ["APCBC", "HE"], 16],
    "32pdr":   ["32pdr (94mm)", 94, 945, 14.5, 260, ["APCBC", "HE"], 12],
    "152ML20": ["152mm ML-20S", 152, 655, 48.8, 120, ["AP", "HEAT", "HE"], 22, 400],
    "152M81":  ["152mm M81", 152, 685, 25.0, 100, ["HEAT", "HE"], 8, 380],
    "183L4":   ["183mm L4", 183, 1000, 36.0, 300, ["AP", "HE"], 20]
  };

  /* ───── LIGNES PAR NATION ───── */
  const ROWS = {
    DE: [
      ["Pz.Kpfw. II Ausf. C", 1, "light", null, 1938, "20KwK", 40, 3, 9.5, [30, 14, 14, 30, 14, 14]],
      ["Pz.Kpfw. 38(t) Ausf. F", 2, "light", "^", 1941, "37A7", 42, 4, 9.8, [50, 30, 15, 50, 30, 15]],
      ["Pz.Kpfw. II Ausf. L Luchs", 3, "light", "^", 1943, "20KwK", 60, 4, 13.1, [30, 20, 20, 30, 20, 20]],
      ["VK 16.02 Leopard", 4, "light", "^", 1943, "50K39", 50, 4, 18, [60, 30, 20, 60, 30, 20], { sl: 30 }],
      ["Panzer III Ausf. L", 1, "medium", null],
      ["Pz.Kpfw. IV Ausf. F2", 2, "medium", "^", 1942, "75L43", 40, 5, 23.6, [50, 30, 20, 50, 30, 20]],
      ["Panzer IV Ausf. H", 3, "medium", "^"],
      ["Panzer V Panther Ausf. D", 4, "medium", "^"],
      ["Pz.Kpfw. V Panther Ausf. G", 5, "medium", "^", 1944, "75L70", 46, 5, 45.5, [80, 50, 40, 110, 45, 45], { sl: 55 }],
      ["E-50", 6, "medium", "^", 1945, "88L71", 60, 5, 50, [120, 60, 40, 100, 60, 40], { sl: 55 }],
      ["Leopard 1", 7, "mbt", "^"],
      ["Leopard 1A5", 8, "mbt", "^", 1987, "105L7", 65, 4, 42.5, [70, 35, 25, 250, 100, 60], { sk: true }],
      ["Leopard 2A4", 9, "mbt", "^", 1985, "120L44", 72, 4, 55.2, [600, 300, 60, 650, 320, 100]],
      ["Leopard 2A6", 10, "mbt", "^", 2001, "120L55", 68, 4, 62.3, [700, 350, 80, 780, 380, 110]],
      ["Leopard 2A7V", 11, "mbt", "^", 2014, "120L55", 68, 4, 63, [800, 380, 90, 880, 420, 120]],
      ["KF51 Panther", 12, "mbt", "^"],
      ["Pz.Kpfw. VI Tiger Ausf. E", 4, "heavy", "Panzer IV Ausf. H", 1942, "88L56", 38, 5, 57, [100, 80, 80, 100, 80, 80]],
      ["Panzer VI Tiger Ausf. H", 5, "heavy", "^"],
      ["Panzer VI Ausf. B King Tiger", 6, "heavy", "^"],
      ["Maus", 7, "heavy", "^", 1944, "128L55", 20, 6, 188, [200, 180, 160, 240, 200, 200]],
      ["E-75", 6, "heavy", "Panzer VI Tiger Ausf. H", 1945, "88L71", 40, 5, 80, [150, 120, 100, 185, 120, 100], { sl: 50 }],
      ["E-100", 7, "heavy", "^", 1945, "128L55", 23, 6, 140, [200, 120, 150, 200, 200, 150]],
      ["Panzerjäger I", 1, "td_light", null, 1940, "47Sk", 40, 3, 6.4, [13, 13, 13, 14, 14, 14], { k: "open" }],
      ["Marder III Ausf. M", 2, "td_light", "^", 1943, "75L48", 42, 4, 10.7, [50, 16, 10, 10, 10, 10], { k: "open" }],
      ["Jagdpanzer 38(t) Hetzer", 3, "td_light", "^", 1944, "75L48", 42, 4, 15.7, [60, 20, 20, 60, 20, 15], { k: "casemate", sl: 60 }],
      ["Nashorn", 4, "td_light", "^", 1943, "88L71", 40, 5, 24, [30, 20, 20, 10, 10, 10], { k: "open" }],
      ["Elefant", 5, "td_heavy", "^", 1943, "88L71", 30, 6, 65, [200, 80, 80, 200, 80, 80], { sl: 12 }],
      ["STuG III Ausf. F", 2, "td_medium", "Panzerjäger I"],
      ["StuG III Ausf. G", 3, "td_medium", "^", 1943, "75L48", 40, 4, 23.9, [80, 30, 30, 80, 30, 30]],
      ["Jagdpanzer IV", 4, "td_medium", "^", 1944, "75L48", 35, 4, 24, [80, 30, 20, 80, 30, 20], { sl: 50 }],
      ["Jagdpanzer IV L/70(V)", 5, "td_medium", "^", 1944, "75L70", 35, 4, 25.8, [80, 30, 20, 80, 30, 20], { sl: 50 }],
      ["Jagdpanther", 5, "td_medium", "Jagdpanzer IV", 1944, "88L71", 46, 5, 45.5, [80, 50, 40, 80, 50, 40], { sl: 55 }],
      ["Jagdtiger", 6, "td_heavy", "^", 1944, "128L55", 38, 6, 71.7, [150, 80, 80, 250, 80, 80], { sl: 50 }],
      ["Kanonenjagdpanzer 90mm", 7, "td_medium", "^", 1965, "90Kan", 70, 4, 27, [50, 30, 20, 50, 30, 20], { sl: 60 }]
    ],
    SU: [
      ["T-26", 1, "light", null, 1935, "45K", 30, 3, 9.4, [15, 15, 15, 15, 15, 15]],
      ["SU-76M", 2, "td_light", "^", 1943, "76ZiS3", 45, 4, 10.5, [35, 16, 16, 35, 16, 16], { k: "open" }],
      ["SU-85", 3, "td_medium", "^", 1943, "85D5", 47, 4, 29.6, [45, 45, 40, 45, 45, 40], { sl: 50 }],
      ["SU-100", 4, "td_medium", "^", 1944, "100D10", 50, 4, 31.6, [75, 45, 40, 75, 45, 40], { sl: 50 }],
      ["ISU-122", 5, "td_heavy", "^", 1944, "122A19", 35, 5, 46, [90, 90, 60, 90, 90, 60], { sl: 50 }],
      ["BT-7", 1, "light", null, 1937, "45K", 72, 3, 13.8, [22, 15, 15, 15, 15, 15], { sl: 20 }],
      ["T-70", 2, "light", "^", 1942, "45K", 45, 2, 9.2, [45, 35, 25, 35, 35, 35]],
      ["PT-76", 6, "light", "^", 1951, "76D56", 44, 3, 14, [15, 15, 10, 17, 17, 13], { sl: 30 }],
      ["2S25 Sprut-SD", 9, "light", "^", 2005, "125A75", 70, 3, 18, [50, 30, 20, 50, 30, 20]],
      ["T-28E", 1, "medium", null],
      ["T-34 (1941)", 2, "medium", "^"],
      ["KV-1 (ZiS 5)", 3, "heavy", "^"],
      ["T-34-85", 4, "medium", "T-34 (1941)", 1944, "85D5", 55, 5, 32, [45, 45, 40, 90, 75, 52], { sl: 60 }],
      ["T-44", 5, "medium", "^", 1944, "85D5", 51, 4, 31.5, [120, 75, 45, 120, 90, 60], { sl: 60 }],
      ["T-54", 6, "mbt", "^", 1949, "100T54", 50, 4, 36, [100, 80, 45, 200, 150, 60], { sl: 58 }],
      ["T-55A", 7, "mbt", "^"],
      ["T-62", 8, "mbt", "^", 1961, "115U5", 50, 4, 37.5, [100, 80, 45, 242, 200, 60], { sl: 60 }],
      ["T-64A", 9, "mbt", "^", 1969, "125A26", 60, 3, 38, [450, 100, 60, 450, 250, 100]],
      ["T-80B", 10, "mbt", "^", 1980, "125A46", 70, 3, 42.5, [520, 120, 70, 600, 300, 100]],
      ["T-80U", 11, "mbt", "^", 1985, "125A46M5", 70, 3, 46, [600, 130, 80, 700, 320, 120]],
      ["T-14 Armata", 12, "mbt", "^", 2015, "125A82", 75, 3, 48, [850, 200, 120, 900, 400, 140]],
      ["T-72A", 9, "mbt", "T-62", 1979, "125A46", 60, 3, 41.5, [500, 100, 60, 550, 250, 100]],
      ["T-72B", 10, "mbt", "^", 1985, "125A46", 60, 3, 44.5, [550, 120, 70, 650, 300, 110]],
      ["T-90A", 11, "mbt", "^", 2004, "125A46M5", 60, 3, 46.5, [620, 130, 80, 720, 320, 120]],
      ["T-90M", 12, "mbt", "^", 2020, "125A46M5", 60, 3, 48, [700, 150, 100, 800, 350, 120]],
      ["KV-2 (ZiS 6)", 4, "heavy", "KV-1 (ZiS 5)"],
      ["IS-2 (1944)", 5, "heavy", "^"],
      ["ISU-152", 5, "td_heavy", "KV-2 (ZiS 6)", 1943, "152ML20", 35, 5, 46, [90, 90, 60, 90, 90, 60], { sl: 50 }],
      ["T-10A", 6, "heavy", "IS-2 (1944)"],
      ["IS-3", 6, "heavy", "IS-2 (1944)", 1945, "122D25", 37, 4, 46, [110, 90, 60, 230, 150, 100], { sl: 55 }]
    ],
    US: [
      ["M3 Stuart", 1, "light", null, 1941, "37M6", 58, 4, 12.7, [44, 25, 25, 51, 38, 38], { sl: 10 }],
      ["M5A1 Stuart", 2, "light", "^", 1942, "37M6", 58, 4, 15.4, [64, 25, 25, 51, 38, 38], { sl: 45 }],
      ["M10 Wolverine", 3, "td_light", "^", 1942, "76M1", 51, 5, 29.6, [57, 19, 19, 19, 19, 19], { k: "open", sl: 55 }],
      ["M-18 Hellcat", 4, "td_light", "^"],
      ["M36 Jackson", 4, "td_medium", "M10 Wolverine", 1944, "90M3", 48, 5, 29, [57, 19, 19, 63, 32, 32], { k: "open" }],
      ["T28 Super Heavy Tank", 5, "td_heavy", "^", 1945, "105T5", 13, 6, 86, [305, 150, 100, 305, 150, 100], { sl: 5 }],
      ["M24 Chaffee", 1, "light", null],
      ["M41 Walker Bulldog", 6, "light", "^", 1951, "76M1", 72, 4, 23.5, [25, 19, 19, 38, 25, 25], { sl: 50 }],
      ["M551 Sheridan", 8, "light", "^", 1969, "152M81", 70, 4, 15.8, [38, 25, 25, 50, 38, 38]],
      ["M3 Lee", 1, "medium", null, 1941, "75M3", 40, 6, 27.2, [51, 38, 38, 51, 51, 51]],
      ["M4A1 Sherman", 2, "medium", "^"],
      ["M4A3 (76) W", 3, "medium", "^", 1944, "76M1", 42, 5, 32, [64, 38, 38, 76, 64, 64], { sl: 47 }],
      ["M4A3E8 Easy Eight", 4, "medium", "^", 1944, "76M1", 42, 5, 33.7, [64, 38, 38, 76, 64, 64], { sl: 47 }],
      ["M-26 Pershing", 5, "medium", "^"],
      ["M-46 Patton", 6, "mbt", "^"],
      ["M48A1 Patton", 7, "mbt", "^", 1953, "90M41", 48, 4, 44.8, [110, 76, 50, 178, 127, 75], { sl: 60 }],
      ["M60A1", 8, "mbt", "^", 1962, "105M68", 48, 4, 48.7, [110, 70, 50, 254, 150, 70], { sl: 65 }],
      ["M1 Abrams", 9, "mbt", "^", 1980, "105M68A1", 67, 4, 54.5, [500, 200, 60, 600, 300, 100]],
      ["M1A1 Abrams", 10, "mbt", "^", 1985, "120M256", 67, 4, 57.2, [650, 300, 80, 700, 350, 110]],
      ["M1A2 SEPv3 Abrams", 11, "mbt", "^", 2017, "120M256", 67, 4, 63.2, [850, 350, 100, 900, 420, 130]],
      ["M1E3 Abrams (programme)", 12, "mbt", "^"],
      ["M4 Calliopé", 3, "medium", "M4A1 Sherman"],
      ["T29 Heavy Tank", 6, "heavy", "M-26 Pershing", 1947, "105T5", 35, 5, 64, [102, 76, 51, 203, 152, 76], { sl: 45 }],
      ["M103 Heavy Tank", 7, "heavy", "^", 1957, "120M58", 34, 5, 58, [127, 76, 51, 254, 127, 76], { sl: 45 }],
      /* Char lourd américain T34 (canon de 120 mm). Clé historique conservée pour ne pas casser les sauvegardes. */
      ["T-34 heavy tank", 7, "heavy", "T29 Heavy Tank", 1947, "120M58", 35, 5, 64, [102, 76, 51, 203, 152, 76], { sl: 45, redo: true }]
    ],
    GB: [
      ["Tetrarch", 1, "light", null, 1941, "2pdr", 64, 3, 7.6, [16, 14, 14, 16, 14, 14]],
      ["FV101 Scorpion", 7, "light", "^", 1972, "76L23", 87, 3, 8, [30, 12, 12, 30, 12, 12]],
      ["Cruiser Mk.IV", 1, "medium", null, 1938, "2pdr", 48, 4, 15, [30, 14, 14, 30, 14, 14]],
      ["Crusader Mk.III", 2, "medium", "^", 1942, "QF6", 44, 5, 20, [51, 30, 30, 51, 30, 30]],
      ["Cromwell Mk.IV", 2, "medium", "Cruiser Mk.IV", 1944, "QF75", 64, 5, 27.9, [64, 32, 32, 76, 63, 57]],
      ["Comet I", 3, "medium", "^"],
      ["Centurion Mk.1", 4, "medium", "^", 1945, "17pdr", 34, 4, 45, [76, 51, 38, 152, 76, 76], { sl: 60 }],
      ["Centurion Mk.3", 5, "medium", "^", 1948, "20pdr", 35, 4, 49, [76, 51, 38, 152, 76, 76], { sl: 60 }],
      ["FV4202", 6, "mbt", "^"],
      ["Chieftain Mk.X", 7, "mbt", "^"],
      ["Vickers MBT Mk.3", 8, "mbt", "^", 1978, "105L7", 56, 4, 38.7, [80, 50, 40, 250, 150, 60], { sl: 60 }],
      ["Challenger 1", 9, "mbt", "^", 1983, "120L11A7", 56, 4, 62, [700, 300, 90, 780, 350, 100]],
      ["Challenger 2", 10, "mbt", "^", 1998, "120L30", 59, 4, 62.5, [800, 350, 100, 880, 420, 120]],
      ["Challenger 3", 12, "mbt", "^", 2023, "120L55", 56, 4, 66, [950, 450, 120, 1000, 500, 150]],
      ["Matilda Mk.II", 1, "heavy", null],
      ["Churchill Mk.III", 2, "heavy", "^", 1942, "QF6", 24, 5, 39, [102, 76, 50, 89, 76, 76], { sl: 0 }],
      ["Churchill Mk.VII", 4, "heavy", "^"],
      ["Black Prince", 5, "heavy", "^"],
      ["Conqueror", 6, "heavy", "^", 1955, "120L1", 34, 4, 66, [178, 89, 51, 178, 89, 51], { sl: 60 }],
      ["Valentine Mk.IX", 2, "medium", "Matilda Mk.II", 1943, "QF6", 24, 3, 17.5, [65, 60, 60, 65, 65, 65]],
      ["Archer", 3, "td_medium", "^", 1944, "17pdr", 32, 4, 16.5, [60, 20, 20, 55, 20, 20], { k: "casemate", sl: 50 }],
      ["Avenger", 4, "td_light", "^"],
      ["Tortoise", 5, "td_heavy", "^", 1947, "32pdr", 19, 7, 78, [225, 150, 75, 225, 150, 75], { sl: 45 }],
      ["FV4005 Stage II", 7, "td_heavy", "^", 1950, "183L4", 30, 5, 55, [127, 76, 50, 127, 76, 50], { sl: 45 }]
    ],
    FR: [
      ["Renault R35", 1, "light", null],
      ["Hotchkiss H39", 1, "light", null, 1939, "37SA38", 36, 2, 12, [40, 34, 34, 40, 34, 34]],
      ["AMX 12t", 3, "light", "^", 1946, "75SA44", 55, 3, 12, [40, 20, 15, 40, 20, 15]],
      ["AMX-13 (75)", 5, "light", "^"],
      ["AMX 13 (90)", 6, "light", "^", 1960, "90F3", 60, 3, 15, [40, 20, 20, 40, 20, 20]],
      ["Somua S35", 1, "medium", null, 1936, "47FR", 40, 3, 19.5, [55, 40, 40, 56, 40, 40], { sl: 20 }],
      ["Char B1 bis", 2, "heavy", "^", 1937, "47FR", 28, 4, 31.5, [60, 55, 55, 60, 55, 55], { sl: 35 }],
      ["ARL 44", 4, "heavy", "^", 1946, "90SA45", 37, 5, 50, [120, 60, 45, 120, 60, 45], { sl: 45 }],
      ["AMX 50", 6, "heavy", "^", 1951, "100SA47", 50, 4, 57, [100, 60, 40, 120, 80, 50], { sl: 55 }],
      ["AMX 50 Foch", 7, "td_heavy", "^", 1952, "120SA46", 48, 4, 50, [120, 60, 40, 120, 60, 40], { k: "casemate" }],
      ["AMX-30B", 7, "mbt", "AMX 50", 1967, "105F1", 65, 4, 36, [80, 35, 30, 80, 40, 30]],
      ["AMX-30B2", 8, "mbt", "^"],
      ["AMX-30B2 Brenus", 9, "mbt", "^"],
      ["AMX-40", 8, "mbt", "AMX-30B"],
      ["Leclerc Série 1", 9, "mbt", "^"],
      ["Leclerc Série 2", 10, "mbt", "^"],
      ["Leclerc XLR", 11, "mbt", "^"],
      ["EMBT demonstrator", 12, "mbt", "^"]
    ],
    JP: [
      ["Type 95 Ha-Go", 1, "light", null, 1936, "37T94", 40, 3, 7.4, [12, 12, 12, 12, 12, 12]],
      ["Ho-Ni I", 2, "td_light", "^", 1942, "75T90", 38, 4, 13.5, [50, 25, 12, 25, 12, 12], { k: "open" }],
      ["Ho-Ni III", 3, "td_light", "^", 1944, "75T3", 38, 5, 16, [50, 25, 20, 50, 25, 20], { k: "casemate" }],
      ["Ho-Ri Production", 4, "td_medium", "^", 1945, "105T92", 45, 5, 35, [75, 50, 40, 75, 50, 40], { k: "casemate" }],
      ["Type 97 Chi-Ha", 1, "medium", null],
      ["Type 1 Chi-He", 2, "medium", "^"],
      ["Type 97 Shinhoto Chi-Ha", 2, "medium", "Type 97 Chi-Ha", 1942, "47T1", 38, 5, 15.8, [25, 20, 20, 50, 25, 25]],
      ["Type 3 Chi-Nu", 3, "medium", "Type 1 Chi-He", 1944, "75T3", 39, 5, 19, [50, 25, 20, 50, 35, 25]],
      ["Type 4 Chi-To", 4, "medium", "^", 1944, "75T5", 45, 5, 30, [75, 50, 40, 75, 50, 40]],
      ["Type 5 Chi-Ri", 5, "medium", "^", 1945, "88T99", 45, 5, 37, [75, 50, 40, 75, 50, 40]],
      ["Type 61", 6, "mbt", "^"],
      ["STB-1", 7, "mbt", "^", 1969, "105L7", 60, 4, 38, [110, 60, 30, 200, 100, 60], { sl: 50 }],
      ["Type 74", 8, "mbt", "^"],
      ["Type 90", 9, "mbt", "^", 1990, "120L44", 70, 3, 50, [600, 300, 90, 650, 320, 100]],
      ["Type 10", 10, "mbt", "^"],
      ["Type 10改", 11, "mbt", "^"]
    ],
    IT: [
      ["Fiat L6/40", 1, "light", null, 1940, "20Br", 42, 2, 6.8, [30, 15, 15, 30, 15, 15]],
      ["M13/40", 1, "medium", null],
      ["M15/42", 2, "medium", "^"],
      ["P26/40", 3, "medium", "^", 1943, "75IT34", 40, 4, 26, [60, 45, 40, 60, 50, 40], { sl: 30 }],
      ["M47 Patton (Italie)", 6, "mbt", "^", 1952, "90M41", 48, 5, 46, [110, 76, 50, 178, 127, 75], { sl: 60 }],
      ["OF-40", 7, "mbt", "^"],
      ["Ariete prototype", 8, "mbt", "^"],
      ["C1 Ariete", 9, "mbt", "^"],
      ["C1 Ariete AMV", 10, "mbt", "^"],
      ["Semovente 47/32", 1, "td_light", null, 1941, "47IT", 42, 3, 6.5, [30, 15, 15, 30, 15, 15], { k: "casemate" }],
      ["Semovente 75/18", 2, "td_light", "^", 1941, "75IT18", 32, 3, 13.1, [50, 30, 25, 50, 30, 25], { k: "casemate" }],
      ["Semovente 75/34", 3, "td_medium", "^", 1943, "75IT34", 38, 3, 14, [50, 30, 25, 50, 30, 25], { k: "casemate" }],
      ["Semovente M41M 90/53", 4, "td_medium", "^", 1943, "90IT53", 35, 4, 16.8, [50, 30, 25, 50, 30, 25], { k: "casemate" }]
    ],
    SE: [
      ["Strv m/38", 1, "light", null, 1938, "37Bo", 40, 3, 8.5, [24, 15, 15, 24, 15, 15]],
      ["Strv m/40L", 1, "light", null, 1940, "37Bo", 45, 3, 9.7, [24, 15, 15, 24, 15, 15]],
      ["Strv m/42", 2, "medium", "^"],
      ["Strv 74", 4, "medium", "^", 1944, "75Bo", 45, 4, 23.5, [60, 45, 30, 60, 45, 30]],
      ["Strv 81", 5, "medium", "^", 1953, "20pdr", 35, 4, 50, [76, 51, 38, 152, 76, 76], { sl: 60 }],
      ["Strv 101", 6, "medium", "^", 1958, "20pdr", 35, 4, 50, [76, 60, 40, 152, 90, 76], { sl: 60 }],
      ["Strv 102", 7, "mbt", "^", 1966, "105L7", 35, 4, 51, [76, 60, 40, 152, 90, 76], { sl: 60 }],
      ["Strv 103C", 7, "td_medium", "Strv 101"],
      ["Strv 121", 9, "mbt", "Strv 102"],
      ["Strv 122", 10, "mbt", "^"],
      ["Strv 123 (concept)", 11, "mbt", "^"],
      ["Ikv 72", 3, "td_medium", "Strv m/38", 1953, "75Bo", 35, 4, 13, [50, 30, 20, 50, 30, 20], { k: "casemate" }],
      ["Ikv 91", 7, "td_light", "^", 1975, "90Ikv", 65, 4, 16.3, [40, 25, 20, 40, 25, 20], { k: "casemate" }],
      ["CV 90105 TML", 8, "light", "^", 1998, "105L7", 70, 3, 23, [40, 30, 20, 40, 30, 20]],
      ["CV 90120-T", 9, "light", "^", 2001, "120L44", 70, 3, 25, [50, 35, 25, 50, 35, 25]]
    ],
    CN: [
      ["Vickers Mk.E Type B", 1, "light", null, 1934, "47Vi", 35, 3, 7.3, [13, 13, 13, 13, 13, 13]],
      ["M5A1 Stuart (Chine)", 2, "light", "^", 1942, "37M6", 58, 4, 15.4, [64, 25, 25, 51, 38, 38], { sl: 45 }],
      ["M4A4 Sherman (Chine)", 3, "medium", "^", 1943, "75M3", 40, 5, 31.5, [51, 38, 38, 76, 51, 51], { sl: 47 }],
      ["T-34-85 (Chine)", 4, "medium", "^", 1944, "85D5", 55, 5, 32, [45, 45, 40, 90, 75, 52], { sl: 60 }],
      ["ZTZ-59", 6, "mbt", "^"],
      ["ZTZ-69-II", 7, "mbt", "^", 1982, "100T69", 50, 4, 36.7, [100, 80, 45, 200, 150, 60], { sl: 60 }],
      ["ZTZ-79", 8, "mbt", "^", 1980, "105T83", 50, 4, 37, [120, 80, 45, 250, 160, 70], { sl: 60 }],
      ["ZTZ-88B", 8, "mbt", "ZTZ-69-II", 1988, "105T83", 57, 3, 38.5, [150, 90, 50, 300, 180, 80], { sl: 60 }],
      ["ZTZ-96", 9, "mbt", "^"],
      ["ZTZ-99", 10, "mbt", "^"],
      ["ZTZ-99A", 11, "mbt", "^"],
      ["VT-4", 11, "mbt", "ZTZ-99", 2014, "125A46M5", 70, 3, 52, [800, 320, 90, 850, 380, 110]],
      ["T-26 (Chine)", 1, "light", null, 1935, "45K", 30, 3, 9.4, [15, 15, 15, 15, 15, 15]],
      ["Type 62", 6, "light", "^", 1960, "85T62", 60, 4, 21, [35, 14, 14, 35, 14, 14]],
      ["Type 15", 10, "light", "^", 2018, "125A75", 70, 3, 33, [250, 100, 40, 300, 120, 50]]
    ],
    IL: [
      ["Hotchkiss H39 (Israël)", 1, "light", null, 1948, "37SA38", 36, 2, 12, [40, 34, 34, 40, 34, 34]],
      ["AMX-13 (Israël)", 5, "light", "^", 1956, "75SA44", 60, 3, 14.5, [40, 20, 15, 40, 20, 15]],
      ["M4A4 Sherman (Israël)", 1, "medium", null, 1948, "75M3", 40, 5, 31.5, [51, 38, 38, 76, 51, 51], { sl: 47 }],
      ["Sherman M-50", 3, "medium", "^", 1956, "75CN50", 38, 5, 32, [51, 38, 38, 76, 51, 51], { sl: 47 }],
      ["Sherman M-51", 6, "medium", "^", 1960, "105CN", 38, 5, 38, [51, 38, 38, 76, 51, 51], { sl: 47 }],
      ["Magach 3", 7, "mbt", "^", 1963, "105L7", 48, 4, 48, [110, 76, 50, 178, 127, 75], { sl: 60 }],
      ["Magach 6B", 8, "mbt", "^", 1985, "105M68", 48, 4, 48.7, [200, 120, 60, 320, 200, 100], { sl: 60 }],
      ["Sho't", 7, "mbt", "Sherman M-51", 1970, "105L7", 35, 4, 51, [76, 51, 38, 152, 76, 76], { sl: 60 }],
      ["Merkava Mk.2D", 8, "mbt", "^"],
      ["Merkava Mk.3", 9, "mbt", "^"],
      ["Merkava Mk.4", 10, "mbt", "^"],
      ["Merkava Mk.4M", 11, "mbt", "^"],
      ["Merkava Mk.4 Barak", 12, "mbt", "^", 2021, "120MG253B", 64, 4, 65, [950, 480, 140, 1000, 520, 160]],
      ["Tiran 4", 6, "mbt", "Sherman M-50", 1967, "100T54", 50, 4, 36, [100, 80, 45, 200, 150, 60], { sl: 58 }],
      ["Tiran 5", 7, "mbt", "^", 1970, "105L7", 50, 4, 36, [100, 80, 45, 200, 150, 60], { sl: 58 }]
    ]
  };

  const ROLE = { light: "char léger", medium: "char moyen", heavy: "char lourd", mbt: "char de combat", td_light: "chasseur de chars léger", td_medium: "chasseur de chars moyen", td_heavy: "chasseur de chars lourd" };
  const NATION_NAME = { DE: "Allemagne", SU: "URSS / Russie", GB: "Royaume-Uni", US: "États-Unis", FR: "France", JP: "Japon", IT: "Italie", SE: "Suède", CN: "Chine", IL: "Israël" };
  const COST = [0, 100, 200, 400, 700, 1000, 1500, 2000, 2600, 3300, 4100, 5000, 6000];
  const r1 = x => Math.round(x * 10) / 10;

  /* Porte de rang : véhicules du rang inférieur à posséder pour ouvrir un rang. */
  window.RANK_NEED = [0, 0, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3];

  /* ───── Obus à partir d'une fiche de canon ───── */
  const SOLID = { AP: 1, APBC: 1, APCBC: 1.05, APHE: 0.94, APCR: 1.3, APDS: 1.4 };
  function buildAmmo(g) {
    const [, cal, vel, mass, pen, types, , heatPen] = g;
    const dmg = Math.round(cal * 1.5 + 5), primary = types.find(t => SOLID[t]);
    const a = {};
    types.forEach(t => {
      if (SOLID[t]) {
        const p = Math.round(pen * SOLID[t] / SOLID[primary]);
        if (t === "APCR") a.APCR = { muzzleVelocity: Math.round(vel * 1.25), mass: Math.max(0.1, r1(mass * 0.45)), caliber: cal, drag: 0.27, penetration: p, damage: Math.round(dmg * 0.65), explosion: 0.2, fuze: false };
        else if (t === "APDS") a.APDS = { muzzleVelocity: Math.round(vel * (t === primary ? 1 : 1.12)), mass: Math.max(0.5, r1(mass * 0.55)), caliber: cal, subCaliber: Math.round(cal * 0.62), drag: 0.24, penetration: p, damage: Math.round(dmg * 0.6), explosion: 0.2, fuze: false };
        else a[t] = { muzzleVelocity: vel, mass, caliber: cal, drag: t === "AP" ? 0.32 : 0.3, penetration: p, damage: t === "AP" ? dmg : Math.round(dmg * 1.05), explosion: 0.45, fuze: false };
      } else if (t === "HEAT") a.HEAT = { muzzleVelocity: Math.round(vel * 0.55), mass: r1(mass * 0.8), caliber: cal, drag: 0.4, penetration: heatPen || Math.round(pen * 1.05), damage: Math.round(cal * 1.5), explosion: 1.5, fuze: false, isHEAT: true };
      else if (t === "HE") a.HE = { muzzleVelocity: Math.round(vel * 0.62), mass: Math.max(0.5, r1(mass * 0.9)), caliber: cal, drag: 0.42, penetration: Math.max(5, Math.round(cal * 0.14)), damage: Math.round(cal * 2.0), explosion: Math.max(0.8, r1(cal / 45)), fuze: false };
      else if (t === "SM") a["fumigène"] = { muzzleVelocity: 400, mass: 5, caliber: cal, drag: 0.5, penetration: 0, damage: 0, explosion: 0, fuze: false, isSmoke: true };
      else if (t === "SH") a.shrapnel = { muzzleVelocity: 500, mass: 6, caliber: cal, drag: 0.45, penetration: 15, damage: 85, explosion: 1.6, fuze: false, isShrapnel: true };
    });
    return a;
  }

  /* ───── Gabarit 3D déduit de la masse, du canon et de la catégorie ───── */
  function deriveOverride(cat, tons, cal, vel, year, o) {
    o = o || {};
    const base = CATEGORY_DEFAULTS[cat], s = Math.sqrt(tons);
    const L = o.L || r1(2.2 + 0.62 * s), W = o.W || r1(2.1 + 0.2 * s);
    const k = o.k || base.tu.k, sc = W / base.W, cas = k === "casemate";
    const tu = { k, l: r1(base.tu.l * sc), w: r1(Math.min(base.tu.w * sc, W - 0.3)), h: base.tu.h, x: base.tu.x };
    const len = Math.max(1.4, Math.min(6.8, cal / 1000 * (30 + vel / 1000 * 22)));
    const gun = { len: r1(len), r: r1((0.02 + 0.00045 * cal) * 1000) / 1000 };
    if (cal >= 75 && cal <= 128 && year <= 1955) gun.brake = len > 4.5 ? "double" : "single";
    if (year >= 1955 && cal >= 90) gun.evac = true;
    const ov = { cat, L, W, hullTop: base.hullTop, trackH: base.trackH, gl: base.gl, nose: base.nose, tu, gun,
      wheels: Math.max(4, Math.min(12, Math.round(L * 1.2))), mantlet: (cas || k === "open") ? "box" : year <= 1950 ? "round" : "none",
      fenders: year <= 1945 && !o.sk, cupola: (cas || k === "open" || year >= 1975) ? "none" : "right" };
    if (o.sk) ov.skirts = true;
    if (cas) ov.traverse = 24;
    return ov;
  }

  /* ───── Fiche de combat complète (même structure que l'extension existante) ───── */
  function buildModules(name, nation, tier, cat, year, g, speed, crew, tons, ar, o) {
    o = o || {};
    const cal = g[1], modern = tier >= 7, cas = (o.k || CATEGORY_DEFAULTS[cat].tu.k) === "casemate";
    return {
      canon: true, speed, reverseSpeed: -Math.max(3, Math.round(speed * 0.18)), crew,
      turretRotSpeed: cas ? 10 : cat === "light" ? 24 : cat === "heavy" ? 14 : cat === "mbt" ? (tier >= 8 ? 28 : 22) : 20,
      weightTons: tons, reloadSec: g[6] || (cal >= 120 ? 8.5 : cal >= 100 ? 7.2 : cal >= 75 ? 6.0 : cal >= 57 ? 5.0 : 4.5),
      armor: {
        hullFront: { thickness: ar[0], angle: o.sl != null ? o.sl : (modern ? 30 : 12) },
        hullSide: { thickness: ar[1], angle: 0 }, hullRear: { thickness: ar[2], angle: 10 },
        turretFront: { thickness: ar[3], angle: o.tl != null ? o.tl : (modern ? 35 : 10) },
        turretSide: { thickness: ar[4], angle: 0 }, turretRear: { thickness: ar[5], angle: 0 },
        hullRoof: { thickness: modern ? 30 : 12, angle: 0 }, hullBottom: { thickness: modern ? 20 : 10, angle: 0 }, turretRoof: { thickness: modern ? 30 : 12, angle: 0 }
      },
      ammo: buildAmmo(g), engine: true, trackLeft: true, trackRight: true,
      trackArmor: { front: modern ? 40 : 12, side: modern ? 35 : 18, rear: modern ? 30 : 12 },
      nationName: NATION_NAME[nation], role: ROLE[cat], year: String(year), gun: g[0], caliber: cal,
      estimatedEnginePowerHp: Math.round(tons * (tier >= 8 ? 24 : tier >= 5 ? 18 : 14)),
      dimensionsMeters: { length: r1(2.2 + 0.62 * Math.sqrt(tons)), width: r1(2.1 + 0.2 * Math.sqrt(tons)), height: tier >= 8 ? 2.5 : 2.7 },
      moduleLayout: { engine: { x: 0, y: 0.7, z: -1.5 }, transmission: { x: 0, y: 0.45, z: -2.1 }, driver: { x: 0, y: 0.9, z: 1.1 }, gunner: { x: 0.65, y: 1.25, z: 0.2 }, commander: { x: -0.55, y: 1.35, z: 0.1 }, ammo: { x: 0, y: 0.65, z: 0.0 } },
      dataQuality: "ESTIMATION_JEU — vérifier les valeurs avant usage historique"
    };
  }

  /* ───── Installation ───── */
  Object.keys(ROWS).forEach(nat => {
    const list = ROWS[nat];
    list.forEach((row, i) => {
      let [name, tier, cat, prev] = row;
      if (prev === "^") prev = list[i - 1][0];
      const known = !!TECH_TREE[name] && !(row[10] && row[10].redo);
      if (!known) {
        const [, , , , year, gk, speed, crew, tons, ar, opts] = row, g = GUNS[gk];
        if (!g) throw new Error("[roster-wt] canon inconnu : " + gk + " (" + name + ")");
        TECH_TREE[name] = { cost: 100, previous: null, nation: FLAG[nat], visual: tier <= 3 ? "🛡" : tier <= 6 ? "⚔" : tier <= 9 ? "⚡" : "🏆",
          tier, canon: g[0], speed: speed + "kph", crew: String(crew), armor: ar[0] + "mm", role: ROLE[cat], year: String(year), nationName: NATION_NAME[nat] };
        TANK_MODULES[name] = buildModules(name, nat, tier, cat, year, g, speed, crew, tons, ar, opts);
        TANK_OVERRIDES[name] = deriveOverride(cat, tons, g[1], g[2], year, opts);
      } else if (!TANK_OVERRIDES[name]) {
        // véhicule du roster étendu d'origine : pas de gabarit 3D, on le déduit de ses données
        const m = TANK_MODULES[name], a0 = Object.values(m.ammo || {})[0] || {}, yr = parseInt(m.year) || 1990;
        TANK_OVERRIDES[name] = deriveOverride(cat, m.weightTons || 40, a0.caliber || 105, a0.muzzleVelocity || 1000, yr, name === "Strv 103C" ? { k: "casemate" } : {});
      }
      TECH_TREE[name].tier = tier;
      TECH_TREE[name].previous = prev || null;
      TECH_TREE[name]._nat = nat;
    });
  });

  /* ───── BR et coûts ───── */
  function powerScore(n) {
    const m = TANK_MODULES[n], a = m.armor, ammo = Object.values(m.ammo)[0] || {};
    const pen = Math.max(...Object.values(m.ammo).map(x => x.penetration || 0));
    const eff = (p) => p.thickness / Math.max(0.35, Math.cos((p.angle || 0) * Math.PI / 180));
    return pen + 0.5 * Math.min(eff(a.hullFront), 1500) + 0.4 * (a.turretFront.thickness || a.hullFront.thickness) + 0.5 * (m.speed || 40) + (ammo.caliber || 0) * 0.1;
  }
  const byTier = {};
  Object.keys(TECH_TREE).forEach(n => { (byTier[TECH_TREE[n].tier] = byTier[TECH_TREE[n].tier] || []).push(n); });
  Object.keys(byTier).forEach(t => {
    const arr = byTier[t].sort((x, y) => powerScore(x) - powerScore(y)), N = arr.length;
    arr.forEach((n, i) => {
      const f = N > 1 ? i / (N - 1) : 0, idx = f < 0.34 ? 0 : f < 0.67 ? 1 : 2, tier = +t;
      TECH_TREE[n].br = r1(tier + [0, 0.3, 0.7][idx]);
      TECH_TREE[n].cost = TECH_TREE[n].previous ? Math.round(COST[tier] * [1, 1.1, 1.2][idx] / 10) * 10 : 0;
    });
  });
  Object.keys(TECH_TREE).forEach(n => { if (!TECH_TREE[n].previous) TECH_TREE[n].cost = 0; });

  /* Regroupement par rang recalculé (TIERS a été construit avant ce fichier). */
  if (typeof TIERS !== "undefined" && typeof computeTiers === "function") TIERS.splice(0, TIERS.length, ...computeTiers());
})();
