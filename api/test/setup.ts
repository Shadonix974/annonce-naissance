import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let pgContainer: StartedPostgreSqlContainer | undefined;
let minioContainer: StartedTestContainer | undefined;

export async function setup(): Promise<() => Promise<void>> {
  // Start both containers in parallel to save ~5s.
  const [pg, m] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine").withDatabase("test").start(),
    new GenericContainer("minio/minio:latest")
      .withCommand(["server", "/data"])
      .withEnvironment({
        MINIO_ROOT_USER: "minioadmin",
        MINIO_ROOT_PASSWORD: "minioadmin",
      })
      .withExposedPorts(9000)
      .start(),
  ]);
  pgContainer = pg;
  minioContainer = m;

  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.SESSION_SECRET = "0123456789012345678901234567890123456789";
  process.env.ADMIN_PASSWORD_HASH = "placeholder-overridden-per-test";
  process.env.MINIO_ENDPOINT = `http://${m.getHost()}:${m.getMappedPort(9000)}`;
  process.env.MINIO_BUCKET = "annonce-test";
  process.env.MINIO_ACCESS_KEY = "minioadmin";
  process.env.MINIO_SECRET_KEY = "minioadmin";
  process.env.PUBLIC_ORIGIN = "http://localhost:3000";

  // Ensure the bucket exists before any test runs.
  // Dynamic import AFTER env is set so lib/minio.ts sees the right values.
  const { ensureBucket } = await import("../src/lib/minio.js");
  await ensureBucket();

  return async () => {
    await Promise.all([pgContainer?.stop(), minioContainer?.stop()]);
  };
}
