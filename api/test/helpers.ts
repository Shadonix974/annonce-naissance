import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.js";

export async function resetDb(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./src/migrations" });
  await pool.query(`
    TRUNCATE admin_sessions, gifts, timeline_events, photos, tweaks, settings RESTART IDENTITY CASCADE
  `);
  await pool.end();
}

export async function buildApp() {
  const { app } = await import("../src/app.js");
  return app;
}

export async function httpJson(app: Awaited<ReturnType<typeof buildApp>>, req: Request): Promise<{
  status: number;
  headers: Headers;
  body: unknown;
}> {
  const res = await app.fetch(req);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, headers: res.headers, body };
}
