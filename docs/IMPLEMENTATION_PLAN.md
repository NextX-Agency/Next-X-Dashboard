# NextX Implementation Runbook

**For:** AI agents (Codex and Claude) executing this work autonomously, in a fresh session with no prior context
**Companion:** `docs/FINANCIAL_AUDIT.md` — 34 findings, reconciled against production on 2026-08-12
**Hard constraint:** no existing data may be lost, and all existing data must end up meaningful under the new workflow
**Autonomy:** run start to finish without asking anything. Every ambiguity has a defined default; every risk has a mechanical guard

> **Read Parts 0–5 and Part 8 before executing any task.** They contain the conventions, the reference implementations, and the specific anti-patterns in this codebase that caused the findings. A task description assumes you know them.

---

## Part 0 — What you are working on

NextX is an inventory, sales and finance system for a Suriname retail business selling audio equipment and watches across three branch locations, with a public webshop. It runs real money: SRD 42,006 and USD 534 in cash and bank wallets, ~SRD 27,700 of monthly revenue.

**Stack**

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| ORM | Prisma 6.19 — `prisma/schema.prisma`, 47 models |
| Database | Supabase Postgres 17, project ref `ivvhazwjtnyznojeoojs` |
| Migrations | Raw SQL in `supabase/migrations/`, timestamp-prefixed |
| Styling | Tailwind 4 |
| Package manager | **pnpm** |
| Hosting | Vercel; cron jobs declared in `vercel.json` |
| Tests | Playwright (`pnpm test`) |

**Key paths**

```
prisma/schema.prisma              the data model
supabase/migrations/              SQL migrations, applied in filename order
src/proxy.ts                      Next 16's middleware (NOT middleware.ts)
src/lib/apiAuth.ts                requireAuth / requireAdmin / requireRole
src/lib/prisma.ts                 the Prisma singleton
src/lib/financeLedger.ts          markFinanceLedgerRecorded, recordFinanceLedgerEntry
src/lib/serverActivityLog.ts      writeActivityLog
src/lib/reportCalculations.ts     margin and COGS maths
src/lib/expenseClassification.ts  the classification enum and helpers
src/app/api/expenses/route.ts     ⭐ THE REFERENCE IMPLEMENTATION — read this first
```

**The financial architecture, in one paragraph.** Money movements write a row to `wallet_transactions`. A database trigger (`wallet_transactions_capture_ledger`) automatically mirrors each one into `finance_ledger_entries`, which is append-only and enforced by `prevent_finance_ledger_mutation()` — UPDATE and DELETE raise an exception. When a server route wants to write its own richer ledger entry instead of the trigger's automatic one, it calls `markFinanceLedgerRecorded(tx)` first, which sets a Postgres session variable the trigger checks. This works: production has 490 wallet transactions and 490 ledger entries with zero gaps. **This is the one part of the system you must not break.**

---

## Part 1 — Environment setup

Run this before your first task and confirm each step.

```bash
pnpm install                       # ~40s
```

**Prisma CLI gotcha — this will waste your time if you miss it.** `npx prisma` resolves to Prisma 7, which rejects this project's `datasource` block with `P1012: The datasource property url is no longer supported`. That error is not a schema problem. Always use the local binary:

```bash
./node_modules/.bin/prisma validate
./node_modules/.bin/prisma generate
```

Both need `DATABASE_URL` and `DIRECT_URL` set. For a syntax-only check any well-formed value works:

```bash
DATABASE_URL="postgresql://u:p@localhost:5432/db" DIRECT_URL="postgresql://u:p@localhost:5432/db" \
  ./node_modules/.bin/prisma validate
```

**Database access.** Use the Supabase MCP tools. `mcp__Supabase__execute_sql` for reads and verification, `mcp__Supabase__apply_migration` for DDL. Project ref is `ivvhazwjtnyznojeoojs`.

### Testing migrations — read this before your first migration

**The organisation is on the Supabase free plan, where database branching is not available.**
`create_branch` will fail. Do not spend time diagnosing it, and do not proceed to production without
the protocol below.

**Use transactional DDL instead.** Postgres applies schema changes inside a transaction, so a
migration can be applied, verified, and rolled back atomically on production itself:

```sql
BEGIN;

-- 1. the migration
ALTER TABLE public.sale_items ADD COLUMN unit_cost_usd NUMERIC(18,4);

-- 2. the backfill
UPDATE public.sale_items si SET unit_cost_usd = i.purchase_price_usd
FROM public.items i WHERE si.item_id = i.id AND si.unit_cost_usd IS NULL;

-- 3. verification, inside the same transaction
SELECT count(*) AS should_be_zero FROM public.sale_items WHERE unit_cost_usd IS NULL;
SELECT count(*) AS should_be_149 FROM public.sales;

-- 4. COMMIT only if every check passed. Otherwise ROLLBACK.
COMMIT;
```

Rules for this protocol:

- **Run the verification queries inside the transaction, before COMMIT.** That is the entire point —
  a bad result means `ROLLBACK` and nothing happened.
- **One migration per transaction.** Never batch.
- **Take a backup immediately before each migration** once T-01 has made restore safe.
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. No migration in this plan needs it —
  use a plain `CREATE INDEX`, which can.
- If `apply_migration` auto-commits, use `execute_sql` with an explicit `BEGIN`/`COMMIT` block so you
  control the boundary.

**What this protocol does not protect against**, and you should know it: a migration that succeeds
and verifies but is *conceptually* wrong — right syntax, wrong intent. Only the Part 6 suite and
careful reading catch that. This is why R1 (additive only) matters more here than it would with
branching available.

> **If the organisation is upgraded to Pro**, prefer real branching — `create_branch` → apply →
> verify → `merge_branch` — and treat the transactional protocol as the fallback. Check with
> `mcp__Supabase__list_branches`; if it returns without error and the plan allows it, branching is on.

