# Annonce-naissance

Un faire-part de naissance privé, auto-hébergé.

Rail horizontal éditorial sur desktop, feed vertical sur mobile. Liste de naissance partagée en temps réel (SSE). Galerie photos responsive. Mode admin pour les parents. Lien privé régénérable.

## Stack

- **Front** : HTML/CSS/JS vanilla, PWA minimale.
- **Backend** : Node.js 22 + TypeScript + Hono + Drizzle + Postgres 16.
- **Stockage photos** : MinIO (réseau Docker partagé).
- **Reverse proxy** : Caddy 2 (HTTPS auto via Let's Encrypt).
- **Déploiement** : Docker Compose sur VPS.

## Statut

Phase de conception. La spec complète est dans `docs/superpowers/specs/2026-04-22-annonce-naissance-design.md`.

Les fichiers `Annonce-naissance.html`, `app.js`, `styles.css` sont la maquette statique d'origine qui servira de base au front.

## Workspaces

- `web/` — static front (HTML/CSS/JS, served by Caddy).
- `api/` — Node.js + Hono backend, Dockerized.
- `e2e/` — Playwright end-to-end tests.

See `docs/superpowers/specs/2026-04-22-annonce-naissance-design.md` for the full design.

## Operator runbook

**First deploy**

1. Clone the repo onto the VPS and `cd` into it.
2. Create `.env` from the example and fill in the secrets:
   ```bash
   cp .env.example .env
   $EDITOR .env
   ```
3. Generate the admin password hash:
   ```bash
   (cd api && npm install && npm run hash-password -- 'your-admin-password')
   ```
   Copy the pre-formatted `ADMIN_PASSWORD_HASH=$$argon2id$$…` line (with doubled dollar signs — required for docker compose `env_file` interpolation) into `.env`.
4. Make sure the MinIO stack is already running on this host and note its docker network name — set it in `.env` as `MINIO_NETWORK` (default: `minio_default`).
5. Build and start:
   ```bash
   docker compose build
   docker compose up -d
   ```
6. Retrieve the initial access token:
   ```bash
   docker compose logs api | grep "Access token"
   ```
   The token is printed once at first boot. Paste `https://<PUBLIC_HOSTNAME>/?k=<TOKEN>` into WhatsApp/iMessage to share.

**Daily operations**

- Check service health: `docker compose ps` — all four containers should be `healthy` or `running`.
- Inspect logs: `docker compose logs -f --tail 100 api caddy`.
- Backups land in `./backups/annonce-YYYYMMDD-HHMM.dump` daily. 14-day retention is automatic.

**Updating the app**

```bash
git pull
docker compose build api
docker compose up -d api
```

Migrations and seeds re-run idempotently at every boot; the API is served again as soon as the healthcheck passes.

**Rotating the access token**

From `/admin` → "Lien privé" tab → "Régénérer". The old token stops working on the next request. All visitors with the old link see the 404 landing until they get the new link.

**Killing all admin sessions**

From `/admin` → "Sécurité" tab → "Déconnecter toutes les sessions". Your own session is also terminated — you'll need to log back in.

**Restoring from a backup**

```bash
docker compose stop api
cat ./backups/annonce-YYYYMMDD-HHMM.dump | \
  docker compose exec -T postgres pg_restore -U annonce -d annonce -c
docker compose start api
```

Photos in MinIO are backed up by your MinIO stack's own strategy; this only restores the database.

## Smoke test checklist (after first deploy)

Run these checks once, after the first successful `docker compose up`. Each item takes under a minute.

- [ ] `https://<host>/?k=<token>` loads the faire-part and the hero scene shows the seeded placeholder name ("Léonard").
- [ ] `https://<host>/` without the token shows the "Ce faire-part n'existe pas ou plus." neutral landing page.
- [ ] `https://<host>/admin` prompts for the password, accepts it, and opens the six-tab admin panel. The preview iframe on the right shows the public faire-part.
- [ ] Editing a text field in "Textes" updates the preview iframe within ~1 second (live via `postMessage`), and persists after reload.
- [ ] Uploading a JPEG via "Photos" → "Triptyque" finishes within a few seconds, then reloads the preview with the new photo in the triptych. Try a HEIC from an iPhone to verify sharp handles it.
- [ ] From `docker compose exec api node -e "..."` or from MinIO's console, confirm the new photo has 9 objects in `photos/<uuid>/` (thumb/medium/full × avif/webp/jpg), and that `exiftool` on any variant reports no GPS metadata.
- [ ] Open the faire-part in two browsers with the same token. Reserve a gift in one → the other updates within ~1 second (SSE).
- [ ] On a real phone (iOS Safari + Android Chrome), the rail flips to a vertical feed with `scroll-snap-type: y`.
- [ ] "Add to Home Screen" (iOS) / "Install app" (Android) works, the icon matches `web/icons/icon-512.png`, and the app opens in standalone mode.
- [ ] Kill the network on a phone that already visited the site once. Reload — it still loads (PWA offline cache hit).
- [ ] From `/admin` → "Lien privé" → "Régénérer". The old link now returns 404; the new one works.
- [ ] Share the link in a WhatsApp chat. The preview card should show the OG image (`/og.png`) and title.
- [ ] Run the automated E2E suite once:
   ```bash
   cd e2e
   npm run install-browsers    # one-time, ~500 MB Chromium download
   E2E_BASE_URL=https://<host> E2E_TOKEN=<token> npm test
   E2E_BASE_URL=https://<host> E2E_TOKEN=<token> npm run lighthouse
   ```
   Expect 5 Playwright tests pass and Lighthouse scores ≥ 95 on Performance / Accessibility / Best Practices / SEO.

If any item fails, check `docker compose logs -f api caddy` for clues, then append a note to `docs/superpowers/specs/2026-04-22-annonce-naissance-design.md` under a new "## Implementation notes" section describing what you found.
