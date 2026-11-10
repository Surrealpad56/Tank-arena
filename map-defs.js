/* ==========================================================================
   MAP-DEFS.JS — Les 10 théâtres d'opérations. Chaque carte a sa géographie
   propre (voir map-engine.js pour le vocabulaire : river, road, bridge,
   town, fields, forest, ridge, hill, enclosure, embank…).
   Repère : 8000 × 8500 px (18 px = 1 m) ; les camps apparaissent à gauche (A)
   et à droite (B) sauf indication contraire dans `spawn`.
   ========================================================================== */

/* ───── 1. Normandie — bocage ───── */
MAPS.normandie = {
  label: "Bocage normand", place: "Normandie, France · juin 1944", tags: "Couvert · haies · 2 ponts",
  desc: "Haies épaisses, vergers et bourgs de pierre autour d'une rivière que seuls deux ponts permettent de franchir vite.",
  seed: 11,
  caps: [[1950, 2650, "FERME DU BOCAGE"], [3980, 4250, "PONT"], [6050, 5850, "VERGER"]],
  pal: { base: "#4a6b32", base2: "#5f7f3b", dark: "#3b5a2b", road: "#8b8170", dirt: "#7a6a4c", rail: "#5a5148", water: "#4a7a8a", deep: "#2c5468", bank: "#6b6244", town: "#9a9078", floor: "#2c4a24", fieldA: "#6a8a3c", fieldB: "#7d8f45", fieldC: "#93994a", bridge: "#a39a86", rubble: "#7a7468" },
  vis: { zenith: 0x5d86b4, horizon: 0xc9d4d8, sun: 0xfff0d6, sunI: 1.25, hemiSky: 0xb9cfe8, hemiGround: 0x4a5a3a, hemiI: 0.95, wall: 0xcbbd9f, roof: 0x9a4f3a, tree: "broad", leaf: [0x2f5a2a, 0x3b6b30, 0x28502a], stone: 0x9d9686, rock: 0x7b766a, sunDir: [-0.5, 0.75, 0.4] },
  relief: { amp: 3.4 },
  build(B) {
    B.hamlets(8);
    B.groves(9, 220, 420, 0.8);
    B.valley([[4150, -100], [3900, 1500], [4250, 3000], [3950, 4250], [4200, 5600], [3900, 7000], [4100, 8600]], 650, 3.2);
    B.rise(1700, 1500, 700, 550, 9); B.rise(6300, 1300, 650, 600, 10); B.rise(1500, 6800, 650, 550, 9); B.rise(6500, 6900, 700, 600, 11); B.rise(5200, 3200, 500, 400, 6); B.rise(2900, 5500, 450, 400, 5);
    B.rocks(1700, 1500, 500, 400, 8, 60, 140); B.rocks(6500, 6900, 500, 400, 8, 60, 140); B.scatter(600, 400, 6800, 7700, 8, { kind: "shack" });
    B.scatter(600, 400, 6800, 7700, 16, { kind: "farm" }); B.scatter(600, 400, 6800, 7700, 10, { kind: "shack" });
    const rv = B.river([[4150, -100], [3900, 1500], [4250, 3000], [3950, 4250], [4200, 5600], [3900, 7000], [4100, 8600]], 190);
    B.road([[-100, 4250], [1500, 4300], [3000, 4200], [3975, 4250], [5000, 4350], [6500, 4200], [8100, 4250]], 150, "paved");
    B.road([[3000, 4200], [2900, 3000], [3100, 1500], [3000, -100]], 110, "dirt");
    B.road([[5100, 4350], [5300, 5800], [5000, 7200], [5200, 8600]], 110, "dirt");
    B.road([[2900, 2250], [4000, 2300], [5600, 2200]], 100, "dirt");
    B.road([[3200, 6300], [4150, 6350], [5300, 6300]], 100, "dirt");
    B.bridge(rv, 4250, "h", 460, 190); B.bridge(rv, 2300, "h", 440, 150); B.bridge(rv, 6350, "h", 440, 150);
    B.patch(4050, 1500, 350, 650, "#46623a", 0.6); B.patch(4100, 6900, 350, 600, "#46623a", 0.6);
    B.town(2150, 3650, 1600, 1130, { cell: [300, 260], house: [0.42, 0.56], skip: 0.1, walls: 0.4, hm: [5, 7.5] });
    B.town(5350, 5450, 900, 780, { cell: [300, 260], skip: 0.3 });
    B.town(5400, 1700, 1000, 800, { cell: [300, 260], skip: 0.3 });
    B.fields(700, 500, 2150, 2900, 538, 483, { hedge: true });
    B.fields(700, 5150, 2200, 2800, 550, 467, { hedge: true });
    B.fields(5100, 450, 2250, 2700, 563, 450, { hedge: true });
    B.fields(5500, 5300, 1900, 2800, 475, 467, { hedge: true });
    B.forest(1750, 6300, 520, 420, 0.8); B.forest(6850, 1600, 450, 500, 0.8); B.forest(5900, 7500, 560, 420, 0.8); B.forest(1250, 1800, 380, 340, 0.75);
    B.forest(3000, 1000, 320, 260, 0.8); B.forest(5300, 3000, 380, 300, 0.8); B.forest(2300, 7600, 380, 260, 0.8); B.forest(6800, 7100, 360, 300, 0.8); B.forest(1100, 6900, 300, 260, 0.8);
    B.craters(3980, 4250, 520, 420, 16, 25, 60);
  }
};

