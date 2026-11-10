# Overnight release — 2026-11-10

Branch `claude/nextx-dashboard-transform-9kgdb1`, based on `nextx-dashboard-2.0` (the branch Vercel
builds for production). Everything here was checked on a disposable local database. No migration was
applied and no production row was written. Production was only read.

## 1. What was found about the setup

- **Production is NextX Dashboard 2.0**, not the Prisma/`main` code the repository's old `CLAUDE.md`
  describes. Vercel project `nextx-dashboard` builds `nextx-dashboard-2.0`; the live domain is
  `www.shop-nextx.com`; the production database is Supabase project `dpypzuxgzswfioqwcqae`. The
  production deployment became the 2.0 build on 2026-11-09 at about 17:49 UTC.
- Production holds real data: 188 sales, 356 sale lines, 167 payments, 526 ledger entries, 21 wallets,
  34 products, 10 customers, 1 member.
- Vercel **Preview** builds fail for every non-production branch: the Preview environment is missing
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, so `next.config.ts` throws. This is configuration, not code
  (PR #5's preview failed the same way). There is therefore **no staging deployment**; validation was local.
  Wiring previews to the production database was deliberately not done.

## 2. Changes in this branch

| Commit | Change | Evidence |
|---|---|---|
| `fix(reports)` | Cost of goods is read from sale lines when the sale header is zero; sales with revenue and no cost anywhere are counted and shown beside gross profit. The sales list uses the same cost. | DB test fails on the old SQL (cost 2,500 instead of 6,500) and passes on the new. Browser check at 390 px and 1440 px. |
| Merge of PR #5 | Orders status filter shows real statuses, sidebar reopens the group you navigate into, stale serial-number search results are dropped, Overview quick actions open the job directly. UI only. | 764 unit tests pass; PR's own browser checks; sweep below. |
| `perf(dashboard)` | The recharts cash-flow chart and the browser auth client load on demand. | Lighthouse below. |

### The gross-profit defect (the important one)

The historical import wrote each sale's line cost (`sale_items.cogs_cents`) but left the header
`sales.cogs_cents` and `sales.gross_profit_cents` at 0. The app sets the header to the sum of the lines
for every sale it records. Reports read the header, so on production all 188 sales showed no cost.

Computed read-only on production, all time:

| | Before | After |
|---|---|---|
| Revenue | $5,830.61 | $5,830.61 |
| Cost of goods | $0.00 | $2,358.54 |
| Gross profit | $5,830.61 (100.0%) | $3,472.07 (59.5%) |
| Sales with no cost recorded anywhere | not shown | 6 sales, $355.50 revenue, now flagged |

Gross profit is still a ceiling: those 6 sales are counted as pure profit until a cost is entered.

## 3. Decisions left for the owner (not done)

1. **Backfill the header cost.** `docs/proposals/sale-cost-header-backfill.sql` makes the stored header
   agree with the lines (customer totals, exports and `v_customer_totals` still read the header).
   It writes an audit table, is a dry run by default (`ROLLBACK`), and was exercised on the disposable
   database: dry run changes nothing, commit updates only sales whose lines carry cost, the documented
   `UPDATE` restores the old values exactly. It changes what the books say about historical profit,
   so it is not applied. Expected effect on production: 162 sales updated, cost +$2,358.54.
2. **Cost on the 6 uncosted sales** — only the owner knows it.
3. **POS stock location.** A POS sale with no location books its stock movement with a NULL location,
   which the system counts at the main location. The three branches therefore cannot be told apart for
   counter sales. This is by design today (`src/server/services/stock-adjust.ts`); decide whether the
   counter should carry the cashier's branch.
4. **Supabase Auth: leaked-password protection is off** (dashboard setting, advisor WARN).
5. Known and unchanged: 4 confirmed sales with no lines and 51 whose total differs from their lines
   (the documented legacy import discrepancies; 52 are already flagged `needs_review`).

## 4. Verification (disposable PostgreSQL 16, production build)

- `pnpm typecheck` clean; `pnpm lint` (Biome, 572 files) clean; `pnpm test` 764 passed, 5 skipped;
  `pnpm build` succeeds.
- POS Playwright suite: 10/10 with an exchange rate set (cash sale and change in USD and SRD, variant
  chips, discount and below-cost warning, a replayed idempotency key books once, part payment needs a
  customer and leaves the balance owed, offline blocks Pay and keeps the cart, cart survives refresh,
  no sideways scroll or small touch targets on phone and laptop).
- Responsive sweep: 11 pages (dashboard, POS, sales, items, inventory, customers, reports, finance,
  orders, purchase orders, shop) at 320, 375, 390, 430, 768, 1024 and 1440 px: 77/77 HTTP 200, no
  horizontal overflow, no console or page errors. Slowest local page load 337 ms.
- Production invariants (read-only SQL): no overpaid sales, no negative stock, no duplicate sale
  numbers, no orphan ledger reversals, no voided sale still holding stock, every confirmed payment has
  its ledger receipt. Wallet balances and stock are derived from the ledger and movements, so there is
  no stored balance to drift.
- Authorization, from code: every server action is built on `memberAction` / `writeAction`; staff API
  routes call `requireApiMember`. On the live site, an unauthenticated `/dashboard` serves the sign-in
  page. The unauthenticated API probes could not be read conclusively through the available fetch tool.

### Lighthouse (production build, local server, default mobile throttling: 4x CPU, Slow 4G)

| Page | Before | After |
|---|---|---|
| Dashboard, mobile | perf 72, LCP 5.0 s, TBT 380 ms | perf 85, LCP 3.4 s, TBT 270 ms |
| Dashboard, desktop | perf 98, LCP 1.1 s | perf 100, LCP 0.8 s |
| POS, mobile | perf 79, LCP 4.9 s, TBT 170 ms | unchanged |
| Sales, mobile | perf 79, LCP 4.7 s | unchanged |
| Shop, mobile | perf 87, LCP 4.0 s, TBT 50 ms, CLS 0 | unchanged |
| Shop, desktop | perf 99, LCP 0.9 s | unchanged |

Mobile LCP is **still above the 2.5 s budget** on the throttled profile for every page. Server time is
about 10 ms; the cost is React hydration and, on the POS, a lazy-loaded first product tile.
Next steps with the best return: prioritise the first row of POS tiles, and stop shipping zod and
supabase-js to the dashboard's first load. These are lab numbers on a local server, not production field data.

### Not verified, and why

- No staging deployment (Preview environment, see §1) and no run against real Supabase Auth.
- Browser specs on a freshly reset disposable database (production build):
  **passed** — every dashboard page loads with no console errors; record a sale (stock down, sale
  listed, cash receipt in the ledger); supplier → purchase order → receipt (stock rises by exactly the
  received quantity); log an expense (needs a classification, then appears in the list and ledger);
  the activity log; stock count (shows the difference before posting, refuses an empty count, posts the
  difference and the books then agree).
  **failed, not caused by this change** — "overselling is flagged" (a strict-mode locator matches the
  alert text twice next to three fixture alerts), "new order picker shows the option photograph"
  (fixture photographs are absent), "create a product with two options" (the spec's `getByLabel('Option',
  { exact: true })` no longer matches the accessible name `Option*`; the two option rows do render).
  **never ran** — two tests behind that serial failure ("a new product hides the smart-home block",
  "a draft books nothing") and the catalog-dashboard photograph/search/view-chip specs, which need
  fixture photographs. PR #5 reported the same failing set on its base commit.
  Those specs' behaviours are therefore **unverified in this release**.
- Not tested: Safari/Firefox, real phones, email, image upload, concurrent-sale load, refunds through
  the browser, large catalogs.

## 5. Release and rollback

- Production deploys from a push/merge to `nextx-dashboard-2.0`. No migration is included, so
  `/api/health` (`migrations: true`) is unaffected.
- Rollback: Vercel → promote/rollback to deployment `dpl_25CwNQ8AuZDoVhWWxE3QnE56ERZe`
  (`9c89d4b`, the build live before this release). Do not touch the database.
- After deploy: `/api/health` is `ready`; sign in; Reports shows the cost note and a gross margin near
  59.5% all-time; Overview chart appears; POS opens. Do not ring a real sale to test.
