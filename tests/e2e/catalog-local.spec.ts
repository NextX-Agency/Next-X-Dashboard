import { expect, type Page, test } from '@playwright/test';

/**
 * The redesigned catalogue against the disposable rehearsal database loaded with the SYNTHETIC variant
 * fixture AND the price fixture (scripts/rehearsal/variant-fixture.sql, price-fixture.sql). Nothing here
 * writes to the database; the cart lives in the browser.
 *
 *   E2E_VARIANT_FIXTURE=1 E2E_PRICE_FIXTURE=1 E2E_BASE_URL=http://localhost:3000 \
 *     pnpm exec playwright test --project=public catalog-local
 *
 * "KZ Duo (price fixture)": Graphite SRD 3,000, Pearl SRD 1,500, both in stock. "KZ ZSN Pro 2" is a
 * real single-option product (the Quick Add case); "KZ Test IEM" has three options (Choose options).
 */
test.skip(
  process.env.E2E_VARIANT_FIXTURE !== '1' ||
    process.env.E2E_PRICE_FIXTURE !== '1' ||
    !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL ?? ''),
  'needs E2E_VARIANT_FIXTURE=1, E2E_PRICE_FIXTURE=1, a localhost E2E_BASE_URL and both fixtures loaded',
);

const cards = (page: Page) => page.locator('section[aria-label="Products"] article');
const cardNamed = (page: Page, name: string | RegExp) =>
  cards(page).filter({ has: page.getByRole('link', { name }) });
const CART_KEY_PREFIX = 'nextly-store-cart:v1:';

async function names(page: Page): Promise<string[]> {
  return cards(page).evaluateAll((nodes) =>
    nodes.map((node) => node.querySelector('a')?.textContent?.trim() ?? ''),
  );
}

