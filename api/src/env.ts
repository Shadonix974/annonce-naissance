import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  ADMIN_PASSWORD_HASH: z.string().min(1),

  MINIO_ENDPOINT: z.string().url(),
  MINIO_BUCKET: z.string().min(1),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),

  PUBLIC_ORIGIN: z.string().url(),

  // Where Playwright (running inside the api container) fetches the print page
  // when generating a PDF. Dev: http://caddy:8080 via docker DNS. Prod: the
  // public origin served over HTTPS.
  PRINT_BASE_URL: z.string().url().default("http://caddy:8080"),
});

export type Env = z.infer<typeof Env>;

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
