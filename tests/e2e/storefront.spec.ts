import { expect, test } from '@playwright/test';

/**
 * Public storefront fixtures are deliberately supplied by the isolated staging
 * environment. Product facts must remain real: this suite never seeds fake
 * reviews, stock or customer activity merely to make a browser assertion pass.
 */
const stagingReady =
  Boolean(process.env.E2E_BASE_URL && process.env.E2E_EMAIL && process.env.E2E_PASSWORD) &&
  process.env.E2E_ISOLATED_STAGING === '1';
const productSlug = process.env.E2E_PUBLIC_PRODUCT_SLUG;
const productName = process.env.E2E_PUBLIC_PRODUCT_NAME;
const variantName = process.env.E2E_PUBLIC_VARIANT_NAME;
const secondProductSlug = process.env.E2E_PUBLIC_SECOND_PRODUCT_SLUG;
const secondProductName = process.env.E2E_PUBLIC_SECOND_PRODUCT_NAME;
const secondVariantName = process.env.E2E_PUBLIC_SECOND_VARIANT_NAME;

test.describe('storefront catalog', () => {
  test.skip(
    !stagingReady || !productSlug,
    'storefront e2e requires isolated staging credentials and E2E_PUBLIC_PRODUCT_SLUG',
  );

  test('shows a published product on the homepage and product page without private costs', async ({
    page,
  }) => {
    await page.goto('/shop');
    const productLink = page.locator(`a[href="/products/${productSlug}"]`).first();
    await expect(productLink).toBeVisible();

    await productLink.click();
    await expect(page).toHaveURL(new RegExp(`/products/${productSlug}$`));
    if (productName)
      await expect(page.getByRole('heading', { name: productName })).toBeVisible();
    if (variantName)
      await expect(page.getByRole('button', { name: variantName })).toBeVisible();

    const pageHtml = await page.content();
    for (const privateField of [
      'reference_cost',
      'landed_cost',
      'supplier_cost',
      'stock_valuation',
      'gross_margin',
    ]) {
      expect(pageHtml).not.toContain(privateField);
    }
  });

  test('keeps catalog filters in the URL and renders the WhatsApp product CTA', async ({
    page,
  }) => {
    await page.goto('/shop');
    await page.getByRole('switch', { name: 'In-stock items only' }).click();
    await expect(page).toHaveURL(/availability=in-stock/);

    await page.goto(`/products/${productSlug}`);
    const whatsapp = page.getByRole('link', {
      name: /Order via WhatsApp|Ask when it is back/,
    });
    await expect(whatsapp).toBeVisible();
    const href = await whatsapp.getAttribute('href');
    expect(href).toContain('wa.me');
    if (productName) expect(decodeURIComponent(href ?? '')).toContain(productName);
  });

  test('applies a storefront collection through the public catalog URL', async ({ page }) => {
    const collection = process.env.E2E_PUBLIC_COLLECTION_SLUG;
    test.skip(!collection, 'set E2E_PUBLIC_COLLECTION_SLUG to verify collection filtering');

    await page.goto(`/shop?collection=${collection}`);
    await expect(page).toHaveURL(new RegExp(`collection=${collection}`));
    await expect(page.locator(`a[href="/products/${productSlug}"]`).first()).toBeVisible();
  });
});

test.describe('storefront demand capture', () => {
  test.skip(
    !stagingReady ||
      !process.env.E2E_RESTOCK_PRODUCT_SLUG ||
      !process.env.E2E_RESTOCK_VARIANT_NAME,
    'restock e2e requires an isolated sold-out fixture product and variant',
  );

  test('records restock interest against the selected sold-out variant', async ({ page }) => {
    const slug = process.env.E2E_RESTOCK_PRODUCT_SLUG as string;
    const variant = process.env.E2E_RESTOCK_VARIANT_NAME as string;
    await page.goto(`/products/${slug}`);
    await page.getByRole('button', { name: variant }).click();
    await expect(
      page.getByRole('heading', { name: 'Tell me when it is back in stock' }),
    ).toBeVisible();
    await page
      .getByLabel('WhatsApp number or email')
      .fill(`5978${Date.now().toString().slice(-6)}`);
    await page.getByRole('button', { name: 'Keep me posted' }).click();
    await expect(page.getByText("We'll keep your request for the team.")).toBeVisible();
  });
});

test.describe('storefront cart', () => {
  test.skip(
    !stagingReady ||
      !productSlug ||
      !variantName ||
      !secondProductSlug ||
      !secondVariantName ||
      secondProductSlug === productSlug,
    'cart e2e requires two isolated in-stock product and variant fixtures',
  );

  test('builds a multi-item-ready cart and prepares the customer details for WhatsApp', async ({
    page,
  }) => {
    await page.goto(`/products/${productSlug}`);
    await page.getByRole('button', { name: variantName as string, exact: true }).click();
    await page.getByLabel('Quantity').fill('1');
    await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(page.getByText(/added to your cart/)).toBeVisible();

    await page.goto(`/products/${secondProductSlug}`);
    await page.getByRole('button', { name: secondVariantName as string, exact: true }).click();
    await page.getByLabel('Quantity').fill('1');
    await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(page.getByText(/added to your cart/)).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Cart', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Order via WhatsApp' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cart, 2 items' })).toBeVisible();
    await expect(
      page.getByText('Price and stock just checked', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Staging Cart Check');
    await page.getByLabel('Phone', { exact: true }).fill('+597 8123456');
    await page.getByLabel('Notes', { exact: true }).fill('Please confirm this test enquiry.');

    const orderLink = page.getByRole('link', { name: /Send order via WhatsApp/ });
    await expect(orderLink).toBeVisible();
    const href = await orderLink.getAttribute('href');
    expect(href).toContain('wa.me');
    const message = decodeURIComponent(href ?? '');
    expect(message).toContain('Staging Cart Check');
    expect(message).toContain('+597 8123456');
    expect(message).toContain('Please confirm this test enquiry.');
    expect(message).toContain('Estimated total');
    expect(message).toContain('Stock is only reserved once the shop confirms my order.');
    if (productName) expect(message).toContain(productName);
    if (secondProductName) expect(message).toContain(secondProductName);
  });
});

test.describe('storefront product editor', () => {
  test.skip(
    !stagingReady || !process.env.E2E_DASHBOARD_PRODUCT_ID,
    'dashboard storefront e2e requires E2E_DASHBOARD_PRODUCT_ID on isolated staging',
  );

  test('saves product storefront compatibility fields', async ({ page }) => {
    const id = process.env.E2E_DASHBOARD_PRODUCT_ID as string;
    await page.goto(`/items/${id}`);
    const platforms = page.getByLabel('Platforms');
    await platforms.fill('Home Assistant');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/updated|saved/i)).toBeVisible();
  });
});