**Checks before any commit:**

```bash
pnpm lint
DATABASE_URL=... DIRECT_URL=... ./node_modules/.bin/prisma validate
pnpm build        # catches type errors the linter misses
```

---

## Part 2 — The execution loop

For every task, in order, without deviation:

1. **Claim the task** in `docs/IMPLEMENTATION_LOG.md` and push (Part 8), then read it fully, plus any task it depends on.
2. **Run the task's "before" verification query.** Record the number.
3. **Open a transaction** (`BEGIN`) if the task changes schema — see Part 1. Branching is unavailable on this plan.
4. **Make the change** — one task, one migration, one commit.
5. **Backfill** in the same migration as the schema change. Never separate them.
6. **Run the "after" verification query** plus the global suite in Part 6.
7. **If any global count moved and the task didn't predict it — STOP.** Revert, investigate, report.
8. **Run** `pnpm lint`, `prisma validate`, `pnpm build`.
9. **COMMIT** if every verification passed; `ROLLBACK` and stop if any failed.
10. **Commit** with the message given in the task.
11. **Append the result** to `docs/IMPLEMENTATION_LOG.md`: task ID, before/after numbers, anything surprising.

**Never batch tasks.** If T-07 fails, T-06 must still stand on its own.

**Stop conditions — halt and report rather than improvising:**

- A global verification count moved unexpectedly
- A migration fails partway, or a verification inside the transaction returns an unexpected value
- A task's "before" number doesn't match what this plan says it should be
- You are about to delete, overwrite or drop anything financial
- The change you think is needed contradicts this plan

That last one matters. If the codebase disagrees with this document, the codebase may have moved on — report the discrepancy, don't silently pick one.

---

## Part 3 — Standing rules

**R1 — Migrations are additive.** Add columns and tables. Never `DROP` a column holding financial data, never `DELETE` a financial row, never `UPDATE` an amount in place. Wrong values get a correcting row, not an edit.

**R2 — Schema, backfill and verify ship together.** A column added without a backfill leaves old rows meaning something different from new ones. That is precisely how `classification` reached 100% unused (F-20).

**R3 — Flag every inferred value.** Backfilled data gets a boolean (`cost_is_estimated`, `invoice_is_reconstructed`, `needs_review`), `true` for backfilled and `false` for new. An inference must never become indistinguishable from a fact.

**R4 — Verify with SQL, not the UI.**

**R5 — Never write a wallet balance directly.** Balances change only through a `wallet_transactions` row. This is F-03, F-34 and audit §9 in one sentence.

**R6 — Use atomic increments.** `{ balance: { increment: amount } }`, never `balance: readValue + amount`.

**R7 — Every financial write is one transaction.** `prisma.$transaction` at `Serializable` isolation, covering all legs.

**R8 — Never swallow an error.** No bare `await supabase.from(...)...`. Destructure `error` and handle it. This exact omission cost SRD 9,458 (F-15).

**R9 — The ledger is append-only.** Corrections are new entries. Only the existing scoped `app.finance_ledger_maintenance` path may bypass it.

**R10 — Guard at the handler, not just the proxy.** `src/proxy.ts` only checks a cookie *exists* — it never validates it and applies no role check. Every mutating route calls `requireAdmin` or `requireRole` in the handler itself (F-05).

**R11 — Prefer the reversible action.** Where a task could destroy information, choose the flag over the deletion, the correcting entry over the edit.

**R12 — Never invent a financial fact.** If a cost, a reason or an intent is unknown, mark it unknown and exclude it from derived figures. A confident wrong number is worse than a gap. See Part 5.

*One deliberate exception, and only this one:* T-18 seeds subscription amounts from published list prices, flagged `amount_is_estimated`, and includes them in the run rate. This is defensible because the alternative is recording a real recurring cost as **zero**, and because the schedule corrects itself from the first observed charge. The estimate is visible, bounded and self-healing. Do not generalise it — no other task may include an invented figure in a derived total.

---

## Part 4 — Anti-patterns already in this codebase

These are real, in production, and caused the findings. Recognise them and never reproduce them.

**Client-side multi-step financial writes** — `src/app/sales/page.tsx:467–860` issues ~8 sequential browser writes with a rollback that only deletes the sale header, leaving stock and wallet changes applied. Four sale headers in production have no line items as a result.

**Read-modify-write on balances** — `sales/page.tsx:715` writes `balance: matchingWallet.balance + total` from a value read at page load. Concurrent sales silently lose money.

**Unchecked writes** — `commissions/page.tsx:343` inserts into columns that do not exist (`category`, `payment_method`, `date`), omits the `NOT NULL` `wallet_id`, and never checks the error. It has failed silently on every commission payout.

**Hard deletes of financial records** — the undo-sale path deletes commissions, sale items, then the sale, permanently diverging the operational tables from the immutable ledger.

**Shipping columns nobody fills** — `expenses` has `classification`, `vendor_name`, `receipt_number`, `reviewed_at`. All 83 rows have none of them. A control that isn't enforced at entry doesn't exist.

**Features wired to nobody** — reconciliation has a table, a route, a cron and a UI, but the system has one user (an admin), zero sellers, and zero access rows. The cron matches nothing daily. The UI lives in the seller portal the admin never opens.

---

## Part 5 — Autonomous defaults for unknown facts

**You never stop to ask. You never guess either.** When a fact is genuinely unknown — whether an orphaned sale was real, whether SRD 500 was spent, whether "Anne Klein watch" was stock or personal — apply the default below and keep going.

The principle, in one line: **record the unknown as unknown, exclude it from every derived figure, and proceed.** That is not a deferral of the decision; it is the correct accounting treatment of an uncertain item, and it leaves every option open indefinitely.

This is what makes the run fully autonomous without inventing a single number.

**The default protocol, applied by T-09:**

