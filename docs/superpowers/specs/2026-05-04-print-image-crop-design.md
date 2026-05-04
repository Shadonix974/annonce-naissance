# Crop interactif sur l'image générée — Design Spec

**Date:** 2026-05-04
**Auteur:** Olivier (brainstorm avec Claude)
**Statut:** Approuvé — prêt pour plan d'implémentation
**Précédent:** `2026-05-04-print-image-design.md` (le téléchargement PNG, déjà implémenté sur la branche `feat/print-image`)

---

## 1. Contexte et objectif

Le téléchargement PNG ajouté en amont (`GET /api/admin/print/image`) renvoie le polaroid complet à 1500×1875 px (ratio 4:5). L'utilisateur veut pouvoir **choisir ce qu'il enregistre** plutôt que toujours récupérer la totalité — par exemple cropper en carré pour Instagram, en 9:16 pour une story, ou découper librement le visage seul.

**Objectif :** ajouter un crop interactif côté admin entre la génération de l'image et le téléchargement. Default = comportement actuel (image entière, ratio 4:5) → zéro régression pour qui s'en moque ; les autres ont un Cropper.js et 4 ratios prédéfinis.

**Contrainte :** la feature s'ajoute à la même PR que `feat/print-image` (pas encore mergée). Le backend reste **strictement inchangé**.

---

## 2. Architecture

Crop **100% côté client**. Le backend continue à renvoyer le PNG complet ; l'admin l'ouvre dans un modal Cropper, l'utilisateur ajuste, le canvas crop produit le PNG final, on déclenche le téléchargement.

Pas de round-trip réseau pour le crop. Pas de paramètre `?clip=` dans l'API. Pas de stockage de coordonnées.

### 2.1 Frontend (`web/admin.js`, `web/admin.html`, `web/admin.css`)

**Trois fonctions, un nouveau dialog :**

| Composant | Rôle |
|---|---|
| `downloadImage(btn)` (modifié) | Fetch le PNG → ouvre le modal au lieu de télécharger direct |
| `openImageDownloadModal(blob, filename)` (nouveau) | Construit le Cropper sur le PNG reçu, gère les 4 ratios, télécharge le résultat |
| `triggerDownload(blob, filename)` (nouveau, refactor) | Helper "blob → click `<a download>` → revoke" — sort la logique répétitive |

**Nouveau dialog DOM dans `web/admin.html` :**

```html
<dialog id="imageDownloadModal" class="image-download-modal">
  <div class="modal-header">
    <h2>Télécharger l'image</h2>
    <button type="button" id="imageDownloadClose" aria-label="Fermer">×</button>
  </div>
  <div class="modal-ratios" id="imageDownloadRatios"></div>
  <div class="modal-body">
    <img id="imageDownloadPreview" alt="">
  </div>
  <div class="modal-footer">
    <button type="button" id="imageDownloadCancel" class="secondary">Annuler</button>
    <button type="button" id="imageDownloadConfirm">Télécharger</button>
  </div>
</dialog>
```

**Pourquoi un dialog dédié et pas réutiliser `#cropModal` :** le crop modal des photos a un champ `alt`, un `queueHint`, et un bouton confirm câblé sur la validation alt — adapter ça pour le flow image download couplerait deux features qui n'ont rien à voir. Un nouveau dialog de ~10 lignes HTML est plus propre.

### 2.2 Ratios prédéfinis

Quatre boutons radio (un actif à la fois) :

