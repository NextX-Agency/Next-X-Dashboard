import { expect, type Page, test } from '@playwright/test';

/**
 * The catalog and inventory screens on a phone and on a desktop, against the disposable local
 * rehearsal database (the local auth hook signs the browser in as the design-review owner).
 *
 *   E2E_BASE_URL=http://localhost:3161 pnpm exec playwright test --project=public catalog-dashboard
 *
 * Everything reads, except the last describe block, which changes a price (and undoes it) and posts
 * one stock count. It runs only with E2E_DISPOSABLE_DB=1; reset afterwards with
 * `bash scripts/rehearsal/reset-local.sh`.
 */
test.skip(
  !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'needs a localhost E2E_BASE_URL on the rehearsal database',
);

const DUO = '00000000-0000-4000-8000-000000000903';

/** Every product picture on the page either loaded or was replaced by a labelled placeholder. */
async function expectNoBrokenPictures(page: Page) {
  await page.waitForLoadState('networkidle');
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('[data-product-thumb] img')]
      .filter((image) => {
        const img = image as HTMLImageElement;
        return img.complete && img.naturalWidth === 0;
      })
      .map((image) => (image as HTMLImageElement).src),
  );
  expect(broken, 'pictures that failed to load and were not replaced').toEqual([]);
}

/** The table fits its frame: nothing is hidden behind a sideways scroll. */
async function expectTableFits(page: Page) {
  const fit = await page.evaluate(() => {
    const wrap = document.querySelector('div.nx-scrollx');
    return wrap ? { client: wrap.clientWidth, scroll: wrap.scrollWidth } : null;
  });
  expect(fit).not.toBeNull();
  expect(fit?.scroll).toBeLessThanOrEqual((fit?.client ?? 0) + 1);
}

test.describe('products list on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('shows photographs, quick views with counts, and does not scroll sideways', async ({
    page,
  }) => {
    await page.goto('/items');
    await expect(page.getByRole('heading', { name: 'Products', level: 1 })).toBeVisible();
    await expect(page.locator('[data-product-thumb]:visible').first()).toBeVisible();
    await expectNoBrokenPictures(page);

    const views = page.getByRole('navigation', { name: 'Saved views' });
    for (const name of [
      'All',
      'Low stock',
      'Out of stock',
      'Not published',
      'No photo',
      'No cost',
    ]) {
      await expect(views.getByRole('link', { name })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      376,
    );
  });

  test('a view chip opens the list it counts', async ({ page }) => {
    await page.goto('/items');
    const chip = page.getByRole('navigation', { name: 'Saved views' }).getByRole('link', {
      name: /^No photo/,
    });
    const count = Number((await chip.innerText()).replace(/\D/g, ''));
    await chip.click();
    await expect(page).toHaveURL(/images=missing/);
    await expect(
      page.getByText(`${count} ${count === 1 ? 'product' : 'products'}`),
    ).toBeVisible();
  });

  test('the Filters sheet carries the sort order', async ({ page }) => {
    await page.goto('/items');
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet.getByLabel('Sort by')).toBeVisible();
    await sheet.getByLabel('Sort by').selectOption('price:desc');
    await expect(page).toHaveURL(/sort=price/);
  });

  test('selecting rows brings up the bulk bar, which replaces the bottom navigation', async ({
    page,
  }) => {
    await page.goto('/items');
    await page.getByRole('button', { name: 'Select' }).click();
    const rows = page.locator(
      'li:has(> a[href^="/items/"]):not(:has(> a[href="/items/attention"])):visible',
    );
    await rows.nth(0).tap();
    await rows.nth(1).tap();
    const bar = page.getByRole('toolbar', { name: /Actions for 2 selected products/ });
    await expect(bar).toBeVisible();
    for (const name of [
      'Publish',
      'Unpublish',
      'Change price',
      'Category',
      'Archive',
      'Export CSV',
    ]) {
      await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('navigation', { name: 'Quick links' })).toBeHidden();
    await bar.getByRole('button', { name: 'Clear' }).click();
    await expect(bar).toBeHidden();
  });

  test('the bulk price sheet shows the new prices before anything changes', async ({
    page,
  }) => {
    await page.goto('/items');
    await page.getByRole('button', { name: 'Select' }).click();
    await page
      .locator('li:has(> a[href^="/items/"]):not(:has(> a[href="/items/attention"])):visible')
      .nth(0)
      .tap();
    await page
      .getByRole('toolbar', { name: /Actions for 1 selected/ })
      .getByRole('button', { name: 'Change price', exact: true })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Change price' });
    await sheet.getByLabel('Percent').fill('10');
    await expect(sheet.getByText(/prices? change/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Change \d+ price/ })).toBeEnabled();
    await sheet.getByLabel('Percent').fill('abc');
    await expect(sheet.getByText('Enter a positive number').last()).toBeVisible();
  });

  test('tapping a price opens a sheet with a labelled, 16 px field', async ({ page }) => {
    await page.goto('/items');
    await page
      .getByRole('button', { name: /^Change price of/ })
      .first()
      .tap();
    const sheet = page.getByRole('dialog');
    const field = sheet.getByRole('textbox').first();
    await expect(field).toBeVisible();
    expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});

