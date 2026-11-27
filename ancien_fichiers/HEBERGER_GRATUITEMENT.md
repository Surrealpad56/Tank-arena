# Jouer en multijoueur depuis les PC du CDI (gratuit, sans installer quoi que ce soit)

Principe : le jeu tourne sur un petit serveur gratuit sur Internet. Les élèves ouvrent simplement
une adresse (https://…onrender.com) dans le navigateur, comme pour n'importe quel site.
Aucun droit d'administrateur, aucune installation, aucun tunnel à lancer.

## Mise en place (une seule fois, ~10 minutes, depuis n'importe quel ordinateur)

1. Créer un compte gratuit sur https://github.com
2. « New repository » → nom : tank-arena → Create.
3. « uploading an existing file » → glisser TOUT le contenu du dossier du jeu (pas le .zip) → « Commit changes ».
   (Il faut que `server.js` et `package.json` soient à la racine du dépôt.)
   ⚠ **Vérifiez ensuite que les dossiers `js`, `css` et `models` apparaissent bien dans la liste des fichiers du dépôt.**
   Si seuls les fichiers du haut (html, server.js…) sont là, la page s'affiche sans style ni script : c'est le piège classique.
   Dans ce cas : refaire « Add file → Upload files » en glissant les dossiers `js`, `css` et `models` eux-mêmes
   (le glisser-déposer de dossiers fonctionne mieux dans Chrome ou Edge que dans Firefox), ou les envoyer un par un.
4. Créer un compte gratuit sur https://render.com (« Sign in with GitHub »).
5. « New + » → « Web Service » → choisir le dépôt tank-arena, puis :
   - Language : Node
   - Build Command : `echo ok`
   - Start Command : `npm start`
   - Instance Type : **Free**
6. « Deploy ». Au bout de 2-3 minutes Render affiche l'adresse du jeu : https://tank-arena-xxxx.onrender.com

## Contrôle rapide après le déploiement
Ouvrez `https://votre-adresse.onrender.com/api/health` : vous devez voir `{"ok":true,"missing":[]…}`.
Sinon la liste `missing` indique exactement les fichiers absents du dépôt. Les pages affichent aussi un bandeau rouge
« Le jeu n'a pas pu charger N fichier(s) » quand c'est le cas. Après avoir ajouté les fichiers manquants sur GitHub,
Render redéploie tout seul (1-2 minutes).

## Le jour J
- Ouvrir l'adresse 2 minutes avant l'heure : un service gratuit s'endort après 15 min sans activité
  et met environ 1 minute à se réveiller (la page affiche un écran d'attente, c'est normal).
- Un élève crée la partie dans *Combat → Multijoueur* ; les autres ouvrent la même adresse et la rejoignent.
- Pendant une partie, le serveur reste éveillé tout seul.

## À savoir
- Gratuit : 750 h de serveur par mois, largement suffisant pour des parties au CDI.
- Les XP, chars débloqués et chars de l'Atelier sont enregistrés dans le navigateur de chaque PC :
  ils ne suivent pas l'élève d'un ordinateur à l'autre.
- Si le site est bloqué par le filtrage de l'établissement, ne cherchez pas à le contourner :
  demandez au professeur-documentaliste ou au référent numérique d'autoriser l'adresse
  (https://…onrender.com, en HTTPS, WebSocket compris).
- Pour mettre le jeu à jour : remplacer les fichiers dans le dépôt GitHub ; Render redéploie seul.

## Autre possibilité : héberger depuis votre propre PC (à la maison)
Placez `cloudflared.exe` à côté de `server.js` (et un dossier `node` portable si Node n'est pas installé), lancez
`Lancer_serveur.bat`, ouvrez http://localhost:3000, puis *Réglages → Multijoueur → Démarrer* : le lien
https://…trycloudflare.com est à envoyer aux autres joueurs. Le PC qui héberge doit rester allumé pendant la partie.
Évitez de le faire depuis un ordinateur de l'établissement sans l'accord du référent numérique.

## Comptes et sauvegardes durables avec Upstash (gratuit)
Les comptes, amis et sauvegardes de progression doivent être stockés hors de Render : le disque gratuit de Render est effacé
à chaque redémarrage. Upstash (base Redis gratuite) conserve ces données. Sans Upstash le jeu fonctionne quand même
(les comptes sont alors dans un fichier `data/db.json`, parfait en local) mais ils peuvent disparaître sur Render.

1. Créez un compte gratuit sur https://upstash.com puis « Create Database » (type **Redis**, offre **Free**).
   Choisissez une région proche (par ex. Europe / Francfort) et laissez les autres réglages par défaut.
2. Sur la page de la base, onglet **REST API** : copiez **UPSTASH_REDIS_REST_URL** et **UPSTASH_REDIS_REST_TOKEN**.
3. Sur Render : votre service → **Environment** → « Add Environment Variable » ×2 :
   - `UPSTASH_REDIS_REST_URL` = l'adresse copiée (commence par https://)
   - `UPSTASH_REDIS_REST_TOKEN` = le jeton copié
   Enregistrez : Render redéploie tout seul.
4. Vérifiez `https://votre-adresse.onrender.com/api/health` : vous devez lire `"accounts":"upstash"` et `"persistent":true`.
   Dans le jeu, la section **Compte** n'affiche plus l'avertissement « stockage non durable ».

⚠ Le jeton Upstash est un secret : ne le mettez JAMAIS dans un fichier du dépôt GitHub (uniquement dans les variables Render).
Si vous l'avez publié par erreur, supprimez la base ou régénérez le jeton dans Upstash.
Les limites de l'offre gratuite d'Upstash peuvent changer : consultez leur page de tarifs. Le jeu envoie très peu de commandes
(les comptes sont gardés en mémoire du serveur, la base ne sert qu'aux écritures et au rechargement après redémarrage).

## Vie privée (élèves)
Ce qui est enregistré par compte : le pseudo, le mot de passe **haché** (jamais en clair), la liste d'amis et la progression de jeu.
Aucun e-mail, aucun nom réel. Chaque joueur peut supprimer son compte et ses données depuis *Compte → Sécurité → Supprimer*.
Conseillez aux élèves de ne pas utiliser leur vrai nom ni un mot de passe utilisé ailleurs, et prévenez le référent numérique de l'établissement.
