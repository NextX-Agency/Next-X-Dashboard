/**
 * Retry rules for the cart's price-and-stock check.
 *
 * The check is a public endpoint that is rate limited. A 429 is not a failure of the cart: the last
 * good answer is still the best one the customer has, so the cart keeps it, says quietly that it is
 * checking again, and asks again once the server says it may. Pure so the timing is testable.
 */

/** Used when the server sends no usable Retry-After. Doubled for every consecutive 429. */
export const QUOTE_RETRY_BASE_MS = 3_000;
/** Never sooner than this, so a `Retry-After: 0` cannot turn into a tight loop. */
export const QUOTE_RETRY_MIN_MS = 1_000;
/** Never later than this, so a huge header cannot park the cart for an hour. */
export const QUOTE_RETRY_MAX_MS = 120_000;
/** Consecutive 429s tolerated before the cart stops retrying by itself and offers "Check again". */
export const QUOTE_RETRY_MAX_ATTEMPTS = 6;

/**
 * A Retry-After header as milliseconds: delta-seconds ("30") or an HTTP date. Null when absent or
 * not understood.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) ? seconds * 1000 : null;
  }
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

/**
 * How long to wait before asking again after the `attempt`-th consecutive 429 (1 for the first), or
 * null when the cart should stop retrying on its own. The server's Retry-After wins when present.
 */
export function quoteRetryDelayMs(input: {
  retryAfter: string | null | undefined;
  attempt: number;
  nowMs?: number;
}): number | null {
  const { retryAfter, attempt, nowMs } = input;
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > QUOTE_RETRY_MAX_ATTEMPTS) {
    return null;
  }
  const fromServer = parseRetryAfterMs(retryAfter, nowMs);
  const backoff = QUOTE_RETRY_BASE_MS * 2 ** (attempt - 1);
  const wanted = fromServer ?? backoff;
  return Math.min(QUOTE_RETRY_MAX_MS, Math.max(QUOTE_RETRY_MIN_MS, wanted));
}
