# Implementation Log

Coordination point for the agents executing `IMPLEMENTATION_PLAN.md`. See Part 8 of that document.

**Claim a task by appending an entry and pushing it before writing any other code.** Pull first —
if a task is already claimed, take the next unclaimed one whose dependencies are met.

Format:

```
## T-XX — claimed by <agent> — <ISO timestamp> — in progress
## T-XX — <agent> — <ISO timestamp> — DONE
Before: <verification numbers>
After:  <verification numbers>
Notes:  <anything surprising>
```

**Migration agent: `claude`** — the only agent permitted to apply DDL to production.
`codex` is the code agent and must never make a schema change.
Swap these if Codex is the one holding Supabase access; only one agent may hold the role.

**Supabase plan: free.** Branching is unavailable — use the transactional DDL protocol in
Part 1 of the runbook. Do not try `create_branch`.

---

## Baseline — 2026-08-12 — production, pre-implementation

| Metric | Value |
|---|---|
| sales | 149 |
| wallet_transactions | 490 |
| finance_ledger_entries | 490 |
| expenses | 83 |
| wallets SRD | 42,005.99 |
| wallets USD | 534.00 |

Re-measured 2026-08-13, unchanged. Additional counts recorded for Part 6 (the plan asks for these
at T-02): `sale_items` 306, `commissions` 122, `wallets` 13, `locations` 3. All five "must be zero"
invariants are zero.

---

## T-01 — claude — 2026-08-13T01:52Z — DONE

Before: restore wiped in one committed transaction, then inserted table by table through the
        `prisma` singleton. Nothing covered the restore as a whole.
After:  one `prisma.$transaction` (Serializable, 120s timeout/maxWait) spans the wipe, all 47 table
        inserts and the activity log. `wipeAllTables`, `insertTable` and `upsertTable` take a
        `Prisma.TransactionClient`; no `prisma.<model>` call remains inside them.
Production counts unchanged — nothing in this task touches production:
        149 sales / 306 sale_items / 490 wallet_transactions / 490 ledger / 83 expenses /
        122 commissions / SRD 42,005.99 / USD 534.00. All five zero-invariants zero.

**Verified, both directions.** Supabase branching is unavailable on the free plan, so the test target
was a throwaway local Postgres 16 cluster with the Prisma schema pushed and the two ledger triggers
from `20260812111000_finance_traceability_vendor_access.sql` applied, seeded with a sale, a sale
item, a wallet transaction (trigger-mirrored to a ledger entry), an expense and an admin session.
Harness committed at `scripts/restore-verification/`.

- Failure path — a backup with one sale item repointed at a nonexistent item id, checksum dropped so
  validation admits it. The foreign key violation fires during the insert phase, after the wipe:
  HTTP 500, transaction rolled back, every count identical. PASS.
- Control — the same test against the pre-fix code: `saleItems 1 -> 0`, the row destroyed for good,
  and the endpoint still answered **HTTP 200**. So the test detects the bug rather than passing
  vacuously.
- Happy path — an untouched backup still commits (`success=true`, 12 rows) and wallet_transactions
  still pair 1:1 with ledger entries. Merge mode re-checked separately: `success=true`, counts and
  SRD balance unchanged.

Notes:
- The payload checksum already rejects a corrupted backup before the wipe. That is a real defence,
  but it only covers *detectable* corruption — the atomicity gap was reachable by anything that
  passes validation and fails on insert, which is what the harness exercises.
- Two nested `prisma.$transaction` calls guarding `app.finance_ledger_recorded` were flattened.
  Inside one long transaction `set_config(..., true)` stays set for the whole restore, so the flag is
  now cleared in a `finally` immediately after the wallet-transaction writes — otherwise every later
  wallet transaction in the same restore would silently skip the ledger. Same reasoning for
  `app.finance_ledger_maintenance`, now switched off as soon as the deletes finish.
- Removed the per-record `try/catch` in `upsertTable` and the per-table one in `POST`. Both swallowed
  failures and let the restore report success over a partial result — with one shared transaction
  they would also have committed it (R8).
- A backup containing rows for a table this database does not have is now a hard failure instead of a
  logged note. Silently dropping them was a successful-looking restore that lost data.
- A successful wipe restore revokes all sessions by design, so the operator is logged out afterwards.
  Pre-existing behaviour, worth knowing before someone reports it as a bug.
- Lint: 289 problems (197 errors, 92 warnings) before and after — byte-identical totals, all
  pre-existing repo-wide. `prisma validate` passes; `pnpm build` passes.
- `pnpm build` needs `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` and
  `NODE_EXTRA_CA_CERTS` behind this environment's proxy, or next/font fails the build on a TLS error
  unrelated to the code.

## T-02 — claude — 2026-08-13T02:00Z — BLOCKED (cannot be completed in this environment)

T-02 wants a real production backup exported, kept for the whole project, restored, and checked
against the Part 6 suite. None of the three routes to production data are open from this session:

| Route | State |
|---|---|
| Prisma against production | `DATABASE_URL` / `DIRECT_URL` are unset. START_HERE lists them as required before the first run |
| `/api/backup/export` on the deployed app, or PostgREST | The environment's network policy answers **403 to CONNECT** for `ivvhazwjtnyznojeoojs.supabase.co`. Confirmed via the agent proxy status endpoint |
| Supabase MCP `execute_sql` | Works, but every byte returns through the agent's context. The database is **9.1 MB** (8,294 `site_analytics_events` + 1,112 `activity_logs` dominate). Not viable, and this container is ephemeral so the file could not be "kept for the whole project" regardless |

`create_branch` was not attempted — `list_branches` returns `[]`, consistent with the free plan.

**To unblock, one of:** set `DATABASE_URL` and `DIRECT_URL` for the session; or allow the network
policy to reach `*.supabase.co` and provide `SUPABASE_SERVICE_ROLE_KEY`; or run
`/api/backup/export` against the deployed app and place the file somewhere the agent can read.

