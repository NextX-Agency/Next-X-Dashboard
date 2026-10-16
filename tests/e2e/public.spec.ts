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

  const robotsResponse = await request.get('/robots.txt');
  const robotsText = await robotsResponse.text();
  if (process.env.NEXTX_ENVIRONMENT === 'staging') {
    expect(robotsText).toContain('Disallow: /');
  } else {
    expect(robotsText).toContain('Sitemap:');
  }
});

test('legacy public catalog URLs permanently redirect to current audio routes', async ({
  request,
}) => {
  const routes = [
    ['/catalog', '/audio'],
    ['/catalog/legacy-product-id', '/audio/legacy-product-id'],
  ] as const;

  for (const [path, destination] of routes) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location, path).toBe(destination);
  }
});
