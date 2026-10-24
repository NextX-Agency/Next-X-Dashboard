import { describe, expect, it } from 'vitest';
import { clientAddress, RateLimiter } from '@/lib/rate-limit';

const WINDOW = { limit: 3, windowMs: 60_000 };

describe('RateLimiter', () => {
  it('allows up to the limit, then refuses with a retry hint', () => {
    const limiter = new RateLimiter();
    expect(limiter.check('k', WINDOW, 0)).toEqual({ ok: true, remaining: 2 });
    expect(limiter.check('k', WINDOW, 1_000)).toEqual({ ok: true, remaining: 1 });
    expect(limiter.check('k', WINDOW, 2_000)).toEqual({ ok: true, remaining: 0 });
    expect(limiter.check('k', WINDOW, 3_000)).toEqual({ ok: false, retryAfterSeconds: 57 });
  });

  it('starts a fresh window once the old one has expired', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) limiter.check('k', WINDOW, 0);
    expect(limiter.check('k', WINDOW, 59_999).ok).toBe(false);
    expect(limiter.check('k', WINDOW, 60_000)).toEqual({ ok: true, remaining: 2 });
  });

  it('counts keys independently', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) limiter.check('a', WINDOW, 0);
    expect(limiter.check('a', WINDOW, 1).ok).toBe(false);
    expect(limiter.check('b', WINDOW, 1).ok).toBe(true);
  });

  it('keeps memory bounded when keys are forged', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 12_000; i++) limiter.check(`forged-${i}`, WINDOW, 0);
    expect(limiter.size).toBeLessThanOrEqual(5_000);
    // And it still tracks and limits new keys afterwards.
    for (let i = 0; i < 3; i++) limiter.check('real', WINDOW, 1);
    expect(limiter.check('real', WINDOW, 2).ok).toBe(false);
  });
});

describe('clientAddress', () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  });

  it('prefers x-real-ip, then the LAST forwarded address (the one the proxy appended)', () => {
    expect(clientAddress(headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientAddress(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }))).toBe(
      '10.0.0.2',
    );
    expect(clientAddress(headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('ignores addresses the client put at the front of x-forwarded-for', () => {
    expect(
      clientAddress(headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.50' })),
    ).toBe('203.0.113.50');
    // x-real-ip wins over any forwarded list.
    expect(
      clientAddress(
        headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-real-ip': '203.0.113.50' }),
      ),
    ).toBe('203.0.113.50');
  });

  it('returns null rather than a shared bucket when there is no usable address', () => {
    expect(clientAddress(headers({}))).toBeNull();
    expect(clientAddress(headers({ 'x-forwarded-for': 'not an ip; drop table' }))).toBeNull();
    expect(clientAddress(headers({ 'x-forwarded-for': 'x'.repeat(200) }))).toBeNull();
  });
});