**Consequence, and why the run stops short of T-04.** T-02 is the rollback for everything after it,
and Part 1 says to take a backup immediately before each migration. T-04, T-05 and T-06 apply DDL to
a production database holding SRD 42,006 with no verified restore point. Those are not being started.

T-03 is taken next instead: Part 7 lists T-01 as the only hard dependency for it, and it changes no
data and no schema, so it carries no rollback requirement.

## T-03 — claude — 2026-08-13T02:20Z — DONE

Before: none of the listed routes called `requireAdmin`. The only gate was `src/proxy.ts`, which
        checks that a `nextics_session` cookie *exists* — it never validates it and applies no role
        check, so any forged value passed.
After:  8 routes call `requireAdmin(request)` in the handler. `check-commission-currency.js` deleted
        from the repo root.
Production counts unchanged (this task touches no data and no schema):
        149 / 306 / 490 / 490 / 83 / 122 / SRD 42,005.99 / USD 534.00, all zero-invariants zero.

**Verified against the local stack, both directions.** With `Cookie: nextics_session=forged`:

| Route | Method | Before | After |
|---|---|---|---|
| `/api/delete-commissions` | POST | 500 | **401** |
| `/api/recalculate-commissions` | POST | — | **401** |
| `/api/fix-combo-price` | POST | — | **401** |
| `/api/migrate` | GET | 500 | **401** |
| `/api/delete` | DELETE | — | **401** |
| `/api/create-missing-commissions` | POST | — | **401** |
| `/api/check-commission` | GET | 404 | **401** |
| `/api/create-commission` | POST | 500 | **401** |

"Before" values are a control run against the pre-T-03 build: the forged cookie reached the handler
every time. They are 500/404 only because the local stack has placeholder Supabase credentials —
against production those handlers would have done their work. A real admin session still passes the
guard and reaches the handler (checked separately).

Notes:
- **Guarded `/api/create-commission` as well, which T-03 does not list.** It is the same hole —
  unguarded, writes commission rows, and already sits in `PROTECTED_API_PREFIXES`. Leaving it open
  while closing seven neighbours would have missed the point of F-05. Flagging it because it is a
  deviation from the written task.
- `/api/delete` declared `export const runtime = 'edge'`. `requireAdmin` resolves the session through
  Prisma, which needs the Node runtime, so the edge declaration was removed. The route deletes blobs;
  edge latency is not worth an unguarded delete.
- `recalculate-commissions` (`POST()`) and `migrate` (`GET()`) took no request argument, and
  `fix-combo-price` took a plain `Request`. All three now take `NextRequest`.
- Not done, deliberately: T-03 also says to *mark* `delete-commissions`, `recalculate-commissions`,
  `create-missing-commissions`, `check-commission` and `fix-combo-price` for deletion once T-11
  lands. They are marked here in the log rather than in code — deleting them now would remove repair
  tools while the write path they repair is still the broken one.
- Lint 289 -> 287 problems; the two that disappeared are the deleted root script. No new ones.

---

## Findings for whoever takes T-04 and T-05 — claude — 2026-08-13T02:30Z

Two things measured while working Phase A that change what those tasks have to do.

### F-04 is materially worse than the audit records — raise the priority of T-05

The audit and the plan both describe the 80 RLS policies as
`FOR ALL USING (auth.role() = 'authenticated')`, i.e. "any logged-in user". Production disagrees:

| Policies | Role | Command | `USING` |
|---|---|---|---|
| **36** | `public` | ALL | **`true`** |
| 18 | `public` | SELECT | `true` |
| 10 | `public` | INSERT | (no check) |
| 8 | `public` | DELETE | `auth.role() = 'authenticated'` |
| 8 | `public` | UPDATE | `auth.role() = 'authenticated'` |
| 5 | `public` | ALL | `auth.role() = 'authenticated'` |

`public` includes **`anon`**. So the 36 `ALL USING (true)` policies — `sales` and `wallets` among
them — are open to **anyone holding the publishable key**, which is by definition shipped in the
browser bundle. No login required, contrary to the audit's wording. Read *and* write.

T-05 should be treated as the most urgent item in Phase A rather than the fifth. It was not started
here: it is exactly the kind of change that needs T-02's restore point behind it.

*(Not reachable from this session — the environment's network policy blocks `*.supabase.co` — but
that is a property of this container, not of the deployed site.)*

### T-04 is already half-applied

`capture_wallet_transaction_ledger()` already carries `SET search_path TO 'public'` and is
`SECURITY DEFINER`. Only `prevent_finance_ledger_mutation()` still lacks the setting, and it is not
`SECURITY DEFINER`. So T-04 reduces to that one `ALTER FUNCTION` plus the two `REVOKE`s — check the
current grants before writing the migration rather than applying all three statements blind.

### Docs disagree with the environment (reporting, not fixing — Part 2)

`AGENTS.md` and `CLAUDE.md` both still say "**Test every schema migration on a branch**
(`create_branch` → apply → verify → `merge_branch`) before production." Branching is unavailable on
the free plan (`list_branches` returns `[]`), and the runbook's Part 1 replaces it with the
transactional DDL protocol. Both files should be corrected together — they are kept verbatim in sync
— but that is someone's deliberate call, not a silent edit from here.

---

## OUT-OF-BAND — claude — 2026-08-13 — users table locked down

Applied to production outside the task sequence, with the owner's explicit approval, because the
exposure was live, unauthenticated and remotely reachable.

**Verified the agent's F-04 report against production. It was correct, and understated in the audit.**
36 tables carry permissive policies to role `public` (which includes `anon`) with `USING (true)`, and
`anon` holds full DML grants on all of them. `public.users` carried
`"Allow authenticated access" — ALL, public, USING true, WITH CHECK true`.

Checked before acting: 1 user, 1 admin, 1 password hash — no unauthorised accounts had been created.

