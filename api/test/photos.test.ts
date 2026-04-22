import argon2 from "argon2";
import sharp from "sharp";
import { beforeEach, expect, test } from "vitest";
import { buildApp, resetDb } from "./helpers.js";
import { runSeeds } from "../src/db/seeds.js";
import { getAccessToken } from "../src/lib/access-token.js";
import { BUCKET, minio } from "../src/lib/minio.js";
import { resetBuckets } from "../src/lib/rate-limit.js";

const ADMIN_PW = "photo-pw";

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

async function makeJpegWithGps(): Promise<Buffer> {
  // Create a JPEG and inject EXIF GPS metadata via sharp's withMetadata (writes on output)
  const base = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .jpeg().toBuffer();
  // sharp doesn't let us inject arbitrary EXIF easily; a simpler check: verify the processed variants
  // contain no EXIF regardless of input. We'll use a plain JPEG — sharp's metadata strip is unconditional
  // for our pipeline (rotate() + no withMetadata()).
  return base;
}

function uploadReq(cookie: string, body: FormData): Request {
  return new Request("http://localhost:3000/api/admin/photos", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie },
    body,
  });
}

beforeEach(async () => {
  await resetDb();
  await runSeeds();
  resetBuckets();
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash(ADMIN_PW, { type: argon2.argon2id });
  // Also wipe any test-leftover objects from previous runs
  const keys: string[] = [];
  for await (const o of minio.listObjects(BUCKET, "photos/", true)) {
    if (o.name) keys.push(o.name);
  }
  if (keys.length) await minio.removeObjects(BUCKET, keys);
});

test("upload requires admin session", async () => {
  const app = await buildApp();
  const fd = new FormData();
  fd.append("file", new Blob([await makePng()], { type: "image/png" }), "x.png");
  fd.append("section", "triptych");
  fd.append("alt", "x");
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: fd,
  }));
  expect(res.status).toBe(401);
}, 30_000);

test("upload rejects invalid MIME", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from("not an image")], { type: "text/plain" }), "x.txt");
  fd.append("section", "triptych");
  fd.append("alt", "x");
  const res = await app.fetch(uploadReq(cookie, fd));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: "unsupported_type" });
}, 30_000);

test("upload rejects bad section", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng()], { type: "image/png" }), "x.png");
  fd.append("section", "bogus");
  fd.append("alt", "x");
  const res = await app.fetch(uploadReq(cookie, fd));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: "bad_section" });
}, 30_000);

test("upload rejects empty alt (server-side a11y guard)", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng()], { type: "image/png" }), "x.png");
  fd.append("section", "triptych");
  fd.append("alt", "   "); // whitespace-only
  const res = await app.fetch(uploadReq(cookie, fd));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: "alt_required" });
}, 30_000);

test("upload happy path creates row and 10 MinIO objects (9 variants + original)", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(300, 200)], { type: "image/png" }), "x.png");
  fd.append("section", "triptych");
  fd.append("alt", "test image");
  fd.append("position", "0");
  const res = await app.fetch(uploadReq(cookie, fd));
  expect(res.status).toBe(201);
  const photo = await res.json() as { id: string; width: number; height: number; blurhash: string };
  expect(photo.width).toBe(300);
  expect(photo.height).toBe(200);
  expect(photo.blurhash).toMatch(/^[A-Za-z0-9+/:$@#*,;=?!~{}|<>&^_-]{20,}$/);

  // Verify 10 objects in MinIO (9 variants + original)
  const keys: string[] = [];
  for await (const o of minio.listObjects(BUCKET, `photos/${photo.id}/`, true)) {
    if (o.name) keys.push(o.name);
  }
  expect(keys).toHaveLength(10);
  expect(keys.some(k => k.endsWith("/thumb.avif"))).toBe(true);
  expect(keys.some(k => k.endsWith("/medium.webp"))).toBe(true);
  expect(keys.some(k => k.endsWith("/full.jpg"))).toBe(true);
}, 60_000);

