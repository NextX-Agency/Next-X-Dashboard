# NextX Dashboard — working notes

Inventory, sales and finance system for a Suriname retail business (audio + watches, 3 branch
locations, public webshop). It moves real money: SRD 42,006 and USD 534 held across 13 cash and
bank wallets.

## Before touching anything financial

Two documents govern this work. Read both before changing any code that touches money:

- **`docs/FINANCIAL_AUDIT.md`** — 34 findings, reconciled against production. Explains *why* the
  rules below exist.
- **`docs/IMPLEMENTATION_PLAN.md`** — the runbook. 27 sequenced tasks with SQL, backfills and
  verification queries. **Execute tasks in order; do not batch them.**

"Financial" means: sales, sale items, wallets, wallet transactions, expenses, commissions,
purchase orders, exchange rates, budgets, obligations, and the ledger.

## Where the work stands — read this before starting

**`docs/IMPLEMENTATION_LOG.md` is the authoritative record of current state.** The runbook is the
plan; the log is what has actually happened. Read its final entries first — they carry corrections
that **supersede the runbook's ordering**, including:

- **T-05 must run after T-13, not after T-11.** `handleUndoSale` still writes to five financial
  tables from the browser. Closing those tables early breaks the dashboard.
- **T-04 is half applied.** Write it idempotently rather than assuming a clean start.
- Production RLS is weaker than `20260127000000_enable_rls_policies.sql` suggests. **Query
  `pg_policies` directly; do not trust that migration file.**

Claim each task in the log and push the claim before writing code. The push is the lock.

## Non-negotiable rules

These are not style preferences. Each one maps to a production failure documented in the audit.

1. **Never write a wallet balance directly.** Balances change only through a `wallet_transactions`
   row. Use atomic increments — `{ balance: { increment: amount } }`, never `readValue + amount`.
2. **Every financial write is one `prisma.$transaction`** at `Serializable` isolation, covering all
   legs: the record, the balance, the transaction row, the ledger entry, the activity log.
3. **Never swallow an error.** A bare `await supabase.from(...).insert(...)` with no error check
   silently cost SRD 9,458 of unrecorded commission payouts.
4. **Never delete a financial row.** Void with a status and post contra entries. `finance_ledger_entries`
   rejects UPDATE and DELETE at the database level, so a deletion elsewhere permanently diverges the
   books from the ledger.
5. **Guard in the handler, not just the proxy.** `src/proxy.ts` only checks that a session cookie
   *exists* — it never validates it and applies no role check. Every mutating route calls
   `requireAdmin` or `requireRole` itself.
6. **Migrations are additive**, and ship schema + backfill + verification together. Columns added
   without a backfill are how `classification` ended up 100% unused across 83 expenses.
7. **Flag inferred values** (`cost_is_estimated`, `needs_review`) so an inference never becomes
   indistinguishable from a fact.
8. **Financial writes belong on the server.** No money-moving Supabase calls from the browser.

## The reference implementation

`src/app/api/expenses/route.ts` (POST) is correct and complete — serializable transaction,
`markFinanceLedgerRecorded` then `recordFinanceLedgerEntry`, `writeActivityLog({ client: tx })`,
balance checked and moved inside the transaction. **Copy this shape.** Do not invent a new one.

`src/app/sales/page.tsx` is the opposite: ~8 sequential browser writes with a rollback that only
deletes the sale header. Four sale headers in production have no line items as a result. Treat it as
a specimen, not a pattern.

## How the ledger works

Money movements write to `wallet_transactions`. A trigger (`wallet_transactions_capture_ledger`)
mirrors each into `finance_ledger_entries`, which is append-only and enforced by
`prevent_finance_ledger_mutation()`. A server route that wants to write its own richer entry calls
`markFinanceLedgerRecorded(tx)` first, setting a Postgres session variable the trigger checks.

Production has 490 wallet transactions and 490 ledger entries, zero gaps. **This is the one part of
the system that currently works perfectly. Do not break it.**

## Environment

```bash
pnpm install
./node_modules/.bin/prisma validate    # NOT npx — see below
./node_modules/.bin/prisma generate
pnpm lint && pnpm build
```

**`npx prisma` resolves to Prisma 7**, which rejects this project's `datasource` block with
`P1012: The datasource property url is no longer supported`. That is a CLI version mismatch, not a
schema error. Always use `./node_modules/.bin/prisma`. Both commands need `DATABASE_URL` and
`DIRECT_URL` set.

Database is Supabase (project `ivvhazwjtnyznojeoojs`), Postgres 17. Use the Supabase MCP tools.
**Branching is unavailable — the org is on the Supabase free plan.** `create_branch` will fail;
do not try it. Test every schema migration with the transactional protocol in
`docs/IMPLEMENTATION_PLAN.md` Part 1: `BEGIN`, migrate, backfill, run the verification queries
**inside the transaction**, then `COMMIT` only if every check passed, else `ROLLBACK`.

## Conventions

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4, pnpm, Prisma 6.19, deployed on Vercel.
- Middleware lives at `src/proxy.ts`, not `middleware.ts` — this is Next 16.
- Migrations are raw SQL in `supabase/migrations/`, applied in filename order.
- Cron jobs are declared in `vercel.json` and authenticate with `Bearer ${CRON_SECRET}`; see
  `src/app/api/notifications/wallet-reminders/route.ts`.
- Money columns are being widened to `NUMERIC(18,4)`, rates to `NUMERIC(18,8)`.

## Verification

After any change touching money, run the suite in `docs/IMPLEMENTATION_PLAN.md` Part 6. If a count
moves and your change did not intend it, **stop and investigate** rather than continuing.
