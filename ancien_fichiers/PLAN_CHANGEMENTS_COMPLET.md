# Plan de changements complets — Tank Arena Fusion

Document récapitulatif de tous les changements validés au cours de la discussion.  
Aucun de ces points n’a encore été implémenté (sauf correction mineure déjà faite sur les modules X-ray).

> **Version découpée recommandée :** voir le dossier `plans/`  
> - `plans/00_INDEX.md`  
> - `plans/01_SPOTTING.md`  
> - `plans/02_VISEE_SNIPER.md`  
> - `plans/03_HUD.md`  
> - `plans/04_ECRANS_CHARGEMENT_DEPLOIEMENT.md`  
> - `plans/05_CINEMATIQUES_FIN.md`  
>
> Travailler **une seule tâche à la fois** pour minimiser les erreurs.

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
- Couvre à la fois victoire et défaite

### Escarmouche (capture de points A, B, C)
- Caméra qui s’élève au-dessus du champ de bataille
- Mise en avant visuelle des points A/B/C contrôlés par l’équipe gagnante
- Sensation de contrôle territorial
- Puis écran de fin

### Règle commune
- Durée courte (environ 3 à 6 secondes)
- Ensuite affichage de l’écran de fin classique (stats, XP, etc.)

---

## 6. Écran de chargement + Écran de déploiement

### Écran de chargement (actuellement trop vide)
- Fond immersif lié à la carte
- Carte 2D qui se construit progressivement
- Liste des chars de **notre équipe** qui apparaissent au fur et à mesure du chargement
- Barre de progression + étapes claires
- Nom de la carte + mode

### Écran de déploiement (entre chargement et combat)
Remplace le simple panneau de touches actuel.

**Structure :**
- **Gauche** : liste des chars de **notre équipe** (image + nom + joueur). Ton char est mis en évidence.
- **Centre** : **carte 2D** avec points de capture A/B/C et zones de spawn
- **Droite** : objectif du mode uniquement
- **Bas** : gros bouton « Entrer en combat » + « Retour au QG »

**Exclusions validées :**
- Pas de rappel des touches
- Pas de réglage de munitions (il sera dans le lobby)
- Uniquement les chars de notre équipe

---

## Ordre de priorité recommandé pour l’implémentation

1. Spotting réaliste (très visible en jeu)
2. Visée sniper (zoom + zéro + point d’impact + couleur réticule)
3. Refonte HUD (distinction reçus / infligés + nettoyage)
4. Écran de chargement + écran de déploiement
5. Cinématiques de fin de partie (Deathmatch + Escarmouche)

---

*Document généré pour suivi des changements prévus — Tank Arena Fusion*
