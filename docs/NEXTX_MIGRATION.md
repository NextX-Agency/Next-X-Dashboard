# NextX migration mapping

This document records the target seams for a future controlled migration from
the legacy NextX Dashboard. It is a business mapping, not a production import
script. No live NextX source data has been written to a destination; only the
sanitized local rehearsal fixture has been imported.

The reference requirements were reviewed from the public [NextX Dashboard
repository](https://github.com/NextX-Agency/Next-X-Dashboard). Nextly keeps only
the business concepts needed for the current operating model and maps them to
its existing canonical tables.

| NextX concept | Nextly target | Migration posture |
| --- | --- | --- |
| Locations | `locations` and `storefront_locations` | Match by stable slug; preserve an explicit legacy source key in the import staging plan. |
| Cash / bank wallets | `wallets` plus `ledger_entries.wallet_id` | Create one wallet per real currency and destination; do not import a mutable balance counter. |
| Wallet transactions | `ledger_entries` | Import each movement with direction, currency, locked FX rate, source reference, correlation id, event type, location and storefront attribution. |
| Sales / orders | `sales` / `sale_items` | Reuse the canonical order seam; map channel origin to `source` and the business channel to `storefront_id`. |
| Sale payments | `sale_payments` | Import the payment event, keep payment method and destination wallet separate, and post the matching ledger row atomically. |
| Expenses | `expenses` | Import category, amount, occurrence date, locked FX rate, wallet and attribution. Historical corrections become reversals or void records. |
| Recurring expenses | `recurring_expenses` plus linked `expenses` / `ledger_entries` | Preserve cadence, anchor, next run, active/auto-post and estimated flags. Each posted period uses a partial unique key and the standard expense posting path. Estimated amounts/dates and underfunded wallets wait for review. |
| Sellers and commission rates | `sellers` and `seller_category_rates` | Preserve source identity, active state and category rates. Do not invent auth users or employee credentials. |
| Commissions | `commissions` and owner payout workflow | Snapshot amount, rate, currency and FX; preserve legacy paid state without recreating a payout debit. A commission whose sale or seller is unresolved remains a fatal migration conflict. |
| Commission payouts | `commission_payouts`, expense and ledger | Create these links only for a new, verified payout. Legacy payout runs are preserved verbatim in the restricted `legacy_payout_run_archive`; no historical draft is activated or replayed as a debit. |
| Transfers | `wallet_transfers` plus two ledger rows | Require same-currency source/destination and preserve a shared correlation id. FX conversions need a separately approved workflow. |
| Exchange rates | `fx_rates` | Insert a dated USD→SRD rate series. Never rewrite historical transaction snapshots. |
| Invoices | confirmed `sales`, `sale_items`, `sales.invoice_number` | Preserve invoice number and line snapshots; derive paid/outstanding from valid payments. |
| Reconciliation | `reconciliations` | Import statement checkpoints as history; do not “fix” the ledger to match a statement. |
| Audit trail | `activity_logs` and ledger source metadata | Preserve actor/action/diff where available; imported events must be clearly marked as migrated. |

## Import controls

1. Load source data into a staging area with source keys and checksums.
2. Normalize currencies, dates, payment methods, locations and wallet names.
3. Validate control totals by currency, wallet, location, storefront and period.
4. Import reference data before documents, then payments and ledger postings.
5. Recalculate derived balances and invoice outstanding; compare to the source
   report without copying source denormalized totals.
6. Reconcile every wallet and retain the source report and import run metadata.
7. Only then cut over new writes, with a rollback/hold procedure owned by the
   business.

The import should be a separately reviewed migration project. It must not be
started automatically from this repository change.

## Audited legacy schema

The current public NextX Prisma schema and live table inventory were inspected
directly. In addition to the core catalog, inventory, customer, reservation,
sale, wallet and expense entities, the source has populated bundles,
commissions, recurring expenses, finance obligations, settings, journal/payout
records and invoice sequences. Their live counts and destination gaps are
recorded in [feature parity](NEXTX_FEATURE_PARITY.md). The importer now refuses
to write while a populated unsupported module is present. The source
repository's broad authenticated RLS
policies are not copied into Nextly; the import uses Nextly's server-side
authorization and destination RLS.

## Classification

| Classification | Legacy entities | Decision |
| --- | --- | --- |
| DIRECT | Locations, valid FX observations, wallet identity fields | Stable ids and historical timestamps are retained where the destination shape is compatible. |
| TRANSFORM | Categories, customers, stock, sales, sale items, sale payments, refunds, expenses, wallet transactions, finance ledger entries, reconciliations | Normalize money/currency/status fields and write through Nextly's canonical tables and append-only ledgers. |
| MERGE | `Item`, watch products, audio/IEM products, generic items | One Nextly `products` row plus one `product_variants` row per legacy item; no type-specific product tables. |
| DERIVE | Storefronts, price lists, uncompleted-reservation placeholders, wallet opening adjustments | Pending/cancelled reservations may need a placeholder order because the legacy reservation table has no order link. Completed reservations reuse their explicitly linked sale and exact sale line; the importer fails closed when that source link is missing or ambiguous. |
| DROP | Noisy legacy activity and notification events | Retained only as counts/conflict evidence; they are not bulk-copied into Nextly audit/notifications. |
| DEFER | Users/auth credentials, noisy activity/notifications, zero-row procurement and CMS history | Requires an archive or separate review. Populated operational modules are fatal until mapped. |

## Tooling

The implementation lives in `scripts/migrate-nextx/` and exposes:

- `migrate:nextx:inspect` — source shape and plan summary, no writes.
- `migrate:nextx:dry-run` — complete transformation, conflict report, JSON
  report, human-readable report, and stable mapping state.
- `migrate:nextx:run` — guarded staging/development import with bounded,
  idempotent transactions; staging writes require a current working-tree
  readiness report with all ten gates set to `PASS`.
- `migrate:nextx:media-prepare` — copies verified legacy images into isolated
  self-hosted staging Storage and writes the media map used by dry-run/import.
  It requires its phase-specific staging report and Storage smoke test; it does
  not weaken the all-ten-gate report required by the relational import.
- `migrate:nextx:readiness-fingerprint` — returns the current HEAD and exact
  dirty-tree fingerprint for the readiness report.
- `migrate:nextx:validate` — offline invariant checks or online destination
  count/view checks when a confirmed safe target is configured.

The current planner maps all five legacy combo parents and 15 component rows
to Nextly bundles, validates the legacy combo-stock counter against
component-derived availability, and preserves direct combo sale lines as
bundle sale lines. These local mappings pass unit tests; the complete import
also preserves all six legacy expense categories by ID and links the source
expenses to them. It maps all three source recurring-expense schedules and
historical schedule/period references, the single finance obligation, and all
34 store-setting values (archived as restricted JSON, with supported settings
transformed into canonical fields). A read-only live-source dry-run completed
on 2026-09-26 at `2026-09-26T13:19:13.579Z`; it plans 1,861 operations from
3,182 rows, with 73 fatal conflicts, 77 warnings and 77 informational conflicts.
The source was read from the legacy repository's ignored `DIRECT_URL` only for
the CLI process; neither source nor destination was written. A PII-minimized
worksheet for the 150 fatal/warning findings is available at
`migration-reports/nextx-live-owner-review-2026-09-26-1320z.csv`; it contains
blank owner decision/evidence fields and has not been completed. Conflict
groups and identities are unchanged from the prior report. The count-only
`site_analytics_events` inventory is 12,011, up 38 from 11,973. The snapshot
also adds one sale, four sale lines, one wallet transaction, one finance-ledger
row and one activity row. All 12 source stock transfers map to the restricted archive,
with canonical item or bundle and location references; the 52 opening-stock
movements are unchanged. A
read-only CDN preflight downloaded and decoded all 41 unique legacy image URLs
without persisting image bytes or writing to Storage. The dry-run maps all 3
sellers, 3 category-rate rows and all 130 commissions. Sixty-four legacy-paid
rows retain their status without a new expense or ledger debit. All 164 source
sales, 330 source lines, 163 linked payments and 163 invoices reconcile to the
offline transform's expected counts. A 2026-09-25 read-only exact-link audit confirmed two posted expenses totaling USD 45 lack any wallet transaction or ledger link or plausible exact debit candidate, and one posted SRD 1,400 sale lacks a linked payment or plausible exact credit candidate. The importer preserves those records and flags them for owner review without inventing cash postings or payment history. Twenty cancelled reservations are
preserved as released inventory reservations against zero-value cancelled
order placeholders. The 30 completed reservations have no sale foreign key,
and this live snapshot contains no `reservationIds` in finance-ledger metadata;
its 10 completion activity rows have no parseable item-count/invoice details
or matching reservation entity IDs. They remain fatal rather than being
attached by product/quantity or timing guesses or duplicated as new orders.
The other 43 fatal groups are unmapped legacy media
references (39 product images and 4 logo/hero URLs). Fifty-one header/line
total mismatches now preserve both source amounts, flag affected sales for
review, store exact source-currency line subtotals in
`sale_items.line_total_cents`, and require owner review before operational
acceptance. Sale detail exposes the review reason and compares the line
subtotal less discount with the recorded header. Thirty-eight catalog USD
values are explicitly rounded to minor units and archived exactly, with
informational conflicts rather than fatal precision loss. The legacy API
creates reservations in SRD, but the table has no currency or per-item
historical-price columns; the cancelled placeholders use the proven SRD
default and preserve their quantity/status, with unavailable prices shown as
zero rather than copied from today's catalog. Warnings also include 15
unlinked refunds, 7 wallet-opening adjustments, two expenses without wallet
movements, one sale without a payment event, and the aggregate legacy
paid-commission warning. Further read-only review found no sale notes,
line-level discount evidence or audit snapshots that explain the 51 order-total
mismatches; the conflict report now records both totals, line count and
non-sensitive source review flags. All 518 wallet transactions have a matching
finance-ledger mirror; each pair is imported once.

The sanitized 45-row fixture produces 63 operations in 11 logical batches,
including one restricted historical stock-transfer archive row. The
46-migration local PostgreSQL rehearsal passed both importer runs and 65/65
import validations, 128/128 RLS checks, 17/17 constraint checks and 15/15
concurrency checks, including a two-caller commission payout race. A fresh
332,139-byte custom-format local backup restored into the new isolated
`nextly_migration_restore_20260925_1708z` database with matching counts:
46 migrations, 2 products, 3 sales, 3 sale items, 862,000 summed line-total
cents, zero null line totals, 2 payments, 3 inventory movements, one archived
transfer, one synthetic payout-run archive row, 8 ledger entries and 4
members. This is local synthetic evidence only; it does not establish Coolify
staging, offsite disaster recovery, or live source reconciliation readiness.

Database-backed source reads run in a repeatable-read, read-only transaction.
Count-only source-table inventory is recorded in the JSON report without
loading high-volume analytics or audit payloads. Database reads mark the
inventory complete after scanning all public base tables. Sanitized exports
must provide `metadata.sourceTableInventoryComplete: true` and
`metadata.sourceTableCounts` for tables not included as row arrays; missing or
invalid inventory data blocks import.

The actual source model reference is the public [NextX Dashboard repository](https://github.com/NextX-Agency/Next-X-Dashboard),
including its Prisma schema. No source or destination credentials are stored in
the repository.