Add to any affected financial row:

```sql
needs_review        BOOLEAN NOT NULL DEFAULT false
review_reason       TEXT
```

Then, for each unresolved item: set the flag, write the reason, **exclude the row from derived figures** (margin, run rate, payout base), and surface it on a review page. Change nothing else.

| Item | Size | Autonomous default — apply without asking |
|---|---|---|
| 4 sale headers with no line items | SRD 11,420.02 | Flag; exclude from margin and payout base |
| 4 header/line mismatches | SRD 1,050.02 | Flag; treat the line-item sum as authoritative for margin, keep the header for cash |
| Commissions paid vs wallet debits | SRD 1,451.38 | Flag; exclude from run rate |
| Blauwgrond wallet drift | SRD 500.00 | Record as an unexplained variance on the baseline reconciliation |
| Missing commission payout expenses | SRD 9,458.05 | **Report only — do not insert** |
| 5 zero-cost items | 2 sales | Flag; exclude from margin |
| "Personal Items" — 9 rows | SRD 10,662 | Leave `unclassified`, flag; exclude from run rate |

**Why the line-item sum wins on a mismatch.** It is the only figure with a cost attached, so it is the only one that can produce a margin. The header stays authoritative for cash because that is what moved through the wallet. Recording both, and saying which is used where, is more honest than picking one.

**Why "report only" for the SRD 9,458.** Inserting 106 backdated expenses would silently rewrite months already reviewed — an irreversible act on historical reporting, which R1 and R11 forbid. Write the proposed rows to `docs/reports/commission-payout-backfill.csv` and flag the affected commissions. The books stay honest either way: the expense is missing, and it is now *visibly* missing rather than silently missing.

**Nothing in this table blocks a task.** Every row has a default that preserves data and excludes uncertainty from derived figures. The run continues to completion.

---

## Phase A — Make it safe to change anything

Nothing else may start until this phase completes.

### T-01 — Make restore atomic 🔴 BLOCKS EVERYTHING

**Fixes:** F-33 · **File:** `src/app/api/backup/restore/route.ts`

`wipeAllTables()` opens a transaction (line 44) and commits it. The inserts then run table by table from the loop at line 507 through `prisma.` — **not** a shared transaction client. Nothing covers the restore as a whole, so a failure partway leaves the database wiped and half-populated with nothing to roll back to.

- Open one `prisma.$transaction` in `POST` spanning the wipe and every insert.
- Thread `tx` through `insertTable` and `upsertTable`; replace every `prisma.<model>` inside them with `tx.<model>`.
- Keep the existing `app.finance_ledger_maintenance` and `app.finance_ledger_recorded` scoping — that logic is correct.
- Raise `timeout` and `maxWait` in the transaction options; a full restore exceeds the 5s default. Use 120000ms.
- If one transaction proves impractical, restore into a staging schema and swap. **Do not ship the current behaviour.**

**Verify:** export a backup, corrupt one table's payload in the file, run the restore, and confirm the database is unchanged — not wiped. Do this inside a transaction you roll back, or against a local Supabase stack (`supabase start`), never as an uncontrolled production experiment.

**Done when:** a deliberately failed restore leaves the database exactly as it was.

**Commit:** `fix(backup): make restore atomic across wipe and insert`

### T-02 — Verified baseline backup

Export, download, restore into a fresh branch, and run Part 6's suite against the restored copy. Every number must match production. Keep the file for the whole project. **This is your rollback for everything that follows.**

### T-03 — Close the unguarded mutation endpoints

**Fixes:** F-05 · **Files:** `src/app/api/{delete-commissions,recalculate-commissions,fix-combo-price,migrate,delete}/route.ts`

None call `requireAdmin`. `src/proxy.ts` matches them but only checks that a `nextics_session` cookie exists — never validates it, no role check. A forged cookie passes, and `/api/delete-commissions` hard-deletes commission rows by ID.

- Add `requireAdmin(request)` to each handler, following `/api/debug-profit`.
- Delete `check-commission-currency.js` from the repo root.
- Mark `delete-commissions`, `recalculate-commissions`, `create-missing-commissions`, `check-commission` and `fix-combo-price` for deletion once T-11 lands — they are repair tools for the write path being fixed there.

**Verify:** each returns 401/403 with `Cookie: nextics_session=forged`.

**Commit:** `fix(api): require admin on financial mutation endpoints`

### T-04 — Harden ledger guard functions

**Fixes:** F-22

```sql
REVOKE EXECUTE ON FUNCTION public.capture_wallet_transaction_ledger() FROM anon, authenticated;
ALTER FUNCTION public.capture_wallet_transaction_ledger() SET search_path = public;
ALTER FUNCTION public.prevent_finance_ledger_mutation() SET search_path = public;
```

**Verify:** `mcp__Supabase__get_advisors` (type `security`) returns no warning for either function. Then insert a test wallet transaction and confirm a ledger entry still appears — the trigger must keep working.

**Commit:** `fix(db): harden ledger guard functions`

### T-05 — Scope RLS by company, location and role

**Fixes:** F-04 · New migration superseding `20260127000000_enable_rls_policies.sql`

All 80 policies are `FOR ALL USING (auth.role() = 'authenticated')` — any logged-in user can rewrite any wallet balance from the browser console.

The correct pattern already exists in this database: `finance_ledger_entries` and `wallet_reconciliations` have RLS enabled with **no policies at all** — deny-all through PostgREST, reachable only by server routes on a direct connection. Extend that posture.

- Deny-all on every financial table: `wallets`, `wallet_transactions`, `expenses`, `sales`, `sale_items`, `commissions`, `exchange_rates`, `finance_obligations`, `budgets`.
- Keep read policies only for genuinely public catalog data.

**Expect breakage, and treat it as a map.** Server routes use Prisma's direct connection and are unaffected. Anything that breaks is a browser-side financial query — record each one; it is the work list for T-11.

