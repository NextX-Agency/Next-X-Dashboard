# Source-to-target reconciliation, staging import of 16 Oct 2026

Status: **prepared, not signed.** The owner sign-off block at the end is intentionally blank.

## What was imported

| Item | Value |
|---|---|
| Source | Legacy Next-X-Dashboard Postgres, one `REPEATABLE READ READ ONLY` transaction, 3,227 rows, 35 tables |
| Snapshot taken | 2026-10-16T23:09Z. All 35 tables were **byte-identical** to the 16:08Z snapshot, so the legacy data did not change in between (no legacy writes for about seven hours). |
| Code | Git `a750a6e` (first import), `4ed922c` (idempotency re-import), both deployed by `deploy/vps/deploy-pinned.sh` |
| Target | Self-hosted Supabase on the VPS, project `nextx`, staging |
| Import result | `Migration applied in 794 logical batches (1934 operations)`, exit 0, 0 fatal conflicts, 79 warnings (77 financial plus 2 watch-copy notices at the time) |
| Backups | Pre-import and post-import `pg_dump` files in `/var/backups/nextx/` (root-only). Restore of the pre-import dump into a scratch database matched (63 tables plus the migration ledger). **Restore of the post-import dump has not been tested.** |

The importer commits per batch (one transaction each), so a failed run can leave a partial import. This
run did not fail; the earlier "import" was only an offline plan check.

## Idempotency (verified)

`scripts/ops/redeploy-and-compare.sh` captured row counts for all 63 public tables, plus wallet balances,
sales totals and ledger totals, **before and after** re-running the whole import over the existing data.
Result: `IDEMPOTENT: no row count changed` and `IDEMPOTENT: balances, sales and ledger totals unchanged`
(both diffs empty). Evidence directory on the VPS: `~/nextx-migration/compare-20261016T233408Z/`.

## Counts, source versus target

| Entity | Source rows | Target rows | Reading |
|---|---:|---:|---|
| Customers | 10 | 10 | match |
| Sales (orders) | 166 | 186 | 166 plus **20** orders derived from priced-less reservations (`RESERVATION_WITHOUT_PRICE`, total 0) |
| Sale items | 334 | 354 | 334 plus 20 for those derived orders |
| Sale payments | 0 rows in source table; **165 derived from sales** | 165 | match the importer's expected 165; one posted sale has no payment event (`SALE_WITHOUT_PAYMENT_EVENT`) |
| Sale refunds | 0 | 0 | the 15 refund debits are wallet transactions, not refund records (see warnings) |
| Ledger entries | 524 wallet transactions | 523 | 524 minus 8 zero-value, plus 7 `MIGRATION_OPENING_BALANCE` entries |
| Expenses | 91 | 91 | match |
| Commissions | 130 | 130 | match |
| Inventory movements | 54 stock rows | 53 | importer expects 53; **the 1-row difference is not explained in this report** |
| Reservations | 50 | 20 active plus 30 archived | 30 completed reservations kept in `legacy_reservation_archive`, no order, stock or ledger effect |
| Wallets | 13 | 13 active (21 rows) | the 8 seeded default wallets were deactivated |
| Products, variants, bundles | 39 items (of which 5 combos), 15 combo components | 34 products, 34 variants, 5 bundles, 15 bundle components | match: 39 = 34 + 5. The 34 products include the historical watches (hidden from the webshop); 15 are audio products shown publicly |

## Money control totals (verified independently from the raw snapshot)

All amounts are in minor units (cents).

| Control | Source (raw snapshot) | Target (staging DB) | Result |
|---|---:|---:|---|
| Wallet balances, SRD (sum of 13 legacy counters) | 4,287,800 | 4,287,800 | match |
| Wallet balances, USD | 4,200 | 4,200 | match |
| Posted sales, SRD | 22,182,602 (163 sales) | 22,182,602 (183 rows) | match; 20 extra rows have total 0 |
| Posted sales, USD | 14,400 (3 sales) | 14,400 (3 rows) | match |
| Ledger net, SRD (in minus out) | n/a | 45,995,152 − 41,707,352 = 4,287,800 | equals wallet balances |
| Ledger net, USD | n/a | 557,077 − 552,877 = 4,200 | equals wallet balances |

The importer's own online validation (`validation.json`) also reported `pass` for inventory (53),
orders (166), payments (165), invoices (166) and 13 wallets with 523 ledger entries, including a
per-wallet balance check. Balances are recalculated from ledger rows, not copied from the legacy counter.

### Queries used

Target (read-only, inside `redeploy-and-compare.sh`):

```sql
SELECT table_name, count(*) FROM public.<table>;                       -- every public table
SELECT currency, count(*), sum(total_cents) FROM public.sales GROUP BY 1;
SELECT currency, direction, count(*), sum(amount_cents) FROM public.ledger_entries GROUP BY 1,2;
SELECT w.name, w.currency, b.balance_cents
  FROM public.v_wallet_balances b JOIN public.wallets w ON w.id = b.wallet_id;
```

Source: summed `wallets.balance`, `sales.total_amount` by currency and status from the snapshot JSON
(`Math.round(value * 100)`), and diffed all 35 tables between the two snapshots.

## Not reconciled yet

- Stock on hand **by item and location** against legacy `stock` (only the movement count and its total
  of 107 units were captured).
- Sales **line totals** versus header totals for the 51 flagged orders (kept as flags, not edited).
- Customer, invoice-number and timestamp field-level comparison; FX snapshots; media files in Storage.
- Per-**period** and per-**storefront** reconciliation.
- Restore of the post-import dump into a separate target.

## Warnings and owner decisions

All 80 findings are listed with legacy record IDs in
[`2026-10-16-owner-warning-worksheet.csv`](2026-10-16-owner-warning-worksheet.csv). The
`OwnerDecision` column is pre-filled from the decisions recorded in the VPS file
`~/nextx-migration/local-evidence.json` (`ownerDecisions`, dated 2026-10-16). `ReviewedBy` and
`ReviewedAt` are blank for the owner.

| Kind | Rows | Treatment applied | What would resolve it |
|---|---:|---|---|
| `ORDER_TOTAL_REVIEW_REQUIRED` | 51 | Header total kept, flagged | Owner confirms each header or line total from receipts |
| `UNLINKED_REFUND` | 15 | Wallet debit kept, no order link invented | Owner supplies the order each refund belongs to |
| `WALLET_OPENING_ADJUSTMENT` | 7 | Explicit `MIGRATION_OPENING_BALANCE` entry | Owner confirms each wallet's counted cash or bank balance |
| `EXPENSE_WITHOUT_WALLET_MOVEMENT` | 2 | Expense kept, no cash movement created | Owner says which wallet paid |
| `SALE_WITHOUT_PAYMENT_EVENT` | 1 | Posted sale kept, no payment invented | Owner confirms how it was paid |
| `LEGACY_PAID_COMMISSIONS_NEED_RECONCILIATION` | 1 (covers 64 commissions) | Legacy-paid, no payout link invented | Owner supplies payout evidence |
| `WATCH_COPY_DROPPED` | 3 | Watch text kept off the audio storefront | none, informational |

The 30 completed reservations are archived exactly as in the source. No sale link, payment, refund,
commission payout or ledger posting was invented.

## Sign-off

| | |
|---|---|
| Owner reviewed worksheet | ☐ |
| Owner accepts archive treatment of 30 reservations | ☐ |
| Unreconciled items above accepted or closed | ☐ |
| Name / date / signature | |
