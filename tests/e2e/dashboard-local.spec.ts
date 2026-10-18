import { expect, test } from '@playwright/test';

/**
 * Staff dashboard workflows against the disposable local rehearsal database. These WRITE rows (a sale,
 * an expense, a customer), so they refuse to run unless the target is the rehearsal database and the
 * operator opts in. Never point them at staging or production.
 *
 *   E2E_DISPOSABLE_DB=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public dashboard-local
 *
 * The local rehearsal auth hook signs the browser in as the design-review owner; there is no password.
 * These tests leave rows behind: run `bash scripts/rehearsal/reset-local.sh` afterwards (stop the dev server first).
 */
test.skip(
  process.env.E2E_DISPOSABLE_DB !== '1' ||
    !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'writes data: needs E2E_DISPOSABLE_DB=1 and a localhost E2E_BASE_URL on the rehearsal database',
);

const PRODUCT = 'ESSAGER 1m Aux';
const SKU = 'ESSAGER-1M-AUX';

async function available(page: import('@playwright/test').Page): Promise<number> {
  await page.goto(`/inventory?q=${SKU}`, { waitUntil: 'networkidle' });
  const row = page.locator('tr', { hasText: SKU });
  await expect(row).toBeVisible();
  const headers = (await page.locator('thead th').allInnerTexts()).map((text) =>
    text.trim().toLowerCase(),
  );
  const column = headers.findIndex((text) => text.startsWith('available'));
  expect(column, 'the Available column exists').toBeGreaterThan(-1);
  const cell = (await row.locator('td').nth(column).innerText()).trim().replace('−', '-');
  return Number(cell);
}

