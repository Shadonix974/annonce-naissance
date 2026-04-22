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
