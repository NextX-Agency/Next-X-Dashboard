# Old dashboard (`main`) vs Dashboard 2.0 — parity matrix, first pass

Dated 2026-10-17. Method: code, route and schema comparison between `D:/Next-X-Dashboard`
(`main`, 28a4d26, Prisma) and this branch (`nextx-dashboard-2.0`, 85e04b9, Drizzle).
**This is a static comparison. Nothing here was exercised against a running dashboard**, because no
authenticated session or local database was available (see `NEXTX_PROGRESS.md`). "Present" means the
code exists, not that the workflow was verified.

Status key: **M** migrated · **B** migrated but broken · **P** partial · **X** missing ·
**D** intentionally deprecated · **O** owner decision needed · **U** present in code, unverified at runtime.

| # | Old feature (route / model) | Business purpose | 2.0 equivalent | Status | Gap / action |
|---|---|---|---|---|---|
| 1 | `/dashboard` | Owner snapshot | `/dashboard` (overview, alerts, setup checklist) | U | Verify SRD/USD are never summed; verify profit only where cost is reliable. |
| 2 | `/items`, `Item`, `Category` | Catalogue | `/products`, `/categories`, variants | U | Product edit and image upload need a browser pass. |
| 3 | `combo_items` | Bundles | `/bundles` | U | 5 migrated bundles / 15 components need reconciliation against staging. |
| 4 | `/stock`, `Stock` per location | Per-location stock | `/inventory` (movement-based) | U | Opening balances migrate as 52 opening movements. |
| 5 | `StockTransfer` (12 rows) | Move stock between 3 branches | **No equivalent.** `movement_kind` has only receipt, sale, return, adjustment, write_off | **X** | Real gap for a 3-branch business. Needs an additive `transfer` movement pair, an action and a UI. History is archived in `legacy_stock_transfer_archive`. Needs a DB to build safely. |
| 6 | `/locations`, `UserLocationAccess` | Branches, per-user branch access | `locations` table exists; `/storefronts` references it; no standalone management page found | **P/O** | Confirm the owner still wants 3 branches vs a single pickup point, and whether per-user branch scoping is needed (roles are only owner/staff/viewer). |
| 7 | `/reservations`, `Reservation` | Hold stock for customers | Order reservations inside `/orders` | U | 30 completed legacy reservations have no sale link and stay archived (owner decision recorded in the worksheet). |
| 8 | `/sales`, `Sale`, `SaleItem` | POS and sales | `/sales`, `/sales/new`, `/sales/[id]` | U | 51 header/line total mismatches are flagged `needs_review`. Not safe to call reconciled. |
| 9 | `/orders` (old = purchase orders) | Buying from suppliers | `/purchase-orders` | U | Old PO allocations map to commitments. |
| 10 | `/invoices`, `InvoiceSequence` | Invoices | `/invoices`, `/invoice/*` | U | Number-sequence continuity needs a check against the legacy sequence. |
| 11 | `/wallets`, `wallet_transactions` | Cash and bank positions | `/wallets`, `/ledger` | U | Core reconciliation target (13 wallets, 518 movements). |
| 12 | `WalletReconciliation` | Reconcile wallet vs bank | `/reconciliation`, `/finance/reconciliation` | U | |
| 13 | `FinanceLedgerEntry` | Append-only books | `ledger` (append-only) | U | |
| 14 | `/exchange`, `ExchangeRate` | USD/SRD rate | `/exchange-rates` | U | Verify locked FX snapshots on migrated sales. |
| 15 | `/expenses`, `RecurringExpense` | Costs | `/expenses`, `/expenses/recurring` | U | Recurring job needs a cron run on staging. |
| 16 | `/commissions`, `Seller`, `seller_category_rates` | Seller pay | `/commissions` | U | 64 legacy-paid commissions have no payout link (owner worksheet). |
| 17 | `/seller` | Seller self-service view | None. Roles are owner/staff/viewer | **X/O** | Decide whether sellers should log in at all. |
| 18 | `PayoutRun`, `Founder` | Founder payout splits | `/owners` | P | Automated splits deliberately deferred until the owner confirms recipients. |
| 19 | `FinanceObligation` | Receivables/payables | `/obligations` | U | |
| 20 | `/finance/review` | Resolve finance exceptions | Owner-review flags (`needs_review`) in lists; `/reconciliation` | P | No single "resolve issues" queue. Reasonable follow-up. |
| 21 | `/finance/close`, `AccountingPeriod` | Month-end checklist and lock | None found | **X/O** | Old repo invested heavily here (month-end close centre). Ask the owner whether period locking is wanted at day one. |
| 22 | `BillInbox` | Supplier bill inbox | None found | **X/O** | Same question. |
| 23 | `/budgets`, `Budget`, `BudgetCategory`, `Goal` | Budgets and goals | None. One expired 2026-01 budget row is archived | **D/O** | Deferred in the migration plan; confirm. |
| 24 | `Account`, `JournalEntry`, `JournalLine`, `FixedAsset`, `InvestmentHolding`, `FxRevaluationRun` | General ledger | Retained as read-only archive only | D | Documented as deferred; reconcile opening journals to wallets before retiring the source. |
| 25 | `/reports` | Management reports | `/reports` | U | Must reconcile to the ledger. Not proven. |
| 26 | `/performance` | Sales/staff performance | Inside `/reports` / dashboard | P | Check for per-seller and per-product views. |
| 27 | `/activity`, `ActivityLog` | Who did what | `activity_logs` is written by `server/services/posting.ts`; **no viewer page** | **Done 2026-10-17** | Owner-only read-only `/activity` page (search, record filter, paging, recorded changes). Built without schema changes; the owner gate is by inspection only, not yet tested with a non-owner session. |
| 28 | `/team`, `User`, `AppSession` | Staff accounts | `/settings` + `invite-member-sheet`, Supabase Auth | P | Passwords/sessions are not migrated by design; the owner must be re-invited. |
| 29 | `/settings`, `StoreSetting` (34 keys) | Business config | `/settings`, `/storefront*` | U | All 34 values archived; supported ones transformed. Pickup location text is still contradictory (below). |
| 30 | `Client` | Customers | `/customers`, `/customers/[id]` | U | |
| 31 | `/catalog`, `/audio`, `/watches` | Public shop | `(store)` routes; watches retired (410) | U | **Staging is not running the latest storefront (see below).** |
| 32 | `Blog*`, `Banner`, `Page`, `FAQ`, `Testimonial`, `Review`, `Subscriber`, `Collection` | CMS | Empty-state routes; `storefront/collections`, `storefront/homepage` | D | Source tables were all empty. |
| 33 | `SiteAnalyticsEvent` (12,011 rows) | Traffic | None | D | Archive only. |
| 34 | `/api/backup`, `/api/cron/*` | Backups, jobs | `deploy/backup-staging.sh`, Coolify cron | P | **No restore has been tested.** |
| 35 | `/api/notifications`, `UserNotification` | Alerts | `server/actions/notifications.ts` | U | |
| 36 | `/api/debug-*`, `/migrate`, `/upload-example` | Dev tooling | None | D | Correctly dropped. |
| 37 | CSV/exports | Reporting | `/api/export` | U | |
| 38 | `/api/site-analytics`, `/api/watches` | | | D | |

## Counts (first pass)

Missing: 5 (stock transfer, month-end close, bill inbox, seller portal, standalone locations page).
Partial: 7. Deprecated by design: 6. Everything else is "present in code, unverified".
**Nothing has been classified "successfully migrated" yet**, because that requires the staging run.

## Staging check on 2026-10-17

`https://nextx.nextxagency.com/audio` still renders strings that commit 85e04b9 removed from source:
"Local stock in Paramaribo", "On the shelf, not on a promise", "Ask NEXT X Audio" and a hero that
says "haal op in Commewijne" next to a "Paramaribo" claim. **So staging is not running 85e04b9.**
The Dutch hero ("Geluid dat klopt.") is present, which is consistent with an earlier build.
The exact deployed commit is unknown, because reading the image label needs VPS access.

## Recommended build order

1. Activity log page (read-only, no schema change).
2. Stock transfer between locations (additive migration; build against a rehearsal DB).
3. A "needs review" queue that consolidates the 80 migration findings and `needs_review` flags.
4. Owner decisions on rows 6, 17, 21, 22, 23 before any of those are built.
