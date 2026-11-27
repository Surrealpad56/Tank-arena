# Modèles 3D

Ce dossier contient les ressources 3D utilisées par le jeu.

- `models.js` : registre des modèles chargés par `js/model-loaders.js`.
- `*.glb` : modèles glTF binaire (chars, accessoires). Le modèle principal est
  `tiger_i_pzkpfw_vi_ausf._e.glb` (~21 Mo).

## Ajouter un modèle

1. Déposez le fichier `.glb` ici.
2. Ajoutez une entrée dans `models/models.js` avec le chemin et l'échelle.
3. Référencez la clé dans `js/tank-catalog.js` ou `js/shared-data.js` selon l'usage.

Le serveur autorise le téléchargement de `.glb`, `.gltf`, `.obj`, `.png`, `.jpg` et `.svg` depuis ce dossier.
Les autres extensions sont refusées par `server.js` (liste blanche).