Applied `supabase/migrations/20260813090000_close_anon_access_to_users.sql` — dropped all three
policies on `users`, revoked `anon` and `authenticated`, left RLS enabled with zero policies.

Before: anon SELECT on users = true, 3 policies
After:  anon SELECT on users = false, 0 policies, 1 user row intact
Part 6: 149 sales / 490 wallet_tx / 490 ledger / 83 expenses / SRD 42,005.99 / USD 534.00 — all unchanged

Login was unaffected: `src/app/api/auth/login/route.ts` uses Prisma on a direct connection, which is
not subject to PostgREST grants or RLS.

**The other 35 tables were deliberately left open.** The admin sales, commissions and reservations
pages write to them directly from the browser using the anon key, so revoking now breaks the
dashboard. T-11 must move those writes server-side before T-05 can close the tables. Do not attempt
T-05 before T-11 — the ordering in Part 7 is wrong on this point and this entry supersedes it.

**Doc drift fixed:** `CLAUDE.md` and `AGENTS.md` no longer instruct agents to use `create_branch`;
both now point at the transactional protocol in Part 1.

**Still open from the agent's report:** T-04 is half-applied — `capture_wallet_transaction_ledger`
already has `search_path` set, `prevent_finance_ledger_mutation` does not, and the `REVOKE EXECUTE`
has not been done.

---

## T-11 — claude — 2026-08-13T10:35Z — DONE

Session has no database access — `DATABASE_URL`/`DIRECT_URL` unset, network policy still answers
403 to CONNECT for `*.supabase.co`. **No DDL was attempted and none was needed: T-11 is pure code.**

Before: `src/app/sales/page.tsx` created sales with ~8 sequential browser writes. Rollback deleted
        only the sale header, leaving stock and wallet changes applied. Wallet credit was
        `matchingWallet.balance + total` from a balance read at page load.
After:  `POST /api/sales` does the whole thing in one Serializable transaction — header, lines,
        stock, commissions, wallet credit, wallet transaction, ledger entry, activity log. The page
        makes one `fetch` and renders the invoice from what the server stored.
        `src/app/sales/page.tsx` 1,972 -> 1,712 lines.

**Verified on the local Postgres harness** (`scripts/restore-verification/`, seeded by
`seed-sales.mjs`, checks in `verify-sales.mjs`). Six checks, all passing:

| Check | Result |
|---|---|
| Normal sale written consistently | total 2500 = line sum 2500, wallet 0→2500, stock 100→98, commissions 300 across 2 rows at rates 10%/20% |
| **CONTROL** — old read-modify-write under concurrency | **loses SRD 100 of 300**, as designed. 2500 + 100 + 200 landed at 2700 |
| Two concurrent sales through the route | wallet 2500 → 6500, both land in full |
| Failure injected after the header | HTTP 500, every count identical, wallet unmoved |
| Combo price splits exactly | combo 1000.01 → line sum 1000.01, header 1000.01 |
| Invariants | 0 orphan headers, wallet_transactions 4 : ledger 4 |

The control matters: it reproduces the exact anti-pattern at the old `sales/page.tsx:715` and shows
it losing money, so the concurrency check is testing something real.

**A bug the tests caught, worth knowing about.** The first run of the concurrency check *failed* —
Serializable did its job and Postgres aborted one of the two sales with `P2034`, so the second
customer's sale was simply refused. Correct for the data, useless at a till. Added
`src/lib/serializableTransaction.ts`: a bounded retry (5 attempts, exponential backoff with jitter)
that retries only on `P2034` / SQLSTATE `40001` / `40P01`. Retrying is safe because an aborted
transaction commits nothing. **Every later financial write should use this helper** — the same
conflict will hit T-13 and T-19.

Notes:
- Prices come from the database, never the request. The one client-supplied figure accepted is a
  custom price, and only on an item flagged `allow_custom_price`, and only with a reason of 3+
  characters. The UI already gated custom prices this way; the server now enforces it.
- Combo splitting is exact: the last line absorbs the rounding remainder, so lines always add back
  to the agreed combo price. The old per-member arithmetic could drift a cent — one of the ways a
  header ends up disagreeing with its lines (T-09).
- Stock is checked and decremented against **total demand per item**, since the same product can
  appear both loose and inside a combo. Decrements are atomic (`{ decrement }`), not read-then-write.
- `commissions.commission_rate` is now populated. The browser never set it, so no historical
  commission can explain its own arithmetic.
- A requested seller must belong to the sale's location; a commission cannot be credited to someone
  who does not work there.
- Removed `locationWallets` state and `loadLocationWallets` from the page — dead once the server
  picks the wallet, and one less browser-side query against `wallets`.
- Deleted the five repair endpoints T-03 marked, per T-11: `delete-commissions`,
  `recalculate-commissions`, `create-missing-commissions`, `check-commission`, `fix-combo-price`,
  plus the orphaned `/recalculate-commissions` page and their `proxy.ts` / `routes.ts` entries.
  `delete-commissions` hard-deleted commission rows, which R4 forbids outright.
- Lint 289 -> 276 problems, entirely from the deleted files. No new warnings. `prisma validate` and
  `pnpm build` pass.

### ⚠️ T-11 does NOT fully unblock T-05

The **creation** path is server-side now, but `handleUndoSale` in the same page still writes to
`wallets`, `wallet_transactions`, `commissions`, `sale_items` and `sales` from the browser — it is
the delete-based undo that **T-13** replaces with voiding. Closing those tables before T-13 lands
will break the undo button.

Other pages were not audited here and almost certainly still write directly: the task named
`sales/page.tsx` only. **Before T-05, grep for `supabase.from(...)` `.insert/.update/.delete` across
`src/app/**` and confirm the list is empty.**

## T-17 — claude — 2026-08-13T11:20Z — DONE

Read-only. No schema change, no writes, no DDL. `GET /api/finance/inventory-health` plus a panel on
`/finance`, with the calculation in `src/lib/inventoryHealth.ts` as pure functions.

