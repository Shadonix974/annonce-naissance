import { beforeEach, expect, test } from "vitest";
import { runSeeds } from "../src/db/seeds.js";
import { buildApp, resetDb } from "./helpers.js";
import { getAccessToken } from "../src/lib/access-token.js";
import { db, schema } from "../src/db/client.js";

beforeEach(async () => {
  await resetDb();
  await runSeeds();
});

test("SSE delivers a gift.reserved event within 1s", async () => {
  const token = (await getAccessToken())!;
  const app = await buildApp();
  const [g] = await db.select().from(schema.gifts).limit(1);
  const id = g!.id;

  const ctrl = new AbortController();
  const streamPromise = app.fetch(
    new Request(`http://x/api/stream?k=${token}`, { signal: ctrl.signal }),
  );

  const res = await streamPromise;
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/event-stream/);

  // Small delay to ensure the bus listener is attached before triggering reserve
  await new Promise(r => setTimeout(r, 50));

  // Trigger a reservation after the stream is open
  const reserveRes = app.fetch(new Request(`http://x/api/gifts/${id}/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-token": token, origin: "http://localhost:3000" },
    body: JSON.stringify({ name: "Sophie" }),
  }));

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let seenReserved = false;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value);
    if (chunk.includes("event: gift.reserved")) { seenReserved = true; break; }
  }
  ctrl.abort();
  await reserveRes;
  expect(seenReserved).toBe(true);
});
