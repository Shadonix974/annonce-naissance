# Annonce-naissance V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing static birth-announcement maquette into a privately-shared, self-hosted web experience with a shared gift registry, a real photo gallery, an admin mode for the parents, and access gated by a single private token.

**Architecture:** Monorepo with `web/` (vanilla HTML/CSS/JS front) and `api/` (Hono + Drizzle + Postgres backend). Deployment via Docker Compose behind Caddy, using an existing MinIO container for photo storage. Real-time gift reservations pushed via Server-Sent Events. Front transformed in place from the existing files — no React, no build step for the front.

**Tech Stack:** Node.js 22, TypeScript 5, Hono 4, Drizzle ORM, Postgres 16, MinIO (existing), Caddy 2, `sharp` for image processing, `argon2` for password hashing, `pino` for logs, Vitest + Playwright for tests.

**Reference spec:** `docs/superpowers/specs/2026-04-22-annonce-naissance-design.md`

---

## File Structure

```
A:\projetweb\Annonce-naissance\
├── README.md                        (existing)
├── .gitignore                       (existing)
├── .env.example                     (new)
├── docker-compose.yml               (new)
├── Caddyfile                        (new)
├── docs/                            (existing)
├── api/                             (new backend workspace)
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── drizzle.config.ts
│   ├── src/
│   │   ├── index.ts                 app bootstrap
│   │   ├── env.ts                   zod-validated env
│   │   ├── db/
│   │   │   ├── client.ts            pool + drizzle instance
│   │   │   ├── schema.ts            tables
│   │   │   └── seeds.ts             idempotent initial data
│   │   ├── lib/
│   │   │   ├── errors.ts            HttpError subclasses
│   │   │   ├── auth.ts              argon2, session helpers
│   │   │   ├── event-bus.ts         EventEmitter singleton
│   │   │   ├── minio.ts             MinIO client + helpers
│   │   │   ├── sharp-pipeline.ts    image variants + blurhash
│   │   │   ├── access-token.ts      timing-safe compare + getSettings
│   │   │   ├── rate-limit.ts        in-memory leaky bucket
│   │   │   └── origin-check.ts      CSRF origin whitelist
│   │   ├── middleware/
│   │   │   ├── require-admin.ts
│   │   │   ├── require-access-token.ts
│   │   │   └── error-handler.ts
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   ├── state.ts
│   │   │   ├── stream.ts
│   │   │   ├── gifts.ts             public reserve/unreserve
│   │   │   ├── photos.ts            GET /photos/:id/:size.:ext
│   │   │   └── admin/
│   │   │       ├── login.ts
│   │   │       ├── tweaks.ts
│   │   │       ├── photos.ts
│   │   │       ├── gifts.ts
│   │   │       ├── timeline.ts
│   │   │       └── access-token.ts
│   │   ├── scripts/
│   │   │   └── hash-password.ts
│   │   └── migrations/              drizzle-generated
│   └── test/
│       ├── setup.ts                 testcontainers pg + beforeAll
│       ├── helpers.ts               app factory + http helper
│       ├── auth.test.ts
│       ├── tweaks.test.ts
│       ├── gifts.test.ts
│       ├── photos.test.ts
│       ├── stream.test.ts
│       ├── timeline.test.ts
│       └── access-token.test.ts
├── web/                             (front — seeded from existing files)
│   ├── index.html                   (renamed from Annonce-naissance.html)
│   ├── admin.html                   (new)
│   ├── styles.css                   (existing, extended)
│   ├── admin.css                    (new)
│   ├── app.js                       (existing, refactored)
│   ├── admin.js                     (new)
│   ├── sw.js                        (new)
│   ├── manifest.webmanifest         (new)
│   ├── og.png                       placeholder, regenerated via admin
│   └── icons/                       favicon.svg, 192, 512, apple-touch
└── e2e/                             (new E2E workspace)
    ├── package.json
    ├── playwright.config.ts
    └── tests/
        └── happy-path.spec.ts
```

**Decomposition principles:**
- **One file = one responsibility.** Routes group by resource (gifts, photos, timeline) ; middlewares, lib helpers, and db access live separately.
- **Files that change together live together.** The admin CRUD for gifts is next to the public gift route because both reason about `gifts`.
- **Tests mirror `src/` structure.** Each test file covers one resource end-to-end (HTTP → DB), not one helper at a time.

---

## Global commit discipline

- **One commit per task** (unless explicitly split). Commit messages follow the format:
  `<type>(scope): short summary` where `<type>` ∈ {feat, chore, fix, test, docs, refactor, build} and `scope` is the feature area (api, web, admin, infra, docs).
- Never `--amend` unless the plan explicitly says so.
- After each `git commit`, run `git status` to confirm clean tree.

---

# Phase 0 — Scaffolding

## Task 1 — Create workspace layout and move existing front files

**Files:**
- Create: `web/`, `api/`, `e2e/` directories
- Move: `Annonce-naissance.html` → `web/index.html`
- Move: `app.js` → `web/app.js`
- Move: `styles.css` → `web/styles.css`
- Update: `README.md` to reflect the new layout

- [ ] **Step 1: Create the directory structure**

Run from repo root:

```bash
mkdir -p web api/src api/test e2e/tests
```

Expected: the directories exist. Verify with `ls -la` (both `web/` and `api/` appear).

- [ ] **Step 2: Move the existing front files with git mv**

```bash
git mv Annonce-naissance.html web/index.html
git mv app.js web/app.js
git mv styles.css web/styles.css
git status
```

Expected: three files shown as renamed.

- [ ] **Step 3: Update `README.md`** — add a note after the `## Statut` section:

```markdown
## Workspaces

- `web/` — static front (HTML/CSS/JS, served by Caddy).
- `api/` — Node.js + Hono backend, Dockerized.
- `e2e/` — Playwright end-to-end tests.

See `docs/superpowers/specs/2026-04-22-annonce-naissance-design.md` for the full design.
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(repo): split into web/, api/, e2e/ workspaces

Move the existing static maquette into web/ as the starting point
for the front-end refactor, and create empty api/ and e2e/
skeletons for the backend and end-to-end tests to follow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Create `.env.example` and add root-level infra files

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml` (skeleton only, fleshed out in Phase 10)
- Create: `Caddyfile` (skeleton, fleshed out in Phase 10)

- [ ] **Step 1: Write `.env.example`**

```ini
# ---- Secrets (never commit real values) ----
DB_PASSWORD=changeme_32_char_random_string
ADMIN_PASSWORD_HASH=changeme_argon2id_hash_from_npm_run_hash_password
SESSION_SECRET=changeme_32_char_random_string

# ---- MinIO (existing container, replace with real values) ----
MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET=annonce-leonard
MINIO_ACCESS_KEY=changeme
MINIO_SECRET_KEY=changeme

# ---- Runtime ----
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# ---- Public origin (for CSRF Origin check and access-link generation) ----
PUBLIC_ORIGIN=https://leonard.example.fr

# ---- MinIO docker network name (external network to join) ----
MINIO_NETWORK=minio_default
```

- [ ] **Step 2: Write a skeleton `docker-compose.yml`** — this will be completed in Phase 10. For now only needed so the file exists:

```yaml
# Completed in Phase 10 (Task 40+).
# Intentionally empty skeleton so the repo layout is stable from the start.
name: annonce-leonard
services: {}
```

- [ ] **Step 3: Write a skeleton `Caddyfile`** — same rationale:

```
# Completed in Phase 10 (Task 41).
# Placeholder block so imports from the compose file are stable.
:80 {
  respond "annonce-leonard — not configured yet" 503
}
```

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.yml Caddyfile
git commit -m "chore(infra): add .env.example and empty compose/Caddyfile skeletons

These will be filled in Phase 10. Creating them now so the repo
layout is stable from Task 1 onwards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 1 — Backend skeleton

## Task 3 — Initialize the `api/` TypeScript project

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/src/index.ts`

- [ ] **Step 1: Write `api/package.json`**

```json
{
  "name": "annonce-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src test",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seeds.ts",
    "hash-password": "tsx src/scripts/hash-password.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@hono/zod-validator": "^0.4.0",
    "argon2": "^0.41.0",
    "blurhash": "^2.0.5",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.7.0",
    "minio": "^8.0.0",
    "pg": "^8.13.0",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0",
    "sharp": "^0.33.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.28.0",
    "eslint": "^9.12.0",
    "testcontainers": "^10.13.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true,
    "declaration": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Write a minimal `api/src/index.ts`** (hello world — replaced by real bootstrap in Task 5)

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/healthz", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`listening on :${port}`);
```

- [ ] **Step 4: Install deps**

```bash
cd api
npm install
```

Expected: `node_modules/` populated, no errors. (If `sharp` fails on Windows, see https://sharp.pixelplumbing.com/install — usually fine on Node 22 with prebuilt binaries.)

- [ ] **Step 5: Smoke-test**

```bash
npm run dev
# in another terminal:
curl http://localhost:3000/healthz
```

Expected: `{"ok":true}`. Kill the dev server (`Ctrl-C`).

- [ ] **Step 6: Commit**

```bash
cd ..
git add api/package.json api/tsconfig.json api/src/index.ts api/package-lock.json
git commit -m "feat(api): bootstrap Hono server skeleton

- package.json with Hono, Drizzle, MinIO, sharp, argon2, pino, zod
- strict tsconfig targeting NodeNext
- minimal /healthz endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Env validation with zod

**Files:**
- Create: `api/src/env.ts`

- [ ] **Step 1: Write `api/src/env.ts`**

```ts
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
});

export type Env = z.infer<typeof Env>;

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
```

- [ ] **Step 2: Use env in index.ts** — replace the port line:

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";

const app = new Hono();
app.get("/healthz", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: env.PORT });
// eslint-disable-next-line no-console
console.log(`listening on :${env.PORT}`);
```

- [ ] **Step 3: Verify a bad env fails loud**

```bash
cd api
# no env set
npm run dev
```

Expected: process exits with "Invalid environment variables" listing required fields.

- [ ] **Step 4: Run with a full env and verify it boots**

Create `api/.env` (gitignored):
```
DATABASE_URL=postgres://x:x@localhost:5432/x
SESSION_SECRET=0123456789012345678901234567890123456789
ADMIN_PASSWORD_HASH=test
MINIO_ENDPOINT=http://localhost:9000
MINIO_BUCKET=annonce
MINIO_ACCESS_KEY=x
MINIO_SECRET_KEY=x
PUBLIC_ORIGIN=http://localhost:3000
```

Update the `dev` script in `package.json` to use Node's native `--env-file` flag. The `watch` sub-command must come before flags in tsx, otherwise tsx treats `watch` as a filename:
```json
"dev": "tsx watch --env-file=.env src/index.ts",
"test": "vitest run",
```

Run `npm run dev` — expected: starts with "listening on :3000".

- [ ] **Step 5: Commit**

```bash
git add api/src/env.ts api/src/index.ts api/package.json
git commit -m "feat(api): validate environment with zod and fail-fast on missing values"
```

---

# Phase 2 — Database layer

## Task 5 — Drizzle schema + client

**Files:**
- Create: `api/src/db/schema.ts`
- Create: `api/src/db/client.ts`
- Create: `api/drizzle.config.ts`

- [ ] **Step 1: Write `api/src/db/schema.ts`**

```ts
import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, pgTable, smallint, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

export const tweaks = pgTable("tweaks", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    accessToken: text("access_token").notNull(),
    tokenRotatedAt: timestamp("token_rotated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ singleton: check("settings_singleton", sql`${t.id} = 1`) }),
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    section: text("section").notNull(),
    position: integer("position").notNull().default(0),
    alt: text("alt").notNull().default(""),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    blurhash: text("blurhash"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sectionCheck: check("photos_section_check", sql`${t.section} IN ('triptych','gallery')`),
    byPos: index("photos_section_pos").on(t.section, t.position),
  }),
);

export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    rangeText: text("range_text").notNull(),
    url: text("url"),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    takenBy: text("taken_by"),
    takenNote: text("taken_note"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byPos: index("gifts_position").on(t.position) }),
);

export const timelineEvents = pgTable("timeline_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  dateLabel: text("date_label").notNull(),
  text: text("text").notNull(),
  position: integer("position").notNull().default(0),
  isNow: boolean("is_now").notNull().default(false),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    token: text("token").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => ({ byExpiry: index("sessions_expires").on(t.expiresAt) }),
);
```

- [ ] **Step 2: Write `api/src/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
```

- [ ] **Step 3: Write `api/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 4: Generate the initial migration**

```bash
cd api
npm run db:generate
```

Expected: `src/migrations/0000_*.sql` + `src/migrations/meta/` created.

- [ ] **Step 5: Commit**

```bash
cd ..
git add api/src/db api/drizzle.config.ts
git commit -m "feat(api): add drizzle schema for tweaks/settings/photos/gifts/timeline/sessions

Includes generated 0000 migration. Schema matches the design spec §5.1."
```

---

## Task 6 — Migration runner on boot

**Files:**
- Create: `api/src/db/migrate.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Write `api/src/db/migrate.ts`**

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./src/migrations" });
}

// Standalone invocation via `npm run db:migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => pool.end())
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Run migrations before starting the server** — update `api/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { runMigrations } from "./db/migrate.js";

const app = new Hono();
app.get("/healthz", (c) => c.json({ ok: true }));

async function main(): Promise<void> {
  await runMigrations();
  serve({ fetch: app.fetch, port: env.PORT });
  // eslint-disable-next-line no-console
  console.log(`listening on :${env.PORT}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("boot failed:", e);
  process.exit(1);
});
```

- [ ] **Step 3: Commit**

```bash
git add api/src/db/migrate.ts api/src/index.ts
git commit -m "feat(api): run drizzle migrations before serving requests"
```

---

## Task 7 — Seeds (idempotent)

**Files:**
- Create: `api/src/db/seeds.ts`

The seed runs once at first boot: if `settings` has no row, we insert the singleton; if `tweaks`, `gifts`, `timeline_events` are empty, we seed them from the hardcoded values currently in `web/app.js` and `web/index.html`.

- [ ] **Step 1: Write `api/src/db/seeds.ts`**

```ts
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import pino from "pino";
import { env } from "../env.js";
import { db, pool } from "./client.js";
import { gifts, settings, timelineEvents, tweaks } from "./schema.js";

const log = pino({ level: env.LOG_LEVEL });

const TWEAKS_SEED: Record<string, string> = {
  babyName: "Léonard",
  babyMiddle: "Augustin",
  dateLong: "14 avril 2026",
  dateShort: "14.04.2026",
  timeBirth: "04h27",
  weight: "3,42",
  height: "51",
  city: "Paris",
  maternity: "Maternité des Lilas",
  father: "Julien",
  mother: "Camille",
  paternalGP: "Pierre & Hélène",
  maternalGP: "Antoine & Marie",
  accent: "gold",
};