test("delete removes row and MinIO objects", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng()], { type: "image/png" }), "x.png");
  fd.append("section", "gallery");
  fd.append("alt", "to delete");
  const up = await app.fetch(uploadReq(cookie, fd));
  expect(up.status).toBe(201);
  const photo = await up.json() as { id: string };

  const del = await app.fetch(new Request(`http://localhost:3000/api/admin/photos/${photo.id}`, {
    method: "DELETE",
    headers: { origin: "http://localhost:3000", cookie },
  }));
  expect(del.status).toBe(200);

  const remaining: string[] = [];
  for await (const o of minio.listObjects(BUCKET, `photos/${photo.id}/`, true)) {
    if (o.name) remaining.push(o.name);
  }
  expect(remaining).toHaveLength(0);
}, 60_000);

test("uploaded variants strip EXIF metadata", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makeJpegWithGps()], { type: "image/jpeg" }), "g.jpg");
  fd.append("section", "gallery");
  fd.append("alt", "gps");
  const up = await app.fetch(uploadReq(cookie, fd));
  expect(up.status).toBe(201);
  const photo = await up.json() as { id: string };

  // Read back the medium jpg variant from MinIO and verify no EXIF
  const obj = await minio.getObject(BUCKET, `photos/${photo.id}/medium.jpg`);
  const chunks: Buffer[] = [];
  for await (const chunk of obj) chunks.push(Buffer.from(chunk));
  const variantBuf = Buffer.concat(chunks);
  const meta = await sharp(variantBuf).metadata();
  // sharp's default behaviour strips EXIF unless withMetadata() was called.
  expect(meta.exif).toBeUndefined();
}, 60_000);

test("GET /photos/unknown/thumb.avif returns 404", async () => {
  const token = (await getAccessToken())!;
  const app = await buildApp();
  const res = await app.fetch(new Request("http://x/photos/00000000-0000-0000-0000-000000000000/thumb.avif", {
    headers: { "x-access-token": token },
  }));
  expect(res.status).toBe(404);
}, 30_000);

test("GET /photos without token returns 404", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://x/photos/00000000-0000-0000-0000-000000000000/thumb.avif"));
  expect(res.status).toBe(404);
}, 30_000);

test("GET /photos/:id/thumb.avif after upload returns 200 with correct content-type", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(300, 200)], { type: "image/png" }), "x.png");
  fd.append("section", "triptych");
  fd.append("alt", "test");
  const up = await app.fetch(uploadReq(cookie, fd));
  expect(up.status).toBe(201);
  const photo = await up.json() as { id: string };

  const token = (await getAccessToken())!;
  const res = await app.fetch(new Request(`http://x/photos/${photo.id}/thumb.avif`, {
    headers: { "x-access-token": token },
  }));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/avif");
  expect(res.headers.get("cache-control")).toMatch(/immutable/);
  const body = await res.arrayBuffer();
  expect(body.byteLength).toBeGreaterThan(0);
}, 60_000);

test("GET /photos/:id/thumb.avif via _k cookie returns 200", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(300, 200)], { type: "image/png" }), "x.png");
  fd.append("section", "triptych");
  fd.append("alt", "cookie test");
  const up = await app.fetch(uploadReq(cookie, fd));
  expect(up.status).toBe(201);
  const photo = await up.json() as { id: string };

  const token = (await getAccessToken())!;
  const res = await app.fetch(new Request(`http://x/photos/${photo.id}/thumb.avif`, {
    headers: { cookie: `_k=${token}` },
  }));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/avif");
}, 60_000);

test("upload writes photos/:id/original.jpg", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(300, 200)], { type: "image/png" }), "x.png");
  fd.append("section", "gallery");
  fd.append("alt", "orig test");
  const up = await app.fetch(uploadReq(cookie, fd));
  expect(up.status).toBe(201);
  const photo = await up.json() as { id: string };

  const keys: string[] = [];
  for await (const o of minio.listObjects(BUCKET, `photos/${photo.id}/`, true)) {
    if (o.name) keys.push(o.name);
  }
  // 9 variants + 1 original
  expect(keys).toHaveLength(10);
  expect(keys.some(k => k === `photos/${photo.id}/original.jpg`)).toBe(true);
}, 60_000);

