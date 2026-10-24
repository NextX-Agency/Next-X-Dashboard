import { describe, expect, it } from 'vitest';
import {
  parseRetryAfterMs,
  QUOTE_RETRY_BASE_MS,
  QUOTE_RETRY_MAX_ATTEMPTS,
  QUOTE_RETRY_MAX_MS,
  QUOTE_RETRY_MIN_MS,
  quoteRetryDelayMs,
} from '@/lib/store-cart-quote-retry';

describe('parseRetryAfterMs', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfterMs('12')).toBe(12_000);
    expect(parseRetryAfterMs(' 0 ')).toBe(0);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-10-24T10:00:00Z');
    expect(parseRetryAfterMs('Sat, 24 Oct 2026 10:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfterMs('Sat, 24 Oct 2026 09:59:00 GMT', now)).toBe(0);
  });

  it('ignores missing and unreadable values', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
    expect(parseRetryAfterMs('soon')).toBeNull();
  });
});

describe('quoteRetryDelayMs', () => {
  it('honours the server Retry-After', () => {
    expect(quoteRetryDelayMs({ retryAfter: '20', attempt: 1 })).toBe(20_000);
  });

  it('backs off exponentially without a header', () => {
    expect(quoteRetryDelayMs({ retryAfter: null, attempt: 1 })).toBe(QUOTE_RETRY_BASE_MS);
    expect(quoteRetryDelayMs({ retryAfter: null, attempt: 2 })).toBe(QUOTE_RETRY_BASE_MS * 2);
    expect(quoteRetryDelayMs({ retryAfter: null, attempt: 3 })).toBe(QUOTE_RETRY_BASE_MS * 4);
  });

  it('never retries in a tight loop and never waits for ever', () => {
    expect(quoteRetryDelayMs({ retryAfter: '0', attempt: 1 })).toBe(QUOTE_RETRY_MIN_MS);
    expect(quoteRetryDelayMs({ retryAfter: '86400', attempt: 1 })).toBe(QUOTE_RETRY_MAX_MS);
  });

  it('gives up after the attempt limit so the customer gets a manual retry', () => {
    expect(
      quoteRetryDelayMs({ retryAfter: '1', attempt: QUOTE_RETRY_MAX_ATTEMPTS }),
    ).not.toBeNull();
    expect(
      quoteRetryDelayMs({ retryAfter: '1', attempt: QUOTE_RETRY_MAX_ATTEMPTS + 1 }),
    ).toBeNull();
    expect(quoteRetryDelayMs({ retryAfter: '1', attempt: 0 })).toBeNull();
  });
});
