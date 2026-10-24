// Drives the sale form on a phone viewport against the LOCAL disposable rehearsal database:
// add a product through the picker sheet, use the quantity stepper, open the customer picker sheet,
// check the sticky footer, and record the sale. It WRITES a sale, so it refuses to run anywhere
// but localhost.
//
//   node scripts/design-review/mobile-sale-flow.mjs http://localhost:3142 [--shots=<dir>] [--engine=webkit] [--no-submit]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit } from '@playwright/test';

const args = process.argv.slice(2);
const baseUrl = args.find((a) => !a.startsWith('--'));
if (!baseUrl || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  console.error('usage: mobile-sale-flow.mjs http://localhost:<port> [--shots=dir] [--engine=webkit] [--no-submit]');
  process.exit(2);
}
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const shots = flag('shots');
const engine = flag('engine') === 'webkit' ? webkit : chromium;
if (shots) await mkdir(shots, { recursive: true });

const browser = await engine.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
const shot = async (name) => shots && (await page.screenshot({ path: join(shots, `${name}.png`) }));
const step = (label) => console.log(`- ${label}`);

await page.goto(new URL('/sales/new', baseUrl).toString(), { waitUntil: 'networkidle' });
await shot('01-empty');

step('open the product picker');
await page.getByRole('button', { name: /add product/i }).first().tap();
const dialog = page.getByRole('dialog');
await dialog.waitFor();
await page.waitForTimeout(400);
await shot('02-picker');

step('search, open a product, add it');
await dialog.getByPlaceholder(/search name, model/i).fill('ESSAGER');
await page.waitForTimeout(300);
await dialog.getByRole('button', { name: /ESSAGER/ }).first().tap();
await page.waitForTimeout(300);
await shot('03-picker-detail');
await dialog.getByRole('button', { name: 'Increase quantity' }).tap();
await dialog.getByRole('button', { name: 'Add to sale' }).tap();
await dialog.getByText(/^Added /).waitFor();
await dialog.getByRole('button', { name: 'Done' }).tap();
await dialog.waitFor({ state: 'hidden' });

step('the line card and its stepper');
await page.waitForTimeout(300);
const qty = page.locator('#qty-0');
console.log('  quantity after the picker:', await qty.inputValue());
await page.getByRole('button', { name: 'Increase quantity' }).first().tap();
console.log('  quantity after tapping +:', await qty.inputValue());
await page.getByRole('button', { name: 'Decrease quantity' }).first().tap();
console.log('  quantity after tapping -:', await qty.inputValue());
await shot('04-line');

step('the sticky footer');
const footer = page.locator('[data-hides-tabbar]');
const box = await footer.boundingBox();
console.log('  footer box:', JSON.stringify(box), 'text:', (await footer.innerText()).replace(/\s+/g, ' '));
const tabbarDisplay = await page.evaluate(
  () => getComputedStyle(document.querySelector('.app-tabbar')).display,
);
console.log('  bottom tab bar display while the footer is up:', tabbarDisplay);

step('customer picker is a bottom sheet');
await page.locator('#customer').scrollIntoViewIfNeeded();
await page.locator('#customer').tap();
const sheet = page.getByRole('dialog');
await sheet.waitFor();
await page.waitForTimeout(400);
await shot('05-customer-sheet');
const sheetBox = await sheet.boundingBox();
console.log('  customer sheet box:', JSON.stringify(sheetBox));
await page.keyboard.press('Escape');
await sheet.waitFor({ state: 'hidden' });

if (!args.includes('--no-submit')) {
  step('record the sale from the footer');
  await footer.getByRole('button', { name: 'Record sale' }).tap();
  await page.waitForURL(/\/sales$/, { timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot('06-after-record');
  console.log('  landed on', new URL(page.url()).pathname);
}

const overflow = await page.evaluate(
  () => (document.scrollingElement?.scrollWidth ?? 0) - window.innerWidth,
);
console.log(`overflow=${overflow}px, console errors=${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  !', e);
await browser.close();
