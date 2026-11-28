# Tank Arena — combat de chars 3D dans le navigateur

Jeu de combat de chars en 3D (Three.js r128 **incluse** dans `js/vendor/`), sans build ni dépendance
côté client. Le serveur Node (`server.js`) n'a aucune dépendance npm.

## Lancer le jeu

- **Hors ligne** : double-cliquez sur `Lancer_serveur.bat` (ou `node server.js` avec Node.js ≥ 18),
  puis ouvrez `http://localhost:3000/lobby.html`. Une simple page statique fonctionne aussi pour le solo,
  mais le serveur est nécessaire pour les comptes et le multijoueur.
- **Sur le réseau local** : les amis ouvrent l'adresse IPv4 affichée dans la console du serveur.
- **Sur Internet** : voir `docs/HEBERGER_GRATUITEMENT.md` (Render + Upstash) ou le tunnel intégré.
- `/api/health` indique les fichiers manquants et si les comptes sont persistants.

## Menus (`lobby.html`)

01 QG · 02 Combat · 03 Hangar · 04 Recherche · 05 Carrière · 06 Réglages · 07 Atelier · 08 Compte.
Toutes les valeurs affichées proviennent des données du jeu (`js/shared-data.js`, `js/roster-wt.js`).

## Combat (`arena.html`)

- Balistique 3D, blindage par face, modules internes (équipage, moteur, canon, chenilles, soute),
  météo et post-traitement cinéma.
- Modes : Champ d'essai, Entraînement, Escarmouche, Deathmatch, Campagne (10 missions par véhicule)
  et Multijoueur. Hors ligne contre des bots ou en salons WebSocket.
- Contrôles : ZQSD/WASD, Q/E rapport, Espace frein, souris + clic = tir, clic droit/V lunette,
  1/2 obus, R réparer, T repérage, M carte, N replier les panneaux Véhicule/Modules,
  Échap pause (désactivée en partie multijoueur).
- Modèles 3D : voir `models/README.md`.