/* ───── 2. Stalingrad — ville en ruines ───── */
MAPS.stalingrad = {
  label: "Stalingrad", place: "Stalingrad, URSS · novembre 1942", tags: "Urbain · ruines · très courte portée",
  desc: "Une ville éventrée entre l'usine, la gare et la colline Mamaïev, avec la Volga dans le dos. Chaque rue est un couloir de tir.",
  seed: 21, spawn: { A: [450, 4250], B: [7250, 4250] },
  caps: [[1900, 5900, "GARE"], [4000, 4250, "SILO À GRAIN"], [6100, 2650, "MAMAÏEV KOURGAN"]],
  pal: { base: "#6f6a5c", base2: "#837c6a", dark: "#4f4b42", road: "#6e6a62", dirt: "#7d7360", rail: "#46423c", water: "#4d6f80", deep: "#2f4c5c", bank: "#8c8570", shore: "#8c8570", town: "#79736a", floor: "#4f5a38", rubble: "#5f5a52", fieldA: "#7b7561", fieldB: "#6e6858", fieldC: "#85806c", bridge: "#6e6a62" },
  vis: { zenith: 0x7d8691, horizon: 0xb7b9b6, sun: 0xf0e2c6, sunI: 0.85, hemiSky: 0xa6aeb6, hemiGround: 0x5a554a, hemiI: 1.0, wall: 0xa59a86, roof: 0x4f4137, tree: "dead", leaf: [0x4a4636, 0x58523d, 0x403c30], stone: 0x8a8578, rock: 0x6c675d, sunDir: [-0.4, 0.5, 0.45], fogF: 0.8 },
  relief: { amp: 1.0 },
  build(B) {
    B.hamlets(4, { ruin: 0.7, hm: [5, 8] });
    B.groves(6, 200, 360, 0.5);
    B.crest([[-100, 6150], [2500, 6000], [5000, 6300], [7700, 6100]], 150, 2.2);
    B.rise(2600, 2300, 520, 420, 5); B.rise(5400, 6900, 520, 420, 5); B.rise(1900, 6600, 520, 420, 4.5); B.rise(5000, 4700, 450, 350, 4);
    B.rocks(2600, 2300, 400, 300, 10, 60, 130); B.rocks(5400, 6900, 400, 300, 10, 60, 130);
    B.scatter(500, 400, 7000, 7700, 10, { kind: "shack", ruin: true });
    B.sea("E", 420, 80);
    B.road([[-100, 4250], [2500, 4300], [4000, 4250], [6000, 4200], [7700, 4250]], 260, "paved");
    B.road([[3900, -100], [4000, 2500], [3950, 4250], [4050, 6500], [3900, 8600]], 220, "paved");
    B.road([[-100, 6150], [2500, 6000], [5000, 6300], [7700, 6100]], 90, "rail");
    B.road([[1200, 1000], [1300, 4000], [1200, 7600]], 150, "paved");
    B.road([[6500, 800], [6600, 4300], [6500, 7900]], 150, "paved");
    B.hill(6150, 2650, 1050, 850);
    B.building(4650, 1350, 760, 280, { hm: 12, ruin: true }); B.building(4650, 1800, 760, 280, { hm: 11, ruin: true }); B.building(5600, 1500, 300, 560, { hm: 12, ruin: true });
    B.building(4280, 3500, 240, 240, { hm: 15, ruin: true });
    B.patch(5200, 1800, 900, 600, "#4b4640", 0.55);
    B.town(1150, 650, 2600, 3000, { cell: [330, 290], house: [0.42, 0.6], ruin: 0.55, skip: 0.2, hm: [6, 10], tall: 0.12 });
    B.town(4250, 650, 1500, 3000, { cell: [330, 290], house: [0.42, 0.6], ruin: 0.6, skip: 0.22, hm: [6, 10], tall: 0.1 });
    B.town(1150, 4900, 2600, 3000, { cell: [330, 290], house: [0.42, 0.6], ruin: 0.6, skip: 0.2, hm: [6, 10], tall: 0.12 });
    B.town(4250, 4900, 2900, 3000, { cell: [330, 290], house: [0.42, 0.6], ruin: 0.5, skip: 0.2, hm: [6, 10], tall: 0.1 });
    B.craters(4000, 4250, 2200, 2000, 46, 30, 80); B.craters(2200, 2200, 900, 900, 18, 25, 60); B.craters(5800, 6800, 900, 900, 18, 25, 60);
    B.patch(3000, 6000, 700, 300, "#d8dadb", 0.35); B.patch(5600, 3000, 600, 400, "#d8dadb", 0.3);
    B.forest(6900, 6900, 380, 320, 0.45);
  }
};

