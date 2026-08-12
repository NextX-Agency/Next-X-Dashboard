# NextX Financial Audit & Multi-Company Architecture

**Date:** 2026-08-12
**Scope:** Prisma schema (47 models), 53 API routes, Supabase migrations, every client-side financial write path, **and verification against the live production database** (project `ivvhazwjtnyznojeoojs`, 149 sales / 490 wallet transactions / 83 expenses)
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

**F-05 — Unauthenticated endpoints that mutate financial data**

`/api/delete-commissions` has no auth guard and hard-deletes commission rows by ID. `/api/recalculate-commissions`, `/api/fix-combo-price`, `/api/migrate`, and `/api/delete` (blob deletion) are likewise unguarded. Compare `/api/debug-profit`, which correctly calls `requireAdmin`.

*Fix:* guard or delete them. Repair endpoints should not exist in production once F-02 is fixed.

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

## 6. Roadmap

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

Roughly 11–15 weeks total on your existing stack, delivered incrementally, versus 4–8 months of migration during which nothing else ships.

---

## 7. Metrics to run the business on

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

## 8. Summary

| | |
|---|---|
| **Decision** | Build. Adopt Odoo's model, not Odoo. Revisit it later as a downstream book of record if statutory audit demands it |
| **Why** | Your operational layer is 70% of the system and your actual edge; the immutable ledger already exists and is verified working; a `Company` entity is required either way |
| **Fix this week** | F-15 — SRD 9,458.05 of commission payouts silently never reached the expense ledger, because the insert targets columns that don't exist |
| **Most urgent security** | F-04, F-05 — any logged-in user can rewrite wallet balances, and one endpoint deletes commissions with no auth at all |
| **Most damaging to decisions** | F-01 plus F-18 — 6.7% of revenue is booked at 100% margin today, and every historical margin is retroactively mutable |
| **Biggest blocker to multi-company** | F-07 — no legal entity in the model |
| **Effort** | ~11–15 weeks phased, versus 4–8 months migrating |

Phase 0 and 0.5 are worth starting regardless of which direction you choose — those fixes and that cleanup are needed even if you did migrate to Odoo, because the data you'd carry across has to be trustworthy first.
