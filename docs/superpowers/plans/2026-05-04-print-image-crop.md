# Print Image Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side Cropper.js modal between PNG generation and download, with 4 ratio presets (Original 4:5, Carré 1:1, Story 9:16, Libre). Default = full image, so click-through behavior is unchanged.

**Architecture:**
- Pure client-side. Backend (`/api/admin/print/image`) stays untouched. The admin fetches the PNG as today, then opens a `<dialog id="imageDownloadModal">` that hosts a Cropper.js instance on the received blob. User picks a ratio, drags the crop area, clicks `Télécharger` → `cropper.getCroppedCanvas().toBlob()` → triggers download.
- A new `triggerDownload(blob, filename)` helper extracts the existing `<a download>` blob trick so it can be called from both the (legacy, soon-removed) immediate-download path and the modal confirm path.
- A new `openImageDownloadModal(blob, filename)` function manages the modal lifecycle (Cropper init, ratio bar, cleanup, objectURL revoke).

**Tech Stack:** Vanilla JS (no framework), native HTML `<dialog>`, Cropper.js (already vendored at `web/vendor/cropper.min.js`, already loaded lazily by `loadCropper()` in `web/admin.js`).

**Spec:** `docs/superpowers/specs/2026-05-04-print-image-crop-design.md`

**Branch:** Same branch as the prior PNG download feature (`feat/print-image`). Commits stack on top of `86960c1` (the spec commit).

---

## Preconditions

- On branch `feat/print-image`, working tree clean.
- Previous tasks (Tasks 1-5 of the print-image plan) completed and verified — clicking `Télécharger l'image (PNG)` in admin already downloads a working PNG.
- `web/admin.js`, `web/admin.html`, `web/admin.css` writable.
- Dev stack runnable for the manual verification task.

---

## File Structure

### Modified files

| Path | Change |
| --- | --- |
| `web/admin.html` | Add a new `<dialog id="imageDownloadModal">` after the existing `#deleteModal` dialog (line ~78). Vertical layout: header + ratio bar + image stage + footer. |
| `web/admin.css` | Add `.image-download-modal` to the existing `.crop-modal, .delete-modal { ... }` shared base block (line ~107). Add a small dedicated block for the inner vertical layout. |
| `web/admin.js` | (1) Extract `triggerDownload(blob, filename)` helper. (2) Refactor `downloadImage` to call `openImageDownloadModal` after fetch success. (3) Add `openImageDownloadModal(blob, filename)` function. |

### Files NOT touched

- `api/**` — backend strictly unchanged (zero diff in the API tree)
- `web/admin.html` aside from the new dialog (no other tag added/removed)
- `web/print.html`, `web/print.css`, `web/print.js`
- `docs/superpowers/specs/2026-05-04-print-image-crop-design.md` (already committed)

---

## Task 1: Add the modal DOM + base CSS (no JS wiring yet)

This task adds the dialog markup and styles. After this commit, the dialog exists in the DOM but is never opened — the page should look and behave identically to before.

**Files:**
- Modify: `web/admin.html` (add a `<dialog>` after line 78)
- Modify: `web/admin.css` (extend the modal base block + add a new layout block)

- [ ] **Step 1: Add the dialog markup in `web/admin.html`**

After the closing `</dialog>` of `#deleteModal` (currently on line 78) and before the `<div id="toast">` line (currently line 80), insert this block (keep one blank line above and below for readability):

```html
  <dialog id="imageDownloadModal" class="image-download-modal" aria-labelledby="imageDownloadTitle">
    <form method="dialog" class="image-download-modal-inner">
      <div class="image-download-header">
        <div class="image-download-title" id="imageDownloadTitle">Télécharger l'image</div>
        <button type="button" class="image-download-close" id="imageDownloadClose" aria-label="Fermer">×</button>
      </div>
      <div class="ratios" id="imageDownloadRatios"></div>
      <div class="image-download-stage">
        <img id="imageDownloadPreview" alt="">
      </div>
      <div class="actions">
        <button type="button" class="secondary" id="imageDownloadCancel">Annuler</button>
        <button type="button" id="imageDownloadConfirm">Télécharger</button>
      </div>
    </form>
  </dialog>
```

The `.ratios` class is reused as-is from the existing photo crop modal (button-group styling already in `web/admin.css:145-154`).

- [ ] **Step 2: Extend the shared modal base in `web/admin.css`**

Locate the existing block at line ~107:

