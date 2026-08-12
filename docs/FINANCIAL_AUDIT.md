# NextX Financial Audit & Multi-Company Architecture

**Date:** 2026-08-12
**Scope:** Prisma schema (47 models), 53 API routes, `src/proxy.ts` route protection, Supabase migrations, every client-side financial write path, **and verification against the live production database** (project `ivvhazwjtnyznojeoojs`, 149 sales / 490 wallet transactions / 83 expenses)
**Question answered:** Adopt Odoo 19, or build on the existing system, given the move to multi-company?

> All queries run against production were read-only `SELECT`s. No data was modified.

---

## 1. The decision: build, don't migrate

**Recommendation: keep building on what you have. Adopt Odoo's *accounting model*, not Odoo itself.**

The instinct behind the question is right — Odoo 19's automated bill-processing flow is genuinely good, and the thing you are missing is real accounting. But migrating to Odoo would trade a small win for a large loss.

**What Odoo would give you**

Double-entry general ledger, chart of accounts, native multi-company with consolidation, multi-currency with FX revaluation, AP/AR aging, bank reconciliation, tax/VAT reporting, lock dates, and the automated bill/invoice ingestion (OCR → draft bill → approval) you're inspired by.

**What Odoo would cost you**

Your system is not primarily an accounting system. It is an operational system with accounting attached, and the operational half is where your business logic lives:

| Your capability | Odoo fit |
|---|---|
| Per-person cash wallets, SRD + USD, cash vs bank, `purpose` scoping | Poor — Odoo has journals and analytic accounts, not "cash Kevin is holding." You'd force it into analytic tags and lose the accountability model |
| Seller commissions with per-category rates (`seller_category_rates`) | Poor — needs a custom module |
| Location-scoped stock, reservations, combo pricing, custom-price with discount reason | Partial — heavy customization |
| Watches + audio dual catalog, webshop, CMS, banners, collections, blog | Rebuild in Odoo's stack |
| Next.js 16 / React 19 / TypeScript frontend the team knows | Discarded — Odoo is Python + XML + OWL |

Realistically Odoo replaces perhaps 30% of what you run and forces a rewrite of the other 70% into an unfamiliar stack. Expect 4–8 months, Enterprise licensing per user *per company*, and probably an implementation partner — during which operational feature delivery stops.

**The deciding factor**

You already built the hard part of a ledger. `finance_ledger_entries` is append-only and enforced at the database level by `prevent_finance_ledger_mutation()`, with automatic capture from `wallet_transactions` via trigger. **Production confirms it works: 490 wallet transactions, 490 ledger entries, zero gaps.** That immutability guarantee is the piece most teams get wrong. What's missing on top of it is a chart of accounts and debit/credit pairs — weeks of work, not months.

Also note: **a `Company` entity has to be built either way.** Odoo would not save you the modelling work of deciding what a legal entity means in your business; it would just move it.

**A caveat worth stating plainly.** The findings in §4 mean your current books would not survive an external audit today — roughly 6.7% of recorded revenue carries no cost of goods, and SRD 9,458 of commission payouts never reached the expense ledger at all. That is an argument for fixing the write paths urgently, not for migrating. Migrating on top of unreliable data just relocates the problem, and you would still have to clean it before import.

**When to revisit Odoo:** if you need statutory audited financials or VAT filings across several legal entities, add Odoo (or any standard package) *downstream* as the book of record, fed by a nightly journal export from your ledger. You get compliance and BPA-style automation without surrendering the operational system.

---

## 2. What's already right

Worth stating plainly, because it's the reason the build path works:

