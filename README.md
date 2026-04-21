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
