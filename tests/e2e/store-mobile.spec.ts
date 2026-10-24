import { expect, type Page, test } from '@playwright/test';

/**
 * The shop on a phone: how much of the screen is permanently covered, that the header gets out of the
 * way while reading, that there is only ever one bar at the bottom, and that nothing scrolls sideways.
 * Needs the local rehearsal catalogue. Run with:
 *   E2E_VISUAL_FIXTURES=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public store-mobile
 */
test.skip(
  process.env.E2E_VISUAL_FIXTURES !== '1',
  'needs the local rehearsal catalogue (scripts/rehearsal/visual-seed.sql)',
);

const PRODUCT = '/products/kz-as16-pro-x';
const ROUTES = ['/', '/shop', PRODUCT, '/cart', '/faq', '/this-page-does-not-exist'];

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

/** Every fixed or sticky box that is on screen right now, with its edges. */
async function chrome(page: Page) {
  return page.evaluate(() => {
    const out: { name: string; top: number; bottom: number; position: string }[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const box = el.getBoundingClientRect();
      if (box.width < 100 || box.height < 20 || box.bottom <= 0 || box.top >= innerHeight)
        continue;
      if (el.closest('nextjs-portal')) continue;
      out.push({
        name: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`,
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        position: style.position,
      });
    }
    return out;
  });
}

const covered = (boxes: { top: number; bottom: number }[], height: number) => ({
  top: Math.max(0, ...boxes.filter((box) => box.top <= 1).map((box) => box.bottom)),
  bottom: Math.max(
    0,
    ...boxes.filter((box) => box.bottom >= height - 1).map((box) => height - box.top),
  ),
});

test.describe('how much screen the chrome covers', () => {
  for (const path of ['/', '/shop', PRODUCT, '/faq']) {
    test(`${path}: at most 56 px on top and one bar at the bottom`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      const boxes = await chrome(page);
      const { top, bottom } = covered(boxes, 812);
      expect(top).toBeLessThanOrEqual(56);
      // The buy bar: 48 px button, 8 px above and below, 1 px border.
      expect(bottom).toBeLessThanOrEqual(65);
      expect(
        boxes.filter((box) => box.bottom >= 811 && box.position === 'fixed'),
        'one fixed bar at the bottom edge',
      ).toHaveLength(1);
    });
  }

  test('the product page has the buy bar and no tab bar', async ({ page }) => {
    await page.goto(PRODUCT, { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toHaveCount(0);
    await expect(page.locator('.nx-buybar')).toBeVisible();
    await expect(
      page.locator('.nx-buybar').getByRole('button', { name: /Add to cart/ }),
    ).toBeVisible();
    await expect(
      page.locator('.nx-buybar').getByRole('link', { name: /WhatsApp/ }),
    ).toBeVisible();
  });

  test('the cart has one order bar and no tab bar once there is something in it', async ({
    page,
  }) => {
    await page.goto(PRODUCT, { waitUntil: 'networkidle' });
    await page.locator('.nx-buybar').getByRole('button', { name: 'Add to cart' }).click();
    await page.goto('/cart', { waitUntil: 'networkidle' });
    await expect(page.locator('.nx-checkout-bar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toHaveCount(0);
    const { bottom } = covered(await chrome(page), 812);
    expect(bottom).toBeLessThanOrEqual(80);
  });
});

test.describe('the header gets out of the way', () => {
  test('it hides on scroll down and returns on scroll up and at the top', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const header = page.locator('header.nx-header');
    const tabs = page.getByRole('navigation', { name: 'Quick navigation' });
    await expect(header).toBeInViewport({ ratio: 1 });

    await page.mouse.wheel(0, 700);
    await expect
      .poll(() => header.evaluate((el) => el.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(1);
    await expect
      .poll(() => tabs.evaluate((el) => el.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(811);

    await page.mouse.wheel(0, -120);
    await expect
      .poll(() => header.evaluate((el) => el.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(() => tabs.evaluate((el) => el.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(812);

    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => header.evaluate((el) => el.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() => header.evaluate((el) => el.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(0);
  });

  test('hiding it moves nothing (no layout shift)', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!entry.hadRecentInput) w.__cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: false });
    });
    for (const delta of [600, -200, 600, -300]) {
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(350);
    }
    expect(
      await page.evaluate(() => (window as unknown as { __cls: number }).__cls),
    ).toBeLessThan(0.01);
  });

  test('it stays while the search field has focus, and the field opens over the row', async ({
    page,
  }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const field = page.getByRole('searchbox', { name: 'Search products or brands' });
    await field.tap();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    const box = await field.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(250);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(400);
    expect(
      await page.locator('header.nx-header').evaluate((el) => el.getBoundingClientRect().top),
    ).toBeGreaterThanOrEqual(0);
    await page.getByRole('button', { name: 'Cancel' }).tap();
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  });
});

test.describe('small screens', () => {
  for (const [width, height] of [
    [360, 640],
    [375, 667],
    [390, 844],
    [412, 915],
    [812, 375],
  ] as const) {
    test(`no sideways scroll at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const path of ROUTES) {
        await page.goto(path, { waitUntil: 'networkidle' });
        const overflow = await page.evaluate(
          () => (document.scrollingElement?.scrollWidth ?? 0) - innerWidth,
        );
        expect(overflow, `${path} at ${width}x${height}`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('the shop toolbar sits under the header, and at the top once the header is gone', async ({
    page,
  }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const toolbar = page.locator('.nx-subbar');
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => toolbar.evaluate((el) => el.getBoundingClientRect().top))
      .toBeLessThanOrEqual(1);
    await page.mouse.wheel(0, -150);
    await expect
      .poll(() => toolbar.evaluate((el) => el.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(55);
  });

  test('fields are at least 16 px, so a phone does not zoom in', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
  });

  test('the filters sheet is a bottom sheet at most 85% of the screen', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    const box = await sheet.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(374);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(811);
    expect(box?.height ?? 0).toBeLessThanOrEqual(812 * 0.85 + 1);
  });
});
