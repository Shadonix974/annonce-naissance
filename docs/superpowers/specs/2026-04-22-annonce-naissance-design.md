# Annonce-naissance — Spec de conception

**Date** : 2026-04-22
**Auteur** : brainstorming collaboratif
**Statut** : en revue

---

## 1. Contexte

Le projet existant (`Annonce-naissance.html`, `styles.css`, `app.js`) est une maquette statique élégante présentant un faire-part de naissance façon rail horizontal à 11 scènes éditorial. Tout est hardcodé côté client : les textes dans `TWEAK_DEFAULTS`, les cadeaux dans `state.gifts`, les messages du livre d'or dans `state.messages`, les photos sous forme de placeholders CSS. Aucune persistance, aucun backend, aucune interactivité partagée entre visiteurs.

L'objectif de cette itération est de transformer la maquette en un **vrai faire-part privé en ligne**, partageable via un lien unique, avec :

- une **liste de naissance partagée en temps réel** (les visiteurs voient ce qui a déjà été réservé) ;
- une **vraie galerie photos** servie en qualité responsive ;
- un **mode admin** pour les parents (édition des textes, upload des photos, gestion des cadeaux, rotation du lien privé) ;
- une **protection par lien privé** (pas indexé, pas public).

La scène 08 « Livre d'or » est **supprimée** : demande explicite de l'utilisateur.

Audience visée : la famille et les proches des parents (30-50 personnes), accès via un lien partagé par SMS/WhatsApp. Pas de SaaS, pas de multi-tenant — **une seule naissance**.

## 2. Portée

### Dans la portée (V1)

- Liste de naissance partagée (B1) avec mises à jour temps réel via SSE.
- Galerie photos hébergée (B2) avec pipeline de traitement `sharp` (3 tailles × 3 formats).
- Mode admin (B3) : édition des textes, upload/réordonnement/suppression des photos, gestion des cadeaux et de la chronologie, rotation du token d'accès, déconnexion.
- Lien privé (B6) : token global unique en DB, URL d'accès `?k=…`, révocable/régénérable depuis l'admin.
- Adaptation mobile : rail horizontal desktop, feed vertical mobile (`@media max-width: 820px`).
- PWA minimale : manifest, icônes, service worker pour consultation hors-ligne.
- Meta OpenGraph/Twitter pour les aperçus de partage (WhatsApp, iMessage, etc.).
- Non-indexation (`robots: noindex, nofollow`).

### Hors portée (YAGNI)

- Multi-faire-part (SaaS multi-famille).
- Livre d'or (retiré explicitement).
- RSVP / gestion des visites (B4, écarté).
- Notifications aux parents (B5, écarté).
- Analytics (R6, écarté).
- Internationalisation FR/EN (R7, écarté — FR uniquement).
- Magic link email, OAuth, passkeys (N2/N3 écartés — handler maison suffit).
- Paiement cagnotte, téléchargement PDF, mode clair, AR.

## 3. Décisions clés et rationale

