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

## T-03 — claimed by claude — 2026-08-13T02:02Z — in progress
