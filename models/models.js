 /* ==========================================================================
   MODELS.JS — Manifeste des modèles 3D personnalisés.
   Les véhicules non déclarés ici utilisent leur assemblage procédural.
   Ajouter ici les entrées des modèles GLB / glTF / OBJ lorsqu'ils existent.
   ========================================================================== */
(function (global) {
  "use strict";
  global.TANK_MODEL_MANIFEST = global.TANK_MODEL_MANIFEST || {};

  // Tiger I Ausf. E
  global.TANK_MODEL_MANIFEST["Pz.Kpfw. VI Tiger Ausf. E"] = {
    file: "models/tiger_i_pzkpfw_vi_ausf._e.glb",
    forward: "-y"   // avant du modèle = +X (axe du jeu)
    // Optionnel si la détection auto échoue :
    turret: "Object471",
    //gun: "nom_du_noeud_canon",
    //yaw: 0,      // rotation supplémentaire en degrés
    //flipX: false
  };

  // Si tu veux le même modèle pour la version H :
  // global.TANK_MODEL_MANIFEST["Panzer VI Tiger Ausf. H"] = {
  //   file: "models/tiger_i_pzkpfw_vi_ausf._e.glb",
  //   forward: "+x"
  // };
})(window);
