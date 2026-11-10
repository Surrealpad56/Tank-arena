# Jouer en multijoueur depuis les PC du CDI (gratuit, sans installer quoi que ce soit)

Principe : le jeu tourne sur un petit serveur gratuit sur Internet. Les élèves ouvrent simplement
une adresse (https://…onrender.com) dans le navigateur, comme pour n'importe quel site.
Aucun droit d'administrateur, aucune installation, aucun tunnel à lancer.

## Mise en place (une seule fois, ~10 minutes, depuis n'importe quel ordinateur)

1. Créer un compte gratuit sur https://github.com
2. « New repository » → nom : tank-arena → Create.
3. « uploading an existing file » → glisser TOUT le contenu du dossier du jeu (pas le .zip) → « Commit changes ».
   (Il faut que `server.js` et `package.json` soient à la racine du dépôt.)
4. Créer un compte gratuit sur https://render.com (« Sign in with GitHub »).
5. « New + » → « Web Service » → choisir le dépôt tank-arena, puis :
   - Language : Node
   - Build Command : `echo ok`
   - Start Command : `npm start`
   - Instance Type : **Free**
6. « Deploy ». Au bout de 2-3 minutes Render affiche l'adresse du jeu : https://tank-arena-xxxx.onrender.com

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