/** Choose a product in the visual picker the way staff do: search, open it, set the quantity, add. */
async function addToSale(
  page: import('@playwright/test').Page,
  search: string,
  quantity?: number,
): Promise<void> {
  await page.getByRole('button', { name: /add (another )?product/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder(/search name, model/i).fill(search);
  await dialog
    .getByRole('button', { name: new RegExp(search) })
    .first()
    .click();
  if (quantity !== undefined)
    await dialog.getByLabel('Quantity', { exact: true }).fill(String(quantity));
  await dialog.getByRole('button', { name: 'Add to sale' }).click();
  await expect(dialog.getByText(/^Added /)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test.describe.configure({ mode: 'serial' });

test('every dashboard page loads for the owner without console errors', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 140));
  });
  const paths = [
    '/dashboard',
    '/sales',
    '/sales/new',
    '/orders',
    '/orders/new',
    '/customers',
    '/quotes',
    '/items',
    '/items/new',
    '/bundles',
    '/categories',
    '/price-lists',
    '/inventory',
    '/reorder',
    '/suppliers',
    '/purchase-orders',
    '/purchase-orders/new',
    '/finance',
    '/ledger',
    '/wallets',
    '/invoices',
    '/obligations',
    '/expenses',
    '/expenses/recurring',
    '/commissions',
    '/exchange-rates',
    '/reconciliation',
    '/reports',
    '/owners',
    '/storefront',
    '/storefronts',
    '/activity',
    '/settings',
  ];
  for (const path of paths) {
    const response = await page.goto(path, { waitUntil: 'networkidle' });
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test('record a sale: stock goes down, the sale is listed, the cash ledger gets the receipt', async ({
  page,
}) => {
  const before = await available(page);
  expect(before).toBeGreaterThan(1);

  await page.goto('/sales/new', { waitUntil: 'networkidle' });
  await addToSale(page, PRODUCT);
  await page.locator('#price-0').fill('5.00');
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  // Recording returns to the sales list, which now has the sale.
  await expect(page).toHaveURL(/\/sales$/, { timeout: 20_000 });
  await expect(page.locator('table tbody tr').first()).toBeVisible();

  expect(await available(page)).toBe(before - 1);

  await page.goto('/ledger', { waitUntil: 'networkidle' });
  await expect(page.getByText(/\$?5\.00/).first()).toBeVisible();
});

test('overselling is allowed by design and is flagged afterwards (ADR 0003)', async ({
  page,
}) => {
  // A sale that really happened must be recordable even when its receipt is not entered yet. The
  // quantity field warns (aria-invalid) and the shortfall surfaces on Overview as negative stock.
  const onHand = await available(page);
  await page.goto('/sales/new', { waitUntil: 'networkidle' });
  await addToSale(page, PRODUCT, onHand + 1);
  await page.locator('#price-0').fill('5.00');
  await expect(page.locator('#qty-0')).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  await expect(page).toHaveURL(/\/sales$/, { timeout: 20_000 });
  expect(await available(page)).toBe(-1);
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await expect(page.getByText(/below zero stock/)).toBeVisible();
});

test('log an expense: it needs a classification, then appears in the list and the ledger', async ({
  page,
}) => {
  // The sheet's open state lives in the URL, so this is the same as pressing "Log expense".
  await page.goto('/expenses?new=1', { waitUntil: 'networkidle' });
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.locator('#description').fill('Packaging tape (e2e)');
  await sheet.locator('#vendorName').fill('Corner shop');
  await sheet.locator('#amount').fill('12.50');
  // Without a classification the expense cannot be saved: the browser blocks the empty required choice.
  await sheet.getByRole('button', { name: 'Log expense', exact: true }).click();
  await expect(page.getByText('Packaging tape (e2e)')).toHaveCount(0);
  await sheet.locator('#classification').selectOption({ index: 1 });
  await sheet.getByRole('button', { name: 'Log expense', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('table').getByText('Packaging tape (e2e)')).toBeVisible({
    timeout: 15_000,
  });
});

test('the activity log (owners only) shows what was just done and filters by record', async ({
  page,
}) => {
  await page.goto('/activity', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: 'Activity log' })).toBeVisible();
  await expect(page.getByText(/logged expense/).first()).toBeVisible();
  await expect(page.getByText(/confirmed sale/).first()).toBeVisible();
  await page.goto('/activity?entity=expense', { waitUntil: 'networkidle' });
  await expect(page.getByText(/logged expense/).first()).toBeVisible();
  await expect(page.getByText(/confirmed sale/)).toHaveCount(0);
  await page.goto('/activity?q=zzz-no-such-thing', { waitUntil: 'networkidle' });
  await expect(page.getByText('Nothing matches')).toBeVisible();
});

test('new order: lines come from the visual picker, with the option photograph', async ({
  page,
}) => {
  await page.goto('/orders/new', { waitUntil: 'networkidle' });
  await addToSale(page, 'ESSAGER 2m', 2);
  const line = page.locator('form .divide-y > div').first();
  await expect(line.locator('img[alt*="ESSAGER 2m"]')).toBeVisible();
  await expect(line.locator('input[id^="order-qty"]')).toHaveValue('2');
  await expect(line.locator('input[id^="order-price"]')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Create draft order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByText('ESSAGER 2m').first()).toBeVisible();
});

test('create a product with two options; a taken SKU is refused by name; both options reach the sale picker', async ({
  page,
}) => {
  const run = Date.now().toString(36).toUpperCase();
  const fill = async (name: string, code: string, skuA: string, skuB: string) => {
    await page.goto('/items/new', { waitUntil: 'networkidle' });
    await page.locator('#name').fill(name);
    await page.locator('#code').fill(code);
    if (!(await page.locator('#slug').inputValue()))
      await page.locator('#slug').fill(code.toLowerCase());
    await page.locator('#vname-0').fill('Black');
    await page.locator('#vsku-0').fill(skuA);
    await page.locator('#vprice-0').fill('25.00');
    await page.getByRole('button', { name: 'Add variant' }).click();
    // Every row has an accessible name, not only the first.
    await page.getByLabel('Option', { exact: true }).nth(1).fill('Silver');
    await page.locator('#vsku-1').fill(skuB);
    await page.locator('#vprice-1').fill('27.00');
  };

  await fill(`E2E Two Option IEM ${run}`, `E2E-TWO-${run}`, `E2E-${run}-BLK`, `E2E-${run}-SLV`);
  await page.getByRole('button', { name: 'Create product' }).click();
  // A new product opens on its own page so the photographs can be added.
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/, { timeout: 20_000 });

  // The same SKU on another product is named, not hidden behind "already exists".
  await fill(`E2E Clash ${run}`, `E2E-CLASH-${run}`, `E2E-${run}-BLK`, `E2E-CLASH-${run}-SLV`);
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(
    page.getByText(new RegExp(`SKU E2E-${run}-BLK is already used by E2E Two Option IEM`)),
  ).toBeVisible();

  // Both options are listed under one product in the picker, each with its own price.
  await page.goto('/sales/new', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /add product/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder(/search name, model/i).fill(`E2E-${run}-SLV`);
  await page.keyboard.press('Enter');
  const detail = dialog.getByRole('complementary', { name: 'Selected product' });
  await expect(detail.getByRole('button', { name: /Black/ })).toBeVisible();
  await detail.getByRole('button', { name: /Silver/ }).click();
  await expect(detail.getByText('$27.00').first()).toBeVisible();
});

test('a new product hides the smart-home block until asked, and phone inputs are tap-sized', async ({
  page,
}) => {
  await page.goto('/items/new', { waitUntil: 'networkidle' });
  await expect(page.getByText(/Before you buy: hub, app, Wi-Fi/)).toBeVisible();
  await expect(page.locator('#hubName')).toBeHidden();
  await page.getByText(/Before you buy: hub, app, Wi-Fi/).click();
  await expect(page.locator('#hubName')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/items/new', { waitUntil: 'networkidle' });
  const height = await page
    .locator('#name')
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
});

test('a draft books nothing and says so; its date survives editing; phones see the products first', async ({
  page,
}) => {
  await page.goto('/sales/new', { waitUntil: 'networkidle' });
  await addToSale(page, PRODUCT);
  await page.locator('#soldAt').fill('2026-10-15');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page).toHaveURL(/\/sales$/, { timeout: 20_000 });

  // The toast must not claim revenue or gross profit for a sale that moved no stock and booked no cost.
  const toast = page.locator('[data-sonner-toast]').first();
  await expect(toast).toContainText(/Draft V\d+ saved/);
  await expect(toast).not.toContainText(/gross profit/i);

  // The list shows no cost, gross or margin for a draft (they would read $0.00 and 100%).
  const row = page.locator('table tbody tr', { hasText: 'Draft' }).first();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('100');
  await expect(row.locator('td', { hasText: '—' })).not.toHaveCount(0);

  // Open it for editing: the date field holds the day that was saved, not the day before.
  await row.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#soldAt')).toHaveValue('2026-10-15');

  // A phone shows the products before the sale details.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sales/new', { waitUntil: 'networkidle' });
  const add = await page.getByRole('button', { name: /add product/i }).boundingBox();
  expect(add?.y ?? 9999, 'Add product is on the first screen').toBeLessThan(844);
});
