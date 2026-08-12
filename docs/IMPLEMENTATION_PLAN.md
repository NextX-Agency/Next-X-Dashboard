# NextX Implementation Plan

**Companion to:** `docs/FINANCIAL_AUDIT.md` (34 findings, reconciled against production)
**Written for:** an AI agent implementing the work, task by task
**Hard constraint:** no existing data may be lost, and all existing data must end up meaningful under the new workflow

---

## Part 0 — Rules the implementer must follow

These are not suggestions. Every task below assumes them.

**R1 — Migrations are additive.** Add columns and tables. Never `DROP` a column holding financial data, never `DELETE` a financial row, never rewrite an amount in place. If a value is wrong, add a correcting row.

**R2 — Every migration is three parts: schema, backfill, verify.** A migration that adds a column without backfilling it leaves the system in a state where old rows mean something different from new rows. That is how the current `classification` column ended up 100% unused (F-20). Ship all three or ship nothing.

**R3 — Backfilled values must be marked as backfilled.** Where a historical value is inferred rather than known, add a boolean (`cost_is_estimated`, `invoice_is_reconstructed`) and default it `true` for backfilled rows, `false` for new ones. Never let an inference become indistinguishable from a fact.

**R4 — Verify with SQL, not with the UI.** Each task carries a verification query. Run it before and after. Record both numbers.

**R5 — Never edit a wallet balance directly.** Balance changes happen through a transaction row. This rule is the entire point of F-03, F-34 and §9 of the audit.

**R6 — One task, one migration, one commit.** Do not batch. If T-07 fails, T-06 must still be sound.

**R7 — Stop and ask on any task marked 🚩 HUMAN.** These need a business decision that cannot be inferred from data. Guessing produces confident wrong numbers.

**R8 — The ledger is append-only.** `finance_ledger_entries` rejects UPDATE and DELETE at the database level. Corrections are new entries. Do not attempt to disable the trigger except through the existing, scoped `app.finance_ledger_maintenance` mechanism.

**R9 — Take a backup before each phase — but only after T-01 lands.** Until then, the restore path can itself destroy data (F-33).

---

## Phase A — Make it safe to change anything

Nothing else may start until this phase is complete.

### T-01 — Make restore atomic 🔴 BLOCKING

**Fixes:** F-33
**Files:** `src/app/api/backup/restore/route.ts`

`wipeAllTables()` commits its transaction, then inserts run outside any transaction via `prisma.` from the loop at line 507. A mid-restore failure leaves the database wiped and half-populated.

- Open one transaction in `POST` that spans the wipe and every insert.
- Thread the transaction client `tx` through `insertTable` and `upsertTable`; replace every `prisma.<model>` with `tx.<model>` inside them.
- Keep the existing `app.finance_ledger_maintenance` and `app.finance_ledger_recorded` scoping — that part is correct.
- Raise the transaction timeout; a full restore will exceed the default.
- If a single transaction proves impractical at this data size, restore into a staging schema and swap it in. Do not ship the current behaviour.

**Verify:** take a backup, restore it into a scratch Supabase branch, then deliberately corrupt one table's payload and confirm the whole restore rolls back with the database intact.

**Do not proceed to T-02 until a restore has been tested end to end on a branch.**

### T-02 — Take a verified baseline backup

Export, download, restore into a Supabase branch, and run the full verification suite from §3 of the audit against the restored copy. Numbers must match production exactly. Keep this file for the whole project.

### T-03 — Close the unauthenticated mutation endpoints

**Fixes:** F-05
**Files:** `src/app/api/delete-commissions/route.ts`, `recalculate-commissions`, `fix-combo-price`, `migrate`, `delete`

`src/proxy.ts` only checks that a `nextics_session` cookie exists; it never validates it and applies no role check.

