import type { Context } from "hono";
import pino from "pino";
import { env } from "../env.js";
import { HttpError } from "../lib/errors.js";

const log = pino({ level: env.LOG_LEVEL });

export function onError(err: Error, c: Context): Response {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 429);
  }
  const reqId = c.get("reqId" as never) as string | undefined;
  log.error({ err, reqId, path: c.req.path, method: c.req.method }, "unhandled error");
  return c.json({ error: "internal" }, 500);
}
