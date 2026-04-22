import { randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";

const { settings } = schema;

export async function getAccessToken(): Promise<string | null> {
  const [s] = await db.select().from(settings).limit(1);
  return s?.accessToken ?? null;
}

export async function getPrintAccessToken(): Promise<string | null> {
  const [s] = await db.select().from(settings).limit(1);
  return s?.printAccessToken ? s.printAccessToken : null;
}

export async function rotatePrintAccessToken(): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await db.update(settings).set({
    printAccessToken: token,
    updatedAt: sql`now()`,
  }).where(sql`${settings.id} = 1`);
  return token;
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
