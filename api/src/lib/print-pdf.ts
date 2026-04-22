import { chromium } from "playwright";

export type PrintFormat = "A4" | "Letter";

/**
 * Launches a headless Chromium, navigates to the print page, and returns the
 * page printed as a PDF buffer. One browser per call — no pool — because
 * this endpoint is only exercised by the admin on-demand.
 */
export async function renderPrintPdf(url: string, format: PrintFormat): Promise<Buffer> {
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // A beat to let fonts load and images decode before we snapshot.
    await page.waitForTimeout(500);
    return await page.pdf({
      format,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }
}
