import { Readable } from "node:stream";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { env } from "../../env.js";
import { getPrintAccessToken, rotatePrintAccessToken } from "../../lib/access-token.js";
import { ValidationError } from "../../lib/errors.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { renderPrintPdf, type PrintFormat } from "../../lib/print-pdf.js";
import { requireAdmin } from "../../middleware/require-admin.js";

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

app.get("/pdf", async (c) => {
  const rawFormat = c.req.query("format") ?? "a4";
  const formatMap: Record<string, PrintFormat> = { a4: "A4", letter: "Letter" };
  const format = formatMap[rawFormat.toLowerCase()];
  if (!format) throw new ValidationError("bad_format");

  const token = await getPrintAccessToken();
  if (!token) throw new ValidationError("print_token_missing");

  const url = `${env.PRINT_BASE_URL}/print?k=${encodeURIComponent(token)}`;
  const pdf = await renderPrintPdf(url, format);

  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `attachment; filename="annonce-naissance-${format.toLowerCase()}.pdf"`);
  c.header("Cache-Control", "no-store");
  return stream(c, async (s) => {
    const webStream = Readable.toWeb(Readable.from(pdf)) as unknown as ReadableStream<Uint8Array>;
    await s.pipe(webStream);
  });
});

export default app;
