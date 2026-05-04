# Print Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin "Télécharger PDF (A4/Letter)" download with a single "Télécharger l'image (PNG)" download that produces a 1500×1875 PNG screenshot of the print page, preserving on-screen aesthetics (rotation, shadow, washi tape) that the previous PDF flattened.

**Architecture:**
- Rename `api/src/lib/print-pdf.ts` → `api/src/lib/print-image.ts`, swap `page.pdf()` for `page.screenshot({ type: 'png' })` with viewport `500×625` × `deviceScaleFactor: 3`. Drop the `PrintFormat` type entirely.
- Replace `GET /api/admin/print/pdf?format=a4|letter` with `GET /api/admin/print/image` (no params). Read `babyName` from the `tweaks` table to build a slugged filename `annonce-naissance-<slug>.png`.
- In `web/admin.js`, replace the two PDF buttons + `downloadPdf` helper with one Image button + `downloadImage` helper.
- Tests: drop the two `/pdf` tests in `api/test/print.test.ts`, add an auth test for `/image`. Playwright integration is exercised manually (existing project convention).

**Tech Stack:** Hono, Drizzle ORM, Playwright (already a dependency, Chromium already installed in the Docker image). Vanilla JS for the admin UI.

**Spec:** `docs/superpowers/specs/2026-05-04-print-image-design.md`

---

## Preconditions

- Clean working tree on a fresh branch off `main`.
- `api/` deps installed (`npm install` in `api/`). Playwright already present (no new deps).
- The dev stack must be runnable for the manual verification task (Docker compose).

---

## File Structure

### Renamed files

| Old path | New path | Purpose |
| --- | --- | --- |
| `api/src/lib/print-pdf.ts` | `api/src/lib/print-image.ts` | Playwright wrapper that returns a PNG buffer (was a PDF buffer). |

### Modified files

| Path | Change |
| --- | --- |
| `api/src/routes/admin/print.ts` | Drop the `/pdf` route + format mapping. Add a `/image` route that reads `babyName`, slugifies it, sets `Content-Type: image/png`, and streams the PNG. |
| `api/test/print.test.ts` | Drop the two `/api/admin/print/pdf` tests. Add one auth test for `/api/admin/print/image`. |
| `web/admin.js` | In `renderPrintTab()`, swap the "Télécharger en PDF" section (title + A4 + Letter buttons + `downloadPdf`) for a single "Télécharger l'image" section (title + 1 button + `downloadImage`). |

### Files NOT touched

- `api/src/db/schema.ts` (no schema change)
- `api/src/middleware/require-admin.ts` (re-used as-is)
- `api/src/lib/access-token.ts` (re-used as-is)
- `api/Dockerfile` (Playwright + Chromium already installed for the prior PDF feature)
- `web/print.html`, `web/print.css`, `web/print.js` (the page being screenshotted is unchanged)

---

## Task 1: Rename and rewrite the Playwright wrapper as PNG generator

**Files:**
- Rename: `api/src/lib/print-pdf.ts` → `api/src/lib/print-image.ts`
- Replace contents (see step 2)

- [ ] **Step 1: Rename the file with `git mv` (preserves history)**

```bash
git mv api/src/lib/print-pdf.ts api/src/lib/print-image.ts
```

- [ ] **Step 2: Replace the file contents**

Open `api/src/lib/print-image.ts` and replace its entire contents with:

```ts
import { chromium } from "playwright";

/**
 * Launches a headless Chromium, navigates to the print page, and returns a
 * PNG screenshot at 1500x1875 px (4:5).
 *
 * Viewport 500x625 + deviceScaleFactor 3 produces a retina-grade PNG at
 * the target resolution while keeping the polaroid (`max-width: 440px`)
 * naturally framed with paper background around it.
 *
 * One browser per call — no pool — because this endpoint is only exercised
 * by the admin on-demand.
 */
export async function renderPrintImage(url: string): Promise<Buffer> {
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 500, height: 625 },
      deviceScaleFactor: 3,
    });
    const page = await ctx.newPage();
    // Emulate "screen" so we keep the rotation, soft shadow, and washi tape
    // (all stripped by @media print). The whole point of moving from PDF to
    // PNG is to preserve those on-screen aesthetics.
    await page.emulateMedia({ media: "screen" });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // A beat to let Google Fonts (Italianno, Cormorant) finish loading and
    // the cover photo decode before we snapshot.
    await page.waitForTimeout(500);
    return await page.screenshot({ type: "png", fullPage: false });
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 3: Verify TypeScript still compiles (the file is now imported under its old name in the route)**

Run: `cd api && npx tsc --noEmit`
Expected: FAIL with an error like `Cannot find module '../../lib/print-pdf.js'` from `routes/admin/print.ts`. This is the cue for Task 2.

- [ ] **Step 4: Do NOT commit yet**

The codebase is currently broken (the import in `routes/admin/print.ts` is dangling). Task 2 fixes it; we'll commit Tasks 1 + 2 together as one logical unit.

---

## Task 2: Replace the `/pdf` admin endpoint with `/image`

**Files:**
- Modify: `api/src/routes/admin/print.ts`

- [ ] **Step 1: Replace the `/pdf` route with `/image`**

Open `api/src/routes/admin/print.ts` and replace its entire contents with:

```ts
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db, schema } from "../../db/client.js";
import { env } from "../../env.js";
import { getPrintAccessToken, rotatePrintAccessToken } from "../../lib/access-token.js";
import { ValidationError } from "../../lib/errors.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { renderPrintImage } from "../../lib/print-image.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { tweaks } = schema;

