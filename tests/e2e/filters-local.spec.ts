import { expect, type Page, test } from '@playwright/test';
import postgres from 'postgres';

/**
 * The photo picker on purchase orders, bundles and quotes, and the dashboard list filters (orders,
 * cash ledger, customers, expenses), against the disposable rehearsal database. Filter fixtures are
 * inserted straight into that database with a per-run marker; the pickers are driven through the UI
 * on the synthetic variant fixture ("KZ Test IEM": Black / Silver / Purple, each with its own photo).
 *
 *   psql <rehearsal db> -f scripts/rehearsal/variant-fixture.sql
 *   E2E_DISPOSABLE_DB=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public filters-local
 *
 * It WRITES rows (customers, orders, ledger entries, expenses, a bundle, a quote request). Run
 * `bash scripts/rehearsal/reset-local.sh` afterwards (stop the dev server first). It refuses to touch
 * any database other than the local rehearsal one.
 */
test.skip(
  process.env.E2E_DISPOSABLE_DB !== '1' ||
    !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'writes data: needs E2E_DISPOSABLE_DB=1 and a localhost E2E_BASE_URL on the rehearsal database',
);

const DB_URL =
  process.env.E2E_REHEARSAL_DB_URL ??
  'postgresql://postgres@127.0.0.1:55432/nextly_migration_rehearsal';
const run = Date.now().toString(36).toUpperCase();

test.describe.configure({ mode: 'serial' });

async function srcOf(locator: import('@playwright/test').Locator): Promise<string> {
  const src = (await locator.getAttribute('src')) ?? '';
  return decodeURIComponent(new URL(src, 'http://x').searchParams.get('url') ?? src);
}

/** In the open photo browser: find a product, open it, optionally pick an option and quantity, confirm. */
async function choose(
  page: Page,
  search: string,
  option: string | null,
  confirm: string,
  quantity?: number,
  beforeConfirm?: (dialog: import('@playwright/test').Locator) => Promise<void>,
) {
  const dialog = page.getByRole('dialog').last();
  await dialog.getByPlaceholder(/search name, model/i).fill(search);
  await dialog
    .getByRole('button', { name: new RegExp(search) })
    .first()
    .click();
  if (option) await dialog.getByRole('button', { name: new RegExp(option) }).click();
  if (quantity !== undefined)
    await dialog.getByLabel('Quantity', { exact: true }).fill(String(quantity));
  await beforeConfirm?.(dialog);
  await dialog.getByRole('button', { name: confirm }).click();
  return dialog;
}