/* ───── 3. Koursk — steppe ───── */
MAPS.koursk = {
  label: "Steppe de Koursk", place: "Koursk, URSS · juillet 1943", tags: "Ouvert · longue portée · levée de terre",
  desc: "Champs de blé à perte de vue, fossé antichar et remblai de chemin de fer. Les tirs partent de loin : trouvez le creux de terrain.",
  seed: 31,
  caps: [[1950, 2850, "SOBORIOVKA"], [4350, 4250, "COTE 252"], [6050, 5650, "KOLKHOZ"]],
  pal: { base: "#7f8a44", base2: "#9a9650", dark: "#66713a", road: "#a39066", dirt: "#9a8458", rail: "#5a5148", water: "#4f7f8f", deep: "#325a6a", bank: "#8a8458", town: "#a4946c", floor: "#4a5a2c", fieldA: "#bda950", fieldB: "#8a9a46", fieldC: "#6f7f3a", bridge: "#8a7a5a", rubble: "#7a7058" },
  vis: { zenith: 0x4f86c6, horizon: 0xd2d9cf, sun: 0xfff1cf, sunI: 1.45, hemiSky: 0xbcd2ea, hemiGround: 0x7a7a42, hemiI: 0.9, wall: 0xd2c6a6, roof: 0x6a5a40, tree: "birch", leaf: [0x6b7a35, 0x7a8438, 0x5a6a30], stone: 0x9a9484, rock: 0x7f7a6c, sunDir: [-0.35, 0.8, 0.4] },
  relief: { amp: 2.8, freq: 1.4 },
  build(B) {
    B.hamlets(6, { hm: [4, 5.5] });
    B.groves(12, 180, 380, 0.85);
    B.crest([[1000, 3300], [2400, 3000], [3200, 3600]], 420, 6); B.crest([[6200, 4800], [7200, 5200]], 400, 5.5);
    B.valley([[5200, 1200], [5600, 2600], [6200, 3300]], 380, 3.5); B.valley([[1200, 5200], [2400, 5900], [3300, 6200]], 360, 3.5);
    B.rocks(4350, 3350, 600, 450, 8, 60, 120); B.scatter(600, 400, 6800, 7700, 10, { kind: "farm" });
    B.scatter(600, 400, 6800, 7700, 10, { kind: "farm" }); B.scatter(600, 400, 6800, 7700, 18, { kind: "shack" });
    B.road([[3300, -100], [3300, 8600]], 80, "rail");
    B.road([[-100, 4300], [1800, 4200], [3300, 4250], [4800, 4350], [6300, 4150], [8100, 4250]], 140, "dirt");
    B.road([[5600, -100], [5700, 3000], [5500, 5000], [5700, 8600]], 110, "dirt");
    B.road([[900, 1300], [2500, 2700], [3300, 3200]], 100, "dirt");
    B.road([[1000, 7600], [2600, 6000], [3300, 5000]], 100, "dirt");
    B.embank(3300, 500, 7500, "v", { th: 70, hm: 1.7, gaps: [[1400, 1900], [3500, 4200], [5600, 6300]] });
    B.embank(5000, 900, 6500, "v", { th: 50, hm: 1.4, gaps: [[1700, 2300], [3000, 3700], [4800, 5400]] });
    B.ditch(5000, 900, 6500, "v", 60, [[1700, 2300], [3000, 3700], [4800, 5400]]);
    B.fields(700, 450, 2500, 1800, 833, 600); B.fields(700, 6100, 2400, 1900, 800, 633); B.fields(3600, 450, 1300, 1800, 650, 600); B.fields(5200, 450, 1500, 2000, 750, 667); B.fields(3600, 6300, 1300, 1700, 650, 567); B.fields(5200, 6000, 1700, 2000, 850, 667);
    B.hill(4350, 3350, 900, 700); B.hill(4600, 1800, 1100, 800); B.hill(4800, 6900, 1000, 800);
    B.town(1450, 2350, 1000, 900, { cell: [300, 260], house: [0.4, 0.55], skip: 0.25, hm: [4, 5.5] });
    B.town(5750, 3350, 900, 800, { cell: [300, 260], house: [0.4, 0.55], skip: 0.25, hm: [4, 5.5] });
    B.town(5700, 5300, 900, 800, { cell: [290, 250], skip: 0.3, hm: [4, 5.5] });
    B.lake(2500, 6900, 300, 200);
    B.forest(2800, 1500, 700, 90, 0.9); B.forest(4000, 2800, 900, 100, 0.9); B.forest(2500, 5400, 800, 90, 0.9); B.forest(6600, 1600, 700, 90, 0.9);
    B.forest(2600, 3500, 320, 260, 0.85); B.forest(5500, 6700, 380, 300, 0.85); B.forest(4300, 5400, 320, 260, 0.85); B.forest(6400, 1100, 380, 300, 0.85); B.forest(1800, 1000, 340, 260, 0.85); B.forest(6700, 7700, 340, 260, 0.85);
    B.minefield(4400, 2300, 600, 400); B.minefield(4000, 5600, 700, 400);
    B.craters(4350, 4250, 1700, 1500, 30, 25, 60);
  }
};

/* ───── 4. Ardennes — forêt enneigée ───── */
MAPS.ardennes = {
  label: "Ardennes", place: "Ardennes, Belgique · décembre 1944", tags: "Forêt · neige · carrefour",
  desc: "Sapinières enneigées, rivière gelée et un village-carrefour. On se bat dans les clairières, au bord des chemins forestiers.",
  seed: 41,
  caps: [[1950, 5900, "FERME DE LA CROIX"], [4000, 4250, "CARREFOUR"], [6050, 2600, "CLAIRIÈRE"]],
  pal: { base: "#d5dce0", base2: "#e8eef0", dark: "#b2bdc2", road: "#8f8f8a", dirt: "#7d7566", rail: "#6a6a66", water: "#8fb7c9", deep: "#6c97ac", bank: "#c5ccd0", town: "#b9b2a6", floor: "#8f9fa0", fieldA: "#e4eaec", fieldB: "#d9e0e3", fieldC: "#cfd7da", bridge: "#9a9690", rubble: "#9a958c" },
  vis: { zenith: 0x9fb2c0, horizon: 0xd7dfe4, sun: 0xfff2e0, sunI: 0.9, hemiSky: 0xcfdbe4, hemiGround: 0xaab4ba, hemiI: 1.1, wall: 0xcfc3ab, roof: 0x5d4a3a, tree: "pine", leaf: [0x2a4a3a, 0x3a5a48, 0x24403a], stone: 0xa09c92, rock: 0x8a8a86, sunDir: [-0.45, 0.4, 0.5], fogF: 0.85 },
  relief: { amp: 3.0 },
  build(B) {
    B.hamlets(6);
    B.groves(8, 300, 600, 0.85);
    B.valley([[2200, -100], [2500, 1500], [2300, 3300], [2500, 5200], [2200, 7000], [2400, 8600]], 600, 3);
    B.rise(1500, 1500, 900, 700, 11); B.rise(6000, 1000, 900, 700, 12); B.rise(6200, 7300, 900, 700, 12); B.rise(1900, 7200, 800, 700, 9); B.rise(5300, 5500, 800, 600, 8); B.crest([[3000, 2200], [3600, 3000]], 300, 5);
    B.rocks(6000, 1000, 600, 450, 10, 70, 150); B.scatter(600, 400, 6800, 7700, 8, { kind: "shack" });
    B.scatter(600, 400, 6800, 7700, 8, { kind: "farm" }); B.scatter(600, 400, 6800, 7700, 16, { kind: "shack" });
    const rv = B.river([[2200, -100], [2500, 1500], [2300, 3300], [2500, 5200], [2200, 7000], [2400, 8600]], 130, { ice: true });
    B.road([[-100, 4250], [1800, 4000], [2450, 4200], [3300, 4400], [4000, 4250], [5200, 4100], [6400, 4400], [8100, 4250]], 130, "dirt");
    B.road([[3900, -100], [4100, 1500], [3950, 3000], [4000, 4250], [4150, 5800], [3900, 7400], [4000, 8600]], 120, "dirt");
    B.road([[3000, 1000], [3600, 2600], [4000, 4250]], 100, "dirt");
    B.road([[4000, 4250], [5000, 5600], [5900, 5900], [6900, 6900]], 100, "dirt");
    B.bridge(rv, 4200, "h", 320, 150);
    B.patch(4000, 4250, 1400, 800, "#8a8478", 0.35);
    B.town(3250, 3650, 1500, 1200, { cell: [300, 260], house: [0.4, 0.55], hm: [5, 8], skip: 0.12 });
    B.town(1500, 5550, 950, 800, { cell: [300, 260], skip: 0.3 }); B.town(5600, 2250, 950, 750, { cell: [300, 260], skip: 0.3 });
    B.forest(1800, 1500, 1300, 1000, 0.85); B.forest(2000, 7200, 1300, 900, 0.85); B.forest(5400, 1100, 1500, 900, 0.85); B.forest(6000, 7300, 1500, 1000, 0.85);
    B.forest(5200, 5500, 1200, 1000, 0.8); B.forest(3100, 2300, 700, 800, 0.75); B.forest(4900, 3200, 700, 500, 0.7); B.forest(3000, 6200, 900, 800, 0.8); B.forest(6700, 3000, 800, 700, 0.75); B.forest(1400, 3300, 600, 500, 0.7);
    B.trench([[3050, 3500], [3050, 4900]], 36);
    B.craters(4000, 3300, 400, 300, 8, 25, 50);
  }
};

