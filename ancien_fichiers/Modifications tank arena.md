# Plan de changements complets — Tank Arena Fusion

Document récapitulatif de tous les changements validés au cours de la discussion.  
Aucun de ces points n’a encore été implémenté (sauf correction mineure déjà faite sur les modules X-ray).

---

## 1. Modules internes (X-ray) — Suivi du terrain

**Problème :**  
Les modules affichés en transparence après une pénétration restaient à altitude fixe et ne suivaient pas le relief ni l’inclinaison du char.

**Solution :**  
- Position Y basée sur `tank.gz`
- Application du pitch et du roll du char (même ordre d’Euler que le modèle 3D)
- Les modules restent correctement placés à l’intérieur du char même sur pente

**Statut :** Correction déjà appliquée dans `arena-damage.js`.

---

## 2. Système de Spotting réaliste (Solution 3)

### Objectif
Remplacer l’affichage permanent des noms ennemis par un vrai système de détection progressif.

### Principes
- Suppression totale du **bouton de repérage**
- 3 niveaux de détection :
  1. **Contact** → simple point / marqueur vague
  2. **Silhouette** → forme du char visible, sans nom
  3. **Identified** → nom + type + distance

### Facteurs de détection
- Distance
- Ligne de vue 3D (relief + obstacles)
- Taille du char
- Vitesse (bruit des chenilles)
- Tir (flash de bouche)
- Feu / fumée
- Végétation / haies
- Temps d’observation
- Camouflage statique (immobilité)

### Autres règles
- Mémoire de position après perte de vue
- Partage d’équipe (un allié qui spot partage l’info)
- Les noms n’apparaissent **que** au niveau `identified`

---

## 3. Amélioration de la visée (mode sniper)

### Zoom
- Plusieurs niveaux de zoom contrôlés à la **molette** (en mode sniper uniquement)
- Niveaux selon la catégorie du char :

| Catégorie                  | Zooms disponibles     |
|---------------------------|-----------------------|
| Chasseurs de chars (td_*) | ×4 / ×8 / ×12         |
| Chars moyens / légers     | ×3.5 / ×7 / ×10       |
| Chars lourds              | ×3 / ×6 / ×8          |

- Zoom mémorisé **par char**
- Sensibilité souris adaptée automatiquement au niveau de zoom

### Mise à zéro (Zeroing)
- `Shift + molette` pour changer la distance de zéro
- Distances : 200 / 400 / 600 / 800 / 1000 m
- Le réticule se décale verticalement pour compenser la chute de l’obus
- Affichage discret : `ZÉRO 600`
- Zéro mémorisé **par char**

### Point d’impact balistique
- Toujours visible (vue libre + sniper)
- Forme : **petite croix**
- Calcul réel selon type d’obus, vitesse, gravité, traînée et zéro actuel

### Indicateur de pénétration
- Uniquement par la **couleur du réticule**
  - Ambre / vert clair → pénétration probable
  - Orange → incertain / ricochet possible
  - Rouge → bloqué

### Vue sniper
- Épurée au maximum
- Pas d’informations redondantes
- Contenu minimal : réticule + zéro + croix d’impact (+ distance très discrète)

### Commandes mobile
- Zoom : boutons + / – (ou pinch)
- Zéro : boutons Z– / Z+
- Entrée/sortie sniper : bouton existant

---

## 4. Refonte du HUD

### Problèmes traités
- Trop d’informations redondantes
- Difficulté à distinguer rapidement les coups **reçus** des coups **infligés**

### Principes
- Séparation visuelle forte :
  - **Rouge** = dégâts reçus
  - **Ambre** = dégâts infligés
- Réduction drastique des doublons
- Priorité à la lisibilité en combat

### Organisation
- **Centre** : réticule + croix d’impact (propre)
- **Coups infligés** : marqueurs ambre (près du réticule ou journal)
- **Coups reçus** : marqueurs rouges + flèches directionnelles
- **Journal (feed)** : couleurs clairement différenciées (rouge vs ambre)
- **Schéma modules 2D** : moins intrusif (sur demande ou uniquement sur gros dégât reçu)
- Suppression du bouton de repérage

---

## 5. Animations de fin de partie

### Deathmatch
- Cinématique du **dernier tir décisif**
- Ralenti sur le tir gagnant + impact/destruction du dernier char
- Puis transition vers l’écran de fin
- C
... 