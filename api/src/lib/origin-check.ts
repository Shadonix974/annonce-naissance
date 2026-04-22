import type { Context } from "hono";
import { env } from "../env.js";
import { ForbiddenError } from "./errors.js";

export function assertSameOrigin(c: Context): void {
  const origin = c.req.header("origin");
  // Safari sometimes omits Origin on same-origin requests; fall back to Referer check
  const ref = c.req.header("referer");
  if (origin && origin === env.PUBLIC_ORIGIN) return;
  if (!origin && ref && ref.startsWith(env.PUBLIC_ORIGIN)) return;
  throw new ForbiddenError("bad_origin");
}