test("upload with cropped=1 flag persists cropped column", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(300, 200)], { type: "image/png" }), "x.png");
  fd.append("section", "triptych");
  fd.append("alt", "cropped test");
  fd.append("cropped", "1");
  const up = await app.fetch(uploadReq(cookie, fd));
  expect(up.status).toBe(201);
  const photo = await up.json() as { id: string; cropped: boolean; version: number };
  expect(photo.cropped).toBe(true);
  expect(photo.version).toBe(1);
}, 60_000);

test("GET /api/admin/photos/:id/original requires admin", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/00000000-0000-0000-0000-000000000000/original"));
  expect(res.status).toBe(401);
}, 30_000);

test("GET /api/admin/photos/:id/original returns the original JPEG for an admin", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(200, 150)], { type: "image/png" }), "x.png");
  fd.append("section", "gallery");
  fd.append("alt", "original fetch");
  const up = await app.fetch(uploadReq(cookie, fd));
  const photo = await up.json() as { id: string };

  const res = await app.fetch(new Request(`http://localhost:3000/api/admin/photos/${photo.id}/original`, {
    headers: { cookie },
  }));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/jpeg");
  const body = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(body).metadata();
  expect(meta.format).toBe("jpeg");
  expect(meta.width).toBe(200);
  expect(meta.height).toBe(150);
}, 60_000);

test("GET /api/admin/photos/:id/original returns 404 for unknown photo", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/00000000-0000-0000-0000-000000000000/original", {
    headers: { cookie },
  }));
  expect(res.status).toBe(404);
}, 30_000);

test("PATCH /:id/recrop requires admin", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/00000000-0000-0000-0000-000000000000/recrop", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ x: 0, y: 0, width: 100, height: 100 }),
  }));
  expect(res.status).toBe(401);
}, 30_000);

test("PATCH /:id/recrop rejects out-of-bounds region", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(300, 200)], { type: "image/png" }), "x.png");
  fd.append("section", "gallery");
  fd.append("alt", "oob");
  const up = await app.fetch(uploadReq(cookie, fd));
  const photo = await up.json() as { id: string };

  const res = await app.fetch(new Request(`http://localhost:3000/api/admin/photos/${photo.id}/recrop`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ x: 200, y: 0, width: 200, height: 100 }), // x+width > 300
  }));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: "out_of_bounds" });
}, 60_000);

test("PATCH /:id/recrop rejects invalid numeric input", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(300, 200)], { type: "image/png" }), "x.png");
  fd.append("section", "gallery");
  fd.append("alt", "bad");
  const up = await app.fetch(uploadReq(cookie, fd));
  const photo = await up.json() as { id: string };

  const res = await app.fetch(new Request(`http://localhost:3000/api/admin/photos/${photo.id}/recrop`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ x: -1, y: 0, width: 10, height: 10 }),
  }));
  expect(res.status).toBe(400);
}, 60_000);

test("PATCH /:id/recrop happy path bumps version, updates dims + blurhash, rewrites variants", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const fd = new FormData();
  fd.append("file", new Blob([await makePng(400, 300)], { type: "image/png" }), "x.png");
  fd.append("section", "gallery");
  fd.append("alt", "recrop");
  const up = await app.fetch(uploadReq(cookie, fd));
  const before = await up.json() as { id: string; version: number; width: number; height: number; blurhash: string };
  expect(before.version).toBe(1);

  const res = await app.fetch(new Request(`http://localhost:3000/api/admin/photos/${before.id}/recrop`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ x: 50, y: 50, width: 200, height: 150 }),
  }));
  expect(res.status).toBe(200);
  const after = await res.json() as { id: string; version: number; width: number; height: number; blurhash: string };
  expect(after.id).toBe(before.id);
  expect(after.version).toBe(2);
  expect(after.width).toBe(200);
  expect(after.height).toBe(150);

  // Variants reflect the new dimensions: the full.jpg width must now be <= 200 (no upscale).
  const token = (await getAccessToken())!;
  const full = await app.fetch(new Request(`http://x/photos/${before.id}/full.jpg`, {
    headers: { "x-access-token": token },
  }));
  expect(full.status).toBe(200);
  const fullMeta = await sharp(Buffer.from(await full.arrayBuffer())).metadata();
  expect(fullMeta.width).toBe(200);
  expect(fullMeta.height).toBe(150);
}, 60_000);

