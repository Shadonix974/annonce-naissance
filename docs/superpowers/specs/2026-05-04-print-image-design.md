# Téléchargement image PNG (admin) — Design Spec

**Date:** 2026-05-04
**Auteur:** Olivier (brainstorm avec Claude)
**Statut:** Approuvé — prêt pour plan d'implémentation

---

## 1. Contexte et objectif

L'admin propose actuellement (onglet "Print") deux boutons "Télécharger PDF A4" et "Télécharger PDF Letter". Le PDF est généré côté serveur via Playwright + Chromium headless (`api/src/lib/print-pdf.ts`), qui navigue sur `/print?k=<token>` et appelle `page.pdf({ format })` en émulant le média `screen`.

**Problèmes observés :**

- Le PDF résultant **bug visuellement quand l'utilisateur scrolle** dans son lecteur PDF (rendu vectoriel partiel, repaint qui rame).
- Le format PDF n'est pas adapté au **partage numérique** (WhatsApp, SMS) qui est l'usage principal — un faire-part de naissance se diffuse aux proches en image, pas en PDF imprimable.
- Le passage par `@media print` aplatit la rotation (-1.6deg), l'ombre douce et le washi tape doré — on perd l'esthétique soignée visible à l'écran.

**Objectif :** remplacer la génération PDF par une **image PNG haute résolution** qui capture exactement le rendu écran de la page `/print` (avec rotation, ombre, washi tape, fond papier), au format **1500×1875 px (ratio 4:5)**, idéal pour partage messageries et réseaux.

---

## 2. Architecture

Trois zones touchées : génération backend, endpoint API, UI admin. Plus les tests.

### 2.1 Génération backend (`api/src/lib/`)

Renommer `print-pdf.ts` → `print-image.ts`. Garder l'infrastructure Playwright headless existante (`chromium.launch`, `--no-sandbox`, `--disable-dev-shm-usage`).

Signature publique :

```ts
export async function renderPrintImage(url: string): Promise<Buffer>
```

Plus de paramètre `format` (plus de notion A4/Letter). Le `Buffer` retourné contient un PNG.

**Différences avec l'implémentation PDF actuelle :**

| Étape                     | PDF (actuel)                                            | Image (nouveau)                                              |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `newContext` viewport     | défaut                                                  | `{ width: 500, height: 625 }`, `deviceScaleFactor: 3`        |
| `emulateMedia`            | `'screen'`                                              | `'screen'` (inchangé)                                        |
| `goto`                    | `waitUntil: 'networkidle'`, timeout 30s                 | inchangé                                                     |
| `waitForTimeout`          | 500 ms (fonts Google + decode photo)                    | inchangé                                                     |
| Capture                   | `page.pdf({ format, printBackground, margin: 0 })`      | `page.screenshot({ type: 'png', fullPage: false })`          |

**Pourquoi viewport `500×625` × DSF 3 ?** Le polaroid CSS a `max-width: 440px` et un ratio approximatif 4:5 (photo carrée 440px + caption ~280px = ~720px de hauteur totale, plus marges papier). Un viewport `500×625` cadre le polaroid avec ~30 px de respiration de chaque côté. Le `deviceScaleFactor: 3` produit un rendu retina natif → 1500×1875 sans agrandissement bitmap.

### 2.2 Endpoint API (`api/src/routes/admin/print.ts`)

Remplacer la route `GET /pdf?format=a4|letter` par `GET /image` (même middleware `requireAdmin`, même check token).

```
GET /api/admin/print/image
→ 200 image/png
   Content-Disposition: attachment; filename="annonce-naissance-<slug>.png"
   Cache-Control: no-store
```

**Nom de fichier :** `annonce-naissance-<slug>.png` où `<slug>` est le `babyName` lowercased + accents retirés + non-alpha → `-`. Exemple générique : `Éloïse-Marie` → `annonce-naissance-eloise-marie.png`. Si `babyName` est vide ou indisponible, fallback `annonce-naissance.png`.

**Source du `babyName` :** lu depuis la table `tweaks` (clé `"babyName"`), même source que celle exposée par `GET /api/print/state` aux recipients de la page print (cf `api/src/routes/print.ts:15`). Lecture directe via `db.select().from(tweaks).where(eq(tweaks.key, "babyName"))`.