/* ───── 5. El Alamein — désert ───── */
MAPS.alamein = {
  label: "El Alamein", place: "Égypte · octobre 1942", tags: "Désert · crête · fort",
  desc: "Dunes, oued asséché et une crête rocheuse que l'on franchit par ses cols. Fort blanc au sud, mer au nord.",
  seed: 51,
  caps: [[1900, 2900, "TELL EL EISA"], [4350, 4250, "COL DE RUWEISAT"], [6100, 5600, "FORT"]],
  pal: { base: "#d2b97c", base2: "#dfc88f", dark: "#b89d62", road: "#8f8574", dirt: "#c4a56c", rail: "#6a6050", water: "#2f8aa8", deep: "#1d5f82", bank: "#e7d9a8", shore: "#7fd0cf", town: "#cdb88a", floor: "#a58c55", fieldA: "#c8b27a", fieldB: "#d6c08a", fieldC: "#bfa56c", bridge: "#b8a67c", rubble: "#a89572" },
  vis: { zenith: 0x4f9ad6, horizon: 0xf0dcb2, sun: 0xfff3d2, sunI: 1.7, hemiSky: 0xcfe0f0, hemiGround: 0x9a7e50, hemiI: 0.85, wall: 0xe0cfa6, roof: 0xc9ae7c, tree: "acacia", leaf: [0x7a8a35, 0x8a9440, 0x6b7a30], stone: 0xc4b08a, rock: 0xa0885f, sunDir: [-0.4, 0.95, 0.3], flatRoof: true },
  relief: { amp: 2.0, freq: 1.3 },
  build(B) {
    B.hamlets(4, { flat: true, hm: [3.5, 4.5] });
    B.groves(4, 180, 300, 0.7);
    B.crest([[4200, 1700], [4450, 3000], [4300, 4250], [4450, 5500], [4300, 6300], [4400, 7700]], 520, 11);
    B.valley([[4350, 4050], [4350, 4450]], 380, 8); B.valley([[4400, 6700], [4400, 6900]], 330, 7); B.valley([[4350, 2150], [4350, 2350]], 300, 6.5);
    B.rise(6500, 6800, 900, 550, 5); B.rise(1800, 5000, 800, 500, 5); B.rise(6200, 2300, 800, 450, 4);
    B.rocks(6200, 4100, 600, 400, 12, 80, 180);
    B.scatter(600, 1500, 6800, 6500, 8, { kind: "farm", flat: true }); B.scatter(600, 1500, 6800, 6500, 14, { kind: "shack", flat: true });
    B.sea("N", 650, 90);
    B.road([[-100, 1250], [2500, 1150], [5200, 1300], [8100, 1150]], 150, "paved");
    B.road([[-100, 4300], [1500, 4150], [3300, 4250], [4350, 4250], [5500, 4350], [7000, 4200], [8100, 4250]], 110, "dirt");
    B.road([[1900, 1200], [2000, 3000], [1800, 5200], [2200, 8600]], 100, "dirt");
    B.road([[4350, 4250], [5100, 5200], [5700, 5700]], 100, "dirt");
    B.river([[3000, 1500], [3100, 3000], [2800, 4600], [3200, 6200], [3000, 8600]], 190, { dry: true });
    B.ridge([[4200, 1700], [4450, 3000], [4300, 4250], [4450, 5500], [4300, 6300], [4400, 7700]], 170, 400, [{ x: 4350, y: 4250, r: 560 }, { x: 4400, y: 6800, r: 400 }, { x: 4350, y: 2250, r: 330 }], { sp: 0.7 });
    B.rocks(6500, 2300, 900, 700, 26, 100, 260); B.rocks(1500, 6600, 900, 800, 18, 80, 200); B.rocks(5600, 7400, 900, 500, 18, 80, 220); B.rocks(2900, 7800, 500, 300, 8, 80, 160);
    B.enclosure(5650, 5200, 900, 800, { th: 30, hm: 3 });
    B.building(5800, 5320, 200, 150, { flat: true, hm: 4 }); B.building(6200, 5320, 200, 150, { flat: true, hm: 4 }); B.building(5800, 5780, 220, 140, { flat: true, hm: 4 }); B.bunker(6250, 5800, 150, 100);
    B.town(1450, 2400, 1000, 1000, { cell: [300, 260], flat: true, skip: 0.25, house: [0.42, 0.58], hm: [3.5, 4.5] });
    B.patch(1950, 6900, 560, 450, "#7a8f4a", 0.65); B.lake(1900, 6900, 260, 170); B.forest(1950, 6900, 560, 460, 0.95); B.forest(5900, 2100, 300, 240, 0.8); B.forest(3400, 7300, 280, 220, 0.8);
    B.dunes(6500, 6800, 1100, 700, 18); B.dunes(1800, 5000, 900, 600, 14); B.dunes(6200, 2300, 900, 500, 12); B.dunes(2800, 2100, 500, 300, 6);
    B.minefield(3500, 2500, 500, 600); B.minefield(5200, 3400, 600, 400);
    B.craters(4350, 4250, 800, 700, 16, 25, 55);
  }
};

