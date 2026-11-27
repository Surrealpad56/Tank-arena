# Tank Arena (combat 3D)

Lancer : `python3 -m http.server 8000` dans ce dossier, puis ouvrir `http://localhost:8000/lobby.html`.

- **Menus** (`lobby.html`) : 01 QG · 02 Combat · 03 Hangar · 04 Recherche · 05 Carrière · 06 Réglages. Toutes les données affichées sont réelles.
- **Combat** (`arena.html`, Three.js r128) : balistique 3D, blindage par face, modules (équipage, moteur, canon, chenilles, soute).
- Modes : Entraînement, Escarmouche, Campagne (10 missions par véhicule). Jouable hors ligne contre des bots, ou en multijoueur (voir plus bas).
- Contrôles : ZQSD/WASD, Q/E rapport, Espace frein, souris + clic = tir, clic droit/V lunette, 1/2 obus, R réparer, T repérage, M carte, Échap pause.
- Modèles 3D : voir `models/README.md`.

Limites : sol plat (les rochers font office de reliefs), arbres sans collision. Aucune ressource externe (polices système).

## Organisation du dépôt
- `lobby.html`, `arena.html`, `editor.html`, `cinematic-editor.html` : les pages ; leur code est dans `js/` et `css/`.
- `server.js` : serveur Node sans dépendance (fichiers, multijoueur, comptes). `package.json`, `render.yaml` : déploiement.
- `models/` : modèles 3D. `docs/` : guides et plans. `archive/` : anciennes versions et pages de démonstration, non utilisées par le jeu.

## Dégâts internes (js/arena-damage.js)
Un obus qui perce le blindage continue dans le char. Chaque char a des modules 3D internes (équipage par poste, moteur, transmission, 2 réservoirs, soutes, culasse, bague de tourelle) dimensionnés d'après son profil.
- **Tir plein (AP, APCR, APDS, APCBC, APBC)** : traverse les modules sur sa trajectoire en perdant de l'énergie, peut ressortir ; éclats de blindage à l'entrée.
- **APHE** : fusée armée seulement si la plaque est assez épaisse, explose après un retard ; s'il ressort avant, il explose dehors (aucun dégât interne).
- **HE** : explose à l'entrée, éclats dans toutes les directions. **HEAT** : jet étroit + éclats de revêtement.
- Les éclats sont des rayons qui s'arrêtent sur le premier module dense (un équipier protège ce qui est derrière).
- Conséquences : équipage hors de combat, moteur/boîte/culasse/tourelle dégradés ou détruits, incendie (extincteur automatique, une seule fois), détonation de soute selon le remplissage (diminue à chaque tir). Un char est perdu s'il reste ≤ 1 membre d'équipage.
- Affichage : panneau « Modules » (état de votre char), « Rapport » de chaque impact (trajectoire, modules touchés), traceurs 3D et vue radiographique 3D sur le char que vous touchez. Réparation (R à l'arrêt) : chenilles, puis boîte, moteur, culasse, tourelle.

## Maps (v relief)
10 théâtres d'opérations en 12000×12000 px avec relief réel : js/map-engine.js (moteur, relief, eau, ponts), js/map-defs.js (les 10 cartes), js/terrain-gen.js (rendu du sol + ombrage du relief). Chars inclinés sur les pentes, obus / vue / caméra tenant compte du terrain, ponts surélevés, pentes >39° infranchissables.

## Multijoueur local (WebSocket)
1. Sur le PC hôte, installer Node.js puis double-cliquer `Lancer_serveur.bat` (ou `node server.js`).
2. La console affiche l'adresse (ex. `http://192.168.1.23:3000`). Le PC hôte joue aussi : il ouvre `http://localhost:3000`.
3. Les amis (même wifi) ouvrent cette adresse, Jouer → Multijoueur → Déployer.
4. Le premier arrivé crée la partie (carte, bots, score) ; les suivants la rejoignent. Une seule salle.
Limites : réseau local uniquement, les bots sont gérés par l'hôte, les touches sont résolues par la machine de la victime.

### Jouer avec des amis hors de votre wifi
**Méthode intégrée (recommandée)** : lancer `Lancer_serveur.bat`, ouvrir `http://localhost:3000`, puis *Réglages → Multijoueur → Démarrer*. Le serveur ouvre un tunnel public (ssh → localhost.run, sans compte ni droits administrateur ; nécessite le client OpenSSH de Windows) et affiche le lien à envoyer aux amis. Les adresses du réseau local sont aussi listées.
**Alternatives en dehors du jeu** : `Lancer_tunnel.bat` (même tunnel ssh, seul) ou `tunnel.bat` (serveur + tunnel Cloudflare gratuit, télécharge `cloudflared.exe` au premier lancement).

## Physique des chars
Accélération limitée par la puissance (puissance massique déduite de la vitesse de pointe) et le couple au démarrage ; frein moteur à la levée du pied, freinage progressif ; rotation sur place limitée en couple et inertie (plus lente pour les chars lourds, très réduite avec une seule chenille valide, plus lente en roulant) ; tangage et roulis de la caisse à l'accélération, au freinage et dans les virages.
Dérapage : la vitesse est conservée quand la caisse tourne ; seule l'adhérence des chenilles (0,7 g sur terre, 0,4 g dans l'eau) la ramène dans l'axe. Un char rapide qui braque à fond dérape (le M-18 à 72 km/h), pas un char lent.
Renversement : glissement latéral rapide + butée (obstacle, pente, eau peu profonde) → le char se retourne et est détruit (équipage hors de combat).

