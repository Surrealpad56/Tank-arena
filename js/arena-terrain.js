/* ==========================================================================
   ARENA-TERRAIN.JS — Obstacles (collision 3D, hauteurs), ligne de vue,
   points de capture. La génération de la texture du sol est dans
   terrain-gen.js ; le rendu 3D du décor est dans arena-world.js.
   ========================================================================== */
console.log("[TankArena] chargement : arena-terrain.js");

/* Les obstacles, le relief, l'eau et les points de capture viennent de la carte
   choisie (map-engine.js / map-defs.js).
   Obstacle : [type, x, y, w, h, options] — type : building | rock | hedge | wall */
const MAP_LAYOUT = MapEngine.layout(MAP_THEME);
MAP_LAYOUT.ensureHeight();
const OBSTACLE_DEFS = MAP_LAYOUT.obs;

/* ───── Relief ─────
   groundH : altitude du sol en px de carte (tablier du pont inclus).
   slopeAt : pente (tan) au point donné. */
function groundH(px, py) { return MAP_LAYOUT.groundM(px, py) * PIXELS_PER_METER; }
function slopeAt(px, py) { return MAP_LAYOUT.slopeAt(px, py); }

/* Hauteurs réelles (mètres) : les obus et les regards passent au-dessus des
   obstacles bas ; bâtiments et rochers hauts bloquent tout. */
const OBSTACLE_H_M = { building: 6.4, wall: 2.3, hedge: 1.5 };
function obstacleHeightM(o) {
  const [type, , , w, h, op] = o;
  if (op && op.hm) return op.hm;
  if (type === "rock") return Math.max(1.8, Math.min(op && op.big ? 7.5 : 5.5, Math.min(w, h) * PX * 0.42));
  return OBSTACLE_H_M[type];
}
/* g0 : altitude de la base (m), gmin : point le plus bas de l'emprise, hpx : sommet absolu (px) */
const OBSTACLES = OBSTACLE_DEFS.map((o, i) => {
  const [type, x, y, w, h, op] = o, hm = obstacleHeightM(o), G = MAP_LAYOUT.groundM;
  let g0 = G(x + w / 2, y + h / 2), gmin = g0;
  if (type !== "rock") for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) { const g = G(x + w * dx, y + h * dy); if (g > g0) g0 = g; if (g < gmin) gmin = g; }
  return { type, x, y, w, h, opt: op || {}, i, hm, g0, gmin, g0px: g0 * PIXELS_PER_METER, hpx: (g0 + hm) * PIXELS_PER_METER };
});

/* Grille spatiale : chaque case liste les obstacles à moins de 150 px (collisions, tirs, vue). */
const OBS_CELL = 400, OBS_COLS = Math.ceil(MAP_WIDTH / OBS_CELL), OBS_ROWS = Math.ceil(MAP_HEIGHT / OBS_CELL);
const OBS_GRID = Array.from({ length: OBS_COLS * OBS_ROWS }, () => []);
for (const o of OBSTACLES) {
  const x0 = Math.max(0, Math.floor((o.x - 150) / OBS_CELL)), x1 = Math.min(OBS_COLS - 1, Math.floor((o.x + o.w + 150) / OBS_CELL));
  const y0 = Math.max(0, Math.floor((o.y - 150) / OBS_CELL)), y1 = Math.min(OBS_ROWS - 1, Math.floor((o.y + o.h + 150) / OBS_CELL));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) OBS_GRID[j * OBS_COLS + i].push(o);
}
const NO_OBS = [];
function obstaclesNear(px, py) { const i = Math.floor(px / OBS_CELL), j = Math.floor(py / OBS_CELL); return i < 0 || j < 0 || i >= OBS_COLS || j >= OBS_ROWS ? NO_OBS : OBS_GRID[j * OBS_COLS + i]; }

/* Collision au sol (2D) des chars avec le décor, l'eau profonde et les pentes infranchissables. */
function obstacleBlocksPoint(px, py, margin = 0) {
  if (MAP_LAYOUT.waterBlocks(px, py, margin)) return true;
  for (const o of obstaclesNear(px, py)) {
    if (o.type === "rock") {
      const dx = px - (o.x + o.w / 2), dy = py - (o.y + o.h / 2);
      const rx = o.w / 2 + margin, ry = o.h / 2 + margin;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) return true;
    } else if (px >= o.x - margin && px <= o.x + o.w + margin && py >= o.y - margin && py <= o.y + o.h + margin) return true;
  }
  return false;
}
/* Eau peu profonde / marais : ralentit les chars. */
function inShallowWater(px, py) { return MAP_LAYOUT.waterSlows(px, py); }

/* Altitude absolue (px) du sommet de l'obstacle au point (px,py), ou -1e9 s'il n'y en a pas.
   Les rochers sont des dômes : plus bas sur les bords. */
