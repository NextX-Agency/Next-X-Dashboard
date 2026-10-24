/**
 * A small in-memory fixed-window rate limiter for the few unauthenticated write endpoints
 * (quote and restock requests) and the public cart-quote API.
 *
 * Scope and honesty:
 *   - State lives in this Node process. NextX runs as one container on one VPS, so that is one
 *     counter per key; a restart resets it and a second replica would double the allowance.
 *   - It stops a bored script or a double-submitting browser, not a determined distributed
 *     attacker. The real perimeter is the reverse proxy (Pangolin/Traefik): put a per-IP rate
 *     limit there as well. See docs/05-operations/go-live-checklist.md.
 *   - Keys come from forwarded headers the proxy sets. A client that can reach the app directly
 *     could forge them, which is why every limited endpoint also has a global ceiling.
 *
 * Pure and dependency-free so it is unit-testable; the Next.js wrappers live in
 * `server/public-rate-limit.ts`.
 */

export type RateLimit = { limit: number; windowMs: number };

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };

/** Hard ceiling on tracked keys so an attacker rotating forged addresses cannot grow memory. */
const MAX_KEYS = 5_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  check(
    key: string,
    { limit, windowMs }: RateLimit,
    now: number = Date.now(),
  ): RateLimitResult {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.prune(now);
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1 };
    }
    if (existing.count >= limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }
    existing.count += 1;
    return { ok: true, remaining: limit - existing.count };
  }

  /** Number of tracked keys (for tests and diagnostics). */
  get size(): number {
    return this.buckets.size;
  }

  private prune(now: number): void {
    if (this.buckets.size < MAX_KEYS) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    // Still full of live keys: drop the oldest insertions rather than refuse to track new ones.
    if (this.buckets.size >= MAX_KEYS) {
      let excess = this.buckets.size - MAX_KEYS + 1;
      for (const key of this.buckets.keys()) {
        if (excess-- <= 0) break;
        this.buckets.delete(key);
      }
    }
  }
}

const IP_LIKE = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * The client address as reported by the reverse proxy: first entry of `x-forwarded-for`, else
 * `x-real-ip`. Returns null when neither is present or the value does not look like an address,
 * so callers fall back to their global ceiling instead of sharing one bucket called "unknown".
 */
export function clientAddress(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || headers.get('x-real-ip')?.trim();
  if (!candidate || !IP_LIKE.test(candidate)) return null;
  return candidate.toLowerCase();
}
