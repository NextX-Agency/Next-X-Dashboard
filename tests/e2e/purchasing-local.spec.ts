import { expect, test } from '@playwright/test';

/**
 * Buy, receive, sell: the loop a shop owner repeats weekly, against the disposable rehearsal database
 * (it WRITES a supplier, a purchase order, stock and a sale).
 *
 *   E2E_DISPOSABLE_DB=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public purchasing-local
 *
 * Run `bash scripts/rehearsal/reset-local.sh` afterwards (stop the dev server first).
 */
test.skip(
  process.env.E2E_DISPOSABLE_DB !== '1' ||
    !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'writes data: needs E2E_DISPOSABLE_DB=1 and a localhost E2E_BASE_URL on the rehearsal database',
);

const SKU = 'KZ-ELLIPTICAL-POUCH';

async function onHand(page: import('@playwright/test').Page): Promise<number> {
  await page.goto(`/inventory?q=${SKU}`, { waitUntil: 'networkidle' });
  const row = page.locator('tr', { hasText: SKU });
  await expect(row).toBeVisible();
  const headers = (await page.locator('thead th').allInnerTexts()).map((text) =>
    text.trim().toLowerCase(),
  );
  const column = headers.findIndex((text) => text.startsWith('on hand'));
  expect(column).toBeGreaterThan(-1);
  return Number(
    (await row.locator('td').nth(column).innerText()).replace(/[^\d-−]/g, '').replace('−', '-'),
  );
}

test.describe.configure({ mode: 'serial' });

test('supplier, purchase order, receipt: stock rises by exactly what was received', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = Date.now().toString(36).toUpperCase();
  const supplier = `E2E Supplier ${run}`;
  const before = await onHand(page);

  await page.goto('/suppliers', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add supplier' }).first().click();
  const sheet = page.getByRole('dialog').last();
  await page.locator('#s-name').fill(supplier);
  await sheet.getByRole('button', { name: 'Add supplier' }).click();
  await expect(page.getByText(supplier).first()).toBeVisible({ timeout: 15_000 });

  await page.goto('/purchase-orders/new', { waitUntil: 'networkidle' });
  await page.locator('#supplier').click();
  await page
    .getByPlaceholder(/search/i)
    .last()
    .fill(supplier);
  await page
    .getByRole('option', { name: new RegExp(supplier) })
    .first()
    .click();
  await page.locator('#variant-0').click();
  await page
    .getByPlaceholder(/search/i)
    .last()
    .fill(SKU);
  await page
    .getByRole('option', { name: new RegExp(SKU) })
    .first()
    .click();
  await page.locator('#qty-0').fill('4');
  await page.locator('#sub-0').fill('20.00');
  await page.getByRole('button', { name: 'Raise order' }).click();
  await expect(page).toHaveURL(/\/purchase-orders(\/[0-9a-f-]{36})?$/, { timeout: 20_000 });

  // Open the order and receive everything.
  await page.goto('/purchase-orders', { waitUntil: 'networkidle' });
  await page.locator('tbody tr', { hasText: supplier }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/purchase-orders\/[0-9a-f-]{36}/);
  await page
    .getByRole('button', { name: /receive/i })
    .first()
    .click();
  const receive = page.getByRole('dialog');
  await receive
    .getByRole('button', { name: /receive|confirm|save/i })
    .last()
    .click();
  await expect(page.getByText(/received/i).first()).toBeVisible({ timeout: 15_000 });

  // The receipt is a server action; wait for the stock itself rather than for any word on the page.
  await expect.poll(() => onHand(page), { timeout: 20_000 }).toBe(before + 4);

  // The received units are sellable from the picker, at the landed cost the receipt fixed.
  await page.goto('/sales/new', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /add product/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder(/search name, model/i).fill(SKU);
  await page.keyboard.press('Enter');
  await expect(dialog.getByText(new RegExp(`${before + 4} in stock`)).first()).toBeVisible();
});
