import type { Context } from "hono";
import { env } from "../env.js";
import { ForbiddenError } from "./errors.js";

function refererOriginMatches(ref: string, expected: string): boolean {
  try {
    return new URL(ref).origin === expected;
  } catch {
    return false;
  }
}

export function assertSameOrigin(c: Context): void {
  const origin = c.req.header("origin");
  // Safari sometimes omits Origin on same-origin requests; fall back to a
  // URL-parsed Referer check. A naive startsWith would accept
  // https://legit.example.attacker.com as "starting with" https://legit.example,
  // so we parse and compare the .origin property strictly.
  const ref = c.req.header("referer");
  if (origin && origin === env.PUBLIC_ORIGIN) return;
  if (!origin && ref && refererOriginMatches(ref, env.PUBLIC_ORIGIN)) return;
  throw new ForbiddenError("bad_origin");
}