const app = new Hono();
app.use("*", requireAdmin);

app.get("/link", async (c) => {
  const token = await getPrintAccessToken();
  if (!token) return c.json({ error: "not_initialised" }, 500);
  return c.json({ token, link: `${env.PUBLIC_ORIGIN}/print?k=${token}` });
});

app.post("/rotate", async (c) => {
  assertSameOrigin(c);
  const token = await rotatePrintAccessToken();
  return c.json({ token, link: `${env.PUBLIC_ORIGIN}/print?k=${token}` });
});

/**
 * Slugify a baby name for use in a download filename.
 * "Éloïse-Marie" → "eloise-marie", "  " → "", "Léon!" → "leon".
 */
function slugifyBabyName(name: string | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    // Strip combining diacritics (Unicode block U+0300..U+036F).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.get("/image", async (c) => {
  const token = await getPrintAccessToken();
  if (!token) throw new ValidationError("print_token_missing");

  const [row] = await db.select().from(tweaks).where(eq(tweaks.key, "babyName"));
  const slug = slugifyBabyName(row?.value);
  const filename = slug ? `annonce-naissance-${slug}.png` : "annonce-naissance.png";

  const url = `${env.PRINT_BASE_URL}/print?k=${encodeURIComponent(token)}`;
  const png = await renderPrintImage(url);

  c.header("Content-Type", "image/png");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("Cache-Control", "no-store");
  return stream(c, async (s) => {
    const webStream = Readable.toWeb(Readable.from(png)) as unknown as ReadableStream<Uint8Array>;
    await s.pipe(webStream);
  });
});

export default app;
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `cd api && npx tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 3: Commit Tasks 1 + 2 together**

```bash
git add api/src/lib/print-image.ts api/src/routes/admin/print.ts
git commit -m "feat(api): replace admin PDF download with PNG image at /api/admin/print/image"
```

Note: the rename of `print-pdf.ts` → `print-image.ts` (done with `git mv` in Task 1) is included in this commit.

---

## Task 3: Update tests for the new endpoint (TDD-style: fix tests, then re-run)

**Files:**
- Modify: `api/test/print.test.ts`

- [ ] **Step 1: Run the test suite to see the current failure**

Run: `cd api && npx vitest run test/print.test.ts`
Expected: The `/api/admin/print/pdf` tests fail because the route no longer exists (404 instead of 401/400). This confirms we're about to delete the right tests.

- [ ] **Step 2: Delete the two obsolete `/pdf` tests and the trailing comment**

Open `api/test/print.test.ts` and remove these blocks (currently at lines 162-179):

```ts
test("GET /api/admin/print/pdf requires admin", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/print/pdf"));
  expect(res.status).toBe(401);
}, 30_000);

test("GET /api/admin/print/pdf rejects unknown format", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/print/pdf?format=a3", {
    headers: { cookie },
  }));
  expect(res.status).toBe(400);
}, 30_000);

// Note: we do NOT spin up Playwright in unit tests. The 200-path for /pdf is
// exercised manually during Task 14 (E2E verification).
```

- [ ] **Step 3: Append the new `/image` auth test + updated note at the end of the file**

Add this at the end of `api/test/print.test.ts`:

```ts
test("GET /api/admin/print/image requires admin", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/print/image"));
  expect(res.status).toBe(401);
}, 30_000);

// Note: we do NOT spin up Playwright in unit tests. The 200-path for /image is
// exercised manually during the verification task at the end of this plan.
```

- [ ] **Step 4: Run the full test file and verify it passes**

Run: `cd api && npx vitest run test/print.test.ts`
Expected: PASS — all tests green, including the new `/image` auth test.

- [ ] **Step 5: Run the full test suite to make sure nothing else regressed**

Run: `cd api && npx vitest run`
Expected: PASS — all tests across all files green. (If anything red is unrelated to this work, stop and investigate before continuing.)

- [ ] **Step 6: Commit**

```bash
git add api/test/print.test.ts
git commit -m "test(api): retarget print admin tests at /image endpoint"
```

---

## Task 4: Update the admin UI to download an image instead of two PDFs

**Files:**
- Modify: `web/admin.js` (lines 994-1054 specifically — the PDF section + `downloadPdf` function)

- [ ] **Step 1: Replace the PDF download section in `renderPrintTab`**

In `web/admin.js`, locate the block starting at line 994 with the comment `// PDF download` and ending at line 1025 (the `tab.appendChild(pdfItem);` for the PDF section). Replace **the entire block from the comment through that final `tab.appendChild(pdfItem);`** with:

