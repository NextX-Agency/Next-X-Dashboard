import { headers } from 'next/headers';
import { clientAddress, type RateLimit, RateLimiter } from '@/lib/rate-limit';
import { ActionError } from './errors';

/**
 * Shared limiter instance. Cached on globalThis so a dev hot reload does not reset it, and so
 * route handlers and server actions in the same process see the same counters.
 */
declare global {
  var __nextxPublicLimiter: RateLimiter | undefined;
}
const limiter: RateLimiter = globalThis.__nextxPublicLimiter ?? new RateLimiter();
globalThis.__nextxPublicLimiter = limiter;

/** Per visitor: a handful of requests per window. A genuine visitor sends one. */
export const PUBLIC_WRITE_PER_CLIENT: RateLimit = { limit: 6, windowMs: 10 * 60_000 };
/** Whole site, per endpoint: a ceiling that holds even when forwarded headers are forged. */
export const PUBLIC_WRITE_GLOBAL: RateLimit = { limit: 150, windowMs: 10 * 60_000 };

/** The shop's cart pricing endpoint is called on every cart change, so it is far more generous. */
export const CART_QUOTE_PER_CLIENT: RateLimit = { limit: 90, windowMs: 60_000 };
export const CART_QUOTE_GLOBAL: RateLimit = { limit: 1_500, windowMs: 60_000 };

export type LimitOutcome = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Check the per-client and global buckets for `scope`. */
export async function checkPublicRateLimit(
  scope: string,
  perClient: RateLimit,
  global: RateLimit,
): Promise<LimitOutcome> {
  const globalResult = limiter.check(`${scope}:global`, global);
  if (!globalResult.ok) return globalResult;

  const address = clientAddress(await headers());
  if (!address) return { ok: true };
  const result = limiter.check(`${scope}:${address}`, perClient);
  return result.ok ? { ok: true } : result;
}

/** For `publicAction`: throws a message a visitor can act on. */
export async function enforcePublicWriteLimit(scope: string): Promise<void> {
  const outcome = await checkPublicRateLimit(
    scope,
    PUBLIC_WRITE_PER_CLIENT,
    PUBLIC_WRITE_GLOBAL,
  );
  if (!outcome.ok) {
    const minutes = Math.max(1, Math.ceil(outcome.retryAfterSeconds / 60));
    throw new ActionError(
      `Too many requests. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} and try again, or message us on WhatsApp.`,
    );
  }
}
