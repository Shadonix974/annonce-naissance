import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { runSeeds } from "./db/seeds.js";
import { ensureBucket } from "./lib/minio.js";
import { app } from "./app.js";

async function main(): Promise<void> {
  await runMigrations();
  await runSeeds();
  await ensureBucket();
  serve({ fetch: app.fetch, port: env.PORT });
  // eslint-disable-next-line no-console
  console.log(`listening on :${env.PORT}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("boot failed:", e);
  process.exit(1);
});
