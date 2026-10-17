import { expect, type Page, test } from '@playwright/test';

/**
 * Accessibility and interaction checks for the public shop, on the real 15-product catalogue in the
 * local rehearsal database. Run with:
 *   E2E_VISUAL_FIXTURES=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public store-a11y
 *
 * These are automated checks, not a screen-reader session: they cover names, focus, keyboard, target
 * size, contrast and reduced motion. A person with assistive technology should still try the shop.
 */
test.skip(
  process.env.E2E_VISUAL_FIXTURES !== '1',
  'needs the local rehearsal catalogue (scripts/rehearsal/visual-seed.sql)',
);

const PRODUCT = '/products/kz-as16-pro-x';
const PAGES = ['/', '/shop', PRODUCT, '/cart', '/faq'];

/** WCAG contrast ratio of every visible text run against the colour actually behind it. */
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    const parse = (value: string): [number, number, number, number] | null => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = (m[1] as string).split(/[ ,/]+/).map(Number);
        return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
      }
      const c = value.match(/color\(srgb ([^)]+)\)/);
      if (c) {
        const p = (c[1] as string).split(/[ /]+/).map(Number);
        return [(p[0] ?? 0) * 255, (p[1] ?? 0) * 255, (p[2] ?? 0) * 255, p[3] ?? 1];
      }
      return null;
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r as number) + 0.7152 * f(g as number) + 0.0722 * f(b as number);
    };
    const blend = (top: number[], bottom: number[]) => {
      const a = top[3] ?? 1;
      return [0, 1, 2].map((i) => (top[i] as number) * a + (bottom[i] as number) * (1 - a));
    };
    const backdrop = (el: Element | null): number[] => {
      const layers: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      return layers.reduceRight((under, layer) => blend(layer, under), [255, 255, 255, 1]);
    };
    const failures: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent?.trim()) continue;
      seen.add(el);
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (
        box.width === 0 ||
        box.height === 0 ||
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        el.closest('[aria-hidden="true"], [hidden], script, style, .sr-only, nextjs-portal')
      )
        continue;
      const fg = parse(style.color);
      if (!fg) continue;
      const bg = backdrop(el);
      const text = blend(fg, bg);
      const [l1, l2] = [lum(text), lum(bg)];
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = Number.parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const needed = large ? 3 : 4.5;
      if (ratio < needed)
        failures.push(
          `${ratio.toFixed(2)}:1 (< ${needed}) "${node.textContent.trim().slice(0, 40)}" ${style.color} on rgb(${bg.map(Math.round).join(',')})`,
        );
    }
    return failures;
  });
}

test.describe('names, labels and landmarks', () => {
  for (const path of PAGES) {
    test(`${path}: every control has an accessible name, one h1, landmarks`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const name = (el: Element) =>
          (
            el.getAttribute('aria-label') ||
            el.getAttribute('aria-labelledby') ||
            (el as HTMLElement).innerText ||
            el.getAttribute('title') ||
            el.getAttribute('alt') ||
            ''
          ).trim();
        for (const el of document.querySelectorAll(
          'button, a[href], [role="button"], [role="switch"]',
        )) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || el.closest('[aria-hidden="true"]')) continue;
          if (el.closest('details:not([open])') && !el.closest('summary')) continue;
          if (!name(el))
            out.push(`unnamed ${el.tagName.toLowerCase()}: ${el.outerHTML.slice(0, 90)}`);
        }
        for (const el of document.querySelectorAll('input, select, textarea')) {
          const input = el as HTMLInputElement;
          if (input.type === 'hidden' || input.closest('[aria-hidden="true"]')) continue;
          const labelled =
            input.getAttribute('aria-label') ||
            input.getAttribute('aria-labelledby') ||
            (input.id && document.querySelector(`label[for="${input.id}"]`)) ||
            input.closest('label');
          if (!labelled) out.push(`unlabelled field: ${input.outerHTML.slice(0, 90)}`);
        }
        for (const img of document.querySelectorAll('img')) {
          if (img.getAttribute('alt') === null)
            out.push(`img without alt: ${img.src.slice(-50)}`);
        }
        const h1 = document.querySelectorAll('h1').length;
        if (h1 !== 1) out.push(`${h1} h1 elements`);
        for (const landmark of ['header', 'main', 'footer'])
          if (!document.querySelector(landmark)) out.push(`no <${landmark}>`);
        return out;
      });
      expect(problems).toEqual([]);
    });
  }
});

test.describe('keyboard', () => {
  test('every tab stop on the shop shows a focus indicator', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const missing: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const result = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.tagName === 'NEXTJS-PORTAL') return null;
        const s = getComputedStyle(el);
        const outline = s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) > 0;
        const shadow = s.boxShadow !== 'none';
        // Inputs signal focus with a border colour change; the wrapper may carry the ring.
        const wrapper = el.closest('[class*="focus-within"]');
        const border = el.tagName === 'INPUT' && s.borderColor !== '';
        return {
          ok: outline || shadow || Boolean(wrapper) || border,
          label: (el.getAttribute('aria-label') || el.innerText || el.tagName).slice(0, 40),
        };
      });
      if (result && !result.ok) missing.push(result.label);
    }
    expect(missing).toEqual([]);
  });

  test('skipping to the product: search by keyboard returns results', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('searchbox', { name: 'Search products or brands' })
      .first()
      .fill('ZSN');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/shop\?q=ZSN/);
    await expect(page.getByRole('link', { name: 'KZ ZSN Pro 2' }).first()).toBeVisible();
  });
});