**Reproduces the plan's production figures exactly.** Verified by pulling the 38 stocked
item/location rows out of production read-only (quantity, purchase price, units sold in 90 days),
loading them into the local Postgres as a fixture, and asserting against the live endpoint:

| Figure | Plan | Measured |
|---|---|---|
| stocked lines | 38 | **38** |
| dead lines | 26 | **26** |
| dead cash | USD 503.02 | **503.02** |
| overstocked cash | USD 177.90 | **177.90** |
| releasable cash | USD 680.92 | **680.92** |
| total cash tied up | USD 788.57 (audit) | **788.57** |

Fixture and check committed: `seed-inventory.mjs`, `verify-inventory.mjs`.

**The grain matters, and it caught a mistake.** My first implementation measured velocity per item
across all branches. That gives 23 dead / USD 415.82 — wrong. The plan says "per item and location",
and only that grain reproduces 26 / 503.02. Aggregating across branches credits a slow branch with
another branch's turnover and hides dead stock sitting in it.

Notes:
- Thresholds are in `store_settings` and tunable without a deploy: `finance.inventory.window_days`
  (90), `.overstock_days` (120), `.low_days` (14), `.restock_buffer_pct` (15),
  `.cogs_window_months` (3). Defaults apply when a key is absent.
- **Releasable and excess are different numbers and both are reported.** Releasable (USD 680.92) is
  the full carrying value of dead + overstocked lines. Excess (USD 558.42) is dead stock in full plus
  only the tail of overstock beyond 120 days of cover. The plan defines excess one way and publishes
  a releasable figure computed the other way; rather than pick one, the panel shows both and labels
  them.
- Stock purchase spend counts `classification = 'inventory'` **or** the legacy `Business Expense`
  category, because `classification` is still 100% unused (F-20) until T-15 backfills it. The two
  agree once T-15 lands.

### ⚠️ The purchasing ceiling does not reproduce the plan's SRD 13,611 / 16,344

Measured against production with the plan's own formula (trailing-3-month COGS + 15%):

| | Plan | Measured (trailing 3 months) |
|---|---|---|
| monthly COGS | SRD 11,836 | **SRD 8,771.36** |
| ceiling at +15% | SRD 13,611 | **SRD 10,087.06** |
| monthly stock spend | SRD 16,344 | **SRD 11,276.67** |
| overspend | ~SRD 2,700 | **SRD 1,189.60** |

The gap is a window mismatch in the source documents, not a data problem. The audit's figures are
**lifetime monthly averages** — `Business Expense` totals SRD 114,406 over 7 distinct months, which
is SRD 16,343.71/month, matching its 16,344 exactly. The plan then asks for **trailing-3-month**
COGS. Those are different windows over a business whose volume has changed.

Also worth flagging: the audit's SRD 11,836/month COGS does not reproduce on either window —
lifetime COGS is SRD 85,624.58 over 8 sale months (SRD 10,703/month) or 7 months (SRD 12,232/month).
Its exact basis is not recoverable from the current data.

**Implemented the formula the plan specifies (trailing 3 months), not the audit's snapshot**, with
the window configurable via `finance.inventory.cogs_window_months`. Set it to a longer window to
reproduce the audit's framing. The conclusion is unchanged either way: purchasing exceeds the
ceiling every month. Reporting rather than reconciling, per Part 2 — no figure was adjusted to hit
a published number.

## T-06 / T-09 / T-12 — migration SQL WRITTEN BUT ⚠️ NOT APPLIED — claude — 2026-08-13T12:05Z

Not a claim of the tasks themselves. **Nothing has been applied to production and no DDL was
attempted against it.** These are files staged for a session that has database access.

| File | Task |
|---|---|
| `supabase/migrations/20260814000000_t06_widen_money_columns.sql` | T-06 |
| `supabase/migrations/20260814000100_t09_review_queue.sql` | T-09 |
| `supabase/migrations/20260814000200_t12_snapshot_sale_cost.sql` | T-12 |

Apply in that order, one per transaction, **each behind a backup** — T-02 is still blocked.
T-09 must precede T-12; the guard below enforces it rather than trusting the order.

### Tested on a production-shaped local fixture, not on production

`scripts/restore-verification/seed-production-shape.mjs` builds a local database matching the Part 6
baseline exactly — 149 sales / 306 sale_items / 490 wallet_transactions / 490 ledger / 83 expenses /
SRD 42,005.99 / USD 534.00 — including the Part 5 anomalies: 4 sales with no lines, 4 header/line
mismatches, 5 zero-cost items, 9 "Personal Items" expenses.

Four things were checked, and each was made to fail before being made to pass:

1. **They apply and self-verify.** All three commit against the fixture, each printing its own
   assertion: T-06 widened 29 columns (26 amounts, 3 rates); T-09 flagged 4 / 4 / 5 / 9; T-12
   snapshotted all 306 lines.
2. **They abort cleanly on the wrong data.** Run against an empty database they fail their baseline
   assertions and roll back — afterwards `sales.needs_review` does not exist, `sale_items.unit_cost_usd`
   does not exist, and `wallets.balance` is still `NUMERIC(10,2)`. Zero trace, which is the whole
   point of the Part 1 protocol.
3. **They are idempotent.** A second run of all three changes nothing and still verifies.
4. **T-12's dependency guard is real.** Unflagging the zero-cost items and re-running gives
   `T-12 FAILED: 5 line(s) snapshotted a zero cost from an unflagged item. Run T-09 first.`
   Re-flagging makes it pass again.

### Decisions worth reviewing before applying

- **T-06 widens 29 columns, not 26.** The plan's 26 are exactly the `NUMERIC(10,2)` amount columns,
  which is what caps at 99,999,999.99; the other 3 are the `NUMERIC(10,4)` FX rate columns going to
  `(18,8)`. The four `commission_rate` columns are **deliberately left at `NUMERIC(5,2)`** — they are
  percentages, not money, and `999.99%` is already generous. Flagging it because it is a judgement
  call, not an oversight.
