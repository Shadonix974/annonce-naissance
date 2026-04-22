import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { runSeeds } from "./db/seeds.js";
import { app } from "./app.js";

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