/* ───── 6. Monte Cassino — montagne ───── */
MAPS.cassino = {
  label: "Monte Cassino", place: "Latium, Italie · mai 1944", tags: "Relief · monastère · rivière",
  desc: "Une vallée encaissée sous la montagne : la route 6, la rivière Rapido, la ville en ruines et l'abbaye perchée au nord.",
  seed: 61,
  caps: [[1900, 5000, "CASSINO"], [4400, 4250, "ROUTE 6"], [6100, 3500, "VILLA"]],
  pal: { base: "#7b8052", base2: "#8e8f60", dark: "#656a46", road: "#8e8a7e", dirt: "#9a8a64", rail: "#5a5148", water: "#4c7c8c", deep: "#2f5666", bank: "#8a8466", town: "#a39a86", floor: "#566334", fieldA: "#8f9455", fieldB: "#a09a5a", fieldC: "#76814a", bridge: "#a39a86", rubble: "#8a8274" },
  vis: { zenith: 0x5f8fc0, horizon: 0xd0d6d2, sun: 0xfff0d6, sunI: 1.35, hemiSky: 0xc0d2e6, hemiGround: 0x5a5e3c, hemiI: 0.95, wall: 0xcdbfa2, roof: 0x9a5a40, tree: "broad", leaf: [0x6a7a4a, 0x7a8858, 0x5a6a40], stone: 0xa39d90, rock: 0x8d8a80, sunDir: [-0.5, 0.7, 0.4] },
  relief: { amp: 3.0 },
  build(B) {
    B.hamlets(8, { ruin: 0.3 });
    B.groves(12, 220, 460, 0.7);
    B.valley([[3000, -100], [3100, 1500], [2800, 3000], [3050, 4200], [2800, 5800], [3100, 7200], [3000, 8600]], 600, 3);
    B.rise(4400, 1900, 1200, 950, 22); B.plateau(4400, 1900, 560, 420, 22); B.rise(6600, 3600, 600, 500, 7);
    B.rocks(6600, 3600, 450, 350, 10, 60, 140); B.scatter(600, 400, 6800, 7700, 8, { kind: "shack", ruin: true });
    B.scatter(600, 400, 6800, 7700, 8, { kind: "farm" }); B.scatter(600, 400, 6800, 7700, 12, { kind: "shack", ruin: true });
    const rv = B.river([[3000, -100], [3100, 1500], [2800, 3000], [3050, 4200], [2800, 5800], [3100, 7200], [3000, 8600]], 140);
    B.road([[-100, 4300], [1700, 4450], [3050, 4250], [4400, 4250], [5500, 4350], [6500, 4150], [8100, 4250]], 140, "paved");
    B.road([[4400, 4100], [4800, 3700], [4000, 3350], [4700, 3000], [4300, 2650], [4400, 2300]], 100, "dirt");
    B.road([[3050, 6700], [4500, 6600], [6200, 6700]], 100, "dirt");
    B.road([[1700, 4450], [1700, 6000], [2200, 7500]], 100, "dirt");
    B.bridge(rv, 4250, "h", 400, 170); B.bridge(rv, 6700, "h", 400, 140);
    B.patch(4400, 1900, 850, 650, "#9c9886", 0.9);
    B.enclosure(3900, 1450, 1000, 850, { th: 26, hm: 3.2, gate: 300 });
    B.building(4050, 1600, 480, 280, { hm: 10 }); B.building(4650, 1650, 190, 220, { hm: 12 }); B.building(4100, 2000, 360, 150, { hm: 8 });
    B.hill(2000, 1000, 1500, 1100); B.hill(6600, 1200, 1500, 1100); B.hill(3000, 7600, 1700, 1000); B.hill(6200, 7200, 1600, 1100);
    B.ridge([[3500, 800], [4300, 600], [5300, 1000], [5600, 1900]], 220, 420, [], { sp: 0.6 });
    B.ridge([[3300, 1500], [3400, 2300], [3900, 2900]], 180, 360, [], { sp: 0.6 });
    B.ridge([[5100, 1800], [5200, 2500], [4900, 3000]], 180, 360, [], { sp: 0.6 });
    B.town(1300, 3650, 1500, 1900, { cell: [300, 270], house: [0.42, 0.58], ruin: 0.6, skip: 0.2, hm: [5, 8] });
    B.town(5750, 2950, 950, 800, { cell: [290, 250], skip: 0.3 });
    B.forest(1800, 6600, 800, 700, 0.7); B.forest(5800, 5900, 900, 700, 0.7); B.forest(2300, 2300, 600, 500, 0.65);
    B.rocks(5500, 5200, 1400, 900, 40, 60, 160); B.rocks(2100, 6700, 700, 500, 14, 60, 140);
    B.craters(1900, 5000, 700, 700, 14, 25, 55);
  }
};

