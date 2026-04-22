import { timingSafeEqual } from "node:crypto";
import { db, schema } from "../db/client.js";

const { settings } = schema;

export async function getAccessToken(): Promise<string | null> {
  const [s] = await db.select().from(settings).limit(1);
  return s?.accessToken ?? null;
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
