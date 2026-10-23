import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import nextConfig from '../../next.config';

// `connection()` only works inside a request; these tests call the handlers directly.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

describe('legacy public URLs and staging indexing', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('permanently maps legacy catalog and audio URLs to the neutral /shop and /products URLs', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/catalog', destination: '/shop', permanent: true },
        { source: '/audio', destination: '/shop', permanent: true },
        { source: '/audio/cart', destination: '/cart', permanent: true },
        { source: '/audio/setups/:slug', destination: '/setups/:slug', permanent: true },
        { source: '/p/:slug', destination: '/products/:slug', permanent: true },
        expect.objectContaining({
          source: expect.stringContaining('/catalog/:legacyItemId'),
          destination: '/products/:legacyItemId',
          permanent: true,
        }),
        expect.objectContaining({
          source: expect.stringContaining('/audio/:slug'),
          destination: '/products/:slug',
          permanent: true,
        }),
      ]),
    );
  });

  it('never redirects the root: the home page is a real page, not a hop to a category', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.some((rule) => rule.source === '/')).toBe(false);
  });

  it('has no redirect loops or chains: no destination is itself a redirect source', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const literalSources = new Set(redirects.map((rule) => rule.source));
    for (const rule of redirects) {
      expect(
        literalSources.has(rule.destination),
        `${rule.source} -> ${rule.destination}`,
      ).toBe(false);
      // A parameterised destination must land on a canonical page, never back on a legacy root.
      expect(rule.destination).toMatch(/^\/(shop|cart|setups|products)/);
    }
  });

  it('keeps the staging storefront out of search indexes', async () => {
    vi.stubEnv('NEXTX_ENVIRONMENT', 'staging');

    expect(await robots()).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] });
    expect(await sitemap()).toEqual([]);
  });

  it('publishes crawl rules and a sitemap pointer outside staging', async () => {
    vi.stubEnv('NEXTX_ENVIRONMENT', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.shop-nextx.com');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://nextx-api.nextxagency.com');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-only-key');

    const rules = await robots();
    expect(rules.sitemap).toBe('https://www.shop-nextx.com/sitemap.xml');
    expect(rules.rules).toMatchObject([
      { userAgent: '*', allow: ['/', '/shop', '/products/'] },
    ]);
    const disallowed = (rules.rules as { disallow: string[] }[])[0]?.disallow ?? [];
    expect(disallowed).toContain('/cart');
    expect(disallowed).toContain('/items');
    expect(disallowed).not.toContain('/products');
    // Staff screens, sign-in and private document links stay out of the crawl, and so does nothing
    // a shopper should find.
    for (const path of [
      '/dashboard',
      '/orders',
      '/storefront',
      '/d/',
      '/invoice',
      '/auth',
      '/api',
    ]) {
      expect(disallowed, path).toContain(path);
    }
    for (const path of ['/', '/shop', '/products/', '/faq', '/_next']) {
      expect(disallowed, path).not.toContain(path);
    }
  });
});
