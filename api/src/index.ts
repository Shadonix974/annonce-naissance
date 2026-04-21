import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/healthz", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`listening on :${port}`);
