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

## T-01 — claimed by claude — 2026-08-13T01:30Z — in progress
