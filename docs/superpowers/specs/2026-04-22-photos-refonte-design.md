# Refonte de la gestion des photos — Design Spec

**Date:** 2026-04-22
**Auteur:** Olivier (brainstorm avec Claude)
**Statut:** Approuvé — prêt pour plan d'implémentation

---

## 1. Contexte et objectif

L'admin actuel gère les photos via un formulaire simple (fichier + alt + slot) et propose une édition minimale (`prompt()` JS natif). Les photos sont uploadées brutes, puis le backend Sharp génère 9 variantes + blurhash. Problèmes observés :

- **Upload sans contrôle du cadrage** — l'utilisateur ne choisit pas la zone visible de la photo, le serveur centre-crop en aveugle.
- **Pas de recadrage a posteriori** — une fois uploadée, impossible de recadrer sans réuploader.
- **Pas de feedback visuel** — l'admin affiche une liste verticale sans preview côte-à-côte.
- **UX mobile inexistante** — les photos seront prises au téléphone, l'admin doit s'utiliser depuis un mobile.
- **Scene 07 (galerie publique) est une grille carrée** — pas de rendu masonry alors que les photos ont des ratios variés.

**Objectif :** offrir un workflow admin moderne (drag & drop, crop interactif, recrop non destructif, drag-to-reorder, galerie publique en masonry) qui fonctionne aussi bien sur desktop que sur mobile.

---

## 2. Architecture générale

Trois couches :

### 2.1 Frontend admin (`web/admin.js`, `web/admin.css`, `web/admin.html`)

- Nouveau modal de crop basé sur **Cropper.js** (import dynamique depuis `/vendor/`).
- Dropzone multi-fichiers (`<input type="file" multiple accept="image/*" capture="environment">`).
- Queue de crop séquentielle (un fichier à la fois dans le modal).
- Grid de photos avec drag-to-reorder via **SortableJS**.
- Bouton **✂ Recadrer** sur chaque photo existante.
- Alt texte éditable inline.
- Modal de suppression stylisé (remplace `confirm()`).

### 2.2 Frontend public (`web/app.js`, `web/styles.css`)

- Scene 07 passe en **masonry** (import dynamique de `masonry.pkgd.min.js` + `imagesloaded.pkgd.min.js`).
- Toutes les URLs photo (triptych + gallery) reçoivent un suffixe `?v={version}` pour le cache-busting après recrop.
- Service worker mis à jour pour ignorer les URLs avec query string (pas de mise en cache des versions).

### 2.3 Backend (`api/`)