function obstacleHeightAt(px, py) {
  let best = -1e9;
  for (const o of obstaclesNear(px, py)) {
    if (o.type === "rock") {
      const dx = (px - (o.x + o.w / 2)) / (o.w / 2), dy = (py - (o.y + o.h / 2)) / (o.h / 2);
      const q = dx * dx + dy * dy;
      if (q <= 1) best = Math.max(best, o.g0px + (o.hpx - o.g0px) * Math.sqrt(1 - q * 0.8));
    } else if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) best = Math.max(best, o.hpx);
  }
  return best;
}
/* Un point 3D (px, altitude absolue) est-il dans un obstacle ? */
function obstacleHit3(px, py, pz) { const h = obstacleHeightAt(px, py); return h > -1e8 && pz <= h; }

/* Ligne de vue 3D : {blocked, hedges}. Le relief bloque la vue ; les haies ne bloquent
   pas mais camouflent (voir tickEnemySpotting). */
function losInfo(x1, y1, z1, x2, y2, z2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const out = { blocked: false, hedges: 0 };
  if (dist < 1) return out;
  const steps = Math.max(6, Math.min(110, Math.ceil(dist / 30)));
  let inHedge = false;
  for (let i = 1; i < steps; i++) {
    const t = i / steps, px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, pz = z1 + (z2 - z1) * t;
    if (pz < groundH(px, py) - 4) { out.blocked = true; return out; }
    let hedge = false;
    for (const o of obstaclesNear(px, py)) {
      if (o.type === "hedge") { if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h && pz < o.hpx) hedge = true; continue; }
      if (pz > o.hpx) continue;
      if (o.type === "rock") {
        const dx = (px - (o.x + o.w / 2)) / (o.w / 2), dy = (py - (o.y + o.h / 2)) / (o.h / 2), q = dx * dx + dy * dy;
        if (q <= 1 && pz < o.g0px + (o.hpx - o.g0px) * Math.sqrt(Math.max(0, 1 - q * 0.8))) { out.blocked = true; return out; }
      } else if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) { out.blocked = true; return out; }
    }
    if (hedge && !inHedge) out.hedges++;
    inHedge = hedge;
  }
  return out;
}

// ============================================================
// POINTS DE CAPTURE
// ============================================================
// Deathmatch, campagne et champ d'essai : aucune zone (ni marqueur, ni objectif pour l'IA).
// En campagne l'objectif est le nombre d'éliminations, pas des drapeaux qui ne rapportent rien.
const CAPTURE_POINTS = (["deathmatch", "test", "campaign"].includes(ARENA_CFG.mode) || ARENA_CFG.caps === false) ? [] : MAP_LAYOUT.caps;
const CAPTURE_RATE = 1 / 180;
const CAPTURE_SCORE_INTERVAL = 600; // 3 secondes pour capturer seul

        function tickCapturePoints() {
            if (!CAPTURE_POINTS.length) return;
            // La capture dépend des chars présents dans la zone, pas de l'état du joueur local :
            // en réapparition, les bots doivent pouvoir continuer à capturer pendant sa mort.
            const allTanks = items.filter(i => i instanceof Tank && !i.destroyed);
            for (const cp of CAPTURE_POINTS) {
                let countA = 0, countB = 0;
                for (const t of allTanks) {
                    if (Math.hypot(t.x - cp.x, t.y - cp.y) < cp.radius) {
                        if ((t.teamId || t._teamId) === "A") countA++;
                        else countB++;
                    }
                }
                const contested = countA > 0 && countB > 0;
                cp.contested = contested;

                if (!contested) {
                    if (countA > 0) {
                        cp.progress = Math.min(1, cp.progress + CAPTURE_RATE * countA);
                        if (cp.progress >= 1 && cp.owner !== "A") {
                            cp.owner = "A"; cp.scoreTick = 0;
                            addDamageEvent("capture", `${cp.label} capturé — Équipe A`);
                            
                        }
                    } else if (countB > 0) {
                        cp.progress = Math.max(-1, cp.progress - CAPTURE_RATE * countB);
                        if (cp.progress <= -1 && cp.owner !== "B") {
                            cp.owner = "B"; cp.scoreTick = 0;
                            addDamageEvent("capture", `${cp.label} capturé — Équipe B`);
                            
                        }
                    } else {
                        // décroissance neutre
                        if (cp.progress > 0) cp.progress = Math.max(0, cp.progress - CAPTURE_RATE * 0.3);
                        if (cp.progress < 0) cp.progress = Math.min(0, cp.progress + CAPTURE_RATE * 0.3);
                        if (Math.abs(cp.progress) < 0.01) { cp.progress = 0; cp.owner = null; }
                    }

                    // Score continu si zone capturée
                    if (cp.owner && captureScores()) {
                        cp.scoreTick++;
                        if (cp.scoreTick >= CAPTURE_SCORE_INTERVAL) {
                            cp.scoreTick = 0;
                            if (cp.owner === "A") teamScore.A++;
                            else teamScore.B++;
                            addDamageEvent("capture", `+1 point — ${cp.label} (équipe ${cp.owner})`);
                            
                            checkWinCondition();
                        }
                    }
                } else {
                    cp.scoreTick = 0; // pause si contesté
                }
            }
        }

        