test.describe('price filter is variant-aware', () => {
  test('a colour and a price range apply to the SAME option', async ({ page }) => {
    // Graphite costs SRD 3,000. Pearl, the cheapest option, costs SRD 1,500 and is inside the range.
    await page.goto('/shop?colour=Graphite&min=1000&max=2000', { waitUntil: 'networkidle' });
    expect(await names(page)).not.toContain('KZ Duo (price fixture)');

    await page.goto('/shop?colour=Pearl&min=1000&max=2000', { waitUntil: 'networkidle' });
    const pearl = cardNamed(page, 'KZ Duo (price fixture)');
    await expect(pearl).toContainText('Pearl');
    await expect(pearl).toContainText('SRD 1,500');
    await expect(pearl).not.toContainText('SRD 3,000');

    await page.goto('/shop?colour=Graphite&min=2500&max=3500', { waitUntil: 'networkidle' });
    const graphite = cardNamed(page, 'KZ Duo (price fixture)');
    await expect(graphite).toContainText('Graphite');
    await expect(graphite).toContainText('SRD 3,000');
    await expect(graphite.getByRole('link').first()).toHaveAttribute(
      'href',
      /variant=KZ-DUO-GPH/,
    );
  });

  test('price with stock and with an option, and a range outside every price, give a clear answer', async ({
    page,
  }) => {
    await page.goto('/shop?colour=Pearl&availability=in-stock&min=1400&max=1600', {
      waitUntil: 'networkidle',
    });
    expect(await names(page)).toContain('KZ Duo (price fixture)');
    await page.goto('/shop?colour=Pearl&availability=in-stock&min=2000', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByText('Nothing found')).toBeVisible();
    await page.goto('/shop?min=99999', { waitUntil: 'networkidle' });
    await expect(page.getByText('Nothing found')).toBeVisible();
  });

  test('a range with no colour matches any option in it; a reversed range is swapped; junk is ignored', async ({
    page,
  }) => {
    await page.goto('/shop?min=1400&max=1600', { waitUntil: 'networkidle' });
    expect(await names(page)).toContain('KZ Duo (price fixture)');
    const forward = await names(page);
    await page.goto('/shop?min=1600&max=1400', { waitUntil: 'networkidle' });
    expect(await names(page)).toEqual(forward);
    await page.goto('/shop?min=abc&max=%25%25', { waitUntil: 'networkidle' });
    expect((await names(page)).length).toBeGreaterThan(10);
  });

  test('an old price-tier link still works and means the same range', async ({ page }) => {
    await page.goto('/shop?price=under-50', { waitUntil: 'networkidle' });
    const prices = await cards(page).evaluateAll((nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    );
    expect(prices.length).toBeGreaterThan(0);
    for (const text of prices) {
      const match = text.match(/SRD ([\d,]+)/);
      expect(Number(match?.[1]?.replace(/,/g, ''))).toBeLessThan(500);
    }
  });
});

test.describe('price control and filter history (desktop sidebar)', () => {
  test('type a range, apply, see the chip, clear it; Back and Forward restore the fields', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const sidebar = page.getByRole('complementary', { name: 'Filters' });
    await sidebar.getByLabel('Min').fill('1000');
    await sidebar.getByLabel('Max').fill('2000');
    await sidebar.getByRole('button', { name: 'Apply price' }).click();
    await expect(page).toHaveURL(/min=1000/);
    await expect(page).toHaveURL(/max=2000/);
    await expect(
      page.getByRole('button', { name: 'Remove filter: SRD 1,000 – 2,000' }),
    ).toBeVisible();

    // A second filter, then Back: the address and the fields return to the range alone.
    await page.getByRole('button', { name: 'Remove filter: SRD 1,000 – 2,000' }).waitFor();
    await sidebar.getByRole('button', { name: /^KZ/ }).first().click();
    await expect(page).toHaveURL(/brand=kz/);
    await page.goBack();
    await expect(page).not.toHaveURL(/brand=kz/);
    await expect(sidebar.getByLabel('Min')).toHaveValue('1000');
    await page.goForward();
    await expect(page).toHaveURL(/brand=kz/);

    await page
      .getByRole('link', { name: 'Clear filters' })
      .or(page.getByRole('button', { name: 'Clear all' }))
      .first()
      .click();
    await expect(page).not.toHaveURL(/min=|max=|brand=/);
    await expect(sidebar.getByLabel('Min')).toHaveValue('');
  });

  test('a one-tap range sets both fields, and opening a product then going Back keeps the filters', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const sidebar = page.getByRole('complementary', { name: 'Filters' });
    await sidebar.getByRole('button', { name: 'SRD 1,000 – 2,000' }).click();
    await expect(page).toHaveURL(/min=1000&max=2000|max=2000&min=1000/);
    await expect(sidebar.getByLabel('Max')).toHaveValue('2000');
    await cards(page).first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/products\//);
    await page.goBack();
    await expect(page).toHaveURL(/min=1000/);
    await expect(sidebar.getByLabel('Min')).toHaveValue('1000');
  });
});

