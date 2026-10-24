// Mobile audit for the staff dashboard. Opens every route in a phone viewport and reports, per page:
//   - horizontal overflow  (document.scrollingElement.scrollWidth must be <= innerWidth)
//   - fixed chrome         (height of position:fixed/sticky bars pinned to the top and bottom, at rest)
//   - top bar after scroll (where the header sits after scrolling down 600px; it should have hidden itself)
//   - tap-target offenders (visible interactive elements smaller than 44x44 CSS px; inline links inside running text are
//                           counted separately because WCAG 2.2 exempts them)
//   - form text below 16px (iOS Safari zooms into those on focus)
//   - console errors
//
//   node scripts/design-review/mobile-audit.mjs <baseUrl> [--routes=/a,/b] [--widths=375x812,360x640] [--dark]
//        [--engine=chromium|webkit] [--shots=<dir>] [--details] [--verbose] [--font=2]
//
// --details  also audits one detail page found by following the first link of each list page
// --verbose  prints every tap-target offender
//
// Needs a signed-in session: against the local rehearsal database the auth hook signs the browser in as the owner,
// so run it against `pnpm exec next dev` only. It is read-only: it never submits anything.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit } from '@playwright/test';

const args = process.argv.slice(2);
const baseUrl = args.find((a) => !a.startsWith('--'));
if (!baseUrl) {
  console.error(
    'usage: mobile-audit.mjs <baseUrl> [--routes=...] [--widths=WxH,...] [--dark] [--engine=] [--shots=dir] [--details] [--verbose]',
  );
  process.exit(2);
}
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);

const DEFAULT_ROUTES = [
  '/dashboard', '/sales', '/sales/new', '/orders', '/orders/new', '/customers', '/quotes',
  '/items', '/items/new', '/bundles', '/categories', '/price-lists', '/inventory', '/reorder',
  '/suppliers', '/purchase-orders', '/purchase-orders/new', '/finance', '/finance/transactions',
  '/finance/reconciliation', '/ledger', '/wallets', '/invoices', '/obligations', '/expenses',
  '/expenses/recurring', '/commissions', '/exchange-rates', '/reconciliation', '/reports',
  '/activity', '/owners', '/storefront', '/storefront/collections', '/storefront/homepage',
  '/storefront/restock', '/storefronts', '/settings',
];
// Detail pages are found by following the first matching link of the list page.
const DETAIL_FROM = [
  ['/sales', '^/sales/(?!new)[0-9a-f-]{8,}'],
  ['/orders', '^/orders/(?!new)[0-9a-f-]{8,}'],
  ['/customers', '^/customers/[0-9a-f-]{8,}'],
  ['/items', '^/items/(?!new)[0-9a-f-]{8,}'],
  ['/purchase-orders', '^/purchase-orders/(?!new)[0-9a-f-]{8,}'],
  ['/suppliers', '^/suppliers/[0-9a-f-]{8,}'],
];

const routes = flag('routes')?.split(',') ?? DEFAULT_ROUTES;
const sizes = (flag('widths') ?? '375x812').split(',').map((s) => {
  const [width, height] = s.split('x').map(Number);
  return { width, height };
});
const dark = has('dark');
const shots = flag('shots');
const engine = (flag('engine') ?? 'chromium') === 'webkit' ? webkit : chromium;
const fontScale = Number(flag('font') ?? 1);

if (shots) await mkdir(shots, { recursive: true });

