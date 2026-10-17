// Lists the elements that stick out past the viewport on a page.
//   node scripts/design-review/overflow.mjs <baseUrl> <path> [width=390]
import { chromium } from '@playwright/test';

const [baseUrl, path, width = '390'] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(width), height: 844 } });
const page = await context.newPage();
await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'networkidle' });
const offenders = await page.evaluate((limit) => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const box = el.getBoundingClientRect();
    if (box.width && box.right > limit + 1) {
      const path = [];
      for (let n = el; n && n !== document.body && path.length < 4; n = n.parentElement)
        path.unshift(`${n.tagName.toLowerCase()}${n.className ? `.${String(n.className).split(' ').slice(0, 3).join('.')}` : ''}`);
      out.push(`${Math.round(box.right)}px  ${path.join(' > ')}`);
    }
  }
  return out;
}, Number(width));
console.log(offenders.slice(0, 15).join('\n') || 'no overflowing elements');
await browser.close();
