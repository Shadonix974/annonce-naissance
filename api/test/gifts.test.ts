import { beforeEach, expect, test } from "vitest";
import argon2 from "argon2";
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
