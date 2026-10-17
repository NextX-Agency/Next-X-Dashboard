// Fills the cart with two real products, then captures /cart at the three review widths.
//   node scripts/design-review/cart-shot.mjs <label> <baseUrl>
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [label = 'polish', baseUrl = 'http://localhost:3000'] = process.argv.slice(2);
const outDir = join('docs', 'design-review', label);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [name, width, height, mobile] of [
  ['390', 390, 844, true],
  ['768', 768, 1024, false],
  ['1440', 1440, 900, false],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  for (const [slug, clicks] of [
    ['kz-as16-pro-x', 1],
    ['kz-zsn-pro-2', 0],
  ]) {
    await page.goto(new URL(`/products/${slug}`, baseUrl).toString(), { waitUntil: 'networkidle' });
    for (let i = 0; i < clicks; i++)
      await page.getByRole('button', { name: 'Increase quantity' }).click();
    await page.getByRole('button', { name: 'Add to cart' }).last().click();
    await page.waitForTimeout(300);
  }
  await page.goto(new URL('/cart', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.getByLabel('Name', { exact: true }).fill('Ana Test');
  await page.getByLabel('Phone', { exact: true }).fill('+597 700 0000');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, `cart-filled-${name}.png`), fullPage: true });
  console.log(`cart ${name}px captured`);
  await context.close();
}
await browser.close();
