import { Hono } from "hono";
import { zValidator } from "../../lib/validate.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { NotFoundError } from "../../lib/errors.js";
import { bus } from "../../lib/event-bus.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { gifts } = schema;

const Create = z.object({
  name: z.string().min(1).max(160),
  rangeText: z.string().min(1).max(40),
  url: z.string().url().optional(),
  position: z.number().int().min(0).default(0),
  photoId: z.string().uuid().optional(),
});
const Update = Create.partial();

type InsertValues = {
  name: string;
  rangeText: string;
  url: string | null;
  position: number;
  photoId: string | null;
};

type UpdateValues = Partial<InsertValues>;

const app = new Hono();
app.use("*", requireAdmin);

app.post("/", zValidator("json", Create), async (c) => {
  assertSameOrigin(c);
  const data = c.req.valid("json");
  const values: InsertValues = {
    name: data.name,
    rangeText: data.rangeText,
    url: data.url ?? null,
    position: data.position,
    photoId: data.photoId ?? null,
  };
  const [g] = await db.insert(gifts).values(values).returning();
  bus.emitGift({ type: "gift.created", gift: g });
  return c.json(g, 201);
});

app.patch("/:id", zValidator("json", Update), async (c) => {
  assertSameOrigin(c);
  const data = c.req.valid("json");
  const values: UpdateValues = {};
  if (data.name !== undefined) values.name = data.name;
  if (data.rangeText !== undefined) values.rangeText = data.rangeText;
  if ("url" in data) values.url = data.url ?? null;
  if (data.position !== undefined) values.position = data.position;
  if ("photoId" in data) values.photoId = data.photoId ?? null;
  const [g] = await db.update(gifts).set(values).where(eq(gifts.id, c.req.param("id"))).returning();
  if (!g) throw new NotFoundError("gift_not_found");
  bus.emitGift({ type: "gift.updated", gift: g });
  return c.json(g);
});

app.delete("/:id", async (c) => {
  assertSameOrigin(c);
  const [g] = await db.delete(gifts).where(eq(gifts.id, c.req.param("id"))).returning();
  if (!g) throw new NotFoundError("gift_not_found");
  bus.emitGift({ type: "gift.deleted", id: g.id });
  return c.json({ ok: true });
});

app.post("/:id/force-unreserve", async (c) => {
  assertSameOrigin(c);
  const id = c.req.param("id");
  const [g] = await db.update(gifts)
    .set({ takenBy: null, takenNote: null, takenAt: null })
    .where(eq(gifts.id, id)).returning();
  if (!g) throw new NotFoundError("gift_not_found");
  bus.emitGift({ type: "gift.unreserved", id: g.id });
  return c.json(g);
});

export default app;
