# NextX Financial Audit & Multi-Company Architecture

**Date:** 2026-08-12
**Scope:** Prisma schema (47 models), 53 API routes, Supabase migrations, client-side financial write paths
**Question answered:** Adopt Odoo 19, or build on the existing system, given the move to multi-company?

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

You already built the hard part of a ledger. `finance_ledger_entries` is append-only and enforced at the database level by `prevent_finance_ledger_mutation()`, with automatic capture from `wallet_transactions` via trigger. That immutability guarantee is the piece most teams get wrong. What's missing on top of it is a chart of accounts and debit/credit pairs — weeks of work, not months.

Also note: **a `Company` entity has to be built either way.** Odoo would not save you the modelling work of deciding what a legal entity means in your business; it would just move it.

**When to revisit Odoo:** if you need statutory audited financials or VAT filings across several legal entities, add Odoo (or any standard package) *downstream* as the book of record, fed by a nightly journal export from your ledger. You get compliance and BPA-style automation without surrendering the operational system. Adopt it as a consumer of your data, not a replacement for it.

---

## 2. What's already right

Worth stating plainly, because it's the reason the build path works:

- **Immutable ledger.** `finance_ledger_entries` blocks UPDATE/DELETE at the DB layer, with a clear message directing you to corrective entries. This is correct accounting practice.
- **Automatic ledger capture.** The `wallet_transactions_capture_ledger` trigger means even client-side writes land in the ledger — the backstop holds despite finding F-02 below.
- **FX rate snapshot on sales.** `sales.exchange_rate` is stored per sale rather than looked up later.
- **Correlation IDs** on ledger entries — the foundation for grouping the legs of a future double-entry transaction.
- **Expense controls** — `classification`, `status`, `vendor_name`, `receipt_number`, `reviewed_by_user_id`, refund tracking. Real internal-control thinking.
- **Wallet reconciliation** with confirmed balance and reconciler identity.
- **`DECIMAL` throughout** rather than floats.
- **Obligations table** for receivables/payables with due dates and source tracing.

---

## 3. Findings

### Critical

**F-01 — Historical gross profit is retroactively mutable (COGS is not snapshotted)**

`sale_items` records `unit_price` but no cost. `calculateSaleFinancials` computes COGS from live master data:

```
src/lib/reportCalculations.ts:107
  const cogsUsd = items.reduce(
    (sum, item) => sum + (toReportNumber(item.purchasePriceUsd) * item.quantity), 0)
```

Editing an item's purchase price silently rewrites gross profit on **every past sale of that item**. Last quarter's margins change when you renegotiate with a supplier. Compounding this, `cogsSrd = cogsUsd * exchangeRate` applies a *current* rate to a *historical* cost, so SRD margins drift with every FX move.

*Fix:* add `unit_cost_usd` and `fx_rate_at_sale` to `sale_items`, written at sale time. Backfill from current values with a flag marking them as estimated.

**F-02 — Financial writes are client-side, non-atomic, on the anon key**

`src/app/sales/page.tsx:467–860` performs roughly eight sequential unguarded writes from the browser: `sales` → `sale_items` → `stock` → `commissions` → `wallets` → `wallet_transactions`. Any failure or closed tab mid-sequence leaves partial financial state. The only rollback is a manual delete of the sale header (`sales/page.tsx:509`) — which does not undo stock decrements or wallet credits that happen *after* it.

The existence of `/api/create-missing-commissions`, `/api/recalculate-commissions`, `/api/check-commission`, `/api/fix-combo-price`, and `check-commission-currency.js` is direct evidence this path drifts in production.

*Fix:* one server route, one `prisma.$transaction`. The pattern already exists at `src/app/api/seller/sales/route.ts:89`.

**F-03 — Wallet and stock balances use read-modify-write (lost updates)**

```
src/app/sales/page.tsx:715
  .update({ balance: matchingWallet.balance + total })
```

`matchingWallet.balance` was read at page load. Two concurrent sales against the same wallet: the second overwrites the first and that money vanishes from the balance. Same pattern for stock at `sales/page.tsx:528`.

*Fix:* atomic SQL increments (`balance = balance + $1`), or derive balances from the ledger and treat `wallets.balance` as a cache.

**F-04 — RLS grants every authenticated user full control of all financial data**

All 80 policies in `20260127000000_enable_rls_policies.sql` follow:

```sql
CREATE POLICY "Allow authenticated users" ON public.wallets
  FOR ALL USING (auth.role() = 'authenticated');
```

`FOR ALL` on `wallets`, `expenses`, `sales`, `commissions`, `exchange_rates` — with no location scoping and no role check. Combined with the anon key shipped to the browser (`src/lib/supabase.ts`), any user who can log in can rewrite any wallet balance or delete any commission from the browser console. There is no segregation of duties at the data layer, and this gets materially worse the moment two legal entities share the database.

