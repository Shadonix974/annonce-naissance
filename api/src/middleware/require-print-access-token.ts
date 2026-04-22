import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { getPrintAccessToken, tokensEqual } from "../lib/access-token.js";
import { NotFoundError } from "../lib/errors.js";

export const requirePrintAccessToken: MiddlewareHandler = async (c, next) => {
  const got =
    c.req.header("x-print-access-token") ??
    getCookie(c, "_kp") ??
    c.req.query("k") ??
    "";
  const expected = await getPrintAccessToken();
  if (!expected || !got || !tokensEqual(got, expected)) {
    // 404, not 401 — we never admit the resource exists without the token
    // (mirrors the pattern used by the main requireAccessToken middleware).
    throw new NotFoundError();
  }
  await next();
};
