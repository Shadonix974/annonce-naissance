import argon2 from "argon2";
import { beforeEach, expect, test } from "vitest";
import { runSeeds } from "../src/db/seeds.js";
import { buildApp, resetDb } from "./helpers.js";
import { getAccessToken } from "../src/lib/access-token.js";

const ADMIN_PW = "test-tl-pw";

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

test("PATCH timeline requires admin session", async () => {
  const app = await buildApp();
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/timeline/bogus-id", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ text: "X" }),
  }));
  expect(res.status).toBe(401);
});

test("admin creates, updates, deletes a timeline event", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);

  // Create
  const created = await app.fetch(new Request("http://localhost:3000/api/admin/timeline", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ dateLabel: "Mai 2026", text: "Premier sourire", position: 5 }),
  }));
  expect(created.status).toBe(201);
  const event = await created.json();
  expect(event).toMatchObject({ dateLabel: "Mai 2026", text: "Premier sourire" });

  // Update
  const patch = await app.fetch(new Request(`http://localhost:3000/api/admin/timeline/${event.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ text: "Premier éclat de rire" }),
  }));
  expect(patch.status).toBe(200);
  const updated = await patch.json();
  expect(updated.text).toBe("Premier éclat de rire");

  // Verify it appears in /api/state
  const token = (await getAccessToken())!;
  const state = await app.fetch(new Request("http://x/api/state", { headers: { "x-access-token": token } }));
  const body = await state.json() as { timeline: { id: string; text: string }[] };
  expect(body.timeline.find(t => t.id === event.id)?.text).toBe("Premier éclat de rire");

  // Delete
  const del = await app.fetch(new Request(`http://localhost:3000/api/admin/timeline/${event.id}`, {
    method: "DELETE",
    headers: { origin: "http://localhost:3000", cookie },
  }));
  expect(del.status).toBe(200);
});

test("PATCH unknown timeline id returns 404", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/timeline/00000000-0000-0000-0000-000000000000", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ text: "X" }),
  }));
  expect(res.status).toBe(404);
});

test("cross-origin POST is rejected", async () => {
  const app = await buildApp();
  const cookie = await adminCookie(app);
  const res = await app.fetch(new Request("http://localhost:3000/api/admin/timeline", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example", cookie },
    body: JSON.stringify({ dateLabel: "X", text: "Y" }),
  }));
  expect(res.status).toBe(403);
});
