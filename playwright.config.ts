import { defineConfig, devices } from '@playwright/test';

/**
 * Closes the loop through the interface: this is what `pnpm e2e` runs,
 * making the script already declared in package.json true. See
 * tests/e2e/smoke.spec.ts for what it actually asserts.
 *
 * Point `E2E_BASE_URL` at a live isolated staging app to run authenticated
 * workflows. Without it, Playwright starts a local server on port 3100 and
 * only the unauthenticated public smoke tests run. Never reuse an arbitrary
 * server on port 3000 (which may belong to another application).
 */
const stagingBaseURL = process.env.E2E_BASE_URL;
const localPort = process.env.E2E_LOCAL_PORT ?? '3100';
const baseURL = stagingBaseURL ?? `http://127.0.0.1:${localPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // The spec mutates staging books — parallel workers would race for stock on
  // the same variant and fight over the transactional gapless document
  // counter (private.next_document_number). One worker keeps it simple and
  // correct rather than fast.
  fullyParallel: false,
  workers: 1,
  // A retry re-runs the staging mutations. Safe here because the spec is written to
  // be idempotent per run (a fresh SKU each time) and asserts deltas, never
  // global totals — see smoke.spec.ts.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'public',
      testMatch: /(?:public|store-local|store-a11y|dashboard-local|variants-local)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'smoke',
      testMatch: /(?:access|smoke|storefront)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/state.json' },
      dependencies: ['setup'],
    },
  ],
  // External staging is used only when explicitly configured. Local runs
  // always start a fresh, dedicated server and never reuse an unrelated app.
  webServer: stagingBaseURL
    ? undefined
    : {
        command: `pnpm dev --hostname 127.0.0.1 --port ${localPort}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