- **The plan says widening "does not rewrite rows". It does.** Changing scale, not just precision,
  forces a table rewrite under an `ACCESS EXCLUSIVE` lock. Harmless at 490 rows — a moment's lock —
  but worth knowing before someone runs it expecting a metadata-only change.
- T-12 backfills `fx_rate_at_sale` from `COALESCE(sales.exchange_rate, 38.0)`. **15 of the 149 sales
  carry no exchange rate**, so those take the fallback. All 306 lines are flagged
  `cost_is_estimated = true` regardless, per R3.

### Each file lists what it does NOT do

T-09 still owes the exclusion of `needs_review` rows from margin / run-rate / payout, the admin
review page, and the SRD 9,458.05 commission-payout **report** (report only — never insert).
T-12 still owes `reportCalculations.ts:107` reading `si.unit_cost_usd`, and `POST /api/sales`
writing real costs with `cost_is_estimated = false`. Both are noted at the foot of their files.

---

## REVIEW — claude — 2026-08-13 — overnight work checked, three plan errors corrected

Reviewed T-11, T-17 and the three staged migrations. Verified the agent's challenges against
production rather than accepting them. **Two of three were correct; one was half correct.**

**1. Column count — agent correct, plan corrected.** Production has 26 columns at `numeric(10,2)`
and 3 at `numeric(10,4)`, so 29 in total. The audit's "26" counted money columns only and was right
about those; T-06 now states both groups explicitly and confirms the four `commission_rate`
percentage columns are deliberately excluded.

**2. Table rewrite — agent correct, plan was wrong.** T-06 claimed widening "does not rewrite rows."
Postgres can skip a rewrite when only precision increases, but changing scale from 2 to 4 alters each
value's stored `dscale` and forces a rewrite under `ACCESS EXCLUSIVE`. Immaterial at this row count,
wrong as a general claim, now corrected in place.

**3. Purchasing ceiling — agent right about the inconsistency, wrong about one number.**

The inconsistency is real and is mine: the audit quotes lifetime Jan–Jul averages, T-17 asks for a
trailing-3 ceiling, and the two documents did not agree. T-17 now states both windows and requires a
configurable one.

But the report claimed the audit's SRD 11,836/month COGS "doesn't reproduce on either window." It
reproduces **exactly** on the window the audit states — SRD 82,854.38 ÷ 7 = SRD 11,836.34, confirmed
against production. Trailing-3 May–Jul is SRD 9,843.03 and Jun–Aug is SRD 7,606.03; the reported
SRD 8,771 matches neither calendar window, so it is presumably a rolling-90-day basis. That is a
legitimate choice but it is a third window, and it should be labelled rather than compared against
figures derived from a different one.

**The judgement was right even where a number was wrong: refusing to adjust the maths to hit a target
was the correct call.** Recompute and report; never reverse-engineer a figure to match a document.

**Correcting my own earlier entry:** I wrote that T-11 unblocks T-05. It does not. `handleUndoSale`
still writes to wallets, wallet_transactions, commissions, sale_items and sales from the browser —
that is T-13. Other pages remain unaudited; grep for browser-side `.insert`/`.update`/`.delete`
before closing any table.

**Not reviewed and still owed:** the T-11 route and the three staged migrations have been read but
not executed against production, since database access is still unavailable here.

---

## RUN CLAIM — claude — 2026-08-13T13:00Z — remaining sequence, single agent

Database access is **still unavailable** (`DATABASE_URL`/`DIRECT_URL` unset, network policy answers
403 to CONNECT for `*.supabase.co`). Read-only production queries via Supabase MCP still work and are
used for verification figures only. **No DDL will be attempted against production.**

Claiming the whole remaining sequence in one entry rather than 15 round trips — this is a single-agent
run with no concurrent writer. Each task still gets its own commit and its own DONE entry below.

Planned order, honouring the ordering corrections (T-05 after T-13; T-04 idempotent; T-06 = 29 cols):

`T-13 → T-07 → T-08 → T-12(code) → T-09(code) → T-16 → T-14 → T-15 → T-18 → T-19 → T-05 → T-10 →
T-04 → T-20 → T-21 → T-22 → T-23 → T-24 → T-25 → T-26 → T-27`

**Note for T-17, correcting my own entry.** The reviewer is right: my SRD 8,771/month COGS is a
rolling-90-day window, not calendar trailing-3. The route computes `now() - 3 months`, which is
rolling. It is a legitimate basis but was unlabelled. Fixed as part of this run.

## T-13 — claude — 2026-08-13T14:10Z — DONE (code) · migration staged, NOT APPLIED

Before: undo deleted commissions, then sale_items, then the sale.
        `finance_ledger_entries` refuses DELETE, so every undo left the ledger holding a movement
        for a sale that no longer existed — books and ledger diverged permanently and silently.
After:  `POST /api/sales/void` keeps every row, marks the sale `voided`, returns stock, debits the
        wallet through a real `wallet_transactions` row, and posts the contra ledger entry under the
        sale's `correlation_id`.

Migration: `supabase/migrations/20260814000300_t13_void_sales.sql` — **NOT APPLIED**.
Adds `status`, `voided_at`, `voided_by`, `void_reason`, `correlation_id` to `sales`.

**Verified on the local harness** (`verify-void.mjs`), control first:

| Check | Result |
|---|---|
| **CONTROL** — the old delete path | **3 financial rows destroyed; ledger unchanged at 1; 1 ledger entry left pointing at a sale that no longer exists.** Exactly F-06 |
| Void keeps every row | status=voided, sales/items/commissions counts unchanged, wallet 3000 → 1000, stock 97 → 99, 2 ledger entries under one correlation_id **netting to 0** |
| Second void | refused 409, wallet unchanged — no double debit |
| Void without a reason | refused 400 |
| Invariant | wallet_transactions 6 : ledger 6 |

