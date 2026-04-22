import { Hono } from "hono";
import { zValidator } from "../../lib/validate.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { NotFoundError } from "../../lib/errors.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { timelineEvents } = schema;

const Create = z.object({
  dateLabel: z.string().min(1).max(80),
  text: z.string().min(1).max(400),
  position: z.number().int().min(0).default(0),
  isNow: z.boolean().default(false),
});
const Update = Create.partial();

type InsertValues = {
  dateLabel: string;
  text: string;
  position: number;
  isNow: boolean;
};

type UpdateValues = Partial<InsertValues>;

const app = new Hono();
app.use("*", requireAdmin);

app.post("/", zValidator("json", Create), async (c) => {
  assertSameOrigin(c);
  const data = c.req.valid("json");
  const values: InsertValues = {
    dateLabel: data.dateLabel,
    text: data.text,
    position: data.position,
    isNow: data.isNow,
  };
  const [row] = await db.insert(timelineEvents).values(values).returning();
  return c.json(row, 201);
});

app.patch("/:id", zValidator("json", Update), async (c) => {
  assertSameOrigin(c);
  const data = c.req.valid("json");
  const values: UpdateValues = {};
  if (data.dateLabel !== undefined) values.dateLabel = data.dateLabel;
  if (data.text !== undefined) values.text = data.text;
  if (data.position !== undefined) values.position = data.position;
  if (data.isNow !== undefined) values.isNow = data.isNow;
  const [row] = await db.update(timelineEvents)
    .set(values)
    .where(eq(timelineEvents.id, c.req.param("id")))
    .returning();
  if (!row) throw new NotFoundError();
  return c.json(row);
});

app.delete("/:id", async (c) => {
  assertSameOrigin(c);
  const [row] = await db.delete(timelineEvents).where(eq(timelineEvents.id, c.req.param("id"))).returning();
  if (!row) throw new NotFoundError();
  return c.json({ ok: true });
});

export default app;