- Add `requireAdmin(request)` to each handler, matching `/api/debug-profit`.
- Prefer deletion: `delete-commissions`, `recalculate-commissions`, `create-missing-commissions`, `check-commission` and `fix-combo-price` are repair tools for a write path being fixed in T-10. Delete them once T-10 lands; guard them now.
- Also delete the root-level `check-commission-currency.js`.

**Verify:** each endpoint returns 401/403 with a forged cookie value.

### T-04 — Harden the ledger guard functions

**Fixes:** F-22

```sql
REVOKE EXECUTE ON FUNCTION public.capture_wallet_transaction_ledger() FROM anon, authenticated;
ALTER FUNCTION public.prevent_finance_ledger_mutation() SET search_path = public;
ALTER FUNCTION public.capture_wallet_transaction_ledger() SET search_path = public;
```

**Verify:** `mcp__Supabase__get_advisors` returns no warning for either function.

### T-05 — Replace blanket RLS with scoped policies

**Fixes:** F-04
**Files:** new migration replacing `20260127000000_enable_rls_policies.sql`

All 80 policies are `FOR ALL USING (auth.role() = 'authenticated')`. Replace with policies scoped by location and role. Note the correct model already exists in this database: `finance_ledger_entries` and `wallet_reconciliations` have RLS on with no policies at all — deny-all through PostgREST, reachable only by server routes holding a direct connection. Extend that posture rather than inventing one.

**Do this after T-03**, and confirm every admin page still loads — server routes use Prisma's direct connection and bypass RLS, but any remaining browser-side `supabase` query will break here. That breakage is informative: it tells you exactly which client-side financial reads T-10 must move server-side.

### T-06 — Widen money columns

**Fixes:** F-09

26 columns are `Decimal(10,2)`, capping at 99,999,999.99. Widen amounts to `Decimal(18,4)` and rates to `Decimal(18,8)`.

```sql
ALTER TABLE public.wallets ALTER COLUMN balance TYPE NUMERIC(18,4);
-- repeat for every money column; widening is lossless and does not rewrite values
```

Update `prisma/schema.prisma` to match, run `prisma generate`.

**Verify:** `SELECT sum(balance) FROM wallets` matches the pre-migration total exactly.

### T-07 — Fix the commission payout insert

**Fixes:** F-15
**Files:** `src/app/commissions/page.tsx:343`

The insert targets `category`, `payment_method` and `date` — none of which exist — and omits the `NOT NULL` `wallet_id`. It fails every time, unchecked. 106 commissions are marked paid worth SRD 9,458.05 against zero payout expense records.

- Move the payout to a server route inside one `prisma.$transaction`, following `POST /api/expenses` exactly.
- Correct column names, supply `walletId`, set `classification = 'payroll'`.
- Check the error and surface it. **A bare `await` on a Supabase write is the bug that caused this; do not reproduce it anywhere.**
- Flip `commissions.paid` in the same transaction as the wallet debit.

**Verify:** pay a test commission; confirm one expense, one wallet debit, one ledger entry, and `paid = true`, all present or all absent.

### T-08 — Set a current exchange rate and warn on staleness

**Fixes:** F-19. The active rate is 38.0000, last set 2026-06-05. Add a banner when the active rate is older than 7 days.

---

## Phase B — Clean the existing books 🚩 HUMAN

These need decisions from you. An AI must not guess. Do this before the ledger migration — these figures cannot be reconstructed afterwards.

### T-09 — Resolve the historical anomalies

| What | Size | Decision needed |
|---|---|---|
| 4 sale headers with no line items | SRD 11,420.02 | Restore the missing lines, or void the sales? 3 carry commissions and all 4 have wallet credits |
| 4 header/line total mismatches | SRD 1,050.02 gap | Which figure is correct — the header or the lines? |
| Commissions paid vs wallet debits | SRD 1,451.38 unexplained | Was cash paid and not recorded, or was `paid` set without payment? |
| Blauwgrond wallet drift | SRD 500.00 | Balance reads 0.00, history says 500.00. Which is real? |
| Missing commission payout expenses | SRD 9,458.05 | Backfill as dated corrections. **Do not silently insert** — this changes reported history for months already reviewed |
| 5 items with zero cost | 2 sales affected | Real purchase costs needed |
| "Personal Items" — 9 rows | SRD 10,662 | Split into inventory / personal / subscription. Only you know which is which |