test.describe('photo picker on purchase orders, bundles and quotes', () => {
  test('purchase order: lines show the option photograph, cost, merge and change', async ({
    page,
  }) => {
    await page.goto('/purchase-orders/new', { waitUntil: 'networkidle' });
    await expect(page.getByText('No products on this order yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add product' }).click();

    const dialog = await choose(page, 'KZ Test IEM', 'Silver', 'Add to order', 3, async (d) => {
      // A purchase order shows what you pay, not the shelf price (Silver: cost $15.00, list $32.00).
      await expect(d.getByText(/\$15\.00\s*reference cost/)).toBeVisible();
      await expect(d.getByText('$32.00')).toHaveCount(0);
    });
    await expect(dialog.getByText(/^Added 3 × KZ Test IEM/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // The line carries the SILVER photograph and SKU, and the quantity chosen in the browser.
    await expect(page.getByText(/KZ-TEST-IEM-SLV/).first()).toBeVisible();
    const photo = page.getByRole('img', { name: /KZ Test IEM.*Silver/ });
    expect(await srcOf(photo)).toContain('kz-vader');
    await expect(page.locator('#qty-0')).toHaveValue('3');

    // Change the product on the line to Black: the photograph follows.
    await page.getByRole('button', { name: /Change product/ }).click();
    await choose(page, 'KZ Test IEM', 'Black', 'Use this product');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await srcOf(page.getByRole('img', { name: /KZ Test IEM.*Black/ }))).toContain(
      'kz-castor-pro',
    );

    // Adding Black again adds to its line instead of repeating it.
    await page.getByRole('button', { name: 'Add another product' }).click();
    await choose(page, 'KZ Test IEM', 'Black', 'Add to order', 2);
    await page.keyboard.press('Escape');
    await expect(page.locator('#qty-0')).toHaveValue('3');
    await expect(page.locator('#qty-1')).toHaveCount(0);

    // Every row keeps an accessible name, and the line total field takes the real price.
    await page.locator('#sub-0').fill('45.00');
    await expect(page.getByText('$45.00').first()).toBeVisible();
  });

  test('bundle: components are chosen by photograph and saved', async ({ page }) => {
    await page.goto('/bundles', { waitUntil: 'networkidle' });
    await expect(page.getByText('No components yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add component' }).click();
    const dialog = await choose(page, 'KZ Test IEM', 'Purple', 'Add to bundle', 2);
    await expect(dialog.getByText(/^Added 2 × KZ Test IEM/)).toBeVisible();
    await page.keyboard.press('Escape');

    // Purple has no photograph of its own: the shared product photograph, never Black's or Silver's.
    expect(await srcOf(page.getByRole('img', { name: /KZ Test IEM.*Purple/ }))).toContain(
      'kz-zsn-pro-2',
    );
    await expect(page.locator('#bundle-quantity-0')).toHaveValue('2');

    await page.locator('#bundle-name').fill(`Filter Bundle ${run}`);
    await page.locator('#bundle-sku').fill(`BND-F-${run}`);
    await page.locator('#bundle-price').fill('30.00');
    await page.getByRole('button', { name: 'Save bundle' }).click();
    await expect(page.getByText('Bundle created')).toBeVisible();
    const saved = page.locator('div', { hasText: `BND-F-${run}` }).last();
    await expect(saved).toContainText('2× Purple');
  });

  test('quote: the product is chosen by photograph and fills the price', async ({ page }) => {
    const sql = postgres(DB_URL, { max: 1 });
    try {
      await sql`insert into quote_requests (name, contact, quantity) values (${`Quote Picker ${run}`}, 'qp@example.test', 2)`;
    } finally {
      await sql.end();
    }
    await page.goto(`/quotes?q=${encodeURIComponent(`Quote Picker ${run}`)}`, {
      waitUntil: 'networkidle',
    });
    const row = page.locator('tbody tr', { hasText: `Quote Picker ${run}` });
    await row.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Create quote' }).click();

    const sheet = page.getByRole('dialog').last();
    await expect(sheet.getByRole('button', { name: 'Create quote' })).toBeDisabled();
    await sheet.getByRole('button', { name: 'Choose a product' }).click();
    // The quantity comes from the request, so the browser does not ask for one.
    const picker = page.getByRole('dialog').last();
    await picker.getByPlaceholder(/search name, model/i).fill('KZ Test IEM');
    await picker
      .getByRole('button', { name: /KZ Test IEM/ })
      .first()
      .click();
    await picker.getByRole('button', { name: /Purple/ }).click();
    await expect(picker.getByLabel('Quantity', { exact: true })).toHaveCount(0);
    await picker.getByRole('button', { name: 'Use this product' }).click();

    const chosen = page.getByRole('dialog').last();
    expect(await srcOf(chosen.getByRole('img', { name: /KZ Test IEM.*Purple/ }))).toContain(
      'kz-zsn-pro-2',
    );
    await expect(chosen.getByLabel('Unit price (USD)')).toHaveValue('34.00');
    await expect(chosen.getByRole('button', { name: 'Create quote' })).toBeEnabled();

    // The dialog lives beside the row menu, so it survives the menu closing, and it submits.
    await chosen.getByRole('button', { name: 'Create quote' }).click();
    await expect(page.getByText('Secure quote link copied.')).toBeVisible();
  });
});

test.describe('dashboard list filters', () => {
  const ids: Record<string, string> = {};
  const cust = (letter: string) => `Filter ${letter} ${run}`;
  const order = (letter: string) => `ORD-F${run}${letter}`;

  test.beforeAll(async () => {
    const sql = postgres(DB_URL, { max: 1 });
    try {
      for (const letter of ['Alpha', 'Beta']) {
        const [row] = await sql`
          insert into customers (code, name) values (${`F${letter}${run}`}, ${cust(letter)})
          returning id`;
        ids[letter] = row?.id as string;
      }
      // number, customer, status (sale + workflow), total, paid, when (UTC)
      const orders: [string, string, string, string, number, number, string][] = [
        ['A', 'Alpha', 'confirmed', 'confirmed', 10000, 10000, '2026-03-10T12:00:00Z'],
        ['B', 'Beta', 'confirmed', 'confirmed', 20000, 5000, '2026-04-20T12:00:00Z'],
        // 01:00 UTC on the 5th is still the 4th in Suriname: the range compares the stored UTC day.
        ['C', 'Alpha', 'confirmed', 'confirmed', 3000, 0, '2026-05-05T01:00:00Z'],
        ['D', 'Beta', 'draft', 'draft', 1000, 0, '2026-05-06T12:00:00Z'],
      ];
      for (const [letter, customer, status, workflow, total, paid, when] of orders) {
        const [sale] = await sql`
          insert into sales (number, customer_id, status, workflow_status, total_cents, total_usd_cents, sold_at)
          values (${order(letter)}, ${ids[customer] as string}, ${status}::sale_status, ${workflow}::order_status, ${total}, ${total}, ${when})
          returning id`;
        if (paid > 0)
          await sql`insert into sale_payments (sale_id, amount_cents, received_at) values (${sale?.id as string}, ${paid}, ${when})`;
      }

      const wallet = async (name: string, currency: string) =>
        (
          await sql`select id from wallets where name = ${name} and currency = ${currency}::currency_code`
        )[0]?.id as string;
      const ledger: [string, string, string, string, number, number, string][] = [
        ['1', 'in', 'Bank', 'USD', 5000, 5000, '2026-03-10T12:00:00Z'],
        ['2', 'out', 'Cash', 'USD', 1200, 1200, '2026-04-20T12:00:00Z'],
        ['3', 'in', 'Bank', 'SRD', 20000, 1000, '2026-05-05T12:00:00Z'],
        ['4', 'out', 'Cash', 'SRD', 4000, 200, '2026-05-06T12:00:00Z'],
      ];
      for (const [n, direction, name, currency, amount, usd, when] of ledger) {
        await sql`
          insert into ledger_entries (direction, description, amount_cents, amount_usd_cents, currency, wallet_id, occurred_at)
          values (${direction}::ledger_direction, ${`FLEDGER ${run} ${n}`}, ${amount}, ${usd}, ${currency}::currency_code, ${await wallet(name, currency)}, ${when})`;
      }

      await sql`insert into expenses (description, occurred_at) values (${`FEXP ${run} early`}, '2026-03-10T12:00:00Z')`;
      await sql`insert into expenses (description, occurred_at) values (${`FEXP ${run} late`}, '2026-05-05T01:00:00Z')`;
    } finally {
      await sql.end();
    }
  });

  const rows = (page: Page) => page.locator('tbody');

  async function pick(page: Page, label: string, option: string) {
    await page.getByLabel(label, { exact: true }).selectOption({ label: option });
  }
  async function dates(page: Page, name: string, from: string, to: string) {
    await page.getByLabel(`${name} from`).fill(from);
    await page.getByLabel(`${name} to`).fill(to);
  }

  test('orders: customer, date range, payment status', async ({ page }) => {
    await page.goto(`/orders?q=${run}`, { waitUntil: 'networkidle' });
    for (const letter of ['A', 'B', 'C', 'D'])
      await expect(rows(page)).toContainText(order(letter));

    await pick(page, 'Customer', cust('Alpha'));
    await expect(page).toHaveURL(/customer=/);
    await expect(rows(page)).toContainText(order('A'));
    await expect(rows(page)).toContainText(order('C'));
    await expect(rows(page)).not.toContainText(order('B'));
    await expect(rows(page)).not.toContainText(order('D'));

    await pick(page, 'Customer', 'Customer'); // clear
    await expect(page).not.toHaveURL(/customer=/);
    await dates(page, 'Ordered', '2026-04-01', '2026-04-30');
    await expect(page).toHaveURL(/from=2026-04-01/);
    await expect(rows(page)).toContainText(order('B'));
    await expect(rows(page)).not.toContainText(order('A'));
    await expect(rows(page)).not.toContainText(order('C'));

    // The day is compared as stored (UTC): 01:00 UTC on May 5 belongs to May 5, in both directions.
    await dates(page, 'Ordered', '2026-05-05', '2026-05-05');
    await expect(rows(page)).toContainText(order('C'));
    await expect(rows(page)).not.toContainText(order('B'));
    await expect(rows(page)).not.toContainText(order('D'));
    await page.getByLabel('Ordered from').fill('');
    await page.getByLabel('Ordered to').fill('');
    await expect(page).not.toHaveURL(/from=/);

    await pick(page, 'Payment', 'Paid in full');
    await expect(rows(page)).toContainText(order('A'));
    await expect(rows(page)).not.toContainText(order('B'));
    await pick(page, 'Payment', 'Partly paid');
    await expect(rows(page)).toContainText(order('B'));
    await expect(rows(page)).not.toContainText(order('A'));
    await pick(page, 'Payment', 'Nothing paid');
    await expect(rows(page)).toContainText(order('C'));
    // A draft is not owed anything, so it is none of the three.
    await expect(rows(page)).not.toContainText(order('D'));
    await expect(rows(page)).not.toContainText(order('A'));

    // Filters combine, and nothing matching says so with a way back.
    await pick(page, 'Customer', cust('Beta'));
    await expect(page.getByText('No orders match these filters')).toBeVisible();
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(rows(page)).toContainText(order('D'));
  });

  test('cash ledger: date range, currency, wallet, type', async ({ page }) => {
    const entry = (n: string) => `FLEDGER ${run} ${n}`;
    await page.goto(`/ledger?q=${run}`, { waitUntil: 'networkidle' });
    for (const n of ['1', '2', '3', '4']) await expect(rows(page)).toContainText(entry(n));

    await pick(page, 'Type', 'Money out');
    await expect(page).toHaveURL(/type=out/);
    await expect(rows(page)).toContainText(entry('2'));
    await expect(rows(page)).toContainText(entry('4'));
    await expect(rows(page)).not.toContainText(entry('1'));
    await expect(rows(page)).not.toContainText(entry('3'));

    await pick(page, 'Currency', 'SRD');
    await expect(page).toHaveURL(/currency=SRD/);
    await expect(rows(page)).toContainText(entry('4'));
    await expect(rows(page)).not.toContainText(entry('2'));

    await pick(page, 'Type', 'Type'); // clear -> every SRD movement
    await expect(rows(page)).toContainText(entry('3'));
    await expect(rows(page)).toContainText(entry('4'));
    await expect(rows(page)).not.toContainText(entry('1'));

    await pick(page, 'Currency', 'Currency');
    await pick(page, 'Wallet', 'Bank (USD)');
    await expect(rows(page)).toContainText(entry('1'));
    await expect(rows(page)).not.toContainText(entry('3'));
    await pick(page, 'Wallet', 'Cash (SRD)');
    await expect(rows(page)).toContainText(entry('4'));
    await expect(rows(page)).not.toContainText(entry('1'));

    await pick(page, 'Wallet', 'Wallet');
    await dates(page, 'Moved', '2026-04-01', '2026-04-30');
    await expect(rows(page)).toContainText(entry('2'));
    await expect(rows(page)).not.toContainText(entry('1'));
    await expect(rows(page)).not.toContainText(entry('3'));
    await dates(page, 'Moved', '2026-05-06', '2026-05-06');
    await expect(rows(page)).toContainText(entry('4'));
    await expect(rows(page)).not.toContainText(entry('3'));
  });

  test('customers: last-order date range', async ({ page }) => {
    await page.goto(`/customers?q=${run}`, { waitUntil: 'networkidle' });
    await expect(rows(page)).toContainText(cust('Alpha'));
    await expect(rows(page)).toContainText(cust('Beta'));

    // Alpha last bought on May 5 (order C), Beta on April 20 (the May 6 order is only a draft).
    await dates(page, 'Last order', '2026-05-01', '2026-05-31');
    await expect(page).toHaveURL(/from=2026-05-01/);
    await expect(rows(page)).toContainText(cust('Alpha'));
    await expect(rows(page)).not.toContainText(cust('Beta'));

    await dates(page, 'Last order', '2026-04-01', '2026-04-30');
    await expect(rows(page)).toContainText(cust('Beta'));
    await expect(rows(page)).not.toContainText(cust('Alpha'));

    await dates(page, 'Last order', '2025-01-01', '2025-12-31');
    await expect(page.getByText('No customers match these filters')).toBeVisible();
  });

  test('expenses: date range', async ({ page }) => {
    await page.goto(`/expenses?q=${run}`, { waitUntil: 'networkidle' });
    await expect(rows(page)).toContainText(`FEXP ${run} early`);
    await expect(rows(page)).toContainText(`FEXP ${run} late`);

    await dates(page, 'Spent', '2026-05-05', '2026-05-05');
    await expect(page).toHaveURL(/from=2026-05-05/);
    await expect(rows(page)).toContainText(`FEXP ${run} late`);
    await expect(rows(page)).not.toContainText(`FEXP ${run} early`);

    await dates(page, 'Spent', '2026-03-01', '2026-03-31');
    await expect(rows(page)).toContainText(`FEXP ${run} early`);
    await expect(rows(page)).not.toContainText(`FEXP ${run} late`);

    await dates(page, 'Spent', '2024-01-01', '2024-01-31');
    await expect(page.getByText('No expenses match these filters')).toBeVisible();
  });
});
