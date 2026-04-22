import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("test").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.SESSION_SECRET = "0123456789012345678901234567890123456789";
  process.env.ADMIN_PASSWORD_HASH = "placeholder-overridden-per-test";
  process.env.MINIO_ENDPOINT = "http://localhost:9000";
  process.env.MINIO_BUCKET = "annonce-test";
  process.env.MINIO_ACCESS_KEY = "x";
  process.env.MINIO_SECRET_KEY = "x";
  process.env.PUBLIC_ORIGIN = "http://localhost:3000";
  return async () => { await container?.stop(); };
}
