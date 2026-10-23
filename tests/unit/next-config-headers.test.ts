import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Rule = { source: string; headers: { key: string; value: string }[] };

async function loadConfig(nodeEnv: 'production' | 'development') {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://api.example.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-only-key');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://shop.example.com');
  return (await import('../../next.config')).default;
}

async function rules(nodeEnv: 'production' | 'development'): Promise<Rule[]> {
  const config = await loadConfig(nodeEnv);
  return ((await config.headers?.()) ?? []) as Rule[];
}

/** Next compiles `source` with path-to-regexp; it ships its own copy. */
async function sourceMatches(source: string, pathname: string): Promise<boolean> {
  // The compiled copy ships without type declarations, so the specifier is not statically resolved.
  const specifier: string = 'next/dist/compiled/path-to-regexp';
  const { pathToRegexp } = (await import(specifier)) as {
    pathToRegexp: (source: string) => RegExp;
  };
  return pathToRegexp(source).test(pathname);
}

describe('production response headers', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('sends the security headers on every production route', async () => {
    const all = (await rules('production')).find((rule) => rule.source === '/:path*');
    const headers = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Strict-Transport-Security']).toMatch(/^max-age=\d{7,}$/);
    // Not includeSubDomains: the Supabase and Coolify hostnames are siblings of the shop.
    expect(headers['Strict-Transport-Security']).not.toContain('includeSubDomains');
  });

  it('adds only CSP directives that cannot break Next.js inline scripts', async () => {
    const all = (await rules('production')).find((rule) => rule.source === '/:path*');
    const csp = all?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';

    expect(csp).toContain("frame-ancestors 'self'");
    // A script-src/default-src without nonces would block the inline bootstrap scripts.
    expect(csp).not.toMatch(/script-src|default-src|style-src/);
  });

  it('caches unversioned public files for a day, never as immutable', async () => {
    const rule = (await rules('production')).find((r) => r.source !== '/:path*');
    expect(rule).toBeDefined();
    const cache = rule?.headers.find((h) => h.key === 'Cache-Control')?.value ?? '';
    expect(cache).toContain('max-age=86400');
    expect(cache).not.toContain('immutable');

    const source = rule?.source ?? '';
    for (const path of ['/nextx-logo.svg', '/og-image.png', '/hero_section-watches.webp']) {
      expect(await sourceMatches(source, path), path).toBe(true);
    }
    // Pages, API routes and the framework's own (already immutable) assets are untouched.
    for (const path of [
      '/shop',
      '/products/some-camera',
      '/api/health',
      '/_next/static/a/b.js',
    ]) {
      expect(await sourceMatches(source, path), path).toBe(false);
    }
  });

  it('leaves development unfenced', async () => {
    expect(await rules('development')).toEqual([]);
  });

  it('hides the framework, compresses, and keeps image encoding cheap', async () => {
    const config = await loadConfig('production');
    expect(config.poweredByHeader).toBe(false);
    expect(config.compress).toBe(true);
    // AVIF is several times more expensive to encode than WebP on a small shared VPS.
    expect(config.images?.formats).toEqual(['image/webp']);
    expect(config.images?.minimumCacheTTL).toBeGreaterThanOrEqual(60 * 60 * 24 * 30);
    expect(Math.max(...(config.images?.deviceSizes ?? [0]))).toBeLessThanOrEqual(1920);
  });
});
