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

  it('permanently maps audited legacy audio catalog URLs to the audio storefront', async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/catalog', destination: '/audio', permanent: true },
        expect.objectContaining({
          source: expect.stringContaining('/catalog/:legacyItemId'),
          destination: '/audio/:legacyItemId',
          permanent: true,
        }),
      ]),
    );
    expect(redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/shop' }),
        expect.objectContaining({ source: '/store' }),
      ]),
    );
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
    expect(rules.rules).toMatchObject([{ userAgent: '*', allow: ['/', '/p/'] }]);
  });
});