Limites : le sol est généré par un moteur de relief déterministe ; les arbres sont décoratifs.
Aucune ressource externe (polices système). **Le multijoueur reste « entre amis » : le serveur relaie
les messages mais ne valide pas les tirs ni les dégâts** (pas d'anti-triche autoritaire).

## Organisation du dépôt

- `lobby.html`, `arena.html`, `editor.html`, `cinematic-editor.html` : les pages ; code dans `js/` et `css/`.
- `server.js` : serveur Node sans dépendance (fichiers statiques, WebSockets, comptes, tunnels).
- `js/` : moteur de combat, cartes, rendu, interface, réseau, comptes.
- `models/` : modèles 3D. `docs/` : guides de déploiement et de sécurité.
- `package.json`, `render.yaml`, `Lancer_serveur.bat`, `tunnel.bat` : lancement et déploiement.
- Les anciennes versions ont été retirées du dépôt ; il n'y a plus de dossier `archive/`.

## Dégâts internes (`js/arena-damage.js`)

Un obus qui perce le blindage continue dans le char. Chaque char possède des modules 3D internes
(équipage par poste, moteur, transmission, réservoirs, soutes, culasse, bague de tourelle).

- **AP, APCR, APDS, APCBC, APBC** : traversent les modules en perdant de l'énergie, peuvent ressortir.
- **APHE** : explose après un retard si la fusée est armée ; sinon se comporte comme un obus plein.
- **HE** : explosion à l'entrée. **HEAT** : jet étroit et éclats de revêtement.
- Les éclats s'arrêtent au premier module dense rencontré.
- Effets : équipage hors de combat, modules dégradés, incendie (extincteur automatique unique),
  détonation de soute. Un char est perdu s'il reste ≤ 1 membre d'équipage.
- Retours : panneau « Modules », rapport d'impact, traceurs 3D, radiographie du char touché.
  Réparation (R à l'arrêt) : chenilles, boîte, moteur, culasse, tourelle.

## Cartes

10 théâtres en 12000×12000 px (`js/map-engine.js`, `js/map-defs.js`, `js/terrain-gen.js`) : relief réel,
eau et ponts, pentes > 39° infranchissables, chars inclinés, obus/caméra tenant compte du terrain.

## Multijoueur (`js/net.js` + `server.js`)

1. Lancez le serveur sur le PC hôte ; la console affiche l'adresse LAN.
2. Jouer → Multijoueur : la liste affiche les **salons actifs** et les **joueurs en ligne**.
3. Le premier joueur crée la partie (carte, bots, règles, mot de passe) ; les autres la rejoignent.
   Jusqu'à **24 salons** simultanés (`ROOM_LIMIT`).
4. L'hôte règle carte, bots, difficulté, score, captures, réapparition, entrée en cours de partie,
   taille, mot de passe, équipes, expulsions et lancement. Après la partie, le salon reste ouvert.
5. Les bots sont simulés par l'hôte de la simulation ; les dégâts sont résolus par la machine du
   char touché. Une perte de connexion déclenche une reconnexion automatique de l'arène.

### Tunnel public

*Réglages → Multijoueur → Démarrer* ouvre un lien public (Cloudflare si `cloudflared.exe` est présent,
sinon SSH via localhost.run). Le bouton exige la variable d'environnement `TA_TUNNEL_KEY` : définissez-la
avant de lancer le serveur et saisissez la même clé dans le panneau. Le tunnel expose le serveur entier :
ne le laissez pas actif sans surveillance. Voir `docs/HEBERGER_GRATUITEMENT.md`.

## Viseur

Le cercle ambre montre le point d'impact réellement calculé (traînée, gravité, vent, vitesse du char)
et l'anneau de pénétration utilise les mêmes fonctions de combat que le tir (`decideImpact`), à ~8 Hz.
Lunette sniper : réticule gradué en milliradians, bandeau Visée · Élévation · Munition · Zoom.
Les étiquettes du HUD indiquent explicitement `Visée` (ligne de visée) et `Impact` (point calculé),
et ne se superposent plus aux panneaux opaques.

## Comptes et sauvegardes (`js/account.js`)

- Compte pseudo + mot de passe, sans e-mail. Progression synchronisée quelques secondes après les
  changements, au changement d'onglet et à la fermeture de la page.
- Conflits entre appareils : le jeu demande quelle version conserver (jamais d'écrasement silencieux).
- Amis, état en ligne, bouton « Rejoindre » vers le salon d'un ami.
- Pseudos réservés protégés ; mot de passe haché avec **scrypt + sel**, comparaison à temps constant,
  jetons aléatoires. Changer de mot de passe déconnecte tous les appareils.
- Upstash Redis si `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` sont définis, sinon
  `data/db.json` en local. Ce dossier n'est **jamais** servi par HTTP.
- Sans compte : export / import d'un fichier de progression, avec validation et normalisation des données.

Sécurité : le serveur applique une liste blanche de fichiers publics, refuse les origines cross-origin
pour les routes de comptes, limite les trames WebSocket et n'accepte pas d'en-tête `X-Forwarded-For`
forgé depuis l'extérieur. Les sauvegardes importées sont validées avant rendu HTML. Consultez
`docs/SECURITE.md` pour les limites restantes (notamment l'absence d'autorité serveur).

## Graphismes et météo

- **Pipeline couleur** : rendu linéaire puis conversion sRGB en fin de chaîne, tone mapping ACES
  (désactivable), roll-off des hautes lumières, exposition et grading par météo/heure. Aucune double
  conversion sRGB, y compris quand le FXAA est actif.
- **Éclairage** : reflets du ciel (PMREM), ombres portées plus larges et stabilisées sur la grille de
  texels, brouillard repoussé, plancher d'ambiant la nuit d'orage (le char reste lisible sous la pluie).
- **Sol et effets** : détail en 3 échelles non commensurables, masque d'eau séparé avec Fresnel et
  écume, herbe en 4 variantes regroupées en plaques, explosions en particules texturées, cratères au
  sol, fumée et flashs atténués.
- **Réglages** : qualité, ombres/AA/AO (Auto/On/Off), tone mapping, échelle de rendu, distance de vue,
  effets cinématiques, résolution dynamique, météo animée, mode sans échec.
- Météo : clair, nuageux, pluie, orage, neige, brouillard, tempête de sable. Heure : aube, jour,
  crépuscule, nuit. Traces de chenilles, débris et usure des chars réglables dans l'Atelier.
- Mode sans échec : Réglages → Graphismes, `?safe=1` pour l'activer ou `?safe=0` pour le retirer vraiment
  (l'ancien réglage restait piégé dans le stockage local).

## Licence

Aucune licence n'est actuellement déclarée. Le code est fourni tel quel, sans garantie ; contactez
le propriétaire du dépôt avant toute réutilisation ou redistribution.