**Verify:** every admin page loads. `SELECT * FROM wallets` through the anon key returns zero rows.

**Commit:** `fix(db): replace blanket RLS with deny-all on financial tables`

### T-06 — Widen money columns

**Fixes:** F-09 · 26 columns cap at 99,999,999.99.

Amounts → `NUMERIC(18,4)`, rates → `NUMERIC(18,8)`. Widening is lossless and does not rewrite rows. Update `prisma/schema.prisma` to `@db.Decimal(18, 4)` / `@db.Decimal(18, 8)` and regenerate.

**Verify:** `SELECT round(sum(balance),2) FROM wallets` is unchanged at SRD 42,005.99 / USD 534.00.

**Commit:** `fix(db): widen money columns to NUMERIC(18,4)`

### T-07 — Fix the commission payout

**Fixes:** F-15 · **File:** `src/app/commissions/page.tsx:343`

The insert targets `category`, `payment_method`, `date` — none exist — omits `NOT NULL` `wallet_id`, and never checks the error. 106 commissions are marked paid worth SRD 9,458.05 with zero payout expenses recorded.

- Create `POST /api/commissions/payout` following `POST /api/expenses` exactly.
- One `Serializable` transaction: create expense (`classification: 'payroll'`, correct columns, `walletId` supplied), decrement wallet atomically, write `wallet_transactions`, `markFinanceLedgerRecorded` then `recordFinanceLedgerEntry`, `writeActivityLog({ client: tx })`, and flip `commissions.paid` — all of it, or none.
- Client calls the route and surfaces errors.

**Do not backfill the historical SRD 9,458 here** — that is T-09's report (Part 5).

**Verify:** pay a test commission inside a rolled-back transaction; confirm exactly one expense, one wallet debit, one ledger entry, `paid = true`. Force a failure mid-transaction and confirm nothing persists.

**Commit:** `fix(commissions): post payouts transactionally through the expense path`

### T-08 — Exchange rate staleness

**Fixes:** F-19 · Active rate is 38.0000, set 2026-06-05. Add a dashboard banner when the active rate is older than 7 days. Do not auto-fetch a rate; the owner sets it.

**Commit:** `feat(finance): warn when the exchange rate is stale`

---

## Phase B — Make the existing data honest

### T-09 — Review queue for unresolvable history

**Fixes:** the Part 5 items · **Fully automatable** — it defers decisions rather than making them.

```sql
ALTER TABLE public.sales    ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false,
                            ADD COLUMN review_reason TEXT;
ALTER TABLE public.expenses ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false,
                            ADD COLUMN review_reason TEXT;
ALTER TABLE public.items    ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false,
                            ADD COLUMN review_reason TEXT;

-- 4 sale headers with no lines — SRD 11,420.02
UPDATE public.sales s SET needs_review = true,
  review_reason = 'No line items: revenue recorded with no cost of goods. Restore lines or void.'
WHERE NOT EXISTS (SELECT 1 FROM public.sale_items si WHERE si.sale_id = s.id);

-- 4 header/line mismatches — SRD 1,050.02
UPDATE public.sales s SET needs_review = true,
  review_reason = 'Header total disagrees with sum of line items.'
FROM (SELECT sale_id, sum(subtotal) AS line_sum FROM public.sale_items GROUP BY sale_id) i
WHERE i.sale_id = s.id AND abs(s.total_amount - i.line_sum) > 0.01;

-- 5 items with no cost
UPDATE public.items SET needs_review = true,
  review_reason = 'Purchase cost is zero: sales of this item report 100% margin.'
WHERE purchase_price_usd = 0 AND deleted_at IS NULL;

-- 'Personal Items' — mixes inventory, personal spend and one Spotify charge
UPDATE public.expenses e SET needs_review = true,
  review_reason = 'Category mixes inventory, personal spending and a subscription. Classify individually.'
FROM public.expense_categories ec
WHERE ec.id = e.category_id AND ec.name = 'Personal Items';
```

Then: exclude `needs_review` rows from margin, run-rate and payout calculations everywhere; build an admin review page listing them with the reason; and generate a **report** (not inserts) of the 106 proposed commission-payout expenses totalling SRD 9,458.05.

**Verify:** 4 sales flagged for missing lines, 4 for mismatch, 5 items, 9 expenses. Zero rows deleted — all counts in Part 6 unchanged.

**Commit:** `feat(finance): flag unresolvable historical records for review`

### T-10 — Seller accounts and first reconciliation

**Fixes:** F-21, F-30, F-31

Reconciliation has never run because there is one user (admin), zero sellers, and zero `user_location_access` rows — so the daily cron matches nothing, and the only UI is in the seller portal.

- Create login accounts for **Rico** (Paramaribo-Noord), **Aryan Bhaggoe** (Commewijne Alkmaar) and **Leonardo** (Thurkowweg), each linked via `sellers.user_id`.
- Insert `user_location_access` with `can_manage_wallet = true` for their own location only.
- This activates the dormant cron and creates the first segregation of duties in the system.

**Establish the baseline without waiting for a physical count.** A human counting banknotes is the one step no software can perform, so the system must not block on it:

```sql
ALTER TABLE public.wallets
  ADD COLUMN physically_verified_at TIMESTAMPTZ,
  ADD COLUMN baseline_established_at TIMESTAMPTZ;
```

- Write a baseline reconciliation row per wallet with `expected_balance` from the ledger, `declared_balance` null, and `status = 'system_baseline'`.
- Set `baseline_established_at = now()`, leave `physically_verified_at` null.
- Record the SRD 500 Blauwgrond gap as an unexplained variance on its baseline row.
- **This baseline is the cutover position for T-21.** A later physical count posts a variance adjustment against it — through a transaction row, never a balance edit.

