import { Hono } from "hono";
import { requestLogger } from "./lib/logger.js";
import { onError } from "./middleware/error-handler.js";

export const app = new Hono();
app.use("*", requestLogger);
app.onError(onError);
app.get("/healthz", (c) => c.json({ ok: true }));