## Zones de touche de l'équipage
Chaque équipier est une forme composée de 4 boîtes (assis, vu de côté) : tête, buste, haut des jambes, bas des jambes. Tête et buste : hors de combat immédiat. Jambes : blessure (haut 60 %, bas 35 % de vie) ; deux touches ou un obus de 85 mm et plus tuent. Un chargeur blessé recharge plus lentement, un tireur blessé tourne la tourelle moins vite. Le rapport de dégâts et la radiographie 3D affichent la partie touchée.

## Viseur : point d'impact prévu
Le cercle ambre est le point où l'obus tombera réellement : on rejoue sa trajectoire (traînée, gravité, vent, vitesse du char) depuis l'orientation actuelle du canon, jusqu'au sol, un obstacle ou un char (rouge si c'est un ennemi). Il affiche la distance, reste visible par-dessus la lunette, et se plaque sur le bord de l'écran quand le canon n'est pas encore aligné.
Lunette sniper : réticule gradué en milliradians (traits tous les 5 ou 10 mil selon le zoom, chiffres tous les 10 ou 20), anneau central coloré selon la pénétration (vert / orange / rouge), bandeau Distance · Élévation · Munition · Zoom, marqueur d'impact en losange. Les panneaux du bas sont atténués en vue sniper.

## Nouveautés de cette version

### Champ d'essai (Combat → Champ d'essai)
Testez n'importe quel char (tous disponibles, sans recherche) contre des cibles placées en face de vous à 50–350 m :
**inertes**, **fixes qui tirent**, **en mouvement** (cercle de 30 m) ou **en combat**. Choisissez le char des cibles
(ou aléatoire), leur nombre et la précision de l'IA. Aucune XP. Touche **K** : réinitialise cibles, dégâts et rechargement.
Le menu pause propose « Changer d'essai » pour revenir à la configuration.

### Deathmatch
Plus aucun point de capture (ni marqueur, ni minimap) et les bots traquent désormais l'ennemi le plus proche au lieu de
se ruer vers des zones inexistantes.

### Atelier de chars (menu Atelier, ou « Modifier l'apparence » dans le hangar)
Éditeur 3D complet : pièces paramétriques (boîte, cylindre/cône, dôme, coin, **profil de caisse** dessiné point par point,
**train de roulement** complet, canon avec freins de bouche), symétrie, répétition, bibliothèque de détails (coupole,
fumigènes, jupes, phares, échappements, blindage réactif…), 8 modèles de départ, peinture et camouflages, historique
Ctrl+Z / Ctrl+Y, sauvegarde locale, export / import `.json`, capture PNG. Un char « utilisé en jeu » remplace l'apparence du
véhicule choisi dans le hangar et au combat (roues animées, tourelle, recul), mis à l'échelle de ses dimensions réelles ;
les statistiques ne changent pas. Les chars sont enregistrés dans le navigateur de chaque ordinateur.

### Chargement via tunnel plus rapide
Le serveur compresse les fichiers (brotli/gzip : 1,4 Mo → ~350 Ko), gère les ETag (réponses 304) et laisse les visiteurs
distants garder les fichiers en cache 10 minutes.

### Tunnel Cloudflare intégré
Posez `cloudflared.exe` (ou `cloudflared-windows-amd64.exe`) à côté de `server.js` : le bouton *Réglages → Multijoueur →
Démarrer* l'utilise à la place de ssh (rien d'autre à installer). `tunnel.bat` et `Lancer_serveur.bat` acceptent un dossier
`node` portable ou un Node installé.

### Hébergement gratuit, sans rien installer sur les PC
Voir `docs/HEBERGER_GRATUITEMENT.md` (Render + GitHub) : les joueurs ouvrent simplement une adresse dans leur navigateur.

