import { beforeEach, expect, test } from "vitest";
import { buildApp, httpJson, resetDb } from "./helpers.js";

beforeEach(resetDb);

test("GET /healthz returns ok", async () => {
  const app = await buildApp();
  const { status, body } = await httpJson(app, new Request("http://x/healthz"));
  expect(status).toBe(200);
  expect(body).toEqual({ ok: true });
});