```css
.crop-modal, .delete-modal {
  border: 0;
  padding: 0;
  background: var(--panel);
  color: var(--ink);
  border-radius: 8px;
  max-width: 960px;
  width: min(960px, 92vw);
  max-height: 90vh;
}
.crop-modal::backdrop, .delete-modal::backdrop {
  background: rgba(10, 12, 24, 0.72);
  backdrop-filter: blur(4px);
}
```

Replace with (add `.image-download-modal` to BOTH selector lists):

```css
.crop-modal, .delete-modal, .image-download-modal {
  border: 0;
  padding: 0;
  background: var(--panel);
  color: var(--ink);
  border-radius: 8px;
  max-width: 960px;
  width: min(960px, 92vw);
  max-height: 90vh;
}
.crop-modal::backdrop, .delete-modal::backdrop, .image-download-modal::backdrop {
  background: rgba(10, 12, 24, 0.72);
  backdrop-filter: blur(4px);
}
```

- [ ] **Step 3: Add a dedicated block for the image-download-modal inner layout**

Append this block at the end of `web/admin.css` (after the last existing rule, before any `@media` blocks if possible — otherwise at the very end):

```css
/* ============================================================
   Image download modal — vertical layout (header / ratios / image / actions)
   ============================================================ */
.image-download-modal-inner {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  max-height: 90vh;
  min-width: 0;
}
.image-download-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.image-download-title { font-size: 16px; }
.image-download-close {
  background: transparent;
  border: 0;
  color: var(--muted);
  font-size: 22px;
  line-height: 1;
  padding: 0 6px;
  cursor: pointer;
}
.image-download-close:hover { color: var(--ink); }
.image-download-stage {
  background: #000;
  min-height: 320px;
  max-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
}
.image-download-stage img { max-width: 100%; max-height: 70vh; display: block; }
.image-download-modal .actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}
.image-download-modal .actions button { flex: 1; }
```

- [ ] **Step 4: Verify the page still loads and the dialog is invisible by default**

Run `git diff --stat web/admin.html web/admin.css` and confirm only those two files changed, with the expected line counts (~14 added in HTML, ~30-40 added in CSS).

Open the admin in a browser (Ctrl+Shift+R for cache bypass) — every existing tab and modal should look and behave **identically** to before. The new dialog must NOT be visible (a `<dialog>` without `open` attribute and without `showModal()` is hidden by default).

- [ ] **Step 5: Commit**

```bash
git add web/admin.html web/admin.css
git commit -m "feat(web): add image download modal markup + base styles"
```

---

## Task 2: Extract `triggerDownload` helper from `downloadImage` (pure refactor)

This task is a pure refactor — no observable change. Extract the "blob → click `<a download>` → revoke" pattern into a standalone helper so Task 3 can call it from the modal confirm path.

**Files:**
- Modify: `web/admin.js` (split `downloadImage` body)

- [ ] **Step 1: Locate the current `downloadImage` function**

It starts with `async function downloadImage(btn) {` and ends with the matching `}` (currently around lines 1021-1053 in `web/admin.js`).

The relevant inner block (success path) is currently:

```js
    // Extract the filename from Content-Disposition (server provides slugged name).
    let filename = 'annonce-naissance.png';
    const cd = r.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    if (m) filename = m[1];

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
```

- [ ] **Step 2: Insert the new helper above `downloadImage`**

Just BEFORE the `async function downloadImage(btn) {` line, add this new function (with one blank line above and below):

```js
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Replace the inline blob/URL/`<a>` block in `downloadImage` with a call to `triggerDownload`**

Inside `downloadImage`, replace the success-path block (the lines starting with `const blob = await r.blob();` through `URL.revokeObjectURL(url);` — 8 lines) with:

```js
    const blob = await r.blob();
    triggerDownload(blob, filename);
```

The `filename` variable above is unchanged; the `await r.blob()` call is unchanged; only the manual `<a>` dance is now delegated.

- [ ] **Step 4: Sanity check — diff and behavior**

Run `git diff web/admin.js` and confirm:
- New function `triggerDownload` added (~9 lines)
- Inside `downloadImage`, ~7 lines removed (the manual `<a>` dance), ~1 line added (the `triggerDownload(blob, filename)` call)
- Total net diff: small positive (~3 lines)

Open the admin in a browser, click `Télécharger l'image (PNG)` — the download must work **exactly** as before this commit. This is a pure refactor; any visible change means a regression.

- [ ] **Step 5: Commit**

```bash
git add web/admin.js
git commit -m "refactor(web): extract triggerDownload helper from downloadImage"
```

---

