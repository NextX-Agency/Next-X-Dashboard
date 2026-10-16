import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import nextConfig from '../../next.config';

describe('legacy public URLs and staging indexing', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('permanently maps audited legacy audio catalog URLs to the audio storefront', async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/catalog', destination: '/audio', permanent: true },
        {
          source: '/catalog/:legacyItemId',
          destination: '/audio/:legacyItemId',
          permanent: true,
        },
      ]),
    );
    expect(redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/shop' }),
        expect.objectContaining({ source: '/store' }),
      ]),
    );
  });

  it('keeps the staging storefront out of search indexes', () => {
    vi.stubEnv('NEXTX_ENVIRONMENT', 'staging');

    expect(robots()).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] });
  });
});