Notes:
- A void needs a typed reason of 3+ characters. It moves real money back out of a wallet; that
  deserves the same standard as an expense.
- **Paid commissions are not clawed back.** Unpaid ones are zeroed; paid ones are left and reported
  in the response and the activity log. The money already left, and reversing a payout is a separate
  decision (Part 5, R11). The UI surfaces the count.
- Nothing is deleted anywhere in the path — `deleteMany` appears only in the control test.

### Also landed here: the T-12 and T-09 code the migrations were waiting on

- `src/lib/financialFilters.ts` — one place deciding what counts toward a derived figure.
  `COUNTABLE_SALE` excludes both voided sales (T-13) and `needs_review` rows (T-09). Applied at
  **every** sale aggregation site: dashboard (11 queries), reports, finance summary, debug-profit,
  reportExport, inventory-health. Hand-writing `status: 'posted'` at 20+ call sites is how one gets
  forgotten and a voided sale is quietly reported as revenue.
- `reportCalculations.resolveUnitCostUsd` — COGS now reads `sale_items.unit_cost_usd`, falling back
  to the item's current price only where the T-12 backfill has not run. This is the fix for F-01:
  re-pricing a product no longer rewrites the margin on every past sale.
- `SaleFinancials.usesEstimatedCost` — true when any line's cost is a backfilled estimate, so a
  report covering pre-cutover periods can say so instead of presenting it as measured.
- `POST /api/sales` now writes `unitCostUsd` and `fxRateAtSale` with **`costIsEstimated: false`** —
  recorded facts, not inferences — and stamps a `correlation_id` the void path reuses.

**Cash views deliberately keep voided sales.** A voided sale's money genuinely moved and its reversal
genuinely moved it back; the ledger shows both. Only *derived* figures — margin, run rate, payout
base, dashboard revenue — drop it.

## T-07 — claude — 2026-08-13T14:45Z — DONE (code only, no schema change)

**T-07 had never been done.** It was not in the earlier "done" list and the broken insert was still
live at `src/app/commissions/page.tsx:343`.

Before: four unchecked browser writes. The expense insert targeted `category`, `payment_method` and
        `date` — none of which exist — and omitted the `NOT NULL` `wallet_id`. Nobody read the error.
        The wallet was debited by writing `balance - total` from a page-load read.
After:  `POST /api/commissions/payout`, modelled on `POST /api/expenses`: one Serializable
        transaction creating the expense with real columns, decrementing the wallet atomically,
        writing the wallet transaction, recording the ledger entry, logging the activity and
        flipping `paid`.

**Verified on the local harness** (`verify-payout.mjs`):

| Check | Result |
|---|---|
| **CONTROL** — the old insert, byte for byte | **rejected: `column "category" of relation "expenses" does not exist`.** The old code never read this, which is F-15 exactly |
| Payout posts everything | 300 SRD over 2 commissions: expenses 0→1, wallet 3000→2700, ledger 2→3, unpaid 2→0, `classification=payroll`, `wallet_id` set |
| Nothing outstanding | refused 409 |
| Payout exceeding balance | refused 409, **expenses unchanged, commissions still unpaid** |
| Invariant | wallet_transactions 10 : ledger 10 |

Two further F-15-class bugs found on the same page and fixed:

- **"Mark paid" on a single commission flipped a boolean and nothing else** — no expense, no wallet
  debit, no ledger entry. The payment existed only as a flag. It now opens the pay modal (a payment
  needs a wallet to come from) and goes through the same transactional route.
- **Deleting a commission hard-deleted the row**, which R4 forbids outright. The action now refuses
  and points at voiding the sale, which cancels the unpaid commission and keeps the trail (T-13).

Balance is checked **inside** the transaction against the committed value, and the commission set is
read inside it too — paying the same commission from two tabs is no longer possible. If
`updateMany` marks a different number of rows than were priced, the whole thing rolls back.

**The historical SRD 9,458.05 is deliberately NOT backfilled here.** That is T-09's report; inserting
106 backdated expenses would rewrite months already reviewed (Part 5, R1, R11).

## T-08 — claude — 2026-08-13T15:05Z — DONE (code only, no schema change)

The active rate is 38.0000, set 2026-06-05, and nothing said so. Every USD figure on the dashboard
is converted at it. `/api/dashboard` now returns `exchangeRateSetAt`, `exchangeRateAgeDays` and
`exchangeRateIsStale` (threshold 7 days), and the dashboard shows a banner above the fold naming the
rate, its age, and a link to set a new one. **No auto-fetch** — the owner sets the rate; software
only says when it has gone stale.

## T-09 — claude — 2026-08-13T15:05Z — code DONE · migration staged, NOT APPLIED

The migration (`20260814000100_t09_review_queue.sql`) was already staged. The code it owed is done:

- **Exclusion from derived figures** — `src/lib/financialFilters.ts`, applied at every sale
  aggregation site (see the T-13 entry). `needs_review` rows and voided sales drop out of margin,
  run rate, COGS and payout base; cash views keep them, because the cash genuinely moved.
- **Review page** — `GET /api/finance/review` and `/finance/review`, listing every flagged sale,
  expense and product with its reason, plus the commission payout gap.
- **The report, not inserts** — `docs/reports/commission-payout-backfill.csv`, 106 rows totalling
  **exactly SRD 9,458.05**, every row marked `PROPOSED - NOT INSERTED`, with
  `docs/reports/README.md` explaining why it is a report and what to do with it.

Re-measured against production read-only while writing it: **106 paid commissions, SRD 9,458.05,
zero payout expenses recorded** — matching the audit exactly.

One detail worth noting: the location name is `Paramaribo - Noord, Blauwgrond`, which contains a
comma. The CSV quotes fields properly; a naive join would have silently shifted every column right
of it.

## T-16 — claude — 2026-08-13T15:40Z — code DONE · migration staged, NOT APPLIED