## Task 3: Add `openImageDownloadModal` and route `downloadImage` through it

This task wires the actual feature: after a successful fetch, open the modal with Cropper instead of immediately triggering the download.

**Files:**
- Modify: `web/admin.js` (modify `downloadImage`, add `openImageDownloadModal`)

- [ ] **Step 1: Modify `downloadImage` to open the modal instead of downloading directly**

Replace the success-path inside `downloadImage`. The current success path (after `if (!r.ok)` returns) currently looks like:

```js
    // Extract the filename from Content-Disposition (server provides slugged name).
    let filename = 'annonce-naissance.png';
    const cd = r.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    if (m) filename = m[1];

    const blob = await r.blob();
    triggerDownload(blob, filename);
    btn.textContent = 'Téléchargé ✓';
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1500);
```

Replace with:

```js
    // Extract the filename from Content-Disposition (server provides slugged name).
    let filename = 'annonce-naissance.png';
    const cd = r.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    if (m) filename = m[1];

    const blob = await r.blob();
    // Restore the button BEFORE opening the modal — the modal owns the next step
    // of the user flow, the button has done its job.
    btn.textContent = originalText;
    btn.disabled = false;
    await openImageDownloadModal(blob, filename);
```

Notes:
- The "Téléchargé ✓" feedback is dropped from this branch because the modal is now the visible signal that something happened. The download itself happens inside the modal's confirm handler.
- The `await` ensures any error inside the modal can bubble (caught by the existing `try/catch` around `downloadImage`'s body).

- [ ] **Step 2: Add the `openImageDownloadModal` function**

Append this function at the end of `web/admin.js` (after `triggerDownload`, after `downloadImage`, before any other top-level function — keep the file's "small functions in render order" convention):

```js
/* ============================================================
   Image download modal — Cropper.js with 4 ratio presets.
   Default = Original (4:5) ratio + autoCropArea: 1, so a direct
   "Télécharger" click yields the full polaroid (no regression).
   ============================================================ */
const IMAGE_DOWNLOAD_RATIOS = [
  { label: 'Original', value: 4 / 5 },
  { label: 'Carré',    value: 1 },
  { label: 'Story',    value: 9 / 16 },
  { label: 'Libre',    value: NaN },
];

async function openImageDownloadModal(blob, filename) {
  const Cropper = await loadCropper();
  const dlg = document.getElementById('imageDownloadModal');
  const img = document.getElementById('imageDownloadPreview');
  const ratioBar = document.getElementById('imageDownloadRatios');
  const confirmBtn = document.getElementById('imageDownloadConfirm');
  const cancelBtn = document.getElementById('imageDownloadCancel');
  const closeBtn = document.getElementById('imageDownloadClose');

  const objectUrl = URL.createObjectURL(blob);
  img.src = objectUrl;

  ratioBar.innerHTML = '';
  let activeRatio = IMAGE_DOWNLOAD_RATIOS[0].value;
  const ratioButtons = IMAGE_DOWNLOAD_RATIOS.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.label;
    b.className = i === 0 ? 'active' : '';
    b.addEventListener('click', () => {
      ratioButtons.forEach((bb) => bb.classList.remove('active'));
      b.classList.add('active');
      activeRatio = r.value;
      cropper.setAspectRatio(activeRatio);
    });
    ratioBar.appendChild(b);
    return b;
  });

  await new Promise((r) => img.addEventListener('load', r, { once: true }));
  const cropper = new Cropper(img, {
    aspectRatio: activeRatio,
    viewMode: 1,
    autoCropArea: 1,
    responsive: true,
    restore: true,
    background: false,
    movable: true,
    zoomable: true,
    rotatable: false,
    scalable: false,
  });

  return new Promise((resolve) => {
    const cleanup = () => {
      cropper.destroy();
      URL.revokeObjectURL(objectUrl);
      dlg.close();
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      dlg.removeEventListener('cancel', onCancel);
    };
    const onConfirm = () => {
      const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
      canvas.toBlob((croppedBlob) => {
        if (croppedBlob) triggerDownload(croppedBlob, filename);
        cleanup();
        resolve();
      }, 'image/png');
    };
    const onCancel = (e) => {
      // The native <dialog> 'cancel' event (Escape) calls this with an event
      // object; the button handlers call it with no arg. Both paths run cleanup.
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      cleanup();
      resolve();
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
  });
}
```

Pattern notes for the implementer:
- This mirrors `openCropModal` and `openRecropModal` already in the file (`web/admin.js:101-175` and `web/admin.js:182-244`). Same lifecycle: load Cropper → create objectURL → wait for img.load → init Cropper → return a Promise → cleanup destroys+revokes+closes+unlistens.
- The `dlg.addEventListener('cancel', onCancel)` line wires the native Escape-key path (and any backdrop click that triggers `cancel`) into the same cleanup. The `e.preventDefault()` prevents the default `<dialog>` close from running before our cleanup.

- [ ] **Step 3: Quick syntactic sanity check**

Run `node -e "require('fs').readFileSync('web/admin.js', 'utf8')"` — basic file read should succeed with no error (this won't catch JS syntax errors, but ensures the file isn't truncated/corrupted).

Open the admin in a browser (Ctrl+Shift+R cache bypass), click `Télécharger l'image (PNG)`. The modal must open with:
- Title `Télécharger l'image` + close button `×`
- 4 ratio buttons in a row, `Original` highlighted
- The PNG preview filling the dark stage area
- A Cropper crop box covering the entire image
- `Annuler` and `Télécharger` buttons at the bottom

If the modal does NOT open or shows JS errors in the browser console, STOP and report — do not commit.

- [ ] **Step 4: Commit**

```bash
git add web/admin.js
git commit -m "feat(web): client-side crop modal with 4 ratio presets on image download"
```

---

## Task 4: Manual end-to-end verification

The full feature requires an actual browser + actual user clicks. No automated test layer exists for this UI in the project.

- [ ] **Step 1: Bring up / refresh the dev stack**

If running locally:
```bash
docker compose -f docker-compose.dev.yml up -d --build api caddy
```

If running on the VPS (where the prior task was tested): `git pull` on the branch, no rebuild needed for `web/` files (caddy mounts `./web` as a volume), `docker compose restart caddy` if browser cache is suspected.

- [ ] **Step 2: Verify the default-no-crop path (zero regression)**

In the admin → Print tab → click `Télécharger l'image (PNG)`:
1. Button → `Génération…` for ~3s
2. Modal opens with the polaroid preview, `Original` ratio active, crop area covering whole image
3. Click `Télécharger` immediately (no adjustment)
4. Browser downloads `annonce-naissance-<slug>.png`
5. Modal closes

Open the downloaded PNG. It must look identical to a PNG downloaded BEFORE this feature was added (full polaroid, ~1500×1875, all the rotation/shadow/washi tape preserved). If it differs in any visible way (cropped edges, wrong dimensions, recompressed), STOP and investigate.

- [ ] **Step 3: Verify each ratio preset**

Repeat the open-modal flow 3 times. Each time, click a different ratio:

- **`Carré` (1:1)** → crop box becomes a centered square. Click `Télécharger` → downloaded PNG should be roughly square (1500×1500 ± a bit depending on Cropper's centering).
- **`Story` (9:16)** → crop box becomes a tall narrow portrait. Click `Télécharger` → PNG should be taller than wide (~1054×1875).
- **`Libre`** → crop box becomes freely resizable. Drag a corner to make it smaller, click `Télécharger` → PNG should match what was visible in the box.

Each downloaded file must:
- Have the correct slugged filename (`annonce-naissance-<slug>.png`)
- Be a valid PNG (opens in any image viewer)
- Show the cropped region without artifacts at the edges

- [ ] **Step 4: Verify cancel/close paths**

Three cancel paths must all close the modal cleanly with NO download triggered:

- Click `Annuler` button
- Click the `×` close button
- Press `Escape` key

After each, the page should be fully responsive (no leftover overlay, no frozen Cropper, no console errors). Re-open the modal and confirm it works on the second open (cleanup did not break state).

- [ ] **Step 5: Sanity check that nothing else regressed**

In the admin, navigate to other tabs:
- **Photos tab** → click an existing photo's "✂ Recadrer" button. The photo crop modal must still open and work. (We added `.image-download-modal` to its shared CSS selector — verify the photo modal styling didn't drift.)
- **Photos tab** → drag and drop a new photo. The upload+crop flow must still work.
- **Trash a photo** (delete modal) → must still open and work.

If any of these regressed, the change to the shared `.crop-modal, .delete-modal { ... }` block in Task 1 is the most likely cause.

- [ ] **Step 6: No commit needed for verification — but if you found a fix during testing, commit it now**

If e.g. the modal layout is awkward on mobile or a ratio button position needs adjustment:

```bash
git add web/admin.css web/admin.js  # whichever was tweaked
git commit -m "fix(web): <describe the fix>"
```

If everything works, just note the verification as complete and move to PR creation.