**F-05 — Unauthenticated endpoints that mutate financial data**

`/api/delete-commissions` has no auth guard and hard-deletes commission rows by ID. `/api/recalculate-commissions`, `/api/fix-combo-price`, `/api/migrate`, and `/api/delete` (blob deletion) are likewise unguarded. Compare `/api/debug-profit`, which correctly calls `requireAdmin`.

*Fix:* guard or delete them. Repair endpoints should not exist in production once F-02 is fixed.

### High

**F-06 — "Undo Sale" hard-deletes financial records**

`src/app/sales/page.tsx` deletes commissions, then sale_items, then the sale. Accounting convention is never to delete — you post a reversing entry. Because `finance_ledger_entries` is (correctly) immutable while the subledger rows are destroyed, the ledger and operational tables **permanently diverge** after every undo.

*Fix:* `status = 'voided'` plus contra entries sharing the original `correlation_id`.

**F-07 — No company / legal entity in the data model**

The schema has `Location` and nothing above it. Every financial table scopes by `location_id`. A location is not a legal entity — one company has many locations, and multi-company demands per-entity books, intercompany elimination, and separate statements. This is the central blocker for your stated direction.

**F-08 — The ledger is single-entry**

`finance_ledger_entries` has `direction: in|out` and a single `amount`. That's a cash-movement journal, not double-entry. Without a chart of accounts and balanced debit/credit legs you can produce a cash-flow view but **not a balance sheet or trial balance** — and no way to prove the books balance. Inventory, receivables, payables, and equity are invisible as accounts.

**F-09 — `Decimal(10,2)` will overflow**

26 money columns cap at 99,999,999.99. At roughly 40 SRD/USD that ceiling is about USD 2.5M — reachable for cumulative wallet balances or annual revenue aggregates. Rates at `Decimal(10,4)` are tight too.

*Fix:* `Decimal(18,4)` for amounts, `Decimal(18,8)` for rates.

### Medium

**F-10 — No FX revaluation, no realized/unrealized gain tracking.** USD-denominated wallets are never revalued, and there is no FX gain/loss account. Under SRD volatility this misstates results by a material amount.

**F-11 — No period close or lock date.** Nothing prevents backdating into a reported month or editing last year. Every serious system has a lock date and a close checklist.

**F-12 — Commission is not recognised as a liability when earned.** It's inserted client-side alongside the sale, then becomes a wallet movement only when someone manually pays it (`src/app/commissions/page.tsx:328`). Between earning and payment it is an unrecorded obligation, so margins look better than they are.

**F-13 — Obligations are disconnected from the ledger.** `finance_obligations` tracks receivables and payables in its own table with no AR/AP accounts behind it, so it can't roll into a balance sheet or an aging report.

**F-14 — Budget `amount_spent` is a denormalised counter** with no visible reconciliation against actual expenses.

---

## 4. Target architecture

Four additions on top of what exists:

**1. `Company` — the legal entity**

```
Company: id, name, legal_name, base_currency, tax_id, fiscal_year_start, is_active
Location.company_id → Company
```

Every financial table gains `company_id`, denormalised deliberately so RLS and reporting never need a join to enforce isolation. Backfill existing rows to a default company; the migration is mechanical.

**2. `Account` — chart of accounts, per company**

Standard five-type structure (asset, liability, equity, income, expense) with a numbering convention:

```
1000 Assets      1010 Cash SRD · 1020 Cash USD · 1200 Accounts Receivable · 1400 Inventory
2000 Liabilities 2100 Accounts Payable · 2200 Commissions Payable · 2300 Tax Payable
3000 Equity      3100 Owner Capital · 3200 Retained Earnings · 3300 Owner Draws
4000 Income      4100 Product Sales · 4900 FX Gain
5000 Expenses    5000 COGS · 5100 Payroll · 5200 Marketing · 5900 FX Loss
```

Each wallet maps to an account. Each expense classification maps to an account. That mapping is most of the migration.

**3. `JournalEntry` + `JournalLine` — double-entry on top of the existing ledger**

```
JournalEntry: id, company_id, entry_date, correlation_id, source_type, source_id,
              posted_at, posted_by, is_reversal, reverses_entry_id
JournalLine:  id, entry_id, account_id, debit, credit, currency, fx_rate,
              base_amount, location_id, seller_id
```

Enforce `SUM(debit) = SUM(credit)` per entry with a deferred constraint or trigger — the same immutability approach already used for `finance_ledger_entries`. Keep `finance_ledger_entries` as the cash subledger; the journal is the book of record above it.

A sale then posts as one balanced entry:

```
Dr 1010 Cash SRD        5,600     (wallet receives)
Dr 5000 COGS            3,200     (snapshotted cost — fixes F-01)
  Cr 4100 Product Sales       5,600
  Cr 1400 Inventory           3,200
Dr 5300 Commission Exp    280
  Cr 2200 Commissions Payable   280   (fixes F-12)
```

