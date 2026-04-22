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