| Bouton | `aspectRatio` Cropper | Usage |
|---|---|---|
| `Original` (défaut, sélectionné à l'ouverture) | `4 / 5` | Ratio natif du PNG (1500×1875), Insta post portrait |
| `Carré` | `1` | Insta post carré, profil, miniatures |
| `Story` | `9 / 16` | Insta/WhatsApp story |
| `Libre` | `NaN` | Pas de contrainte, freeform |

À l'ouverture du modal, ratio `Original` actif et `autoCropArea: 1` → la zone de crop couvre toute l'image. Donc click direct `Télécharger` = comportement strictement identique au flow actuel.

### 2.3 CSS (`web/admin.css`)

Ajout d'une classe `.image-download-modal` reprenant les conventions visuelles des modals existants (couleurs, padding, border-radius). Modal large (≈ 90vw × 90vh max) pour que le Cropper ait de la place. La barre de ratios est une rangée horizontale de 4 boutons centrée, avec un `.active` styled comme le `.active` de `#cropRatios` existant.

---

## 3. Flux détaillé

```
User click "Télécharger l'image (PNG)"
  → btn.disabled = true; btn.textContent = 'Génération…'
  → fetch GET /api/admin/print/image
    ├─ !res.ok → btn.textContent = `Erreur ${status}`; reset après 2s; PAS de modal
    ├─ network error → btn.textContent = 'Erreur'; reset après 2s; PAS de modal
    └─ res.ok → blob + extract filename de Content-Disposition
        → btn.textContent = originalText; btn.disabled = false  (libère le bouton)
        → openImageDownloadModal(blob, filename)
            ├─ load Cropper.js (cached après 1ere fois)
            ├─ create objectURL pour le blob
            ├─ inject ratio buttons, set "Original" actif
            ├─ set img.src = objectURL, attendre img.load
            ├─ new Cropper(img, { aspectRatio: 4/5, viewMode: 1, autoCropArea: 1, ... })
            ├─ dlg.showModal()
            └─ user interactions:
                ├─ click ratio button → cropper.setAspectRatio(value)
                ├─ drag/resize crop area dans le Cropper
                ├─ click "Télécharger" :
                │   → cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' })
                │   → canvas.toBlob(b => triggerDownload(b, filename), 'image/png')
                │   → cleanup: cropper.destroy() + revokeObjectURL + dlg.close() + remove listeners
                ├─ click "Annuler" ou "×" : cleanup (pas de download)
                └─ click backdrop / Escape : cleanup (comportement natif <dialog>)
```

### 3.1 Edge cases

- **Pas de crop ajusté = full image.** `autoCropArea: 1` ouvre Cropper sur la totalité ; `getCroppedCanvas()` sans crop ajusté renvoie l'image complète. Pas besoin d'un "skip crop" séparé.
- **Ratio `Libre` quand l'utilisateur a déjà ajusté le crop avec un ratio fixe.** `setAspectRatio(NaN)` débloque le ratio mais préserve la zone existante. C'est le comportement natif de Cropper.js, conforme à l'intuition.
- **Modal réouvert après un précédent crop.** Chaque ouverture est un cycle complet (nouveau Cropper, nouveau objectURL). Pas de mémoire entre ouvertures (default `Original`).
- **Annulation après avoir cropped.** `cleanup` revoke l'objectURL, destroy le cropper, ferme le dialog. Aucun téléchargement déclenché.
- **Erreur fetch initial.** Pas de modal → flow actuel inchangé. Le bouton montre l'erreur et se reset.

---

## 4. Hors scope

- **Pas de "réinitialiser le crop" séparé** — changer de ratio refait l'`autoCropArea`, suffit pour reset.
- **Pas de mémoire du dernier ratio choisi** entre ouvertures — chaque ouverture repart sur `Original`.
- **Pas de preview "votre crop fera X×Y px"** — l'info est lisible dans le Cropper handles ; ajout possible plus tard.
- **Pas de zoom/rotate** — `zoomable: true, rotatable: false` (comme le crop modal des photos). Le polaroid est déjà à la bonne orientation.
- **Pas de raccourcis clavier custom** au-delà de l'Escape natif du `<dialog>` — Enter pour télécharger pourrait être ajouté plus tard.
- **Pas de preset "Photo seule"** (cadrage auto sur la zone photo du polaroid) — l'utilisateur le fait à la main en `Libre` ; éviter de hardcoder des coords qui se cassent si le CSS du polaroid bouge.
- **Backend strictement inchangé.** Pas de `?ratio=`, pas de `?clip=`, pas de Sharp côté serveur.

---

## 5. Risques et points d'attention

- **Memory leak via objectURL non révoqué.** Critique : la branche cleanup DOIT révoquer l'`URL.createObjectURL(blob)`. Toutes les sorties du modal (Télécharger, Annuler, ×, Escape, backdrop) passent par la même fonction `cleanup()`.
- **Cropper.js init avant `img.load`.** Pattern existant dans `web/admin.js:136` (`await new Promise(r => img.addEventListener('load', r, { once: true }))`). À reproduire à l'identique.
- **CSP `script-src 'self'`** — Cropper servi depuis `/vendor/cropper.min.js`, déjà conforme. Le code crop n'introduit pas d'`eval` ni d'inline script.
- **`<dialog>` Escape & backdrop** — comportement natif HTML. Vérifier que le natif `cancel` event fire le cleanup (sinon listener explicite `dlg.addEventListener('cancel', cleanup, { once: true })`).
- **Filename slug serveur préservé.** Le `filename` extrait du `Content-Disposition` du serveur (`annonce-naissance-<slug>.png`) doit être passé tel quel au `triggerDownload` final. Pas de `_cropped` suffix (l'utilisateur sait ce qu'il a téléchargé).
- **Performance Canvas pour image 1500×1875.** Cropper crée un canvas in-memory de la taille croppée. Sur des dimensions de cet ordre, c'est instantané sur tout device admin (desktop ou mobile récent). Pas d'optimisation prématurée.