### 2.3 UI admin (`web/admin.js`, fonction `renderPrintTab`)

Dans l'onglet print :

**Supprimer :**
- La section `Télécharger en PDF` (titre + 2 boutons + note)
- La fonction `downloadPdf(format, btn)`

**Ajouter :**
- Section `Télécharger l'image` avec 1 bouton `Télécharger l'image (PNG)`
- Note d'aide : *"Image PNG haute résolution (1500×1875). Idéale pour partage WhatsApp, SMS, ou impression à la maison."*
- Fonction `downloadImage(btn)` analogue à `downloadPdf` :
  - `fetch('/api/admin/print/image')`
  - États visuels : `Génération…` / `Erreur <status>` / `Téléchargé ✓`
  - Récupère le filename depuis le header `Content-Disposition` si présent (sinon fallback `annonce-naissance.png`)

### 2.4 Tests (`api/test/print.test.ts`)

Adapter les tests existants :
- Ceux qui testent `GET /api/admin/print/pdf` → retester `GET /api/admin/print/image`
- Assertions :
  - `Content-Type: image/png` (au lieu de `application/pdf`)
  - Magic bytes PNG (`\x89PNG\r\n\x1a\n` = 8 premiers octets) au lieu de `%PDF`
  - Header `Content-Disposition` contient `.png` et `attachment`
- Conserver intacts :
  - Test que sans cookie admin → 401
  - Test que sans print token initialisé → 500 ou erreur explicite
- Supprimer le test du paramètre `?format=` invalide (n'existe plus)

---

## 3. Flux utilisateur

1. Admin ouvre l'onglet "Print"
2. Clique "Télécharger l'image (PNG)"
3. Bouton passe à `Génération…`, le navigateur attend ~3 s
4. Le serveur :
   1. Récupère le print token
   2. Lance Chromium headless, navigue sur `/print?k=<token>` avec viewport `500×625` DSF 3
   3. Attend `networkidle` + 500 ms
   4. `page.screenshot({ type: 'png' })` → buffer
   5. Stream la réponse avec `Content-Type: image/png`
5. Le navigateur télécharge `annonce-naissance-<slug>.png`
6. Bouton passe à `Téléchargé ✓` puis revient à l'état normal après 1.5 s

---

## 4. Hors scope

- **Pas de bouton public** sur la page `/print` (la génération reste admin only, comme pour le PDF)
- **Pas de version JPEG/WebP** en parallèle — un seul format pour rester simple
- **Pas de cache** de l'image générée — la photo de couverture peut changer, on régénère à la demande comme aujourd'hui
- **Pas de version A4/Letter exact** — l'utilisateur a tranché que l'usage est partage numérique, pas impression précise format papier
- **Pas de migration de l'URL** `/pdf` vers `/image` avec rewrite/redirect — c'est une route admin, jamais bookmarkée externement, on assume qu'aucun client externe n'en dépend

---

## 5. Risques et points d'attention

- **Polices Google Fonts** : `Italianno`, `Cormorant Garamond`, `JetBrains Mono` chargées via `fonts.googleapis.com`. Le `waitForTimeout(500)` après `networkidle` est notre garantie qu'elles sont rendues. Si en pratique on observe des flashes de police fallback, augmenter à 1000 ms ou explicitement `await page.evaluate(() => document.fonts.ready)`.
- **Photo de couverture** : si elle est servie depuis MinIO et que le réseau Docker introduit de la latence, le `networkidle` doit suffire. À surveiller au premier test manuel.
- **Cadrage du viewport** : `500×625` est calibré pour le polaroid actuel (`max-width: 440px`). Si le design CSS du polaroid change (ex : `max-width` augmenté), il faudra réajuster le viewport. **Pas une régression bloquante** — visible immédiatement à l'œil sur le PNG.
- **Renommage du fichier** : `print-pdf.ts` → `print-image.ts` casse l'import dans `api/src/routes/admin/print.ts`. À mettre à jour dans le même commit. Aucun autre import à craindre (`grep` confirmera).