| # | Décision | Alternatives considérées | Rationale |
|---|---|---|---|
| D1 | **Ambition A** (faire-part personnel, polish) puis pivot partiel pour backend | B (multi-famille), C (SaaS) | Une seule naissance, usage personnel. |
| D2 | **Pas de livre d'or** | Livre d'or avec backend | Demande utilisateur explicite. |
| D3 | **Photos** : dossier source admin upload + traitement backend (U1) | P1 (dossier statique), U2 (presigned MinIO), U3 (upload brut) | UX admin la plus simple, responsive images gratuites, MinIO privé. |
| D4 | **Stack backend** : Node.js 22 + TypeScript + Hono + Drizzle + Postgres 16 | Supabase, Cloudflare Workers + D1, Express, FastAPI, Go | Auto-hébergement sur VPS existants dockerisés, MinIO déjà en place, langage cohérent avec le front. |
| D5 | **Auth admin** : handler maison (N1) ~40 lignes, cookie signé HttpOnly | N2 (BetterAuth), N3 (BetterAuth + passkeys) | 2 admins, 1 secret partagé, pas de reset password — une lib d'auth serait de l'over-engineering. |
| D6 | **Lien privé** : token global en DB, régénérable (L1) | L2 (slug + token), L3 (password à l'entrée), L4 (multi-tokens) | Distribution SMS/WhatsApp suffisante, révocation simple en cas de fuite. |
| D7 | **Mobile** : `@media (max-width: 820px)` → feed vertical (M2) | M1 (rail horizontal partout), M3 (design différent) | Rail horizontal inapproprié en portrait, mais le design mérite d'être préservé en cinéma desktop. |
| D8 | **Temps réel** : SSE (Server-Sent Events) via Hono `streamSSE` | Polling 10 s, WebSocket, aucun | Read-mostly, réservation de cadeau idéale pour du push unidirectionnel. |
| D9 | **PWA** : manifest + SW stale-while-revalidate | Aucune PWA | ~80 lignes pour une vraie valeur mobile (installable, offline). |
| D10 | **Reverse proxy** : Caddy 2 | Traefik, nginx+certbot | Auto-HTTPS, config courte, lisible. |
| D11 | **Domaine** : nouveau `.fr` dédié | Sous-domaine existant, IP brute | UX partage. |
| D12 | **SEO** : `noindex, nofollow` + OG tags | Indexation publique | Contenu privé. |
| D13 | **Analytics** : aucun | Plausible, compteur simple | Cohérent avec caractère privé. |
| D14 | **i18n** : FR uniquement | FR + EN | Pas de famille anglophone. |
| D15 | **Proxification photos via API** | Exposition MinIO directe | Permet d'exiger le token `?k=…` pour servir les images, évite CORS, MinIO reste privé. |

## 4. Architecture

```
Internet
   │
   ▼  HTTPS :443  (Let's Encrypt auto)
┌──────────┐
│  caddy   │   reverse proxy, TLS, CSP, static serving, compression
└─────┬────┘
      │
      ├──► static files (/, /admin, *.css, *.js, fonts, icons) — servis directement
      │
      ├──► /api/*     ──► ┌─────────────┐
      │                   │  api        │  Hono + TS + Drizzle + pino
      │                   │  Node 22    │  port 3000 interne
      │                   └──┬───────┬──┘
      │                      │       │
      │                      │       └──► MinIO (container existant, réseau partagé)
      │                      │                bucket `annonce-leonard`
      │                      │
      │                      └──► Postgres 16 (nouveau container, réseau privé)
      │
      └──► /photos/*  ──► api (streaming signé depuis MinIO, cache 1 an)
```

### 4.1 Containers

| Container | Image | Rôle |
|---|---|---|
| `caddy` | `caddy:2-alpine` | Reverse proxy, TLS Let's Encrypt, static serving, CSP, compression br/gzip |
| `api` | build local multi-stage Node 22 | Hono + Drizzle, migrations au boot, SSE, pipeline photo `sharp` |
| `postgres` | `postgres:16-alpine` | Base de données |
| `backup` | `postgres:16-alpine` | Sidecar `pg_dump` quotidien, rétention 14 jours |
| `minio` | existant, non géré par ce compose | Stockage objet, rejoint via réseau Docker externe |

### 4.2 Réseaux

- `annonce-net` (bridge) : caddy ↔ api ↔ postgres ↔ backup.
- `minio-net` (externe) : api ↔ minio, via le réseau existant du compose MinIO.

### 4.3 Volumes

- `caddy_data`, `caddy_config` : certificats Let's Encrypt.
- `postgres_data` : données Postgres.
- Bind mount `./web:/srv/web:ro` : front statique servi par Caddy.
- Bind mount `./backups:/backups` : dumps pg_dump.

## 5. Modèle de données

### 5.1 Postgres — schéma DDL

```sql
-- Textes éditables (clé/valeur pour ajout de champs sans migration)
CREATE TABLE tweaks (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton de réglages globaux
CREATE TABLE settings (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token     TEXT NOT NULL,
  token_rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Photos (les variantes vivent en MinIO, clés dérivées de l'UUID)
CREATE TABLE photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section     TEXT NOT NULL CHECK (section IN ('triptych','gallery')),
  position    INTEGER NOT NULL DEFAULT 0,
  alt         TEXT NOT NULL DEFAULT '',
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  blurhash    TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX photos_section_pos ON photos(section, position);

-- Liste de naissance
CREATE TABLE gifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  range_text  TEXT NOT NULL,
  url         TEXT,
  photo_id    UUID REFERENCES photos(id) ON DELETE SET NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  taken_by    TEXT,
  taken_note  TEXT,
  taken_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gifts_position ON gifts(position);

-- Chronologie (scène 06)
CREATE TABLE timeline_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_label TEXT NOT NULL,
  text       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  is_now     BOOLEAN NOT NULL DEFAULT false
);

-- Sessions admin (DB-backed pour révocation facile)
CREATE TABLE admin_sessions (
  token      TEXT PRIMARY KEY,           -- 32 octets base64url
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT
);
CREATE INDEX sessions_expires ON admin_sessions(expires_at);
```

### 5.2 MinIO — convention des objets

Bucket unique `annonce-leonard`, clés dérivées de l'UUID de `photos` :

```
photos/{uuid}/thumb.avif     ~40 Ko
photos/{uuid}/thumb.webp     ~50 Ko
photos/{uuid}/thumb.jpg      ~60 Ko (fallback)
photos/{uuid}/medium.avif    ~120 Ko
photos/{uuid}/medium.webp
photos/{uuid}/medium.jpg
photos/{uuid}/full.avif      ~400 Ko
photos/{uuid}/full.webp
photos/{uuid}/full.jpg
```

Sizes cibles : thumb=400w, medium=1200w, full=2000w. Largeur maximale ; la hauteur suit le ratio d'origine (avec `withoutEnlargement: true`).

### 5.3 Seeds initiaux

Exécutés **une seule fois** au premier démarrage si les tables sont vides :

- `tweaks` : valeurs actuelles de `TWEAK_DEFAULTS` (app.js:5-20) — placeholders type `babyName: "Léonard"`. L'utilisateur les personnalisera via l'admin.
- `settings` : ligne unique, `access_token = randomBytes(18).toString('base64url')` imprimé dans les logs du container au boot.
- `gifts` : valeurs actuelles de `state.gifts` (app.js:42-49).
- `timeline_events` : extraits du HTML actuel (index.html:170-190).
- `photos` : vide, remplie via admin après déploiement.

L'access token initial imprimé au boot ressemble à :
```
🔑 Access token généré: a3B7k_2p-mX9... — régénérable depuis /admin
```

## 6. API

Base URL : `https://leonard.tondomaine.fr/api` (exemple).

### 6.1 Tableau des routes

| Méthode | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/state` | token | État initial (tweaks, photos, gifts, timeline) |
| `GET` | `/api/stream` | token | SSE : événements `gift.*` |
| `POST` | `/api/gifts/:id/reserve` | token | `{ name, note? }` → réserve un cadeau |
| `POST` | `/api/gifts/:id/unreserve` | token | `{ name }` → annule si c'est la même personne |
| `GET` | `/photos/:id/:size.:ext` | token | Stream signé depuis MinIO, cache 1 an |
| `POST` | `/api/admin/login` | — | `{ password }` → cookie HttpOnly |
| `POST` | `/api/admin/logout` | admin | Efface le cookie + delete session DB |
| `GET` | `/api/admin/me` | admin | Sanity check session |
| `PATCH` | `/api/admin/tweaks` | admin | Partial patch du dict tweaks |
| `POST` | `/api/admin/photos` | admin | multipart/form-data → traitement sharp |
| `PATCH` | `/api/admin/photos/:id` | admin | Alt, position, section |
| `DELETE` | `/api/admin/photos/:id` | admin | DB row + 9 objets MinIO |
| `POST` | `/api/admin/gifts` | admin | Créer un cadeau |
| `PATCH` | `/api/admin/gifts/:id` | admin | Mettre à jour |
| `DELETE` | `/api/admin/gifts/:id` | admin | Supprimer |
| `POST` | `/api/admin/gifts/:id/force-unreserve` | admin | Override parent |
| `POST` | `/api/admin/timeline` | admin | Créer événement |
| `PATCH` | `/api/admin/timeline/:id` | admin | Mettre à jour |
| `DELETE` | `/api/admin/timeline/:id` | admin | Supprimer |
| `POST` | `/api/admin/access-token/rotate` | admin | Régénère le token |
| `GET` | `/api/admin/access-link` | admin | URL complète prête à partager |
| `GET` | `/healthz` | — | Probe Docker |

### 6.2 Middlewares d'auth

**`requireAccessToken`** : lit le token dans `X-Access-Token` header (priorité) ou `?k=` query param (fallback pour la 1ʳᵉ visite). Compare en temps constant avec `settings.access_token`. Si invalide/absent → `404 { error: "not_found" }` (pas 401, pour ne pas révéler l'existence du site).

**`requireAdmin`** : lit le cookie signé `admin_session`, cherche la session en DB, vérifie `expires_at > now()`, met à jour `last_seen`. Attache la session au contexte Hono. Si invalide → `401 { error: "unauthorized" }` + suppression du cookie.

### 6.3 SSE — canal `/api/stream`

Mono-process, `EventEmitter` Node natif, `Hono.streamSSE`. Events :

- `gift.reserved` → `{ id, taken_by, taken_note, taken_at }`
- `gift.unreserved` → `{ id }`
- `gift.created` → `{ gift }`
- `gift.updated` → `{ gift }`
- `gift.deleted` → `{ id }`
- `ping` (heartbeat 30 s, évite timeout Caddy)

Reconnexion automatique côté navigateur via `EventSource`.

### 6.4 Upload photo — pipeline `sharp`

1. Parse multipart, limite 15 Mo, MIME whitelist `[jpeg, png, webp, heic, heif]`.
2. `sharp(buf).rotate()` (applique EXIF orientation puis strip toutes les metadata).
3. `metadata()` → `width`, `height`.
4. 3 tailles × 3 formats = 9 variantes générées en parallèle.
5. Blurhash calculé sur un thumb 64w JPEG (~28 caractères).
6. `Promise.all` upload MinIO.
7. `INSERT INTO photos RETURNING *`.
8. Réponse 201 + row.

Cible : < 4 s pour une HEIC 10 Mo iPhone.

### 6.5 Validation et erreurs

- `@hono/zod-validator` sur toutes les entrées.
- `app.onError((err, c) => ...)` centralisé.
- Classes d'erreur : `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ValidationError`.
- Logs JSON via `pino`, un log par requête avec correlation ID.
- Rate-limit minimal : 10 tentatives / 15 min / IP uniquement sur `POST /api/admin/login`.

## 7. Front-end

### 7.1 Arborescence

```
web/
├── index.html              ← transformé depuis Annonce-naissance.html
├── admin.html              ← nouveau
├── styles.css              ← étendu avec media query mobile
├── app.js                  ← fetch state + SSE + SW reg
├── admin.js                ← nouveau
├── admin.css               ← nouveau
├── sw.js                   ← nouveau (PWA)
├── manifest.webmanifest    ← nouveau
├── icons/                  ← favicon, apple-touch, 192/512, og.png
└── fonts/                  ← optionnel : auto-hébergement pour fuite zéro referrer
```

### 7.2 Bascule horizontal/vertical (M2)

Media query `@media (max-width: 820px)` :
- `.rail` passe en `flex-direction: column`, `scroll-snap-type: y mandatory`.
- `.scene` garde `100vw` en largeur, hauteur `100svh`.
- Navigation prev/next devient haut/bas.
- La détection de scène active lit `getComputedStyle(rail).flexDirection` et choisit `scrollTop` ou `scrollLeft`.

### 7.3 Flux d'initialisation

```
DOMContentLoaded
  → readTokenFromURLorStorage()     // ?k= consommé via history.replaceState, persisté en localStorage
  → fetch('/api/state', { X-Access-Token: token })
      → 404 → showPrivateLanding()  // page neutre, pas d'info sur le faire-part
      → 200 → applyTweaks() + applyTimeline() + renderPhotos() + renderGifts() + subscribeSSE() + registerServiceWorker()
```

### 7.4 Réservation de cadeau

Le clic sur un cadeau ouvre un modal : saisie du prénom (obligatoire) + note (optionnelle). `POST /api/gifts/:id/reserve` avec un update optimiste, rollback si erreur. L'API émet `gift.reserved`, le SSE pousse vers tous les visiteurs. L'UI change en douceur (animation cross-fade).

Annulation : l'ID du cadeau réservé est stocké en `localStorage` ; l'utilisateur ne peut annuler que depuis le même device/navigateur. Sinon, les parents font un `force-unreserve` depuis l'admin.

### 7.5 Mode admin — page `/admin`

Layout deux colonnes : formulaire éditable à gauche, preview iframe (`/?k=<token>`) à droite.

Sections (onglets ou accordion) :
1. **Textes** : champs tweaks avec labels clairs, swatches d'accent.
2. **Photos** : drag-drop + `<input type="file" multiple>`, section picker (triptyque/galerie), alt text obligatoire, réordonnement par drag, suppression avec confirmation, barre de progression pendant sharp.
3. **Cadeaux** : liste inline éditable + bouton "Ajouter", force-unreserve par cadeau.
4. **Chronologie** : liste des `timeline_events`, ajout/suppression, toggle `is_now`.
5. **Lien privé** : URL complète + copier + régénérer (avec warning explicite).
6. **Sécurité** : "Déconnecter toutes les sessions".

Le mécanisme `postMessage` existant (app.js:270-278) est **réutilisé** pour piloter la preview iframe en live pendant l'édition (debounce 500 ms côté front).

### 7.6 PWA

- `manifest.webmanifest` avec icônes 192/512, `display: standalone`, `theme_color`, `background_color`.
- `sw.js` ~70 lignes :
  - Install : pré-cache `/`, `/styles.css`, `/app.js`, `/manifest.webmanifest`, fonts.
  - Fetch :
    - `/api/state` : network-first, cache fallback (permet offline après 1ʳᵉ visite).
    - `/photos/*` : cache-first, TTL long.
    - Assets : stale-while-revalidate.
    - `/api/admin/*`, `/api/stream` : pas de cache (online only).
- `registerServiceWorker()` appelé après le premier render réussi.

### 7.7 SEO / OG

Dans le `<head>` de `index.html` :
- `<meta name="robots" content="noindex, nofollow">`
- OG : `og:title`, `og:description`, `og:image` (1200×630), `og:type`.
- Twitter : `twitter:card: summary_large_image`.
- Favicon SVG + apple-touch-icon.
- `og.png` régénérable depuis l'admin à partir d'une photo existante.

## 8. Déploiement

### 8.1 Arborescence VPS

```
/opt/annonce-leonard/
├── docker-compose.yml
├── .env                      (chmod 600, non commité)
├── Caddyfile
├── caddy_data/               (volume auto)
├── caddy_config/
├── postgres_data/            (volume)
├── api/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── src/
├── web/
│   ├── index.html, admin.html, styles.css, app.js, admin.js, admin.css
│   ├── sw.js, manifest.webmanifest
│   └── icons/
└── backups/                  (dumps quotidiens)
```

### 8.2 `docker-compose.yml`

Services : `caddy`, `api`, `postgres`, `backup`. Réseau interne `annonce-net` + réseau externe `minio-net` (celui du compose MinIO existant). Healthchecks sur api et postgres. Volumes nommés pour la DB et les certs Let's Encrypt.

### 8.3 `Caddyfile`

Pour `leonard.tondomaine.fr` (exemple) :
- Encodage zstd/gzip.
- Headers : HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, **CSP stricte** (pas de `unsafe-inline` script).
- Matcher `@sse path /api/stream` → `flush_interval -1` + timeouts désactivés.
- `/api/*` → reverse proxy `api:3000`.
- `/photos/*` → reverse proxy + `Cache-Control: public, max-age=31536000, immutable`.
- `/admin*` → served from `/srv/web/admin.html`, `Cache-Control: no-store`.
- Reste (`/`, `/*.css`, `/*.js`, fonts) → served from `/srv/web`, immutable sur les assets, no-cache sur les HTML.
- Service worker (`/sw.js`) : `Cache-Control: no-cache`.

### 8.4 `.env` (modèle)

```ini
DB_PASSWORD=<32 caractères aléatoires>
ADMIN_PASSWORD_HASH=<argon2id — sortie de `npm run hash-password`>
SESSION_SECRET=<32 caractères aléatoires>
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=<console MinIO>
MINIO_SECRET_KEY=<console MinIO>
LOG_LEVEL=info
```

Un `.env.example` commité avec valeurs vides.

### 8.5 `api/Dockerfile` (multi-stage)

Build stage : `node:22-alpine` + `vips-dev` pour compiler `sharp`, `npm ci`, `npm run build`, `npm prune --production`.
Runtime stage : `node:22-alpine` + `vips` + `tini`, COPY node_modules + dist + migrations, `USER node`, `CMD ["node", "dist/index.js"]`. Les migrations drizzle tournent en prestart, idempotentes.

Image runtime cible : ~120 Mo.

### 8.6 Workflow

**Premier déploiement** :
```bash
git clone … /opt/annonce-leonard && cd /opt/annonce-leonard
cp .env.example .env && $EDITOR .env
docker compose build
docker compose up -d
docker compose logs -f api    # noter l'access token initial
```

**Mise à jour** :
```bash
git pull
docker compose build api
docker compose up -d api
```

### 8.7 Backups

Container `backup` : `pg_dump -F c` quotidien dans `./backups/annonce-YYYYMMDD-HHMM.dump`, rétention 14 jours. Photos sauvegardées par la stratégie MinIO existante.

## 9. Non-fonctionnels

### 9.1 Performance — cibles

| Métrique | Cible |
|---|---|
| LCP (4G) | < 1,2 s |
| CLS | < 0,05 |
| INP | < 200 ms |
| Bundle JS initial gzipped | < 40 Ko |
| Upload photo HEIC 10 Mo → 9 variantes | < 4 s |

Optimisations : preload de la WOFF2 Cormorant Regular, `font-display: swap`, CSS critique inliné, lazy-load des scènes ≥ 3, `aspect-ratio` sur les `<img>` pour éviter le CLS.

### 9.2 Accessibilité

- `prefers-reduced-motion: reduce` : désactive transitions + snap libre.
- Focus visible 2 px gold + offset 4 px sur tous les interactifs.
- Chaque `.scene` : `role="region"` + `aria-label` depuis `data-screen-label`.
- Navigation clavier : Arrow L/R (horizontal), Arrow Up/Down (vertical), Home/End.
- Alt text obligatoire à l'upload (formulaire admin rejette si vide).
- Audit `axe-core` dans les tests E2E, zéro violation AA.

### 9.3 Sécurité

| Surface | Mitigation |
|---|---|
| Brute-force login admin | Argon2id + délai aléatoire 300-600 ms + rate-limit 10/15 min/IP |
| XSS | CSP stricte côté Caddy, tout user content rendu via `textContent` |
| CSRF admin | Cookie `SameSite=Strict` + check `Origin` sur mutations admin |
| Fuite access token | Header `X-Access-Token`, URL nettoyée via `history.replaceState` |
| SQL injection | Drizzle = queries paramétrées par design |
| SSRF via photos | Clés MinIO connues seulement, pas d'URL externe acceptée |
| EXIF leak (geolocation iPhone) | `sharp.rotate()` strip EXIF par défaut |
| Upload malveillant | MIME whitelist + décodage sharp (crash → 400) |
| Admin session volée | Rotation `SESSION_SECRET` = invalidation totale + bouton "Déconnecter toutes sessions" |
| Secrets dans git | `.env` dans `.gitignore`, pre-commit gitleaks recommandé |

### 9.4 Tests

- **Vitest** (API) : endpoints critiques, réservation idempotente, auth admin, upload photo, rotation token, RLS access token. Postgres de test via `testcontainers`.
- **Playwright** (E2E minimal) : happy path, navigation clavier, réservation d'un cadeau avec API mock. 1 spec, ~5 scénarios.
- **Lighthouse CI** local : Perf ≥ 95, A11y ≥ 95, BP ≥ 95, SEO ≥ 95.
- **axe-core** dans Playwright : zéro violation AA.
- **CI** (actions/forgejo) : lint, typecheck, test:api, test:e2e, build docker. Déploiement manuel.

### 9.5 Observabilité

- `pino` JSON côté API, correlation ID par requête.
- Caddy logs JSON.
- Lecture : `docker compose logs -f --tail 100 api caddy`.
- Loki + Grafana possibles plus tard, hors V1.

### 9.6 Test de charge informel

Avant le jour de partage du lien : ouvrir manuellement 30 onglets simultanément, vérifier que SSE + `/api/state` tiennent. Pas de load test formel requis.

## 10. Migration depuis l'existant

| Existant | Destination | Transformation |
|---|---|---|
| `Annonce-naissance.html` | `web/index.html` | + OG tags, manifest link, renommage, suppression scène 08 |
| `styles.css` | `web/styles.css` | + media query M2, + `prefers-reduced-motion`, suppression styles guestbook |
| `app.js` | `web/app.js` | Suppression `TWEAK_DEFAULTS`/`state.messages`/`state.gifts` hardcodés ; fetch `/api/state` ; SSE ; SW reg |
| — | `web/admin.html`, `web/admin.js`, `web/admin.css` | Nouveaux |
| — | `web/sw.js`, `web/manifest.webmanifest`, `web/icons/` | Nouveaux |
| — | `api/` | Tout nouveau |

**Code conservé tel quel** : `applyTweaks`, `updateActiveScene`, `goTo`, `syncSceneChrome`, toute la logique Web Audio (`toggleMusic`, `startMusic`, `stopMusic`), mécanisme `postMessage` / `__edit_mode_*` (réutilisé pour la preview admin).

**Code retiré** : `TWEAK_DEFAULTS`, `state.messages`, `renderMessages`, `handleGuestSubmit`, scène 08 HTML/CSS, `buildTweaksPanel`, `<aside id="tweaks">`.

**Données initiales** : les valeurs hardcodées actuelles deviennent les seeds Postgres V1 (idempotent — seed uniquement si tables vides). L'utilisateur personnalise ensuite via `/admin`.

## 11. Critères d'acceptation

### Fonctionnels

- [ ] Un visiteur avec le bon `?k=…` voit le faire-part dans sa version placeholder.
- [ ] Un visiteur sans token voit une page neutre 404.
- [ ] Un visiteur peut réserver un cadeau en saisissant son prénom.
- [ ] Deux visiteurs simultanés voient les réservations de l'autre en < 1 s (SSE).
- [ ] Les parents peuvent se connecter à `/admin` avec le mot de passe.
- [ ] Les parents peuvent modifier un texte et voir le changement live dans la preview iframe.
- [ ] Les parents peuvent uploader une photo, la voir en galerie en 3 tailles × 3 formats.
- [ ] Les parents peuvent régénérer l'access token et constater l'invalidation des anciens liens.
- [ ] Le faire-part s'affiche correctement en rail horizontal sur desktop (≥ 821 px).
- [ ] Le faire-part s'affiche correctement en feed vertical sur mobile portrait (iPhone SE 375px, Android standard).
- [ ] Le partage WhatsApp affiche une vignette avec OG tags.
- [ ] Le faire-part est consultable offline après une 1ʳᵉ visite (PWA).
- [ ] Le faire-part est installable comme PWA sur iOS/Android.

### Non-fonctionnels

- [ ] Lighthouse Perf ≥ 95, A11y ≥ 95, BP ≥ 95, SEO ≥ 95 sur la home.
- [ ] Zéro violation AA `axe-core`.
- [ ] LCP mesuré < 1,2 s sur Moto G4 (simulation DevTools).
- [ ] CSP stricte sans `unsafe-*` appliquée par Caddy.
- [ ] Secrets absents du git (vérifié par gitleaks).
- [ ] `pg_dump` quotidien créé, rétention 14 j.

## 12. Risques et questions ouvertes

### Risques

- **Connexions SSE simultanées** : cap mono-process ~500 connexions. Largement suffisant pour 50 visiteurs, mais test manuel à 30 onglets avant le jour J.
- **Upload HEIC sur Safari iOS** : `sharp` supporte HEIC en lecture si `libheif` présent dans l'image Docker. À vérifier pendant le build.
- **Token dans le Referer** : si un utilisateur clique un lien externe depuis le faire-part (peu probable, il n'y en a pas), le Referer pourrait contenir `?k=`. Mitigation : `Referrer-Policy: strict-origin-when-cross-origin` envoyé par Caddy.
- **EXIF stripping** : vérifier par test unitaire qu'un JPG avec GPS en entrée ne conserve aucune latitude/longitude dans ses variantes.

### Questions ouvertes — aucune bloquante

Toutes les décisions clés sont prises. Les choix résiduels (nom exact du domaine, valeurs des seeds, design exact du modal de réservation) sont des décisions d'implémentation, pas de design.

## 13. Prochaines étapes

1. Utilisateur relit et valide cette spec.
2. Invocation de la skill `writing-plans` pour produire le plan d'implémentation détaillé par étapes vérifiables.
3. Exécution du plan (sessions courtes, checkpoints).
