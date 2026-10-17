import { expect, test } from '@playwright/test';

/**
 * Storefront behaviour against the local design fixture (scripts/rehearsal/visual-seed.sql: the live
 * shop's 15 public products) on the disposable local rehearsal database.
 * Run with:  E2E_VISUAL_FIXTURES=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public store-local
 *
 * It never runs against staging or production: the product names below exist
 * only in the fixture.
 */
test.skip(
  process.env.E2E_VISUAL_FIXTURES !== '1',
  'needs the synthetic visual fixture on the local rehearsal database',
);

const PRODUCT = { slug: 'kz-as16-pro-x', name: 'KZ AS16 Pro X', price: 'SRD 3.000' };

test.describe('neutral storefront structure', () => {
  test('the home page is a real page with the NextX brand, not a redirect to a category', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: /naar de homepage/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Categorieën' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // No staff link in the customer header.
    await expect(page.locator('header').getByText('Medewerkers')).toHaveCount(0);
  });

  test('no public URL carries a product family', async ({ page }) => {
    await page.goto('/shop');
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs.filter((href) => /^\/(audio|watches)(\/|$)/.test(href))).toEqual([]);
  });

  test('legacy URLs permanently redirect in a single hop', async ({ request }) => {
    for (const [from, to] of [
      ['/audio', '/shop'],
      ['/audio/cart', '/cart'],
      ['/audio/kz-as16-pro-x', '/products/kz-as16-pro-x'],
      ['/catalog', '/shop'],
      ['/p/kz-as16-pro-x', '/products/kz-as16-pro-x'],
    ] as const) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(308);
      expect(response.headers().location, from).toBe(to);
      const hop = await request.get(to, { maxRedirects: 0 });
      expect(hop.status(), `${to} must not redirect again`).toBe(200);
    }
  });

  test('an unknown product is a real 404 and is not indexable', async ({ request }) => {
    const response = await request.get('/products/does-not-exist');
    expect(response.status()).toBe(404);
  });

  test('retired watch URLs answer 410, never a redirect', async ({ request }) => {
    const response = await request.get('/watches/anything', { maxRedirects: 0 });
    expect(response.status()).toBe(410);
  });
});

test.describe('catalogue and product page', () => {
  test('filters by category and search through the URL', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.getByRole('heading', { level: 1, name: 'Alle producten' })).toBeVisible();
    await page
      .getByRole('link', { name: /^In-Ear Accessories/ })
      .first()
      .click();
    await expect(page).toHaveURL(/category=in-ear-accessories/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'In-Ear Accessories' }),
    ).toBeVisible();

    await page.goto('/shop?q=ESSAGER');
    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible();
    for (const text of await cards.allInnerTexts())
      expect(text.toLowerCase()).toContain('essager');

    await page.goto('/shop?q=zzzgeenresultaat');
    await expect(page.getByRole('heading', { name: 'Niets gevonden' })).toBeVisible();
  });

  test('a product shows its price in SRD, stock and canonical metadata', async ({ page }) => {
    await page.goto(`/products/${PRODUCT.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT.name })).toBeVisible();
    await expect(page.getByText(PRODUCT.price, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Nog 2|Op voorraad/).first()).toBeVisible();
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/products/${PRODUCT.slug}`);
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(JSON.parse(jsonLd ?? '{}')['@type']).toBe('Product');
  });

  test('cart: quantity, totals and the WhatsApp message stay accurate', async ({ page }) => {
    await page.goto(`/products/${PRODUCT.slug}`);
    await page.getByRole('button', { name: 'Meer' }).click();
    await page.getByRole('button', { name: 'In winkelwagen' }).click();
    await expect(page.getByText(/2 × KZ AS16 Pro X toegevoegd/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Winkelwagen, 2 artikelen' })).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Winkelwagen', exact: true })).toBeVisible();
    await expect(page.getByText('Prijs en voorraad zojuist gecontroleerd')).toBeVisible();
    // 2 x SRD 3.000
    await expect(page.getByText('SRD 6.000').first()).toBeVisible();

    await page.getByLabel('Naam', { exact: true }).fill('Testklant');
    await page.getByLabel('Telefoon', { exact: true }).fill('+597 8000000');
    const order = page.getByRole('link', { name: /Verstuur bestelling via WhatsApp/ });
    await expect(order).toBeVisible();
    const message = decodeURIComponent((await order.getAttribute('href')) ?? '');
    expect(message).toContain('KZ AS16 Pro X');
    expect(message).toContain('2');
    expect(message).toContain('SRD 6.000');
    expect(message).toContain('Testklant');
  });

  test('cart cannot exceed available stock', async ({ page }) => {
    await page.goto('/products/m-vave-sws12'); // 2 in stock
    for (let i = 0; i < 5; i++) {
      const plus = page.getByRole('button', { name: 'Meer' });
      if (await plus.isEnabled()) await plus.click();
    }
    await expect(page.locator('#store-cart-quantity')).toHaveValue('2');
  });
});

test.describe('responsive layout', () => {
  for (const width of [390, 768, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/shop', `/products/${PRODUCT.slug}`, '/cart']) {
        await page.goto(path, { waitUntil: 'networkidle' });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('mobile navigation opens and reaches the shop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Snelnavigatie' })
      .getByRole('link', { name: 'Winkel' })
      .click();
    await expect(page).toHaveURL(/\/shop$/);
  });
});
