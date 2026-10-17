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
  await page.locator('#variant-0').click();
  await page
    .getByPlaceholder(/search/i)
    .last()
    .fill(PRODUCT);
  await page
    .getByRole('option', { name: new RegExp(PRODUCT) })
    .first()
    .click();
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
  await page.locator('#variant-0').click();
  await page
    .getByPlaceholder(/search/i)
    .last()
    .fill(PRODUCT);
  await page
    .getByRole('option', { name: new RegExp(PRODUCT) })
    .first()
    .click();
  await page.locator('#qty-0').fill(String(onHand + 1));
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