/* ───── 7. Peleliu — île du Pacifique ───── */
MAPS.peleliu = {
  label: "Peleliu", place: "Palaos, Pacifique · septembre 1944", tags: "Île · jungle · piste d'aviation",
  desc: "Un débarquement sur deux plages : jungle dense, arête rocheuse truffée de casemates et la piste d'aviation au centre.",
  seed: 71, spawn: { A: [720, 4250], B: [7280, 4250] },
  caps: [[1950, 3400, "PLAGE BLANCHE"], [4000, 4750, "AÉRODROME"], [6050, 5100, "PLAGE ORANGE"]],
  pal: { base: "#4e7a3a", base2: "#5f8a42", dark: "#3c6330", road: "#b4a47c", dirt: "#a69468", rail: "#6a6050", water: "#2a8fb0", deep: "#14608a", bank: "#d8cba0", shore: "#7fd0cf", town: "#9a9070", floor: "#2c5a2a", fieldA: "#6a9040", fieldB: "#7aa048", fieldC: "#5a8438", bridge: "#a39a80", rubble: "#8a8470" },
  vis: { zenith: 0x2f8fd9, horizon: 0xbfe6e2, sun: 0xfff4d6, sunI: 1.5, hemiSky: 0xc0e0f4, hemiGround: 0x3d5a2e, hemiI: 0.95, wall: 0xcdbd90, roof: 0x7b8a4a, tree: "palm", leaf: [0x2f7a2f, 0x3a8a34, 0x2a6a2a], stone: 0xa8a290, rock: 0x6f7468, sunDir: [-0.3, 0.85, 0.45], flatRoof: true },
  relief: { amp: 2.2 },
  build(B) {
    B.hamlets(2, { flat: true, hm: [3, 4] });
    B.groves(6, 300, 500, 0.9);
    B.crest([[3000, 1100], [3800, 1500], [4600, 1300], [5300, 1900], [4900, 2800], [4000, 2400], [3200, 2600], [3000, 1900]], 600, 14);
    B.rise(4000, 1900, 1100, 800, 12); B.rise(1800, 1900, 600, 500, 7); B.rise(6200, 1900, 600, 500, 7); B.rise(1900, 6800, 700, 600, 6); B.rise(6100, 6800, 700, 600, 6); B.plateau(4000, 4800, 1500, 380, 1.2);
    B.bunker(2200, 6200, 130, 90); B.bunker(5800, 6300, 130, 90); B.bunker(1800, 2300, 130, 90); B.bunker(6200, 2400, 130, 90);
    B.scatter(900, 900, 6200, 6700, 12, { kind: "shack", ruin: true });
    B.island(4000, 4250, 3900, 4050, 0.035);
    B.road([[500, 4300], [2500, 4500], [4000, 4650], [5600, 4400], [7500, 4200]], 120, "dirt");
    B.road([[4000, 1200], [3800, 3000], [4000, 4650], [4200, 6200], [4000, 7400]], 110, "dirt");
    B.road([[2750, 4850], [5250, 4850]], 200, "paved");
    B.patch(4000, 4800, 1500, 450, "#a89f7c", 0.5);
    B.building(3000, 5200, 320, 190, { flat: true, hm: 6 }); B.building(3500, 5200, 320, 190, { flat: true, hm: 6 }); B.building(4650, 5200, 320, 190, { flat: true, hm: 6 }); B.building(4150, 5250, 100, 100, { flat: true, hm: 12 });
    B.ridge([[3000, 1100], [3800, 1500], [4600, 1300], [5300, 1900], [4900, 2800], [4000, 2400], [3200, 2600], [3000, 1900]], 200, 420, [], { sp: 0.55 });
    B.rocks(4000, 1900, 1100, 800, 40, 120, 320);
    B.bunker(3300, 3000, 140, 90); B.bunker(4700, 3100, 140, 90); B.bunker(3900, 3300, 140, 90); B.bunker(1600, 3050, 130, 90); B.bunker(1700, 5400, 130, 90); B.bunker(6400, 3300, 130, 90); B.bunker(6350, 5300, 130, 90); B.bunker(2300, 4000, 120, 90); B.bunker(5600, 4900, 120, 90);
    B.wall(1330, 2900, 300, 20, 1.0); B.wall(1330, 5600, 300, 20, 1.0); B.wall(6400, 2800, 300, 20, 1.0); B.wall(6350, 5600, 300, 20, 1.0);
    B.forest(1800, 1900, 1000, 900, 0.9); B.forest(6200, 1900, 1000, 900, 0.9); B.forest(1900, 6800, 1100, 1000, 0.9); B.forest(6100, 6800, 1100, 1000, 0.9); B.forest(4000, 7300, 1200, 700, 0.85); B.forest(2700, 3500, 500, 400, 0.7); B.forest(5500, 3900, 600, 400, 0.7);
    B.pool(3000, 6000, 330, 220); B.pool(5300, 2900, 300, 200);
  }
};

/* ───── 8. Marais de Biélorussie ───── */
MAPS.marais = {
  label: "Marais de Biélorussie", place: "Biélorussie, URSS · juin 1944", tags: "Marais · chaussées · brume",
  desc: "Tourbières et bouleaux : seules quelques chaussées de rondins et un pont de bois permettent de manœuvrer. L'eau ralentit tout.",
  seed: 81,
  caps: [[1950, 2750, "ZAOZERIE"], [3950, 4250, "DIGUE"], [6050, 5750, "BEREZINO"]],
  pal: { base: "#6c7140", base2: "#7d7a45", dark: "#4f5a35", road: "#7a6a4a", dirt: "#6d5d40", rail: "#4f4a40", water: "#4a5f4a", deep: "#34473a", bank: "#5d5a3a", town: "#8a7a5a", floor: "#3d4a2a", fieldA: "#7c7f46", fieldB: "#6a7440", fieldC: "#8a8a4c", bridge: "#7a6a4a", rubble: "#6d6650" },
  vis: { zenith: 0x7d8b97, horizon: 0xc4c7c1, sun: 0xf3e6c8, sunI: 0.85, hemiSky: 0xaab6c0, hemiGround: 0x4f4c34, hemiI: 1.0, wall: 0x9a7a54, roof: 0x5d4a3a, tree: "birch", leaf: [0x6b7a35, 0x7a8438, 0x5a6a30], stone: 0x8d8778, rock: 0x77726a, sunDir: [-0.35, 0.5, 0.5], fogK: 0.5, fogF: 0.75 },
  relief: { amp: 1.0 },
  build(B) {
    B.hamlets(5, { hm: [3.5, 4.5] });
    B.groves(10, 260, 520, 0.8);
    B.rise(3500, 2700, 450, 350, 3); B.rise(4700, 5300, 450, 400, 3); B.rise(1500, 6100, 600, 450, 3.5); B.rise(6600, 800, 500, 400, 3); B.rise(2900, 800, 600, 400, 3);
    B.scatter(600, 400, 6800, 7700, 8, { kind: "shack" });
    B.scatter(600, 400, 6800, 7700, 8, { kind: "farm" }); B.scatter(600, 400, 6800, 7700, 18, { kind: "shack" });
    const rv = B.river([[5600, -100], [5300, 2500], [5700, 4500], [5400, 6500], [5600, 8600]], 180);
    B.road([[-100, 4200], [1500, 4400], [2800, 3900], [3950, 4250], [5300, 4350], [6500, 4100], [8100, 4300]], 120, "dirt");
    B.road([[2800, 3900], [3000, 2200], [2600, 800], [2700, -100]], 100, "dirt");
    B.road([[3950, 4250], [4200, 5900], [3800, 7300], [3900, 8600]], 100, "dirt");
    B.road([[4400, 2250], [5400, 2100], [6800, 1900]], 100, "dirt");
    B.bridge(rv, 4350, "h", 400, 140, { kind: "wood" }); B.bridge(rv, 2100, "h", 400, 130, { kind: "wood" });
    B.pool(1900, 1500, 430, 300); B.pool(3600, 1500, 380, 260); B.pool(1200, 2800, 300, 220); B.pool(3300, 5500, 450, 320); B.pool(2300, 6600, 420, 300); B.pool(1700, 7500, 380, 260); B.pool(4200, 7400, 360, 250);
    B.pool(7000, 1500, 420, 300); B.pool(6600, 2800, 300, 220); B.pool(6900, 6300, 400, 300); B.pool(6300, 7400, 420, 300); B.pool(4700, 2700, 350, 260); B.pool(4900, 5500, 300, 220);
    B.patch(3950, 4250, 1400, 550, "#4d4a30", 0.5); B.patch(2000, 3000, 700, 450, "#4d4a30", 0.4); B.patch(6000, 5700, 700, 450, "#4d4a30", 0.4);
    B.town(1650, 2350, 1100, 900, { cell: [260, 230], house: [0.4, 0.55], hm: [3.5, 4.5], skip: 0.25 });
    B.town(5900, 5200, 1000, 900, { cell: [260, 230], house: [0.4, 0.55], hm: [3.5, 4.5], skip: 0.25 });
    B.forest(2900, 800, 1400, 600, 0.8); B.forest(6600, 800, 1200, 600, 0.8); B.forest(1500, 6100, 1200, 900, 0.8); B.forest(3700, 6600, 1100, 900, 0.8); B.forest(6700, 7100, 1300, 900, 0.85); B.forest(3500, 2700, 700, 500, 0.75); B.forest(4700, 5300, 650, 600, 0.7); B.forest(7000, 4000, 400, 300, 0.6);
  }
};