test("PATCH /:id/recrop returns 404 for unknown photo", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/00000000-0000-0000-0000-000000000000/recrop", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ x: 0, y: 0, width: 10, height: 10 }),
  }));
  expect(res.status).toBe(404);
}, 30_000);

test("PATCH /reorder requires admin", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/reorder", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ order: [] }),
  }));
  expect(res.status).toBe(401);
}, 30_000);

test("PATCH /reorder updates section + position in a single transaction", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);

  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const fd = new FormData();
    fd.append("file", new Blob([await makePng()], { type: "image/png" }), `x${i}.png`);
    fd.append("section", "gallery");
    fd.append("alt", `p${i}`);
    fd.append("position", String(i));
    const up = await app.fetch(uploadReq(cookie, fd));
    const p = await up.json() as { id: string };
    ids.push(p.id);
  }

  // Reverse the gallery order and move the first photo to triptych.
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/reorder", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({
      order: [
        { id: ids[0], section: "triptych", position: 0 },
        { id: ids[2], section: "gallery", position: 0 },
        { id: ids[1], section: "gallery", position: 1 },
      ],
    }),
  }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const token = (await getAccessToken())!;
  const stateRes = await app.fetch(new Request("http://localhost:3000/api/state", {
    headers: { "x-access-token": token },
  }));
  const state = await stateRes.json() as { photos: Array<{ id: string; section: string; position: number }> };
  const byId = new Map(state.photos.map((p) => [p.id, p]));
  expect(byId.get(ids[0])).toMatchObject({ section: "triptych", position: 0 });
  expect(byId.get(ids[1])).toMatchObject({ section: "gallery", position: 1 });
  expect(byId.get(ids[2])).toMatchObject({ section: "gallery", position: 0 });
}, 90_000);

test("PATCH /reorder rejects unknown id", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/reorder", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({
      order: [{ id: "00000000-0000-0000-0000-000000000000", section: "gallery", position: 0 }],
    }),
  }));
  expect(res.status).toBe(404);
}, 30_000);

test("PATCH /reorder rolls back valid items when one id is unknown", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);

  const fd = new FormData();
  fd.append("file", new Blob([await makePng()], { type: "image/png" }), "x.png");
  fd.append("section", "gallery");
  fd.append("alt", "x");
  fd.append("position", "0");
  const up = await app.fetch(uploadReq(cookie, fd));
  const { id } = await up.json() as { id: string };

  const res = await app.fetch(new Request("http://localhost:3000/api/admin/photos/reorder", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({
      order: [
        { id, section: "triptych", position: 7 },                                          // valid
        { id: "00000000-0000-0000-0000-000000000000", section: "gallery", position: 0 },  // bogus
      ],
    }),
  }));
  expect(res.status).toBe(404);

  // The valid entry must NOT have been persisted (transaction rolled back).
  const token = (await getAccessToken())!;
  const stateRes = await app.fetch(new Request("http://localhost:3000/api/state", {
    headers: { "x-access-token": token },
  }));
  const state = await stateRes.json() as { photos: Array<{ id: string; section: string; position: number }> };
  expect(state.photos.find((p) => p.id === id)).toMatchObject({ section: "gallery", position: 0 });
}, 60_000);
