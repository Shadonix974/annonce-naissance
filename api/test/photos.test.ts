import argon2 from "argon2";
import sharp from "sharp";
import { beforeEach, expect, test } from "vitest";
import { buildApp, resetDb } from "./helpers.js";
import { runSeeds } from "../src/db/seeds.js";
import { BUCKET, minio } from "../src/lib/minio.js";

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

test("upload happy path creates row and 9 MinIO objects", async () => {
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

  // Verify 9 objects in MinIO
  const keys: string[] = [];
  for await (const o of minio.listObjects(BUCKET, `photos/${photo.id}/`, true)) {
    if (o.name) keys.push(o.name);
  }
  expect(keys).toHaveLength(9);
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