test.describe('needs attention', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('lists each problem with a link that goes to the fix', async ({ page }) => {
    await page.goto('/items/attention');
    await expect(
      page.getByRole('heading', { name: 'Needs attention', level: 1 }),
    ).toBeVisible();
    const fix = page.getByRole('link', {
      name: /Add a photo|Enter the cost|Choose a category|Set the price/,
    });
    expect(await fix.count()).toBeGreaterThan(0);
    await expectNoBrokenPictures(page);
  });
});

test.describe('product screen', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('has the actions, the photographs and the sections', async ({ page }) => {
    await page.goto(`/items/${DUO}`);
    const actions = page.getByRole('toolbar', { name: /Actions for/ });
    await expect(actions).toBeVisible();
    for (const name of ['Adjust stock', 'Change price', 'Add to purchase order']) {
      await expect(actions.getByText(name)).toBeVisible();
    }
    await expect(page.getByRole('region', { name: /Photos of/ })).toBeVisible();
    await expectNoBrokenPictures(page);
    for (const section of [
      'Variants and stock',
      'Prices, cost and margin',
      'Stock movements',
    ]) {
      await expect(page.getByText(section, { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      376,
    );
  });

  test('the action row stays under the top bar while scrolling', async ({ page }) => {
    await page.goto(`/items/${DUO}`);
    await page.mouse.wheel(0, 1200);
    const box = await page.getByRole('toolbar', { name: /Actions for/ }).boundingBox();
    expect(box?.y ?? 999).toBeLessThan(80);
  });

  test('a fix link opens the section it points at', async ({ page }) => {
    await page.goto(`/items/${DUO}#edit`);
    await expect(page.locator('details#edit')).toHaveAttribute('open', '');
  });
});

test.describe('search', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('finds a product with its photograph, price and stock, and a sale by number', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Search or jump to/ }).tap();
    const input = page.getByRole('combobox', { name: 'Search' });
    await input.fill('kz duo');
    const option = page.getByRole('option', { name: /KZ Duo/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText('in stock');
    await expect(option.locator('[data-product-thumb]')).toBeVisible();
    await input.fill('v001');
    await expect(page.getByRole('option', { name: /V001/ })).toBeVisible();
  });

  test('keyboard: arrows move, Enter opens', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Search' }).fill('kz duo');
    await expect(page.getByRole('option', { name: /KZ Duo/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/items/${DUO}`));
  });
});

test.describe('stock count', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('counting a product shows the difference before anything is posted', async ({
    page,
  }) => {
    await page.goto('/inventory/count');
    await page.getByLabel(/Find a product/).fill('kz-duo');
    await page
      .getByRole('button', { name: /KZ Duo/ })
      .first()
      .tap();
    const counted = page.getByRole('textbox', { name: /^Counted:/ });
    await counted.fill('99');
    await expect(page.getByText(/more than the books say/)).toBeVisible();
    await page.getByRole('button', { name: 'Review count' }).last().tap();
    const sheet = page.getByRole('dialog', { name: 'Post this count?' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('to 99')).toBeVisible();
  });

  test('a count with nothing entered cannot be posted', async ({ page }) => {
    await page.goto('/inventory/count');
    await page.getByLabel(/Find a product/).fill('kz-duo');
    await page
      .getByRole('button', { name: /KZ Duo/ })
      .first()
      .tap();
    await expect(page.getByText(/Not counted yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review count' }).last()).toBeDisabled();
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('products table has the checkbox column, inline price and stock, and no sideways scroll', async ({
    page,
  }) => {
    await page.goto('/items');
    await expect(page.getByRole('columnheader', { name: 'Margin' })).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Select every row on this page' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Change price of/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Count stock of/ }).first()).toBeVisible();
    await expectNoBrokenPictures(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1441,
    );
  });

  test('inventory table at 1024 does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/inventory');
    await expect(page.getByRole('columnheader', { name: 'On hand' })).toBeVisible();
    await expectTableFits(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1025,
    );
  });
});

test.describe('changes (disposable database only)', () => {
  test.skip(process.env.E2E_DISPOSABLE_DB !== '1', 'writes to the rehearsal database');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a bulk price change can be undone from the toast', async ({ page }) => {
    await page.goto(`/items?q=${encodeURIComponent('KZ Duo')}`);
    const price = page.getByRole('button', { name: /^Change price of KZ Duo/ }).first();
    const before = await price.innerText();
    await page.getByRole('checkbox', { name: /^Select KZ Duo/ }).check();
    await page
      .getByRole('toolbar', { name: /Actions for 1 selected/ })
      .getByRole('button', { name: 'Change price', exact: true })
      .click();
    await page.getByLabel('Percent').fill('10');
    await page.getByRole('button', { name: /^Change \d+ price/ }).click();
    await expect(page.getByText(/prices? changed/).first()).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/Undone/)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: /^Change price of KZ Duo/ }).first(),
    ).toHaveText(before);
  });

  test('a stock count posts the difference and the books then agree', async ({ page }) => {
    await page.goto('/inventory/count');
    await page.getByLabel(/Find a product/).fill('kz-duo-gph');
    await page
      .getByRole('button', { name: /Graphite/ })
      .first()
      .click();
    const counted = page.getByRole('textbox', { name: /^Counted:/ });
    await counted.fill('5');
    await page.getByRole('button', { name: 'Review count' }).first().click();
    await page.getByRole('button', { name: 'Post count' }).click();
    await expect(page.getByText(/adjustments? posted|already matched/)).toBeVisible();
  });
});
