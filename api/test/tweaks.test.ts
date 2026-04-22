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
