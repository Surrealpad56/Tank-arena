/* ==========================================================================
   SHARED-DATA.JS — Source unique de vérité pour les données de chars/obus
   Chargé par lobby.html ET arena.html.

   Fix #22 (critique) : avant, techTree (Lobby) et tankModules (Arena)
   utilisaient des clés légèrement différentes ("Panzer III Ausf. L" vs
   "Panzer III Ausf L"), compensé par des .replace() fragiles dispersés
   dans le code. Ici, TANK_MODULES est déjà indexé sur les clés canoniques
   de TECH_TREE : un seul jeu de noms, une seule source de vérité.
   ========================================================================== */
console.log("[TankArena] chargement : shared-data.js");

function normalizeTankKey(name) {
  return (name || "").replace(/\./g, "").replace(/\s+/g, " ").trim();
}

/* ========== ARBRE TECHNIQUE (progression, coût XP, fiche courte) ========== */
const TECH_TREE = {
      "Panzer III Ausf. L": { cost: 100, previous: null, nation: "🇩🇪", visual: "🛡", tier: 1, canon: "50mm KwK 39", speed: "40kph", crew: "5", armor: "50mm" },
      "T-28E": { cost: 100, previous: null, nation: "🇷🇺", visual: "🛡", tier: 1, canon: "76mm L-11", speed: "42kph", crew: "6", armor: "30mm" },
      "Matilda Mk.II": { cost: 100, previous: null, nation: "🇬🇧", visual: "🛡", tier: 1, canon: "2pdr QF", speed: "24kph", crew: "4", armor: "78mm" },
      "M24 Chaffee": { cost: 100, previous: null, nation: "🇺🇸", visual: "🛡", tier: 1, canon: "75mm M6", speed: "56kph", crew: "5", armor: "25mm" },
      "STuG III Ausf. F": { cost: 200, previous: "Panzer III Ausf. L", nation: "🇩🇪", visual: "⚔", tier: 2, canon: "75mm StuK 40", speed: "40kph", crew: "4", armor: "50mm" },
      "T-34 (1941)": { cost: 200, previous: "T-28E", nation: "🇷🇺", visual: "⚔", tier: 2, canon: "76mm F-34", speed: "54kph", crew: "4", armor: "45mm" },
      "Comet I": { cost: 200, previous: "Matilda Mk.II", nation: "🇬🇧", visual: "⚔", tier: 2, canon: "77mm HV", speed: "51kph", crew: "5", armor: "76mm" },
      "M4A1 Sherman": { cost: 200, previous: "M24 Chaffee", nation: "🇺🇸", visual: "⚔", tier: 2, canon: "75mm M3", speed: "48kph", crew: "5", armor: "76mm" },
      "Panzer IV Ausf. H": { cost: 400, previous: "STuG III Ausf. F", nation: "🇩🇪", visual: "⚔", tier: 3, canon: "75mm KwK 40", speed: "38kph", crew: "5", armor: "80mm" },
      "KV-1 (ZiS 5)": { cost: 400, previous: "T-34 (1941)", nation: "🇷🇺", visual: "⚔", tier: 3, canon: "76mm ZiS-5", speed: "35kph", crew: "5", armor: "75mm" },
      "Avenger": { cost: 400, previous: "Comet I", nation: "🇬🇧", visual: "⚔", tier: 3, canon: "17pdr QF", speed: "52kph", crew: "4", armor: "14mm" },
      "M4 Calliopé": { cost: 400, previous: "M4A1 Sherman", nation: "🇺🇸", visual: "⚔", tier: 3, canon: "75mm M3 + roquettes", speed: "38kph", crew: "5", armor: "76mm" },
      "Panzer V Panther Ausf. D": { cost: 700, previous: "Panzer IV Ausf. H", nation: "🇩🇪", visual: "🔱", tier: 4, canon: "75mm KwK 42", speed: "46kph", crew: "5", armor: "80mm" },
      "KV-2 (ZiS 6)": { cost: 700, previous: "KV-1 (ZiS 5)", nation: "🇷🇺", visual: "🔱", tier: 4, canon: "152mm M-10", speed: "26kph", crew: "6", armor: "75mm" },
      "Churchill Mk.VII": { cost: 700, previous: "Avenger", nation: "🇬🇧", visual: "🔱", tier: 4, canon: "75mm QF", speed: "20kph", crew: "5", armor: "152mm" },
      "M-18 Hellcat": { cost: 700, previous: "M4 Calliopé", nation: "🇺🇸", visual: "🔱", tier: 4, canon: "76mm M1", speed: "89kph", crew: "5", armor: "12mm" },
      "Panzer VI Tiger Ausf. H": { cost: 1000, previous: "Panzer V Panther Ausf. D", nation: "🇩🇪", visual: "👑", tier: 5, canon: "88mm KwK 36", speed: "45kph", crew: "5", armor: "100mm" },
      "IS-2 (1944)": { cost: 1000, previous: "KV-2 (ZiS 6)", nation: "🇷🇺", visual: "👑", tier: 5, canon: "122mm D-25T", speed: "37kph", crew: "4", armor: "120mm" },
      "Black Prince": { cost: 1000, previous: "Churchill Mk.VII", nation: "🇬🇧", visual: "👑", tier: 5, canon: "17pdr QF Mk.VII", speed: "18kph", crew: "5", armor: "152mm" },
      "M-26 Pershing": { cost: 1000, previous: "M-18 Hellcat", nation: "🇺🇸", visual: "👑", tier: 5, canon: "90mm M3", speed: "48kph", crew: "5", armor: "102mm" },
      "Panzer VI Ausf. B King Tiger": { cost: 1500, previous: "Panzer VI Tiger Ausf. H", nation: "🇩🇪", visual: "🏆", tier: 6, canon: "88mm KwK 43", speed: "38kph", crew: "5", armor: "150mm" },
      "T-10A": { cost: 1500, previous: "IS-2 (1944)", nation: "🇷🇺", visual: "🏆", tier: 6, canon: "122mm D-25TA", speed: "42kph", crew: "4", armor: "120mm" },
      "FV4202": { cost: 1500, previous: "Black Prince", nation: "🇬🇧", visual: "🏆", tier: 6, canon: "105mm L7A1", speed: "35kph", crew: "4", armor: "120mm" },
      "T-34 heavy tank": { cost: 1500, previous: "KV-2 (ZiS 6)", nation: "🇷🇺", visual: "🏆", tier: 6, canon: "100mm D10-T", speed: "55kph", crew: "4", armor: "90mm" },
      "Leopard 1": { cost: 2000, previous: "Panzer VI Ausf. B King Tiger", nation: "🇩🇪", visual: "⚡", tier: 7, canon: "105mm L7A1", speed: "65kph", crew: "4", armor: "70mm" },
      "T-55A": { cost: 2000, previous: "T-10A", nation: "🇷🇺", visual: "⚡", tier: 7, canon: "100mm D10-T2S", speed: "50kph", crew: "4", armor: "100mm" },
      "Chieftain Mk.X": { cost: 2000, previous: "FV4202", nation: "🇬🇧", visual: "⚡", tier: 7, canon: "120mm L11A5", speed: "48kph", crew: "4", armor: "195mm" },
      "M-46 Patton": { cost: 2000, previous: "M-26 Pershing", nation: "🇺🇸", visual: "⚡", tier: 7, canon: "90mm M3A1", speed: "48kph", crew: "5", armor: "101mm" }
    };

/* ========== MODULES TECHNIQUES DÉTAILLÉS (moteur de combat Arena) ==========
   Indexé sur les MÊMES clés que TECH_TREE ci-dessus. */
