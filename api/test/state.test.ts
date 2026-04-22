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