**Enforcement escalates on its own.** Add a `finance.reconciliation_enforcement` setting:

| Value | Behaviour | When |
|---|---|---|
| `warn` | Close and payout proceed; unverified wallets flagged | **Default.** Until the first physical count |
| `block` | Close and payout blocked while any wallet is unverified for over 45 days | Set automatically once every wallet has been physically verified at least once |

The system escalates itself the first time all 13 wallets carry a `physically_verified_at`. Automation runs from day one and tightens as the habit forms, with no one deciding to turn it on.

**Verify:** `SELECT count(*) FROM user_location_access` returns 3. Every wallet has a baseline row. The reminder cron creates notifications on its next run.

**Commit:** `feat(finance): seller accounts and system reconciliation baseline`

---

## Phase C — Trustworthy write paths

### T-11 — Move sale creation server-side

**Fixes:** F-02, F-03 · Replaces `src/app/sales/page.tsx:467–860`

Build `POST /api/sales`. Model it on `src/app/api/seller/sales/route.ts:89` and `POST /api/expenses`.

One `Serializable` transaction covering: sale header, sale items (with T-12's cost snapshot), stock decrement, commissions, wallet credit, wallet transaction, ledger entry, activity log. **Atomic increments only.** Delete the client-side write path entirely — the page calls the route.

Then delete the repair endpoints marked in T-03; they exist only because this path drifts.

**Verify:** fire two concurrent sales against one wallet and confirm the final balance equals the sum of both. Under the current code one silently overwrites the other. Force a mid-transaction failure and confirm no partial sale.

**Commit:** `fix(sales): create sales transactionally server-side`

### T-12 — Snapshot cost and FX onto sale lines

**Fixes:** F-01, F-18 · **Run T-09 first**, or zero costs freeze into history permanently.

```sql
ALTER TABLE public.sale_items
  ADD COLUMN unit_cost_usd NUMERIC(18,4),
  ADD COLUMN fx_rate_at_sale NUMERIC(18,8),
  ADD COLUMN cost_is_estimated BOOLEAN NOT NULL DEFAULT true;

UPDATE public.sale_items si
SET unit_cost_usd   = i.purchase_price_usd,
    fx_rate_at_sale = COALESCE(s.exchange_rate, 38.0),
    cost_is_estimated = true
FROM public.items i, public.sales s
WHERE si.item_id = i.id AND si.sale_id = s.id AND si.unit_cost_usd IS NULL;
```

Change `src/lib/reportCalculations.ts:107` to read `si.unit_cost_usd`, never `item.purchasePriceUsd`. New sales write real values with `cost_is_estimated = false`. Any report covering pre-cutover periods shows an "includes estimated costs" note.

**Verify:** no `sale_items` row has a null `unit_cost_usd`. Change an item's purchase price and confirm historical gross profit **does not move** — that is the whole point.

**Commit:** `fix(reports): snapshot unit cost and FX rate onto sale lines`

### T-13 — Void instead of delete

**Fixes:** F-06

Add `status` (`posted`/`voided`), `voided_at`, `voided_by`, `void_reason` to `sales`; backfill existing rows to `posted`. Undo posts reversing entries sharing the original `correlation_id`. **Remove every `.delete()` on a financial table.**

**Verify:** void a test sale; the original rows still exist, reversing entries appear, and reports exclude it.

**Commit:** `fix(sales): void sales with contra entries instead of deleting`

### T-14 — Reconciliation with variance

**Fixes:** F-21, F-34

```sql
ALTER TABLE public.wallet_reconciliations
  ADD COLUMN expected_balance NUMERIC(18,4),
  ADD COLUMN variance NUMERIC(18,4),
  ADD COLUMN variance_reason TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
```

The table currently stores only `confirmed_balance` — an assertion, not a reconciliation. Build an **admin** reconciliation page (not only the seller portal). Non-zero variance posts a ledger adjustment. Variance above a threshold requires a typed reason and blocks month-end close.

**Do not backfill `expected_balance` for historical rows** — there are none, and per F-34 the trail cannot be replayed.

**Commit:** `feat(finance): reconcile wallets on variance, not declared balance`

### T-15 — Mandatory expense controls

**Fixes:** F-20, F-27, F-29

Require date, vendor, receipt and classification at entry. Backfill by category:

| Category | Classification |
|---|---|
| Business Expense | `inventory` |
| Shipping | `operating` |
| Marketing | `marketing` |
| Copilot | `operating` |
| Personal Items | **leave `unclassified`** — T-09 flagged these |

Add a `Software & subscriptions` category and fold `Copilot` into it.

**Verify:** only the 9 flagged Personal Items rows remain unclassified.

**Commit:** `feat(expenses): require classification and documentation at entry`

### T-16 — Persistent invoice numbering

**Fixes:** F-17

```sql
ALTER TABLE public.sales
  ADD COLUMN invoice_number TEXT,
  ADD COLUMN invoice_is_reconstructed BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_sales_invoice_number
  ON public.sales (invoice_number) WHERE invoice_number IS NOT NULL;
```

Allocate from a gapless per-company sequence **inside** the sale transaction. Backfill historical sales deterministically by `created_at` order with `invoice_is_reconstructed = true`.

**Record this limitation in `IMPLEMENTATION_LOG.md` and tell the owner:** the original numbers used `Math.random()` and were never stored, so **pre-cutover customer invoice copies cannot be matched to reconstructed numbers.** If that matters for tax, it needs raising with their accountant now.

**Commit:** `feat(sales): persist gapless invoice numbers`

---

## Phase D — The three operational gaps

Full specification in audit §6 and §7.

### T-17 — Inventory health

**Fixes:** F-25, F-28 · Read-only, no schema change, zero risk. Do this first — it delivers visible value immediately.

`GET /api/finance/inventory-health` plus a `/finance` panel. Per item and location over 90 days:

```
dailyVelocity = unitsSoldInWindow / 90
daysOfCover   = quantityOnHand / dailyVelocity        (null when velocity is 0)
cashTiedUpUsd = quantityOnHand × purchasePriceUsd
```

Status: `out` (nothing on hand) → `dead` (velocity 0, stock > 0) → `overstocked` (> 120 days cover) → `low` (< 14 days) → `healthy`.

**Excess ≠ cash tied up.** Dead stock is entirely excess; overstock counts only the tail: `excessUnits = quantityOnHand − ceil(dailyVelocity × 120)`. Thresholds configurable without a deploy.

Add the purchasing ceiling: trailing-3-month COGS + buffer %, currently **SRD 13,611/month against SRD 16,344 being spent**.

**Verify against known production values:** USD 503.02 dead, USD 177.90 overstocked, USD 680.92 releasable, 26 of 38 rows dead. **If your numbers differ, your query is wrong.**

**Commit:** `feat(finance): inventory health and overstock detection`

### T-18 — Recurring subscriptions

**Fixes:** F-24 · Audit §6.1

New `recurring_expenses` table (name, vendor, amount, currency, cadence, anchor day, wallet, location, category, classification, `next_run_on`, `last_posted_at`, `is_active`, `auto_post`). Add `recurring_expense_id` and `period_key` to `expenses`.

**The idempotency rule — the part that must not be got wrong:**

```sql
CREATE UNIQUE INDEX idx_expenses_recurring_period_unique
  ON public.expenses (recurring_expense_id, period_key)
  WHERE recurring_expense_id IS NOT NULL AND period_key IS NOT NULL;
```

Period keys: `2026-08`, `2026-W33`, `2026-Q3`, `2026`. A double-fired cron, a retry, or a manual "run now" during the scheduled run cannot double-charge, because the second insert violates the index rather than relying on application logic to notice.

Rules: catch-up capped at **3 periods per run**; insufficient balance **skips and notifies**, never fails the batch or advances `next_run_on`; new schedules never back-charge (`next_run_on` = next upcoming occurrence); anchor day clamps to short months (31st → Feb 28); each schedule posts in its own currency.

Daily Vercel cron, auth `Bearer ${CRON_SECRET}` following `/api/notifications/wallet-reminders`. Add paths to `PROTECTED_API_PREFIXES` in `src/proxy.ts` **and** call `requireAdmin` in the handlers.

**Seed the three subscriptions automatically.** Do not wait for amounts. Add `amount_is_estimated BOOLEAN NOT NULL DEFAULT false` and `anchor_day_is_estimated BOOLEAN NOT NULL DEFAULT false`, then insert against the USD operational wallet, category `Software & subscriptions`, classification `operating`:

| Name | Vendor | Amount | Basis |
|---|---|---|---|
| Spotify | Spotify | USD 12.00/mo | **Derived from your own data** — the misfiled SRD 456 charge of 2026-01-14 ÷ 38 |
| Claude | Anthropic | USD 20.00/mo | Published list price, flagged estimated |
| Codex | OpenAI | USD 20.00/mo | Published list price, flagged estimated |

All three: `anchor_day = 1`, both estimate flags `true`, `auto_post = true`.

**Then let them self-correct.** Estimated schedules learn from reality rather than from a person:

- When a manually entered expense matches a schedule's vendor within ±40% of its amount, update the schedule's amount and anchor day to the observed values and clear the estimate flags.
- When a posted charge is later corrected, adjust the schedule to the corrected amount.
- Flag any schedule still estimated after 60 days on the review page — visible, not blocking.

An estimated subscription that is 20% wrong still puts your true operating cost within a few hundred SRD of reality, which is a far smaller error than the current one — where it is recorded as **zero**.

**Verify:** run the cron twice consecutively — the second run posts nothing. Enter a manual Spotify expense at a different amount and confirm the schedule updates itself and clears the flag.

**Commit:** `feat(finance): recurring subscription expenses with exactly-once posting`

### T-19 — Owner payout

**Fixes:** F-26 · Audit §7 · **Requires T-07 and T-15**, or the run rate comes from unclassified data.

A draw is an expense with `classification = 'owner_draw'` — already exists, already excluded from operating profit. Add `payout_runs` for the month-end batch, plus `founders` with fixed split percentages.

**Waterfall.** Commissions are a cost above the line — resellers are paid first, always. Then distributable profit splits **savings 65% / founders 20% / restock cap 15%**, moving to 50/30/20 once savings clears SRD 23,439.

**Base is the trailing three-month average**, not the current month. Negative average pays zero. Draw never exceeds operating cash above the reserve floor. Restock % is a **purchasing ceiling, not a transfer**.

**Month-end sequence, fully automatic:** subscriptions post on their anchor days → last day 23:00 the close job verifies subscriptions posted and commissions recorded, computes the allocation, evaluates the circuit breakers below, and **posts atomically under one `correlation_id`** — or downgrades itself to a draft.

**Auto-post is the default.** The safety is mechanical, not a person clicking approve. Every breaker below is evaluated before posting; **any one that trips downgrades the run to a draft and notifies, rather than posting:**

| Breaker | Condition | Rationale |
|---|---|---|
| Negative earnings | Trailing-3 distributable ≤ 0 | Pays zero. A percentage of a loss is zero, not a smaller draw |
| Reserve floor | Operating cash after the draw < reserve floor | Never fund a draw out of the buffer |
| Hard cap | Computed draw > policy % of trailing-3 | Arithmetic error guard |
| Absolute ceiling | Draw > `finance.payout_max_srd` | Blast radius limit, default SRD 10,000 |
| Anomaly | Draw more than 2× the trailing-3-month average draw | Catches a data error before it becomes a payment |
| Data integrity | Any wallet variance unexplained, or a subscription due this month unposted | Do not pay out of books known to be wrong |
| Stale FX | Active exchange rate older than 30 days | A USD leg priced on a stale rate misstates what left |
| Reconciliation | Under `block` enforcement, any wallet unverified 45+ days | Off by default per T-10, escalates on its own |

**Reversibility is what makes auto-posting safe.** A posted run is never deleted — it is reversed by contra entries sharing its `correlation_id` (T-13). A wrong payout is a correctable event, not a lost one. Combined with the ceiling and the anomaly breaker, the worst case is a bounded, fully traceable, reversible transfer between accounts you own.

Per-run options remain available for manual runs and for editing a draft: recipients and split, source wallet, method, amount override with reason, defer/skip, savings transfer adjust. Savings moves as a `wallet_transfer` to the existing savings wallet.

**Verify each breaker with a synthetic month inside a rolled-back transaction** — force a negative trailing average, a reserve breach, a 3× anomaly, and an unposted subscription, and confirm each downgrades to a draft rather than posting.

**Verify against the back-test:** trailing-3 for 2026-07 is SRD 4,789 and 20% is SRD 958. **If your code produces a different number, reconcile before shipping.**

**Commit:** `feat(finance): month-end payout runs on a percentage waterfall`

---

## Phase E — Company, ledger, group

### T-20 — Company entity

**Fixes:** F-07

```sql
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, legal_name TEXT, base_currency TEXT NOT NULL DEFAULT 'SRD',
  tax_id TEXT, fiscal_year_start_month INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.companies (name, base_currency) VALUES ('NextX', 'SRD');
ALTER TABLE public.locations ADD COLUMN company_id UUID REFERENCES public.companies(id);
UPDATE public.locations SET company_id = (SELECT id FROM public.companies LIMIT 1);
ALTER TABLE public.locations ALTER COLUMN company_id SET NOT NULL;
```

Then `company_id` on every financial table, backfilled via `location_id`, then `NOT NULL`. Denormalised deliberately so RLS never needs a join.

**The three locations are branches of one company, not three companies.** All map to NextX.

**Verify:** no financial row has a null `company_id`; all counts unchanged.

**Commit:** `feat(db): add company entity and scope financial tables`

### T-21 — Chart of accounts and double-entry

**Fixes:** F-08, F-12, F-13

`accounts`, `journal_entries`, `journal_lines`, with a deferred constraint enforcing debits = credits per entry. Keep `finance_ledger_entries` as the cash subledger beneath it. Account numbering in audit §5 and §8.1.

**Do not backfill journal entries for history.** Post an opening-balance journal at the cutover date from T-10's counted positions, and run double-entry forward only. Per F-34, replaying history would encode SRD 232,403 of manual corrections as though they were real transactions.

**Commit:** `feat(finance): double-entry journal above the cash subledger`

### T-22 — Period close and lock

**Fixes:** F-11 · `accounting_periods` with a trigger rejecting journal lines dated inside a locked period. Close blocks on unreconciled wallets, unposted subscriptions or unclassified expenses.

**Commit:** `feat(finance): accounting periods with lock enforcement`

### T-23 — Assets and investments

**Fixes:** F-32 · Audit §8

`investment_holdings` (investee, instrument, ownership %, cost, carrying value, valuation method) and `fixed_assets` (category, cost, depreciation method, useful life, disposal).

Two rules to encode: an investment purchase is `Dr Investments / Cr Cash` and **must not reduce distributable profit**; unrealised gains post to equity (3400), **never to profit**, so a paper markup can never fund a founder draw. Recognition by band — under 20% cost, 20–50% equity method, over 50% full consolidation.

Depreciation reuses T-18's scheduler with the wallet debit suppressed.

**Commit:** `feat(finance): investment and fixed asset registers`

### T-24 — FX revaluation

**Fixes:** F-10 · Revalue USD holdings at period close, posting to FX gain/loss.

### T-25 — Group consolidation

With T-20 done this is an **"All companies" view — a query, not an integration.** Build the signed versioned snapshot contract (audit §8.5) **only if a fork actually happens.** Never fork before T-20: a fork without company identity has nothing to consolidate on.

---

## Phase F — Automation

### T-26 — Bill inbox

 OCR a supplier invoice into a draft expense, approval queue, posts on approve. The columns already exist.

### T-27 — Month-end close checklist

 Gates the period lock: subscriptions posted, wallets reconciled, expenses classified, FX revalued, payout drafted.

---

## Part 6 — Verification suite

Run after every task. All values are production as of 2026-08-12.

```sql
-- Must always be zero
SELECT count(*) FROM sale_items si LEFT JOIN sales s ON s.id=si.sale_id WHERE s.id IS NULL;
SELECT count(*) FROM wallet_transactions wt
  LEFT JOIN finance_ledger_entries l ON l.wallet_transaction_id=wt.id WHERE l.id IS NULL;
SELECT count(*) FROM stock WHERE quantity < 0;
SELECT count(*) FROM wallets WHERE balance < 0;
SELECT count(*) FROM expenses WHERE wallet_id IS NULL;

-- Must not move unless the task says it will
SELECT count(*) FROM sales;                                       -- 149
SELECT count(*) FROM sale_items;                                  -- (record at T-02)
SELECT count(*) FROM wallet_transactions;                         -- 490
SELECT count(*) FROM finance_ledger_entries;                      -- 490
SELECT count(*) FROM expenses;                                    -- 83
SELECT count(*) FROM commissions;                                 -- (record at T-02)
SELECT round(sum(balance),2) FROM wallets WHERE currency='SRD';   -- 42005.99
SELECT round(sum(balance),2) FROM wallets WHERE currency='USD';   -- 534.00
```

**If a count moves and no task predicted it: stop, revert, investigate.**

---

## Part 7 — Order and dependencies

```
A  T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-07 → T-08
B  T-09 → T-10
C  T-11 → T-12 → T-13 → T-14 → T-15 → T-16
D  T-17 → T-18 → T-19
E  T-20 → T-21 → T-22 → T-23 → T-24 → T-25
F  T-26 → T-27
```

**Hard dependencies:**

| Task | Requires | Why |
|---|---|---|
| everything | T-01 | no safe rollback until restore is atomic |
| T-12 | T-09 | zero costs would freeze into history |
| T-19 | T-07, T-15 | run rate must come from classified data |
| T-21 | T-10 | the opening journal posts from T-10's reconciliation baseline |
| T-25, any fork | T-20 | nothing to consolidate on without company identity |

Phases A and B are roughly two weeks and remove most of the risk. Full sequence 14–18 weeks at a steady pace.

---

## Part 8 — Working alongside another agent

This project is executed by **two agents — Codex and Claude**. They share one repository and, more
importantly, **one production database**. Everything below exists because concurrent schema changes
against a single Postgres instance holding real money is the one failure mode this plan cannot
recover from.

### The single writer rule

**Only one agent applies migrations to production. Ever.**

Designate that agent at the start — it must be the one holding Supabase MCP access. The other agent
does code-only work and **never** calls `apply_migration`, `execute_sql` with DDL, or any schema change. If you are
the code-only agent and a task requires a migration, stop and hand the task over rather than
finding another route to the database.

Two agents applying DDL concurrently can interleave a schema change with a backfill and leave
columns half-populated with no error raised. There is no verification query that reliably catches
this after the fact.

### Claiming a task

`docs/IMPLEMENTATION_LOG.md` is the coordination point. Before starting any task, append a claim and
**commit and push it before writing any other code**:

```markdown
## T-07 — claimed by claude — 2026-08-13T09:14Z — in progress
```

Then on completion:

```markdown
## T-07 — claude — 2026-08-13T10:02Z — DONE
Before: 0 commission payout expenses / 106 commissions paid
After:  1 test payout posted and reverted; route live
Notes:  deleted check-commission-currency.js as instructed
```

Rules:

- **Pull before claiming.** If the task is already claimed, take the next unclaimed task whose
  dependencies are met.
- **One task in progress per agent.** Never claim ahead.
- **A claim older than 2 hours with no completion is stale** — note it, and take it over.
- **Never work on an unclaimed task without claiming it first.** The push is the lock.

### Splitting the work

Play to what each agent is actually good at rather than alternating arbitrarily:

| Task | Suited to |
|---|---|
| T-01, T-04, T-05, T-06, T-09, T-12, T-14, T-20, T-21, T-22 | **The migration agent.** Schema, SQL, backfills, verification |
| T-11 (`sales/page.tsx`, 1,972 lines), T-13, T-16, T-17 | **Either.** Large code refactors with no DDL |
| T-03, T-07, T-08, T-15 | **Either**, but T-07 and T-15 touch schema — coordinate |
| T-18, T-19 | **The migration agent** — both add tables and cron routes |

**Phase A is strictly sequential and single-agent.** T-01 through T-08 must be executed by one agent
in order, with no parallelism at all. Parallel work may only begin at Phase C, and only for tasks
whose dependencies in Part 7 are already satisfied.

### Merge discipline

- Both agents work on `claude/financial-audit-multicompany-37c5mz` unless told otherwise.
- **Pull and rebase before every commit.** Two agents editing `prisma/schema.prisma` will conflict;
  resolve by keeping both sets of model changes, never by discarding one.
- If a rebase conflicts inside a migration file, **do not merge them.** Migrations are ordered by
  filename and applied once — keep both files separately and let them run in sequence.
- Never force-push.

### If the two of you disagree

If your reading of a task contradicts what the other agent already did — or contradicts this
document — **stop and report rather than "fixing" it.** A financial migration silently reversed by a
second agent is worse than either version. The audit's numbers in Part 6 are the tiebreaker: whichever
state reproduces them is correct.

---

## Part 9 — On running unattended

This plan is built to complete without a human in the loop. Three things make that safe, and they are all mechanical:

**Uncertainty is recorded, never resolved by guessing.** Part 5 gives every unknown a default that preserves data and keeps it out of derived figures. Nothing is invented, so nothing needs approving.

**Risk is bounded by circuit breakers, not by attention.** The only task that moves money outward on its own — T-19 — evaluates eight conditions before posting and downgrades itself to a draft if any trips. Anything it does post is reversible by contra entries under one correlation ID.

**Enforcement escalates by itself.** Reconciliation starts in `warn` so the system runs from day one, and switches to `block` the first time all 13 wallets have been physically verified. No one has to remember to tighten it.

**One thing genuinely cannot be automated**, and it is not a software limit: somebody has to physically count the banknotes in a drawer. The system no longer waits for it — T-10 establishes a ledger baseline and proceeds — but until a person counts, every wallet balance is the system's belief rather than a verified fact. Given F-34, where SRD 232,403 of manual corrections exceeded lifetime revenue, that distinction is worth keeping visible on the dashboard rather than quietly assuming away.

**Two design choices deserve to be understood rather than just followed.** Auto-posting a payout is safe here specifically *because* the ledger is append-only and reversal is a contra entry — remove that property and the breakers alone would not be enough. And estimated subscription amounts are acceptable *because* being 20% wrong on USD 52/month beats the status quo of recording it as zero; that trade would not hold for a larger cost.

**A closing instruction.** This plan encodes decisions made against real production data. Where it states a number — SRD 958, USD 680.92, 490 ledger entries — that number was measured, and your implementation must reproduce it. Where it says stop, stop; the stop conditions in Part 2 are not advisory, and they exist because the system holds SRD 42,006 of real money in cash wallets. Every failure in `docs/FINANCIAL_AUDIT.md` began as a small convenience: an unchecked write, a balance read before it was written, a column nobody filled.