Record each decision in the correcting row's description. Post corrections as new dated entries, never as edits.

### T-10 — First physical wallet count

**Fixes:** F-21, and establishes the trusted baseline for T-14.

Count all 13 wallets physically. Record declared vs expected, and post the variance as an adjustment through the ledger. This is the cutover baseline — everything before it is history, everything after is reconciled.

---

## Phase C — Trustworthy write paths

### T-11 — Move sale creation server-side

**Fixes:** F-02, F-03
**Files:** new `POST /api/sales`, replacing `src/app/sales/page.tsx:467–860`

Eight sequential browser writes with a rollback that doesn't undo stock or wallet changes. Model the new route on `src/app/api/seller/sales/route.ts:89` and `POST /api/expenses`.

- One `prisma.$transaction` at `Serializable` isolation covering sale, sale items, stock, commissions, wallet debit, wallet transaction, ledger entry and activity log.
- **Atomic increments only:** `balance: { increment: total }`, never `balance: readValue + total`. Same for stock.
- Delete the client-side write path entirely; the page calls the route.

**Verify:** fire two concurrent sales against one wallet; the final balance must equal the sum of both. Under the current code one silently overwrites the other.

### T-12 — Snapshot cost and FX onto sale lines

**Fixes:** F-01, F-18

```sql
ALTER TABLE public.sale_items
  ADD COLUMN unit_cost_usd NUMERIC(18,4),
  ADD COLUMN fx_rate_at_sale NUMERIC(18,8),
  ADD COLUMN cost_is_estimated BOOLEAN NOT NULL DEFAULT true;

UPDATE public.sale_items si
SET unit_cost_usd = i.purchase_price_usd,
    fx_rate_at_sale = COALESCE(s.exchange_rate, 38.0),
    cost_is_estimated = true
FROM public.items i, public.sales s
WHERE si.item_id = i.id AND si.sale_id = s.id AND si.unit_cost_usd IS NULL;
```

New sales write the real values with `cost_is_estimated = false`. Change `calculateSaleFinancials` (`src/lib/reportCalculations.ts:107`) to read `si.unit_cost_usd`, never `item.purchasePriceUsd`. Surface an "includes estimated costs" note on any report covering pre-cutover periods.

**Run T-09's zero-cost fix first**, or you freeze zeros into history permanently.

### T-13 — Void instead of delete

**Fixes:** F-06. Add `status` to sales (`posted` / `voided`), `voided_at`, `voided_by`, `void_reason`. Undo posts reversing rows sharing the original `correlation_id`. Remove every `.delete()` on a financial table. Backfill existing sales to `posted`.

### T-14 — Reconciliation with variance

**Fixes:** F-21, F-30, F-34

```sql
ALTER TABLE public.wallet_reconciliations
  ADD COLUMN expected_balance NUMERIC(18,4),
  ADD COLUMN variance NUMERIC(18,4),
  ADD COLUMN variance_reason TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
```

- Create login accounts for Rico, Aryan Bhaggoe and Leonardo, each with `user_location_access` and `can_manage_wallet` for their own location only. This activates the dormant reminder cron and creates your first segregation of duties (F-31).
- Build an **admin** reconciliation page. Today the only UI is in the seller portal, which is why zero reconciliations exist.
- Non-zero variance posts a ledger adjustment. Never write the balance.

**Do not backfill `expected_balance` for historical rows** — there are none, and per F-34 the historical trail can't be replayed anyway. T-10's count is the baseline.

### T-15 — Make expense controls mandatory

**Fixes:** F-20, F-27, F-29

Require date, vendor, receipt and classification at entry. Backfill existing rows from category name:

