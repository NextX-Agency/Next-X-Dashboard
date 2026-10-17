// Renders pages at the three design-review widths and saves full-page PNGs.
//
//   node scripts/design-review/shoot.mjs <label> <baseUrl> <path>[,<path>...] [--dark]
//
// Output: docs/design-review/<label>/<slug>-<width>.png. Also prints horizontal
// overflow and console errors per page so layout bugs show up without eyeballing.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [label, baseUrl, pathList, ...flags] = process.argv.slice(2);
if (!label || !baseUrl || !pathList) {
  console.error('usage: shoot.mjs <label> <baseUrl> <path,path,...> [--dark]');
  process.exit(2);
}
const dark = flags.includes('--dark');
const fold = flags.includes('--fold');
const only = flags.find((f) => f.startsWith('--width='))?.slice(8);
const widths = [
  { width: 390, height: 844, name: '390', mobile: true },
  { width: 768, height: 1024, name: '768', mobile: false },
  { width: 1440, height: 900, name: '1440', mobile: false },
];
const outDir = join('docs', 'design-review', label);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
for (const size of widths.filter((w) => !only || w.name === only)) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    isMobile: size.mobile,
    hasTouch: size.mobile,
    colorScheme: dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  for (const path of pathList.split(',')) {
    const response = await page.goto(new URL(path, baseUrl).toString(), {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForTimeout(400);
    const slug = (path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home') + (dark ? '-dark' : '') + (fold ? '-fold' : '');
    await page.screenshot({ path: join(outDir, `${slug}-${size.name}.png`), fullPage: !fold });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(
      `${size.name}px ${path} -> ${response?.status()} overflowX=${overflow}px errors=${errors.length}`,
    );
    for (const e of errors.splice(0)) console.log(`   ! ${e}`);
  }
  await context.close();
}
await browser.close();