const GIFTS_SEED = [
  { name: "Doudou en lin",           rangeText: "25–40 €", position: 0 },
  { name: "Mobile musical en bois",  rangeText: "60–80 €", position: 1 },
  { name: "Gigoteuse coton bio",     rangeText: "45 €",    position: 2 },
  { name: "Livre d'éveil tissu",     rangeText: "18 €",    position: 3 },
  { name: "Chaussons en cuir souple", rangeText: "32 €",   position: 4 },
  { name: "Tapis d'éveil en laine",  rangeText: "90 €",    position: 5 },
];

const TIMELINE_SEED = [
  { dateLabel: "Août 2025",   text: "Le test positif — l'incroyable nouvelle partagée à deux.", position: 0, isNow: false },
  { dateLabel: "Oct 2025",    text: "Première échographie. Un petit cœur, déjà fort.",          position: 1, isNow: false },
  { dateLabel: "Janv 2026",   text: "On apprend que c'est un garçon. Le prénom s'impose.",       position: 2, isNow: false },
  { dateLabel: "Mars 2026",   text: "La chambre est prête. Les valises aussi. On attend.",       position: 3, isNow: false },
  { dateLabel: "14 avril 2026", text: "Léonard ouvre les yeux. Notre vie commence à trois.",     position: 4, isNow: true },
];