| Category | Classification |
|---|---|
| Business Expense | `inventory` |
| Shipping | `operating` |
| Marketing | `marketing` |
| Copilot | `operating` |
| Personal Items | 🚩 **leave `unclassified`** — T-09 splits these by hand |

Add a `Software & subscriptions` category and fold `Copilot` into it.

**Verify:** `SELECT classification, count(*) FROM expenses GROUP BY 1` — only the Personal Items rows remain unclassified.

### T-16 — Persistent invoice numbering

**Fixes:** F-17

Numbers are `Math.random()`-based, never stored, and the reprint path generates a different number than the customer received.

```sql
ALTER TABLE public.sales
  ADD COLUMN invoice_number TEXT,
  ADD COLUMN invoice_is_reconstructed BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_sales_invoice_number ON public.sales (invoice_number) WHERE invoice_number IS NOT NULL;
```

Allocate from a gapless per-company sequence inside the sale transaction.

🚩 **Accept a known limitation:** the original numbers are unrecoverable. Backfill historical sales deterministically by `created_at` order with `invoice_is_reconstructed = true`, and understand that **pre-cutover customer invoice copies cannot be matched to these numbers.** If that matters for tax, say so to your accountant now rather than discovering it later.

---

## Phase D — The three operational gaps

Full specification in audit §6. Sequence matters.

### T-17 — Inventory health (read-only, zero risk)

**Fixes:** F-25, F-28. No schema change. `GET /api/finance/inventory-health` plus a `/finance` panel.

**Verify against known values:** USD 503.02 dead, USD 177.90 overstocked, USD 680.92 releasable, 26 of 38 rows dead. If your numbers differ, the query is wrong, not the audit.

Add the purchasing ceiling from F-28: trailing-3-month COGS + buffer %, currently SRD 13,611/month against SRD 16,344 being spent.

### T-18 — Recurring subscriptions

**Fixes:** F-24. New `recurring_expenses` table; `recurring_expense_id` and `period_key` on expenses.

**The idempotency rule is the part that must not be got wrong:**

```sql
CREATE UNIQUE INDEX idx_expenses_recurring_period_unique
  ON public.expenses (recurring_expense_id, period_key)
  WHERE recurring_expense_id IS NOT NULL AND period_key IS NOT NULL;
```

A double-fired cron, a retry, a manual "run now" during the scheduled run — none can double-charge, because the second insert violates the index rather than relying on application logic to notice.

Rules: catch-up capped at 3 periods per run; insufficient balance skips and notifies rather than failing the batch; new schedules never back-charge; anchor day clamps to short months.

Then create Codex, Claude and Spotify against the USD wallet. 🚩 You supply amounts and renewal days.

**Verify:** run the cron twice in a row; the second run posts nothing.

### T-19 — Owner payout

**Fixes:** F-26. **Only after T-07 and T-15**, or the run rate is computed from unclassified data and produces a confident wrong number.

No new table for the draw — an expense with `classification = 'owner_draw'`, which already exists and is already excluded from operating profit. Add `payout_runs` for the month-end batch.

Percentages from audit §7.5: distributable profit split **savings 65% / founders 20% / restock cap 15%**, moving to 50/30/20 once savings clears SRD 23,439. Base is the **trailing three-month average**, not the current month. Negative average pays zero.

Month-end job **drafts**; a human approves. Never auto-post unattended.

**Verify against the back-test:** trailing-3 for 2026-07 is SRD 4,789 and 20% is SRD 958. If your code produces something else, reconcile before shipping.

---

## Phase E — Company, ledger, group

### T-20 — Company entity

**Fixes:** F-07

```sql
CREATE TABLE public.companies (...);
INSERT INTO public.companies (name, base_currency) VALUES ('NextX', 'SRD');
ALTER TABLE public.locations ADD COLUMN company_id UUID REFERENCES public.companies(id);
UPDATE public.locations SET company_id = (SELECT id FROM public.companies LIMIT 1);
ALTER TABLE public.locations ALTER COLUMN company_id SET NOT NULL;
```

