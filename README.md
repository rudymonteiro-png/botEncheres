# ⚽ Sorare Bid Bot — Superviseur & Pilote d'enchères

Application web full-stack pour **superviser et piloter un bot d'enchères automatiques** sur le
**marché primaire** de Sorare (fantasy football). Le bot enchérit à votre place, payé depuis votre
**wallet fiat**, via l'**API GraphQL officielle** de Sorare (aucun scraping, aucune carte bancaire).

> ⚠️ **État actuel : mode dry-run armé par défaut.** Les enchères réelles nécessitent une clé
> privée Starkware (voir [Armer les enchères réelles](#-armer-les-enchères-réelles)). Sans elle,
> le bot fonctionne en lecture/simulation **100 % sans risque financier**.

---

## 🧱 Architecture

```
webapp/
├── backend/          Node.js + TypeScript (moteur du bot + API + WebSocket)
│   ├── src/
│   │   ├── sorare/    Client API Sorare (PROXY UNIQUE) : auth, queries, bid, signature
│   │   ├── bot/       Moteur : decisionEngine (pur, testé) + engine (polling)
│   │   ├── db/        SQLite (better-sqlite3) : schéma + repositories
│   │   ├── api/       Routes REST (Express)
│   │   ├── ws/        Serveur WebSocket (temps réel)
│   │   └── utils/     config (.env+zod), logger (redaction secrets), money, eventBus
│   └── tests/         Tests unitaires Vitest (logique de décision)
├── frontend/         React + TypeScript + Vite (interface de supervision)
│   └── src/
│       ├── components/ Dashboard, History, Settings, AuthPanel
│       ├── hooks/      useWebSocket (reconnexion auto)
│       └── api/        client REST + types + formatage
├── ecosystem.config.cjs   PM2 (backend)
├── .env.example           Variables d'environnement (à copier en .env)
└── package.json           Monorepo (npm workspaces)
```

**Principes clés :**
- Le **backend est l'unique proxy** vers Sorare → le frontend ne contacte **jamais** Sorare
  directement → **zéro problème CORS navigateur**.
- Le **serveur n'écoute que sur `127.0.0.1` par défaut** (usage local sans login). Configurable
  via `.env` pour un VPS (`HOST=0.0.0.0` + reverse-proxy/firewall recommandés).
- Les **secrets** (mot de passe, JWT, clé Starkware, salt) ne sont **jamais** affichés/éditables
  depuis le frontend ni écrits sur disque ni loggés.

---

## ✅ Fonctionnalités implémentées

### Moteur du bot (backend)
Pour chaque auction d'un joueur cible, dans l'ordre :
1. ✅ Vérifie que **je ne possède pas déjà** le joueur (query galerie) → sinon abstention.
2. ✅ Récupère les **enchérisseurs** → abstention si l'un est **blacklisté**.
3. ✅ Vérifie que la **prochaine enchère mini ≤ plafond** défini pour le joueur.
4. ✅ Vérifie le **solde wallet fiat** suffisant.
5. ✅ Place l'enchère (réelle si armé, sinon **simulée**) payée depuis le wallet fiat.
6. ✅ Enregistre **chaque décision** en base (placée / abstention+raison / dépassement) avec horodatage.

- ✅ Contrôle **démarrer / pause / arrêter** depuis le frontend.
- ✅ Mode **dry-run** (simulation sans enchère réelle).
- ✅ **Rate limiting** Sorare respecté (file d'attente + 429/`Retry-After`) + **backoff exponentiel**.
- ✅ **Logs structurés** JSON, secrets automatiquement caviardés.

### Authentification Sorare
- ✅ **Salt** récupéré via `GET /api/v1/users/<email>`, **hash bcrypt côté serveur**.
- ✅ Mutation **`signIn`** → **JWT** (durée 30 j), stocké **en mémoire** uniquement, renouvellement auto.
- ✅ **2FA / OTP** : challenge détecté, code injectable via le dashboard (jamais stocké).
- ✅ Headers centralisés : `Authorization: Bearer`, `JWT-AUD`, `APIKEY` (optionnel).

### Frontend (supervision)
- ✅ **Dashboard temps réel** (WebSocket) : auctions suivies, montant actuel, plafond, statut
  (en lice / abstention+raison / gagnée / perdue), solde wallet fiat, état du bot.
- ✅ **Historique** filtrable/triable de toutes les actions.
- ✅ **Éditeurs de config** : joueurs cibles + plafonds, blacklist, paramètres généraux
  (intervalle polling, dry-run, host/port), avec validation.
- ✅ **Panneau auth** avec champ OTP. Aucun secret affiché.

### Tests
- ✅ **17 tests unitaires** sur la logique de décision (possession, blacklist, plafond,
  leadership, solde, ordre de priorité, casse).

---

## 🚀 Installation & lancement (local)

### Prérequis
- Node.js ≥ 20

### 1. Installer
```bash
npm install            # installe backend + frontend (workspaces)
```

### 2. Configurer
```bash
cp .env.example .env
# Éditer .env : renseigner SORARE_EMAIL et SORARE_PASSWORD (en clair).
# Laisser DRY_RUN=true et SORARE_STARK_PRIVATE_KEY vide pour démarrer sans risque.
```

### 3. Lancer (dev, backend + frontend ensemble)
```bash
npm run dev            # backend (4000) + frontend Vite (5173) en parallèle
```
Ouvrir **http://localhost:5173**.

### Lancement séparé
```bash
npm run dev:backend    # backend seul (tsx watch)
npm run dev:frontend   # frontend seul (Vite)
```

### Production (VPS)
```bash
npm run build                       # build backend + frontend
pm2 start ecosystem.config.cjs      # démarre le backend (port .env)
npm run preview --workspace frontend # ou servez frontend/dist via nginx
```

### Tests
```bash
npm test               # tests unitaires backend (Vitest)
```

---

## 🔌 API REST (backend → consommée par le frontend)

| Méthode | Endpoint                | Description                                    |
|---------|-------------------------|------------------------------------------------|
| GET     | `/api/health`           | Santé + flags (dry-run, credentials, stark)    |
| GET     | `/api/state`            | État complet du bot + auctions suivies         |
| POST    | `/api/bot/start`        | Démarre le moteur                              |
| POST    | `/api/bot/pause`        | Met en pause                                   |
| POST    | `/api/bot/stop`         | Arrête                                          |
| GET     | `/api/auth/status`      | État d'authentification Sorare                 |
| POST    | `/api/auth/signin`      | Lance signIn (peut demander 2FA)               |
| POST    | `/api/auth/otp`         | Soumet le code OTP `{ otp }` (non stocké)      |
| GET     | `/api/targets`          | Liste des joueurs cibles                        |
| POST    | `/api/targets`          | Crée `{ playerSlug, displayName, maxPriceCents, enabled }` |
| PATCH   | `/api/targets/:id`      | Modifie un joueur cible                         |
| DELETE  | `/api/targets/:id`      | Supprime un joueur cible                        |
| GET     | `/api/blacklist`        | Liste des utilisateurs blacklistés             |
| POST    | `/api/blacklist`        | Ajoute `{ userSlug, note }`                     |
| DELETE  | `/api/blacklist/:id`    | Retire de la blacklist                          |
| GET     | `/api/settings`         | Paramètres généraux                            |
| PATCH   | `/api/settings`         | Modifie `{ pollIntervalMs, dryRun, bindingHost, bindingPort }` |
| GET     | `/api/history`          | Historique `?limit=&offset=&auctionId=`        |
| WS      | `/ws`                   | Flux temps réel : `{ type:'state'\|'action', payload }` |

> 💡 **Montants en centimes** partout (entiers) pour éviter les flottants.

---

## 🗄️ Données & stockage

**Stockage : SQLite** (un seul fichier, chemin via `DATABASE_PATH`, mode WAL). Tables :
- `target_players` — joueurs cibles + plafonds (centimes) + actif.
- `blacklisted_users` — slugs blacklistés + note.
- `settings` — paramètres généraux (clé/valeur).
- `action_logs` — historique horodaté de chaque décision/action.

Le JWT, le mot de passe et la clé Starkware **ne sont jamais persistés** (mémoire uniquement).

---

## 🔐 Authentification Sorare — détails du flux

1. `GET https://api.sorare.com/api/v1/users/<email>` → `{ salt }`.
2. `bcrypt.hashSync(password, salt)` **côté serveur**.
3. `mutation signIn(email, password=<hash>) { jwtToken(aud) { token expiredAt } otpSessionChallenge errors }`.
4. Si `currentUser` null + `otpSessionChallenge` présent → **2FA** : rappeler `signIn` avec
   `{ otpSessionChallenge, otpAttempt }` (le code OTP vient du dashboard, jamais stocké).
5. Requêtes suivantes : headers `Authorization: Bearer <jwt>` + `JWT-AUD: <aud>` (+ `APIKEY` si fourni).

**Points importants identifiés :**
- ✅ La **2FA ne s'applique qu'au `signIn`**, **pas à chaque enchère** → automatisation viable.
- ⚠️ Si le JWT est émis depuis une IP puis utilisé depuis une autre, **la 2FA se réactive**.
  Sur un VPS, faites une **première authentification interactive** (champ OTP) ; le JWT 30 j tient
  ensuite tant que l'IP reste stable.
- ✅ **CORS** : le frontend ne parle qu'au backend → tout est **proxifié côté serveur**, aucun CORS
  vers Sorare. Le CORS configuré est uniquement frontend↔backend (dev local, `CORS_ORIGIN`).

---

## 🔫 Armer les enchères réelles

⚠️ **BLOCAGE technique majeur identifié lors de l'exploration de l'API :**
La mutation d'enchère **`bid` exige des `approvals` signés avec votre clé privée Starkware**, même
pour un paiement en wallet fiat (la transaction fiat transite par un
`MangopayWalletTransferAuthorizationRequest` qui doit être signé). **Il n'existe pas d'enchère fiat
sans signature Starkware.**

Pour activer les enchères **réelles** :
1. Exportez votre **clé privée Starkware** depuis sorare.com → Wallet.
2. Renseignez `SORARE_STARK_PRIVATE_KEY` dans `.env` (secret critique, mémoire uniquement).
3. Installez le paquet officiel de signature :
   ```bash
   npm i @sorare/crypto --workspace backend
   ```
4. Passez `DRY_RUN=false` (ou via le dashboard → Configuration).

Tant que ces conditions ne sont pas réunies, le moteur **force le dry-run** : aucune signature,
aucune enchère réelle. Le module de signature (`backend/src/sorare/starkSigner.ts`) est **codé mais
désactivé** derrière l'interface `starkSigner.isAvailable()`.

Flux d'enchère réelle implémenté (`bidService.ts`) :
`config{exchangeRate}` → `prepareBid` → **signature des `AuthorizationRequest`** → `bid` (settlement
`{ currency, paymentMethod: 'WALLET', exchangeRateId }`).

---

## ⚙️ Variables d'environnement

Voir [`.env.example`](./.env.example). Principales :

| Variable                    | Défaut                  | Rôle                                            |
|-----------------------------|-------------------------|-------------------------------------------------|
| `HOST` / `PORT`             | `127.0.0.1` / `4000`    | Binding du backend (localhost par défaut)       |
| `CORS_ORIGIN`               | `http://localhost:5173` | Origine frontend autorisée (dev)                |
| `SORARE_EMAIL` / `PASSWORD` | —                       | Identifiants Sorare (secrets)                   |
| `SORARE_JWT_AUD`            | `sorare-bid-bot`        | `aud` du JWT                                     |
| `SORARE_API_KEY`            | —                       | Clé API optionnelle (rate limit 600/min)        |
| `SORARE_STARK_PRIVATE_KEY`  | — (vide = dry-run)      | Clé Starkware (secret critique) pour enchère réelle |
| `DRY_RUN`                   | `true`                  | Simulation (recommandé au démarrage)            |
| `POLL_INTERVAL_MS`          | `15000`                 | Intervalle de polling des auctions              |
| `DATABASE_PATH`             | `./data/sorare-bot.sqlite` | Fichier SQLite                               |
| `LOG_LEVEL`                 | `info`                  | `debug`/`info`/`warn`/`error`                   |

---

## 📝 Guide d'utilisation rapide

1. Renseignez vos identifiants dans `.env`, lancez `npm run dev`.
2. Onglet **Configuration** : ajoutez vos **joueurs cibles** (slug + plafond) et votre **blacklist**.
3. Onglet **Dashboard** : cliquez **Se connecter** (saisissez l'OTP si 2FA), puis **Démarrer**.
4. Observez en temps réel les auctions suivies et les décisions ; consultez l'onglet **Historique**.
5. En dry-run, toutes les enchères sont **simulées** (badge « dry ») — aucun débit réel.

---

## 🧩 Statut & déploiement

- **Plateforme** : Node.js local **ou VPS** (PM2). *Pas Cloudflare* (serveur long-running + WebSocket
  + SQLite fichier + secrets en mémoire incompatibles avec l'edge runtime).
- **Stack** : Hono ❌ — Express + ws + better-sqlite3 (backend) · React + Vite (frontend) · TypeScript strict des deux côtés.
- **État** : ✅ Opérationnel en **dry-run**. Enchères réelles activables via clé Starkware.

## 🔭 Prochaines étapes suggérées
- Installer `@sorare/crypto` et tester le flux `prepareBid`/`bid` réel sur une petite auction.
- Ajouter une stratégie d'enchère plus fine (anti-snipe en fin d'auction, pas d'incrément configurable).
- Détecter automatiquement les statuts `WON`/`LOST` en fin d'auction (subscription `tokenAuctionWasUpdated`).
- Authentification d'accès optionnelle si exposition publique (hors usage local).
