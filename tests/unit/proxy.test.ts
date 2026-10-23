import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The proxy talks to Supabase only through `createServerClient`, so replacing it tells us exactly
// when an auth round trip would have happened.
const getUser = vi.fn();
const createServerClient = vi.fn(() => ({ auth: { getUser } }));
vi.mock('@supabase/ssr', () => ({ createServerClient }));

const { default: proxy, config } = await import('@/proxy');

function request(pathname: string): NextRequest {
  return new NextRequest(`https://shop.example.com${pathname}`);
}

describe('proxy auth work', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres@db:6543/postgres');
    vi.stubEnv('NEXTLY_DATABASE_MODE', 'self-hosted');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://api.example.com');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-only-key');
    getUser.mockReset();
    createServerClient.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('never calls Supabase for anonymous storefront traffic', async () => {
    for (const pathname of [
      '/',
      '/shop',
      '/products/some-camera',
      '/cart',
      '/setups/wifi-starter',
      '/faq',
      '/d/invoice/some-token',
      '/robots.txt',
      '/sitemap.xml',
      // Legacy shop URLs are answered by redirects configured in next.config.
      '/audio/old-id',
      '/catalog/old-id',
      '/p/some-camera',
    ]) {
      const response = await proxy(request(pathname));
      expect(response.status, pathname).toBe(200);
      expect(response.headers.get('x-nextly-request-id'), pathname).toBeTruthy();
    }
    expect(createServerClient).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('never calls Supabase for API routes, which own their own authentication', async () => {
    const response = await proxy(request('/api/v1/storefront/products'));
    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('still sends a signed-out visitor away from every dashboard route', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const pathname of [
      '/dashboard',
      '/items',
      '/items/new',
      '/sales',
      '/inventory',
      '/settings',
      '/storefront',
      '/ledger',
      // Lookalikes of public prefixes are not public.
      '/shopping',
      '/cartography',
      '/productsx',
      '/login-help',
    ]) {
      const response = await proxy(request(pathname));
      expect(response.status, pathname).toBe(307);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.pathname, pathname).toBe('/login');
      expect(location.searchParams.get('next'), pathname).toBe(pathname);
    }
    expect(createServerClient).toHaveBeenCalledTimes(12);
  });

  it('lets a signed-in member through to the dashboard and off the login page', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'member-1' } } });

    const dashboard = await proxy(request('/dashboard'));
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get('location')).toBeNull();

    const login = await proxy(request('/login'));
    expect(login.status).toBe(307);
    expect(new URL(login.headers.get('location') ?? '').pathname).toBe('/dashboard');
  });

  it('fails closed to an error page, not into the dashboard, when the auth check throws', async () => {
    getUser.mockRejectedValue(new Error('auth unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await proxy(request('/dashboard'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/error');
  });

  it('sends database-dependent pages to /setup when the database is not configured', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const response = await proxy(request('/dashboard'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/setup');
    expect(createServerClient).not.toHaveBeenCalled();
  });
});

describe('proxy matcher', () => {
  const [pattern] = config.matcher;
  // Next compiles the matcher with path-to-regexp; the negative lookahead is plain RegExp syntax.
  const matches = (pathname: string) => new RegExp(`^${pattern}$`).test(pathname);

  it('skips fingerprinted assets, optimised images and static files', () => {
    for (const pathname of [
      '/_next/static/chunks/app.js',
      '/_next/image',
      '/favicon.ico',
      '/nextx-logo.svg',
      '/og-image.png',
      '/hero_section-watches.webp',
      '/pro-diver.jpg',
      '/fonts/body.woff2',
    ]) {
      expect(matches(pathname), pathname).toBe(false);
    }
  });

  it('runs for pages, route handlers and token documents', () => {
    for (const pathname of ['/', '/shop', '/dashboard', '/api/health', '/d/invoice/token']) {
      expect(matches(pathname), pathname).toBe(true);
    }
  });
});
