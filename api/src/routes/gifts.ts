import { Hono } from "hono";
import { zValidator } from "../lib/validate.js";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { bus } from "../lib/event-bus.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const { gifts } = schema;

const app = new Hono();
app.use("*", requireAccessToken);

const ReserveBody = z.object({
  name: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).optional(),
});

function normName(s: string): string {
  return s.trim().toLowerCase();
}

app.post("/:id/reserve", zValidator("json", ReserveBody), async (c) => {
  const id = c.req.param("id");
  const { name, note } = c.req.valid("json");

  // Conditional update: only reserve if takenBy IS NULL (concurrency-safe)
  const result = await db
    .update(gifts)
    .set({ takenBy: name.trim(), takenNote: note ?? null, takenAt: new Date() })
    .where(and(eq(gifts.id, id), isNull(gifts.takenBy)))
    .returning();

  if (result.length === 0) {
    const existing = await db.select().from(gifts).where(eq(gifts.id, id)).limit(1);
    if (existing.length === 0) throw new NotFoundError("gift_not_found");
    throw new ConflictError("already_reserved");
  }
  const g = result[0]!;
  bus.emitGift({
    type: "gift.reserved",
    id: g.id,
    taken_by: g.takenBy!,
    taken_note: g.takenNote,
    taken_at: g.takenAt!.toISOString(),
  });
  return c.json(g);
});

app.post(
  "/:id/unreserve",
  zValidator("json", z.object({ name: z.string().trim().min(1).max(80) })),
  async (c) => {
    const id = c.req.param("id");
    const { name } = c.req.valid("json");

    const [existing] = await db.select().from(gifts).where(eq(gifts.id, id)).limit(1);
    if (!existing) throw new NotFoundError("gift_not_found");
    if (!existing.takenBy) return c.json(existing);
    if (normName(existing.takenBy) !== normName(name)) throw new ForbiddenError("not_reserver");

    const [g] = await db
      .update(gifts)
      .set({ takenBy: null, takenNote: null, takenAt: null })
      .where(eq(gifts.id, id))
      .returning();
    bus.emitGift({ type: "gift.unreserved", id: g!.id });
    return c.json(g);
  },
);

export default app;
