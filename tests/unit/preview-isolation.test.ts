import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewLayout from '@/app/(preview)/preview/layout';
import { isPublicPath } from '@/lib/route-access';

// next/font only runs inside the Next.js compiler; stand in for it so the layout can be called directly.
vi.mock('next/font/google', () => {
  const font = () => ({ variable: 'font-var' });
  return {
    Instrument_Serif: font,
    IBM_Plex_Sans_Condensed: font,
    IBM_Plex_Mono: font,
    Manrope: font,
  };
});

describe('design previews are local-only', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is not a public path, so a deployed host sends signed-out visitors to /login', () => {
    for (const path of [
      '/preview',
      '/preview/a',
      '/preview/b/product',
      '/preview/c/dashboard',
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it('404s in production even for a signed-in staff member', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => PreviewLayout({ children: null })).toThrow();
  });

  it('renders outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => PreviewLayout({ children: null })).not.toThrow();
  });
});
