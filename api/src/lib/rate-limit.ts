import { RateLimitError } from "./errors.js";

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

/** @internal Test-only. Do not call from production code. */
export function resetBuckets(): void {
  buckets.clear();
}

export function rateLimit(key: string, capacity: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) {
    buckets.set(key, { tokens: capacity - 1, updatedAt: now });
    return;
  }
  const elapsed = now - b.updatedAt;
  const refill = (elapsed / windowMs) * capacity;
  const tokens = Math.min(capacity, b.tokens + refill);
  if (tokens < 1) {
    b.tokens = tokens;
    b.updatedAt = now;
    throw new RateLimitError();
  }
  b.tokens = tokens - 1;
  b.updatedAt = now;
}