const TANK_MODULES = 
{
  "Panzer III Ausf. L": {
    "canon": true,
    "speed": 40,
    "reverseSpeed": -6,
    "crew": 5,
    "turretRotSpeed": 15,
    "weightTons": 22.3,
    "reloadSec": 5.5,
    "armor": {
      "hullFront": {
        "thickness": 30,
        "angle": 15
      },
      "hullSide": {
        "thickness": 30,
        "angle": 0
      },
      "hullRear": {
        "thickness": 21,
        "angle": 10
      },
      "turretFront": {
        "thickness": 30,
        "angle": 10
      },
      "turretSide": {
        "thickness": 30,
        "angle": 0
      },
      "turretRear": {
        "thickness": 22,
        "angle": 0
      }
    },
    "ammo": {
      "APC": {
        "muzzleVelocity": 800,
        "mass": 3.8,
        "caliber": 50,
        "drag": 0.34,
        "penetration": 61,
        "damage": 80,
        "explosion": 0.4,
        "fuze": false
      },
      "APCR": {
        "muzzleVelocity": 1050,
        "mass": 1.8,
        "caliber": 50,
        "drag": 0.27,
        "penetration": 98,
        "damage": 52,
        "explosion": 0.2,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 450,
        "mass": 1.8,
        "caliber": 50,
        "drag": 0.42,
        "penetration": 6,
        "damage": 90,
        "explosion": 1.1,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 15,
      "side": 20,
      "rear": 15
    }
  },
  "T-28E": {
    "canon": true,
    "speed": 42,
    "reverseSpeed": -5,
    "crew": 6,
    "turretRotSpeed": 16,
    "weightTons": 32,
    "reloadSec": 7.5,
    "armor": {
      "hullFront": {
        "thickness": 30,
        "angle": 20
      },
      "hullSide": {
        "thickness": 20,
        "angle": 0
      },
      "hullRear": {
        "thickness": 20,
        "angle": 10
      },
      "turretFront": {
        "thickness": 30,
        "angle": 10
      },
      "turretSide": {
        "thickness": 20,
        "angle": 0
      },
      "turretRear": {
        "thickness": 20,
        "angle": 0
      }
    },
    "ammo": {
      "APBC": {
        "muzzleVelocity": 612,
        "mass": 6.3,
        "caliber": 76,
        "drag": 0.36,
        "penetration": 61,
        "damage": 115,
        "explosion": 0.5,
        "fuze": true
      },
      "HE": {
        "muzzleVelocity": 680,
        "mass": 6.2,
        "caliber": 76,
        "drag": 0.42,
        "penetration": 8,
        "damage": 185,
        "explosion": 2.1,
        "fuze": false
      },
      "shrapnel": {
        "muzzleVelocity": 500,
        "mass": 5,
        "caliber": 76,
        "drag": 0.45,
        "penetration": 12,
        "damage": 70,
        "explosion": 1.4,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 10,
      "side": 14,
      "rear": 10
    }
  },
  "Matilda Mk.II": {
    "canon": true,
    "speed": 24,
    "reverseSpeed": -3,
    "crew": 4,
    "turretRotSpeed": 12,
    "weightTons": 26.9,
    "reloadSec": 5,
    "armor": {
      "hullFront": {
        "thickness": 78,
        "angle": 0
      },
      "hullSide": {
        "thickness": 70,
        "angle": 0
      },
      "hullRear": {
        "thickness": 55,
        "angle": 20
      },
      "turretFront": {
        "thickness": 75,
        "angle": 0
      },
      "turretSide": {
        "thickness": 75,
        "angle": 0
      },
      "turretRear": {
        "thickness": 75,
        "angle": 0
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 792,
        "mass": 1.08,
        "caliber": 40,
        "drag": 0.34,
        "penetration": 66,
        "damage": 55,
        "explosion": 0.3,
        "fuze": true
      },
      "APDS": {
        "muzzleVelocity": 1220,
        "mass": 0.76,
        "caliber": 40,
        "drag": 0.24,
        "penetration": 96,
        "damage": 40,
        "explosion": 0.1,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 610,
        "mass": 0.85,
        "caliber": 40,
        "drag": 0.42,
        "penetration": 4,
        "damage": 65,
        "explosion": 0.9,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 20
    }
  },
  "M24 Chaffee": {
    "canon": true,
    "speed": 56,
    "reverseSpeed": -7,
    "crew": 5,
    "turretRotSpeed": 24,
    "weightTons": 18.4,
    "reloadSec": 6,
    "armor": {
      "hullFront": {
        "thickness": 25,
        "angle": 60
      },
      "hullSide": {
        "thickness": 19,
        "angle": 0
      },
      "hullRear": {
        "thickness": 19,
        "angle": 10
      },
      "turretFront": {
        "thickness": 38,
        "angle": 15
      },
      "turretSide": {
        "thickness": 25,
        "angle": 10
      },
      "turretRear": {
        "thickness": 25,
        "angle": 5
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 619,
        "mass": 6.5,
        "caliber": 75,
        "drag": 0.35,
        "penetration": 72,
        "damage": 105,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 619,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.34,
        "penetration": 88,
        "damage": 118,
        "explosion": 1.1,
        "fuze": true
      },
      "HE": {
        "muzzleVelocity": 463,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.42,
        "penetration": 12,
        "damage": 200,
        "explosion": 2.6,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 300,
        "mass": 5,
        "caliber": 75,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 10,
      "side": 12,
      "rear": 10
    }
  },
  "STuG III Ausf. F": {
    "canon": true,
    "speed": 40,
    "reverseSpeed": -4,
    "crew": 4,
    "turretRotSpeed": 0,
    "weightTons": 21.6,
    "reloadSec": 6.5,
    "armor": {
      "hullFront": {
        "thickness": 80,
        "angle": 10
      },
      "hullSide": {
        "thickness": 30,
        "angle": 0
      },
      "hullRear": {
        "thickness": 30,
        "angle": 10
      },
      "turretFront": {
        "thickness": 50,
        "angle": 18
      },
      "turretSide": {
        "thickness": 30,
        "angle": 10
      },
      "turretRear": {
        "thickness": 30,
        "angle": 10
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 740,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.34,
        "penetration": 103,
        "damage": 130,
        "explosion": 1.2,
        "fuze": true
      },
      "APCR": {
        "muzzleVelocity": 933,
        "mass": 4.1,
        "caliber": 75,
        "drag": 0.28,
        "penetration": 126,
        "damage": 85,
        "explosion": 0.4,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 450,
        "mass": 4.6,
        "caliber": 75,
        "drag": 0.4,
        "penetration": 100,
        "damage": 120,
        "explosion": 1.6,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 420,
        "mass": 5.7,
        "caliber": 75,
        "drag": 0.45,
        "penetration": 10,
        "damage": 210,
        "explosion": 2.5,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 15,
      "side": 20,
      "rear": 15
    }
  },
  "T-34 (1941)": {
    "canon": true,
    "speed": 51,
    "reverseSpeed": -6,
    "crew": 5,
    "turretRotSpeed": 20,
    "weightTons": 35.7,
    "reloadSec": 6.5,
    "armor": {
      "hullFront": {
        "thickness": 45,
        "angle": 60
      },
      "hullSide": {
        "thickness": 40,
        "angle": 40
      },
      "hullRear": {
        "thickness": 40,
        "angle": 45
      },
      "turretFront": {
        "thickness": 45,
        "angle": 25
      },
      "turretSide": {
        "thickness": 45,
        "angle": 20
      },
      "turretRear": {
        "thickness": 45,
        "angle": 15
      }
    },
    "ammo": {
      "APBC": {
        "muzzleVelocity": 662,
        "mass": 6.5,
        "caliber": 76,
        "drag": 0.35,
        "penetration": 75,
        "damage": 125,
        "explosion": 0.5,
        "fuze": true
      },
      "APCR": {
        "muzzleVelocity": 950,
        "mass": 3,
        "caliber": 76,
        "drag": 0.28,
        "penetration": 115,
        "damage": 82,
        "explosion": 0.4,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 680,
        "mass": 6.2,
        "caliber": 76,
        "drag": 0.42,
        "penetration": 10,
        "damage": 195,
        "explosion": 2.2,
        "fuze": false
      },
      "shrapnel": {
        "muzzleVelocity": 500,
        "mass": 5,
        "caliber": 76,
        "drag": 0.45,
        "penetration": 12,
        "damage": 70,
        "explosion": 1.5,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 15,
      "side": 20,
      "rear": 15
    }
  },
  "Comet I": {
    "canon": true,
    "speed": 51,
    "reverseSpeed": -6,
    "crew": 5,
    "turretRotSpeed": 20,
    "weightTons": 35.7,
    "reloadSec": 6.5,
    "armor": {
      "hullFront": {
        "thickness": 76,
        "angle": 55
      },
      "hullSide": {
        "thickness": 32,
        "angle": 30
      },
      "hullRear": {
        "thickness": 32,
        "angle": 20
      },
      "turretFront": {
        "thickness": 102,
        "angle": 0
      },
      "turretSide": {
        "thickness": 63,
        "angle": 10
      },
      "turretRear": {
        "thickness": 57,
        "angle": 10
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 884,
        "mass": 7.7,
        "caliber": 77,
        "drag": 0.33,
        "penetration": 140,
        "damage": 148,
        "explosion": 1.3,
        "fuze": true
      },
      "APDS": {
        "muzzleVelocity": 1067,
        "mass": 4.9,
        "caliber": 77,
        "drag": 0.24,
        "penetration": 190,
        "damage": 90,
        "explosion": 0.2,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 610,
        "mass": 6.9,
        "caliber": 77,
        "drag": 0.42,
        "penetration": 12,
        "damage": 215,
        "explosion": 2.6,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 18,
      "side": 22,
      "rear": 16
    }
  },
  "M4A1 Sherman": {
    "canon": true,
    "speed": 38,
    "reverseSpeed": -4,
    "crew": 5,
    "turretRotSpeed": 24,
    "weightTons": 30.3,
    "reloadSec": 7,
    "armor": {
      "hullFront": {
        "thickness": 51,
        "angle": 47
      },
      "hullSide": {
        "thickness": 38,
        "angle": 0
      },
      "hullRear": {
        "thickness": 38,
        "angle": 10
      },
      "turretFront": {
        "thickness": 76,
        "angle": 15
      },
      "turretSide": {
        "thickness": 51,
        "angle": 5
      },
      "turretRear": {
        "thickness": 51,
        "angle": 5
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 619,
        "mass": 6.5,
        "caliber": 75,
        "drag": 0.35,
        "penetration": 96,
        "damage": 110,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 619,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.34,
        "penetration": 109,
        "damage": 130,
        "explosion": 1.3,
        "fuze": true
      },
      "HE": {
        "muzzleVelocity": 463,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.42,
        "penetration": 15,
        "damage": 220,
        "explosion": 2.8,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 300,
        "mass": 5,
        "caliber": 75,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 15,
      "side": 20,
      "rear": 15
    }
  },
  "Panzer IV Ausf. H": {
    "canon": true,
    "speed": 38,
    "reverseSpeed": -6,
    "crew": 5,
    "turretRotSpeed": 14,
    "weightTons": 25,
    "reloadSec": 7,
    "armor": {
      "hullFront": {
        "thickness": 80,
        "angle": 12
      },
      "hullSide": {
        "thickness": 30,
        "angle": 0
      },
      "hullRear": {
        "thickness": 20,
        "angle": 10
      },
      "turretFront": {
        "thickness": 50,
        "angle": 10
      },
      "turretSide": {
        "thickness": 30,
        "angle": 5
      },
      "turretRear": {
        "thickness": 30,
        "angle": 5
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 790,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.34,
        "penetration": 115,
        "damage": 135,
        "explosion": 1.3,
        "fuze": true
      },
      "APCR": {
        "muzzleVelocity": 990,
        "mass": 4.1,
        "caliber": 75,
        "drag": 0.28,
        "penetration": 150,
        "damage": 88,
        "explosion": 0.4,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 450,
        "mass": 4.6,
        "caliber": 75,
        "drag": 0.4,
        "penetration": 100,
        "damage": 120,
        "explosion": 1.6,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 550,
        "mass": 5.7,
        "caliber": 75,
        "drag": 0.42,
        "penetration": 12,
        "damage": 215,
        "explosion": 2.6,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 30,
      "rear": 15
    }
  },
  "KV-1 (ZiS 5)": {
    "canon": true,
    "speed": 35,
    "reverseSpeed": -4,
    "crew": 5,
    "turretRotSpeed": 10,
    "weightTons": 47.5,
    "reloadSec": 8,
    "armor": {
      "hullFront": {
        "thickness": 75,
        "angle": 30
      },
      "hullSide": {
        "thickness": 75,
        "angle": 0
      },
      "hullRear": {
        "thickness": 60,
        "angle": 10
      },
      "turretFront": {
        "thickness": 75,
        "angle": 20
      },
      "turretSide": {
        "thickness": 75,
        "angle": 10
      },
      "turretRear": {
        "thickness": 75,
        "angle": 5
      }
    },
    "ammo": {
      "APBC": {
        "muzzleVelocity": 662,
        "mass": 6.5,
        "caliber": 76,
        "drag": 0.35,
        "penetration": 82,
        "damage": 125,
        "explosion": 0.5,
        "fuze": false
      },
      "APCR": {
        "muzzleVelocity": 950,
        "mass": 3,
        "caliber": 76,
        "drag": 0.28,
        "penetration": 115,
        "damage": 82,
        "explosion": 0.4,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 680,
        "mass": 6.2,
        "caliber": 76,
        "drag": 0.42,
        "penetration": 10,
        "damage": 195,
        "explosion": 2.2,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 20
    }
  },
  "Avenger": {
    "canon": true,
    "speed": 52,
    "reverseSpeed": -6,
    "crew": 4,
    "turretRotSpeed": 22,
    "weightTons": 14,
    "reloadSec": 6,
    "armor": {
      "hullFront": {
        "thickness": 14,
        "angle": 0
      },
      "hullSide": {
        "thickness": 14,
        "angle": 0
      },
      "hullRear": {
        "thickness": 14,
        "angle": 0
      },
      "turretFront": {
        "thickness": 14,
        "angle": 0
      },
      "turretSide": {
        "thickness": 14,
        "angle": 0
      },
      "turretRear": {
        "thickness": 14,
        "angle": 0
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 884,
        "mass": 7.7,
        "caliber": 77,
        "drag": 0.33,
        "penetration": 148,
        "damage": 148,
        "explosion": 1.3,
        "fuze": true
      },
      "APDS": {
        "muzzleVelocity": 1120,
        "mass": 3.5,
        "caliber": 77,
        "drag": 0.23,
        "penetration": 208,
        "damage": 85,
        "explosion": 0.2,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 610,
        "mass": 6.9,
        "caliber": 77,
        "drag": 0.42,
        "penetration": 12,
        "damage": 215,
        "explosion": 2.6,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 8,
      "side": 10,
      "rear": 8
    }
  },
  "M4 Calliopé": {
    "canon": true,
    "speed": 38,
    "reverseSpeed": -4,
    "crew": 5,
    "turretRotSpeed": 22,
    "weightTons": 32.5,
    "reloadSec": 7,
    "armor": {
      "hullFront": {
        "thickness": 51,
        "angle": 47
      },
      "hullSide": {
        "thickness": 38,
        "angle": 0
      },
      "hullRear": {
        "thickness": 38,
        "angle": 10
      },
      "turretFront": {
        "thickness": 76,
        "angle": 15
      },
      "turretSide": {
        "thickness": 51,
        "angle": 5
      },
      "turretRear": {
        "thickness": 51,
        "angle": 5
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 619,
        "mass": 6.5,
        "caliber": 75,
        "drag": 0.35,
        "penetration": 96,
        "damage": 110,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 619,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.34,
        "penetration": 109,
        "damage": 130,
        "explosion": 1.3,
        "fuze": true
      },
      "HE": {
        "muzzleVelocity": 463,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.42,
        "penetration": 15,
        "damage": 220,
        "explosion": 2.8,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 300,
        "mass": 5,
        "caliber": 75,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 15,
      "side": 20,
      "rear": 15
    }
  },
  "Panzer V Panther Ausf. D": {
    "canon": true,
    "speed": 46,
    "reverseSpeed": -5,
    "crew": 5,
    "turretRotSpeed": 12,
    "weightTons": 44.8,
    "reloadSec": 7.5,
    "armor": {
      "hullFront": {
        "thickness": 80,
        "angle": 55
      },
      "hullSide": {
        "thickness": 40,
        "angle": 0
      },
      "hullRear": {
        "thickness": 40,
        "angle": 10
      },
      "turretFront": {
        "thickness": 100,
        "angle": 10
      },
      "turretSide": {
        "thickness": 45,
        "angle": 25
      },
      "turretRear": {
        "thickness": 45,
        "angle": 20
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 925,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.32,
        "penetration": 165,
        "damage": 145,
        "explosion": 1.3,
        "fuze": true
      },
      "APCR": {
        "muzzleVelocity": 1120,
        "mass": 4.8,
        "caliber": 75,
        "drag": 0.26,
        "penetration": 198,
        "damage": 95,
        "explosion": 0.4,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 700,
        "mass": 5.7,
        "caliber": 75,
        "drag": 0.42,
        "penetration": 12,
        "damage": 215,
        "explosion": 2.6,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 18
    }
  },
  "KV-2 (ZiS 6)": {
    "canon": true,
    "speed": 26,
    "reverseSpeed": -3,
    "crew": 6,
    "turretRotSpeed": 4,
    "weightTons": 52,
    "reloadSec": 22,
    "armor": {
      "hullFront": {
        "thickness": 75,
        "angle": 30
      },
      "hullSide": {
        "thickness": 75,
        "angle": 0
      },
      "hullRear": {
        "thickness": 60,
        "angle": 10
      },
      "turretFront": {
        "thickness": 75,
        "angle": 0
      },
      "turretSide": {
        "thickness": 75,
        "angle": 0
      },
      "turretRear": {
        "thickness": 75,
        "angle": 0
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 436,
        "mass": 40,
        "caliber": 152,
        "drag": 0.45,
        "penetration": 72,
        "damage": 380,
        "explosion": 0.8,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 436,
        "mass": 40,
        "caliber": 152,
        "drag": 0.45,
        "penetration": 30,
        "damage": 620,
        "explosion": 7,
        "fuze": false
      },
      "shrapnel": {
        "muzzleVelocity": 400,
        "mass": 35,
        "caliber": 152,
        "drag": 0.5,
        "penetration": 20,
        "damage": 250,
        "explosion": 4,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 20
    }
  },
  "Churchill Mk.VII": {
    "canon": true,
    "speed": 20,
    "reverseSpeed": -3,
    "crew": 5,
    "turretRotSpeed": 14,
    "weightTons": 40.7,
    "reloadSec": 7.5,
    "armor": {
      "hullFront": {
        "thickness": 152,
        "angle": 0
      },
      "hullSide": {
        "thickness": 95,
        "angle": 0
      },
      "hullRear": {
        "thickness": 51,
        "angle": 20
      },
      "turretFront": {
        "thickness": 152,
        "angle": 0
      },
      "turretSide": {
        "thickness": 95,
        "angle": 0
      },
      "turretRear": {
        "thickness": 95,
        "angle": 0
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 619,
        "mass": 6.5,
        "caliber": 75,
        "drag": 0.35,
        "penetration": 96,
        "damage": 110,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 619,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.34,
        "penetration": 109,
        "damage": 130,
        "explosion": 1.3,
        "fuze": true
      },
      "HE": {
        "muzzleVelocity": 463,
        "mass": 6.8,
        "caliber": 75,
        "drag": 0.42,
        "penetration": 15,
        "damage": 220,
        "explosion": 2.8,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 400,
        "mass": 4.5,
        "caliber": 75,
        "drag": 0.4,
        "penetration": 100,
        "damage": 120,
        "explosion": 1.5,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 300,
        "mass": 5,
        "caliber": 75,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 25,
      "side": 30,
      "rear": 22
    }
  },
  "M-18 Hellcat": {
    "canon": true,
    "speed": 72,
    "reverseSpeed": -8,
    "crew": 5,
    "turretRotSpeed": 26,
    "weightTons": 17.7,
    "reloadSec": 6,
    "armor": {
      "hullFront": {
        "thickness": 12,
        "angle": 50
      },
      "hullSide": {
        "thickness": 12,
        "angle": 0
      },
      "hullRear": {
        "thickness": 12,
        "angle": 10
      },
      "turretFront": {
        "thickness": 25,
        "angle": 20
      },
      "turretSide": {
        "thickness": 12,
        "angle": 5
      },
      "turretRear": {
        "thickness": 12,
        "angle": 0
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 792,
        "mass": 6.8,
        "caliber": 76,
        "drag": 0.35,
        "penetration": 116,
        "damage": 115,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 792,
        "mass": 7,
        "caliber": 76,
        "drag": 0.34,
        "penetration": 122,
        "damage": 135,
        "explosion": 1.3,
        "fuze": true
      },
      "APCR": {
        "muzzleVelocity": 1036,
        "mass": 3.8,
        "caliber": 76,
        "drag": 0.26,
        "penetration": 182,
        "damage": 90,
        "explosion": 0.4,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 610,
        "mass": 5.8,
        "caliber": 76,
        "drag": 0.42,
        "penetration": 10,
        "damage": 200,
        "explosion": 2.3,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 300,
        "mass": 5,
        "caliber": 76,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 8,
      "side": 10,
      "rear": 8
    }
  },
  "Panzer VI Tiger Ausf. H": {
    "canon": true,
    "speed": 38,
    "reverseSpeed": -3,
    "crew": 5,
    "turretRotSpeed": 6,
    "weightTons": 57,
    "reloadSec": 9,
    "armor": {
      "hullFront": {
        "thickness": 100,
        "angle": 8
      },
      "hullSide": {
        "thickness": 80,
        "angle": 0
      },
      "hullRear": {
        "thickness": 82,
        "angle": 8
      },
      "turretFront": {
        "thickness": 100,
        "angle": 10
      },
      "turretSide": {
        "thickness": 82,
        "angle": 0
      },
      "turretRear": {
        "thickness": 82,
        "angle": 0
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 773,
        "mass": 10.2,
        "caliber": 88,
        "drag": 0.33,
        "penetration": 165,
        "damage": 200,
        "explosion": 1.6,
        "fuze": true
      },
      "APCR": {
        "muzzleVelocity": 930,
        "mass": 7.5,
        "caliber": 88,
        "drag": 0.27,
        "penetration": 202,
        "damage": 130,
        "explosion": 0.5,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 600,
        "mass": 7,
        "caliber": 88,
        "drag": 0.38,
        "penetration": 90,
        "damage": 155,
        "explosion": 1.8,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 600,
        "mass": 9,
        "caliber": 88,
        "drag": 0.42,
        "penetration": 20,
        "damage": 310,
        "explosion": 3.2,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 25,
      "side": 30,
      "rear": 20
    }
  },
  "IS-2 (1944)": {
    "canon": true,
    "speed": 37,
    "reverseSpeed": -4,
    "crew": 4,
    "turretRotSpeed": 12,
    "weightTons": 46,
    "reloadSec": 18,
    "armor": {
      "hullFront": {
        "thickness": 120,
        "angle": 25
      },
      "hullSide": {
        "thickness": 90,
        "angle": 0
      },
      "hullRear": {
        "thickness": 60,
        "angle": 10
      },
      "turretFront": {
        "thickness": 160,
        "angle": 15
      },
      "turretSide": {
        "thickness": 100,
        "angle": 10
      },
      "turretRear": {
        "thickness": 100,
        "angle": 10
      }
    },
    "ammo": {
      "APBC": {
        "muzzleVelocity": 795,
        "mass": 25,
        "caliber": 122,
        "drag": 0.38,
        "penetration": 185,
        "damage": 300,
        "explosion": 0.8,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 795,
        "mass": 25,
        "caliber": 122,
        "drag": 0.36,
        "penetration": 185,
        "damage": 320,
        "explosion": 3.5,
        "fuze": true
      },
      "HE": {
        "muzzleVelocity": 800,
        "mass": 25,
        "caliber": 122,
        "drag": 0.45,
        "penetration": 25,
        "damage": 480,
        "explosion": 5,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 18
    }
  },
  "Black Prince": {
    "canon": true,
    "speed": 18,
    "reverseSpeed": -3,
    "crew": 5,
    "turretRotSpeed": 14,
    "weightTons": 50,
    "reloadSec": 7,
    "armor": {
      "hullFront": {
        "thickness": 152,
        "angle": 0
      },
      "hullSide": {
        "thickness": 95,
        "angle": 0
      },
      "hullRear": {
        "thickness": 51,
        "angle": 20
      },
      "turretFront": {
        "thickness": 152,
        "angle": 0
      },
      "turretSide": {
        "thickness": 95,
        "angle": 0
      },
      "turretRear": {
        "thickness": 95,
        "angle": 0
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 884,
        "mass": 7.7,
        "caliber": 77,
        "drag": 0.33,
        "penetration": 148,
        "damage": 148,
        "explosion": 1.3,
        "fuze": true
      },
      "APDS": {
        "muzzleVelocity": 1067,
        "mass": 4.9,
        "caliber": 77,
        "drag": 0.23,
        "penetration": 208,
        "damage": 90,
        "explosion": 0.2,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 610,
        "mass": 6.9,
        "caliber": 77,
        "drag": 0.42,
        "penetration": 12,
        "damage": 215,
        "explosion": 2.6,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 25,
      "side": 30,
      "rear": 22
    }
  },
  "M-26 Pershing": {
    "canon": true,
    "speed": 48,
    "reverseSpeed": -5,
    "crew": 5,
    "turretRotSpeed": 20,
    "weightTons": 41.7,
    "reloadSec": 8,
    "armor": {
      "hullFront": {
        "thickness": 102,
        "angle": 42
      },
      "hullSide": {
        "thickness": 76,
        "angle": 0
      },
      "hullRear": {
        "thickness": 51,
        "angle": 10
      },
      "turretFront": {
        "thickness": 114,
        "angle": 0
      },
      "turretSide": {
        "thickness": 76,
        "angle": 5
      },
      "turretRear": {
        "thickness": 76,
        "angle": 5
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 853,
        "mass": 10.9,
        "caliber": 90,
        "drag": 0.34,
        "penetration": 122,
        "damage": 155,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 853,
        "mass": 11,
        "caliber": 90,
        "drag": 0.33,
        "penetration": 148,
        "damage": 175,
        "explosion": 1.5,
        "fuze": true
      },
      "HE": {
        "muzzleVelocity": 610,
        "mass": 11,
        "caliber": 90,
        "drag": 0.42,
        "penetration": 18,
        "damage": 290,
        "explosion": 3.4,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 300,
        "mass": 6,
        "caliber": 90,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 18
    }
  },
  "Panzer VI Ausf. B King Tiger": {
    "canon": true,
    "speed": 38,
    "reverseSpeed": -3,
    "crew": 5,
    "turretRotSpeed": 5,
    "weightTons": 68.5,
    "reloadSec": 9.5,
    "armor": {
      "hullFront": {
        "thickness": 150,
        "angle": 50
      },
      "hullSide": {
        "thickness": 80,
        "angle": 25
      },
      "hullRear": {
        "thickness": 80,
        "angle": 20
      },
      "turretFront": {
        "thickness": 185,
        "angle": 10
      },
      "turretSide": {
        "thickness": 80,
        "angle": 20
      },
      "turretRear": {
        "thickness": 80,
        "angle": 20
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 1000,
        "mass": 10.2,
        "caliber": 88,
        "drag": 0.31,
        "penetration": 238,
        "damage": 250,
        "explosion": 5,
        "fuze": true
      },
      "APCR": {
        "muzzleVelocity": 1130,
        "mass": 7.3,
        "caliber": 88,
        "drag": 0.26,
        "penetration": 285,
        "damage": 138,
        "explosion": 0.5,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 600,
        "mass": 7,
        "caliber": 88,
        "drag": 0.38,
        "penetration": 90,
        "damage": 160,
        "explosion": 1.8,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 700,
        "mass": 9.4,
        "caliber": 88,
        "drag": 0.42,
        "penetration": 22,
        "damage": 320,
        "explosion": 3.4,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 28,
      "side": 35,
      "rear": 22
    }
  },
  "T-10A": {
    "canon": true,
    "speed": 42,
    "reverseSpeed": -4,
    "crew": 4,
    "turretRotSpeed": 14,
    "weightTons": 50,
    "reloadSec": 15,
    "armor": {
      "hullFront": {
        "thickness": 120,
        "angle": 60
      },
      "hullSide": {
        "thickness": 80,
        "angle": 30
      },
      "hullRear": {
        "thickness": 48,
        "angle": 20
      },
      "turretFront": {
        "thickness": 250,
        "angle": 0
      },
      "turretSide": {
        "thickness": 148,
        "angle": 30
      },
      "turretRear": {
        "thickness": 65,
        "angle": 20
      }
    },
    "ammo": {
      "APBC": {
        "muzzleVelocity": 795,
        "mass": 25,
        "caliber": 122,
        "drag": 0.37,
        "penetration": 185,
        "damage": 300,
        "explosion": 0.8,
        "fuze": false
      },
      "APDS": {
        "muzzleVelocity": 1000,
        "mass": 18,
        "caliber": 122,
        "drag": 0.25,
        "penetration": 260,
        "damage": 200,
        "explosion": 0.3,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 800,
        "mass": 14,
        "caliber": 122,
        "drag": 0.38,
        "penetration": 400,
        "damage": 280,
        "explosion": 3,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 800,
        "mass": 25,
        "caliber": 122,
        "drag": 0.45,
        "penetration": 28,
        "damage": 490,
        "explosion": 5.2,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 22,
      "side": 28,
      "rear": 18
    }
  },
  "FV4202": {
    "canon": true,
    "speed": 35,
    "reverseSpeed": -4,
    "crew": 4,
    "turretRotSpeed": 18,
    "weightTons": 48,
    "reloadSec": 8,
    "armor": {
      "hullFront": {
        "thickness": 120,
        "angle": 58
      },
      "hullSide": {
        "thickness": 50,
        "angle": 12
      },
      "hullRear": {
        "thickness": 38,
        "angle": 12
      },
      "turretFront": {
        "thickness": 120,
        "angle": 30
      },
      "turretSide": {
        "thickness": 89,
        "angle": 20
      },
      "turretRear": {
        "thickness": 89,
        "angle": 15
      }
    },
    "ammo": {
      "APDS": {
        "muzzleVelocity": 1475,
        "mass": 5,
        "caliber": 105,
        "drag": 0.22,
        "penetration": 303,
        "damage": 180,
        "explosion": 0.2,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 1173,
        "mass": 10.8,
        "caliber": 105,
        "drag": 0.36,
        "penetration": 400,
        "damage": 260,
        "explosion": 3,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 760,
        "mass": 15,
        "caliber": 105,
        "drag": 0.42,
        "penetration": 25,
        "damage": 380,
        "explosion": 4.2,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 350,
        "mass": 7,
        "caliber": 105,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 22,
      "side": 25,
      "rear": 18
    }
  },
  "T-34 heavy tank": {
    "canon": true,
    "speed": 55,
    "reverseSpeed": -6,
    "crew": 4,
    "turretRotSpeed": 20,
    "weightTons": 36,
    "reloadSec": 8,
    "armor": {
      "hullFront": {
        "thickness": 100,
        "angle": 55
      },
      "hullSide": {
        "thickness": 75,
        "angle": 40
      },
      "hullRear": {
        "thickness": 45,
        "angle": 45
      },
      "turretFront": {
        "thickness": 200,
        "angle": 0
      },
      "turretSide": {
        "thickness": 160,
        "angle": 20
      },
      "turretRear": {
        "thickness": 65,
        "angle": 15
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 895,
        "mass": 15.8,
        "caliber": 100,
        "drag": 0.33,
        "penetration": 185,
        "damage": 200,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 895,
        "mass": 15.9,
        "caliber": 100,
        "drag": 0.32,
        "penetration": 201,
        "damage": 230,
        "explosion": 1.8,
        "fuze": true
      },
      "APDS": {
        "muzzleVelocity": 1015,
        "mass": 8,
        "caliber": 100,
        "drag": 0.23,
        "penetration": 250,
        "damage": 155,
        "explosion": 0.2,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 900,
        "mass": 11,
        "caliber": 100,
        "drag": 0.37,
        "penetration": 380,
        "damage": 250,
        "explosion": 2.8,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 900,
        "mass": 15,
        "caliber": 100,
        "drag": 0.42,
        "penetration": 22,
        "damage": 350,
        "explosion": 3.8,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 18
    }
  },
  "Leopard 1": {
    "canon": true,
    "speed": 65,
    "reverseSpeed": -7,
    "crew": 4,
    "turretRotSpeed": 22,
    "weightTons": 42.4,
    "reloadSec": 7.5,
    "armor": {
      "hullFront": {
        "thickness": 70,
        "angle": 60
      },
      "hullSide": {
        "thickness": 35,
        "angle": 30
      },
      "hullRear": {
        "thickness": 25,
        "angle": 20
      },
      "turretFront": {
        "thickness": 200,
        "angle": 0
      },
      "turretSide": {
        "thickness": 60,
        "angle": 30
      },
      "turretRear": {
        "thickness": 52,
        "angle": 20
      }
    },
    "ammo": {
      "APCBC": {
        "muzzleVelocity": 1478,
        "mass": 5,
        "caliber": 105,
        "drag": 0.22,
        "penetration": 903,
        "damage": 1800,
        "explosion": 10,
        "fuze": true
      },
      "HEAT": {
        "muzzleVelocity": 1173,
        "mass": 10.8,
        "caliber": 105,
        "drag": 0.36,
        "penetration": 400,
        "damage": 260,
        "explosion": 3,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 760,
        "mass": 15,
        "caliber": 105,
        "drag": 0.42,
        "penetration": 25,
        "damage": 380,
        "explosion": 4.2,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 350,
        "mass": 7,
        "caliber": 105,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 22,
      "rear": 16
    }
  },
  "T-55A": {
    "canon": true,
    "speed": 50,
    "reverseSpeed": -5,
    "crew": 4,
    "turretRotSpeed": 18,
    "weightTons": 36,
    "reloadSec": 8,
    "armor": {
      "hullFront": {
        "thickness": 100,
        "angle": 58
      },
      "hullSide": {
        "thickness": 79,
        "angle": 0
      },
      "hullRear": {
        "thickness": 45,
        "angle": 20
      },
      "turretFront": {
        "thickness": 200,
        "angle": 0
      },
      "turretSide": {
        "thickness": 160,
        "angle": 15
      },
      "turretRear": {
        "thickness": 65,
        "angle": 10
      }
    },
    "ammo": {
      "APBC": {
        "muzzleVelocity": 895,
        "mass": 15.8,
        "caliber": 100,
        "drag": 0.34,
        "penetration": 185,
        "damage": 200,
        "explosion": 0.5,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 895,
        "mass": 15.9,
        "caliber": 100,
        "drag": 0.32,
        "penetration": 201,
        "damage": 230,
        "explosion": 1.8,
        "fuze": true
      },
      "APDS": {
        "muzzleVelocity": 1015,
        "mass": 8,
        "caliber": 100,
        "drag": 0.23,
        "penetration": 258,
        "damage": 155,
        "explosion": 0.2,
        "fuze": false
      },
      "HEAT": {
        "muzzleVelocity": 900,
        "mass": 11,
        "caliber": 100,
        "drag": 0.37,
        "penetration": 390,
        "damage": 250,
        "explosion": 2.9,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 900,
        "mass": 15,
        "caliber": 100,
        "drag": 0.42,
        "penetration": 22,
        "damage": 355,
        "explosion": 3.9,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 18
    }
  },
  "Chieftain Mk.X": {
    "canon": true,
    "speed": 48,
    "reverseSpeed": -5,
    "crew": 4,
    "turretRotSpeed": 16,
    "weightTons": 55,
    "reloadSec": 9,
    "armor": {
      "hullFront": {
        "thickness": 195,
        "angle": 72
      },
      "hullSide": {
        "thickness": 70,
        "angle": 0
      },
      "hullRear": {
        "thickness": 25,
        "angle": 10
      },
      "turretFront": {
        "thickness": 388,
        "angle": 0
      },
      "turretSide": {
        "thickness": 196,
        "angle": 5
      },
      "turretRear": {
        "thickness": 100,
        "angle": 5
      }
    },
    "ammo": {
      "APDS": {
        "muzzleVelocity": 1370,
        "mass": 8,
        "caliber": 120,
        "drag": 0.23,
        "penetration": 380,
        "damage": 270,
        "explosion": 0.2,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 750,
        "mass": 20,
        "caliber": 120,
        "drag": 0.42,
        "penetration": 30,
        "damage": 490,
        "explosion": 5.5,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 350,
        "mass": 8,
        "caliber": 120,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 28,
      "side": 32,
      "rear": 20
    }
  },
  "M-46 Patton": {
    "canon": true,
    "speed": 48,
    "reverseSpeed": -5,
    "crew": 5,
    "turretRotSpeed": 20,
    "weightTons": 44.1,
    "reloadSec": 8,
    "armor": {
      "hullFront": {
        "thickness": 101,
        "angle": 46
      },
      "hullSide": {
        "thickness": 76,
        "angle": 0
      },
      "hullRear": {
        "thickness": 51,
        "angle": 10
      },
      "turretFront": {
        "thickness": 114,
        "angle": 0
      },
      "turretSide": {
        "thickness": 76,
        "angle": 5
      },
      "turretRear": {
        "thickness": 76,
        "angle": 5
      }
    },
    "ammo": {
      "AP": {
        "muzzleVelocity": 853,
        "mass": 10.9,
        "caliber": 90,
        "drag": 0.34,
        "penetration": 122,
        "damage": 155,
        "explosion": 0.4,
        "fuze": false
      },
      "APCBC": {
        "muzzleVelocity": 853,
        "mass": 11,
        "caliber": 90,
        "drag": 0.33,
        "penetration": 148,
        "damage": 175,
        "explosion": 1.5,
        "fuze": true
      },
      "HEAT": {
        "muzzleVelocity": 701,
        "mass": 7,
        "caliber": 90,
        "drag": 0.38,
        "penetration": 305,
        "damage": 200,
        "explosion": 2.2,
        "fuze": false
      },
      "HE": {
        "muzzleVelocity": 610,
        "mass": 11,
        "caliber": 90,
        "drag": 0.42,
        "penetration": 18,
        "damage": 290,
        "explosion": 3.4,
        "fuze": false
      },
      "fumigène": {
        "muzzleVelocity": 300,
        "mass": 6,
        "caliber": 90,
        "drag": 0.5,
        "penetration": 0,
        "damage": 0,
        "explosion": 0,
        "fuze": false
      }
    },
    "engine": true,
    "trackLeft": true,
    "trackRight": true,
    "trackArmor": {
      "front": 20,
      "side": 25,
      "rear": 18
    }
  }
};

/* ========== FICHES DESCRIPTIVES DES OBUS (UI Hangar / popup) ========== */
    const ammoData = {
      AP: {
        name: "AP", fullName: "Obus perforant (AP)", color: "#e8c84a",
        desc: "Obus solide sans explosif. Pénètre grâce à l'énergie cinétique pure. Provoque peu d'éclats internes.",
        stats: { pen: "60–120 mm", dmg: "Faible (cinétique)", vitesse: "750–850 m/s", type: "Cinétique solide" }
      },
      APBC: {
        name: "APBC", fullName: "Obus perforant à base coupée (APBC)", color: "#d4b84a",
        desc: "Coiffe tronquée améliorant la stabilité en vol et réduisant le ricochet à angle oblique.",
        stats: { pen: "70–130 mm", dmg: "Faible-moyen", vitesse: "780–900 m/s", type: "Cinétique stabilisé" }
      },
      APCBC: {
        name: "APCBC", fullName: "Obus perforant coiffé explosif (APCBC)", color: "#e8c84a",
        desc: "Coiffe balistique + charge explosive interne. Bon équilibre pénétration/dégâts. Standard WWII.",
        stats: { pen: "80–160 mm", dmg: "Moyen-élevé", vitesse: "700–830 m/s", type: "Cinétique + explosif" }
      },
      APHE: {
        name: "APHE", fullName: "Obus perforant à charge explosive (APHE)", color: "#ffaa22",
        desc: "Pénètre le blindage puis explose à l'intérieur. Dégâts internes dévastateurs sur l'équipage et les modules.",
        stats: { pen: "60–185 mm", dmg: "Très élevé (explosion interne)", vitesse: "760–800 m/s", type: "Cinétique + APHE" }
      },
      APCR: {
        name: "APCR", fullName: "Obus composite rigide (APCR)", color: "#5bcfff",
        desc: "Noyau dur (tungstène) à haute vélocité. Pénétration supérieure mais dégâts internes limités (pas d'explosif).",
        stats: { pen: "100–202 mm", dmg: "Moyen (tige)", vitesse: "920–1 040 m/s", type: "Tige dure haute vélocité" }
      },
      HE: {
        name: "HE", fullName: "Obus hautement explosif (HE)", color: "#ff7a35",
        desc: "Explose à l'impact. Efficace contre blindages légers, toits de tourelles, infanterie. Inutile contre blindage épais.",
        stats: { pen: "5–25 mm", dmg: "Très élevé (souffle)", vitesse: "335–800 m/s", type: "Explosif de contact" }
      },
      HEAT: {
        name: "HEAT", fullName: "Obus perforant thermique (HEAT)", color: "#ff9944",
        desc: "Jet de métal liquide (effet Monroe). Pénétration constante quelle que soit la distance. Sensible aux blindages réactifs.",
        stats: { pen: "100–300 mm", dmg: "Élevé (jet thermique)", vitesse: "400–700 m/s", type: "Charge creuse" }
      },
      fumigène: {
        name: "FUMIGÈNE", fullName: "Obus fumigène", color: "#aaaaaa",
        desc: "Génère un écran de fumée opaque pendant 20–30s. Bloque la ligne de vue ennemie. Aucun dégât.",
        stats: { pen: "Aucune", dmg: "Nul", vitesse: "250–400 m/s", type: "Utilitaire / écran" }
      },
      APDS: {
        name: "APDS", fullName: "Obus sous-calibré à sabot (APDS)", color: "#c26bff",
        desc: "Tige en tungstène à très haute vélocité. Pénétration extrême. Dégâts internes limités (jet fin, pas d'explosif).",
        stats: { pen: "150–310 mm", dmg: "Moyen (tige fine)", vitesse: "1 020–1 470 m/s", type: "Sabot sous-calibré" }
      },
      shrapnel: {
        name: "SHRAPNEL", fullName: "Obus à shrapnel (Shrapnel)", color: "#cc9944",
        desc: "Explose en l'air et projette des éclats métalliques. Efficace contre personnel et blindage très léger. Obsolète en 1944.",
        stats: { pen: "8–20 mm", dmg: "Moyen (fragmentation)", vitesse: "450–600 m/s", type: "Fragmentation aérienne" }
      },
    };


/* ========== FALLBACK MUNITIONS GÉNÉRIQUES (moteur de combat Arena) ==========
   Utilisé si un char n'a pas ce type d'obus dans son propre profil TANK_MODULES. */
        const globalAmmoData = {
            "AP": { muzzleVelocity: 800, mass: 6.8, caliber: 75, drag: 0.33, penetration: 100, damage: 110, explosion: 0.5, fuze: false },
            "APBC": { muzzleVelocity: 820, mass: 6.5, caliber: 75, drag: 0.31, penetration: 118, damage: 115, explosion: 0.55, fuze: false },
            "APCBC": { muzzleVelocity: 790, mass: 7.0, caliber: 75, drag: 0.34, penetration: 122, damage: 132, explosion: 1.1, fuze: true },
            "APHE": { muzzleVelocity: 780, mass: 6.8, caliber: 75, drag: 0.35, penetration: 110, damage: 150, explosion: 1.3, fuze: true },
            "APCR": { muzzleVelocity: 950, mass: 4.0, caliber: 75, drag: 0.28, penetration: 162, damage: 80, explosion: 0.3, fuze: false },
            "HE": { muzzleVelocity: 550, mass: 6.0, caliber: 75, drag: 0.42, penetration: 10, damage: 200, explosion: 2.5, fuze: false },
            "HEAT": { muzzleVelocity: 600, mass: 5.5, caliber: 75, drag: 0.40, penetration: 200, damage: 155, explosion: 1.8, fuze: false, isHEAT: true },
            "APDS": { muzzleVelocity: 1120, mass: 3.5, caliber: 75, subCaliber: 50, drag: 0.24, penetration: 225, damage: 75, explosion: 0.2, fuze: false },
            "fumigène": { muzzleVelocity: 400, mass: 5.0, caliber: 75, drag: 0.50, penetration: 0, damage: 0, explosion: 0, fuze: false, isSmoke: true },
            "shrapnel": { muzzleVelocity: 500, mass: 6.0, caliber: 75, drag: 0.45, penetration: 15, damage: 85, explosion: 1.6, fuze: false, isShrapnel: true },
        };


/* ==========================================================================
   EXTENSION DU ROSTER — 10 nations / 12 rangs
   À placer dans shared-data.js avant les helpers getAvailableAmmos/computeTiers.
   Les valeurs des véhicules ajoutés sont des valeurs de JEU/estimations
   de départ, pas des fiches historiques certifiées. Les angles sont des
   estimations en degrés; les blindages composites modernes sont représentés
   par une valeur d'équivalence simplifiée, non par l'épaisseur physique.
   ========================================================================== */
const EXTENDED_VEHICLES = [
  {"name":"Renault R35","nation":"🇫🇷","tier":1,"role":"char léger","year":"1936","gun":"37mm SA18","speed":20,"crew":2,"weight":10.6,"hf":40,"hs":40,"hr":32,"tf":40,"ts":40,"tr":32,"cal":37,"vel":388,"mass":0.7,"pen":21},
  {"name":"Type 97 Chi-Ha","nation":"🇯🇵","tier":1,"role":"char moyen","year":"1938","gun":"57mm Type 97","speed":38,"crew":4,"weight":15.8,"hf":25,"hs":20,"hr":20,"tf":25,"ts":25,"tr":25,"cal":57,"vel":349,"mass":2.6,"pen":35},
  {"name":"M13/40","nation":"🇮🇹","tier":1,"role":"char moyen","year":"1940","gun":"47mm/32","speed":32,"crew":4,"weight":14,"hf":30,"hs":25,"hr":25,"tf":42,"ts":25,"tr":25,"cal":47,"vel":630,"mass":1.4,"pen":45},
  {"name":"Strv m/42","nation":"🇸🇪","tier":2,"role":"char moyen","year":"1943","gun":"75mm m/41","speed":45,"crew":4,"weight":22.5,"hf":55,"hs":40,"hr":20,"tf":55,"ts":30,"tr":20,"cal":75,"vel":590,"mass":6.3,"pen":75},
  {"name":"Type 1 Chi-He","nation":"🇯🇵","tier":2,"role":"char moyen","year":"1943","gun":"47mm Type 1","speed":44,"crew":5,"weight":17.2,"hf":50,"hs":25,"hr":20,"tf":50,"ts":25,"tr":25,"cal":47,"vel":810,"mass":1.5,"pen":80},
  {"name":"M15/42","nation":"🇮🇹","tier":2,"role":"char moyen","year":"1943","gun":"47mm/40","speed":38,"crew":4,"weight":15.5,"hf":45,"hs":25,"hr":25,"tf":45,"ts":25,"tr":25,"cal":47,"vel":630,"mass":1.4,"pen":50},
  {"name":"AMX-13 (75)","nation":"🇫🇷","tier":3,"role":"char léger","year":"1952","gun":"75mm SA50","speed":60,"crew":3,"weight":14.5,"hf":40,"hs":20,"hr":15,"tf":40,"ts":20,"tr":20,"cal":75,"vel":1000,"mass":6.4,"pen":150},
  {"name":"Type 61","nation":"🇯🇵","tier":3,"role":"char moyen","year":"1961","gun":"90mm Rifled","speed":45,"crew":4,"weight":35,"hf":55,"hs":35,"hr":25,"tf":70,"ts":45,"tr":35,"cal":90,"vel":830,"mass":10.6,"pen":150},
  {"name":"OF-40","nation":"🇮🇹","tier":3,"role":"char de combat","year":"1980","gun":"105mm L7","speed":60,"crew":4,"weight":43,"hf":70,"hs":45,"hr":30,"tf":180,"ts":80,"tr":50,"cal":105,"vel":1470,"mass":10.9,"pen":260},
  {"name":"AMX-30B2","nation":"🇫🇷","tier":4,"role":"char de combat","year":"1982","gun":"105mm CN-105-F1","speed":65,"crew":4,"weight":36,"hf":80,"hs":35,"hr":30,"tf":80,"ts":40,"tr":30,"cal":105,"vel":1000,"mass":10.9,"pen":250},
  {"name":"Strv 103C","nation":"🇸🇪","tier":4,"role":"char sans tourelle","year":"1977","gun":"105mm L74","speed":50,"crew":3,"weight":42.5,"hf":90,"hs":40,"hr":30,"tf":0,"ts":0,"tr":0,"cal":105,"vel":1450,"mass":10.9,"pen":300},
  {"name":"ZTZ-59","nation":"🇨🇳","tier":4,"role":"char de combat","year":"1959","gun":"100mm Type 59","speed":50,"crew":4,"weight":36,"hf":100,"hs":80,"hr":45,"tf":200,"ts":100,"tr":65,"cal":100,"vel":1000,"mass":15.0,"pen":220},
  {"name":"AMX-30B2 Brenus","nation":"🇫🇷","tier":5,"role":"char de combat","year":"1990","gun":"105mm CN-105-F1","speed":65,"crew":4,"weight":38,"hf":80,"hs":35,"hr":30,"tf":80,"ts":40,"tr":30,"cal":105,"vel":1000,"mass":10.9,"pen":260},
  {"name":"Type 74","nation":"🇯🇵","tier":5,"role":"char de combat","year":"1974","gun":"105mm L7A3","speed":53,"crew":4,"weight":38,"hf":120,"hs":70,"hr":35,"tf":130,"ts":80,"tr":50,"cal":105,"vel":1470,"mass":10.9,"pen":300},
  {"name":"Ariete prototype","nation":"🇮🇹","tier":5,"role":"char de combat","year":"1988","gun":"120mm smoothbore","speed":60,"crew":4,"weight":48,"hf":150,"hs":80,"hr":50,"tf":200,"ts":100,"tr":60,"cal":120,"vel":1650,"mass":7.2,"pen":450},
  {"name":"Leclerc Série 1","nation":"🇫🇷","tier":6,"role":"char de combat","year":"1992","gun":"120mm CN120-26","speed":71,"crew":3,"weight":54.5,"hf":600,"hs":300,"hr":80,"tf":600,"ts":300,"tr":80,"cal":120,"vel":1650,"mass":7.2,"pen":450},
  {"name":"Strv 121","nation":"🇸🇪","tier":6,"role":"char de combat","year":"1990","gun":"120mm L/44","speed":68,"crew":4,"weight":59.7,"hf":600,"hs":300,"hr":80,"tf":650,"ts":350,"tr":100,"cal":120,"vel":1650,"mass":7.2,"pen":450},
  {"name":"ZTZ-96","nation":"🇨🇳","tier":6,"role":"char de combat","year":"1997","gun":"125mm ZPT-98","speed":65,"crew":3,"weight":41,"hf":500,"hs":200,"hr":60,"tf":550,"ts":250,"tr":80,"cal":125,"vel":1700,"mass":7.2,"pen":450},
  {"name":"Merkava Mk.2D","nation":"🇮🇱","tier":7,"role":"char de combat","year":"1983","gun":"105mm M68","speed":46,"crew":4,"weight":60,"hf":400,"hs":200,"hr":80,"tf":450,"ts":250,"tr":100,"cal":105,"vel":1470,"mass":10.9,"pen":350},
  {"name":"C1 Ariete","nation":"🇮🇹","tier":7,"role":"char de combat","year":"1995","gun":"120mm smoothbore","speed":65,"crew":4,"weight":54,"hf":500,"hs":250,"hr":80,"tf":550,"ts":300,"tr":100,"cal":120,"vel":1650,"mass":7.2,"pen":450},
  {"name":"AMX-40","nation":"🇫🇷","tier":7,"role":"char de combat","year":"1983","gun":"120mm smoothbore","speed":70,"crew":4,"weight":43.7,"hf":400,"hs":180,"hr":60,"tf":450,"ts":220,"tr":80,"cal":120,"vel":1650,"mass":7.2,"pen":420},
  {"name":"Leclerc Série 2","nation":"🇫🇷","tier":8,"role":"char de combat","year":"1997","gun":"120mm CN120-26/52","speed":71,"crew":3,"weight":56,"hf":700,"hs":350,"hr":100,"tf":750,"ts":400,"tr":120,"cal":120,"vel":1750,"mass":7.2,"pen":520},
  {"name":"Strv 122","nation":"🇸🇪","tier":8,"role":"char de combat","year":"1997","gun":"120mm L/44","speed":68,"crew":4,"weight":62,"hf":750,"hs":400,"hr":100,"tf":800,"ts":450,"tr":120,"cal":120,"vel":1650,"mass":7.2,"pen":500},
  {"name":"ZTZ-99","nation":"🇨🇳","tier":8,"role":"char de combat","year":"2001","gun":"125mm ZPT-98","speed":80,"crew":3,"weight":54,"hf":700,"hs":300,"hr":80,"tf":750,"ts":350,"tr":100,"cal":125,"vel":1780,"mass":7.2,"pen":550},
  {"name":"Merkava Mk.4","nation":"🇮🇱","tier":9,"role":"char de combat","year":"2004","gun":"120mm MG253","speed":64,"crew":4,"weight":65,"hf":800,"hs":400,"hr":120,"tf":850,"ts":450,"tr":140,"cal":120,"vel":1700,"mass":7.2,"pen":550},
  {"name":"Type 10","nation":"🇯🇵","tier":9,"role":"char de combat","year":"2010","gun":"120mm L/44","speed":70,"crew":3,"weight":44,"hf":700,"hs":300,"hr":100,"tf":750,"ts":350,"tr":120,"cal":120,"vel":1650,"mass":7.2,"pen":520},
  {"name":"Leclerc XLR","nation":"🇫🇷","tier":10,"role":"char de combat modernisé","year":"2022","gun":"120mm CN120-26/52","speed":70,"crew":3,"weight":57,"hf":850,"hs":400,"hr":120,"tf":900,"ts":450,"tr":140,"cal":120,"vel":1750,"mass":7.2,"pen":600},
  {"name":"ZTZ-99A","nation":"🇨🇳","tier":10,"role":"char de combat","year":"2011","gun":"125mm ZPT-98A","speed":80,"crew":3,"weight":58,"hf":850,"hs":350,"hr":100,"tf":900,"ts":400,"tr":120,"cal":125,"vel":1800,"mass":7.2,"pen":620},
  {"name":"Merkava Mk.4M","nation":"🇮🇱","tier":10,"role":"char de combat","year":"2011","gun":"120mm MG253","speed":64,"crew":4,"weight":65,"hf":900,"hs":450,"hr":130,"tf":950,"ts":500,"tr":150,"cal":120,"vel":1700,"mass":7.2,"pen":600},
  {"name":"Type 10改","nation":"🇯🇵","tier":11,"role":"char de combat modernisé","year":"concept d'évolution","gun":"120mm L/44","speed":70,"crew":3,"weight":44,"hf":800,"hs":350,"hr":100,"tf":850,"ts":400,"tr":120,"cal":120,"vel":1700,"mass":7.2,"pen":600},
  {"name":"Strv 123 (concept)","nation":"🇸🇪","tier":11,"role":"char de combat / évolution","year":"concept","gun":"120mm L/55","speed":68,"crew":4,"weight":64,"hf":900,"hs":450,"hr":120,"tf":950,"ts":500,"tr":140,"cal":120,"vel":1750,"mass":7.2,"pen":650},
  {"name":"EMBT demonstrator","nation":"🇫🇷","tier":12,"role":"démonstrateur technologique","year":"2022","gun":"120mm smoothbore","speed":65,"crew":3,"weight":61,"hf":900,"hs":450,"hr":120,"tf":950,"ts":500,"tr":150,"cal":120,"vel":1750,"mass":7.2,"pen":650},
  {"name":"KF51 Panther","nation":"🇩🇪","tier":12,"role":"démonstrateur technologique","year":"2022","gun":"130mm smoothbore","speed":70,"crew":3,"weight":59,"hf":1000,"hs":450,"hr":120,"tf":1000,"ts":500,"tr":150,"cal":130,"vel":1800,"mass":8.0,"pen":700},
  {"name":"M1E3 Abrams (programme)","nation":"🇺🇸","tier":12,"role":"programme / prototype","year":"en développement","gun":"120mm smoothbore","speed":65,"crew":4,"weight":60,"hf":1000,"hs":450,"hr":120,"tf":1000,"ts":500,"tr":150,"cal":120,"vel":1750,"mass":7.2,"pen":650},
  {"name":"Merkava Mk.3","nation":"🇮🇱","tier":9,"role":"char de combat","year":"1989","gun":"120mm MG251","speed":60,"crew":4,"weight":63,"hf":650,"hs":350,"hr":100,"tf":700,"ts":400,"tr":120,"cal":120,"vel":1650,"mass":7.2,"pen":500},
  {"name":"C1 Ariete AMV","nation":"🇮🇹","tier":11,"role":"char de combat modernisé","year":"programme modernisation","gun":"120mm smoothbore","speed":65,"crew":4,"weight":55,"hf":650,"hs":300,"hr":90,"tf":700,"ts":350,"tr":110,"cal":120,"vel":1650,"mass":7.2,"pen":500}
];

(function installExtendedRoster() {
  const flagToNation = {
    "🇩🇪": "Allemagne", "🇷🇺": "URSS / Russie", "🇺🇸": "États-Unis",
    "🇬🇧": "Royaume-Uni", "🇫🇷": "France", "🇯🇵": "Japon",
    "🇮🇹": "Italie", "🇸🇪": "Suède", "🇨🇳": "Chine", "🇮🇱": "Israël"
  };
  const previousByNation = {};
  // Prolonge les branches historiques existantes au lieu de rendre gratuits
  // tous les premiers véhicules ajoutés aux nations déjà présentes.
  Object.keys(TECH_TREE).forEach(name => {
    const v = TECH_TREE[name];
    if (!v || !v.nation) return;
    const tier = Number(v.tier) || 0;
    const existing = previousByNation[v.nation];
    if (!existing || tier > (Number(TECH_TREE[existing].tier) || 0)) previousByNation[v.nation] = name;
  });
  EXTENDED_VEHICLES.sort((a,b) => a.tier - b.tier).forEach(v => {
    const previous = previousByNation[v.nation] || null;
    const tier = v.tier;
    const cost = [0,100,200,400,700,1000,1500,2000,2600,3300,4100,5000,6000][tier] || 100;
    TECH_TREE[v.name] = {
      cost, previous, nation: v.nation, visual: v.tier <= 3 ? "🛡" : v.tier <= 6 ? "⚔" : v.tier <= 9 ? "⚡" : "🏆",
      tier, canon: v.gun, speed: v.speed + "kph", crew: String(v.crew),
      armor: v.hf + "mm*", role: v.role, year: v.year,
      nationName: flagToNation[v.nation] || v.nation
    };
    previousByNation[v.nation] = v.name;

    // Modèle d'obus de départ, à équilibrer après essais en combat.
    const isModern = tier >= 7;
    const ammo = {
      AP: { muzzleVelocity:v.vel, mass:v.mass, caliber:v.cal, drag:0.32, penetration:v.pen, damage:Math.round(v.cal*1.35), explosion:0.45, fuze:false },
      APHE: { muzzleVelocity:Math.round(v.vel*0.96), mass:v.mass, caliber:v.cal, drag:0.34, penetration:Math.round(v.pen*0.94), damage:Math.round(v.cal*1.8), explosion:1.15, fuze:true },
      HE: { muzzleVelocity:Math.round(v.vel*0.62), mass:Math.max(1,v.mass*0.9), caliber:v.cal, drag:0.42, penetration:Math.max(5,Math.round(v.cal*0.12)), damage:Math.round(v.cal*2.3), explosion:Math.max(0.8,v.cal/45), fuze:false }
    };
    if (v.cal >= 75) {
      ammo.HEAT = { muzzleVelocity:Math.round(v.vel*0.48), mass:v.mass*0.82, caliber:v.cal, drag:0.4, penetration:Math.round(v.pen*1.05), damage:Math.round(v.cal*1.5), explosion:1.5, fuze:false, isHEAT:true };
    }
    if (v.cal >= 90) {
      ammo.APDS = { muzzleVelocity:Math.round(v.vel*1.06), mass:v.mass*0.55, caliber:v.cal, subCaliber:Math.round(v.cal*0.62), drag:0.24, penetration:Math.round(v.pen*1.16), damage:Math.round(v.cal*0.85), explosion:0.2, fuze:false };
    }
    const turretless = /Strv 103/.test(v.name);
    TANK_MODULES[v.name] = {
      canon: !/M13\/40/.test(v.name), speed:v.speed, reverseSpeed: -Math.max(3,Math.round(v.speed*0.18)),
      crew:v.crew, turretRotSpeed:turretless ? 0 : (v.tier >= 8 ? 28 : v.tier >= 5 ? 22 : 15),
      weightTons:v.weight, reloadSec: v.cal >= 120 ? 8.5 : v.cal >= 100 ? 7.2 : v.cal >= 75 ? 6.0 : 4.5,
      armor: {
        hullFront:{thickness:v.hf,angle:v.tier >= 7 ? 30 : 15},
        hullSide:{thickness:v.hs,angle:0}, hullRear:{thickness:v.hr,angle:10},
        turretFront:{thickness:v.tf,angle:v.tier >= 7 ? 35 : 10},
        turretSide:{thickness:v.ts,angle:0}, turretRear:{thickness:v.tr,angle:0},
        hullRoof:{thickness:v.tier >= 7 ? 30 : 12,angle:0},
        hullBottom:{thickness:v.tier >= 7 ? 20 : 10,angle:0},
        turretRoof:{thickness:v.tier >= 7 ? 30 : 12,angle:0}
      },
      ammo, engine:true, trackLeft:true, trackRight:true,
      trackArmor:{front:v.tier >= 7 ? 40 : 12,side:v.tier >= 7 ? 35 : 18,rear:v.tier >= 7 ? 30 : 12},
      // Champs descriptifs supplémentaires, ignorés sans effet secondaire par l'ancien moteur.
      nationName:flagToNation[v.nation] || v.nation, role:v.role, year:v.year,
      gun:v.gun, caliber:v.cal, estimatedEnginePowerHp:Math.round(v.weight * (v.tier >= 8 ? 24 : v.tier >= 5 ? 18 : 14)),
      dimensionsMeters:{length:Math.round((v.weight > 50 ? 10.5 : v.weight > 30 ? 8 : 6.5)*10)/10, width:Math.round((v.weight > 50 ? 3.8 : v.weight > 30 ? 3.4 : 2.8)*10)/10, height:Math.round((v.tier >= 8 ? 2.5 : 2.7)*10)/10},
      moduleLayout:{
        engine:{x:0,y:0.7,z:-1.5}, transmission:{x:0,y:0.45,z:-2.1},
        driver:{x:0,y:0.9,z:1.1}, gunner:{x:0.65,y:1.25,z:0.2},
        commander:{x:-0.55,y:1.35,z:0.1}, ammo:{x:0,y:0.65,z:0.0}
      },
      dataQuality:"ESTIMATION_JEU — vérifier les valeurs avant usage historique"
    };
  });
  // La constante TIERS sera calculée après cette extension, avec les 12 rangs.
})();

/* ========== HELPERS DÉRIVÉS ==========
   Remplace l'ancien tankAmmoAvailable codé en dur (Lobby) : les obus
   disponibles pour un char sont directement dérivés de son profil
   TANK_MODULES.ammo, qui est la donnée de combat réelle — plus de
   risque de désynchronisation entre "obus affichés au Hangar" et
   "obus réellement utilisables en combat". */
function getAvailableAmmos(tankName) {
  const mods = TANK_MODULES[tankName];
  if (!mods || !mods.ammo) return [];
  return Object.keys(mods.ammo);
}

/* Dérive la liste des chars groupés par tier, dans l'ordre — source unique
   utilisée par le Hangar (buildTree) et par tout autre écran ayant besoin
   des tiers (ex : liste "Équipages" du Lobby, fix #19). */
function computeTiers() {
  const t = {};
  Object.keys(TECH_TREE).forEach(name => {
    const tier = TECH_TREE[name].tier;
    if (!t[tier]) t[tier] = [];
    t[tier].push(name);
  });
  return Object.keys(t).sort((a, b) => a - b).map(k => t[k]);
}
const TIERS = computeTiers();
