import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";

const app = new Hono();
app.get("/healthz", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: env.PORT });
// eslint-disable-next-line no-console
console.log(`listening on :${env.PORT}`);
