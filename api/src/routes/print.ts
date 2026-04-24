import { Readable } from "node:stream";
import { eq, desc } from "drizzle-orm";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db, schema } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";
import { getReadStream, objectKey } from "../lib/minio.js";
import { requirePrintAccessToken } from "../middleware/require-print-access-token.js";

const { tweaks, photos } = schema;

// The subset of tweaks exposed to the print page. Keeps the surface minimal
// (we don't want to leak gifts, timeline, or unrelated tweaks to recipients
// of the print token).
const PRINT_TWEAK_KEYS = [
  "babyName", "babyMiddle", "dateLong", "timeBirth",
  "weight", "height", "city", "maternity",
  "father", "mother",
] as const;

const app = new Hono();
app.use("*", requirePrintAccessToken);

app.get("/state", async (c) => {
  const [tweakRows, [cover]] = await Promise.all([
    db.select().from(tweaks),
    db.select().from(photos)
      .where(eq(photos.section, "print-cover"))
      .orderBy(desc(photos.uploadedAt))
      .limit(1),
  ]);

  const tweaksDict: Record<string, string> = {};
  for (const t of tweakRows) {
    if ((PRINT_TWEAK_KEYS as readonly string[]).includes(t.key)) {
      tweaksDict[t.key] = t.value;
    }
  }

  return c.json({
    tweaks: tweaksDict,
    cover: cover ? {
      id: cover.id,
      width: cover.width,
      height: cover.height,
      version: cover.version,
    } : null,
  });
});

app.get("/cover.jpg", async (c) => {
  const [cover] = await db.select().from(photos)
    .where(eq(photos.section, "print-cover"))
    .orderBy(desc(photos.uploadedAt))
    .limit(1);
  if (!cover) throw new NotFoundError();

  let nodeStream: NodeJS.ReadableStream;
  try {
    nodeStream = await getReadStream(objectKey(cover.id, "full", "jpg"));
  } catch {
    throw new NotFoundError();
  }

  c.header("Content-Type", "image/jpeg");
  c.header("Cache-Control", "no-store");
  return stream(c, async (s) => {
    const webStream = Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream<Uint8Array>;
    await s.pipe(webStream);
  });
});

export default app;
