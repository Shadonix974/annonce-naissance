import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createSession, destroyAllSessions, destroySession, verifyAdminPassword } from "../../lib/auth.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { rateLimit } from "../../lib/rate-limit.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const app = new Hono();

app.post(
  "/login",
  zValidator("json", z.object({ password: z.string().min(1).max(256) })),
  async (c) => {
    assertSameOrigin(c);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    rateLimit(`login:${ip}`, 10, 15 * 60_000);
    const { password } = c.req.valid("json");
    const ok = await verifyAdminPassword(password);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
      throw new UnauthorizedError("invalid_credentials");
    }
    await createSession(c, c.req.header("user-agent"));
    return c.json({ ok: true });
  },
);

app.post("/logout", requireAdmin, async (c) => {
  assertSameOrigin(c);
  await destroySession(c);
  return c.json({ ok: true });
});

app.get("/me", requireAdmin, (c) => c.json({ ok: true }));

app.post("/destroy-all-sessions", requireAdmin, async (c) => {
  assertSameOrigin(c);
  await destroyAllSessions();
  return c.json({ ok: true });
});

export default app;