/* ───── 9. Golan — plateau volcanique ───── */
MAPS.golan = {
  label: "Plateau du Golan", place: "Golan, Proche-Orient · octobre 1973", tags: "Basalte · fossé antichar · tertres",
  desc: "Un plateau de basalte semé de rochers, barré par un fossé antichar. Les tertres volcaniques offrent les meilleures positions de tir.",
  seed: 91,
  caps: [[1950, 5750, "KIBBOUTZ"], [4300, 4250, "TEL FARES"], [6050, 2750, "VILLAGE"]],
  pal: { base: "#8d7458", base2: "#a08462", dark: "#5f4b3a", road: "#8a8076", dirt: "#a38a64", rail: "#5a5148", water: "#3f7f98", deep: "#2a5a70", bank: "#9a8a6a", town: "#c9b898", floor: "#6b5a40", fieldA: "#9a8460", fieldB: "#8a7552", fieldC: "#a78e68", bridge: "#8a8076", rubble: "#7a6c58" },
  vis: { zenith: 0x4a90d0, horizon: 0xe6d8b8, sun: 0xfff1d0, sunI: 1.65, hemiSky: 0xcfddec, hemiGround: 0x8a6e4e, hemiI: 0.85, wall: 0xe0d2b0, roof: 0xc9ae7c, tree: "acacia", leaf: [0x6a7a38, 0x7a8640, 0x5e6e32], stone: 0xc4b48e, rock: 0x4a4540, sunDir: [-0.35, 0.9, 0.35], flatRoof: true },
  relief: { amp: 3.5, freq: 1.5 },
  build(B) {
    B.hamlets(5, { flat: true, hm: [3.5, 4.5] });
    B.groves(4, 160, 280, 0.5);
    B.crest([[5600, 3300], [6400, 4100], [7300, 4800]], 450, 8); B.valley([[3500, 2400], [3800, 3200]], 400, 4);
    B.rise(2500, 2000, 900, 700, 8); B.rise(5000, 7200, 1000, 700, 9);
    B.rocks(6400, 4100, 600, 450, 12, 70, 160);
    B.scatter(600, 400, 6800, 7700, 8, { kind: "farm", flat: true }); B.scatter(600, 400, 6800, 7700, 14, { kind: "shack", flat: true });
    B.road([[-100, 4300], [1700, 4250], [2850, 4250], [4300, 4250], [5800, 4300], [7000, 4200], [8100, 4250]], 130, "paved");
    B.road([[4300, 4250], [5000, 5400], [6100, 5900], [7400, 6300]], 100, "dirt");
    B.road([[4300, 4250], [4200, 2800], [4600, 1200], [4500, -100]], 100, "dirt");
    B.road([[1950, 5750], [2300, 4900], [2850, 4250]], 90, "dirt");
    B.embank(2850, 700, 7000, "v", { th: 50, hm: 1.7, gaps: [[1400, 2000], [3300, 4000], [5200, 5900]] });
    B.ditch(2850, 700, 7000, "v", 60, [[1400, 2000], [3300, 4000], [5200, 5900]]);
    B.embank(3300, 2400, 600, "h", { th: 44, hm: 1.6 }); B.embank(3300, 6200, 600, "h", { th: 44, hm: 1.6 });
    B.patch(2500, 2000, 1400, 1100, "#4f3f33", 0.5); B.patch(5200, 7200, 1500, 900, "#4f3f33", 0.5); B.patch(5700, 1600, 1500, 900, "#4f3f33", 0.5);
    B.hill(4300, 3350, 1000, 800); B.hill(5400, 1500, 1100, 900); B.hill(3200, 7300, 1100, 800);
    B.rocks(2500, 2000, 1400, 1300, 45, 60, 170); B.rocks(5600, 1600, 1500, 1000, 40, 60, 170); B.rocks(5000, 7200, 1700, 900, 45, 60, 170); B.rocks(1500, 7200, 900, 900, 25, 60, 150); B.rocks(6700, 5800, 800, 600, 20, 60, 150); B.rocks(3800, 5200, 700, 500, 14, 60, 130);
    B.enclosure(1350, 5200, 1200, 1100, { th: 20, hm: 2, gate: 260 });
    B.town(1450, 5300, 1000, 900, { cell: [290, 250], flat: true, skip: 0.3, hm: [3.5, 4.5] });
    B.town(5700, 2350, 900, 800, { cell: [290, 250], flat: true, skip: 0.3, hm: [3.5, 4.5] });
    B.bunker(2500, 3400, 130, 90); B.bunker(2500, 5200, 130, 90); B.bunker(2500, 2200, 130, 90); B.bunker(3600, 4900, 120, 90);
    B.forest(2900, 6100, 450, 350, 0.55); B.forest(6700, 3000, 400, 300, 0.5);
    B.craters(5000, 3000, 900, 700, 14, 25, 55);
  }
};

