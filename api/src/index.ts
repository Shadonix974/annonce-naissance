import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { runSeeds } from "./db/seeds.js";
import { requestLogger } from "./lib/logger.js";
import { onError } from "./middleware/error-handler.js";

const app = new Hono();
app.use("*", requestLogger);
app.onError(onError);
app.get("/healthz", (c) => c.json({ ok: true }));

async function main(): Promise<void> {
  await runMigrations();
  await runSeeds();
  serve({ fetch: app.fetch, port: env.PORT });
  // eslint-disable-next-line no-console
  console.log(`listening on :${env.PORT}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("boot failed:", e);
  process.exit(1);
});
