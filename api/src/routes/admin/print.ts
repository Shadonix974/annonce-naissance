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
