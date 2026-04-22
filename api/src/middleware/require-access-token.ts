import type { MiddlewareHandler } from "hono";
import { getAccessToken, tokensEqual } from "../lib/access-token.js";
import { NotFoundError } from "../lib/errors.js";

export const requireAccessToken: MiddlewareHandler = async (c, next) => {
  const got = c.req.header("x-access-token") ?? c.req.query("k") ?? "";
  const expected = await getAccessToken();
  if (!expected || !got || !tokensEqual(got, expected)) {
    // 404, not 401 — we never admit the resource exists without the token
    throw new NotFoundError();
  }
  await next();
};
