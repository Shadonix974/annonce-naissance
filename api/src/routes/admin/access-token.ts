import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../../db/client.js";
import { env } from "../../env.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { settings } = schema;

const app = new Hono();
app.use("*", requireAdmin);

app.post("/rotate", async (c) => {
  assertSameOrigin(c);
  const newToken = randomBytes(18).toString("base64url");
  await db.update(settings).set({
    accessToken: newToken,
    tokenRotatedAt: sql`now()`,
    updatedAt: sql`now()`,
  }).where(sql`${settings.id} = 1`);
  return c.json({ token: newToken, link: `${env.PUBLIC_ORIGIN}/?k=${newToken}` });
});

app.get("/link", async (c) => {
  const [s] = await db.select().from(settings).limit(1);
  if (!s) return c.json({ error: "not_initialised" }, 500);
  return c.json({ token: s.accessToken, link: `${env.PUBLIC_ORIGIN}/?k=${s.accessToken}` });
});

export default app;
