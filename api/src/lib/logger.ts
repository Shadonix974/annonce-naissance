import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import pino from "pino";
import { env } from "../env.js";

export const log = pino({ level: env.LOG_LEVEL });

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const reqId = c.req.header("x-request-id") ?? randomUUID();
  c.set("reqId" as never, reqId);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  log.info(
    { reqId, method: c.req.method, path: c.req.path, status: c.res.status, ms },
    "request",
  );
  c.header("x-request-id", reqId);
};
