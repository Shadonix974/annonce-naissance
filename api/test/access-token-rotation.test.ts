import argon2 from "argon2";
import { beforeEach, expect, test } from "vitest";
import { runSeeds } from "../src/db/seeds.js";
import { buildApp, resetDb } from "./helpers.js";
import { getAccessToken } from "../src/lib/access-token.js";

const ADMIN_PW = "rotate-pw";

async function adminCookie(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ password: ADMIN_PW }),
  }));
  return res.headers.get("set-cookie")!.split(";")[0];
}

beforeEach(async () => {
  await resetDb();
  await runSeeds();
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash(ADMIN_PW, { type: argon2.argon2id });
});

test("rotate invalidates old token and issues a working new token", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);

  const oldToken = (await getAccessToken())!;

  // Old token works before rotation
  const before = await app.fetch(new Request("http://x/api/state", {
    headers: { "x-access-token": oldToken },
  }));
  expect(before.status).toBe(200);

  // Rotate
  const rot = await app.fetch(new Request("http://localhost:3000/api/admin/access-token/rotate", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie },
  }));
  expect(rot.status).toBe(200);
  const { token: newToken, link } = await rot.json() as { token: string; link: string };
  expect(newToken).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(link).toContain(newToken);
  expect(newToken).not.toBe(oldToken);

  // Old token now fails
  const afterOld = await app.fetch(new Request("http://x/api/state", {
    headers: { "x-access-token": oldToken },
  }));
  expect(afterOld.status).toBe(404);

  // New token works
  const afterNew = await app.fetch(new Request("http://x/api/state", {
    headers: { "x-access-token": newToken },
  }));
  expect(afterNew.status).toBe(200);
});

test("GET /link returns the current token and full URL", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const token = (await getAccessToken())!;

  const res = await app.fetch(new Request("http://localhost:3000/api/admin/access-token/link", {
    headers: { cookie },
  }));
  expect(res.status).toBe(200);
  const body = await res.json() as { token: string; link: string };
  expect(body.token).toBe(token);
  expect(body.link).toContain(`?k=${token}`);
});

test("rotate requires admin session", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/access-token/rotate", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  }));
  expect(res.status).toBe(401);
});
