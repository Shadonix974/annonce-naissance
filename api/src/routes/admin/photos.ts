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
import sharp from "sharp";
import { generateVariants, normaliseOriginal, processPhoto } from "../../lib/sharp-pipeline.js";
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

// Must be declared BEFORE /:id — Hono's router does NOT prioritise literal
// segments over params in this version, so /:id would otherwise match
// "reorder" as an id.
app.patch(
  "/reorder",
  zValidator("json", z.object({
    order: z.array(z.object({
      id: z.string().uuid(),
      section: z.enum(["triptych", "gallery"]),
      position: z.number().int().min(0),
    })).min(1),
  })),
  async (c) => {
    assertSameOrigin(c);
    const { order } = c.req.valid("json");

    await db.transaction(async (tx) => {
      for (const item of order) {
        const [row] = await tx.update(photos)
          .set({ section: item.section, position: item.position })
          .where(eq(photos.id, item.id))
          .returning({ id: photos.id });
        if (!row) throw new NotFoundError();
      }
    });

    return c.json({ ok: true });
  },
);

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

app.patch(
  "/:id/recrop",
  zValidator("json", z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })),
  async (c) => {
    assertSameOrigin(c);
    const id = c.req.param("id");
    const { x, y, width, height } = c.req.valid("json");

    const [row] = await db.select().from(photos).where(eq(photos.id, id));
    if (!row) throw new NotFoundError();

    let originalBuf: Buffer;
    try {
      const s = await getReadStream(originalKey(id));
      const chunks: Buffer[] = [];
      for await (const ch of s) chunks.push(Buffer.from(ch));
      originalBuf = Buffer.concat(chunks);
    } catch {
      throw new NotFoundError("original_missing");
    }

    // Bounds check — reject before heavy sharp work.
    const srcMeta = await sharp(originalBuf).metadata();
    if (!srcMeta.width || !srcMeta.height) throw new ValidationError("invalid_original");
    if (x + width > srcMeta.width || y + height > srcMeta.height) {
      throw new ValidationError("out_of_bounds");
    }

    // rotate() is a no-op here (original already EXIF-rotated on upload) but
    // keeps the pipeline symmetrical and safe against future changes.
    const base = sharp(originalBuf).rotate().extract({ left: x, top: y, width, height });
    const processed = await generateVariants(base);

    await Promise.all(
      processed.variants.map((v) =>
        putBuffer(objectKey(id, v.size, v.format), v.buffer, v.contentType),
      ),
    );

    // Use the crop region dimensions directly: sharp's .metadata() on a chained
    // pipeline returns the input (pre-extract) dimensions, not the output dims.
    const [updated] = await db.update(photos)
      .set({
        width,
        height,
        blurhash: processed.blurhash ?? null,
        version: row.version + 1,
      })
      .where(eq(photos.id, id))
      .returning();

    return c.json(updated);
  },
);

export default app;