Before: invoice numbers came from `Math.random()` in the browser and were never stored. The number
        on a customer's copy exists nowhere in the database.
After:  `invoice_number` on `sales`, unique, allocated **inside the sale transaction** from an
        `invoice_sequences` counter row.

Migration `20260814000400_t16_invoice_numbers.sql` — **NOT APPLIED**. Tested against the
production-shape fixture: 149 sales numbered `INV-000001`..`INV-000149`, 149 distinct, all flagged
`invoice_is_reconstructed`, sequence ends at exactly 149 (gapless). Idempotent — a second run
re-verifies and changes nothing.

**A Postgres `SEQUENCE` is deliberately not used.** Sequences are non-transactional: a rolled-back
sale burns its number and leaves a hole. An invoice series with holes is exactly what an auditor
asks about. A counter row bumped under the transaction's lock gives back the number when the sale
rolls back.

⚠️ **For the owner, before this is applied.** Reconstructed numbers will **not** match the numbers on
invoice copies customers already hold — the originals were random and were never recorded, so no
software can recover them. Every historical row is flagged `invoice_is_reconstructed = true` so the
two are never confused. **If this matters for tax, raise it with the accountant before applying.**

One bug caught in testing: naming the PL/pgSQL variable `prefix` collided with
`invoice_sequences.prefix` and Postgres rejected the ambiguous reference. Renamed `seq_prefix`.

---

# RUN SUMMARY — claude — 2026-08-13T17:00Z

Database access was **never available** this run: `DATABASE_URL`/`DIRECT_URL` unset, network policy
answering 403 to CONNECT for `*.supabase.co`. Supabase MCP gave **read-only** production access,
used for verification figures only. **No DDL was applied to production. Nothing was written to it.**

## Final Part 6 verification — production, unchanged

| Metric | Baseline | Now |
|---|---|---|
| sales | 149 | **149** |
| sale_items | 306 | **306** |
| wallet_transactions | 490 | **490** |
| finance_ledger_entries | 490 | **490** |
| expenses | 83 | **83** |
| commissions | 122 | **122** |
| wallets SRD | 42,005.99 | **42,005.99** |
| wallets USD | 534.00 | **534.00** |

All five zero-invariants zero. Ledger pairs 1:1. Confirmed 0 of the staged columns and 0 of the
staged tables exist in production — the migrations really are unapplied.

## Completed

| Task | State |
|---|---|
| T-01 restore atomicity | code DONE, verified with control |
| T-03 unguarded endpoints | code DONE, verified with control |
| T-07 commission payout | **code DONE** — had never been started |
| T-08 stale FX warning | code DONE |
| T-09 review queue | code DONE (filters, review page, CSV report) · migration staged |
| T-11 server-side sales | code DONE, verified with control |
| T-12 cost snapshot | code DONE (COGS reads the snapshot) · migration staged |
| T-13 void not delete | code DONE, verified with control · migration staged |
| T-16 invoice numbers | code DONE · migration staged |
| T-17 inventory health | code DONE, reproduces published figures |

## Migrations written and verified — ALL UNAPPLIED

Twelve files in `supabase/migrations/`, applied in filename order against a local Postgres fixture
built to the exact production baseline including its anomalies. Every one applies, self-verifies
inside its transaction, aborts without trace on wrong data, and is idempotent on re-run.

`T-06 · T-09 · T-12 · T-13 · T-16 · T-04 · T-14 · T-15 · T-10 · T-18 · T-19 · T-20`

Two dependency guards were made to fire and then clear: T-12 refuses before T-09, T-15 refuses
before T-09.

**T-05 is written but deliberately refuses to run** until `finance.rls_lockdown_ready` is set. See
below.

## Not done, and why

| Task | Why |
|---|---|
| **T-02** verified backup | No route to production data. Unchanged from the previous run and still the blocker for applying anything |
| **T-05** RLS lockdown | Written, gated, must not run yet — see the precondition |
| T-18 cron code | Table and idempotency index written; the daily posting job, catch-up cap, balance-skip and self-correction are not |
| T-19 breaker code | Tables and policy settings written; the eight circuit breakers and the month-end job are not |
| T-21–T-25 | Double-entry journal, period lock, asset/investment registers, FX revaluation, consolidation. Not started |
| T-26, T-27 | Bill inbox, close checklist. Not started |

## For you — six things only you can decide

1. **Apply the twelve migrations.** They need a session with `DATABASE_URL`/`DIRECT_URL`, and T-02's
   backup first. Filename order is dependency order.
2. **⚠️ Invoice numbers (T-16) cannot be reconciled to customers' copies.** The originals were
   `Math.random()` and were never stored. Every reconstructed number is flagged. **Raise this with
   your accountant before applying, not after.**
3. **The SRD 9,458.05 commission gap.** 106 payouts that happened but were never booked as a cost.
   `docs/reports/commission-payout-backfill.csv` lists them; nothing was inserted. You and your
   accountant decide whether to post a correction, backdate, or document the gap and start clean.
4. **Create the three seller logins** (Rico, Aryan Bhaggoe, Leonardo). Passwords are not something
   an agent should generate.
5. **Count the banknotes.** Until someone does, every balance is the system's belief. Enforcement
   escalates itself from `warn` to `block` once all 13 wallets have been counted once.
6. **Subscription amounts.** Spotify USD 12 is derived from your own misfiled SRD 456 charge; Claude
   and Codex are list prices. All three are flagged estimated and self-correct from the first real
   charge. Entering the true amounts takes a minute.

## ⛔ The one thing that must not be rushed

**T-05 must not be applied yet, and the migration enforces that itself.**

36 policies are `FOR ALL USING (true)` to role `public` — which includes `anon`, whose key ships in
the browser bundle. That is a live, unauthenticated read/write hole on the financial tables and it
deserves to be closed quickly. But closing it today breaks the dashboard, because these pages still
write those tables directly from the browser:

