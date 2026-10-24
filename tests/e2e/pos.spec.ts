import { expect, type Page, test } from '@playwright/test';

/**
 * The counter screen (/pos) against the disposable local rehearsal database. These WRITE rows (sales,
 * a customer), so they refuse to run unless the target is the rehearsal database and the operator
 * opts in. Never point them at staging or production.
 *
 *   E2E_DISPOSABLE_DB=1 E2E_BASE_URL=http://127.0.0.1:3151 pnpm exec playwright test --project=public pos
 *
 * The local rehearsal auth hook signs the browser in as the design-review owner. The tests leave
 * their sales behind (one is undone): run `bash scripts/rehearsal/reset-local.sh` afterwards.
 *
 * Stock is read from the product tiles themselves, so no other page is needed and the counts are
 * compared as before/after deltas, never as absolute numbers.
 */
test.skip(
  process.env.E2E_DISPOSABLE_DB !== '1' ||
    !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'writes data: needs E2E_DISPOSABLE_DB=1 and a localhost E2E_BASE_URL on the rehearsal database',
);

const POUCH = { name: 'KZ Elliptical Pouch', sku: 'KZ-ELLIPTICAL-POUCH', usd: '$5.19' };

async function openCounter(page: Page) {
  await page.goto('/pos', { waitUntil: 'networkidle' });
  await expect(page.getByLabel('Search products, or type or scan a SKU')).toBeVisible();
  // First paint is server HTML; the cart is restored from this device a moment after hydration.
  await expect(page.locator('#pos-cart')).toBeAttached();
}

const cartPanel = (page: Page) => page.getByRole('complementary', { name: 'Cart and payment' });

/** USD is always available; SRD needs an exchange rate, which a fresh rehearsal database lacks. */
async function chooseUsd(page: Page) {
  const usd = cartPanel(page).getByRole('button', { name: 'USD', exact: true });
  await usd.click();
  await expect(usd).toHaveAttribute('aria-pressed', 'true');
}

async function stockOnTile(page: Page, productName: string): Promise<number> {
  const tile = page.locator('[data-pos-tile]', { hasText: productName }).first();
  await expect(tile).toBeVisible();
  const text = await tile.innerText();
  const left = /(\d+) (?:in stock|left)/.exec(text);
  return left ? Number(left[1]) : 0;
}

test('cash sale in USD: a typed SKU, a quantity, change, a receipt link, stock down, then undo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCounter(page);
  await chooseUsd(page);
  const before = await stockOnTile(page, POUCH.name);
  expect(before).toBeGreaterThan(2);

  // Type the SKU and press Enter: the item goes straight into the cart.
  const search = page.getByLabel('Search products, or type or scan a SKU');
  await search.fill(POUCH.sku);
  await search.press('Enter');
  await expect(cartPanel(page).getByText(POUCH.name)).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: `Added ${POUCH.name}` }),
  ).toBeAttached();
  await expect(search).toHaveValue('');

  // "2x SKU" adds two more: three in all.
  await search.fill(`2x ${POUCH.sku}`);
  await search.press('Enter');
  await expect(cartPanel(page).getByLabel(`Quantity of ${POUCH.name}`)).toHaveValue('3');
  // The stepper takes one off: two.
  await cartPanel(page)
    .getByRole('button', { name: `Fewer ${POUCH.name}` })
    .click();
  await expect(cartPanel(page).getByLabel(`Quantity of ${POUCH.name}`)).toHaveValue('2');
  await expect(cartPanel(page).getByText('$10.38', { exact: true }).first()).toBeVisible();

  await cartPanel(page)
    .getByRole('button', { name: /^Charge \$10\.38/ })
    .click();
  await expect(cartPanel(page).getByText('Amount due')).toBeVisible();
  // Cash is the first wallet; hand over $20 and the change is worked out.
  await cartPanel(page).getByLabel('Received').fill('20');
  await expect(cartPanel(page).getByText('Change to give')).toBeVisible();
  await expect(cartPanel(page).getByText('$9.62', { exact: true })).toBeVisible();
  await cartPanel(page)
    .getByRole('button', { name: /^Pay \$10\.38 and record/ })
    .click();

  const recorded = cartPanel(page).getByRole('heading', { name: /Sale V\d+ recorded/ });
  await expect(recorded).toBeVisible({ timeout: 20_000 });
  const number = /V\d+/.exec(await recorded.innerText())?.[0] ?? '';
  await expect(cartPanel(page).getByText('$9.62', { exact: true })).toBeVisible();

  // The WhatsApp receipt carries the items, the total and the balance, with no emoji.
  const wa = cartPanel(page).getByRole('link', { name: /Send receipt on WhatsApp/ });
  const href = decodeURIComponent((await wa.getAttribute('href')) ?? '');
  expect(href).toContain('https://wa.me/?text=');
  expect(href).toContain(`Receipt ${number}`);
  expect(href).toContain(`2 x ${POUCH.name} @ $5.19: $10.38`);
  expect(href).toContain('Balance: 0 - paid in full');
  expect(href).not.toMatch(/\p{Extended_Pictographic}/u);

  // Stock went down by two (the tile is refreshed after the sale).
  await expect.poll(() => stockOnTile(page, POUCH.name), { timeout: 15_000 }).toBe(before - 2);

  // Today lists the sale with its takings.
  await page.getByRole('tab', { name: 'Today' }).click();
  const row = page.getByRole('listitem').filter({ hasText: number });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('$10.38')).toBeVisible();
  await page.getByRole('tab', { name: 'Quick sale' }).click();

  // Undo: the goods come back and the sale shows as voided.
  await cartPanel(page)
    .getByRole('button', { name: /^Undo this sale/ })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo sale' }).click();
  await expect(
    cartPanel(page).getByRole('heading', { name: `Sale ${number} undone` }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => stockOnTile(page, POUCH.name), { timeout: 15_000 }).toBe(before);
});

