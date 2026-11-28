# Sécurité — ce qui est protégé et ce qui ne l'est pas

## Protections appliquées

- **Fichiers statiques** : liste blanche (`server.js`, `isPublicFile()`). `data/`, `node/`,
  `cloudflared*.exe`, `*.tmp`, `.bat` et les fichiers cachés ne sont pas serviables.
- **En-têtes HTTP** : `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`,
  pas de cache pour les pages. CORS désactivé par défaut pour les routes de comptes
  (`TA_CORS_ORIGIN` permet une origine exacte, jamais `*`).
- **Comptes** : scrypt (N=16384), sel aléatoire, `timingSafeEqual`, jetons de 64 hexadécimaux,
  limiteurs d'IP et de pseudo, révocation de **toutes** les sessions lors d'un changement de mot
  de passe ou d'une suppression de compte. `X-Forwarded-For` n'est pris en compte que derrière
  un proxy local (tunnel).
- **WebSocket** : validation du handshake (clé, version), trames masquées seulement, heartbeat,
  limite de taille et de cadence par socket, types de messages restreints, identification `cid`
  liée à une socket vivante.
- **Sauvegardes** : validation/normalisation à l'import, à la synchronisation et à la lecture ;
  les champs de texte sont neutralisés puis échappés avant tout `innerHTML` (historique, designs).
- **Tunnel public** : nécessite `TA_TUNNEL_KEY` (en-tête `X-TA-Key` envoyé depuis *Réglages →
  Multijoueur*), SSH en `StrictHostKeyChecking=yes`.

## Limites connues

1. **Pas d'autorité serveur.** Le client qui possède un char calcule ses dégâts et diffuse le
   résultat. Un client modifié peut tricher (position, cadence de tir, score). Le serveur valide
   la forme des messages, pas la vérité du jeu. Ne pas utiliser pour un serveur compétitif public.
2. **Jetons de session dans `localStorage`.** Toute XSS non détectée suffirait à les lire.
   Une migration vers des cookies `HttpOnly` reste souhaitable.
3. **`render.yaml` dépend de Upstash.** Sans les variables `UPSTASH_*`, Render (plan gratuit) perd
   les comptes à chaque redémarrage : `/api/health` indique `"persistent":false`.
4. **Pas de tests automatisés ni de CI.** Vérification faite par `node --check` sur tous les scripts,
   puis tests manuels HTTP/WebSocket (santé, fichiers privés, comptes, révocation, salons).

Si vous exposez le jeu à des personnes non fiables, traitez-le comme un jeu entre amis et gardez
le tunnel désactivé sauf besoin ponctuel.