```js
  // Image download
  const imgTitle = document.createElement('div');
  imgTitle.className = 'section-title';
  imgTitle.textContent = "Télécharger l'image";
  tab.appendChild(imgTitle);

  const imgItem = document.createElement('div');
  imgItem.className = 'item';
  const imgActions = document.createElement('div');

  const imgBtn = document.createElement('button');
  imgBtn.textContent = "Télécharger l'image (PNG)";
  imgBtn.addEventListener('click', () => downloadImage(imgBtn));

  imgActions.appendChild(imgBtn);
  imgItem.appendChild(imgActions);

  const imgNote = document.createElement('p');
  imgNote.style.marginTop = '12px';
  imgNote.style.fontSize = '13px';
  imgNote.style.color = 'var(--muted)';
  imgNote.textContent = "Image PNG haute résolution (1500×1875). Idéale pour partage WhatsApp, SMS, ou impression à la maison.";
  imgItem.appendChild(imgNote);

  tab.appendChild(imgItem);
}
```

(Note: the closing `}` is the end of `renderPrintTab` — keep it. The original block ended with `tab.appendChild(pdfItem);` on line 1025 followed by `}` on line 1026; the replacement preserves that closing brace.)

- [ ] **Step 2: Replace the `downloadPdf` function with `downloadImage`**

Locate the function `async function downloadPdf(format, btn)` (lines 1028-1054 in the current file). Replace **the entire function** with:

```js
async function downloadImage(btn) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Génération…';
  try {
    const r = await fetch('/api/admin/print/image');
    if (!r.ok) {
      btn.textContent = `Erreur ${r.status}`;
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
      return;
    }
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
    btn.textContent = 'Téléchargé ✓';
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1500);
  } catch (err) {
    btn.textContent = 'Erreur';
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
  }
}
```

- [ ] **Step 3: Static check (grep) — ensure no stale references remain**

Run: `cd web && grep -n "downloadPdf\|/api/admin/print/pdf\|PDF A4\|PDF Letter" admin.js`
Expected: no output. (If anything matches, you missed an occurrence — go fix it.)

- [ ] **Step 4: Commit**

```bash
git add web/admin.js
git commit -m "feat(web): admin downloads PNG image instead of A4/Letter PDFs"
```

---

## Task 5: Manual end-to-end verification

The Playwright code path is not unit-tested, so this manual check is the only signal that the feature actually works. Do not skip.

- [ ] **Step 1: Build and start the dev stack**

Run (from repo root):
```bash
docker compose -f docker-compose.dev.yml up -d --build api caddy
```
Expected: both services come up healthy. The `api` rebuild includes our changes.

- [ ] **Step 2: Open the admin and verify the print tab UI**

In a browser, go to the admin (typically `http://localhost:8080/admin` — confirm with `Caddyfile.dev` if unsure), log in, click the "Print" tab.

Expected:
- One section titled `Télécharger l'image` with a single button labelled `Télécharger l'image (PNG)`.
- The note below reads `Image PNG haute résolution (1500×1875). Idéale pour partage WhatsApp, SMS, ou impression à la maison.`
- No "Télécharger PDF A4" or "Télécharger PDF Letter" buttons anywhere on the page.

- [ ] **Step 3: Trigger the download**

Click the button.

Expected:
- Button text changes to `Génération…` for ~2-4 seconds (Playwright launching Chromium).
- Browser downloads a file named `annonce-naissance-<slug>.png` (slug = lowercased baby name with accents stripped). If `babyName` is empty, the filename is `annonce-naissance.png`.
- Button text changes to `Téléchargé ✓` then back to its original label after ~1.5 s.

- [ ] **Step 4: Open the PNG and visually verify**

Open the downloaded file in any image viewer.

Expected:
- Dimensions exactly **1500×1875** (verify in viewer info or `file <path>.png`).
- The polaroid is visible, **rotated `-1.6deg`** (slight tilt).
- The **washi tape** doré is visible at the top of the polaroid.
- A soft **shadow** is visible under the polaroid.
- The **paper** background (warm crème, not pure white) surrounds the polaroid with a small breathing margin.
- The cover photo (if uploaded) renders correctly inside the polaroid frame; otherwise the `— photo à venir —` fallback is visible.
- All text (`Italianno` calligraphy on the name, italic serif elsewhere) renders with the proper fonts — **not** a system fallback like Times.

If the fonts look wrong (system fallback): the `waitForTimeout(500)` in `print-image.ts` may be too short on a cold Chromium. Increase to `1000` and re-test before reporting the task as complete.

- [ ] **Step 5: Sanity check the auth gate**

Run:
```bash
curl -i http://localhost:8080/api/admin/print/image
```
Expected: HTTP `401 Unauthorized` (no admin cookie).

- [ ] **Step 6: Stop the dev stack**

Run:
```bash
docker compose -f docker-compose.dev.yml down
```

- [ ] **Step 7: No commit needed for verification — but if you tweaked `waitForTimeout`, commit that fix:**

```bash
git add api/src/lib/print-image.ts
git commit -m "fix(api): bump font-load wait to 1000ms in print-image renderer"
```