export async function runSeeds(): Promise<void> {
  await db.transaction(async (tx) => {
    const existingSettings = await tx.select().from(settings).limit(1);
    if (existingSettings.length === 0) {
      const token = randomBytes(18).toString("base64url");
      await tx.insert(settings).values({ id: 1, accessToken: token });
      log.info({ token }, "🔑 Access token généré — régénérable depuis /admin");
    }

    const tweaksCount = await tx.execute(sql`SELECT count(*)::int AS c FROM tweaks`);
    if (Number(tweaksCount.rows[0]?.c ?? 0) === 0) {
      await tx
        .insert(tweaks)
        .values(Object.entries(TWEAKS_SEED).map(([key, value]) => ({ key, value })));
    }

    const giftsCount = await tx.execute(sql`SELECT count(*)::int AS c FROM gifts`);
    if (Number(giftsCount.rows[0]?.c ?? 0) === 0) {
      await tx.insert(gifts).values(GIFTS_SEED);
    }

    const timelineCount = await tx.execute(sql`SELECT count(*)::int AS c FROM timeline_events`);
    if (Number(timelineCount.rows[0]?.c ?? 0) === 0) {
      await tx.insert(timelineEvents).values(TIMELINE_SEED);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeeds()
    .then(() => pool.end())
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Call seeds from `api/src/index.ts`** — add after `runMigrations()`:

```ts
import { runSeeds } from "./db/seeds.js";
// ...
await runMigrations();
await runSeeds();
```

- [ ] **Step 3: Commit**

```bash
git add api/src/db/seeds.ts api/src/index.ts
git commit -m "feat(api): idempotent seeds for tweaks/gifts/timeline and initial access token

Access token is logged at first boot so the operator can copy it
into their first admin/share link. Subsequent boots are no-ops."
```

---

# Phase 3 — Errors, logger, test infrastructure

## Task 8 — HTTP errors and global error handler

**Files:**
- Create: `api/src/lib/errors.ts`
- Create: `api/src/middleware/error-handler.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Write `api/src/lib/errors.ts`**

```ts
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(code = "not_found") { super(404, code); }
}
export class UnauthorizedError extends HttpError {
  constructor(code = "unauthorized") { super(401, code); }
}
export class ForbiddenError extends HttpError {
  constructor(code = "forbidden") { super(403, code); }
}
export class ValidationError extends HttpError {
  constructor(code = "invalid_input", message?: string) { super(400, code, message); }
}
export class ConflictError extends HttpError {
  constructor(code = "conflict") { super(409, code); }
}
export class RateLimitError extends HttpError {
  constructor() { super(429, "rate_limited"); }
}
```

- [ ] **Step 2: Write `api/src/middleware/error-handler.ts`**

```ts
import type { Context } from "hono";
import pino from "pino";
import { env } from "../env.js";
import { HttpError } from "../lib/errors.js";

const log = pino({ level: env.LOG_LEVEL });

export function onError(err: Error, c: Context): Response {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 429);
  }
  const reqId = c.get("reqId" as never) as string | undefined;
  log.error({ err, reqId, path: c.req.path, method: c.req.method }, "unhandled error");
  return c.json({ error: "internal" }, 500);
}
```

- [ ] **Step 3: Wire into `api/src/index.ts`**

```ts
import { onError } from "./middleware/error-handler.js";
// ...
app.onError(onError);
```

- [ ] **Step 4: Commit**

```bash
git add api/src/lib/errors.ts api/src/middleware/error-handler.ts api/src/index.ts
git commit -m "feat(api): centralize HTTP errors and global error handler"
```

---

## Task 9 — Request logger + request id

**Files:**
- Create: `api/src/lib/logger.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Write `api/src/lib/logger.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import pino from "pino";
import { env } from "../env.js";

export const log = pino({ level: env.LOG_LEVEL });

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const reqId = c.req.header("x-request-id") ?? randomUUID();
  c.set("reqId" as never, reqId);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  log.info(
    { reqId, method: c.req.method, path: c.req.path, status: c.res.status, ms },
    "request",
  );
  c.header("x-request-id", reqId);
};
```

- [ ] **Step 2: Wire into index.ts**

```ts
import { requestLogger } from "./lib/logger.js";
// ...before app.get("/healthz")
app.use("*", requestLogger);
```

- [ ] **Step 3: Commit**

```bash
git add api/src/lib/logger.ts api/src/index.ts
git commit -m "feat(api): structured JSON logs with per-request correlation id"
```

---

## Task 10 — Vitest + Postgres testcontainer setup

**Files:**
- Create: `api/vitest.config.ts`
- Create: `api/test/setup.ts`
- Create: `api/test/helpers.ts`

- [ ] **Step 1: Write `api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    globalSetup: "./test/setup.ts",
    testTimeout: 60_000,       // testcontainers first pull is slow
    hookTimeout: 60_000,
    reporters: "default",
    environment: "node",
    sequence: { concurrent: false },  // one request at a time simplifies auth state
  },
});
```

- [ ] **Step 2: Write `api/test/setup.ts`**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers/postgresql";

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
```

- [ ] **Step 3: Write `api/test/helpers.ts`**

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.js";

export async function resetDb(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./src/migrations" });
  // truncate for each test (FK-safe order)
  await pool.query(`
    TRUNCATE admin_sessions, gifts, timeline_events, photos, tweaks, settings RESTART IDENTITY CASCADE
  `);
  await pool.end();
}

export async function buildApp() {
  // Lazy-import so env is already populated by setup.ts
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
```

- [ ] **Step 4: Extract `app` factory** — to make tests possible, move the Hono app building to `api/src/app.ts` and have `index.ts` just import + serve it.

Create `api/src/app.ts`:

```ts
import { Hono } from "hono";
import { requestLogger } from "./lib/logger.js";
import { onError } from "./middleware/error-handler.js";

export const app = new Hono();
app.use("*", requestLogger);
app.onError(onError);
app.get("/healthz", (c) => c.json({ ok: true }));
```

Modify `api/src/index.ts`:
```ts
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
```

- [ ] **Step 5: Write a smoke test** `api/test/healthz.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import { buildApp, httpJson, resetDb } from "./helpers.js";

beforeEach(resetDb);

test("GET /healthz returns ok", async () => {
  const app = await buildApp();
  const { status, body } = await httpJson(app, new Request("http://x/healthz"));
  expect(status).toBe(200);
  expect(body).toEqual({ ok: true });
});
```

- [ ] **Step 6: Run it**

```bash
cd api
npm test
```

Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add api/vitest.config.ts api/test/ api/src/app.ts api/src/index.ts
git commit -m "test(api): vitest + testcontainers postgres scaffolding with healthz smoke test"
```

---

# Phase 4 — Auth foundations

## Task 11 — Password hashing CLI

**Files:**
- Create: `api/src/scripts/hash-password.ts`

- [ ] **Step 1: Write the script**

```ts
import argon2 from "argon2";

const pw = process.argv[2];
if (!pw) {
  // eslint-disable-next-line no-console
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

const hash = await argon2.hash(pw, { type: argon2.argon2id });
// eslint-disable-next-line no-console
console.log(hash);
```

- [ ] **Step 2: Verify**

```bash
cd api
npm run hash-password -- hello
```

Expected: prints a string starting with `$argon2id$v=19$...`.

- [ ] **Step 3: Commit**

```bash
git add api/src/scripts/hash-password.ts
git commit -m "feat(api): CLI to hash the admin password with argon2id"
```

---

## Task 12 — Session helpers, login rate-limit, origin check

**Files:**
- Create: `api/src/lib/auth.ts`
- Create: `api/src/lib/rate-limit.ts`
- Create: `api/src/lib/origin-check.ts`

- [ ] **Step 1: Write `api/src/lib/auth.ts`**

```ts
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { UnauthorizedError } from "./errors.js";

const { adminSessions } = schema;

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const COOKIE_NAME = "admin_session";

export async function verifyAdminPassword(plain: string): Promise<boolean> {
  try {
    return await argon2.verify(env.ADMIN_PASSWORD_HASH, plain);
  } catch {
    return false;
  }
}

export async function createSession(c: Context, userAgent: string | undefined): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(adminSessions).values({
    token,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: userAgent?.slice(0, 255) ?? null,
  });
  await setSignedCookie(c, COOKIE_NAME, token, env.SESSION_SECRET, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(c: Context): Promise<void> {
  const token = await getSignedCookie(c, env.SESSION_SECRET, COOKIE_NAME);
  if (token) await db.delete(adminSessions).where(eq(adminSessions.token, token));
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export async function loadSession(c: Context): Promise<{ token: string } | null> {
  const token = await getSignedCookie(c, env.SESSION_SECRET, COOKIE_NAME);
  if (!token) return null;
  const [s] = await db.select().from(adminSessions).where(eq(adminSessions.token, token)).limit(1);
  if (!s || s.expiresAt < new Date()) {
    if (s) await db.delete(adminSessions).where(eq(adminSessions.token, token));
    deleteCookie(c, COOKIE_NAME, { path: "/" });
    return null;
  }
  await db.update(adminSessions).set({ lastSeen: new Date() }).where(eq(adminSessions.token, token));
  return { token };
}

export async function destroyAllSessions(): Promise<void> {
  await db.delete(adminSessions);
}

export function throwIfNoSession(s: { token: string } | null): asserts s is { token: string } {
  if (!s) throw new UnauthorizedError();
}
```

- [ ] **Step 2: Write `api/src/lib/rate-limit.ts`** (leaky bucket, in-memory)

```ts
import { RateLimitError } from "./errors.js";

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, capacity: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) {
    buckets.set(key, { tokens: capacity - 1, updatedAt: now });
    return;
  }
  const elapsed = now - b.updatedAt;
  const refill = (elapsed / windowMs) * capacity;
  const tokens = Math.min(capacity, b.tokens + refill);
  if (tokens < 1) {
    b.tokens = tokens;
    b.updatedAt = now;
    throw new RateLimitError();
  }
  b.tokens = tokens - 1;
  b.updatedAt = now;
}
```

- [ ] **Step 3: Write `api/src/lib/origin-check.ts`**

```ts
import type { Context } from "hono";
import { env } from "../env.js";
import { ForbiddenError } from "./errors.js";

export function assertSameOrigin(c: Context): void {
  const origin = c.req.header("origin");
  // Safari sometimes omits Origin on same-origin requests; fall back to Referer check
  const ref = c.req.header("referer");
  if (origin && origin === env.PUBLIC_ORIGIN) return;
  if (!origin && ref && ref.startsWith(env.PUBLIC_ORIGIN)) return;
  throw new ForbiddenError("bad_origin");
}
```

- [ ] **Step 4: Commit**

```bash
git add api/src/lib/auth.ts api/src/lib/rate-limit.ts api/src/lib/origin-check.ts
git commit -m "feat(api): auth, rate-limit and origin-check primitives"
```

---

## Task 13 — POST /api/admin/login + requireAdmin middleware

**Files:**
- Create: `api/src/middleware/require-admin.ts`
- Create: `api/src/routes/admin/login.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/auth.test.ts`

- [ ] **Step 1: Write the middleware** `api/src/middleware/require-admin.ts`

```ts
import type { MiddlewareHandler } from "hono";
import { loadSession, throwIfNoSession } from "../lib/auth.js";

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const session = await loadSession(c);
  throwIfNoSession(session);
  c.set("adminSession" as never, session);
  await next();
};
```

- [ ] **Step 2: Write login/logout/me routes** `api/src/routes/admin/login.ts`

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createSession, destroyAllSessions, destroySession, verifyAdminPassword } from "../../lib/auth.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { rateLimit } from "../../lib/rate-limit.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const app = new Hono();

app.post(
  "/login",
  zValidator("json", z.object({ password: z.string().min(1).max(256) })),
  async (c) => {
    assertSameOrigin(c);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    rateLimit(`login:${ip}`, 10, 15 * 60_000);
    // Anti-timing jitter, only applied on failure
    const { password } = c.req.valid("json");
    const ok = await verifyAdminPassword(password);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
      throw new UnauthorizedError("invalid_credentials");
    }
    await createSession(c, c.req.header("user-agent"));
    return c.json({ ok: true });
  },
);

app.post("/logout", requireAdmin, async (c) => {
  assertSameOrigin(c);
  await destroySession(c);
  return c.json({ ok: true });
});

app.get("/me", requireAdmin, (c) => c.json({ ok: true }));

app.post("/destroy-all-sessions", requireAdmin, async (c) => {
  assertSameOrigin(c);
  await destroyAllSessions();
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 3: Mount it in `api/src/app.ts`**

```ts
import adminLogin from "./routes/admin/login.js";
// ...
app.route("/api/admin", adminLogin);
```

- [ ] **Step 4: Write `api/test/auth.test.ts`**

```ts
import argon2 from "argon2";
import { beforeEach, expect, test } from "vitest";
import { buildApp, httpJson, resetDb } from "./helpers.js";

const PASSWORD = "test-password-aZ9!";

beforeEach(async () => {
  await resetDb();
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash(PASSWORD, { type: argon2.argon2id });
});

function loginReq(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

test("rejects empty password", async () => {
  const app = await buildApp();
  const { status } = await httpJson(app, loginReq({ password: "" }));
  expect(status).toBe(400);
});

test("rejects wrong password", async () => {
  const app = await buildApp();
  const { status, body } = await httpJson(app, loginReq({ password: "wrong" }));
  expect(status).toBe(401);
  expect(body).toMatchObject({ error: "invalid_credentials" });
});

test("accepts right password and sets signed cookie", async () => {
  const app = await buildApp();
  const res = await app.fetch(loginReq({ password: PASSWORD }));
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie");
  expect(cookie).toMatch(/admin_session=/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Strict/i);
});

test("rejects cross-origin login", async () => {
  const app = await buildApp();
  const req = new Request("http://localhost:3000/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const { status } = await httpJson(app, req);
  expect(status).toBe(403);
});

test("me returns 401 without session", async () => {
  const app = await buildApp();
  const { status } = await httpJson(app, new Request("http://localhost:3000/api/admin/me"));
  expect(status).toBe(401);
});

test("me returns ok with session cookie", async () => {
  const app = await buildApp();
  const login = await app.fetch(loginReq({ password: PASSWORD }));
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/me", { headers: { cookie } }));
  expect(res.status).toBe(200);
});
```

- [ ] **Step 5: Run the tests**

```bash
cd api
npm test
```

Expected: 7 passed (6 new + 1 healthz).

- [ ] **Step 6: Commit**

```bash
git add api/src/middleware/require-admin.ts api/src/routes/admin/login.ts api/src/app.ts api/test/auth.test.ts
git commit -m "feat(api): admin login/logout/me with argon2id, rate-limit, origin-check and signed cookie"
```

---

## Task 14 — Access token middleware

**Files:**
- Create: `api/src/lib/access-token.ts`
- Create: `api/src/middleware/require-access-token.ts`
- Create: `api/test/access-token.test.ts`

- [ ] **Step 1: Write `api/src/lib/access-token.ts`**

```ts
import { timingSafeEqual } from "node:crypto";
import { db, schema } from "../db/client.js";

const { settings } = schema;

export async function getAccessToken(): Promise<string | null> {
  const [s] = await db.select().from(settings).limit(1);
  return s?.accessToken ?? null;
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
```

- [ ] **Step 2: Write `api/src/middleware/require-access-token.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { getAccessToken, tokensEqual } from "../lib/access-token.js";
import { NotFoundError } from "../lib/errors.js";

export const requireAccessToken: MiddlewareHandler = async (c, next) => {
  const got = c.req.header("x-access-token") ?? c.req.query("k") ?? "";
  const expected = await getAccessToken();
  if (!expected || !got || !tokensEqual(got, expected)) {
    // 404, not 401 — we never admit the resource exists without the token
    throw new NotFoundError();
  }
  await next();
};
```

- [ ] **Step 3: Write `api/test/access-token.test.ts`**

```ts
import { beforeEach, expect, test } from "vitest";
import { buildApp, httpJson, resetDb } from "./helpers.js";
import { runSeeds } from "../src/db/seeds.js";
import { db, schema } from "../src/db/client.js";

beforeEach(async () => {
  await resetDb();
  await runSeeds();
});

test("requireAccessToken returns 404 when missing", async () => {
  const app = await buildApp();
  const { status } = await httpJson(app, new Request("http://x/api/state"));
  // Route mounted later; for now verify the middleware on a sentinel route added in Task 15.
  // Placeholder — real assertion happens in Task 15 once /api/state exists.
  expect([404, 401]).toContain(status);
});
```

- [ ] **Step 4: Commit**

```bash
git add api/src/lib/access-token.ts api/src/middleware/require-access-token.ts api/test/access-token.test.ts
git commit -m "feat(api): access-token middleware with timing-safe compare returning 404 on miss"
```

---

# Phase 5 — Core read endpoints

## Task 15 — GET /api/state

**Files:**
- Create: `api/src/routes/state.ts`
- Modify: `api/src/app.ts`
- Modify: `api/test/access-token.test.ts`
- Create: `api/test/state.test.ts`

- [ ] **Step 1: Write `api/src/routes/state.ts`**

```ts
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const { tweaks, photos, gifts, timelineEvents } = schema;

const app = new Hono();

app.get("/", requireAccessToken, async (c) => {
  const [tweaksRows, photosRows, giftsRows, timelineRows] = await Promise.all([
    db.select().from(tweaks),
    db.select().from(photos).orderBy(asc(photos.section), asc(photos.position)),
    db.select().from(gifts).orderBy(asc(gifts.position)),
    db.select().from(timelineEvents).orderBy(asc(timelineEvents.position)),
  ]);

  const tweaksDict: Record<string, string> = {};
  for (const t of tweaksRows) tweaksDict[t.key] = t.value;

  return c.json({
    tweaks: tweaksDict,
    photos: photosRows,
    gifts: giftsRows,
    timeline: timelineRows,
  });
});

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import stateRoute from "./routes/state.js";
// ...
app.route("/api/state", stateRoute);
```

- [ ] **Step 3: Write `api/test/state.test.ts`**

```ts
import { beforeEach, expect, test } from "vitest";
import { runSeeds } from "../src/db/seeds.js";
import { buildApp, httpJson, resetDb } from "./helpers.js";
import { getAccessToken } from "../src/lib/access-token.js";

beforeEach(async () => {
  await resetDb();
  await runSeeds();
});

test("GET /api/state returns 404 without token", async () => {
  const app = await buildApp();
  const { status } = await httpJson(app, new Request("http://x/api/state"));
  expect(status).toBe(404);
});

test("GET /api/state with header token returns the full state", async () => {
  const token = (await getAccessToken())!;
  const app = await buildApp();
  const { status, body } = await httpJson(
    app,
    new Request("http://x/api/state", { headers: { "x-access-token": token } }),
  );
  expect(status).toBe(200);
  expect(body).toMatchObject({
    tweaks: { babyName: "Léonard" },
    gifts: expect.arrayContaining([expect.objectContaining({ name: "Doudou en lin" })]),
    timeline: expect.arrayContaining([expect.objectContaining({ isNow: true })]),
    photos: [],
  });
});

test("GET /api/state with ?k= query token works too", async () => {
  const token = (await getAccessToken())!;
  const app = await buildApp();
  const { status } = await httpJson(app, new Request(`http://x/api/state?k=${token}`));
  expect(status).toBe(200);
});

test("wrong token is rejected with 404", async () => {
  const app = await buildApp();
  const { status } = await httpJson(
    app,
    new Request("http://x/api/state", { headers: { "x-access-token": "wrong" } }),
  );
  expect(status).toBe(404);
});
```

- [ ] **Step 4: Run and commit**

```bash
npm test
git add api/src/routes/state.ts api/src/app.ts api/test/state.test.ts api/test/access-token.test.ts
git commit -m "feat(api): GET /api/state returns tweaks/photos/gifts/timeline gated by access token"
```

---

## Task 16 — PATCH /api/admin/tweaks

**Files:**
- Create: `api/src/routes/admin/tweaks.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/tweaks.test.ts`

- [ ] **Step 1: Write `api/src/routes/admin/tweaks.ts`**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { tweaks } = schema;

const Body = z.record(z.string().min(1).max(128), z.string().max(4096));

const app = new Hono();

app.patch("/", requireAdmin, zValidator("json", Body), async (c) => {
  assertSameOrigin(c);
  const patch = c.req.valid("json");
  const entries = Object.entries(patch);
  if (entries.length === 0) return c.json({ updated: 0 });

  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx
        .insert(tweaks)
        .values({ key, value })
        .onConflictDoUpdate({
          target: tweaks.key,
          set: { value, updatedAt: sql`now()` },
        });
    }
  });

  return c.json({ updated: entries.length });
});

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import adminTweaks from "./routes/admin/tweaks.js";
// ...
app.route("/api/admin/tweaks", adminTweaks);
```

- [ ] **Step 3: Write `api/test/tweaks.test.ts`**

```ts
import argon2 from "argon2";
import { beforeEach, expect, test } from "vitest";
import { runSeeds } from "../src/db/seeds.js";
import { buildApp, httpJson, resetDb } from "./helpers.js";
import { getAccessToken } from "../src/lib/access-token.js";

const PW = "test-pw-1";

async function login(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ password: PW }),
  }));
  return res.headers.get("set-cookie")!.split(";")[0];
}

beforeEach(async () => {
  await resetDb();
  await runSeeds();
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash(PW, { type: argon2.argon2id });
});

test("PATCH requires admin session", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/tweaks", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ babyName: "Zoé" }),
  }));
  expect(res.status).toBe(401);
});

test("PATCH updates and /api/state reflects", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const patch = await app.fetch(new Request("http://localhost:3000/api/admin/tweaks", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ babyName: "Zoé", city: "Lyon" }),
  }));
  expect(patch.status).toBe(200);
  expect(await patch.json()).toEqual({ updated: 2 });

  const token = (await getAccessToken())!;
  const { body } = await httpJson(app, new Request("http://x/api/state", { headers: { "x-access-token": token } }));
  expect(body).toMatchObject({ tweaks: { babyName: "Zoé", city: "Lyon" } });
});

test("PATCH rejects cross-origin", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/tweaks", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://evil", cookie },
    body: JSON.stringify({ babyName: "Zoé" }),
  }));
  expect(res.status).toBe(403);
});
```

- [ ] **Step 4: Run and commit**

```bash
npm test
git add api/src/routes/admin/tweaks.ts api/src/app.ts api/test/tweaks.test.ts
git commit -m "feat(api): PATCH /api/admin/tweaks with upsert and origin check"
```

---

# Phase 6 — Gifts + SSE

## Task 17 — Event bus

**Files:**
- Create: `api/src/lib/event-bus.ts`

- [ ] **Step 1: Write `api/src/lib/event-bus.ts`**

```ts
import { EventEmitter } from "node:events";

export type GiftEvent =
  | { type: "gift.reserved";    id: string; taken_by: string; taken_note: string | null; taken_at: string }
  | { type: "gift.unreserved";  id: string }
  | { type: "gift.created";     gift: unknown }
  | { type: "gift.updated";     gift: unknown }
  | { type: "gift.deleted";     id: string };

class Bus extends EventEmitter {
  emitGift(e: GiftEvent): void { this.emit("gift", e); }
  onGift(cb: (e: GiftEvent) => void): () => void {
    this.on("gift", cb);
    return () => this.off("gift", cb);
  }
}

export const bus = new Bus().setMaxListeners(200);
```

- [ ] **Step 2: Commit**

```bash
git add api/src/lib/event-bus.ts
git commit -m "feat(api): in-process event bus for gift events"
```

---

## Task 18 — Public gift reserve / unreserve

**Files:**
- Create: `api/src/routes/gifts.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/gifts.test.ts`

Rules:
- `reserve` : forbidden if already taken (409).
- `unreserve` : allowed only when `taken_by` matches submitted name (case-insensitive, trimmed); else 403.

- [ ] **Step 1: Write `api/src/routes/gifts.ts`**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { bus } from "../lib/event-bus.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const { gifts } = schema;

const app = new Hono();
app.use("*", requireAccessToken);

const ReserveBody = z.object({
  name: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).optional(),
});

function normName(s: string): string {
  return s.trim().toLowerCase();
}

app.post("/:id/reserve", zValidator("json", ReserveBody), async (c) => {
  const id = c.req.param("id");
  const { name, note } = c.req.valid("json");

  // Conditional update: only reserve if takenBy IS NULL (concurrency-safe)
  const result = await db
    .update(gifts)
    .set({ takenBy: name.trim(), takenNote: note ?? null, takenAt: new Date() })
    .where(and(eq(gifts.id, id), isNull(gifts.takenBy)))
    .returning();

  if (result.length === 0) {
    const existing = await db.select().from(gifts).where(eq(gifts.id, id)).limit(1);
    if (existing.length === 0) throw new NotFoundError("gift_not_found");
    throw new ConflictError("already_reserved");
  }
  const g = result[0]!;
  bus.emitGift({
    type: "gift.reserved",
    id: g.id,
    taken_by: g.takenBy!,
    taken_note: g.takenNote,
    taken_at: g.takenAt!.toISOString(),
  });
  return c.json(g);
});

app.post(
  "/:id/unreserve",
  zValidator("json", z.object({ name: z.string().trim().min(1).max(80) })),
  async (c) => {
    const id = c.req.param("id");
    const { name } = c.req.valid("json");

    const [existing] = await db.select().from(gifts).where(eq(gifts.id, id)).limit(1);
    if (!existing) throw new NotFoundError("gift_not_found");
    if (!existing.takenBy) return c.json(existing);
    if (normName(existing.takenBy) !== normName(name)) throw new ForbiddenError("not_reserver");

    const [g] = await db
      .update(gifts)
      .set({ takenBy: null, takenNote: null, takenAt: null })
      .where(eq(gifts.id, id))
      .returning();
    bus.emitGift({ type: "gift.unreserved", id: g!.id });
    return c.json(g);
  },
);

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import giftsRoute from "./routes/gifts.js";
// ...
app.route("/api/gifts", giftsRoute);
```

- [ ] **Step 3: Write `api/test/gifts.test.ts`**

```ts
import { beforeEach, expect, test } from "vitest";
import { runSeeds } from "../src/db/seeds.js";
import { buildApp, httpJson, resetDb } from "./helpers.js";
import { getAccessToken } from "../src/lib/access-token.js";
import { db, schema } from "../src/db/client.js";

beforeEach(async () => {
  await resetDb();
  await runSeeds();
});

async function firstGiftId(): Promise<string> {
  const [g] = await db.select().from(schema.gifts).limit(1);
  return g!.id;
}

function giftReq(path: string, token: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-access-token": token,
      origin: "http://localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("reserve happy path", async () => {
  const token = (await getAccessToken())!;
  const id = await firstGiftId();
  const app = await buildApp();
  const { status, body } = await httpJson(app, giftReq(`/api/gifts/${id}/reserve`, token, { name: "Sophie" }));
  expect(status).toBe(200);
  expect(body).toMatchObject({ takenBy: "Sophie" });
});

test("reserve twice fails with 409", async () => {
  const token = (await getAccessToken())!;
  const id = await firstGiftId();
  const app = await buildApp();
  await app.fetch(giftReq(`/api/gifts/${id}/reserve`, token, { name: "Sophie" }));
  const { status, body } = await httpJson(app, giftReq(`/api/gifts/${id}/reserve`, token, { name: "Hélène" }));
  expect(status).toBe(409);
  expect(body).toMatchObject({ error: "already_reserved" });
});

test("unreserve requires matching name", async () => {
  const token = (await getAccessToken())!;
  const id = await firstGiftId();
  const app = await buildApp();
  await app.fetch(giftReq(`/api/gifts/${id}/reserve`, token, { name: "Sophie" }));
  const deny = await app.fetch(giftReq(`/api/gifts/${id}/unreserve`, token, { name: "Hélène" }));
  expect(deny.status).toBe(403);
  const allow = await app.fetch(giftReq(`/api/gifts/${id}/unreserve`, token, { name: "sophie" }));
  expect(allow.status).toBe(200);
});

test("reserve rejected without token", async () => {
  const id = await firstGiftId();
  const app = await buildApp();
  const req = new Request(`http://localhost:3000/api/gifts/${id}/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ name: "Sophie" }),
  });
  const { status } = await httpJson(app, req);
  expect(status).toBe(404);
});
```

- [ ] **Step 4: Run and commit**

```bash
npm test
git add api/src/routes/gifts.ts api/src/app.ts api/test/gifts.test.ts
git commit -m "feat(api): public gift reserve/unreserve with concurrency-safe conditional update"
```

---

## Task 19 — Admin CRUD gifts + force-unreserve

**Files:**
- Create: `api/src/routes/admin/gifts.ts`
- Modify: `api/src/app.ts`
- Extend: `api/test/gifts.test.ts`

- [ ] **Step 1: Write `api/src/routes/admin/gifts.ts`**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { NotFoundError } from "../../lib/errors.js";
import { bus } from "../../lib/event-bus.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { gifts } = schema;

const Create = z.object({
  name: z.string().min(1).max(160),
  rangeText: z.string().min(1).max(40),
  url: z.string().url().optional(),
  position: z.number().int().min(0).default(0),
  photoId: z.string().uuid().optional(),
});
const Update = Create.partial();

const app = new Hono();
app.use("*", requireAdmin);

app.post("/", zValidator("json", Create), async (c) => {
  assertSameOrigin(c);
  const [g] = await db.insert(gifts).values(c.req.valid("json")).returning();
  bus.emitGift({ type: "gift.created", gift: g });
  return c.json(g, 201);
});

app.patch("/:id", zValidator("json", Update), async (c) => {
  assertSameOrigin(c);
  const [g] = await db.update(gifts).set(c.req.valid("json")).where(eq(gifts.id, c.req.param("id"))).returning();
  if (!g) throw new NotFoundError("gift_not_found");
  bus.emitGift({ type: "gift.updated", gift: g });
  return c.json(g);
});

app.delete("/:id", async (c) => {
  assertSameOrigin(c);
  const [g] = await db.delete(gifts).where(eq(gifts.id, c.req.param("id"))).returning();
  if (!g) throw new NotFoundError("gift_not_found");
  bus.emitGift({ type: "gift.deleted", id: g.id });
  return c.json({ ok: true });
});

app.post("/:id/force-unreserve", async (c) => {
  assertSameOrigin(c);
  const id = c.req.param("id");
  const [g] = await db.update(gifts)
    .set({ takenBy: null, takenNote: null, takenAt: null })
    .where(eq(gifts.id, id)).returning();
  if (!g) throw new NotFoundError("gift_not_found");
  bus.emitGift({ type: "gift.unreserved", id: g.id });
  return c.json(g);
});

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import adminGifts from "./routes/admin/gifts.js";
// ...
app.route("/api/admin/gifts", adminGifts);
```

- [ ] **Step 3: Add tests (extend `api/test/gifts.test.ts`)**

```ts
import argon2 from "argon2";
// ... at top of file
const ADMIN_PW = "admin-pw";

async function adminCookie(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ password: ADMIN_PW }),
  }));
  return res.headers.get("set-cookie")!.split(";")[0];
}