test.describe('product cards: Quick Add and Choose options', () => {
  test('a one-option product adds from the card; a choice product only opens its page', async ({
    page,
  }) => {
    await page.goto('/shop?q=zsn', { waitUntil: 'networkidle' });
    const zsn = cardNamed(page, 'KZ ZSN Pro 2');
    await expect(zsn.getByText('Choose options')).toHaveCount(0);
    const add = zsn.getByRole('button', { name: 'Add KZ ZSN Pro 2 to cart' });
    await add.click();
    await expect(add).toContainText('Added');
    await expect(page).toHaveURL(/\/shop\?q=zsn$/); // the button did not navigate

    await page.goto('/shop?q=test+iem', { waitUntil: 'networkidle' });
    const iem = cardNamed(page, /KZ Test IEM/);
    await expect(iem).toContainText('3 options');
    // No stock label and no fake button: an available product says nothing about stock.
    await expect(iem).not.toContainText(/In stock|left/);
    await expect(iem.getByRole('button')).toHaveCount(0);
    // The whole card is the link: a click on the photograph's area opens the page.
    await iem.click({ position: { x: 150, y: 140 } });
    await expect(page).toHaveURL(/\/products\/kz-test-iem/);
  });

  test('mouse and keyboard both add, and the cart holds the right line', async ({ page }) => {
    await page.goto('/shop?q=zsn', { waitUntil: 'networkidle' });
    const add = cardNamed(page, 'KZ ZSN Pro 2').getByRole('button', {
      name: 'Add KZ ZSN Pro 2 to cart',
    });
    await add.click();
    await add.focus();
    await expect(add).toBeFocused();
    await page.keyboard.press('Enter');
    await page.goto('/cart', { waitUntil: 'networkidle' });
    const line = page.locator('article', { hasText: 'KZ ZSN Pro 2' });
    await expect(line).toContainText('SRD 1,500 each');
    await expect(line).toContainText('KZ-ZSN-PRO-2');
    await expect(page.getByText('Estimated total').locator('..')).toContainText('SRD 3,000');
    // It survives a refresh.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('article', { hasText: 'KZ ZSN Pro 2' })).toBeVisible();
  });

  test('stock is respected: the button stops when every unit is in the cart', async ({
    page,
  }) => {
    await page.goto('/shop?q=as16', { waitUntil: 'networkidle' });
    const card = cardNamed(page, 'KZ AS16 Pro X');
    const add = card.getByRole('button', { name: /Add KZ AS16 Pro X to cart/ });
    await add.click(); // 2 in stock
    await expect(add).toContainText('Added');
    await expect(add).toBeEnabled({ timeout: 4000 });
    await add.click();
    await expect(card.getByRole('button', { name: /Add KZ AS16 Pro X to cart/ })).toBeDisabled({
      timeout: 4000,
    });
    await expect(card.getByRole('button', { name: /Add KZ AS16 Pro X to cart/ })).toContainText(
      'All stock in cart',
    );
  });

  test.describe('on a phone, by touch', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('tapping Add to cart adds without opening the product, and the button is tap-sized', async ({
      page,
    }) => {
      await page.goto('/shop?q=zsn', { waitUntil: 'networkidle' });
      const add = cardNamed(page, 'KZ ZSN Pro 2').getByRole('button', {
        name: 'Add KZ ZSN Pro 2 to cart',
      });
      const box = await add.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await add.tap();
      await expect(add).toContainText('Added');
      await expect(page).toHaveURL(/\/shop\?q=zsn$/);
    });

    test('the filters sheet takes a price range and a price preset', async ({ page }) => {
      await page.goto('/shop', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /^Filters/ }).tap();
      const sheet = page.getByRole('dialog', { name: 'Filters' });
      await sheet.getByRole('button', { name: 'Up to SRD 500' }).tap();
      await expect(page).toHaveURL(/max=500/);
      await sheet.getByRole('button', { name: 'Show results' }).tap();
      await expect(
        page.getByRole('button', { name: 'Remove filter: Up to SRD 500' }),
      ).toBeVisible();
      for (const price of await cards(page).evaluateAll((nodes) =>
        nodes.map((node) => node.textContent ?? ''),
      )) {
        expect(Number(price.match(/SRD ([\d,]+)/)?.[1]?.replace(/,/g, ''))).toBeLessThanOrEqual(
          500,
        );
      }
    });
  });
});

