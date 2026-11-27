# Héberger Tank Arena gratuitement

Deux options : Render (aucune installation chez les joueurs) ou votre propre PC (tunnel public).

## Option A — Render (recommandé)

1. Créez un dépôt GitHub et uploadez **tout le contenu** du dossier du jeu : `server.js`, `package.json`,
   `lobby.html`, `arena.html`, `editor.html`, `cinematic-editor.html`, les scripts `.bat`, puis les dossiers
   `js/`, `css/`, `models/`, `docs/`.
   Vérifiez dans la liste des fichiers du dépôt que `js/`, `css/` et `models/` sont bien présents.
2. Sur Render : **New + → Web Service → Blueprint** (le fichier `render.yaml` est à la racine), ou créez le service à la main :
   - Language : **Node**
   - Build Command : `echo ok`
   - Start Command : `npm start`
   - Instance Type : **Free**
3. **Avant de publier le jeu aux joueurs**, ajoutez les variables d'environnement (onglet *Environment*) :

   | Variable | Valeur | Obligatoire ? |
   |---|---|---|
   | `UPSTASH_REDIS_REST_URL` | URL REST de votre base Upstash | **oui** pour garder les comptes |
   | `UPSTASH_REDIS_REST_TOKEN` | Jeton REST Upstash | **oui** pour garder les comptes |
   | `TA_TUNNEL_KEY` | Secret aléatoire long | seulement si vous utilisez le bouton « Lien public » |

   Le disque du plan gratuit est **effacé à chaque redémarrage** : sans Upstash, les comptes créés disparaissent.
   Ces secrets ne doivent jamais être commités dans GitHub. `render.yaml` ne contient que leurs noms (`sync: false`).
4. Déployez, puis ouvrez `https://votre-service.onrender.com/api/health`.
   Vous devez lire `"ok":true,"missing":[],"accounts":"upstash","persistent":true`.

Le plan gratuit met le service en veille après ~15 min sans activité ; le premier chargement peut prendre ~1 min.
Pendant une partie, les WebSockets maintiennent le service éveillé.

### Upstash en bref

- Créez une base **Redis** gratuite sur https://upstash.com (région proche de vos joueurs).
- Onglet **REST API** : copiez `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` dans Render.
- Vérifiez `/api/health`. Si vous avez publié un jeton par erreur, régénérez-le immédiatement dans Upstash.

## Option B — depuis votre PC

1. Installez Node.js ≥ 18, ou placez un dossier `node/` portable avec `node.exe` à côté de `server.js`.
2. Double-cliquez sur `Lancer_serveur.bat` (ou `node server.js`).
3. Ouvrez `http://localhost:3000`. Sur le même réseau, les amis ouvrent `http://<IP-du-PC>:3000`.
4. Pour un lien hors du wifi : *Réglages → Multijoueur → Démarrer*. Définissez `TA_TUNNEL_KEY`
   avant de lancer le serveur et saisissez cette clé dans le champ prévu par le panneau.
   Le bouton reste désactivé tant que la clé n'est pas fournie.

`cloudflared.exe` est téléchargé par `tunnel.bat` sans vérification de signature : si vous déployez
dans un environnement sensible, fournissez vous-même un binaire vérifié plutôt que d'utiliser ce script.

## Sécurité

- Le serveur ne sert qu'une **liste blanche** de fichiers publics. `data/`, `node/`, `cloudflared*.exe`,
  `*.tmp` et les scripts `.bat` ne sont jamais accessibles par HTTP.
- Les routes de comptes refusent les requêtes cross-origin par défaut (`TA_CORS_ORIGIN` peut autoriser
  une origine exacte si vous hébergez les pages statiquement ailleurs).
- Le relais WebSocket accepte uniquement les types de messages du jeu, avec une limite de taille et de
  cadence par socket. Le jeu reste **client-authoritative** : ne l'utilisez pas comme un serveur
  compétitif anti-triche.
- Changez le mot de passe d'un compte : tous ses appareils sont déconnectés.
- Aucune donnée réelle n'est demandée : pseudo, mot de passe haché (scrypt), amis et progression.
  Chaque joueur peut supprimer son compte dans *Compte → Sécurité*.

## Mise à jour

Remplacez les fichiers dans GitHub : Render redéploie automatiquement. En local, relancez `server.js`.
