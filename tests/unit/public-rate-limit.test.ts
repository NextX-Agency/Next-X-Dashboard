import { beforeEach, describe, expect, it, vi } from 'vitest';

let forwarded: string | null = '203.0.113.7';
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'x-forwarded-for' ? forwarded : null),
  }),
}));

const { checkPublicRateLimit, enforcePublicWriteLimit, PUBLIC_WRITE_PER_CLIENT } = await import(
  '@/server/public-rate-limit'
);
const { ActionError } = await import('@/server/errors');

describe('public write limit', () => {
  beforeEach(() => {
    globalThis.__nextxPublicLimiter = undefined;
    forwarded = '203.0.113.7';
  });

  it('lets a visitor submit a handful of requests, then asks them to wait', async () => {
    const scope = `test-${Math.random()}`;
    for (let i = 0; i < PUBLIC_WRITE_PER_CLIENT.limit; i++) {
      await expect(enforcePublicWriteLimit(scope)).resolves.toBeUndefined();
    }
    await expect(enforcePublicWriteLimit(scope)).rejects.toBeInstanceOf(ActionError);
    await expect(enforcePublicWriteLimit(scope)).rejects.toThrow(/Too many requests.*WhatsApp/);
  });

  it('does not let one visitor use up the allowance of another', async () => {
    const scope = `test-${Math.random()}`;
    for (let i = 0; i < PUBLIC_WRITE_PER_CLIENT.limit; i++)
      await enforcePublicWriteLimit(scope);
    forwarded = '198.51.100.20';
    await expect(enforcePublicWriteLimit(scope)).resolves.toBeUndefined();
  });

  it('does not let a noisy visitor use up the site-wide allowance of everyone else', async () => {
    const scope = `test-${Math.random()}`;
    const perClient = { limit: 2, windowMs: 60_000 };
    const global = { limit: 5, windowMs: 60_000 };
    for (let i = 0; i < 50; i++) await checkPublicRateLimit(scope, perClient, global);
    forwarded = '198.51.100.20';
    await expect(checkPublicRateLimit(scope, perClient, global)).resolves.toEqual({ ok: true });
  });

  it('still enforces the site-wide ceiling when the address is missing or forged', async () => {
    const scope = `test-${Math.random()}`;
    forwarded = null;
    const perClient = { limit: 1, windowMs: 60_000 };
    const global = { limit: 3, windowMs: 60_000 };
    const outcomes = [];
    for (let i = 0; i < 5; i++)
      outcomes.push(await checkPublicRateLimit(scope, perClient, global));
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, true, true, false, false]);
  });
});
