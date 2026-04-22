import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "../../lib/validate.js";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { objectKey, putBuffer, removePrefix } from "../../lib/minio.js";
import { processPhoto } from "../../lib/sharp-pipeline.js";
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

  if (!(file instanceof File)) throw new ValidationError("missing_file");
  if (!ACCEPTED_MIME.has(file.type)) throw new ValidationError("unsupported_type");
  if (file.size > MAX_BYTES) throw new ValidationError("file_too_large");
  if (!["triptych", "gallery"].includes(section)) throw new ValidationError("bad_section");

  const buf = Buffer.from(await file.arrayBuffer());
  const processed = await processPhoto(buf);

  const id = randomUUID();
  await Promise.all(
    processed.variants.map((v) => putBuffer(objectKey(id, v.size, v.format), v.buffer, v.contentType)),
  );

  type InsertValues = {
    id: string;
    section: string;
    position: number;
    alt: string;
    width: number;
    height: number;
    blurhash: string | null;
  };

  const values: InsertValues = {
    id,
    section,
    position: Number.isFinite(position) ? position : 0,
    alt,
    width: processed.width,
    height: processed.height,
    blurhash: processed.blurhash ?? null,
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

export default app;