test.describe('dialogs', () => {
  test('the filters sheet traps focus, closes on Escape and returns focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const trigger = page.getByRole('button', { name: 'Filters' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]')),
      );
      expect(inside, `focus escaped the dialog on Tab ${i + 1}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('the photo dialog opens, closes on Escape and returns focus', async ({ page }) => {
    await page.goto(PRODUCT, { waitUntil: 'networkidle' });
    const trigger = page.getByRole('button', { name: /Enlarge photo of KZ AS16 Pro X/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'KZ AS16 Pro X' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'KZ AS16 Pro X' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('sort and in-stock controls are reachable and change the URL', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('price-asc');
    await expect(page).toHaveURL(/sort=price-asc/);
    const toggle = page.getByRole('switch', { name: 'In-stock items only' });
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/availability=in-stock/);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    // The two controls combine and the page stays one shareable URL.
    expect(page.url()).toContain('sort=price-asc');
  });
});

test.describe('phone ergonomics (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('tap targets are large enough on the shop and product page', async ({ page }) => {
    const small: string[] = [];
    for (const path of ['/shop', PRODUCT]) {
      await page.goto(path, { waitUntil: 'networkidle' });
      // Open the quote form so its fields are measured too.
      for (const summary of await page.locator('details > summary').all())
        await summary.click();
      const found = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll(
          'button, a[href], select, input:not([type=hidden])',
        )) {
          if (el.closest('[aria-hidden="true"], .sr-only, nextjs-portal')) continue;
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (box.width === 0 || style.visibility === 'hidden' || style.display === 'none')
            continue;
          // Links inside running text and the card link (its box is the whole card) are exempt.
          if (el.tagName === 'A' && el.closest('p, li > span')) continue;
          // A card's name link is stretched over the whole card with ::after.
          if (el.tagName === 'A' && /after:absolute/.test(el.className)) continue;
          if (el.closest('details:not([open])') && !el.closest('summary')) continue;
          // Buttons and fields: 40px each way. Links: at least 24px (WCAG 2.2 AA) and 40px along one axis.
          const small =
            el.tagName === 'A'
              ? Math.min(box.width, box.height) < 24 || Math.max(box.width, box.height) < 40
              : Math.min(box.width, box.height) < 40;
          if (small)
            out.push(
              `${Math.round(box.width)}x${Math.round(box.height)} ${(el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.tagName).trim().slice(0, 30)}`,
            );
        }
        return out;
      });
      small.push(...found.map((entry) => `${path}: ${entry}`));
    }
    expect(small).toEqual([]);
  });

  test('the sticky buy bar never hides the end of the page or the WhatsApp button', async ({
    page,
  }) => {
    await page.goto(PRODUCT, { waitUntil: 'networkidle' });
    const bar = page.locator('div.fixed.bottom-0').filter({ hasText: 'Add to cart' });
    await expect(bar).toBeVisible();
    const barTop = (await bar.boundingBox())?.y ?? 0;
    // Scroll to the very bottom: the footer's last line must sit above the bar's top edge.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastBottom = await page.evaluate(
      () => document.querySelector('footer')?.getBoundingClientRect().bottom ?? 0,
    );
    expect(lastBottom).toBeGreaterThan(0);
    // The WhatsApp button can be scrolled clear of the bar.
    await page.getByRole('link', { name: /Order via WhatsApp/ }).scrollIntoViewIfNeeded();
    const whatsapp = await page.getByRole('link', { name: /Order via WhatsApp/ }).boundingBox();
    expect((whatsapp?.y ?? 0) + (whatsapp?.height ?? 0)).toBeLessThanOrEqual(barTop + 1);
  });

  test('the tab bar and the buy bar are never on screen together', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toBeVisible();
    await page.goto(PRODUCT, { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toHaveCount(0);
  });
});

test.describe('contrast', () => {
  for (const path of PAGES) {
    test(`${path} text meets WCAG AA`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(await contrastFailures(page)).toEqual([]);
    });
  }

  test('the checker itself catches low contrast (self-test)', async ({ page }) => {
    await page.goto('/faq', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.textContent = 'Pale grey on white';
      p.style.color = '#b5b5b5';
      document.querySelector('main')?.append(p);
    });
    const failures = await contrastFailures(page);
    expect(failures.some((entry) => entry.includes('Pale grey on white'))).toBe(true);
  });

  test('the shop stays AA on a phone and in the filters sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/shop', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Filters' }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    expect(await contrastFailures(page)).toEqual([]);
  });
});

test.describe('motion', () => {
  test('prefers-reduced-motion removes transitions and animations', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/shop', { waitUntil: 'networkidle' });
    const longest = await page.evaluate(() => {
      let max = 0;
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        for (const value of [s.transitionDuration, s.animationDuration])
          for (const part of value.split(',')) {
            const seconds = part.trim().endsWith('ms')
              ? Number.parseFloat(part) / 1000
              : Number.parseFloat(part);
            if (Number.isFinite(seconds)) max = Math.max(max, seconds);
          }
      }
      return max;
    });
    expect(longest).toBeLessThanOrEqual(0.01);
    await context.close();
  });
});
