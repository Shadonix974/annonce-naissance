import { Hono } from "hono";
import { env } from "../../env.js";
import { getPrintAccessToken, rotatePrintAccessToken } from "../../lib/access-token.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

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

export default app;