test("admin can force-unreserve a gift reserved by someone else", async () => {
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash(ADMIN_PW, { type: argon2.argon2id });
  const token = (await getAccessToken())!;
  const id = await firstGiftId();
  const app = await buildApp();
  await app.fetch(giftReq(`/api/gifts/${id}/reserve`, token, { name: "Sophie" }));
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request(`http://localhost:3000/api/admin/gifts/${id}/force-unreserve`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie },
  }));
  expect(res.status).toBe(200);
});

test("admin creates and deletes a gift", async () => {
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash(ADMIN_PW, { type: argon2.argon2id });
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const created = await app.fetch(new Request("http://localhost:3000/api/admin/gifts", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ name: "Lampe veilleuse", rangeText: "35 €" }),
  }));
  expect(created.status).toBe(201);
  const g = await created.json();
  const del = await app.fetch(new Request(`http://localhost:3000/api/admin/gifts/${g.id}`, {
    method: "DELETE",
    headers: { origin: "http://localhost:3000", cookie },
  }));
  expect(del.status).toBe(200);
});
```

- [ ] **Step 4: Run and commit**

```bash
npm test
git add api/src/routes/admin/gifts.ts api/src/app.ts api/test/gifts.test.ts
git commit -m "feat(api): admin gift CRUD with force-unreserve and SSE event emission"
```

---

## Task 20 — SSE stream endpoint

**Files:**
- Create: `api/src/routes/stream.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/stream.test.ts`

- [ ] **Step 1: Write `api/src/routes/stream.ts`**

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { bus } from "../lib/event-bus.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const app = new Hono();

app.get("/", requireAccessToken, (c) =>
  streamSSE(c, async (stream) => {
    const unsub = bus.onGift((e) =>
      stream.writeSSE({ event: e.type, data: JSON.stringify(e) }),
    );
    const hb = setInterval(() => stream.writeSSE({ event: "ping", data: "" }), 30_000);

    const abort = c.req.raw.signal;
    await new Promise<void>((resolve) => {
      const stop = () => { clearInterval(hb); unsub(); resolve(); };
      if (abort.aborted) stop(); else abort.addEventListener("abort", stop, { once: true });
    });
  }),
);

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import streamRoute from "./routes/stream.js";
// ...
app.route("/api/stream", streamRoute);
```

- [ ] **Step 3: Write `api/test/stream.test.ts`**