**4. `AccountingPeriod` — the lock**

```
AccountingPeriod: company_id, period_start, period_end, status(open|closed|locked), closed_by
```

A trigger rejects any journal line dated inside a locked period. Fixes F-11 and makes F-01 structurally impossible going forward.

**Intercompany:** when company A pays an expense for company B, post two balanced entries linked by `correlation_id`, hitting `1300 Due from Related Party` and `2400 Due to Related Party`. Consolidated reporting sums all entities and eliminates those two accounts against each other.

---

## 5. Roadmap

Ordered so that each phase is independently valuable and nothing later depends on the Odoo question being reopened.

**Phase 0 — Stop the bleeding (about 1 week)**

Highest risk-to-effort ratio in the whole plan.

- Add auth guards to the five unguarded mutation endpoints, or delete them (F-05)
- Replace read-modify-write with atomic increments on wallets and stock (F-03)
- Replace blanket RLS with company + location + role scoping (F-04)
- Widen money columns to `Decimal(18,4)` (F-09)

**Phase 1 — Trustworthy transactions (2–3 weeks)**

- Move sale creation into a server route wrapped in `prisma.$transaction` (F-02)
- Snapshot `unit_cost_usd` and `fx_rate_at_sale` onto `sale_items`; backfill flagged as estimated (F-01)
- Convert undo-sale to void + contra entries (F-06)
- Retire the commission repair endpoints once the write path is atomic

**Phase 2 — Multi-company foundation (2–3 weeks)**

- Add `Company`; add `company_id` to every financial table; backfill
- Company scoping through auth context, RLS, and every report
- Company switcher in the UI, with a consolidated view for owners

**Phase 3 — Double-entry ledger (3–4 weeks)**

- `Account`, `JournalEntry`, `JournalLine` with the balance constraint
- Post journal entries from sales, expenses, commissions, purchase orders, transfers
- Trial balance, P&L, and balance sheet per company and consolidated
- `AccountingPeriod` with lock enforcement

**Phase 4 — Automation, the Odoo-inspired part (2–3 weeks)**

This is the BPA flow you admire, on your own stack:

- Bill inbox: upload or email a supplier invoice → OCR extract → draft expense with vendor, amount, date → approval queue → posts on approve. `expenses` already has `status`, `vendor_name`, `receipt_number`, and `reviewed_by_user_id`, so the data model is largely there.
- Recurring expenses (rent, salaries, subscriptions) auto-posted on schedule
- Bank/cash reconciliation UI extending `wallet_reconciliations`
- Automatic FX revaluation at period close, posting to FX gain/loss (F-10)
- Month-end close checklist gating the period lock

Roughly 10–14 weeks total on your existing stack, delivered incrementally, versus 4–8 months of migration during which nothing else ships.

---

## 6. Metrics to run the business on

Once Phase 3 lands, these become computable per company and consolidated. Track them monthly.

**Margin**
- Gross margin % by item, category, location, company — trustworthy only after F-01
- Contribution margin after commission and location costs, which is the number that tells you whether a location deserves more inventory

**Cash**
- Net burn and runway in months — the metric that matters most pre-profitability
- Cash conversion cycle: days inventory outstanding + days sales outstanding − days payables outstanding
- Inventory turns and dead stock (no movement in 90+ days), the usual place cash hides in an inventory business

**Growth**
- MoM revenue growth, and same-location growth separated from growth that came from opening locations
- Revenue per location, per seller, per square metre
- AOV and units per transaction

**Working capital**
- AR aging buckets (30/60/90) from `finance_obligations` once it maps to accounts
- AP aging and upcoming obligations against projected cash

**Discipline**
- Discount leakage: `is_custom_price` sales versus list, by seller — the data is already captured and nothing reports on it yet
- Expense ratio by classification against revenue
- Budget variance, actual versus planned

**Close discipline:** monthly close by working day 5 — reconcile every wallet, review unclassified expenses, revalue FX, lock the period, publish the pack. The habit is worth as much as the software.

---

## 7. Summary

| | |
|---|---|
| **Decision** | Build. Adopt Odoo's model, not Odoo. Revisit it later as a downstream book of record if statutory audit demands it |
| **Why** | Your operational layer is 70% of the system and your actual edge; the immutable ledger already exists; a `Company` entity is required either way |
| **Most urgent** | F-04 and F-05 — any logged-in user can rewrite wallet balances, and one endpoint deletes commissions with no auth at all |
| **Most damaging to decisions** | F-01 — every historical margin you've ever looked at is retroactively mutable |
| **Biggest blocker to multi-company** | F-07 — no legal entity in the model |
| **Effort** | ~10–14 weeks phased, versus 4–8 months migrating |

Phase 0 is worth starting regardless of which direction you choose on everything else — those fixes are needed even if you did migrate to Odoo, because the data you'd carry across has to be trustworthy first.