Then `company_id` on every financial table, backfilled via `location_id`, then `NOT NULL`. Denormalised deliberately so RLS never needs a join.

**Your three locations are branches of one company, not three companies.** They all map to NextX.

### T-21 — Chart of accounts and double-entry

**Fixes:** F-08, F-12, F-13. `accounts`, `journal_entries`, `journal_lines`, with a deferred constraint enforcing debits = credits. Keep `finance_ledger_entries` as the cash subledger beneath it.

**Do not backfill journal entries for history.** Post an opening balance journal at the cutover date from T-10's reconciled positions, and run double-entry forward only. Per F-34, replaying history would encode SRD 232,403 of manual corrections as though they were real transactions.

### T-22 — Period close and lock

**Fixes:** F-11. `accounting_periods` with a trigger rejecting journal lines dated inside a locked period. Blocks on unreconciled wallets or unposted subscriptions.

### T-23 — Assets and investments

**Fixes:** F-32. `investment_holdings` and `fixed_assets` per audit §8.

Two rules the implementer must encode: an investment purchase is `Dr Investments / Cr Cash` and **must not reduce distributable profit**; unrealised gains post to equity (3400), **never to profit**, so a paper markup can never fund a founder draw. Depreciation reuses the T-18 scheduler with the wallet debit suppressed.

### T-24 — FX revaluation

**Fixes:** F-10. Revalue USD holdings at period close, posting to FX gain/loss.

### T-25 — Group consolidation

**Fixes:** the central dashboard. With T-20 done this is an "All companies" view — a query, not an integration. Build the signed versioned snapshot contract (§8.5) **only if you actually fork.** Do not fork before T-20; a fork without company identity has nothing to consolidate on.

---

## Phase F — Automation

### T-26 — Bill inbox
OCR a supplier invoice into a draft expense, approval queue, posts on approve. The columns already exist.

### T-27 — Month-end close checklist
Gates the period lock: subscriptions posted, wallets reconciled, expenses classified, FX revalued, payout drafted.

---

## Verification suite

Run after every phase. Every number is from production on 2026-08-12.

```sql
-- Must stay at zero
SELECT count(*) FROM sale_items si LEFT JOIN sales s ON s.id=si.sale_id WHERE s.id IS NULL;
SELECT count(*) FROM wallet_transactions wt
  LEFT JOIN finance_ledger_entries l ON l.wallet_transaction_id=wt.id WHERE l.id IS NULL;
SELECT count(*) FROM stock WHERE quantity < 0;
SELECT count(*) FROM wallets WHERE balance < 0;

-- Must not change except through a task that says it will
SELECT count(*) FROM sales;                    -- 149
SELECT count(*) FROM wallet_transactions;      -- 490
SELECT count(*) FROM finance_ledger_entries;   -- 490
SELECT count(*) FROM expenses;                 -- 83
SELECT round(sum(balance),2) FROM wallets WHERE currency='SRD';  -- 42005.99
SELECT round(sum(balance),2) FROM wallets WHERE currency='USD';  -- 534.00
```

**If a count moves and no task predicted it, stop and investigate before continuing.**

---

## Order of execution

```
A: T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-07 → T-08
B: T-09 🚩 → T-10 🚩
C: T-11 → T-12 → T-13 → T-14 → T-15 → T-16
D: T-17 → T-18 → T-19
E: T-20 → T-21 → T-22 → T-23 → T-24 → T-25
F: T-26 → T-27
```

Hard dependencies: **T-01 blocks everything.** T-09 before T-12 (zero costs freeze otherwise). T-07 and T-15 before T-19 (run rate must be real). T-10 before T-21 (opening balances). T-20 before T-25 and before any fork.

Roughly 14–18 weeks at a steady pace. Phases A and B are about two weeks and carry most of the risk reduction.