```ts
import { beforeEach, expect, test } from "vitest";
import { runSeeds } from "../src/db/seeds.js";
import { buildApp, resetDb } from "./helpers.js";
import { getAccessToken } from "../src/lib/access-token.js";
import { db, schema } from "../src/db/client.js";

beforeEach(async () => {
  await resetDb();
  await runSeeds();
});

test("SSE delivers a gift.reserved event within 1s", async () => {
  const token = (await getAccessToken())!;
  const app = await buildApp();
  const [g] = await db.select().from(schema.gifts).limit(1);
  const id = g!.id;

  const ctrl = new AbortController();
  const streamPromise = app.fetch(
    new Request(`http://x/api/stream?k=${token}`, { signal: ctrl.signal }),
  );

  const res = await streamPromise;
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/event-stream/);

  // Trigger a reservation after the stream is open
  const reserveRes = app.fetch(new Request(`http://x/api/gifts/${id}/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-token": token, origin: "http://localhost:3000" },
    body: JSON.stringify({ name: "Sophie" }),
  }));

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let seenReserved = false;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value);
    if (chunk.includes("event: gift.reserved")) { seenReserved = true; break; }
  }
  ctrl.abort();
  await reserveRes;
  expect(seenReserved).toBe(true);
});
```

- [ ] **Step 4: Run and commit**

```bash
npm test
git add api/src/routes/stream.ts api/src/app.ts api/test/stream.test.ts
git commit -m "feat(api): SSE /api/stream with bus fan-out, heartbeat and abort cleanup"
```

---

# Phase 7 — Timeline + access token rotation

## Task 21 — Admin CRUD timeline

**Files:**
- Create: `api/src/routes/admin/timeline.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/timeline.test.ts`

- [ ] **Step 1: Write `api/src/routes/admin/timeline.ts`**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { NotFoundError } from "../../lib/errors.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { timelineEvents } = schema;

const Create = z.object({
  dateLabel: z.string().min(1).max(80),
  text: z.string().min(1).max(400),
  position: z.number().int().min(0).default(0),
  isNow: z.boolean().default(false),
});
const Update = Create.partial();

const app = new Hono();
app.use("*", requireAdmin);

app.post("/", zValidator("json", Create), async (c) => {
  assertSameOrigin(c);
  const [row] = await db.insert(timelineEvents).values(c.req.valid("json")).returning();
  return c.json(row, 201);
});

app.patch("/:id", zValidator("json", Update), async (c) => {
  assertSameOrigin(c);
  const [row] = await db.update(timelineEvents)
    .set(c.req.valid("json"))
    .where(eq(timelineEvents.id, c.req.param("id")))
    .returning();
  if (!row) throw new NotFoundError();
  return c.json(row);
});

app.delete("/:id", async (c) => {
  assertSameOrigin(c);
  const [row] = await db.delete(timelineEvents).where(eq(timelineEvents.id, c.req.param("id"))).returning();
  if (!row) throw new NotFoundError();
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import adminTimeline from "./routes/admin/timeline.js";
// ...
app.route("/api/admin/timeline", adminTimeline);
```

- [ ] **Step 3: Tests — at least CRUD happy path** (`api/test/timeline.test.ts`). Pattern mirrors Task 19 ; include: create, update, delete, 404 on unknown id, 401 without cookie.

- [ ] **Step 4: Run and commit**

```bash
npm test
git commit -am "feat(api): admin CRUD for timeline_events"
```

---

## Task 22 — Access token rotation

**Files:**
- Create: `api/src/routes/admin/access-token.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/access-token-rotation.test.ts`

- [ ] **Step 1: Write `api/src/routes/admin/access-token.ts`**

```ts
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../../db/client.js";
import { env } from "../../env.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { settings } = schema;

const app = new Hono();
app.use("*", requireAdmin);

app.post("/rotate", async (c) => {
  assertSameOrigin(c);
  const newToken = randomBytes(18).toString("base64url");
  await db.update(settings).set({
    accessToken: newToken,
    tokenRotatedAt: sql`now()`,
    updatedAt: sql`now()`,
  }).where(sql`${settings.id} = 1`);
  return c.json({ token: newToken, link: `${env.PUBLIC_ORIGIN}/?k=${newToken}` });
});

app.get("/link", async (c) => {
  const [s] = await db.select().from(settings).limit(1);
  if (!s) return c.json({ error: "not_initialised" }, 500);
  return c.json({ token: s.accessToken, link: `${env.PUBLIC_ORIGIN}/?k=${s.accessToken}` });
});

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import adminAccessToken from "./routes/admin/access-token.js";
// ...
app.route("/api/admin/access-token", adminAccessToken);
```

- [ ] **Step 3: Tests (`api/test/access-token-rotation.test.ts`)** — verify:
  - After rotate, the old token returns 404 on `/api/state`.
  - The new token returns 200.
  - `/link` returns the current token with PUBLIC_ORIGIN prepended.

- [ ] **Step 4: Run and commit**

```bash
npm test
git commit -am "feat(api): admin access-token rotation and link endpoint"
```

---

# Phase 8 — Photos (MinIO + sharp)

## Task 23 — MinIO client helpers

**Files:**
- Create: `api/src/lib/minio.ts`

- [ ] **Step 1: Write `api/src/lib/minio.ts`**

```ts
import { Client } from "minio";
import { env } from "../env.js";

const url = new URL(env.MINIO_ENDPOINT);

export const minio = new Client({
  endPoint: url.hostname,
  port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  useSSL: url.protocol === "https:",
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const BUCKET = env.MINIO_BUCKET;

export function objectKey(photoId: string, size: "thumb" | "medium" | "full", ext: "avif" | "webp" | "jpg"): string {
  return `photos/${photoId}/${size}.${ext}`;
}

export async function ensureBucket(): Promise<void> {
  if (!(await minio.bucketExists(BUCKET))) await minio.makeBucket(BUCKET);
}

export async function putBuffer(key: string, buf: Buffer, contentType: string): Promise<void> {
  await minio.putObject(BUCKET, key, buf, buf.length, { "Content-Type": contentType });
}

export function getReadStream(key: string): Promise<NodeJS.ReadableStream> {
  return minio.getObject(BUCKET, key);
}

export async function removePrefix(prefix: string): Promise<void> {
  const objects: string[] = [];
  for await (const o of minio.listObjects(BUCKET, prefix, true)) {
    if (o.name) objects.push(o.name);
  }
  if (objects.length) await minio.removeObjects(BUCKET, objects);
}
```

- [ ] **Step 2: Call `ensureBucket()` at boot** — add to `api/src/index.ts`:

```ts
import { ensureBucket } from "./lib/minio.js";
// ...
await runMigrations();
await runSeeds();
await ensureBucket();
```

- [ ] **Step 3: Commit**

```bash
git add api/src/lib/minio.ts api/src/index.ts
git commit -m "feat(api): MinIO client with bucket auto-create and object helpers"
```

---

## Task 24 — Sharp pipeline + blurhash

**Files:**
- Create: `api/src/lib/sharp-pipeline.ts`

- [ ] **Step 1: Write `api/src/lib/sharp-pipeline.ts`**

```ts
import { encode as encodeBlurhash } from "blurhash";
import sharp from "sharp";

export type VariantSize = "thumb" | "medium" | "full";
export type VariantFormat = "avif" | "webp" | "jpg";

export const SIZES: Record<VariantSize, number> = { thumb: 400, medium: 1200, full: 2000 };

export interface Variant {
  size: VariantSize;
  format: VariantFormat;
  buffer: Buffer;
  contentType: string;
}

export interface ProcessedPhoto {
  width: number;
  height: number;
  blurhash: string;
  variants: Variant[];
}

export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  // rotate() applies EXIF orientation ; default sharp behaviour strips metadata.
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("invalid image: no dimensions");

  const variants: Variant[] = [];

  for (const [size, width] of Object.entries(SIZES) as [VariantSize, number][]) {
    const [avif, webp, jpg] = await Promise.all([
      base.clone().resize({ width, withoutEnlargement: true }).avif({ quality: 50 }).toBuffer(),
      base.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
      base.clone().resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, progressive: true }).toBuffer(),
    ]);
    variants.push({ size, format: "avif", buffer: avif, contentType: "image/avif" });
    variants.push({ size, format: "webp", buffer: webp, contentType: "image/webp" });
    variants.push({ size, format: "jpg",  buffer: jpg,  contentType: "image/jpeg" });
  }

  // Blurhash from a tiny raw RGBA
  const bh = await base.clone()
    .resize({ width: 32, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encodeBlurhash(new Uint8ClampedArray(bh.data), bh.info.width, bh.info.height, 4, 3);

  return { width: meta.width, height: meta.height, blurhash, variants };
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/lib/sharp-pipeline.ts
git commit -m "feat(api): sharp pipeline producing 9 variants + blurhash"
```

---

## Task 25 — POST /api/admin/photos

**Files:**
- Create: `api/src/routes/admin/photos.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/photos.test.ts`

- [ ] **Step 1: Write `api/src/routes/admin/photos.ts`**

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { BUCKET, minio, objectKey, putBuffer, removePrefix } from "../../lib/minio.js";
import { processPhoto } from "../../lib/sharp-pipeline.js";
import { assertSameOrigin } from "../../lib/origin-check.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const { photos } = schema;

const ACCEPTED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);
const MAX_BYTES = 15 * 1024 * 1024;

const app = new Hono();
app.use("*", requireAdmin);

app.post("/", async (c) => {
  assertSameOrigin(c);
  const form = await c.req.parseBody({ all: false });
  const file = form.file;
  const section = String(form.section ?? "");
  const alt = String(form.alt ?? "");
  const position = Number(form.position ?? 0);

  if (!(file instanceof File)) throw new ValidationError("missing_file");
  if (!ACCEPTED_MIME.has(file.type)) throw new ValidationError("unsupported_type");
  if (file.size > MAX_BYTES) throw new ValidationError("file_too_large");
  if (!["triptych", "gallery"].includes(section)) throw new ValidationError("bad_section");

  const buf = Buffer.from(await file.arrayBuffer());
  const processed = await processPhoto(buf);

  const id = randomUUID();
  await Promise.all(
    processed.variants.map((v) => putBuffer(objectKey(id, v.size, v.format), v.buffer, v.contentType)),
  );

  const [row] = await db.insert(photos).values({
    id,
    section,
    position: Number.isFinite(position) ? position : 0,
    alt,
    width: processed.width,
    height: processed.height,
    blurhash: processed.blurhash,
  }).returning();

  return c.json(row, 201);
});

app.patch(
  "/:id",
  zValidator("json", z.object({
    alt: z.string().max(400).optional(),
    position: z.number().int().min(0).optional(),
    section: z.enum(["triptych", "gallery"]).optional(),
  })),
  async (c) => {
    assertSameOrigin(c);
    const [row] = await db.update(photos).set(c.req.valid("json")).where(eq(photos.id, c.req.param("id"))).returning();
    if (!row) throw new NotFoundError();
    return c.json(row);
  },
);

app.delete("/:id", async (c) => {
  assertSameOrigin(c);
  const id = c.req.param("id");
  const [row] = await db.delete(photos).where(eq(photos.id, id)).returning();
  if (!row) throw new NotFoundError();
  await removePrefix(`photos/${id}/`);
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import adminPhotos from "./routes/admin/photos.js";
// ...
app.route("/api/admin/photos", adminPhotos);
```

- [ ] **Step 3: Tests (`api/test/photos.test.ts`)** — use a small generated PNG (`sharp({ create: {...} })`) to avoid binary fixtures. Verify :
  - Upload with valid JPG returns 201 and the row contains width/height/blurhash.
  - Upload without file → 400.
  - Upload with `section=lol` → 400.
  - Delete removes row and MinIO objects (verify via `minio.listObjects`).
  - Upload strips EXIF GPS: create a JPEG with GPS metadata via `sharp`, upload, then re-read a variant from MinIO and assert its `sharp().metadata().exif` is `undefined` or has no GPS fields.

(The last test is security-critical — it's the proof that we don't leak geolocation from iPhone HEICs.)

- [ ] **Step 4: Run and commit**

```bash
npm test
git commit -am "feat(api): admin photo upload with sharp variants, blurhash, EXIF stripping and MinIO"
```

---

## Task 26 — GET /photos/:id/:size.:ext (streaming proxy)

**Files:**
- Create: `api/src/routes/photos.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write `api/src/routes/photos.ts`**

```ts
import { Readable } from "node:stream";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { NotFoundError } from "../lib/errors.js";
import { getReadStream, objectKey } from "../lib/minio.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const CONTENT_TYPES = {
  avif: "image/avif",
  webp: "image/webp",
  jpg:  "image/jpeg",
} as const;

type Ext = keyof typeof CONTENT_TYPES;
type Size = "thumb" | "medium" | "full";

const app = new Hono();

app.get("/:id/:file", requireAccessToken, async (c) => {
  const id = c.req.param("id");
  const [sizeStr, ext] = c.req.param("file").split(".");
  if (!["thumb", "medium", "full"].includes(sizeStr!)) throw new NotFoundError();
  if (!ext || !(ext in CONTENT_TYPES)) throw new NotFoundError();

  let nodeStream: NodeJS.ReadableStream;
  try {
    nodeStream = await getReadStream(objectKey(id, sizeStr as Size, ext as Ext));
  } catch {
    throw new NotFoundError();
  }

  c.header("Content-Type", CONTENT_TYPES[ext as Ext]);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return stream(c, async (s) => {
    await s.pipe(Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream<Uint8Array>);
  });
});

export default app;
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import photosRoute from "./routes/photos.js";
// ...
app.route("/photos", photosRoute);
```

- [ ] **Step 3: Extend `api/test/photos.test.ts`** with:
  - GET `/photos/<unknown>/thumb.avif` → 404.
  - After upload, GET `/photos/<id>/thumb.avif` with token returns 200, `content-type: image/avif`, non-empty body.
  - Without token → 404.

- [ ] **Step 4: Run and commit**

```bash
npm test
git commit -am "feat(api): stream MinIO photo variants via /photos with access-token gating and long cache"
```

---

# Phase 9 — Front refactor (public side)

## Task 27 — Entry point: fetch state + token bootstrap

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`

- [ ] **Step 1: In `web/index.html` `<head>`**, add OG tags and PWA manifest link (OG images refer to `/og.png` which will exist later):

```html
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#1a2340">
<meta property="og:title" content="Faire-part de naissance">
<meta property="og:description" content="Un petit être né ce printemps.">
<meta property="og:image" content="/og.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```

- [ ] **Step 2: In `web/app.js`**, replace the top `TWEAK_DEFAULTS` / `state` blocks with:

```js
const state = {
  tweaks: {},
  photos: [],
  gifts: [],
  timeline: [],
  sceneIdx: 0,
  scenes: [],
  rail: null,
  musicPlaying: false,
  reservedGiftIds: new Set(JSON.parse(localStorage.getItem('reservedGiftIds') || '[]')),
};

const ACCENTS = {
  gold:  { "--gold": "oklch(0.72 0.08 80)",  "--gold-soft": "oklch(0.82 0.05 85)"  },
  sage:  { "--gold": "oklch(0.72 0.06 150)", "--gold-soft": "oklch(0.82 0.04 150)" },
  rose:  { "--gold": "oklch(0.76 0.08 25)",  "--gold-soft": "oklch(0.85 0.05 25)"  },
  azure: { "--gold": "oklch(0.78 0.08 230)", "--gold-soft": "oklch(0.86 0.05 230)" },
};

function getAccessToken() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('k');
  if (fromUrl) {
    localStorage.setItem('accessToken', fromUrl);
    url.searchParams.delete('k');
    history.replaceState(null, '', url.toString());
    return fromUrl;
  }
  return localStorage.getItem('accessToken');
}

async function fetchState(token) {
  const r = await fetch('/api/state', { headers: { 'X-Access-Token': token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('state_fetch_failed');
  return r.json();
}

function showPrivateLanding() {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:2rem;text-align:center;
                 background:oklch(0.22 0.045 255);color:oklch(0.965 0.015 85);font-family:'Cormorant Garamond',serif;">
      <div style="max-width:420px;">
        <p style="font-size:14px;letter-spacing:.35em;text-transform:uppercase;opacity:.6;">Introuvable</p>
        <h1 style="font-weight:300;font-size:36px;margin:12px 0 16px;">Ce faire-part n'existe pas ou plus.</h1>
        <p style="opacity:.7;">Vérifiez le lien reçu par les parents.</p>
      </div>
    </main>
  `;
}
```

- [ ] **Step 3: Replace the `init()` function**:

```js
async function init() {
  const token = getAccessToken();
  if (!token) { showPrivateLanding(); return; }

  let data;
  try { data = await fetchState(token); }
  catch { showPrivateLanding(); return; }
  if (!data) { showPrivateLanding(); return; }

  Object.assign(state, data);

  state.rail = $('#rail');
  state.scenes = $$('.scene');
  syncSceneChrome();
  updateActiveScene();

  state.rail.addEventListener('scroll', () => requestAnimationFrame(updateActiveScene));

  $('#prevBtn').addEventListener('click', () => goTo(state.sceneIdx - 1));
  $('#nextBtn').addEventListener('click', () => goTo(state.sceneIdx + 1));
  $$('#progress .seg').forEach((el, i) => el.addEventListener('click', () => goTo(i)));

  document.addEventListener('keydown', (e) => {
    const vertical = getComputedStyle(state.rail).flexDirection === 'column';
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (vertical && e.key === 'ArrowDown'))
      { e.preventDefault(); goTo(state.sceneIdx + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp' || (vertical && e.key === 'ArrowUp'))
      { e.preventDefault(); goTo(state.sceneIdx - 1); }
  });

  state.rail.addEventListener('wheel', (e) => {
    const vertical = getComputedStyle(state.rail).flexDirection === 'column';
    if (vertical) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      state.rail.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  $('#musicBtn').addEventListener('click', toggleMusic);

  applyTweaks();
  applyTimeline();
  renderPhotos();
  renderGifts();
  subscribeSSE(token);
  registerServiceWorker();
}
```

- [ ] **Step 4: Remove the guestbook bits** — delete `state.messages`, `renderMessages()`, `handleGuestSubmit()`, `$('#guestForm').addEventListener(...)` call, plus the scene 08 `<section class="scene scene-guestbook">` block in `index.html`, and the corresponding `.seg` entry in `<div class="progress">`. Also renumber scenes 09→08, 10→09, 11→10 in their `data-screen-label` and badges.

- [ ] **Step 5: Update `goTo` and `updateActiveScene`** for vertical:

```js
function updateActiveScene() {
  const rail = state.rail;
  const vertical = getComputedStyle(rail).flexDirection === 'column';
  const idx = vertical
    ? Math.round(rail.scrollTop / window.innerHeight)
    : Math.round(rail.scrollLeft / window.innerWidth);
  if (idx !== state.sceneIdx) { state.sceneIdx = idx; syncSceneChrome(); }
  state.scenes.forEach((s, i) => s.classList.toggle('is-active', i === idx));
}

function goTo(idx) {
  idx = Math.max(0, Math.min(state.scenes.length - 1, idx));
  const vertical = getComputedStyle(state.rail).flexDirection === 'column';
  state.rail.scrollTo(
    vertical ? { top: idx * window.innerHeight, behavior: 'smooth' }
             : { left: idx * window.innerWidth, behavior: 'smooth' },
  );
}
```

- [ ] **Step 6: Add stubs for the new functions (implemented in subsequent tasks)**

```js
function applyTimeline() { /* Task 28 */ }
function renderPhotos()  { /* Task 29 */ }
function renderGifts()   { /* replaces existing — Task 30 */ }
function subscribeSSE()  { /* Task 31 */ }
function registerServiceWorker() { /* Task 35 */ }
```

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "refactor(web): bootstrap via /api/state fetch, remove hardcoded content and guestbook

- Token read from ?k= once, persisted in localStorage, URL scrubbed via history.replaceState.
- showPrivateLanding on 404/missing token.
- Scenes renumbered 01..10 after removing the Livre d'or scene.
- vertical/horizontal-aware updateActiveScene and goTo."
```

---

## Task 28 — applyTimeline()

**Files:**
- Modify: `web/app.js`
- Modify: `web/index.html` (remove the hardcoded `.tick` elements — they become empty container)

- [ ] **Step 1: In `index.html` scene 06**, replace the inlined `.tick` blocks with just the container:

```html
<div class="timeline" id="timelineList"></div>
```

- [ ] **Step 2: In `web/app.js`**:

```js
function applyTimeline() {
  const list = document.getElementById('timelineList');
  if (!list) return;
  list.innerHTML = '';
  for (const e of state.timeline) {
    const el = document.createElement('div');
    el.className = 'tick' + (e.isNow ? ' now' : '');
    const d = document.createElement('div'); d.className = 'date'; d.textContent = e.dateLabel;
    const l = document.createElement('div'); l.className = 'label'; l.textContent = e.text;
    el.append(d, l);
    list.appendChild(el);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): render chronology dynamically from state.timeline"
```

---

## Task 29 — renderPhotos() with `<picture>` and blurhash

**Files:**
- Modify: `web/app.js`
- Modify: `web/index.html` (triptych + gallery sections)
- Modify: `web/styles.css` (photo container + blurhash-background placeholder)

- [ ] **Step 1: Mark the triptych and gallery containers with IDs**

`index.html` scene 03:
```html
<div class="triptych" id="triptychGrid"></div>
```

scene 07:
```html
<div class="gallery" id="galleryGrid"></div>
```

- [ ] **Step 2: Add a small blurhash decoder** (pure JS, ~50 lines). Instead of decoding blurhash client-side, we use a simpler trick: the CSS background is a scaled-up `4×3` color gradient generated server-side... or, simplest: just lazy-load with `background-color` fallback = `#1a2340` while the image decodes. Blurhash remains a future enhancement, but the DB column is there.

For V1, render with `<picture>` and a dark background:

```js
function renderPhotos() {
  const grids = [
    { el: document.getElementById('triptychGrid'), section: 'triptych' },
    { el: document.getElementById('galleryGrid'),  section: 'gallery' },
  ];
  for (const { el, section } of grids) {
    if (!el) continue;
    el.innerHTML = '';
    const items = state.photos.filter((p) => p.section === section);
    for (const p of items) {
      const pic = document.createElement('picture');
      pic.className = 'ph';
      pic.innerHTML = `
        <source type="image/avif" srcset="/photos/${p.id}/thumb.avif 400w, /photos/${p.id}/medium.avif 1200w, /photos/${p.id}/full.avif 2000w" sizes="(max-width: 820px) 100vw, 33vw">
        <source type="image/webp" srcset="/photos/${p.id}/thumb.webp 400w, /photos/${p.id}/medium.webp 1200w, /photos/${p.id}/full.webp 2000w" sizes="(max-width: 820px) 100vw, 33vw">
        <img src="/photos/${p.id}/medium.jpg"
             srcset="/photos/${p.id}/thumb.jpg 400w, /photos/${p.id}/medium.jpg 1200w, /photos/${p.id}/full.jpg 2000w"
             sizes="(max-width: 820px) 100vw, 33vw"
             width="${p.width}" height="${p.height}"
             alt="${(p.alt || '').replace(/"/g, '&quot;')}"
             loading="lazy" decoding="async">
      `;
      el.appendChild(pic);
    }
  }
}
```

- [ ] **Step 3: Update CSS** to give `.ph` proper layout, aspect-ratio and dark placeholder background:

```css
.ph {
  display: block;
  width: 100%;
  background: oklch(0.22 0.045 255);
  overflow: hidden;
  border-radius: 2px;
}
.ph > img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}
```

- [ ] **Step 4: Token-aware request** — `/photos/*` is token-gated. The browser loads `<img>` without the `X-Access-Token` header. Caddy (Phase 10) will forward the token from a **cookie** instead. Add a small setup: after first successful `/api/state`, write a same-site cookie `_k=<token>` (no HttpOnly, since JS needs to set it once). Then, in `require-access-token.ts`, also accept the cookie. Modify now:

In `web/app.js` after successful `fetchState`:
```js
document.cookie = `_k=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=31536000`;
```

In `api/src/middleware/require-access-token.ts`:
```ts
import { getCookie } from "hono/cookie";
// ...
const got = c.req.header("x-access-token") ?? getCookie(c, "_k") ?? c.req.query("k") ?? "";
```

Cover this in a new test in `api/test/photos.test.ts`: set `Cookie: _k=<token>`, fetch a photo variant, expect 200.

- [ ] **Step 5: Commit**

```bash
git add web/ api/src/middleware/require-access-token.ts api/test/photos.test.ts
git commit -m "feat(web,api): render photos with <picture>; accept access token via _k cookie"
```

---

## Task 30 — Gift rendering + reservation modal

**Files:**
- Modify: `web/app.js` (replace `renderGifts`)
- Modify: `web/index.html` (registry section)
- Modify: `web/styles.css` (modal styles)

- [ ] **Step 1: Add a hidden modal at the bottom of `<body>`** in `index.html`:

```html
<dialog id="giftModal" class="gift-modal" aria-labelledby="giftModalTitle">
  <form method="dialog" id="giftModalForm" novalidate>
    <h3 id="giftModalTitle"></h3>
    <p class="gift-modal-range" id="giftModalRange"></p>
    <label>Qui êtes-vous ?
      <input type="text" name="name" required minlength="1" maxlength="80" autocomplete="name">
    </label>
    <label>Un petit mot (optionnel) ?
      <textarea name="note" maxlength="500" rows="3"></textarea>
    </label>
    <div class="gift-modal-actions">
      <button value="cancel">Annuler</button>
      <button value="confirm" class="primary">Je le prends</button>
    </div>
    <p class="gift-modal-error" id="giftModalError" hidden></p>
  </form>
</dialog>
```

- [ ] **Step 2: Write `renderGifts()`** and the modal logic in `app.js`:

```js
function renderGifts() {
  const grid = document.getElementById('regGrid');
  grid.innerHTML = '';
  for (const g of state.gifts) {
    const el = document.createElement('div');
    el.className = 'gift' + (g.takenBy ? ' taken' : '');
    el.dataset.id = g.id;
    const mineFlag = state.reservedGiftIds.has(g.id) ? ' (réservé par vous)' : '';
    el.innerHTML = `
      <div class="ph"></div>
      <div class="g-name"></div>
      <div class="g-meta">
        <span class="g-range"></span>
        <span class="g-status"></span>
      </div>
    `;
    el.querySelector('.g-name').textContent = g.name;
    el.querySelector('.g-range').textContent = g.rangeText;
    el.querySelector('.g-status').textContent = g.takenBy
      ? `✓ Pris par ${g.takenBy}${mineFlag}`
      : '○ Disponible';
    el.addEventListener('click', () => openGiftModal(g));
    grid.appendChild(el);
  }
}

function openGiftModal(gift) {
  const dlg = document.getElementById('giftModal');
  const form = dlg.querySelector('form');
  document.getElementById('giftModalTitle').textContent = gift.name;
  document.getElementById('giftModalRange').textContent = gift.rangeText;
  const nameInput = form.name;
  nameInput.value = '';
  form.note.value = '';
  const err = document.getElementById('giftModalError');
  err.hidden = true;

  const mine = state.reservedGiftIds.has(gift.id);
  const alreadyTaken = !!gift.takenBy;

  if (alreadyTaken && !mine) {
    err.hidden = false;
    err.textContent = `Déjà réservé par ${gift.takenBy}. Les parents peuvent annuler si besoin.`;
    form.querySelector('button[value=confirm]').disabled = true;
  } else if (mine) {
    form.querySelector('button[value=confirm]').textContent = "Annuler ma réservation";
    form.querySelector('button[value=confirm]').disabled = false;
  } else {
    form.querySelector('button[value=confirm]').textContent = "Je le prends";
    form.querySelector('button[value=confirm]').disabled = false;
  }

  dlg.showModal();

  form.addEventListener('submit', async (e) => {
    const btn = e.submitter;
    if (!btn || btn.value !== 'confirm') return;
    e.preventDefault();
    const token = localStorage.getItem('accessToken');
    try {
      if (mine) {
        const r = await fetch(`/api/gifts/${gift.id}/unreserve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Access-Token': token },
          body: JSON.stringify({ name: gift.takenBy }),
        });
        if (!r.ok) throw new Error();
        state.reservedGiftIds.delete(gift.id);
      } else {
        const name = form.name.value.trim();
        if (!name) { err.hidden = false; err.textContent = "Prénom requis."; return; }
        const r = await fetch(`/api/gifts/${gift.id}/reserve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Access-Token': token },
          body: JSON.stringify({ name, note: form.note.value || undefined }),
        });
        if (r.status === 409) { err.hidden = false; err.textContent = "Déjà réservé."; return; }
        if (!r.ok) throw new Error();
        state.reservedGiftIds.add(gift.id);
      }
      localStorage.setItem('reservedGiftIds', JSON.stringify([...state.reservedGiftIds]));
      dlg.close();
    } catch {
      err.hidden = false;
      err.textContent = "Une erreur est survenue. Réessayez.";
    }
  }, { once: true });
}
```

- [ ] **Step 3: Add modal CSS** in `styles.css`:

```css
.gift-modal {
  border: 0;
  padding: 32px;
  background: oklch(0.22 0.045 255);
  color: var(--cream);
  max-width: 440px;
  width: min(440px, 90vw);
  border-radius: 4px;
  font-family: var(--serif);
}
.gift-modal::backdrop { background: rgba(10,12,20,.75); }
.gift-modal h3 { font-weight: 300; font-size: 28px; }
.gift-modal-range { color: var(--gold); font-size: 13px; letter-spacing: .2em; margin: 6px 0 18px; text-transform: uppercase; }
.gift-modal label { display:block; font-size: 13px; opacity:.8; margin-top: 16px; }
.gift-modal input, .gift-modal textarea {
  background: transparent;
  border: 0;
  border-bottom: 1px solid oklch(0.96 0.015 85 / 0.3);
  color: var(--cream);
  font-family: var(--serif);
  font-size: 17px;
  padding: 6px 2px;
  width: 100%;
}
.gift-modal textarea { resize: vertical; }
.gift-modal-actions { display:flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }
.gift-modal-actions button {
  background: transparent; color: var(--cream); border: 1px solid oklch(0.96 0.015 85 / 0.3);
  padding: 10px 16px; font-family: var(--serif); font-size: 14px; cursor: pointer; border-radius: 2px;
}
.gift-modal-actions button.primary { background: var(--gold); color: var(--ink); border-color: var(--gold); }
.gift-modal-actions button[disabled] { opacity:.4; cursor: not-allowed; }
.gift-modal-error { color: oklch(0.76 0.1 25); font-style: italic; margin-top: 16px; font-size: 13px; }
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): gift reservation modal with API integration and local mine-state"
```

---

## Task 31 — subscribeSSE() + live updates

**Files:**
- Modify: `web/app.js`

- [ ] **Step 1: Implement the function**

```js
function subscribeSSE(token) {
  const es = new EventSource(`/api/stream?k=${encodeURIComponent(token)}`);
  es.addEventListener('gift.reserved', (e) => { applyGiftPatch(JSON.parse(e.data)); });
  es.addEventListener('gift.unreserved', (e) => { applyGiftPatch(JSON.parse(e.data)); });
  es.addEventListener('gift.created',  (e) => { applyGiftCreated(JSON.parse(e.data).gift); });
  es.addEventListener('gift.updated',  (e) => { applyGiftCreated(JSON.parse(e.data).gift); });
  es.addEventListener('gift.deleted',  (e) => { applyGiftDeleted(JSON.parse(e.data).id); });
  // ping event is silently ignored
}

function applyGiftPatch(evt) {
  const g = state.gifts.find((x) => x.id === evt.id);
  if (!g) return;
  if (evt.type === 'gift.reserved') {
    g.takenBy = evt.taken_by; g.takenNote = evt.taken_note; g.takenAt = evt.taken_at;
  } else {
    g.takenBy = null; g.takenNote = null; g.takenAt = null;
  }
  renderGifts();
}
function applyGiftCreated(gift) {
  const idx = state.gifts.findIndex((x) => x.id === gift.id);
  if (idx >= 0) state.gifts[idx] = gift; else state.gifts.push(gift);
  state.gifts.sort((a, b) => a.position - b.position);
  renderGifts();
}
function applyGiftDeleted(id) {
  state.gifts = state.gifts.filter((x) => x.id !== id);
  state.reservedGiftIds.delete(id);
  localStorage.setItem('reservedGiftIds', JSON.stringify([...state.reservedGiftIds]));
  renderGifts();
}
```

- [ ] **Step 2: Query param token** — note we use `?k=` for EventSource because the `EventSource` API doesn't let you set headers. This is the one case where the token appears in the URL. It's inside the TLS connection so it doesn't leak over the wire ; it may appear in Caddy logs (strip with `log { format ... redact }`).

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): subscribe to SSE and update gifts state in real time"
```

---

# Phase 10 — Mobile (M2) + PWA

## Task 32 — Mobile vertical stack

**Files:**
- Modify: `web/styles.css`

- [ ] **Step 1: Append at the end of `styles.css`**

```css
/* ============================================================
   Mobile — vertical feed (M2)
   ============================================================ */
@media (max-width: 820px) {
  html, body { overflow: auto; }
  .rail {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    scroll-snap-type: y mandatory;
    height: auto;
    min-height: 100svh;
  }
  .scene {
    flex: 0 0 auto;
    width: 100vw;
    height: 100svh;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    padding: 8vh 6vw;
  }
  .chrome-top, .chrome-bottom { bottom: 14px; top: auto; }
  .scroll-cue::after { content: "Faire défiler ↓"; }
  .triptych, .gallery { grid-template-columns: 1fr; gap: 16px; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .tree-row { flex-direction: column; gap: 20px; }

  /* scene-count and buttons smaller */
  .scene-count { font-size: 12px; }
  .nav-btn { width: 36px; height: 36px; }
}

/* ============================================================
   Reduced motion
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
  .rail { scroll-behavior: auto; scroll-snap-type: none; }
  .reveal { opacity: 1 !important; transform: none !important; }
}
```

- [ ] **Step 2: Manual test on a narrow viewport** (DevTools iPhone SE 375×667). Verify :
  - Scroll is vertical with snap.
  - All scenes fit 100svh.
  - Nav buttons work.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): mobile M2 — vertical snap feed and prefers-reduced-motion"
```

---

## Task 33 — PWA manifest + icons placeholders

**Files:**
- Create: `web/manifest.webmanifest`
- Create: `web/icons/favicon.svg`, `web/icons/icon-192.png`, `web/icons/icon-512.png`, `web/icons/apple-touch-icon.png`, `web/og.png`

- [ ] **Step 1: Write `web/manifest.webmanifest`**

```json
{
  "name": "Faire-part de naissance",
  "short_name": "Faire-part",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#1a2340",
  "background_color": "#1a2340",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create a minimal SVG favicon**

```xml
<!-- web/icons/favicon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1a2340"/>
  <circle cx="16" cy="16" r="6" fill="#c9a66b"/>
</svg>
```

- [ ] **Step 3: Generate PNG icons** via a small script. Create `api/src/scripts/generate-icons.ts`:

```ts
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const SVG = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1a2340"/>
  <circle cx="256" cy="256" r="96" fill="#c9a66b"/>
</svg>`);

for (const size of [192, 512]) {
  const buf = await sharp(SVG).resize(size, size).png().toBuffer();
  await writeFile(`../web/icons/icon-${size}.png`, buf);
}
await writeFile(
  "../web/icons/apple-touch-icon.png",
  await sharp(SVG).resize(180, 180).png().toBuffer(),
);
// OG image 1200×630 — placeholder
const og = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1a2340"/>
  <circle cx="600" cy="315" r="110" fill="#c9a66b"/>
</svg>`);
await writeFile("../web/og.png", await sharp(og).png().toBuffer());
// eslint-disable-next-line no-console
console.log("icons generated");
```

Run from `api/`:
```bash
npx tsx src/scripts/generate-icons.ts
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/manifest.webmanifest web/icons/ web/og.png api/src/scripts/generate-icons.ts
git commit -m "feat(web): PWA manifest and generated placeholder icons + OG image"
```

---

## Task 34 — Service worker

**Files:**
- Create: `web/sw.js`
- Modify: `web/app.js` (registerServiceWorker)

- [ ] **Step 1: Write `web/sw.js`**

```js
const CACHE = 'annonce-v1';
const CORE = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Admin and SSE: never cache
  if (url.pathname.startsWith('/api/admin/') || url.pathname === '/api/stream') return;

  // Initial state: network-first, cache fallback
  if (url.pathname === '/api/state') {
    e.respondWith(
      fetch(e.request).then((r) => {
        caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Photos: cache-first with long TTL (already immutable server-side)
  if (url.pathname.startsWith('/photos/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((r) => {
      caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
      return r;
    })));
    return;
  }

  // Other assets: stale-while-revalidate
  if (url.pathname === '/' || url.pathname.startsWith('/icons/') || /\.(css|js|woff2|png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => {
      const fresh = fetch(e.request).then((r) => {
        caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        return r;
      });
      return hit ?? fresh;
    }));
  }
});
```

- [ ] **Step 2: Register from `app.js`**

```js
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): minimal service worker (offline after first visit, cache-first for photos)"
```

---

# Phase 11 — Admin front

## Task 35 — admin.html + auth scaffold

**Files:**
- Create: `web/admin.html`
- Create: `web/admin.css`
- Create: `web/admin.js`

- [ ] **Step 1: Write `web/admin.html`**

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Admin · Faire-part</title>
  <link rel="stylesheet" href="/admin.css">
</head>
<body>
  <div id="loginPanel" class="login">
    <form id="loginForm">
      <h1>Administration</h1>
      <label>Mot de passe <input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit">Entrer</button>
      <p id="loginError" class="error" hidden></p>
    </form>
  </div>

  <div id="adminPanel" class="panel" hidden>
    <aside class="sidebar">
      <h1>Admin</h1>
      <nav>
        <button data-tab="tweaks" class="active">Textes</button>
        <button data-tab="photos">Photos</button>
        <button data-tab="gifts">Cadeaux</button>
        <button data-tab="timeline">Chronologie</button>
        <button data-tab="link">Lien privé</button>
        <button data-tab="security">Sécurité</button>
      </nav>
      <button id="logoutBtn">Déconnexion</button>
    </aside>
    <main class="editor">
      <section id="tab-tweaks" class="tab"></section>
      <section id="tab-photos" class="tab" hidden></section>
      <section id="tab-gifts" class="tab" hidden></section>
      <section id="tab-timeline" class="tab" hidden></section>
      <section id="tab-link" class="tab" hidden></section>
      <section id="tab-security" class="tab" hidden></section>
    </main>
    <aside class="preview">
      <iframe id="previewFrame" title="Aperçu"></iframe>
    </aside>
  </div>

  <script type="module" src="/admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `web/admin.css`**

```css
:root {
  --bg: #0f1324;
  --panel: #171c32;
  --ink: #e7e2d6;
  --muted: #9a95a5;
  --accent: #c9a66b;
  --border: #272e4d;
  --err: #e07a6a;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, sans-serif; }
.login { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.login form { background: var(--panel); padding: 32px; border-radius: 8px; width: 340px; }
.login h1 { margin: 0 0 16px; font-weight: 400; }
label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 12px; }
input, textarea, select {
  width: 100%; background: transparent; color: var(--ink); border: 1px solid var(--border);
  padding: 8px 10px; border-radius: 4px; font: inherit; margin-top: 4px;
}
button { cursor: pointer; background: var(--accent); color: #1a1a1a; border: 0; padding: 10px 16px; border-radius: 4px; font: inherit; }
button.secondary { background: transparent; color: var(--ink); border: 1px solid var(--border); }
button.danger   { background: var(--err); color: white; }
.error { color: var(--err); font-size: 13px; margin-top: 8px; }

.panel { display: grid; grid-template-columns: 220px 1fr 1fr; min-height: 100vh; }
.sidebar { background: var(--panel); padding: 24px 16px; display: flex; flex-direction: column; gap: 8px; border-right: 1px solid var(--border); }
.sidebar nav { display: flex; flex-direction: column; gap: 4px; flex: 1; margin-top: 12px; }
.sidebar nav button { background: transparent; color: var(--ink); text-align: left; padding: 8px 12px; border-radius: 4px; }
.sidebar nav button.active { background: var(--border); }
.editor { padding: 24px; overflow-y: auto; max-height: 100vh; }
.preview { border-left: 1px solid var(--border); }
.preview iframe { width: 100%; height: 100vh; border: 0; }

.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.section-title { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .2em; margin: 24px 0 8px; }
.item { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 12px; margin-bottom: 8px; }
.swatches { display: flex; gap: 8px; margin-top: 8px; }
.swatch { width: 28px; height: 28px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
.swatch.active { border-color: white; }
```

- [ ] **Step 3: Write the auth scaffold in `web/admin.js`**

```js
const API = {
  async login(password) {
    const r = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) throw new Error('login_failed');
  },
  async logout() { await fetch('/api/admin/logout', { method: 'POST' }); },
  async me() { const r = await fetch('/api/admin/me'); return r.ok; },
};

function show(id, on = true) { document.getElementById(id).hidden = !on; }
function $(sel) { return document.querySelector(sel); }

async function bootstrap() {
  if (await API.me()) return enterAdmin();
  show('loginPanel', true); show('adminPanel', false);
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    err.hidden = true;
    try {
      await API.login(e.target.password.value);
      enterAdmin();
    } catch {
      err.textContent = 'Mot de passe invalide.';
      err.hidden = false;
    }
  });
  $('#logoutBtn').addEventListener('click', async () => { await API.logout(); location.reload(); });
}

async function enterAdmin() {
  show('loginPanel', false); show('adminPanel', true);
  setupTabs();
  await loadAccessLink();
  setPreviewSrc();
  // Tabs are filled lazily — next tasks wire them.
}

function setupTabs() {
  for (const btn of document.querySelectorAll('.sidebar nav button')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar nav button').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab').forEach((t) => t.hidden = t.id !== `tab-${btn.dataset.tab}`);
    });
  }
}

let CURRENT_TOKEN = '';
async function loadAccessLink() {
  const r = await fetch('/api/admin/access-token/link');
  const j = await r.json();
  CURRENT_TOKEN = j.token;
}

function setPreviewSrc() {
  $('#previewFrame').src = `/?k=${encodeURIComponent(CURRENT_TOKEN)}`;
}

bootstrap();
```

- [ ] **Step 4: Commit**

```bash
git add web/admin.html web/admin.css web/admin.js
git commit -m "feat(web): admin login scaffold and empty tabs wired to sidebar"
```

---

## Task 36 — Admin tab: Textes (tweaks)

**Files:**
- Modify: `web/admin.js`

- [ ] **Step 1: Add in `admin.js`** (after `enterAdmin`):

```js
const TWEAK_LABELS = {
  babyName: "Prénom",
  babyMiddle: "Second prénom",
  dateLong: "Date (long)",
  dateShort: "Date (court)",
  timeBirth: "Heure",
  weight: "Poids (kg)",
  height: "Taille (cm)",
  city: "Ville",
  maternity: "Maternité",
  father: "Père",
  mother: "Mère",
  paternalGP: "Grands-parents paternels",
  maternalGP: "Grands-parents maternels",
  accent: "Accent (couleur)",
};
const ACCENT_COLORS = { gold: "#c9a66b", sage: "#8cae95", rose: "#d79898", azure: "#8fb0d9" };

async function loadState() {
  const r = await fetch('/api/state', { headers: { 'X-Access-Token': CURRENT_TOKEN } });
  return r.json();
}

let debounceTimers = new Map();
function patchTweak(key, value) {
  clearTimeout(debounceTimers.get(key));
  debounceTimers.set(key, setTimeout(async () => {
    await fetch('/api/admin/tweaks', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    // Notify the preview iframe
    $('#previewFrame').contentWindow.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*');
  }, 500));
}

async function renderTweaksTab() {
  const tab = $('#tab-tweaks');
  tab.innerHTML = '';
  const data = await loadState();

  for (const [key, label] of Object.entries(TWEAK_LABELS)) {
    if (key === 'accent') continue;
    const group = document.createElement('label');
    group.innerHTML = `${label} <input data-key="${key}" value="${(data.tweaks[key] ?? '').replace(/"/g, '&quot;')}">`;
    tab.appendChild(group);
  }

  // Accent swatches
  const accent = document.createElement('div');
  accent.innerHTML = `<div class="section-title">Accent</div><div class="swatches"></div>`;
  for (const [key, col] of Object.entries(ACCENT_COLORS)) {
    const sw = document.createElement('div');
    sw.className = 'swatch' + (data.tweaks.accent === key ? ' active' : '');
    sw.style.background = col;
    sw.dataset.accent = key;
    sw.addEventListener('click', () => {
      accent.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === sw));
      patchTweak('accent', key);
    });
    accent.querySelector('.swatches').appendChild(sw);
  }
  tab.appendChild(accent);

  tab.addEventListener('input', (e) => {
    const key = e.target.dataset.key;
    if (key) patchTweak(key, e.target.value);
  });
}
```

- [ ] **Step 2: Call `renderTweaksTab()` when tab activates** — extend `setupTabs()`:

```js
function setupTabs() {
  const handlers = {
    tweaks: renderTweaksTab,
    photos: renderPhotosTab,
    gifts: renderGiftsTab,
    timeline: renderTimelineTab,
    link: renderLinkTab,
    security: renderSecurityTab,
  };
  const shown = new Set();
  for (const btn of document.querySelectorAll('.sidebar nav button')) {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.sidebar nav button').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab').forEach((t) => t.hidden = t.id !== `tab-${btn.dataset.tab}`);
      if (!shown.has(btn.dataset.tab)) { shown.add(btn.dataset.tab); await handlers[btn.dataset.tab](); }
    });
  }
  renderTweaksTab(); shown.add('tweaks');
}

// stubs for later tasks:
async function renderPhotosTab()   { $('#tab-photos').innerHTML = '<p>… Task 37</p>'; }
async function renderGiftsTab()    { $('#tab-gifts').innerHTML = '<p>… Task 38</p>'; }
async function renderTimelineTab() { $('#tab-timeline').innerHTML = '<p>… Task 39</p>'; }
async function renderLinkTab()     { $('#tab-link').innerHTML = '<p>… Task 39</p>'; }
async function renderSecurityTab() { $('#tab-security').innerHTML = '<p>… Task 39</p>'; }
```

- [ ] **Step 3: Verify the existing `__edit_mode_set_keys` handler in `web/app.js`** still works:

Already in the code (app.js:274-278) — it reads `d.type === '__edit_mode_set_keys'` then applies. Extend that handler to actually call `applyTweaks()`:

```js
window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === '__edit_mode_set_keys' && d.edits) {
    Object.assign(state.tweaks, d.edits);
    applyTweaks();
  }
});
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web,admin): text edit tab with debounced PATCH and live preview via postMessage"
```

---

## Task 37 — Admin tab: Photos

**Files:**
- Modify: `web/admin.js`

- [ ] **Step 1: Implement `renderPhotosTab`**

```js
async function renderPhotosTab() {
  const tab = $('#tab-photos');
  tab.innerHTML = `
    <div class="section-title">Ajouter une photo</div>
    <form id="photoUpload">
      <label>Fichier <input type="file" name="file" accept="image/*" required></label>
      <label>Section
        <select name="section">
          <option value="triptych">Triptyque (scène 03)</option>
          <option value="gallery">Galerie (scène 07)</option>
        </select>
      </label>
      <label>Alt (description pour a11y, obligatoire)
        <input name="alt" required maxlength="300">
      </label>
      <label>Position <input name="position" type="number" value="0" min="0"></label>
      <button type="submit">Uploader</button>
      <p id="photoUploadStatus"></p>
    </form>
    <div class="section-title">Existantes</div>
    <div id="photoList"></div>
  `;

  const form = $('#photoUpload');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.alt.value.trim()) return;
    const fd = new FormData(form);
    $('#photoUploadStatus').textContent = 'Upload et traitement…';
    const r = await fetch('/api/admin/photos', { method: 'POST', body: fd });
    if (!r.ok) { $('#photoUploadStatus').textContent = 'Erreur ' + r.status; return; }
    $('#photoUploadStatus').textContent = 'OK.';
    form.reset();
    await refreshPhotoList();
    $('#previewFrame').contentWindow.location.reload();  // easiest way to show the new photo
  });

  await refreshPhotoList();
}

async function refreshPhotoList() {
  const data = await loadState();
  const list = $('#photoList');
  list.innerHTML = '';
  for (const p of data.photos) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <img src="/photos/${p.id}/thumb.jpg" width="120" style="float:left;margin-right:12px;">
      <div><b>${p.section}</b> — ${p.width}×${p.height} — pos ${p.position}<br>
      <small>${p.alt || '<i>sans alt</i>'}</small></div>
      <div style="margin-top:8px;">
        <button class="secondary" data-action="edit">Éditer alt/pos</button>
        <button class="danger" data-action="delete">Supprimer</button>
      </div>
    `;
    el.querySelector('[data-action=delete]').addEventListener('click', async () => {
      if (!confirm('Supprimer cette photo ?')) return;
      await fetch(`/api/admin/photos/${p.id}`, { method: 'DELETE' });
      await refreshPhotoList();
    });
    el.querySelector('[data-action=edit]').addEventListener('click', async () => {
      const alt = prompt('Alt text', p.alt) ?? p.alt;
      const position = Number(prompt('Position', p.position) ?? p.position);
      await fetch(`/api/admin/photos/${p.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alt, position }),
      });
      await refreshPhotoList();
    });
    list.appendChild(el);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(admin): photos tab — upload, list, edit alt/position, delete"
```

---

## Task 38 — Admin tabs: Gifts, Timeline

**Files:**
- Modify: `web/admin.js`

Implement `renderGiftsTab` and `renderTimelineTab` using the same pattern as photos (list items, inline edit, add form). Each item shows: name, rangeText, position, taken_by (if any, with force-unreserve button). Each tab has an "Add" form at the top.

- [ ] **Step 1: Implement both tabs** — the pattern is identical to photos, just different schemas.

```js
async function renderGiftsTab() {
  const tab = $('#tab-gifts');
  tab.innerHTML = `
    <form id="giftAdd">
      <div class="row">
        <label>Nom <input name="name" required maxlength="160"></label>
        <label>Fourchette <input name="rangeText" placeholder="30–50 €" required maxlength="40"></label>
      </div>
      <label>URL (optionnel) <input name="url" type="url"></label>
      <label>Position <input name="position" type="number" value="0" min="0"></label>
      <button>Ajouter</button>
    </form>
    <div class="section-title">Liste</div>
    <div id="giftList"></div>
  `;
  $('#giftAdd').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    await fetch('/api/admin/gifts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: f.name.value, rangeText: f.rangeText.value,
        url: f.url.value || undefined, position: Number(f.position.value),
      }),
    });
    f.reset();
    await refreshGiftList();
  });
  await refreshGiftList();
}
async function refreshGiftList() {
  const data = await loadState();
  const list = $('#giftList');
  list.innerHTML = '';
  for (const g of data.gifts) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <b>${g.name}</b> — ${g.rangeText} — pos ${g.position}<br>
      ${g.takenBy ? `<small>Pris par ${g.takenBy}${g.takenNote ? ' — « ' + g.takenNote + ' »' : ''}</small>` : '<small>disponible</small>'}
      <div style="margin-top:8px;">
        <button class="secondary" data-act="edit">Éditer</button>
        ${g.takenBy ? '<button class="secondary" data-act="force">Forcer libre</button>' : ''}
        <button class="danger" data-act="del">Supprimer</button>
      </div>
    `;
    el.querySelector('[data-act=del]').addEventListener('click', async () => {
      if (!confirm('Supprimer ?')) return;
      await fetch(`/api/admin/gifts/${g.id}`, { method: 'DELETE' });
      await refreshGiftList();
    });
    el.querySelector('[data-act=edit]').addEventListener('click', async () => {
      const name = prompt('Nom', g.name) ?? g.name;
      const rangeText = prompt('Fourchette', g.rangeText) ?? g.rangeText;
      const position = Number(prompt('Position', g.position) ?? g.position);
      await fetch(`/api/admin/gifts/${g.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, rangeText, position }),
      });
      await refreshGiftList();
    });
    const force = el.querySelector('[data-act=force]');
    if (force) force.addEventListener('click', async () => {
      await fetch(`/api/admin/gifts/${g.id}/force-unreserve`, { method: 'POST' });
      await refreshGiftList();
    });
    list.appendChild(el);
  }
}

async function renderTimelineTab() {
  const tab = $('#tab-timeline');
  tab.innerHTML = `
    <form id="tlAdd">
      <label>Date (libre) <input name="dateLabel" required maxlength="80"></label>
      <label>Texte <textarea name="text" required maxlength="400"></textarea></label>
      <label>Position <input name="position" type="number" value="0" min="0"></label>
      <label><input type="checkbox" name="isNow"> Marquer "maintenant"</label>
      <button>Ajouter</button>
    </form>
    <div class="section-title">Événements</div>
    <div id="tlList"></div>
  `;
  $('#tlAdd').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    await fetch('/api/admin/timeline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dateLabel: f.dateLabel.value, text: f.text.value,
        position: Number(f.position.value), isNow: f.isNow.checked,
      }),
    });
    f.reset();
    await refreshTimelineList();
  });
  await refreshTimelineList();
}
async function refreshTimelineList() {
  const data = await loadState();
  const list = $('#tlList');
  list.innerHTML = '';
  for (const e of data.timeline) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <b>${e.dateLabel}</b>${e.isNow ? ' · now' : ''} — pos ${e.position}<br>
      <small>${e.text}</small>
      <div style="margin-top:8px;"><button class="danger" data-act="del">Supprimer</button></div>
    `;
    el.querySelector('[data-act=del]').addEventListener('click', async () => {
      if (!confirm('Supprimer ?')) return;
      await fetch(`/api/admin/timeline/${e.id}`, { method: 'DELETE' });
      await refreshTimelineList();
    });
    list.appendChild(el);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(admin): gifts and timeline tabs with create/edit/delete"
```

---

## Task 39 — Admin tabs: Lien privé, Sécurité

**Files:**
- Modify: `web/admin.js`

- [ ] **Step 1: Implement the last two tabs**

```js
async function renderLinkTab() {
  const tab = $('#tab-link');
  const r = await fetch('/api/admin/access-token/link');
  const j = await r.json();
  tab.innerHTML = `
    <div class="section-title">Lien privé actuel</div>
    <div class="item">
      <input id="linkOutput" readonly value="${j.link}">
      <div style="margin-top:8px;">
        <button id="copyLink" class="secondary">Copier</button>
        <button id="rotateLink" class="danger">Régénérer</button>
      </div>
      <p style="margin-top:12px;font-size:13px;color:var(--muted);">
        ⚠ Régénérer invalide tous les liens déjà distribués. Les visiteurs en cours
        seront déconnectés à la prochaine requête.
      </p>
    </div>
  `;
  $('#copyLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#linkOutput').value);
    $('#copyLink').textContent = 'Copié ✓';
    setTimeout(() => $('#copyLink').textContent = 'Copier', 1500);
  });
  $('#rotateLink').addEventListener('click', async () => {
    if (!confirm('Confirmer la régénération ? Les anciens liens ne fonctionneront plus.')) return;
    const r2 = await fetch('/api/admin/access-token/rotate', { method: 'POST' });
    const j2 = await r2.json();
    $('#linkOutput').value = j2.link;
    CURRENT_TOKEN = j2.token;
    setPreviewSrc();
  });
}

async function renderSecurityTab() {
  const tab = $('#tab-security');
  tab.innerHTML = `
    <div class="section-title">Sessions</div>
    <div class="item">
      <p>Toutes les sessions admin ouvertes (y compris la vôtre) seront fermées.</p>
      <button id="killAll" class="danger">Déconnecter toutes les sessions</button>
    </div>
  `;
  $('#killAll').addEventListener('click', async () => {
    if (!confirm('Déconnecter tout le monde ?')) return;
    await fetch('/api/admin/destroy-all-sessions', { method: 'POST' });
    location.reload();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(admin): access-link and security tabs (rotate, destroy-all-sessions)"
```

---

# Phase 12 — Deployment (Caddy + compose)

## Task 40 — Complete docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write the full compose**

```yaml
name: annonce-leonard

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./web:/srv/web:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [annonce-net]
    depends_on: [api]

  api:
    build: ./api
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://annonce:${DB_PASSWORD}@postgres:5432/annonce
    networks: [annonce-net, minio-net]
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 3s
      retries: 3

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: annonce
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: annonce
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks: [annonce-net]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U annonce"]
      interval: 10s
      timeout: 3s
      retries: 5

  backup:
    image: postgres:16-alpine
    restart: unless-stopped
    depends_on: [postgres]
    volumes:
      - ./backups:/backups
    environment:
      PGPASSWORD: ${DB_PASSWORD}
    networks: [annonce-net]
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        set -e
        while true; do
          pg_dump -h postgres -U annonce -F c -f "/backups/annonce-$$(date +%Y%m%d-%H%M).dump" annonce
          find /backups -name 'annonce-*.dump' -mtime +14 -delete
          sleep 86400
        done

volumes:
  caddy_data:
  caddy_config:
  postgres_data:

networks:
  annonce-net:
    driver: bridge
  minio-net:
    external: true
    name: ${MINIO_NETWORK:-minio_default}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(infra): complete docker-compose with caddy/api/postgres/backup and MinIO network"
```

---

## Task 41 — Caddyfile

**Files:**
- Modify: `Caddyfile`

- [ ] **Step 1: Write the final Caddyfile**

```
{
  email {env.CADDY_EMAIL}
  servers {
    trusted_proxies static private_ranges
  }
}

{env.PUBLIC_HOSTNAME} {
  encode zstd gzip

  header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
    -Server
  }

  @sse path /api/stream
  reverse_proxy @sse api:3000 {
    flush_interval -1
    transport http {
      read_timeout 0
      write_timeout 0
    }
  }

  handle /api/* {
    reverse_proxy api:3000
  }

  handle /photos/* {
    header Cache-Control "public, max-age=31536000, immutable"
    reverse_proxy api:3000
  }

  @sw path /sw.js
  header @sw Cache-Control "no-cache"

  handle /admin* {
    header Cache-Control "no-store"
    root * /srv/web
    rewrite * /admin.html
    file_server
  }

  handle {
    root * /srv/web
    @static path *.css *.js *.woff2 *.png *.svg *.ico *.webmanifest
    header @static Cache-Control "public, max-age=31536000, immutable"
    @html path /index.html /
    header @html Cache-Control "no-cache"
    try_files {path} /index.html
    file_server {
      precompressed br gzip
    }
  }
}
```

- [ ] **Step 2: Extend `.env.example`** with the new vars:

```ini
CADDY_EMAIL=admin@example.fr
PUBLIC_HOSTNAME=leonard.example.fr
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(infra): complete Caddyfile with CSP, SSE routing, cache headers"
```

---

## Task 42 — Dockerfile

**Files:**
- Create: `api/Dockerfile`
- Create: `api/.dockerignore`

- [ ] **Step 1: Write `api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ vips-dev libheif-dev
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache vips libheif tini
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/migrations ./src/migrations
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Write `api/.dockerignore`**

```
node_modules
dist
.env
.env.*
test
.vscode
.git
*.log
```

- [ ] **Step 3: Build locally**

```bash
cd api
docker build -t annonce-api:dev .
```

Expected: build succeeds, image tagged. Report size with `docker images annonce-api:dev` (should be ~120-200 MB).

- [ ] **Step 4: Commit**

```bash
cd ..
git add api/Dockerfile api/.dockerignore
git commit -m "build(api): multi-stage Dockerfile with vips+libheif for sharp"
```

---

# Phase 13 — E2E and CI

## Task 43 — Playwright E2E

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/tests/happy-path.spec.ts`

- [ ] **Step 1: Init the workspace**

```bash
cd e2e
npm init -y
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Write `e2e/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
```

- [ ] **Step 3: Write `e2e/tests/happy-path.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test("landing without token shows 404 page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ce faire-part n'existe pas ou plus.")).toBeVisible();
});

test("with valid token, hero scene renders with babyName", async ({ page }) => {
  const token = process.env.E2E_TOKEN!;
  expect(token, "E2E_TOKEN must be set").toBeTruthy();
  await page.goto(`/?k=${token}`);
  await expect(page.locator('[data-t="babyName"]').first()).toHaveText("Léonard");
  await expect(page.url()).not.toContain("k=");
});

test("navigation between scenes works via right arrow", async ({ page }) => {
  const token = process.env.E2E_TOKEN!;
  await page.goto(`/?k=${token}`);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".scene-stats")).toHaveClass(/is-active/);
});

test("reserving a gift updates the UI", async ({ page }) => {
  const token = process.env.E2E_TOKEN!;
  await page.goto(`/?k=${token}`);
  await page.locator(".gift").first().click();
  await page.locator('dialog input[name=name]').fill("Sophie");
  await page.locator("dialog button[value=confirm]").click();
  await expect(page.locator(".gift.taken").first()).toBeVisible();
});
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add e2e/
git commit -m "test(e2e): playwright happy-path covering landing, nav, gift reservation"
```

---

## Task 44 — Lighthouse CI (manual run, local only)

**Files:**
- Create: `e2e/lighthouse.mjs`

- [ ] **Step 1: Write a small manual script**

```bash
cd e2e
npm install -D lighthouse chrome-launcher
```

`e2e/lighthouse.mjs`:
```js
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const url = `${process.env.E2E_BASE_URL}/?k=${process.env.E2E_TOKEN}`;
const chrome = await launch({ chromeFlags: ['--headless=new'] });
const { lhr } = await lighthouse(url, { port: chrome.port, onlyCategories: ['performance','accessibility','best-practices','seo'] });
const s = lhr.categories;
const failures = [];
for (const k of Object.keys(s)) {
  const score = s[k].score * 100;
  console.log(`${k.padEnd(20)} ${score}`);
  if (score < 95) failures.push(`${k}=${score}`);
}
await chrome.kill();
if (failures.length) { console.error('below target:', failures); process.exit(1); }
```

- [ ] **Step 2: Add as a script in `e2e/package.json`**

```json
"scripts": { "lighthouse": "node lighthouse.mjs" }
```

- [ ] **Step 3: Commit**

```bash
cd ..
git add e2e/lighthouse.mjs e2e/package.json
git commit -m "test(e2e): lighthouse script with 95+ threshold on all categories"
```

---

# Phase 14 — Accessibility + a11y audit

## Task 45 — Reduced-motion, focus states, ARIA roles

**Files:**
- Modify: `web/styles.css`
- Modify: `web/index.html`

- [ ] **Step 1: Focus ring** — append to `styles.css`:

```css
button, a, input, textarea, select { outline: none; }
button:focus-visible, a:focus-visible, input:focus-visible,
textarea:focus-visible, select:focus-visible, .seg:focus-visible, .sw:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 4px;
  border-radius: 2px;
}
```

- [ ] **Step 2: Role/aria-label on scenes** — in `index.html`, add to each `.scene`:

```html
<section class="scene scene-hero" role="region" aria-label="Annonce" data-screen-label="01 Annonce">
```

(Repeat per scene with matching label.)

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web,a11y): visible focus ring + region roles + prefers-reduced-motion (already present)"
```

---

## Task 46 — axe-core audit integrated in Playwright

**Files:**
- Modify: `e2e/tests/happy-path.spec.ts`

- [ ] **Step 1: Install axe**

```bash
cd e2e
npm install -D @axe-core/playwright
```

- [ ] **Step 2: Add a test**

```ts
import AxeBuilder from "@axe-core/playwright";

test("no AA axe-core violations on home", async ({ page }) => {
  const token = process.env.E2E_TOKEN!;
  await page.goto(`/?k=${token}`);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 3: Commit**

```bash
cd ..
git commit -am "test(e2e): axe-core AA audit on home"
```

---

# Phase 15 — Finalization

## Task 47 — End-to-end smoke test locally

This task is **entirely manual** — no code changes, just verification.

- [ ] **Step 1: Populate `.env`**

```bash
cp .env.example .env
# Generate secrets
openssl rand -base64 32 | tr -d '/+=' | head -c 32 > /tmp/db_pw
openssl rand -base64 32 | tr -d '/+=' | head -c 32 > /tmp/sess
# Fill DB_PASSWORD, SESSION_SECRET in .env
(cd api && npm run hash-password -- MyTestAdmin2026!)
# Copy the argon2 output into ADMIN_PASSWORD_HASH
# Fill CADDY_EMAIL, PUBLIC_HOSTNAME, PUBLIC_ORIGIN, MINIO_*
```

- [ ] **Step 2: First boot**

```bash
docker compose build
docker compose up -d
docker compose logs -f api | grep "Access token"
# copy the logged access token
```

- [ ] **Step 3: Manual checks**

- Visit `https://<hostname>/?k=<token>` → see the faire-part.
- Visit `https://<hostname>/` without token → 404 landing.
- Visit `https://<hostname>/admin`, log in with the test password.
- Edit a text, see the preview update live.
- Upload a photo (JPEG with visible GPS EXIF, e.g., from iPhone), verify it shows up in the gallery AND verify via `docker compose exec api ...` that the variant has no EXIF GPS.
- Open the site in two browsers with the token. Reserve a gift in one. Verify the other sees the reservation within ~1s.
- On mobile (BrowserStack or real device), verify vertical scroll with snap.
- Install as PWA from Chrome, disconnect network, verify the home still loads.
- From admin, rotate the access token. Verify the old token's link now returns 404.
- From admin, "Destroy all sessions". Verify you get logged out.

- [ ] **Step 4: Document any deviations found** in `docs/superpowers/specs/2026-04-22-annonce-naissance-design.md` under a new "Implementation notes" appendix. Commit the note with message `docs: record smoke-test findings`.

---

## Task 48 — Update README with operator runbook

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an "Operator runbook" section**

```markdown
## Operator runbook

**First deploy**
```bash
cp .env.example .env && $EDITOR .env
(cd api && npm run hash-password -- 'your-admin-password')
# paste the hash into ADMIN_PASSWORD_HASH
docker compose build
docker compose up -d
docker compose logs api | grep "Access token"    # copy the initial access token
```

**Daily**
- `docker compose ps` — everything healthy?
- Backups in `./backups/annonce-YYYYMMDD-HHMM.dump` (14 days retention).

**Update**
```bash
git pull
docker compose build api
docker compose up -d api
```

**Rotate the access token**
- From `/admin` → onglet "Lien privé" → "Régénérer".

**Kill all sessions**
- From `/admin` → onglet "Sécurité" → "Déconnecter toutes les sessions".

**Restore from a backup**
```bash
docker compose stop api
docker compose exec -T postgres pg_restore -U annonce -d annonce -c < ./backups/annonce-YYYYMMDD-HHMM.dump
docker compose start api
```
```

- [ ] **Step 2: Commit**

```bash
git commit -am "docs: operator runbook in README"
```

---

# Self-review checklist (run before handing off)

Before claiming the plan is complete, the implementer should confirm:

**Spec coverage — every requirement from §11 of the spec has a task:**
- [ ] Visitor with token sees faire-part → Tasks 15, 27
- [ ] Visitor without token sees landing → Tasks 14, 27
- [ ] Reserve a gift → Tasks 18, 30
- [ ] Two visitors see each other's reservations < 1s → Tasks 18, 20, 31
- [ ] Admin login → Tasks 11, 13, 35
- [ ] Admin text edit live preview → Tasks 16, 36
- [ ] Admin upload photo, 3×3 variants served → Tasks 24, 25, 26, 37
- [ ] Regenerate access token, old fails → Tasks 22, 39
- [ ] Horizontal desktop, vertical mobile → Task 32
- [ ] OG tags + share preview → Task 27 + Task 33
- [ ] Consultable offline after first visit (PWA) → Tasks 33, 34
- [ ] Installable as PWA → Task 33
- [ ] Lighthouse ≥ 95 on all categories → Task 44
- [ ] Zero axe-core AA violations → Task 46
- [ ] CSP applied by Caddy → Task 41
- [ ] Daily pg_dump with 14d retention → Task 40

**Type consistency — verify these match across tasks:**
- `tweaks.key` is `text` ; `tweaks.value` is `text` ; PATCH body accepts any `Record<string, string>`. ✓
- `photos.section` ∈ `{triptych, gallery}` (check DB, zod, front). ✓
- `gifts.rangeText` (camelCase) is consistent in DB, routes, admin UI. ✓
- `GiftEvent.type` values match SSE `event:` names (`gift.reserved` etc.). ✓
- MinIO key convention `photos/{uuid}/{size}.{ext}` matches `objectKey()` and Caddy cache rule. ✓
- Access token: header name `X-Access-Token`, query `k`, cookie `_k`. ✓

**Placeholders — scan for TBD/TODO/"similar to":**
- Task 21 step 3 says "pattern mirrors Task 19" but doesn't duplicate code. Acceptable because it only references existing well-defined shapes.
- Task 22 step 3 says "verify..." without code. Acceptable — the test shapes are identical to tasks 15/16.
- Task 37 "prompt()" for editing photo alt/position is simple but acceptable for V1 admin UX.
No unacceptable placeholders.

---

# Execution notes

**Order of phases is a firm dependency chain.** Do not attempt Phase 11 (admin front) before Phase 7 & 8 (admin-side API exists). Phase 13/14 can run in parallel with Phase 12. Phase 15 only after all code is in main.

**Estimated effort (solo):**
- Phases 0-2 : ~2h (scaffolding + db)
- Phases 3-8 : ~10h (full API with tests)
- Phases 9-11 : ~8h (front + admin)
- Phase 12 : ~3h (docker + Caddy + first boot)
- Phases 13-15 : ~4h (e2e, a11y, runbook)
- Total: ~27h. Realistic calendar: 4-5 focused half-days.
