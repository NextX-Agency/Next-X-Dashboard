# NextX Dashboard 2.0: UAT and go-live readiness report

Date: 2026-11-08. Build under test: `d4e701a` plus 7 uncommitted fixes (listed in the Bug Register).
Environment: local production build (`next build` / `next start`, port 3200) against the disposable rehearsal Postgres. Nothing was run against production, and nothing was deployed, committed or pushed.

## 1. Executive summary

**Recommendation: NO-GO for production today.** The code is in good shape, but the repository's own release gates are still open and several kinds of coverage were not possible in this session.

- Six defects were found in the browser. None was P0. One is P1 (a data-integrity message problem on exchange rates), three are P2 and two are P3. All six are fixed and retested.
- Core money path verified in a browser: set an exchange rate, ring a quick sale, triple-click Pay (exactly one sale created), the ledger shows SRD 6,000 = $155.84 at 38.5, stock fell by 2; a purchase order received raised stock by 4 at $5 landed cost.
- Automated checks after the fixes: typecheck clean, lint clean, 760/760 unit tests pass, production build succeeds. Browser suites on the rebuilt app: 42 passed, 18 skipped (by design: they write data or need a flag), 2 failed (explained below; neither is a new defect from the fixes).
- Open production gates, taken from `docs/NEXTX_RELEASE_2026-10-18.md`, which I could not close from here: staging is not on this build, stock reconciliation is unsigned, a post-import backup restore is untested, the readiness report and migration rehearsal have not been re-run.

A GO would be based on assumptions about production data, backups and monitoring, so I am not giving one. **CONDITIONAL GO for deploying this build to staging** once the fixes are committed.

Assumption to confirm: I took "the application" to be NextX Dashboard 2.0 (shop plus staff dashboard). The agency site in `D:\Next-X-Agency` was not tested.

## 2. Test coverage

| Area | How tested | Result |
|---|---|---|
| Storefront (home, shop, filters, product, cart, 404) | Real Chromium via Playwright, scripted checks and e2e suites | Pass, one soft-404 finding (F-1) |
| Staff dashboard pages (overview, sales, orders, items, inventory, customers, purchasing, finance, reports, settings) | Browser, desktop and phone widths | Pass after fixes |
| POS quick sale, double-submit, today panel (view, receipt, refund, undo) | Browser | Pass after BUG-002 |
| Exchange rates, duplicate rate, ledger | Browser | Pass after BUG-004 |
| Purchase order create and receive, stock effect | Browser | Pass |
| CSV export links | Browser | Pass after BUG-005 |
| Roles: owner, staff, viewer (viewer refused on writes) | Browser by switching `members.role` in the rehearsal DB | Pass. Real Supabase sign-in was not exercised |
| Responsive: 375, 430, 768, 1366 | Chromium viewport emulation | No horizontal overflow after BUG-003. 1920 not systematically checked |
| Negative and edge cases (bad input, duplicate submit, unknown URLs) | Browser scripts | Pass except F-1 |
| Performance | Click-through 186-308 ms, document 56-206 ms locally | Local only, not a production figure |

Not covered, and not claimed: Firefox and Safari, real phones and tablets (emulation only), large data volumes, email delivery, image upload, real authentication providers, production monitoring and backups, 1920 width in depth. Several workflows were exercised only through the repo's e2e suites and not by hand: stock count, order confirm and fulfil, customer edit and delete, suppliers, expenses, wallets, price lists, bundles, quotes.

## 3. Bug register

| ID | Sev | Finding | Fix | Retest |
|---|---|---|---|---|
| BUG-001 | P2 | Overview showed the exchange-rate "since" date through server-timezone formatting, which can show the wrong day | Use the shared UTC `formatDate` in `src/app/(app)/dashboard/page.tsx` | Browser: overview date matches the rates list |
| BUG-002 | P2 | At 375px the sale-row buttons (View, Receipt, Refund, Undo) overflowed the card | `flex-wrap` in `src/components/pos/today-panel.tsx` | Browser at 375 and 430: no overflow, Undo visible |
| BUG-003 | P3 | Product form variant row clipped on narrow desktop widths; "Strategic stock" label wrapped | Grid columns and label placement in `src/components/forms/product-form.tsx` | Browser: no clipping |
| BUG-004 | P1 | Recording a second rate for the same date hit the unique constraint and the user got a generic failure, with no explanation | Same-day check with a clear message in `createFxRate` (`src/server/actions/finance.ts`) | Browser: message "A rate is already recorded for that date..." shown, dialog stays open, no duplicate row |
| BUG-005 | P2 | Export CSV link was prefetched, firing a file-generating request on page load | `prefetch={false}` in `src/components/patterns/export-csv-link.tsx` | Browser: no export request on load |
| BUG-006 | P3 | "View shop" links (opens a new tab) prefetched the storefront | `prefetch={false}` in `topbar.tsx` and `mobile-nav.tsx` | Browser: no prefetch request |

All fixes are uncommitted in the working tree.

## 4. UX findings (no changes made)

- F-1 (P2, SEO, not a go-live blocker): `/products/does-not-exist` answers HTTP 200 with `noindex`. It is a soft 404 caused by streaming under Cache Components. The repo's own e2e test expects a real 404 and fails against the production build. Search engines treat noindex soft-404s acceptably, but a proxy-level check would make it a true 404. Needs an owner decision.
- F-2 (P3, test-tooling only): on some storefront `/shop?...` navigations, Next's background prefetches of `/` and `/cart` keep Playwright's `networkidle` from settling (variants-local waits time out). Page loads themselves are fast. I did not change storefront prefetching because that would slow normal navigation; those tests should wait on a visible element instead.
- F-3 (test flake, not a defect): `mobile-shell-local` "a form sheet keeps its action footer" fails because it measures the button while the sheet is still sliding in. Once settled the button sits at y=800 in a 812px viewport. The test should wait for the animation to finish.
- The variants-local `img[alt*="Black"]` locator and the filters-local purchase-order test failures were treated as test-selector problems and not investigated further.

## 5. Technical validation

- `pnpm typecheck`: clean. `pnpm lint` (Biome): clean, 564 files. `pnpm test`: 87 files, 760 tests, all pass.
- `pnpm build` with placeholder self-hosted env: succeeds.
- Playwright (public project) on the rebuilt app: 42 passed, 18 skipped, 2 failed (F-1 and F-3 above).
- No console errors were seen in the flows exercised (page errors were captured in the retest scripts).
- Safe security checks only: viewer role refused on writes, owner-only actions gated, duplicate-submit produced one record. No attack traffic, no production access.

## 6. Deployment readiness

Do not deploy to production on this evidence. Before staging or production:

1. Commit the 7 fixes and get a fresh CI run.
2. Deploy to staging and rerun this smoke test there (the release doc says staging is not on this build).
3. Sign the stock reconciliation.
4. Restore a post-import backup to prove recovery.
5. Re-run the readiness report and migration rehearsal. The newest migration is 0048 (`member_privilege_guard`).
6. Decide on F-1.
7. Confirm rollback: redeploy the previous SHA (per the release doc).

Post-deploy smoke test to run once authorized: storefront home, shop, a product, cart; sign-in as owner; overview loads; one POS quick sale and refund on a test product; exchange-rate page; CSV export; viewer account cannot write.

## 7. Final verdict

**NO-GO for production.** Reason: the four owner-side release gates are open and cross-browser, real-device, backup and monitoring coverage is missing. **CONDITIONAL GO to deploy to staging**, conditional on committing the fixes and rerunning the smoke test there. The decision to deploy anything rests with you; I have not deployed.
