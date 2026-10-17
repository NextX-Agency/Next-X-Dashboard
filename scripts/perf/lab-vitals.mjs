// Lab measurements of the public shop: LCP, CLS, TTFB, transferred JavaScript and image bytes.
//
//   node scripts/perf/lab-vitals.mjs <baseUrl> <path,path,...> [--runs=3]
//
// Profile: Pixel-class phone (390x844, DPR 2.6), 4x CPU slowdown, "Fast 4G" (9 Mbps down, 170 ms RTT).
// Run it against a PRODUCTION build (`next start`), never `next dev`. This is lab data from one machine:
// it finds regressions and large wins, it is not what real visitors on Surinamese networks experience.
// INP needs real interaction, so it is reported as the slowest of a few scripted taps, a rough proxy only.
import { chromium } from '@playwright/test';

const [baseUrl, pathList, ...flags] = process.argv.slice(2);
if (!baseUrl || !pathList) {
  console.error('usage: lab-vitals.mjs <baseUrl> <path,path,...> [--runs=3]');
  process.exit(2);
}
const runs = Number(flags.find((f) => f.startsWith('--runs='))?.slice(7) ?? 3);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const browser = await chromium.launch();
const rows = [];
for (const path of pathList.split(',')) {
  const samples = [];
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2.6,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 170,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    });
    await page.addInitScript(() => {
      window.__vitals = { lcp: 0, cls: 0, longest: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.__vitals.longest = Math.max(window.__vitals.longest, entry.duration);
      }).observe({ type: 'event', durationThreshold: 16, buffered: true });
    });
    let js = 0;
    let img = 0;
    const types = new Map();
    cdp.on('Network.responseReceived', (event) => types.set(event.requestId, event.type));
    cdp.on('Network.loadingFinished', (event) => {
      const type = types.get(event.requestId);
      if (type === 'Script') js += event.encodedDataLength;
      if (type === 'Image') img += event.encodedDataLength;
    });
    await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    // A few real taps for a rough interaction-latency figure.
    for (const selector of ['button[aria-label="Filters"], button:has-text("Filters")', 'button[role="switch"]']) {
      const target = page.locator(selector).first();
      if (await target.count()) {
        await target.tap().catch(() => {});
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
      }
    }
    const nav = await page.evaluate(() => {
      const [entry] = performance.getEntriesByType('navigation');
      return { ttfb: entry.responseStart, v: window.__vitals };
    });
    samples.push({ lcp: nav.v.lcp, cls: nav.v.cls, ttfb: nav.ttfb, inp: nav.v.longest, js, img });
    await context.close();
  }
  rows.push({
    path,
    lcp: Math.round(median(samples.map((s) => s.lcp))),
    cls: Number(median(samples.map((s) => s.cls)).toFixed(3)),
    ttfb: Math.round(median(samples.map((s) => s.ttfb))),
    inp: Math.round(median(samples.map((s) => s.inp))),
    jsKB: Math.round(median(samples.map((s) => s.js)) / 1024),
    imgKB: Math.round(median(samples.map((s) => s.img)) / 1024),
  });
}
await browser.close();
console.table(rows);
console.log('Targets: LCP <= 2500 ms, CLS <= 0.1, INP <= 200 ms. Lab only; median of', runs, 'runs.');