- Nouvel endpoint **`PATCH /api/admin/photos/:id/recrop`** qui reçoit `{x, y, width, height}` (coordonnées pixel sur l'original) et relance la pipeline Sharp (9 variantes + blurhash) en cropant avec `sharp.extract()`.
- Nouvelle colonne **`version` INTEGER NOT NULL DEFAULT 1** sur la table `photo` — incrémentée à chaque recrop.
- Nouvelle colonne optionnelle **`cropped` BOOLEAN NOT NULL DEFAULT 0** — marque les photos uploadées avec un crop client explicite (futur : afficher un badge "originale" dans l'admin).
- Les uploads via `POST /api/admin/photos` passent désormais un **blob pré-compressé côté client** (canvas → JPEG qualité 0.92, 2400px max sur le plus grand côté) au lieu du fichier brut.

### 2.4 Assets vendor

Quatre nouveaux fichiers dans `web/vendor/` :
- `cropper.min.js`, `cropper.min.css` (Cropper.js v1.6.x)
- `masonry.pkgd.min.js` (Masonry v4.2.x bundle avec imagesloaded)
- `Sortable.min.js` (SortableJS v1.15.x)

Servis par Caddy sous `/vendor/*` (déjà couvert par le handler static + cache immutable).

---

## 3. Flux d'upload (nouvelle photo)

```
[User] drop 3 fichiers sur la dropzone
  │
  ▼
[Admin JS] crée une queue [file1, file2, file3]
  │
  ▼
[Admin JS] ouvre modal crop avec file1
           - canvas pré-downscale à max 2400px (iOS memory)
           - Cropper.js init, ratio = slot ratio (4:5 triptych | 1:1 gallery par défaut)
  │
  ▼
[User] ajuste le crop, choisit un ratio (gallery seulement), entre alt, clique "Suivant →"
  │
  ▼
[Admin JS] getCroppedCanvas().toBlob('image/jpeg', 0.92)
           POST /api/admin/photos (multipart: file=blob, alt=..., slot=..., cropped=1)
  │
  ▼
[Backend] pipeline Sharp standard (9 variantes + blurhash), insert DB
  │
  ▼
[Admin JS] modal passe à file2, etc.
           À la fin de la queue : ferme modal, refresh la grid
```

**Règles :**
- **Slot triptych** (`hero-1`, `hero-2`, `hero-3`) → ratio **4:5 verrouillé**.
- **Slot gallery** (`g-1`..`g-N`) → ratios proposés : **1:1**, **4:5**, **3:4**, **16:9**. Pas de ratio libre.
- **Alt texte obligatoire** dans le modal (le bouton "Suivant →" est désactivé tant qu'il est vide).
- **Rotation EXIF** gérée par Cropper (`checkOrientation: true`) côté client et par `sharp().rotate()` côté serveur (déjà en place).

---

## 4. Flux de recadrage (photo existante)

```
[User] clique ✂ sur une photo de la grid
  │
  ▼
[Admin JS] fetch /photos/{id}/full.jpg (l'image à taille originale)
           ouvre modal crop avec cette image
           - Cropper init, ratio = slot ratio, data initial = crop courant si connu
  │
  ▼
[User] ajuste, clique "Enregistrer"
  │
  ▼
[Admin JS] getData() → {x, y, width, height} (coordonnées pixel sur l'original)
           PATCH /api/admin/photos/{id}/recrop (JSON: {x, y, width, height})
  │
  ▼
[Backend] - sharp(original).extract({left:x, top:y, width, height})
          - relance la pipeline 9 variantes + blurhash
          - version += 1
          - update DB
  │
  ▼
[Admin JS] refresh la grid ; toutes les URLs utilisent ?v={nouvelle version}
```

**Contrainte :** l'original doit rester accessible. Vérifier que `/photos/{id}/full.jpg` pointe bien vers l'original non-modifié (pas vers la dernière variante recrop).

---

## 5. Backend — détail

### 5.1 Migration DB

```sql
ALTER TABLE photo ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE photo ADD COLUMN cropped BOOLEAN NOT NULL DEFAULT 0;
```

### 5.2 Endpoint `PATCH /api/admin/photos/:id/recrop`

**Body :** `{ x: int, y: int, width: int, height: int }` (pixels sur l'image originale).

**Validations :**
- `id` existe en DB.
- `x, y >= 0`, `width, height > 0`.
- `x + width <= original.width`, `y + height <= original.height` (rejeter 400 sinon).

**Logique :**
1. Charger l'original depuis le disque.
2. `pipeline = sharp(original).rotate().extract({left:x, top:y, width, height})`.
3. Relancer la génération des 9 variantes (réutiliser la fonction existante de l'upload).
4. Regénérer blurhash.
5. `UPDATE photo SET version = version + 1, blurhash = ?, width = ?, height = ? WHERE id = ?`.
6. Répondre `{ id, version, width, height, blurhash }`.

**Concurrence :** si deux recrops arrivent en parallèle sur la même photo, lock optimiste par `version` (incrémenter avec `WHERE version = ?`). Hors scope v1, mais noter le risque.

### 5.3 Endpoint `PATCH /api/admin/photos/reorder`

**Body :** `{ order: [{id, slot}, ...] }`.

**Logique :** transaction, `UPDATE photo SET slot = ? WHERE id = ?` pour chaque entrée.

### 5.4 Endpoint `POST /api/admin/photos` (modifié)

- Accepte un champ optionnel `cropped=1` (multipart text field).
- Si présent, enregistre `photo.cropped = 1`.
- Aucun changement de pipeline (le blob reçu est déjà croppé côté client).

---

## 6. Frontend public — détail

### 6.1 Scene 07 en masonry

Structure HTML actuelle (`<div class="gallery">` avec enfants `.ph`) préservée. CSS grid remplacé par Masonry JS :

```js
import('/vendor/masonry.pkgd.min.js').then(() => {
  const grid = document.querySelector('.gallery');
  imagesLoaded(grid, () => {
    new Masonry(grid, {
      itemSelector: '.ph',
      columnWidth: '.ph',
      percentPosition: true,
      gutter: 12,
    });
  });
});
```

CSS :
```css
.gallery { display: block; position: relative; }
.gallery .ph { width: calc(33.333% - 8px); margin-bottom: 12px; }
@media (max-width: 820px) {
  .gallery .ph { width: calc(50% - 6px); }
}
```

Les `.ph` gardent `aspect-ratio` variable selon le crop choisi.

### 6.2 Cache-busting

Toutes les URLs (`<img src>`, `srcset`, blurhash background) construites dans `app.js` reçoivent `?v={photo.version}`.

### 6.3 Service worker

Dans `web/sw.js`, ajouter une règle : **ne pas mettre en cache les requêtes avec query string** (ou, plus précisément, ne pas servir depuis le cache si `?v=` est présent dans l'URL). Cela force la récupération réseau après recrop sans invalider tout le cache du SW.

---

## 7. Frontend admin — détail

### 7.1 HTML admin (ajouts dans `web/admin.html`)

- `<section class="dropzone">` avec input file multiple.
- `<div class="photos-grid">` remplace la liste verticale.
- `<dialog class="crop-modal">` (native dialog, backdrop CSS).
- `<dialog class="delete-modal">`.

### 7.2 CSS admin (`web/admin.css`)

Nouvelles règles pour :
- `.dropzone` : bordure pointillée, drop-target hover state.
- `.photos-grid` : CSS Grid `repeat(auto-fill, minmax(180px, 1fr))`.
- `.photo-card` : image + alt input + actions (✂, 🗑).
- `.crop-modal` : flex layout, zone Cropper à gauche, contrôles à droite (ratio buttons, alt input, boutons action).
- `.delete-modal` : petit dialog centré avec 2 boutons.

### 7.3 JS admin (`web/admin.js`)

Restructurer `renderPhotosTab()` en plusieurs fonctions :
- `renderDropzone()` — drag & drop + input file.
- `renderGrid()` — grid des photos avec Sortable.
- `openCropModal(source, opts)` — ouvre modal, retourne une Promise<{blob, alt, ratio}>.
- `openDeleteModal(photo)` — retourne Promise<bool>.
- `enqueueUpload(files)` — gère la queue séquentielle.
- `recropPhoto(id)` — fetch full + ouvre modal + PATCH.
- `reorderPhotos(sortedIds)` — PATCH reorder.

**Import dynamique** des libs vendor (Cropper, Sortable) : chargés au premier besoin, pas au chargement de la page.

---

## 8. Mobile — contraintes spécifiques

### 8.1 Modal plein écran

```css
@media (max-width: 640px) {
  .crop-modal {
    inset: 0;
    border-radius: 0;
    max-width: none;
    max-height: none;
    width: 100vw;
    height: 100svh;
  }
  .crop-modal .actions {
    flex-direction: column;
    gap: 8px;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
  .crop-modal .ratios { flex-wrap: wrap; }
}
```

### 8.2 Safe area iOS

Padding-bottom sur `.crop-modal .actions` utilise `env(safe-area-inset-bottom)`. Viewport meta tag (`viewport-fit=cover`) à vérifier sur `admin.html`.

### 8.3 Appareil photo natif

Input file : `<input type="file" accept="image/*" capture="environment" multiple>`. `capture="environment"` propose directement la caméra arrière sur iOS/Android, tout en laissant le choix de la galerie.

### 8.4 Drag-to-reorder tactile

SortableJS gère nativement le touch. Activer `delay: 250` et `delayOnTouchOnly: true` pour que le long-press déclenche le drag (évite les drags accidentels pendant le scroll).

### 8.5 Mémoire iOS

Safari iOS limite la mémoire canvas. **Pré-downscale côté client avant de donner l'image à Cropper :**

```js
async function downscaleForCrop(file, maxSide = 2400) {
  const bmp = await createImageBitmap(file);
  const ratio = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * ratio);
  const h = Math.round(bmp.height * ratio);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
}
```

Fallback sur `HTMLCanvasElement` si `OffscreenCanvas` indisponible.

### 8.6 Orientation EXIF

- **Client :** Cropper avec `checkOrientation: true` (lit l'EXIF et redresse avant crop).
- **Serveur :** `sharp().rotate()` sans argument applique l'EXIF et strip les métadonnées d'orientation. Déjà en place dans le pipeline existant — vérifier que c'est bien le cas pour l'endpoint recrop aussi.

---

## 9. Scope & YAGNI

**Dans le scope v1 :**
- Upload drag & drop multi-fichiers avec crop obligatoire.
- Recrop non destructif via modal Cropper.
- Masonry public scene 07.
- Drag-to-reorder dans la grid admin.
- Modal delete stylisé.
- Mobile-first admin.

**Hors scope v1 :**
- Édition par lot (bulk alt, bulk delete, bulk reorder).
- Filtres/rotation/ajustements couleur dans le modal crop.
- Historique des versions / undo recrop.
- Prévisualisation live de la scene 07 depuis l'admin.
- Progressive upload avec resume.
- Lock optimiste concurrent sur recrop (risque accepté : un utilisateur admin à la fois).

---

## 10. Risques & questions ouvertes

1. **Stockage de l'original** — confirmer que le pipeline garde bien l'original intact et qu'un chemin stable existe (`/photos/{id}/full.jpg` ou équivalent). Si l'original n'est pas conservé, ajouter un slot `original.jpg` dans le pipeline avant recrop.
2. **Taille du bundle vendor** — Cropper.js (~40 KB gzip) + Masonry (~20 KB gzip) + Sortable (~15 KB gzip). Chargés en lazy import, impact négligeable sur first paint public ; admin accepte le coût.
3. **iOS Safari < 15** — `OffscreenCanvas` pas supporté. Fallback canvas standard prévu.
4. **Cropper.js responsive** — la doc recommande `responsive: true` + `restore: true` pour gérer le resize viewport. À activer.

---

## 11. Livrables de l'implémentation

1. Assets vendor ajoutés dans `web/vendor/`.
2. Migration DB (colonnes `version`, `cropped`).
3. Endpoint `PATCH /api/admin/photos/:id/recrop` + tests.
4. Endpoint `PATCH /api/admin/photos/reorder` + tests.
5. `web/admin.html`, `web/admin.css`, `web/admin.js` refondus.
6. `web/app.js`, `web/styles.css` : scene 07 masonry + cache-busting `?v=`.
7. `web/sw.js` : règle skip-cache pour URLs avec query.
8. Test manuel desktop + mobile (iOS Safari, Android Chrome).

---

**Fin du spec.**
