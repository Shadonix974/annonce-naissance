import type { MiddlewareHandler } from "hono";
import { loadSession, throwIfNoSession } from "../lib/auth.js";

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const session = await loadSession(c);
  throwIfNoSession(session);
  c.set("adminSession" as never, session);
  await next();
};