test('cash sale in SRD (when an exchange rate is set): whole-dollar prices and change', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openCounter(page);
  const srd = cartPanel(page).getByRole('button', { name: 'SRD', exact: true });
  test.skip(
    await srd.isDisabled(),
    'no exchange rate in this database, so SRD is switched off',
  );
  await srd.click();
  await expect(srd).toHaveAttribute('aria-pressed', 'true');

  const search = page.getByLabel('Search products, or type or scan a SKU');
  await search.fill(POUCH.sku);
  await search.press('Enter');
  // The USD list price converted at the rate and rounded to a whole SRD: no cents on the counter.
  const charge = cartPanel(page).getByRole('button', { name: /^Charge SRD [\d,]+$/ });
  await expect(charge).toBeVisible();
  const total = Number(/SRD ([\d,]+)/.exec(await charge.innerText())?.[1]?.replace(/,/g, ''));
  expect(total).toBeGreaterThan(100);
  await charge.click();
  await cartPanel(page).getByRole('textbox', { name: 'Received' }).fill('1000');
  await expect(
    cartPanel(page).getByText(`SRD ${(1000 - total).toLocaleString('en-GB')}`, { exact: true }),
  ).toBeVisible();
  await cartPanel(page)
    .getByRole('button', { name: /and record$/ })
    .click();
  const recorded = cartPanel(page).getByRole('heading', { name: /Sale V\d+ recorded/ });
  await expect(recorded).toBeVisible({ timeout: 20_000 });
  await cartPanel(page)
    .getByRole('button', { name: /^Undo this sale/ })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo sale' }).click();
  await expect(cartPanel(page).getByRole('heading', { name: /undone/ })).toBeVisible({
    timeout: 20_000,
  });
});

test('a product with options asks which one, with large chips', async ({ page }) => {
  await openCounter(page);
  await chooseUsd(page);
  await page.locator('[data-pos-tile]', { hasText: 'KZ Test IEM' }).first().click();
  const sheet = page.getByRole('dialog', { name: /KZ Test IEM/ });
  await expect(sheet).toBeVisible();
  const black = sheet.getByRole('button', { name: /Black/ });
  const box = await black.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await black.click();
  await expect(sheet).toBeHidden();
  await expect(cartPanel(page).getByText('KZ Test IEM')).toBeVisible();
  await expect(cartPanel(page).getByText('Black', { exact: true })).toBeVisible();
});

test('the cart survives a refresh, and a parked cart can be resumed', async ({ page }) => {
  await openCounter(page);
  await chooseUsd(page);
  const search = page.getByLabel('Search products, or type or scan a SKU');
  await search.fill(POUCH.sku);
  await search.press('Enter');
  await expect(cartPanel(page).getByText(POUCH.name)).toBeVisible();

  // Refresh: nothing is lost.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(cartPanel(page).getByText(POUCH.name)).toBeVisible();

  // Park it: the cart empties and the Parked button counts one.
  await page.getByRole('button', { name: /^Parked/ }).click();
  const parked = page.getByRole('dialog', { name: 'Parked carts' });
  await parked.getByLabel('Park the current cart').fill('Anna at the door');
  await parked.getByRole('button', { name: 'Park cart' }).click();
  await expect(cartPanel(page).getByText('The cart is empty')).toBeVisible();

  // The parked cart is still there after a refresh, and resumes.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Parked/ }).click();
  await expect(parked.getByText('Anna at the door')).toBeVisible();
  await parked.getByRole('button', { name: 'Resume' }).click();
  await expect(cartPanel(page).getByText(POUCH.name)).toBeVisible();
});

