import { expect, test } from '@playwright/test';

/**
 * Variant behaviour end to end, against the disposable rehearsal database loaded with the SYNTHETIC
 * variant fixture (scripts/rehearsal/variant-fixture.sql): "KZ Test IEM" with Black / Silver / Purple and
 * "KZ Test Case" with Red / Blue. Nothing here writes data (the sale is never submitted).
 *
 *   psql <rehearsal db> -f scripts/rehearsal/variant-fixture.sql
 *   E2E_VARIANT_FIXTURE=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public variants-local
 *
 * The photographs in the fixture are stand-ins, so the tests assert WHICH file is shown for which
 * option, not what the photograph depicts.
 */
test.skip(
  process.env.E2E_VARIANT_FIXTURE !== '1' ||
    !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'needs E2E_VARIANT_FIXTURE=1, a localhost E2E_BASE_URL and the variant fixture loaded',
);

const mainPhoto = (page: import('@playwright/test').Page) =>
  page.locator('article img').first();

async function srcOf(locator: import('@playwright/test').Locator): Promise<string> {
  const src = (await locator.getAttribute('src')) ?? '';
  return decodeURIComponent(new URL(src, 'http://x').searchParams.get('url') ?? src);
}

test.describe('shop: the chosen option drives the page', () => {
  test('photographs, price, stock, pickup and address follow the option', async ({ page }) => {
    await page.goto('/products/kz-test-iem', { waitUntil: 'networkidle' });
    // Black is the default option and is in stock.
    await expect(page).toHaveURL(/variant=KZ-TEST-IEM-BLK/);
    expect(await srcOf(mainPhoto(page))).toContain('kz-castor-pro');
    await expect(page.getByText('SRD 1,500').first()).toBeVisible();
    await expect(page.getByText(/Pickup: stock by location/)).toContainText('Black');

    await page.getByRole('button', { name: 'Silver, sold out' }).click();
    await expect(page).toHaveURL(/variant=KZ-TEST-IEM-SLV/);
    expect(await srcOf(mainPhoto(page))).toContain('kz-vader');
    await expect(page.getByText('SRD 1,600').first()).toBeVisible();
    await expect(page.getByText('Sold out').first()).toBeVisible();
    // A sold-out option offers the restock route, never "Add to cart".
    await expect(page.getByRole('link', { name: /ask when it is back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
    await expect(page.getByText(/Pickup: stock by location/)).toContainText('Silver');

    await page.getByRole('button', { name: 'Purple' }).click();
    // Purple has no photograph of its own: the shared product photograph, never Black's or Silver's.
    const purple = await srcOf(mainPhoto(page));
    expect(purple).toContain('kz-zsn-pro-2');
    await expect(page.getByText('SRD 1,700').first()).toBeVisible();
    await expect(page.getByText(/Only 2 left/).first()).toBeVisible();
  });

  test('a link to an option opens on it, and the option names the WhatsApp order', async ({
    page,
  }) => {
    await page.goto('/products/kz-test-iem?variant=KZ-TEST-IEM-PRP', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('button', { name: 'Purple', pressed: true })).toBeVisible();
    const order = page.getByRole('link', { name: /order via whatsapp/i });
    const href = decodeURIComponent((await order.getAttribute('href')) ?? '');
    expect(href).toContain('Purple');
    expect(href).toContain('KZ-TEST-IEM-PRP');
    expect(href).toContain('SRD 1,700');
  });

  test('an option with no usable photograph says so instead of borrowing another colour', async ({
    page,
  }) => {
    await page.goto('/products/kz-test-case?variant=KZ-TEST-CASE-RED', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByText(/No photo of the Red option yet/)).toBeVisible();
    await expect(page.locator('article img[alt*="Blue"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Blue' }).click();
    expect(await srcOf(mainPhoto(page))).toContain('kz-elliptical-pouch');
  });

  test('the cart keeps the chosen option and its own photograph', async ({ page }) => {
    await page.goto('/products/kz-test-iem?variant=KZ-TEST-IEM-BLK', {
      waitUntil: 'networkidle',
    });
    await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await page.goto('/cart', { waitUntil: 'networkidle' });
    const line = page.locator('article', { hasText: 'KZ-TEST-IEM-BLK' });
    await expect(line).toContainText('Black');
    expect(await srcOf(line.locator('img'))).toContain('kz-castor-pro');
  });
});

test.describe('shop: filters combine on one variant', () => {
  const count = async (page: import('@playwright/test').Page, query: string) => {
    await page.goto(`/shop?${query}`, { waitUntil: 'networkidle' });
    return page.locator('section[aria-label="Products"] article').count();
  };

  test('colour + in stock only matches a product whose THAT colour is in stock', async ({
    page,
  }) => {
    // Silver is sold out even though Black and Purple of the same product are in stock.
    expect(await count(page, 'colour=Silver&availability=in-stock')).toBe(0);
    expect(await count(page, 'colour=Silver')).toBe(1);
    expect(await count(page, 'colour=Purple&availability=in-stock')).toBe(1);
    expect(await count(page, 'colour=Black&opt=connector:Type-C')).toBe(0);
    expect(await count(page, 'colour=Purple&opt=connector:Type-C')).toBe(1);
  });

  test('category + brand + colour + stock: the result opens on the matching option', async ({
    page,
  }) => {
    expect(
      await count(page, 'category=in-ear-monitor&brand=kz&colour=Black&availability=in-stock'),
    ).toBe(1);
    const card = page.locator('section[aria-label="Products"] article').first();
    await expect(card.getByRole('link')).toHaveAttribute('href', /variant=KZ-TEST-IEM-BLK/);
    expect(await srcOf(card.locator('img'))).toContain('kz-castor-pro');
    await card.getByRole('link').click();
    await expect(page.getByRole('button', { name: 'Black', pressed: true })).toBeVisible();
  });

  test('chips remove one filter, Clear all removes every one, and the URL carries the state', async ({
    page,
  }) => {
    await page.goto('/shop?colour=Black,Silver&availability=in-stock', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('button', { name: 'Remove filter: Silver' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove filter: Silver' }).click();
    await expect(page).toHaveURL(/colour=Black(&|$)/);
    await expect(page).not.toHaveURL(/Silver/);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page).toHaveURL(/\/shop$/);
  });

  test('the filters sheet opens, applies a choice with its count, and closes', async ({
    page,
  }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet.getByText('Colour')).toBeVisible();
    await sheet.getByRole('button', { name: /^Purple/ }).click();
    await expect(page).toHaveURL(/colour=Purple/);
    // A value that nothing matches under the other filters stays listed, with a zero.
    await expect(sheet.getByRole('button', { name: /Type-C/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Remove filter: Purple' })).toBeVisible();
  });

  test('a zero-result search explains itself and offers a way out', async ({ page }) => {
    await page.goto('/shop?colour=Silver&availability=in-stock', { waitUntil: 'networkidle' });
    await expect(page.getByText('Nothing found')).toBeVisible();
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(/\/shop$/);
  });
});

test.describe('sales: the visual product picker', () => {
  test('search, choose the exact option, add with a quantity, keep going', async ({ page }) => {
    await page.goto('/sales/new', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add product' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByPlaceholder(/search name, model/i)).toBeFocused();

    // Search by model number, then open the product with Enter.
    await dialog.getByPlaceholder(/search name, model/i).fill('KZT-1');
    await expect(dialog.getByText('1 result')).toBeVisible();
    await page.keyboard.press('Enter');
    const detail = dialog.getByRole('complementary', { name: 'Selected product' });
    await expect(detail.getByRole('button', { name: /Black/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await srcOf(detail.locator('img').first())).toContain('kz-castor-pro');

    // The option's own photograph, price and per-location stock replace the previous option's.
    await detail.getByRole('button', { name: /Silver/ }).click();
    expect(await srcOf(detail.locator('img').first())).toContain('kz-vader');
    await expect(detail.getByText('Out of stock').first()).toBeVisible();
    await detail.getByRole('button', { name: /Purple/ }).click();
    await expect(detail.getByRole('list', { name: 'Stock by location' })).toContainText(
      'Blauwgrond',
    );

    await detail.getByRole('button', { name: /Black/ }).click();
    await dialog.getByLabel('Quantity', { exact: true }).fill('2');
    await dialog.getByRole('button', { name: 'Add to sale' }).click();
    await expect(dialog.getByText(/Added 2 × KZ Test IEM.*Black/)).toBeVisible();

    // The dialog stays open on the search box: a second product follows without leaving the sale.
    await expect(dialog.getByPlaceholder(/search name, model/i)).toBeFocused();
    await dialog.getByPlaceholder(/search name, model/i).fill('essager 1m');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(dialog.getByText(/Added 1 × ESSAGER 1m/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // Focus returns to where the picker was opened from.
    await expect(page.getByRole('button', { name: 'Add another product' })).toBeFocused();

    const lines = page.locator('form .divide-y > div');
    await expect(lines).toHaveCount(2);
    await expect(lines.first().locator('img[alt*="Black"]')).toBeVisible();
    await expect(lines.first()).toContainText('KZ-TEST-IEM-BLK');
    await expect(lines.first().locator('input[id^="qty"]')).toHaveValue('2');
    // The list price in the sale's currency is filled in and stays editable.
    await expect(lines.first().locator('input[id^="price"]')).toHaveValue('30.00');
  });

  test('stock and category filters narrow the grid; an empty result says so', async ({
    page,
  }) => {
    await page.goto('/sales/new', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add product' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Out of stock', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /Vader/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'In stock', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /Vader/ })).toHaveCount(0);
    await dialog.getByPlaceholder(/search name, model/i).fill('zzzz-nothing');
    await expect(dialog.getByText('No products match')).toBeVisible();
    await dialog.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(dialog.getByRole('button', { name: /Vader/ })).toBeVisible();
  });
});

for (const width of [390, 768, 1440]) {
  test(`no horizontal overflow at ${width}px on the option pages and the picker`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const overflow = async (label: string) => {
      const extra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(extra, `${label} overflows horizontally at ${width}px`).toBeLessThanOrEqual(0);
    };
    for (const path of [
      '/products/kz-test-iem?variant=KZ-TEST-IEM-SLV',
      '/products/kz-test-case?variant=KZ-TEST-CASE-RED',
      '/shop?colour=Black&opt=connector:3.5mm',
      '/cart',
    ]) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await overflow(path);
    }
    await page.goto('/sales/new', { waitUntil: 'networkidle' });
    await overflow('/sales/new');
    await page.getByRole('button', { name: 'Add product' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(/search name, model/i).fill('KZT-1');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('complementary', { name: 'Selected product' })).toBeVisible();
    await overflow('the picker with a product open');
    // The dialog itself must not be wider than the screen either.
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(width);
  });
}

test('a card that matched a colour shows that option’s price, stock and name', async ({
  page,
}) => {
  await page.goto('/shop?colour=Purple', { waitUntil: 'networkidle' });
  const card = page.locator('section[aria-label="Products"] article').first();
  await expect(card).toContainText('Purple');
  await expect(card).toContainText('SRD 1,700');
  await expect(card).not.toContainText('from');
  await expect(card).toContainText('Only 2 left');
  await page.goto('/shop?colour=Silver', { waitUntil: 'networkidle' });
  const silver = page.locator('section[aria-label="Products"] article').first();
  await expect(silver).toContainText('SRD 1,600');
  await expect(silver).toContainText('Sold out');
});
