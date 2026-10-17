import { expect, test } from '@playwright/test';

// These pages render without an authenticated session or database fixtures,
// so the local E2E run can exercise the app without touching a shared DB.
const publicRoutes = [
  '/login',
  '/auth/error?reason=missing-code',
  '/no-access',
  '/design-system',
  '/robots.txt',
];

test('public static pages load without a session or error boundary', async ({
  page,
  request,
}) => {
  await page.context().clearCookies();

  for (const route of publicRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByText('Nextly could not load this page')).toHaveCount(0);
  }

  const home = await request.get('/', { maxRedirects: 0 });
  expect(home.status(), 'the home page is a page, not a redirect').toBe(200);

  const robotsResponse = await request.get('/robots.txt');
  const robotsText = await robotsResponse.text();
  if (process.env.NEXTX_ENVIRONMENT === 'staging') {
    expect(robotsText).toContain('Disallow: /');
  } else {
    expect(robotsText).toContain('Sitemap:');
  }
});

test('legacy public URLs permanently redirect to the neutral shop routes', async ({
  request,
}) => {
  const routes = [
    ['/catalog', '/shop'],
    ['/audio', '/shop'],
    ['/audio/cart', '/cart'],
    ['/catalog/legacy-product-id', '/products/legacy-product-id'],
    ['/audio/some-slug', '/products/some-slug'],
    ['/p/some-slug', '/products/some-slug'],
  ] as const;

  for (const [path, destination] of routes) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location, path).toBe(destination);
  }
});