### Multijoueur : salons, équipes, contrôle par l'hôte (v4)
Combat → Multijoueur ouvre la liste des **salons actifs** (hôte, carte, joueurs, équipes, bots, règles), la liste des
**joueurs en ligne** (au QG / dans un salon / en partie) et un formulaire de création. Dans un salon :
- **Choix de l'équipe** : à l'entrée (Rejoindre A / B) puis bouton « → A / → B ». L'hôte choisit la règle : *Libre* (chacun
  choisit, moitié des places par équipe), *Automatique* (équilibrage par le serveur) ou *Placées par l'hôte*.
- **Qui contrôle quoi** : l'hôte (👑) règle la carte, le nombre de bots de chaque équipe, la difficulté, le score, les zones de
  capture, la réapparition des bots, l'entrée en cours de partie, le nombre de joueurs, le mot de passe, expulse, transmet l'hôte
  et lance la partie. Les autres voient ces options verrouillées (🔒) et gèrent leur char, leur équipe (si autorisé), « prêt » et le chat.
- Après la partie, tout le monde retrouve le salon ; l'hôte peut relancer sans recréer.
- Corrige le bug d'équipe : un joueur placé en équipe B est maintenant créé en équipe B (et non A) et les bots alliés suivent
  l'équipe du joueur ; le score affiché met toujours « mon équipe » à gauche.

### Déplacements des chars (v4)
Accélération, freinage, adhérence et surtout vitesse de rotation retravaillés (rotation sur place d'un char moyen : ~40°/s
atteints en 0,5 s au lieu de ~23°/s en 1,4 s ; 0→30 km/h en ~3,5 s au lieu de ~6 s ; freinage 30→0 en 1,5 s). Les chars lourds
restent plus lents que les légers, mais ne donnent plus l'impression de « glisser dans la mélasse ».

### Comptes, sauvegarde en ligne et amis (v5)
Menu **Compte** : créez un compte (pseudo + mot de passe, aucun e-mail) et votre progression — XP, chars recherchés, statistiques,
succès, chars de l'Atelier — se retrouve sur n'importe quel ordinateur ou navigateur.
- **Synchronisation automatique** quelques secondes après chaque partie ou recherche, et à la fermeture de la page.
- **Jamais d'écrasement silencieux** : si un autre appareil a sauvegardé entre-temps, le jeu vous demande quelle version garder.
- **Ordinateur partagé** : « Déconnexion + effacer ce PC » retire la progression locale (elle reste sur le compte).
- **Amis** : demandes à accepter, état en ligne (au QG / dans un salon / en partie) et bouton « Rejoindre » vers le salon d'un ami.
- Pseudos **protégés** : un invité ne peut pas prendre le pseudo d'un compte ; le nom du compte s'affiche dans les salons (✔).
- Sécurité : mots de passe hachés (scrypt), jetons de session de 60 jours, limitation des tentatives, suppression du compte possible.
- Sans compte : exportation / importation d'un fichier de progression (menu Compte).
- Stockage : Upstash Redis (gratuit) si les variables `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` sont définies,
  sinon fichier `data/db.json`. Voir `docs/HEBERGER_GRATUITEMENT.md`.

### Graphismes « cinéma » et météo (v6)
- **Post-traitement** (qualité Moyenne et plus) : bloom sur tirs / feux / foudre, occlusion ambiante (Haute, Ultra), étalonnage
  des couleurs selon la météo et l'heure, vignettage, grain, aberration chromatique (Ultra), anticrénelage FXAA, **résolution
  dynamique** qui garde la fluidité sur les PC modestes.
- **Éclairage** : reflets du ciel sur la peinture, l'acier et l'eau ; ombres douces (Haute, Ultra).
- **Météo** : clair, nuageux, pluie, orage (foudre + tonnerre), neige, brouillard, tempête de sable ; **heure** : aube, jour,
  crépuscule, nuit. Nuages animés, pluie / neige / sable, vent dans les arbres et l'herbe, sol détrempé ou enneigé, ciel étoilé.
  Choix dans Combat (« Automatique » = selon la carte) et dans les options de salon multijoueur (l'hôte décide pour tous).
- **Sol** : relief, roche sur les pentes, eau avec vaguelettes, herbe animée ; **traces de chenilles**, cratères texturés,
  poussière du canon, onde de choc et **débris** quand un char explose.
- **Chars** : éraflures, boue, poussière, rouille et humidité (réglables dans l'Atelier : « Usure et saleté »).
- **Mode sans échec** (Réglages → Graphismes, ou ajoutez `?safe=1` à l'adresse) : désactive tous ces effets si l'affichage
  pose problème ; `?safe=0` le retire. « Effets cinématiques », « Résolution dynamique » et « Météo animée » se règlent aussi à part.