/* ───── 10. Arnhem — polder et Rhin ───── */
MAPS.arnhem = {
  label: "Arnhem", place: "Pays-Bas · septembre 1944", tags: "Polder · fleuve · pont",
  desc: "Un polder plat et ouvert, des digues basses, et le Rhin que l'on ne traverse que par le grand pont, au pied d'une ville de briques.",
  seed: 101,
  caps: [[1800, 3400, "DIGUE OUEST"], [4000, 5400, "PONT D'ARNHEM"], [6200, 3400, "DIGUE EST"]],
  pal: { base: "#6f9a45", base2: "#86a64e", dark: "#58803c", road: "#8e8678", dirt: "#8a7a5a", rail: "#5a5148", water: "#5f8294", deep: "#44637a", bank: "#7a7a5a", town: "#a89478", floor: "#3e6a30", fieldA: "#7fa84a", fieldB: "#a1b45a", fieldC: "#689a40", bridge: "#8d8a82", rubble: "#7a7468" },
  vis: { zenith: 0x7f9ab8, horizon: 0xc9d3d8, sun: 0xf6eeda, sunI: 1.05, hemiSky: 0xb4c6d8, hemiGround: 0x5a6e44, hemiI: 1.0, wall: 0xb8745a, roof: 0x9a4a38, tree: "poplar", leaf: [0x4a7a38, 0x5a8a40, 0x3e6a32], stone: 0x9a9488, rock: 0x7a766c, sunDir: [-0.4, 0.6, 0.45], fogF: 0.9 },
  relief: { amp: 0.7 },
  build(B) {
    B.hamlets(8, { hm: [5, 7] });
    B.groves(10, 160, 320, 0.85);
    B.crest([[300, 4950], [2000, 4900], [4000, 4950], [6000, 4900], [7700, 4950]], 150, 2.2);
    B.rise(3000, 3600, 800, 500, 4); B.rise(1500, 3000, 600, 400, 3); B.rise(6700, 3100, 600, 400, 3);
    B.scatter(600, 400, 6800, 4300, 8, { kind: "farm" });
    B.scatter(600, 400, 6800, 4300, 8, { kind: "farm" }); B.scatter(600, 6000, 6800, 2100, 6, { kind: "farm" });
    const rh = B.river([[-100, 5500], [1800, 5350], [3800, 5450], [6000, 5300], [8100, 5450]], 480, { block: true });
    B.road([[4000, -100], [3900, 1800], [4000, 3500], [4000, 4600], [4000, 6200], [4000, 8600]], 170, "paved");
    B.road([[-100, 3800], [2000, 3700], [4000, 3600], [6000, 3700], [8100, 3800]], 120, "paved");
    B.road([[400, 2400], [2500, 2300], [4000, 2350], [7600, 2250]], 90, "dirt");
    B.road([[4000, 6200], [6000, 6300], [8100, 6200]], 100, "dirt");
    B.road([[6400, -100], [6400, 8600]], 90, "rail");
    B.bridge(rh, 4000, "v", 900, 200, { kind: "steel" }); B.bridge(rh, 6400, "v", 900, 100, { kind: "rail" });
    B.river([[300, 1900], [2000, 1850], [3600, 1900]], 60); B.river([[4500, 1500], [6000, 1450], [7700, 1550]], 60); B.river([[300, 7200], [2000, 7100], [3600, 7250]], 60); B.river([[4600, 7400], [6100, 7300], [7700, 7400]], 60);
    B.town(2400, 5950, 3400, 2100, { cell: [320, 280], house: [0.45, 0.6], skip: 0.1, hm: [7, 10], tall: 0.1 });
    B.town(3000, 2850, 2000, 1500, { cell: [300, 260], skip: 0.25, hm: [5, 7.5] });
    B.fields(500, 450, 3000, 1300, 750, 650, { kinds: ["fieldA", "fieldB", "fieldC"] }); B.fields(4500, 450, 3000, 1000, 750, 500); B.fields(500, 2500, 2400, 1200, 800, 600); B.fields(5200, 2500, 2400, 1200, 800, 600); B.fields(500, 6000, 1800, 2000, 600, 667); B.fields(6000, 6000, 1600, 2000, 800, 667);
    B.embank(300, 4950, 7400, "h", { th: 60, hm: 1.4, gaps: [[1200, 1800], [3300, 4200], [5600, 6300], [6000, 6400]] });
    B.ditch(300, 4950, 7400, "h", 60, [[1200, 1800], [3300, 4200], [5600, 6300]]);
    for (const [fx, fy] of [[1200, 1000], [2800, 1000], [5300, 900], [6800, 1000], [1100, 6800], [2200, 7500], [6300, 7500], [7000, 6500]]) { B.building(fx, fy, 170, 120, { hm: 5.5 }); B.building(fx + 230, fy + 20, 200, 110, { hm: 6 }); }
    B.building(6800, 2750, 110, 110, { hm: 11 });
    B.forest(2000, 1100, 1100, 60, 0.9); B.forest(6000, 650, 1200, 60, 0.9); B.forest(1500, 3000, 900, 60, 0.9); B.forest(6700, 3100, 800, 60, 0.9); B.forest(7000, 7800, 800, 80, 0.9); B.forest(1200, 8000, 900, 80, 0.9);
    B.craters(4000, 5400, 500, 300, 10, 25, 50);
  }
};

const MAP_THEMES = ["normandie", "stalingrad", "koursk", "ardennes", "alamein", "cassino", "peleliu", "marais", "golan", "arnhem"];
const MAP_THEME_META = Object.fromEntries(MAP_THEMES.map(k => [k, { name: MAPS[k].label, vibe: MAPS[k].desc, objective: MAPS[k].tags }]));
const MAP_THEME_LABELS = Object.assign({ est: "Front de l'Est", afrique: "Afrique du Nord", pacifique: "Pacifique" }, Object.fromEntries(MAP_THEMES.map(k => [k, MAPS[k].label])));
