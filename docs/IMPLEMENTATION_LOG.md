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