test('a price below cost is warned about, and a percent discount changes the total', async ({
  page,
}) => {
  await openCounter(page);
  await chooseUsd(page);
  const search = page.getByLabel('Search products, or type or scan a SKU');
  await search.fill(POUCH.sku);
  await search.press('Enter');
  const cart = cartPanel(page);
  await expect(cart.getByText(POUCH.name)).toBeVisible();

  // A typed price of $1.00 is under what the pouch cost: said in words, not blocked.
  await cart.getByRole('button', { name: /Change price of KZ Elliptical Pouch/ }).click();
  await cart.getByLabel(/^Price of KZ Elliptical Pouch/).fill('1');
  await cart.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(
    cart.getByText('This price is below cost: you would lose money.').first(),
  ).toBeVisible();
  await expect(cart.getByRole('button', { name: /^Charge \$1\.00/ })).toBeEnabled();

  // Back to the list price, then 10% off: $5.19 less $0.52.
  await cart.getByRole('button', { name: /Change price of KZ Elliptical Pouch/ }).click();
  await cart.getByRole('button', { name: 'List price' }).click();
  await expect(cart.getByText('This price is below cost')).toHaveCount(0);
  await cart.getByRole('button', { name: 'Add discount' }).click();
  await cart.getByRole('button', { name: '%', exact: true }).click();
  await cart.getByLabel('Discount percent').fill('10');
  await expect(cart.getByText('takes off $0.52')).toBeVisible();
  await expect(cart.getByRole('button', { name: /^Charge \$4\.67/ })).toBeEnabled();
});

test('a lost reply never books the sale twice: the same key is replayed and recognised', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCounter(page);
  await chooseUsd(page);
  const before = await stockOnTile(page, POUCH.name);
  const search = page.getByLabel('Search products, or type or scan a SKU');
  await search.fill(POUCH.sku);
  await search.press('Enter');
  await cartPanel(page)
    .getByRole('button', { name: /^Charge/ })
    .click();

  // The server records the sale, but the browser never hears back (a dropped connection).
  let dropped = false;
  await page.route('**/pos', async (route) => {
    const request = route.request();
    if (!dropped && request.method() === 'POST' && 'next-action' in request.headers()) {
      dropped = true;
      await route.fetch();
      await route.abort('connectionreset');
      return;
    }
    await route.continue();
  });
  await cartPanel(page)
    .getByRole('button', { name: /and record$/ })
    .click();
  await expect(
    cartPanel(page).getByText('We could not confirm that the sale was recorded.'),
  ).toBeVisible({
    timeout: 20_000,
  });

  // Pay again: the server finds the first sale by its key and books nothing more.
  await cartPanel(page)
    .getByRole('button', { name: /and record$/ })
    .click();
  await expect(
    cartPanel(page).getByRole('heading', { name: /Sale V\d+ was already recorded/ }),
  ).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => stockOnTile(page, POUCH.name), { timeout: 15_000 }).toBe(before - 1);

  // Tidy up: undo that one sale.
  await cartPanel(page)
    .getByRole('button', { name: /^Undo this sale/ })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo sale' }).click();
  await expect(cartPanel(page).getByRole('heading', { name: /undone/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => stockOnTile(page, POUCH.name), { timeout: 15_000 }).toBe(before);
});

