import argon2 from "argon2";
import sharp from "sharp";
import { beforeEach, expect, test } from "vitest";
import { buildApp, resetDb } from "./helpers.js";
import { runSeeds } from "../src/db/seeds.js";
import { getPrintAccessToken } from "../src/lib/access-token.js";
import { BUCKET, minio } from "../src/lib/minio.js";
import { resetBuckets } from "../src/lib/rate-limit.js";

const ADMIN_PW = "print-pw";

async function adminCookie(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ password: ADMIN_PW }),
  }));
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function makePng(w = 100, h = 75): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .png().toBuffer();
}

async function uploadCover(app: Awaited<ReturnType<typeof buildApp>>, cookie: string): Promise<{ id: string }> {
  const fd = new FormData();
  fd.append("file", new Blob([await makePng()], { type: "image/png" }), "c.png");
  fd.append("section", "print-cover");
  fd.append("alt", "cover");
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie },
    body: fd,
  }));
  return await res.json() as { id: string };
}

beforeEach(async () => {
  await resetDb();
  await runSeeds();
  resetBuckets();
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash(ADMIN_PW, { type: argon2.argon2id });
  const keys: string[] = [];
  for await (const o of minio.listObjects(BUCKET, "photos/", true)) {
    if (o.name) keys.push(o.name);
  }
  if (keys.length) await minio.removeObjects(BUCKET, keys);
});

test("GET /api/print/state rejects missing/invalid token with 404", async () => {
  const app = await buildApp();
  const noToken = await app.fetch(new Request("http://localhost:3000/api/print/state"));
  expect(noToken.status).toBe(404);
  const badToken = await app.fetch(new Request("http://localhost:3000/api/print/state?k=bogus"));
  expect(badToken.status).toBe(404);
}, 30_000);

test("GET /api/print/state returns tweaks subset + cover when a print-cover exists", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const cover = await uploadCover(app, cookie);

  const token = (await getPrintAccessToken())!;
  const res = await app.fetch(new Request(`http://localhost:3000/api/print/state?k=${token}`));
  expect(res.status).toBe(200);
  const body = await res.json() as {
    tweaks: Record<string, string>;
    cover: { id: string; width: number; height: number; version: number } | null;
  };
  expect(body.tweaks.babyName).toBe("Léonard");
  expect(body.cover).not.toBeNull();
  expect(body.cover!.id).toBe(cover.id);
  expect(body.cover!.version).toBe(1);
});

test("GET /api/print/state returns cover=null when no print-cover is set", async () => {
  const app = await buildApp();
  const token = (await getPrintAccessToken())!;
  const res = await app.fetch(new Request(`http://localhost:3000/api/print/state?k=${token}`));
  expect(res.status).toBe(200);
  const body = await res.json() as { cover: unknown };
  expect(body.cover).toBeNull();
});

test("GET /api/print/cover.jpg streams the print-cover JPEG", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  await uploadCover(app, cookie);

  const token = (await getPrintAccessToken())!;
  const res = await app.fetch(new Request(`http://localhost:3000/api/print/cover.jpg?k=${token}`));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/jpeg");
  const body = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(body).metadata();
  expect(meta.format).toBe("jpeg");
}, 60_000);

test("GET /api/print/cover.jpg returns 404 when no print-cover is set", async () => {
  const app = await buildApp();
  const token = (await getPrintAccessToken())!;
  const res = await app.fetch(new Request(`http://localhost:3000/api/print/cover.jpg?k=${token}`));
  expect(res.status).toBe(404);
});

test("print endpoints reject the main access token (token separation)", async () => {
  const app = await buildApp();
  const { getAccessToken } = await import("../src/lib/access-token.js");
  const mainToken = (await getAccessToken())!;
  const res = await app.fetch(new Request(`http://localhost:3000/api/print/state?k=${mainToken}`));
  expect(res.status).toBe(404);
});

test("GET /api/admin/print/link requires admin", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/print/link"));
  expect(res.status).toBe(401);
}, 30_000);

test("GET /api/admin/print/link returns the current print token + link", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/print/link", { headers: { cookie } }));
  expect(res.status).toBe(200);
  const body = await res.json() as { token: string; link: string };
  expect(body.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  expect(body.link).toContain("/print?k=");
}, 30_000);

test("POST /api/admin/print/rotate rotates the print token and returns the new link", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const before = await getPrintAccessToken();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/print/rotate", {
    method: "POST",
    headers: { cookie, origin: "http://localhost:3000" },
  }));
  expect(res.status).toBe(200);
  const body = await res.json() as { token: string; link: string };
  expect(body.token).not.toBe(before);
  // The old token must no longer unlock the print endpoints.
  const stale = await app.fetch(new Request(`http://localhost:3000/api/print/state?k=${before}`));
  expect(stale.status).toBe(404);
}, 30_000);

test("rotating the print token does NOT invalidate the main access token", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const { getAccessToken } = await import("../src/lib/access-token.js");
  const mainBefore = await getAccessToken();

  await app.fetch(new Request("http://localhost:3000/api/admin/print/rotate", {
    method: "POST",
    headers: { cookie, origin: "http://localhost:3000" },
  }));

  const mainAfter = await getAccessToken();
  expect(mainAfter).toBe(mainBefore);
}, 30_000);

test("GET /api/admin/print/image requires admin", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/print/image"));
  expect(res.status).toBe(401);
}, 30_000);

// Note: we do NOT spin up Playwright in unit tests. The 200-path for /image is
// exercised manually during the verification task at the end of this plan.
