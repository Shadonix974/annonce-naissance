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
