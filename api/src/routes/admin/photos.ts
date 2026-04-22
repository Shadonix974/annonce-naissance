import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { zValidator } from "../../lib/validate.js";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { getReadStream, objectKey, originalKey, putBuffer, removePrefix } from "../../lib/minio.js";
import { normaliseOriginal, processPhoto } from "../../lib/sharp-pipeline.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { photos } = schema;

const ACCEPTED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);
const MAX_BYTES = 15 * 1024 * 1024;

const app = new Hono();
app.use("*", requireAdmin);

app.post("/", async (c) => {
  assertSameOrigin(c);
  const form = await c.req.parseBody({ all: false });
  const file = form["file"];
  const section = String(form["section"] ?? "");
  const alt = String(form["alt"] ?? "");
  const position = Number(form["position"] ?? 0);
  const cropped = String(form["cropped"] ?? "") === "1";

  if (!(file instanceof File)) throw new ValidationError("missing_file");
  if (!ACCEPTED_MIME.has(file.type)) throw new ValidationError("unsupported_type");
  if (file.size > MAX_BYTES) throw new ValidationError("file_too_large");
  if (!["triptych", "gallery"].includes(section)) throw new ValidationError("bad_section");
  if (!alt.trim()) throw new ValidationError("alt_required");

  const buf = Buffer.from(await file.arrayBuffer());
  const [processed, originalJpg] = await Promise.all([
    processPhoto(buf),
    normaliseOriginal(buf),
  ]);

  const id = randomUUID();
  await Promise.all([
    ...processed.variants.map((v) => putBuffer(objectKey(id, v.size, v.format), v.buffer, v.contentType)),
    putBuffer(originalKey(id), originalJpg, "image/jpeg"),
  ]);

  type InsertValues = {
    id: string;
    section: string;
    position: number;
    alt: string;
    width: number;
    height: number;
    blurhash: string | null;
    cropped: boolean;
  };

  const values: InsertValues = {
    id,
    section,
    position: Number.isFinite(position) ? position : 0,
    alt,
    width: processed.width,
    height: processed.height,
    blurhash: processed.blurhash ?? null,
    cropped,
  };

  const [row] = await db.insert(photos).values(values).returning();

  return c.json(row, 201);
});

app.patch(
  "/:id",
  zValidator("json", z.object({
    alt: z.string().max(400).optional(),
    position: z.number().int().min(0).optional(),
    section: z.enum(["triptych", "gallery"]).optional(),
  })),
  async (c) => {
    assertSameOrigin(c);
    const patch = c.req.valid("json");
    // Drop undefined keys (exactOptionalPropertyTypes workaround)
    const update: Record<string, unknown> = {};
    if (patch.alt !== undefined) update["alt"] = patch.alt;
    if (patch.position !== undefined) update["position"] = patch.position;
    if (patch.section !== undefined) update["section"] = patch.section;
    const [row] = await db.update(photos).set(update).where(eq(photos.id, c.req.param("id"))).returning();
    if (!row) throw new NotFoundError();
    return c.json(row);
  },
);

app.delete("/:id", async (c) => {
  assertSameOrigin(c);
  const id = c.req.param("id");
  const [row] = await db.delete(photos).where(eq(photos.id, id)).returning();
  if (!row) throw new NotFoundError();
  await removePrefix(`photos/${id}/`);
  return c.json({ ok: true });
});

app.get("/:id/original", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(photos).where(eq(photos.id, id));
  if (!row) throw new NotFoundError();

  let nodeStream: NodeJS.ReadableStream;
  try {
    nodeStream = await getReadStream(originalKey(id));
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