/** Runs in the page. Returns the numbers for one route. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false; // sr-only, collapsed
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).display === 'none') return false;
    }
    return true;
  };
  const describe = (el) => {
    const label =
      el.getAttribute('aria-label') ||
      el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 28) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${label}"`;
  };

  const doc = document.scrollingElement ?? document.documentElement;
  const overflowPx = doc.scrollWidth - window.innerWidth;
  let widest = null;
  if (overflowPx > 0) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && visible(el)) {
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o !== 'visible' && p.getBoundingClientRect().right <= vw + 1) clipped = true;
        }
        if (!clipped) {
          widest = `${describe(el)} right=${Math.round(r.right)}`;
          break;
        }
      }
    }
  }

  // Pinned chrome: fixed or sticky bars that are in the viewport and wide.
  const chrome = { top: 0, bottom: 0, list: [] };
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.5 || r.height > vh * 0.6) continue;
    if (r.bottom <= 0 || r.top >= vh) continue;
    if (el.closest('[role="dialog"], [data-radix-popper-content-wrapper], [data-sonner-toaster], nextjs-portal')) continue;
    if (r.top <= 1) {
      chrome.top = Math.max(chrome.top, Math.round(r.bottom));
      chrome.list.push(`top:${Math.round(r.bottom)} ${describe(el)}`);
    } else if (r.bottom >= vh - 1) {
      chrome.bottom = Math.max(chrome.bottom, Math.round(vh - r.top));
      chrome.list.push(`bottom:${Math.round(vh - r.top)} ${describe(el)}`);
    }
  }

  // Tap targets.
  const selector =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="combobox"]';
  const small = [];
  const inline = [];
  const textUnder16 = [];
  for (const el of document.querySelectorAll(selector)) {
    if (!visible(el)) continue;
    if (el.closest('nextjs-portal')) continue;
    if (el.disabled) continue;
    let r = el.getBoundingClientRect();
    // A checkbox/radio is operated through its label when it has one.
    if (el.matches('input[type="checkbox"], input[type="radio"]')) {
      const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
      if (label && visible(label)) r = label.getBoundingClientRect();
    }
    if (el.matches('a[href]') && getComputedStyle(el).display === 'inline') {
      // Inline link in running text: exempt (WCAG 2.5.8), reported separately.
      if (r.height < 44 || r.width < 44) inline.push(describe(el));
      continue;
    }
    if (r.width < 43.5 || r.height < 43.5) {
      small.push(`${Math.round(r.width)}x${Math.round(r.height)} ${describe(el)}`);
    }
    if (el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]), select, textarea')) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) textUnder16.push(`${fs}px ${describe(el)}`);
    }
  }

  return { overflowPx, widest, chrome, small, inlineCount: inline.length, textUnder16, height: doc.scrollHeight };
}

const browser = await engine.launch();
const summary = [];

for (const size of sizes) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 140)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 140)}`));

  const list = [...routes];
  if (has('details')) {
    for (const [from, source] of DETAIL_FROM) {
      try {
        await page.goto(new URL(from, baseUrl).toString(), { waitUntil: 'networkidle', timeout: 90_000 });
        const href = await page.evaluate(
          (src) => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => new RegExp(src).test(h ?? '')),
          source,
        );
        if (href) list.push(href);
      } catch {
        /* the list page itself is audited (and reported) below */
      }
    }
  }

  for (const path of list) {
    errors.length = 0;
    let status = 0;
    try {
      const response = await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'networkidle', timeout: 90_000 });
      status = response?.status() ?? 0;
    } catch (error) {
      console.log(`${size.width}x${size.height} ${path} NAVIGATION FAILED ${String(error).slice(0, 100)}`);
      continue;
    }
    if (fontScale !== 1) await page.addStyleTag({ content: `html{font-size:${fontScale * 100}% !important}` });
    await page.waitForTimeout(450);
    const at0 = await page.evaluate(measure);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(600);
    const afterScroll = await page.evaluate(() => {
      const bars = [...document.querySelectorAll('header.app-topbar, body > header')].map((e) => Math.round(e.getBoundingClientRect().bottom));
      return Math.max(0, ...bars);
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(450);

    if (shots) {
      const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
      await page.screenshot({ path: join(shots, `${slug}-${size.width}${dark ? '-dark' : ''}.png`) });
    }

    const row = {
      size: `${size.width}x${size.height}`,
      path,
      status,
      overflowPx: at0.overflowPx,
      topChrome: at0.chrome.top,
      bottomChrome: at0.chrome.bottom,
      afterScroll,
      small: at0.small.length,
      inline: at0.inlineCount,
      text16: at0.textUnder16.length,
      errors: errors.length,
    };
    summary.push(row);
    console.log(
      `${row.size} ${path.padEnd(30)} ${status} overflow=${row.overflowPx} chrome=${row.topChrome}/${row.bottomChrome} afterScroll=${row.afterScroll} small=${row.small} inline=${row.inline} text<16=${row.text16} errors=${row.errors}`,
    );
    if (at0.widest) console.log(`    overflow culprit: ${at0.widest}`);
    if (has('verbose')) {
      for (const s of at0.small.slice(0, 60)) console.log(`    small: ${s}`);
      for (const s of at0.textUnder16.slice(0, 20)) console.log(`    text<16: ${s}`);
      for (const s of at0.chrome.list) console.log(`    pinned: ${s}`);
    }
    for (const e of errors.slice(0, 3)) console.log(`    ! ${e}`);
  }
  await context.close();
}
await browser.close();

if (shots) await writeFile(join(shots, 'summary.json'), JSON.stringify(summary, null, 2));
const bad = summary.filter((r) => r.overflowPx > 0 || r.status >= 400);
console.log(`\n${summary.length} page views, ${bad.length} with horizontal overflow or an error status.`);
console.log(`Total tap-target offenders: ${summary.reduce((n, r) => n + r.small, 0)}`);
