# 🤠 BANG! — version web

Jeu de cartes BANG! jouable entre amis depuis le navigateur (mobile-first).
Frontend React/Vite, backend Node/Express/Socket.io, état 100 % en mémoire.

## Structure du dépôt

```
df-bang/
├── shared/        # types + données partagés (cartes, perso, rôles)
├── server/        # backend Socket.io (moteur de jeu)
├── client/        # frontend React (Vite)
├── render.yaml    # déploiement backend (Render)
└── vercel.json    # déploiement frontend (Vercel)
```

Le dossier `shared/` est la **source de vérité** : il est importé côté serveur
(chemin relatif) et côté client (alias `@shared`). Toute la logique de jeu vit
côté serveur ; le client n'affiche que la vue filtrée que le serveur lui envoie.

## Développement local

Deux terminaux :

```bash
# 1. Backend (port 3001)
cd server
npm install
npm run dev

# 2. Frontend (port 5173)
cd client
npm install
npm run dev
```

Ouvrir http://localhost:5173. Pour tester entre **plusieurs smartphones** sur le
même Wi-Fi : Vite écoute sur `0.0.0.0`, accède au PC via son IP locale
(`http://192.168.x.x:5173`) et règle `VITE_SERVER_URL` sur
`http://192.168.x.x:3001` (fichier `client/.env`).

### Variables d'environnement

- `server` → `CLIENT_ORIGIN` (origine CORS autorisée), `PORT`.
- `client` → `VITE_SERVER_URL` (URL du backend). Voir les `.env.example`.

### Test end-to-end du moteur

```bash
cd server
npm run dev          # dans un terminal
node smoke-test.mjs  # dans un autre : 4 bots jouent une partie complète
```

## Déploiement

### Backend — Render.com (free tier)

1. Pousser le dépôt sur GitHub.
2. Sur Render : *New → Blueprint*, sélectionner le dépôt (détecte `render.yaml`).
3. Renseigner la variable `CLIENT_ORIGIN` avec l'URL Vercel du frontend.
4. Render expose une URL type `https://bang-server.onrender.com`.

> ⚠️ Le free tier Render met le service en veille après inactivité : le premier
> chargement peut prendre ~30 s (cold start). L'état des parties en cours est
> perdu en cas de redéploiement (pas de base de données, volontairement).

### Frontend — Vercel

1. *New Project* → importer le dépôt. **Garder le Root Directory à la racine**
   (le `vercel.json` racine construit `client/` tout en incluant `shared/`).
2. Variable d'environnement `VITE_SERVER_URL` = URL Render du backend.
3. Déployer.

## Implémentation des règles

- **Rôles & PV** : distribution officielle 4–8 joueurs ; Shérif +1 PV.
- **Tour** : dynamite → prison → pioche (2, + pouvoirs) → jeu → défausse.
- **Distance** : cercle des joueurs vivants, Mustang/Lunette + perso équivalents,
  portée d'arme.
- **Réactivité** : `pendingAction` (BANG!/Raté!, Indiens!, Duel, Général Store,
  défausse) avec timeout 30 s et résolution automatique.
- **Cartes** : toutes les brunes, équipements bleus, et les 5 armes.
- **Personnages** : les 16 du jeu de base.
- **Reconnexion** : slot réservé 60 s (pseudo + code de salle).

### Simplifications connues (faciles à raffiner)

- **Faces des cartes** (couleur/valeur) : réparties de façon réaliste, pas
  exactement identiques à la liste officielle. Données isolées dans
  `shared/cards.ts` → remplaçables sans toucher au moteur.
- **Bière in extremis** : jouée automatiquement pour survivre quand c'est
  possible (pas de fenêtre de choix).
- **Kit Carlson** : garde automatiquement 2 des 3 cartes (pas de choix manuel).
- **Jesse Jones / Pedro Ramirez** : pioche standard / depuis la défausse, sans
  l'option de piocher dans la main d'un adversaire (Jesse).
- **Lucky Duke** : implémenté (retourne 2, garde la meilleure) pour les jets.