test('a part payment needs a named customer, then leaves the balance owed', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCounter(page);
  await chooseUsd(page);
  const search = page.getByLabel('Search products, or type or scan a SKU');
  await search.fill(POUCH.sku);
  await search.press('Enter');
  await cartPanel(page)
    .getByRole('button', { name: /^Charge/ })
    .click();

  // Walk-in: paying less than the total is refused in words.
  await cartPanel(page).getByLabel('Received').fill('2');
  await expect(cartPanel(page).getByText(/Choose a customer to leave a balance/)).toBeVisible();
  await expect(cartPanel(page).getByRole('button', { name: /and record|owed/ })).toBeDisabled();

  // Add a customer from the cart, then record the part payment.
  await cartPanel(page).getByRole('button', { name: 'Cart' }).click();
  await cartPanel(page)
    .getByRole('button', { name: /Walk-in customer/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Customer' });
  await sheet.getByRole('button', { name: 'Add a new customer' }).click();
  await sheet.getByLabel('Name').fill('POS E2E Customer');
  await sheet.getByLabel('Phone').fill('812 3456');
  await sheet.getByRole('button', { name: 'Add and choose' }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });
  await expect(cartPanel(page).getByText('POS E2E Customer')).toBeVisible();

  await cartPanel(page)
    .getByRole('button', { name: /^Charge/ })
    .click();
  await cartPanel(page).getByLabel('Received').fill('2');
  await expect(cartPanel(page).getByText(/Paid now \$2\.00/)).toBeVisible();
  await cartPanel(page)
    .getByRole('button', { name: /^Record \$2\.00 now/ })
    .click();
  const recorded = cartPanel(page).getByRole('heading', { name: /Sale V\d+ recorded/ });
  await expect(recorded).toBeVisible({ timeout: 20_000 });
  await expect(cartPanel(page).getByText(/\$3\.19 still owed/)).toBeVisible();
  // The receipt goes to the customer's own number.
  const href =
    (await cartPanel(page)
      .getByRole('link', { name: /WhatsApp/ })
      .getAttribute('href')) ?? '';
  expect(href).toContain('https://wa.me/5978123456?text=');
  expect(decodeURIComponent(href)).toContain('Balance to pay: $3.19');
});

test('offline: a notice shows, Pay is off, and the cart is kept', async ({ page, context }) => {
  await openCounter(page);
  await chooseUsd(page);
  const search = page.getByLabel('Search products, or type or scan a SKU');
  await search.fill(POUCH.sku);
  await search.press('Enter');
  await cartPanel(page)
    .getByRole('button', { name: /^Charge/ })
    .click();
  await expect(cartPanel(page).getByRole('button', { name: /and record$/ })).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByText(/Offline\. Your cart is saved on this device/)).toBeVisible();
  await expect(cartPanel(page).getByRole('button', { name: /and record$/ })).toBeDisabled();

  await context.setOffline(false);
  await expect(page.getByText(/Offline\. Your cart is saved/)).toBeHidden();
  await expect(cartPanel(page).getByRole('button', { name: /and record$/ })).toBeEnabled();
});

for (const size of [
  { width: 360, height: 640, name: 'a small phone' },
  { width: 1440, height: 900, name: 'a laptop' },
]) {
  test(`no sideways scroll and big touch targets on ${size.name}`, async ({ browser }) => {
    const phone = size.width < 800;
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: phone,
      isMobile: phone,
      baseURL: process.env.E2E_BASE_URL,
    });
    const page = await context.newPage();
    await openCounter(page);

    const openCart = async () => {
      if (!phone) return;
      await page.locator('[data-pos-bar] button[aria-controls="pos-cart"]').click();
      await expect(cartPanel(page)).toBeVisible();
    };
    // On a phone the cart is a sheet: open it to pick the currency, close it to shop.
    await openCart();
    await chooseUsd(page);
    if (phone) {
      await cartPanel(page).getByRole('button', { name: 'Close the cart' }).click();
      await expect(cartPanel(page)).toBeHidden();
    }

    const search = page.getByLabel('Search products, or type or scan a SKU');
    await search.fill(POUCH.sku);
    await search.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /Added/ })).toBeAttached();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    if (phone) {
      // One bar at the foot, carrying the total; the bottom navigation has stepped aside.
      const bar = page.locator('[data-pos-bar]');
      await expect(bar).toBeVisible();
      await expect(bar.getByText('$5.19')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Quick links' })).toBeHidden();
    }
    await openCart();
    // Every control in the cart is at least 44px tall, and a tap target (not a text link) 44px wide.
    const small = await cartPanel(page).evaluate((panel) =>
      [...panel.querySelectorAll<HTMLElement>('button, input, select')]
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
        .map((el) => {
          const box = el.getBoundingClientRect();
          const label =
            el.getAttribute('aria-label') || el.textContent?.trim() || el.id || el.tagName;
          return { label, width: Math.round(box.width), height: Math.round(box.height) };
        })
        .filter((entry) => entry.width > 0 && entry.height < 44)
        .map((entry) => `${entry.label}: ${entry.width}x${entry.height}`),
    );
    expect(small).toEqual([]);
    await context.close();
  });
}
