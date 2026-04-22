import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { tweaks } = schema;

const Body = z.record(z.string().min(1).max(128), z.string().max(4096));

const app = new Hono();

app.patch("/", requireAdmin, zValidator("json", Body), async (c) => {
  assertSameOrigin(c);
  const patch = c.req.valid("json");
  const entries = Object.entries(patch);
  if (entries.length === 0) return c.json({ updated: 0 });

  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx
        .insert(tweaks)
        .values({ key, value })
        .onConflictDoUpdate({
          target: tweaks.key,
          set: { value, updatedAt: sql`now()` },
        });
    }
  });

  return c.json({ updated: entries.length });
});

export default app;
