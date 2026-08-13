# Reports

Generated evidence. Nothing here was inserted into the database.

## `commission-payout-backfill.csv`

**106 commission payout expenses that should exist and do not, totalling SRD 9,458.05.**

Measured against production on 2026-08-13:

| | |
|---|---|
| Commissions marked `paid` | **106** |
| Their total | **SRD 9,458.05** |
| Payout expenses recorded against them | **0** |
| Period | 2026-01-08 → 2026-07-01 |
| Seller / location | Rico · Paramaribo - Noord, Blauwgrond |

### Why the money is missing from the books

`src/app/commissions/page.tsx` inserted the payout expense with columns that do not exist on
`expenses` (`category`, `payment_method`, `date`) and omitted the `NOT NULL` `wallet_id`. The insert
was rejected every single time. Nobody checked the error, so the UI reported success, flipped
`paid` to true, and the expense was never written (F-15).

The commissions were, in all likelihood, genuinely paid. The business's operating costs are
understated by SRD 9,458.05 over seven months as a result.

Fixed in T-07: payouts now go through `POST /api/commissions/payout`, one Serializable transaction
covering the expense, the wallet debit, the wallet transaction and the ledger entry.

### Why this is a report and not a backfill

Inserting 106 backdated expenses would rewrite months that have already been reviewed. That is
irreversible in a way this project's rules do not permit — R1 (migrations are additive), R11 (prefer
the reversible action), and Part 5's explicit instruction for this item: **report only, do not
insert**.

The books are wrong either way. The difference is that the gap is now *visibly* wrong rather than
silently wrong.

### What to do with it

This is a question for the owner and their accountant, not for software:

1. Confirm the 106 payments actually happened. The commission rows say `paid`; only a person can
   confirm cash left a drawer.
2. If they did, decide whether to post them as a single dated correction in the current period, or
   106 backdated entries, or to leave the historical gap documented and start clean from the T-07
   cutover.
3. Whichever is chosen, post it through the normal expense path so it lands in the ledger.

**Column meaning.** `proposed_expense_amount_srd` is the commission amount as recorded. It is not a
recalculation — no figure in this file was derived or estimated. `status` is
`PROPOSED - NOT INSERTED` on every row, and that is the whole point.