test.describe('search', () => {
  test('words in any order and spacing find the model; the best match leads', async ({
    page,
  }) => {
    for (const [query, expected] of [
      ['kz pro 2', 'KZ ZSN Pro 2'],
      ['ZSN', 'KZ ZSN Pro 2'],
      ['zs 10', 'KZ ZS10 PRO X'],
      ['zs-10', 'KZ ZS10 PRO X'],
      ['KZ-ZSN-PRO-2', 'KZ ZSN Pro 2'],
      ['m vave', 'M-Vave SWS12 Wireless IEM System'],
    ] as const) {
      await page.goto(`/shop?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle' });
      expect(await names(page), query).toContain(expected);
    }
    await page.goto('/shop?q=zsn', { waitUntil: 'networkidle' });
    expect((await names(page))[0]).toBe('KZ ZSN Pro 2');
    await page.goto('/shop?q=cable', { waitUntil: 'networkidle' });
    expect((await names(page))[0]).toMatch(/Cable/);
  });

  test('special characters are searched literally and never break the page', async ({
    page,
  }) => {
    for (const query of ['50%', 'a_b', "o'neil", '"quoted"', '\\', '<b>x</b>', '😀']) {
      const response = await page.goto(`/shop?q=${encodeURIComponent(query)}`, {
        waitUntil: 'networkidle',
      });
      expect(response?.status(), query).toBe(200);
      await expect(page.getByText('Nothing found')).toBeVisible();
    }
  });

  test('a misspelling offers the right word, and taking it finds the product', async ({
    page,
  }) => {
    await page.goto('/shop?q=essgaer', { waitUntil: 'networkidle' });
    await expect(page.getByText('Nothing found')).toBeVisible();
    await page.getByRole('link', { name: 'essager', exact: true }).click();
    await expect(page).toHaveURL(/q=essager/);
    expect((await names(page)).some((name) => /ESSAGER/.test(name))).toBe(true);
  });

  test('a search with results sorts by best match, and the sort can be changed', async ({
    page,
  }) => {
    await page.goto('/shop?q=kz', { waitUntil: 'networkidle' });
    await expect(page.getByLabel('Sort by')).toHaveValue('relevance');
    await page.getByLabel('Sort by').selectOption('price-asc');
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(page).toHaveURL(/q=kz/);
  });
});

test.describe('images that are missing or broken', () => {
  test('a card whose photograph will not load shows a placeholder, not a broken icon', async ({
    page,
  }) => {
    await page.route(/\/_next\/image\?.*kz-zsn-pro-2/, (route) =>
      route.fulfill({ status: 404, body: 'gone' }),
    );
    await page.goto('/shop?q=zsn', { waitUntil: 'networkidle' });
    const card = cardNamed(page, 'KZ ZSN Pro 2');
    await expect(
      card.getByRole('img', { name: /No photograph available for KZ ZSN Pro 2/ }),
    ).toBeVisible();
  });
});

test.describe('the cart copes with change', () => {
  async function addZsn(page: Page) {
    await page.goto('/shop?q=zsn', { waitUntil: 'networkidle' });
    await cardNamed(page, 'KZ ZSN Pro 2')
      .getByRole('button', { name: 'Add KZ ZSN Pro 2 to cart' })
      .click();
  }

  test('a price that changed after the item went in is replaced by the current price', async ({
    page,
  }) => {
    await addZsn(page);
    await page.evaluate((prefix) => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix)) continue;
        const lines = JSON.parse(localStorage.getItem(key) ?? '[]');
        for (const line of lines) line.priceCents = 100;
        localStorage.setItem(key, JSON.stringify(lines));
      }
    }, CART_KEY_PREFIX);
    await page.goto('/cart', { waitUntil: 'networkidle' });
    const line = page.locator('article', { hasText: 'KZ ZSN Pro 2' });
    await expect(line).toContainText('SRD 1,500 each');
    await expect(page.getByText('Estimated total').locator('..')).toContainText('SRD 1,500');
    await expect(page.getByText(/SRD 1 each/)).toHaveCount(0);
  });

  test('a product that is no longer available blocks the order and says why', async ({
    page,
  }) => {
    await addZsn(page);
    await page.evaluate((prefix) => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix)) continue;
        const lines = JSON.parse(localStorage.getItem(key) ?? '[]');
        for (const line of lines) line.variantId = '00000000-0000-4000-8000-0000000000ff';
        localStorage.setItem(key, JSON.stringify(lines));
      }
    }, CART_KEY_PREFIX);
    await page.goto('/cart', { waitUntil: 'networkidle' });
    await expect(page.getByText(/no longer available/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Adjust unavailable items/ })).toBeDisabled();
    await expect(page.getByRole('link', { name: /Send order via WhatsApp/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Remove KZ ZSN Pro 2/ }).click();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
  });

  test('the WhatsApp message names the option, quantity, prices and total', async ({
    page,
  }) => {
    await page.goto('/products/kz-test-iem?variant=KZ-TEST-IEM-PRP', {
      waitUntil: 'networkidle',
    });
    await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await page.goto('/cart', { waitUntil: 'networkidle' });
    const href = await page
      .getByRole('link', { name: /Send order via WhatsApp/ })
      .getAttribute('href');
    const text = decodeURIComponent(
      new URL(href ?? '', 'https://wa.me').searchParams.get('text') ?? '',
    );
    expect(text).toContain('KZ Test IEM');
    expect(text).toContain('Purple');
    expect(text).toContain('KZ-TEST-IEM-PRP');
    expect(text).toContain('1 × SRD 1,700 = SRD 1,700');
    expect(text).toContain('Estimated total: SRD 1,700');
    expect(text).toContain('Stock is only reserved once the shop confirms');
  });
});

test.describe('product page gallery and identity', () => {
  test('arrow keys move between photographs, on the page and in the enlarged view', async ({
    page,
  }) => {
    await page.goto('/products/kz-test-iem', { waitUntil: 'networkidle' });
    await expect(page.getByText('1 / 3')).toBeVisible();
    const enlarge = page.getByRole('button', { name: /Enlarge photo of KZ Test IEM/ });
    await enlarge.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('2 / 3')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('1 / 3')).toBeVisible();

    await enlarge.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Photo 1 of 3');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText('Photo 2 of 3', { exact: false })).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(enlarge).toBeFocused();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('a swipe turns the photograph; a vertical drag does not', async ({ page }) => {
      await page.goto('/products/kz-test-iem', { waitUntil: 'networkidle' });
      await expect(page.getByText('1 / 3')).toBeVisible();
      const drag = (from: [number, number], to: [number, number]) =>
        page.evaluate(
          ([[x1, y1], [x2, y2]]) => {
            const el = document.querySelector('div.touch-pan-y') as HTMLElement;
            const touch = (x: number, y: number) =>
              new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
            el.dispatchEvent(
              new TouchEvent('touchstart', {
                bubbles: true,
                touches: [touch(x1, y1)],
                changedTouches: [touch(x1, y1)],
              }),
            );
            el.dispatchEvent(
              new TouchEvent('touchend', {
                bubbles: true,
                touches: [],
                changedTouches: [touch(x2, y2)],
              }),
            );
          },
          [from, to] as [[number, number], [number, number]],
        );
      await drag([300, 200], [100, 205]);
      await expect(page.getByText('2 / 3')).toBeVisible();
      await drag([100, 200], [300, 195]);
      await expect(page.getByText('1 / 3')).toBeVisible();
      await drag([200, 300], [205, 100]); // mostly vertical: the page scrolling
      await expect(page.getByText('1 / 3')).toBeVisible();
    });
  });

  test('model and SKU are shown, and the SKU follows the chosen option', async ({ page }) => {
    await page.goto('/products/kz-test-iem', { waitUntil: 'networkidle' });
    await expect(page.getByText('Model KZT-1 · SKU KZ-TEST-IEM-BLK')).toBeVisible();
    await page.getByRole('button', { name: /^Purple/ }).click();
    await expect(page.getByText('Model KZT-1 · SKU KZ-TEST-IEM-PRP')).toBeVisible();
  });
});