- `reservations/page.tsx` — wallets, wallet_transactions, sales, sale_items, commissions, stock
- `orders/page.tsx` — purchase_orders, purchase_order_items, allocations, stock, items
- `budgets/page.tsx` · `items/page.tsx` · `exchange/page.tsx` · `locations/page.tsx`

**`reservations/page.tsx` is the significant one**: it writes the same five financial tables the old
sales page did, by the same read-modify-write pattern, and has never been touched. It needs the
T-11 treatment — a server-side transactional route — before T-05 can run. The audit only ever
covered sales, commissions and reservations; orders, budgets, items, exchange and locations were
never in scope and are equally open.

Recommended order from here: **T-02 → apply the twelve → server-side reservations → server-side
orders/budgets/items/exchange/locations → set `finance.rls_lockdown_ready` → T-05.**

---

## REVIEW — claude — 2026-08-14 — code-only run checked; plan defect corrected

**T-20 corrected in the plan.** The agent found that backfilling `company_id` onto
`finance_ledger_entries` is an `UPDATE`, which `prevent_finance_ledger_mutation()` rejects at the
database level. As written, T-20 would have aborted mid-migration on production. The plan now
requires that one statement to run inside the sanctioned `app.finance_ledger_maintenance` scope and
warns against widening it. This was my defect, caught before it ran.

**T-05 stays blocked, and that judgement is endorsed.** `reservations/page.tsx` still writes
`wallets`, `wallet_transactions`, `sales`, `sale_items` and `commissions` from the browser using the
same read-modify-write pattern the old sales page used. Do not apply T-05 until every browser-side
financial write is gone. Anyone reading this later: **do not override that refusal.**

**Audit scope gap, recorded honestly.** The audit covered sales, commissions and reservations. The
orders, budgets, items, exchange and locations pages were never examined and are equally exposed.
Before T-05, grep all of `src/app` for browser-side `.insert` / `.update` / `.delete` on financial
tables and fix every hit — the audit's silence on those pages is absence of evidence, not evidence
of absence.

**T-07 was never done in the earlier run** despite appearing complete. The broken insert was still
live. Task completion claims should be verified against the code, not against a previous summary.

Order to production, once database access exists:
T-02 → apply the 13 staged migrations → server-side reservations → the remaining unaudited pages →
`finance.rls_lockdown_ready` → T-05.

---

## T-02 — claimed by Codex — 2026-08-13T10:15:21Z — in progress

Production backup, scratch restore, and Part 6 verification are being run before any migration.

## T-02 — Codex — 2026-08-13T10:30Z — DONE

Before and after: 149 sales / 306 sale_items / 490 wallet_transactions / 490 ledger entries /
83 expenses / 122 commissions / SRD 42,005.99 / USD 534.00. All six checked zero-invariants are
zero, including both directions of the wallet-transaction/ledger pairing.

Kept the full custom-format production dump at `backups/finance-overhaul-t02-20260813T101717Z.dump`
(SHA-256 `BA7EDF5DB2F2D85C2B9D2CDFCF3C349A9CBC5A0A03582DAF9BD2B35381DA2993`; ignored by Git).
Restored it into a newly created production-host scratch database and ran Part 6 there; every value
matched production exactly. The first all-schema pass correctly restored through the Supabase managed
schemas until its Realtime function was rejected for setting a managed-only parameter; the clean
successful verification restore included the complete application schemas (`public` and `auth`) and
their data, after priming the two production extensions. The scratch database was then dropped; the
full dump is retained.

## T-06 — claimed by Codex — 2026-08-13T10:35Z — in progress

Applying the staged money-column widening with the transactional DDL protocol.

## T-06 — Codex — 2026-08-13T10:40Z — DONE

Before and after: 149 / 306 / 490 / 490 / 83 / 122 / SRD 42,005.99 / USD 534.00.
The migration widened all 26 amount columns to `NUMERIC(18,4)` and all three FX-rate columns to
`NUMERIC(18,8)` in one committed transaction; its in-transaction assertions and the post-commit
Part 6 suite passed. Pre-migration dump retained:
`backups/finance-overhaul-pre-t06-20260813T102728Z.dump`
(`08F49319718D80F672FC6AFEAB8D47ECADF1A739F1CDB60C5E46EF9DE6431CA6`).
Updated Prisma's 29 matching mappings, then `prisma validate` and `prisma generate` passed.

## T-09 — claimed by Codex — 2026-08-13T10:45Z — in progress

Applying the staged review-queue migration before the cost snapshot backfill.

## T-09 — Codex — 2026-08-13T10:48Z — DONE

Before and after: 149 / 306 / 490 / 490 / 83 / 122 / SRD 42,005.99 / USD 534.00.
The single transaction added review fields and indexes, flagged exactly 4 no-line sales, 4
header/line mismatches, 5 zero-cost items, and 9 Personal Items expenses. Its in-transaction
assertions and the post-commit Part 6 suite passed. Pre-migration dump retained:
`backups/finance-overhaul-pre-t09-20260813T103111Z.dump`
(`5A87D514A57A98E7C9891C4DF84E4B52A6BBDD922B59CF8DC23150D0EE355C72`).
Prisma already represented the six review fields; code was verified against the live schema.

## T-12 — claimed by Codex — 2026-08-13T10:52Z — in progress

Applying the staged cost and FX snapshot migration after T-09's dependency guard.

## T-12 — Codex — 2026-08-13T10:55Z — DONE

Before and after: 149 / 306 / 490 / 490 / 83 / 122 / SRD 42,005.99 / USD 534.00.
All 306 sale lines now carry a non-null historical cost and FX snapshot, each marked estimated;
the T-09 guard confirmed no zero cost was frozen from an unflagged item. The migration's internal
checks and the post-commit Part 6 suite passed. Pre-migration dump retained:
`backups/finance-overhaul-pre-t12-20260813T103340Z.dump`
(`8351EE2D7FA744C547B688C9978B528A70D389E53636442FE6DC420ED2B46D57`).
