import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { UnauthorizedError } from "./errors.js";

const { adminSessions } = schema;

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const COOKIE_NAME = "admin_session";

export async function verifyAdminPassword(plain: string): Promise<boolean> {
  try {
    return await argon2.verify(env.ADMIN_PASSWORD_HASH, plain);
  } catch {
    return false;
  }
}

export async function createSession(c: Context, userAgent: string | undefined): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(adminSessions).values({
    token,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: userAgent?.slice(0, 255) ?? null,
  });
  await setSignedCookie(c, COOKIE_NAME, token, env.SESSION_SECRET, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(c: Context): Promise<void> {
  const token = await getSignedCookie(c, env.SESSION_SECRET, COOKIE_NAME);
  if (token) await db.delete(adminSessions).where(eq(adminSessions.token, token));
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export async function loadSession(c: Context): Promise<{ token: string } | null> {
  const token = await getSignedCookie(c, env.SESSION_SECRET, COOKIE_NAME);
  if (!token) return null;
  const [s] = await db.select().from(adminSessions).where(eq(adminSessions.token, token)).limit(1);
  if (!s || s.expiresAt < new Date()) {
    if (s) await db.delete(adminSessions).where(eq(adminSessions.token, token));
    deleteCookie(c, COOKIE_NAME, { path: "/" });
    return null;
  }
  await db.update(adminSessions).set({ lastSeen: new Date() }).where(eq(adminSessions.token, token));
  return { token };
}

export async function destroyAllSessions(): Promise<void> {
  await db.delete(adminSessions);
}

export function throwIfNoSession(s: { token: string } | null): asserts s is { token: string } {
  if (!s) throw new UnauthorizedError();
}
