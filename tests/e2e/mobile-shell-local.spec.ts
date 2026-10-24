import { expect, type Page, test } from '@playwright/test';

/**
 * The staff dashboard on a phone, against the disposable local rehearsal database (the local auth
 * hook signs the browser in as the design-review owner).
 *
 *   E2E_BASE_URL=http://localhost:3142 pnpm exec playwright test --project=public mobile-shell-local
 *
 * Everything here only reads, except the last test, which records one sale and therefore also needs
 * E2E_DISPOSABLE_DB=1 (run `bash scripts/rehearsal/reset-local.sh` afterwards).
 */
test.skip(
  !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'needs a localhost E2E_BASE_URL on the rehearsal database',
);

const PHONE = { width: 375, height: 812 };

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} is on screen`).not.toBeNull();
  return box as NonNullable<typeof box>;
}

test.describe('phone shell', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('permanent chrome is a 48px top bar and one bottom bar', async ({ page }) => {
    await page.goto('/dashboard');
    const top = await boxOf(page, '.app-topbar');
    expect(top.y).toBe(0);
    expect(top.height).toBeLessThanOrEqual(52);

    const bar = page.getByRole('navigation', { name: 'Quick links' });
    await expect(bar).toBeVisible();
    for (const name of ['Overview', 'Sales', 'Sell', 'Inventory', 'Menu']) {
      await expect(bar.getByText(name, { exact: true })).toBeVisible();
    }
    // The page content starts below the top bar and is not covered by the bottom one.
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  });

  test('the top bar slides away on scroll down and returns on scroll up', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.chrome))
      .toBe('hidden');
    await expect
      .poll(async () => (await boxOf(page, '.app-topbar')).y, { timeout: 3000 })
      .toBeLessThan(-40);
    await page.mouse.wheel(0, -200);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.chrome))
      .toBe(undefined);
    await expect.poll(async () => (await boxOf(page, '.app-topbar')).y).toBe(0);
  });

  test('the drawer traps focus, closes on Escape, and closes when you navigate', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.getByRole('navigation', { name: 'Quick links' }).getByText('Menu').tap();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Tab never leaves the drawer.
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await page.getByRole('navigation', { name: 'Quick links' }).getByText('Menu').tap();
    await drawer.getByRole('button', { name: /^Money/ }).tap();
    await drawer.getByRole('link', { name: 'Expenses', exact: true }).tap();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(drawer).toBeHidden();
  });

  test('list filters collapse into one sheet with a count', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByPlaceholder(/search number/i)).toBeVisible();
    // Nothing but the search and the one button above the list.
    await expect(page.getByLabel('Status', { exact: true })).toBeHidden();
    const filters = page.getByRole('button', { name: /^Filters/ });
    await filters.tap();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    // A bottom sheet: it ends at the bottom of the screen.
    const box = await sheet.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(PHONE.height - 1);

    await sheet.getByLabel('Status', { exact: true }).selectOption({ label: 'Confirmed' });
    await expect(page).toHaveURL(/status=confirmed/);
    await sheet.getByRole('button', { name: 'Show results' }).tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: /^Filters 1/ })).toBeVisible();
  });

  test('a form sheet keeps its action footer on screen', async ({ page }) => {
    await page.goto('/expenses?new=1');
    const sheet = page.getByRole('dialog', { name: 'Log an expense' });
    await expect(sheet).toBeVisible();
    const submit = sheet.getByRole('button', { name: 'Log expense' });
    const box = await submit.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(47);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(PHONE.height);
    // Fields never trigger the iOS zoom.
    const size = await sheet
      .getByLabel('Description')
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test('no page scrolls sideways', async ({ page }) => {
    test.setTimeout(180_000);
    const routes = [
      '/dashboard',
      '/sales',
      '/sales/new',
      '/orders',
      '/orders/new',
      '/items',
      '/inventory',
      '/customers',
      '/purchase-orders',
      '/purchase-orders/new',
      '/invoices',
      '/ledger',
      '/reports',
      '/reorder',
      '/settings',
    ];
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => (document.scrollingElement?.scrollWidth ?? 0) - window.innerWidth,
      );
      expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  });

  test('the sale form keeps its total and Record button in a sticky footer', async ({
    page,
  }) => {
    await page.goto('/sales/new');
    // One fixed bar at the bottom: the form's, not the navigation's.
    await expect(page.getByRole('navigation', { name: 'Quick links' })).toBeHidden();
    const footer = page.locator('[data-hides-tabbar]');
    await expect(footer).toBeVisible();
    const box = await footer.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(PHONE.height - 1);
    await expect(footer.getByRole('button', { name: 'Record sale' })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Choose products' })).toBeVisible();
  });

  test('records a sale with the stepper and the footer button', async ({ page }) => {
    test.skip(
      process.env.E2E_DISPOSABLE_DB !== '1',
      'writes a sale: needs E2E_DISPOSABLE_DB=1',
    );
    test.setTimeout(120_000);
    await page.goto('/sales/new', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: /add product/i })
      .first()
      .tap();
    const picker = page.getByRole('dialog');
    await picker.getByPlaceholder(/search name, model/i).fill('ESSAGER');
    await picker
      .getByRole('button', { name: /ESSAGER/ })
      .first()
      .tap();
    await picker.getByRole('button', { name: 'Add to sale' }).tap();
    await picker.getByRole('button', { name: 'Done' }).tap();
    await expect(page.locator('#qty-0')).toHaveValue('1');
    await page.getByRole('button', { name: 'Increase quantity' }).first().tap();
    await expect(page.locator('#qty-0')).toHaveValue('2');
    await page
      .locator('[data-hides-tabbar]')
      .getByRole('button', { name: 'Record sale' })
      .tap();
    await expect(page).toHaveURL(/\/sales$/, { timeout: 30_000 });
  });
});

test.describe('desktop is unchanged', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the rail, the tables and the inline filters are still there', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Quick links' })).toBeHidden();
    await expect(page.getByRole('button', { name: /^Filters/ })).toBeHidden();
    await expect(page.getByLabel('Status', { exact: true })).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();
    const top = await boxOf(page, '.app-topbar');
    expect(top.height).toBe(56);
  });
});