- **Immutable ledger.** `finance_ledger_entries` blocks UPDATE/DELETE at the DB layer, with a clear message directing you to corrective entries. This is correct accounting practice.
- **Automatic ledger capture, verified.** The `wallet_transactions_capture_ledger` trigger has captured 490 of 490 wallet transactions with no gaps — the backstop holds despite finding F-02.
- **FX rate snapshot on sales, verified.** Zero USD sales are missing an `exchange_rate`. That discipline has held across every sale.
- **Commission arithmetic is internally consistent.** Zero rows where `commission_amount` disagrees with `total_amount × rate`. The maths is right; the *plumbing around it* is where the problems are (F-15, F-16).
- **No negative stock**, no negative wallet balances.
- **Correlation IDs** on ledger entries — the foundation for grouping the legs of a future double-entry transaction.
- **Expense control columns exist** — classification, status, vendor, receipt, reviewer, refund tracking. The schema thinking is right (they're just unused — F-20).
- **`DECIMAL` throughout** rather than floats, and an obligations table with due dates and source tracing.

---

## 3. Reconciliation against production

This is what separates an opinion from an audit. Every number below came from a read-only query against live data.

### 3.1 Ledger integrity — passes

| Test | Result |
|---|---|
| Wallet transactions captured into the immutable ledger | 490 / 490 — **no gaps** |
| USD sales missing an FX rate snapshot | 0 |
| Commission amount vs rate × sale total | 0 mismatches |
| Negative stock rows | 0 |
| Negative wallet balances | 0 |

### 3.2 Reconciliation breaks — fails

| Test | Result |
|---|---|
| Wallet balance vs last recorded `balance_after` | **1 wallet adrift by SRD 500.00** (Paramaribo-Noord Blauwgrond, bank/SRD: balance reads 0.00, transaction history says 500.00) |
| Sale headers with no line items | **4 of 149** — carrying SRD 11,420.02 of revenue with zero COGS |
| Sale header total vs sum of line items | **4 sales**, SRD 1,050.02 combined gap, worst single SRD 350.00 |
| Sales with a seller but no commission row | **8** |
| Commission payouts recorded as expenses | **0**, against 106 commissions marked paid worth **SRD 9,458.05** |
| Commissions marked paid vs commission wallet debits | SRD 9,458.05 paid vs SRD 8,006.67 debited — **SRD 1,451.38 unexplained** |
| Expenses with no matching wallet transaction | 2 |
| Wallet reconciliations ever performed | **0**, against SRD 42,005.99 + USD 534.00 across 13 wallets |

### 3.3 Revenue recorded with no cost of goods

| | SRD |
|---|---|
| Total recorded revenue (all sales, at each sale's own FX rate) | 211,976.02 |
| From the 4 item-less sale headers | 11,420.02 |
| From items whose `purchase_price_usd` is 0 (5 of 39 active items, 2 sales) | 2,800.00 |
| **Revenue booked at 100% margin** | **14,220.02 — 6.7%** |

Gross profit is overstated by roughly SRD 14,220 before considering F-01 at all.

### 3.4 Control adoption — the columns exist, nobody fills them

Of 83 expenses: **83 have no date, 83 have no vendor, 83 have no receipt number, 83 have never been reviewed, and 83 are `unclassified`.** Adoption of the expense-control migration is exactly zero. Purchase orders: 0 records, so item cost only ever comes from a manually typed field.

---

## 4. Findings

### Critical

**F-01 — Historical gross profit is retroactively mutable (COGS is not snapshotted)**

`sale_items` records `unit_price` but no cost. `calculateSaleFinancials` computes COGS from live master data:

```
src/lib/reportCalculations.ts:107
  const cogsUsd = items.reduce(
    (sum, item) => sum + (toReportNumber(item.purchasePriceUsd) * item.quantity), 0)
```

Editing an item's purchase price silently rewrites gross profit on **every past sale of that item**. Last quarter's margins change when you renegotiate with a supplier. Compounding this, `cogsSrd = cogsUsd * exchangeRate` applies a *current* rate to a *historical* cost, so SRD margins drift with every FX move. With 0 purchase orders on record, that manually-typed field is the only cost input the system has ever had.

*Fix:* add `unit_cost_usd` and `fx_rate_at_sale` to `sale_items`, written at sale time. Backfill from current values with a flag marking them as estimated.

**F-02 — Financial writes are client-side, non-atomic, on the anon key**

`src/app/sales/page.tsx:467–860` performs roughly eight sequential unguarded writes from the browser: `sales` → `sale_items` → `stock` → `commissions` → `wallets` → `wallet_transactions`. Any failure or closed tab mid-sequence leaves partial financial state. The only rollback is a manual delete of the sale header (`sales/page.tsx:509`) — which does not undo stock decrements or wallet credits that happen *after* it.

**Production evidence:** 4 sale headers exist with no line items, carrying SRD 11,420.02 and with commissions and wallet credits already posted against 3 of them. A further 4 sales disagree with their own line items by SRD 1,050.02. That is 8 of 149 sales — 5.4% — with header/line disagreement.

*Fix:* one server route, one `prisma.$transaction`. The pattern already exists at `src/app/api/seller/sales/route.ts:89`.

**F-03 — Wallet and stock balances use read-modify-write (lost updates)**

```
src/app/sales/page.tsx:715
  .update({ balance: matchingWallet.balance + total })
```

`matchingWallet.balance` was read at page load. Two concurrent sales against the same wallet: the second overwrites the first and that money vanishes from the balance. Same pattern for stock at `sales/page.tsx:528`.

**Production evidence:** the Blauwgrond bank/SRD wallet reads 0.00 while its own transaction history ends at 500.00.

*Fix:* atomic SQL increments (`balance = balance + $1`), or derive balances from the ledger and treat `wallets.balance` as a cache.

**F-04 — RLS grants every authenticated user full control of all financial data**

All 80 policies in `20260127000000_enable_rls_policies.sql` follow:

```sql
CREATE POLICY "Allow authenticated users" ON public.wallets
  FOR ALL USING (auth.role() = 'authenticated');
```

`FOR ALL` on `wallets`, `expenses`, `sales`, `commissions`, `exchange_rates` — with no location scoping and no role check. Combined with the anon key shipped to the browser (`src/lib/supabase.ts`), any user who can log in can rewrite any wallet balance or delete any commission from the browser console. There is no segregation of duties at the data layer, and this gets materially worse the moment two legal entities share the database.

Notably the posture is *inconsistent*: `finance_ledger_entries`, `wallet_reconciliations`, `user_location_access` and `app_sessions` have RLS enabled with **no policies at all** (deny-all through PostgREST — which is correct), while every other financial table is allow-all. The strict default is already proven to work; extend it.

**F-05 — Financial mutation endpoints are gated only by an unvalidated cookie**

> Corrected from the first draft of this audit, which said these endpoints had no guard at all. They do have one — `src/proxy.ts`, Next 16's middleware — but it does not do what it looks like it does.

`/api/delete-commissions`, `/api/recalculate-commissions`, `/api/fix-combo-price`, `/api/migrate` and `/api/delete` have no `requireAdmin` call in their handlers (compare `/api/debug-profit`, which does). They are matched by `src/proxy.ts`, which rejects requests carrying no `nextics_session` cookie.

But the proxy only checks that the cookie **exists**. It never validates it — its own comment says the session is "opaque and verified in route handlers," and these particular handlers do no verification. So:

- any forged value passes — `document.cookie = 'nextics_session=x'` is enough
- there is no role check, so a seller account passes too

The net exposure is unchanged for `/api/delete-commissions`, which hard-deletes commission rows by ID: a single unauthenticated request destroys commission history. The guard is real but decorative.

*Fix:* add `requireAdmin` to each handler, or delete them. Repair endpoints should not exist in production once F-02 is fixed.

**F-15 — Commission payouts write to columns that don't exist, and fail silently**

`src/app/commissions/page.tsx:343`:

```js
await supabase.from('expenses').insert({
  location_id: ..., category: 'Commissions', description: ...,
  amount: totalToPay, currency: ..., payment_method: wallet.type,
  date: new Date().toISOString()
})
```

The `expenses` table has no `category`, no `payment_method` and no `date` column, and its `wallet_id` is `NOT NULL` but is never supplied. **This insert fails 100% of the time.** The result is never checked — no `error` destructuring, no `.select()` — so it fails without a sound.

**Production evidence:** 0 commission-payout expenses exist, against 106 commissions marked paid worth **SRD 9,458.05**. Operating expenses are understated by that amount, and every margin and profit figure the dashboard has ever shown is correspondingly overstated.

*Fix:* correct the column names, supply `wallet_id`, check the error, and move the payout into the same server-side transaction that flips `commissions.paid`.

### High

**F-06 — "Undo Sale" hard-deletes financial records**

`src/app/sales/page.tsx` deletes commissions, then sale items, then the sale. Accounting convention is never to delete — you post a reversing entry. Because the ledger is correctly immutable while the subledger rows are destroyed, ledger and operational tables **permanently diverge** after every undo. This is the most likely origin of the 4 orphaned headers found in production.

*Fix:* `status = 'voided'` plus contra entries sharing the original `correlation_id`.

**F-07 — No company / legal entity in the data model**

The schema has `Location` and nothing above it; every financial table scopes by `location_id`. A location is not a legal entity — one company has many locations, and multi-company demands per-entity books, intercompany elimination and separate statements. This is the central blocker for your stated direction.

**F-08 — The ledger is single-entry**

`finance_ledger_entries` has `direction: in|out` and a single `amount`. That's a cash-movement journal, not double-entry. Without a chart of accounts and balanced debit/credit legs you can produce a cash-flow view but **not a balance sheet or trial balance** — and no way to prove the books balance. Inventory, receivables, payables and equity are invisible as accounts.

**F-09 — `Decimal(10,2)` will overflow**

26 money columns cap at 99,999,999.99. At 38 SRD/USD that ceiling is about USD 2.6M. Your largest single wallet is SRD 18,255.99 and lifetime revenue is SRD 211,976 — comfortable now, but cumulative aggregates and multi-entity consolidation shorten the runway fast. Rates at `Decimal(10,4)` are tight too.

*Fix:* `Decimal(18,4)` for amounts, `Decimal(18,8)` for rates.

**F-16 — Commissions marked paid without a matching wallet debit**

SRD 9,458.05 of commissions are flagged `paid`, but commission-related wallet debits total only SRD 8,006.67 across 11 transactions. **SRD 1,451.38 was marked as paid without money leaving any wallet on record.** Either cash left the business untracked or the flag was set without payment; both need reconciling manually before any ledger migration.

**F-17 — Invoice numbers are random, never stored, and not reproducible**

```
src/app/sales/page.tsx:433
  return `INV-${year}${month}${day}-${random}`   // Math.random(), 4 digits
```

There is no `invoice_number` column anywhere in the schema. The number handed to the customer exists only in that browser session and in the activity log. Reprinting later calls `generateInvoiceNumberFromSale()` (line 949), which builds `INV-YYYYMMDD-{last 6 of the UUID}` — **a different number than the customer received.** Reservations introduce a third format, `RES-COMP-{timestamp}`.

Consequences: you cannot match a customer's invoice to a sale record; numbering is neither sequential nor gapless, which most jurisdictions require for tax purposes; and random 4-digit suffixes collide within a day at a meaningful rate.

*Fix:* a persisted, per-company, gapless sequence allocated inside the sale transaction, stored on the sale.

**F-18 — 6.7% of recorded revenue carries no cost of goods**

SRD 14,220.02 of SRD 211,976.02: SRD 11,420.02 from the four item-less headers and SRD 2,800.00 from five active items priced at zero cost. All of it is currently reported at 100% margin. This is separate from — and additive to — the F-01 distortion.

### Medium

**F-10 — No FX revaluation, no realized/unrealized gain tracking.** USD wallets (USD 534.00 outstanding) are never revalued and there is no FX gain/loss account.

**F-19 — The exchange rate is stale.** One active rate, fixed at 38.0000 and last set 2026-06-05 — **68 days ago**. Every USD-to-SRD conversion in reporting, and every new sale's snapshot, uses a rate over two months old. Under SRD volatility this is material and compounds F-01's `cogsSrd` problem.

**F-11 — No period close or lock date.** Nothing prevents backdating into a reported month or editing last year.

**F-12 — Commission is not recognised as a liability when earned.** 16 unpaid commissions worth SRD 1,431.63 sit as an unrecorded obligation, so margins look better than they are.

**F-13 — Obligations are disconnected from the ledger.** `finance_obligations` has no AR/AP accounts behind it, so it can't roll into a balance sheet or an aging report.

**F-14 — Budget `amount_spent` is a denormalised counter** with no reconciliation against actual expenses. Only 1 budget exists.

**F-20 — Expense controls are 100% unused.** All 83 expenses lack a date, vendor, receipt number and review, and all are `unclassified`. The migration shipped columns nobody fills, so expense reporting by category is impossible today. Controls need to be required at the point of entry, not merely available.

**F-21 — No wallet has ever been reconciled.** Zero rows in `wallet_reconciliations` against SRD 42,005.99 and USD 534.00 held across 13 wallets. For a cash-heavy business this is the single biggest theft-and-error exposure, and it is the control most likely to have caught the SRD 500 drift in F-03.

**F-22 — Ledger-guard functions are not hardened.** `capture_wallet_transaction_ledger()` is `SECURITY DEFINER` and remains executable by the `anon` and `authenticated` roles via `/rest/v1/rpc/`, despite the migration's `REVOKE ... FROM PUBLIC` (which does not cover explicit role grants). `prevent_finance_ledger_mutation()` — the function enforcing ledger immutability — has a mutable `search_path`. The guard protecting your books is itself the least hardened object in the schema.

*Fix:* `REVOKE EXECUTE ... FROM anon, authenticated` and add `SET search_path = public` to both.

### The three operational gaps

These came from your own list — subscriptions not deducting, too much stock, and paying yourselves. Each turned out to be a real finding with numbers behind it.

**F-24 (High) — There is no recurring expense mechanism, so subscriptions are invisible**

No table in the database models a schedule: nothing matching `recurring`, `subscription`, `payout` or `schedule` exists. Every expense is entered by hand, one at a time.

**Production evidence:** across 83 expenses since January, **exactly one** mentions a subscription vendor (Spotify, Claude, Codex, OpenAI, Anthropic, or the word subscription). Your expense categories are `Business Expense | Copilot | Marketing | Personal Items | Shipping` — there is no software or subscription category, and the `Copilot` category suggests one tool was tracked once and the habit lapsed.

So Codex, Claude and Spotify have been charging your cards for months while the books show almost nothing. Two consequences: operating costs are understated by the full run rate of those subscriptions, and no wallet is ever debited, so cash on hand in the system drifts above reality.

**F-25 (High) — 86% of inventory capital is dead or overstocked**

Nothing in the system reports stock against sales velocity, so there has never been a signal for "too much stock."

**Production evidence**, measured over a 90-day window across 38 stocked item/location rows holding 96 units:

| | Rows | Units | Capital |
|---|---|---|---|
| Total stock on hand | 38 | 96 | USD 788.57 |
| **Dead** — zero sales in 90 days | **26** | **41** | **USD 503.02** |
| **Overstocked** — over 120 days of cover | 5 | — | USD 177.90 |
| **Dead + excess combined** | | | **USD 680.92 — 86% of inventory capital** |

At 38 SRD/USD that is roughly SRD 25,900 sitting still, against SRD 42,006 of cash on hand. Two thirds of your stocked lines have not sold a single unit in three months.

**F-26 (High) — No owner has ever been paid, and the books cannot say what is safe to draw**

The `owner_draw` classification already exists in the schema and is already excluded from operating profit — the accounting thinking is done. **Zero expenses have ever used it.** There is no draw process, so any money taken out is either invisible or misfiled as a business cost.

Worse, the books cannot currently answer the question. Monthly run rate, in SRD:

| Month | Revenue | Sales | Expenses recorded | Commissions earned |
|---|---|---|---|---|
| 2026-01 | 41,600.00 | 33 | 20,315.94 | 2,109.50 |
| 2026-02 | 36,750.02 | 22 | 38,919.00 | 2,443.95 |
| 2026-03 | 28,800.00 | 22 | 15,526.00 | 1,897.00 |
| 2026-04 | 29,820.00 | 20 | 3,522.00 | 1,194.60 |
| 2026-05 | 21,800.00 | 19 | 30,854.00 | 861.00 |
| 2026-06 | 10,500.00 | 8 | 36,950.00 | 602.00 |
| 2026-07 | 35,235.00 | 20 | 9,306.00 | 1,468.95 |
| 2026-08 (to the 8th) | 7,471.00 | 5 | **0.00** | 312.68 |

Expenses swing between SRD 3,522 and SRD 38,919 a month. That is not volatility in the business — it is inventory purchases and operating costs sharing one undifferentiated bucket, because all 83 expenses are `unclassified` (F-20). Until they are separated you cannot compute an operating run rate, and without a run rate there is no defensible reserve, and without a reserve there is no safe draw.

Jan–Jul nets to roughly SRD 38,500, about SRD 5,500 a month — but that figure carries an error bar larger than itself: revenue is inflated by the 6.7% with no COGS (F-18), expenses are missing SRD 9,458 of commission payouts (F-15), and inventory purchases are double-counted against COGS. **Treat it as unusable until Phase 1 lands.**

Revenue is also trending down — 41.6k in January against a 25.1k average since — with June collapsing to 10.5k. That argues for a modest fixed draw, not a variable sweep of surplus cash.

**F-28 (High) — Stock purchasing outruns sell-through by SRD 4,508 a month**

Purchases booked to `Business Expense` average SRD 16,344/month while COGS actually consumed by sales averages SRD 11,836/month. Over seven months that is **SRD 31,552 of cash turned into shelf stock**, reconciling almost exactly with the USD 788.57 (~SRD 29,966) on hand — of which 86% is dead or overstocked (F-25).

This is the answer to "can we pay ourselves": the constraint is not earnings, it is that roughly SRD 4,500 a month is being spent on stock that does not sell. Fixing restock discipline releases more cash than any realistic owner draw. Full analysis in §7.

**F-29 (Medium) — "Personal Items" is an unclassifiable dumping ground**

Nine transactions, SRD 10,662, containing at least three different kinds of thing: probable inventory (~SRD 6,460 — Anne Klein watches, headlight kits, a dongle and splitter), genuine personal consumption (~SRD 2,546 — Shein, a card game), one subscription (Spotify, SRD 456), and one unlabelled SRD 1,200 entry.

Two consequences. The only subscription record in the entire system is filed here, under a personal-spending label. And any attempt to compute an operating run rate — which is what sizes your payout — has to guess at this bucket. It is the concrete case for making classification mandatory at entry (F-20).

**F-27 (Medium) — Expense recording has lapsed**

The last expense was recorded 2026-07-31; the last sale was 2026-08-08. Twelve days of trading with sales posting and not one cost recorded. Manual entry decays, which is the structural argument for automating the recurring ones.

### Low

**F-23 — The purchase order module is unused.** 0 purchase orders recorded, so receiving never informs cost. Either adopt it as the cost source or remove it; an unused module in the finance path is a maintenance liability that also makes F-01 harder to fix properly.

---

## 5. Target architecture

Four additions on top of what exists.

**1. `Company` — the legal entity**

```
Company: id, name, legal_name, base_currency, tax_id, fiscal_year_start, is_active
Location.company_id → Company
```

Every financial table gains `company_id`, denormalised deliberately so RLS and reporting never need a join to enforce isolation. Backfill existing rows to a default company; the migration is mechanical.

**2. `Account` — chart of accounts, per company**

```
1000 Assets      1010 Cash SRD · 1020 Cash USD · 1200 Accounts Receivable · 1400 Inventory
2000 Liabilities 2100 Accounts Payable · 2200 Commissions Payable · 2300 Tax Payable
3000 Equity      3100 Owner Capital · 3200 Retained Earnings · 3300 Owner Draws
4000 Income      4100 Product Sales · 4900 FX Gain
5000 Expenses    5000 COGS · 5100 Payroll · 5200 Marketing · 5900 FX Loss
```

Each of the 13 wallets maps to an account. Each expense classification maps to an account. That mapping is most of the migration.

**3. `JournalEntry` + `JournalLine` — double-entry on top of the existing ledger**

```
JournalEntry: id, company_id, entry_date, correlation_id, source_type, source_id,
              posted_at, posted_by, is_reversal, reverses_entry_id
JournalLine:  id, entry_id, account_id, debit, credit, currency, fx_rate,
              base_amount, location_id, seller_id
```

Enforce `SUM(debit) = SUM(credit)` per entry with a trigger — the same approach already proven on `finance_ledger_entries`. Keep `finance_ledger_entries` as the cash subledger; the journal is the book of record above it.

A sale then posts as one balanced entry:

```
Dr 1010 Cash SRD        5,600     (wallet receives)
Dr 5000 COGS            3,200     (snapshotted cost — fixes F-01)
  Cr 4100 Product Sales       5,600
  Cr 1400 Inventory           3,200
Dr 5300 Commission Exp    280
  Cr 2200 Commissions Payable   280   (fixes F-12, and F-15 can no longer fail silently)
```

**4. `AccountingPeriod` — the lock**

```
AccountingPeriod: company_id, period_start, period_end, status(open|closed|locked), closed_by
```

A trigger rejects any journal line dated inside a locked period. Fixes F-11 and makes F-01 structurally impossible going forward.

**Intercompany:** when company A pays an expense for company B, post two balanced entries linked by `correlation_id`, hitting `1300 Due from Related Party` and `2400 Due to Related Party`. Consolidated reporting sums all entities and eliminates those two accounts against each other.

---

## 6. Specification for the three operational gaps

Written to be built in one pass, on top of Phase 1. Each section gives the data model, the rules, the surfaces and what "done" means. The existing `POST /api/expenses` handler is the reference implementation for all money movement here — serializable transaction, `markFinanceLedgerRecorded`, explicit `recordFinanceLedgerEntry`, activity log inside the transaction. Nothing below should invent a new pattern.

### 6.1 Recurring expenses — subscriptions that deduct themselves

**Data model.** One new table, `recurring_expenses`:

| Column | Notes |
|---|---|
| `name`, `vendor_name` | "Claude Pro", "Anthropic" |
| `amount`, `currency` | `NUMERIC(18,4)`, constrained to SRD or USD |
| `cadence` | `weekly` / `monthly` / `quarterly` / `yearly` |
| `anchor_day` | 1–31, clamped to short months so the 31st bills on Feb 28 rather than rolling into March |
| `wallet_id` | required — this is what gets debited |
| `location_id`, `category_id`, `classification` | defaults to `operating` |
| `next_run_on` | date |
| `last_posted_at`, `is_active`, `auto_post`, `notes` | |

Plus two columns on `expenses`: `recurring_expense_id` and `period_key`.

**The idempotency rule — the part that must not be got wrong.** A `period_key` identifies the billing period: `2026-08`, `2026-W33`, `2026-Q3`, `2026`. A partial unique index on `(recurring_expense_id, period_key) WHERE recurring_expense_id IS NOT NULL` makes a second charge for the same period impossible at the database level. A cron that fires twice, a retry after a timeout, a manual "run now" pressed during the scheduled run — none of them can double-charge, because the second insert violates the index rather than relying on application logic to notice.

**Posting job.** A daily Vercel cron (the project already runs two, and `wallet-reminders` is the auth pattern: `Bearer ${CRON_SECRET}`). For each active, `auto_post` schedule where `next_run_on <= today`, in its own transaction: post the expense, debit the wallet with an atomic increment, write the ledger entry, advance `next_run_on`.

Rules that matter:
- **Catch-up is capped at 3 periods per run.** If the cron is down for four months, a subscription must not fire four charges at once and drain the wallet.
- **Insufficient balance skips, it does not fail.** Leave `next_run_on` untouched so it retries, notify admins once per period key, and keep processing the other subscriptions. One failing subscription must never block the rest.
- **New schedules never back-charge.** `next_run_on` is set to the next *upcoming* occurrence, so adding Spotify today doesn't invent seven months of history.
- Use each schedule's own currency; no implicit FX conversion at posting time.

**Surfaces.** `GET/POST/PATCH/DELETE /api/finance/recurring` for management, `POST /api/finance/recurring/run` for the cron plus an admin "run now". A panel on `/finance` listing each subscription with vendor, amount, cadence, next charge date, wallet and last posted date. Add the new API paths to `PROTECTED_API_PREFIXES` in `src/proxy.ts` **and** call `requireAdmin` in each handler — F-05 is what happens when only the first is done.

**Setup.** Add a `Software & subscriptions` expense category, then create Codex, Claude and Spotify against the USD wallet with their real amounts and renewal days. Retire the stray `Copilot` category into the new one.

**Done means:** the cron runs daily; each subscription posts exactly one expense per period with a matching wallet debit and ledger entry; running the job twice in a row produces no second charge; a subscription whose wallet is short notifies instead of failing silently; and `/finance` shows the next 30 days of scheduled charges.

### 6.2 Inventory health — a signal for "too much stock"

**No schema change.** This is a read model computed from `stock`, `sale_items` and `items`.

**The maths.** Per item and location, over a 90-day window:

```
dailyVelocity  = unitsSoldInWindow / 90
daysOfCover    = quantityOnHand / dailyVelocity      (undefined when velocity is 0)
cashTiedUpUsd  = quantityOnHand × purchasePriceUsd
```

Status, in order: `out` when nothing is on hand; `dead` when velocity is zero but stock is not; `overstocked` above 120 days of cover; `low` below 14 days; otherwise `healthy`.

**Excess is not the same as cash tied up**, and conflating them overstates the problem. Dead stock is entirely excess. For overstock, only the tail beyond target cover counts — a fast seller holding depth is doing the right thing:

```
excessUnits = quantityOnHand − ceil(dailyVelocity × 120)
```

`releasableCash` is dead plus excess: the money you'd get back by clearing it. Report items whose cost is zero separately rather than counting them as free stock (F-18 lives here too).

**Surfaces.** `GET /api/finance/inventory-health` with window and threshold as query parameters, and a panel on `/finance` leading with releasable cash, then a table sorted by excess capital — the worst offender first, because that is the reorder decision. Thresholds must be adjustable; 120 and 14 days are defaults, not truths about your business.

**Done means:** the dead and overstock figures reconcile against the numbers in F-25 (USD 503.02 dead, USD 177.90 overstocked, USD 680.92 releasable); a sale of a dead item moves it out of `dead` on the next load; and thresholds are configurable without a deploy.

### 6.3 Owner payout — traceable money out, on a rule

**No new table.** A draw is an expense with `classification = 'owner_draw'`, which already exists, is already excluded from operating profit, and already flows through the ledger. Traceability comes free by reusing the expense path — that is the whole point. Two settings hold the policy: `finance.payout_reserve_srd` and `finance.payout_reserve_usd`.

**What is safe to draw**, computed per currency and never mixed across currencies:

```
cashOnHand            operational wallets, that currency
− unpaidCommissions   money already owed to sellers
− openPayables        obligations due within 30 days
− scheduledCharges    recurring expenses due in the next 30 days
− reserveFloor        3 × monthly operating cost, from settings
= safeToDraw
```

Show every line, not just the total. The value of this screen is that it explains itself — a number with no derivation gets ignored the first time it looks wrong.

**Guardrails.** Refuse a draw above `safeToDraw` unless an admin overrides with a typed reason, recorded on the expense. Refuse entirely if the wallet would go negative. Warn when the exchange rate is stale (F-19) since a USD draw priced off a 68-day-old rate misstates what left the business.

**Policy, not just a button.** Startup convention here is a modest fixed monthly draw, reviewed quarterly — not a sweep of whatever is spare. Given revenue trending down and June at SRD 10,500, a fixed draw sized off the *trailing three months* is the right shape. Set the first amount only after Phase 1, when the run rate is real.

**Surfaces.** `GET /api/finance/owner-draw` returns the breakdown; `POST` records the draw through the expense path. A panel on `/finance` showing safe-to-draw with its derivation, draw history, and total drawn year to date.

**The monthly automation, the per-payout options and the recommended amounts are specified in §7**, which analyses what the business can actually sustain alongside restocking and savings.

**Done means:** a draw posts as an `owner_draw` expense with wallet debit and ledger entry; it appears in the ledger and activity log with the actor recorded; drawing above the safe amount requires an explicit reason; and the year-to-date total is visible on one screen.

**One caveat, stated plainly.** Build this last of the three. The safe-to-draw number is only as honest as the expense classification behind it, and today every expense is `unclassified` — so the reserve floor would be computed from a run rate that mixes stock purchases with rent. Shipping this before F-20 and F-15 are fixed would produce a confident, precise, wrong number, which is worse than no number at all.

---

## 7. Month-end close and payout policy

You asked how much you can pay yourselves each month, allowing for restocking and savings. Here is the answer the data supports, and the mechanism to run it automatically.

### 7.1 Two things the data changed

**You already have a savings wallet, and it holds SRD 17,000.** `purpose = 'savings'` exists on wallets and one is funded. So the three-way split already has somewhere to go, and the real cash picture is not one pot:

| | Amount |
|---|---|
| Operational SRD (3 bank + 3 cash wallets) | 25,005.99 |
| Operational USD | 534.00 |
| **Savings SRD** (ring-fenced) | **17,000.00** |
| Less: unpaid commissions already owed | (1,431.63) |

Working capital is therefore **SRD 25,006**, not the SRD 42,006 headline. That distinction matters for every number below.

**"Personal Items" is not owner pay — it's a dumping ground.** Nine transactions, SRD 10,662, and they are three different things wearing one label:

| Looks like | Examples | SRD |
|---|---|---|
| Probable inventory | Anne Klein watch, Anne Klein re-order, Headlight Restore Kit, Headlights, Dongle/Splitter | ~6,460 |
| Actual personal consumption | Shein, Uno No Mercy | ~2,546 |
| A subscription | **Spotify, 2026-01-14** | 456 |
| Unlabelled | one entry, no description | 1,200 |

So no, you have not been quietly paying yourselves — but you have been filing stock purchases and your Spotify bill in the same bucket as personal spending. That single Spotify entry is the *only* subscription record in the entire system (F-24), and it is misfiled.

### 7.2 What the business actually generates

Averages across the seven complete months, January to July:

| Line | SRD / month | % of revenue |
|---|---|---|
| Revenue (line-level) | 27,734 | 100% |
| Less COGS at actual sell-through | 11,836 | 42.7% |
| **Gross profit** | **15,897** | **57.3%** |
| Less operating — shipping, marketing, Copilot | 4,332 | 15.6% |
| Less subscriptions not yet recorded (Codex + Claude + Spotify, est.) | ~1,970 | 7.1% |
| Less commissions earned | 1,511 | 5.4% |
| **Net cash generated** | **~8,084** | **29.1%** |

A 57.3% gross margin is healthy. The estimate for unrecorded subscriptions is derived from your own data — the misfiled Spotify entry was SRD 456, and Copilot already runs at SRD 752/month — so roughly SRD 2,000/month of real cost is currently invisible. **Recording your subscriptions properly raises operating costs by about 45%.** That is not a new cost; it is a cost you are already paying.

### 7.3 The real leak is restocking, not pay

| | SRD / month |
|---|---|
| Spent buying stock ("Business Expense") | 16,344 |
| COGS actually consumed by sales | 11,836 |
| **Overbought** | **4,508** |

Over seven months that is **SRD 31,552 of cash converted into shelf stock**. It reconciles almost exactly with the USD 788.57 (~SRD 29,966) of inventory on hand — and 86% of that stock is dead or overstocked (F-25).

**This is the single biggest finding for your question.** You are not short of money to pay yourselves; you are buying stock faster than you sell it, at roughly SRD 4,500 a month. Fixing restocking discipline frees more cash than any draw you would realistically take.

### 7.4 The bad-month test

June, re-run with subscriptions properly recorded:

```
Revenue                10,500
− COGS                  4,475
= Gross profit          6,025
− operating + subs      6,302
− commissions             602
= net                    −879
```

**A June-like month loses money once subscriptions are on the books.** Any payout policy has to survive that, which rules out sweeping surplus cash and argues for a modest fixed draw backed by a real reserve.

### 7.5 The waterfall — fixed percentages

**Resellers are paid before founders, always.** Commission is a cost of making the sale, not a share of the profit. It sits above the line, so a seller earns their commission whether or not the month leaves anything for you. That is both the right convention and the right incentive.

```
  Revenue
− COGS
− Operating + subscriptions
− Commissions to resellers          ← paid first, every month
= Distributable profit
     ├─ Savings           65%   →  50%
     ├─ Founders          20%   →  30%
     └─ Restock buffer    15%   →  20%
```

Two phases. **Phase A applies now**, while savings is below the reserve floor. **Phase B** starts once the floor is met. Savings stays the largest share in both, which is what you asked for.

### 7.6 What that actually pays, month by month

Distributable profit per month, with subscriptions estimated in at SRD 1,970:

| Month | Revenue | COGS | Operating | Commissions | Distributable |
|---|---|---|---|---|---|
| 2026-01 | 42,650 | 15,825 | 3,105 | 2,110 | **19,641** |
| 2026-02 | 31,650 | 14,426 | 4,396 | 2,444 | **8,414** |
| 2026-03 | 28,800 | 12,996 | 5,380 | 1,897 | **6,557** |
| 2026-04 | 23,500 | 10,078 | 2,648 | 1,195 | **7,610** |
| 2026-05 | 21,800 | 9,481 | 4,270 | 861 | **5,218** |
| 2026-06 | 10,500 | 4,475 | 5,410 | 602 | **−1,957** |
| 2026-07 | 35,235 | 15,573 | 5,116 | 1,469 | **11,107** |

**Pay on the trailing three-month average, not the single month.** Your months swing from −1,957 to +19,641; paying a percentage of one month would hand you SRD 3,928 in January and nothing in June. A three-month average smooths that without ever paying out money you haven't earned.

Back-tested on Phase A percentages, this is what you would actually have been paid:

| Month | Trailing-3 avg | Founders 20% | Savings 65% | Restock cap 15% |
|---|---|---|---|---|
| 2026-03 | 11,537 | 2,307 | 7,499 | 1,731 |
| 2026-04 | 7,527 | 1,505 | 4,893 | 1,129 |
| 2026-05 | 6,462 | 1,292 | 4,200 | 969 |
| 2026-06 | 3,624 | 725 | 2,356 | 544 |
| 2026-07 | 4,789 | **958** | 3,113 | 718 |

Note June: a month that *lost* SRD 1,957 still paid SRD 725, because the average carried it — and the amount dropped automatically without anyone deciding. That is the behaviour you want from a policy.

**The honest number: at today's trailing average, 20% pays SRD 958 a month across all founders.** Split two ways that is about SRD 479 each. Savings would have grown SRD 22,061 across those five months, which is roughly consistent with the SRD 17,000 you have actually accumulated.

That is lower than a naive read of the seven-month average suggests, and the reason matters: **revenue is down about 40% since January**, so the trailing window is weighted toward the slower months. The percentage is doing its job by telling you the truth.

### 7.7 Why it feels like there is no money

Distributable profit and cash in hand are not the same thing, and the gap is the whole story:

| | SRD / month |
|---|---|
| Distributable profit (trailing 3) | 4,789 |
| Less cash going into stock beyond what sells (F-28) | (4,508) |
| **Actual free cash** | **281** |

**On paper you make SRD 4,789 a month. In cash you keep SRD 281, because the rest goes onto shelves that are not selling.** That is why the business feels tight despite a 57.3% gross margin.

So the restock buffer is a **cap, not a transfer**. Stock purchases must not exceed trailing-3-month COGS plus the buffer percentage — currently SRD 11,836 + 15% = **SRD 13,611/month**, against the SRD 16,344 you are actually spending. Enforcing that one ceiling frees roughly SRD 2,700 a month immediately, and more as the dead lines clear.

**Three levers raise founder pay, in order of size:**

1. **Stop overbuying** — worth up to SRD 4,508/month, more than four times the current draw.
2. **Clear the dead stock** — USD 680.92, about **SRD 25,875** released as a one-off. That alone covers the entire reserve shortfall and then some.
3. **Recover revenue** toward January levels — every SRD 1,000 of extra distributable profit adds SRD 200 to founder pay at 20%, SRD 300 at 30%.

### 7.8 The rules around the percentages

- **Base:** trailing three-month average distributable profit.
- **Negative average pays nothing.** No draw, no savings transfer. A percentage of a loss is not a smaller draw, it is zero.
- **Cap:** the draw never exceeds operating cash above the reserve floor, whatever the percentage says.
- **Reserve floor: SRD 23,439** — three months of operating, subscriptions and commissions. Savings holds SRD 17,000, so it is **SRD 6,439 short**; at Phase A rates that closes in roughly two months, or immediately if you clear dead stock.
- **Founder split** is a fixed percentage of the founder pool, set once per founder and changed only by explicit decision.
- **Review quarterly**, and switch to Phase B only when savings has held above the floor for a full month.
- **Restock buffer is a ceiling on purchasing**, not money moved anywhere.

> Every figure here inherits the error bars in §4. Revenue is inflated by the 6.7% booked with no COGS, expenses are missing SRD 9,458 of commission payouts, subscriptions are estimated rather than recorded, and the operating/inventory split is inferred from category names because all 83 expenses are `unclassified`. The **percentages** are sound and can be adopted now; the **amounts** they produce should be re-derived after Phase 1.

### 7.9 Mechanism: the month-end run

**Ordering is the whole design.** A payout computed before all costs are posted pays out money that is already spent.

```
Days 1–28    subscriptions post on their own anchor days (§6.1)
Last day     23:00  month-end close job:
               1. verify every subscription due this month posted
               2. verify commissions for the month are recorded
               3. block if any wallet is unreconciled this month
               4. compute trailing-3 average → savings, founders, restock cap
               5. create a DRAFT payout run and notify admins
Next day     admin reviews, adjusts, approves → posts atomically
```

**Draft, then approve — not blind auto-post.** A cron that moves money out of the business unattended is how a bad month becomes a worse one. The job proposes; a human approves. Optionally allow auto-post when the amount is at or under the policy cap *and* no warning fired, so a normal month needs one click and an abnormal month needs a decision.

**Payout options, per run.** Each draft is editable before posting:

| Option | Behaviour |
|---|---|
| Recipients | one or more owners, with a split — percentage or fixed amount each |
| Source wallet | which operational wallet, per currency; never mixes currencies in one line |
| Method | cash or bank, matching the wallet type |
| Amount | accept the computed figure, or override with a required reason |
| Defer / skip | roll this month's draw forward, recorded as skipped with a reason |
| Savings transfer | accept, adjust or skip the transfer to the savings wallet |

**Traceability — the requirement you named.** Every posted line reuses the existing expense path, so it inherits the guarantees already in the system rather than inventing new ones:

- an `expenses` row with `classification = 'owner_draw'`, vendor set to the recipient, and the period key
- an atomic wallet debit
- a `wallet_transactions` row
- a `finance_ledger_entries` row — append-only, immutable, DB-enforced
- an `activity_logs` entry naming the approving admin
- all lines of one run sharing a `correlation_id`, so a month's payout is a single auditable object

The savings transfer posts as a `wallet_transfer` between the operational and savings wallets — an event type the ledger already supports. Reversal is a contra entry, never a delete (F-06).

**Guardrails.** Refuse if the wallet would go negative. Refuse above the safe amount without a typed reason. Warn when the exchange rate is stale (F-19). Block entirely if the month has unposted subscriptions or an unreconciled wallet — a payout is the reward for closing the month, so it should be gated on the month actually being closed.

**Done means:** on the last day of each month a draft run appears with restock cap, savings transfer and draw computed and explained line by line; approving it posts every leg atomically under one correlation ID; running the job twice produces one run, not two; and a year-to-date owner-draw total is visible on `/finance`.

---

## 8. Roadmap

**Phase 0 — Stop the bleeding (about 1 week)**

Highest risk-to-effort ratio in the whole plan.

- Fix the commission payout insert; check the error (F-15)
- Add auth guards to the five unguarded mutation endpoints, or delete them (F-05)
- Replace read-modify-write with atomic increments on wallets and stock (F-03)
- Replace blanket RLS with company + location + role scoping (F-04)
- Harden the two ledger-guard functions (F-22)
- Set a current exchange rate and add a staleness warning (F-19)
- Widen money columns to `Decimal(18,4)` (F-09)

**Phase 0.5 — Clean the existing books (a few days, mostly manual)**

Do this before any ledger migration; these numbers cannot be derived later.

- Reconcile the 4 orphaned sale headers (SRD 11,420.02): restore line items or void them properly
- Reconcile the 4 header/line mismatches (SRD 1,050.02)
- Explain the SRD 1,451.38 commission gap (F-16) and the SRD 500.00 wallet drift (F-03)
- Backfill the SRD 9,458.05 of missing commission-payout expenses (F-15)
- Set real costs on the 5 zero-cost items (F-18)
- Perform a first physical count and reconciliation of all 13 wallets (F-21)

**Phase 1 — Trustworthy transactions (2–3 weeks)**

- Move sale creation into a server route wrapped in `prisma.$transaction` (F-02)
- Snapshot `unit_cost_usd` and `fx_rate_at_sale` onto `sale_items`; backfill flagged as estimated (F-01)
- Persisted, gapless, per-company invoice numbering (F-17)
- Convert undo-sale to void + contra entries (F-06)
- Make expense date, vendor, receipt and classification required at entry (F-20)
- Retire the commission repair endpoints once the write path is atomic

**Phase 1.5 — The three operational gaps (1.5–2 weeks)**

Specified in §6. Sequencing matters here.

- **Inventory health** first — it's read-only, carries no risk, and needs nothing else to land. USD 680.92 of releasable capital becomes visible on day one (F-25).
- **Recurring subscriptions** next — Codex, Claude, Spotify posting themselves against the USD wallet, with the period-key unique index making double-charges impossible (F-24). This also arrests F-27, since the recurring costs stop depending on someone remembering.
- **Owner payout last**, and only after F-15 and F-20 are fixed. The safe-to-draw figure is derived from the operating run rate, and today every expense is unclassified — shipping it earlier produces a precise, confident, wrong number (F-26).

**Phase 2 — Multi-company foundation (2–3 weeks)**

- Add `Company`; add `company_id` to every financial table; backfill (F-07)
- Company scoping through auth context, RLS and every report
- Company switcher in the UI, with a consolidated view for owners

**Phase 3 — Double-entry ledger (3–4 weeks)**

- `Account`, `JournalEntry`, `JournalLine` with the balance constraint (F-08)
- Post journal entries from sales, expenses, commissions, purchase orders, transfers (F-12, F-13)
- Trial balance, P&L and balance sheet per company and consolidated
- `AccountingPeriod` with lock enforcement (F-11)

**Phase 4 — Automation, the Odoo-inspired part (2–3 weeks)**

The BPA flow you admire, on your own stack:

- Bill inbox: upload or email a supplier invoice → OCR extract → draft expense with vendor, amount, date → approval queue → posts on approve. The expense table already has status, vendor, receipt number and reviewer, so the model is largely there — it just needs to be enforced and fed.
- Recurring expenses (rent, salaries, subscriptions) auto-posted on schedule
- Bank/cash reconciliation UI extending `wallet_reconciliations`, with a monthly prompt (F-21)
- Automatic FX revaluation at period close, posting to FX gain/loss (F-10, F-19)
- Month-end close checklist gating the period lock

Roughly 14–18 weeks total on your existing stack, delivered incrementally, versus 4–8 months of migration during which nothing else ships.

---

## 9. Metrics to run the business on

Once Phase 3 lands, these become computable per company and consolidated. Track them monthly.

**Margin**
- Gross margin % by item, category, location, company — trustworthy only after F-01, F-15 and F-18
- Contribution margin after commission and location costs, which is the number that tells you whether a location deserves more inventory

**Cash**
- Net burn and runway in months
- Cash conversion cycle: days inventory outstanding + days sales outstanding − days payables outstanding
- Inventory turns and dead stock (no movement in 90+ days), the usual place cash hides in an inventory business

**Growth**
- MoM revenue growth, with same-location growth separated from growth that came from opening locations
- Revenue per location, per seller
- AOV and units per transaction

**Working capital**
- AR aging buckets (30/60/90) from `finance_obligations` once it maps to accounts
- AP aging and upcoming obligations against projected cash

**Discipline**
- Discount leakage: `is_custom_price` sales versus list, by seller — the data is already captured and nothing reports on it
- Expense ratio by classification against revenue — impossible today at 100% unclassified (F-20)
- Budget variance, actual versus planned
- **Wallet reconciliation coverage** — % of wallets reconciled this month. Currently 0%.

**Close discipline:** monthly close by working day 5 — reconcile every wallet, review unclassified expenses, revalue FX, lock the period, publish the pack. The habit is worth as much as the software.

---

## 10. Summary

| | |
|---|---|
| **Decision** | Build. Adopt Odoo's model, not Odoo. Revisit it later as a downstream book of record if statutory audit demands it |
| **Why** | Your operational layer is 70% of the system and your actual edge; the immutable ledger already exists and is verified working; a `Company` entity is required either way |
| **Fix this week** | F-15 — SRD 9,458.05 of commission payouts silently never reached the expense ledger, because the insert targets columns that don't exist |
| **Most urgent security** | F-04, F-05 — any logged-in user can rewrite wallet balances, and one endpoint deletes commissions with no auth at all |
| **Most damaging to decisions** | F-01 plus F-18 — 6.7% of revenue is booked at 100% margin today, and every historical margin is retroactively mutable |
| **Biggest blocker to multi-company** | F-07 — no legal entity in the model |
| **Your three asks** | F-24 subscriptions never deduct · F-25 86% of inventory capital is dead or overstocked · F-26 no owner has ever been paid. Specified in §6 |
| **What you can pay yourselves** | **20% of trailing-3-month distributable profit** (savings 65%, restock cap 15%), rising to 30% once savings clears the SRD 23,439 floor. Today that is **SRD 958/month** across all founders. The binding constraint is F-28 — SRD 4,508/month goes into stock that doesn't sell, leaving only SRD 281/month of genuinely free cash. Full derivation and back-test in §7 |
| **Effort** | ~14–18 weeks phased, versus 4–8 months migrating |

Phase 0 and 0.5 are worth starting regardless of which direction you choose — those fixes and that cleanup are needed even if you did migrate to Odoo, because the data you'd carry across has to be trustworthy first.
