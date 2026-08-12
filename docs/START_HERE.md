# Start here

Everything for the finance overhaul is on branch **`finance-overhaul`**. Paste one of the prompts
below into the relevant agent and it will begin. Nothing else needs setting up.

---

## Before the first run — check these three things

The agents cannot set secrets. If any of these is missing, the run stops on task one.

| What | Needed by | Check |
|---|---|---|
| `DATABASE_URL` and `DIRECT_URL` | Every Prisma command | `./node_modules/.bin/prisma validate` succeeds |
| Supabase MCP on project `ivvhazwjtnyznojeoojs` | The migration agent only | `list_tables` returns |
| `CRON_SECRET` | T-18 onward, not before | Set in Vercel env |

`CRON_SECRET` is not needed to start — it becomes necessary around week four. The other two are.

**Already handled for you:** the migration agent is set to `claude` in `IMPLEMENTATION_LOG.md`, the
Supabase free-plan limitation is documented with a working alternative, and the baseline production
counts are recorded so any unexplained drift halts the run.

---

## Prompt 1 — the migration agent (start this one first)

```
You are the MIGRATION AGENT for this project. You are the only agent permitted to
change the database schema.

Read AGENTS.md (or CLAUDE.md), then docs/IMPLEMENTATION_PLAN.md in full — especially
Parts 0-5 and Part 8. Then read docs/FINANCIAL_AUDIT.md for why the rules exist.

Work on branch finance-overhaul.

Execute the runbook autonomously starting at T-01, in the order given in Part 7.
Follow the Part 2 execution loop for every task: claim the task in
docs/IMPLEMENTATION_LOG.md and push the claim, verify before, change, backfill,
verify after, run the Part 6 suite, lint, build, commit, log.

The Supabase org is on the free plan, so database branching is unavailable and
create_branch will fail. Use the transactional DDL protocol in Part 1 instead:
BEGIN, migrate, backfill, verify inside the transaction, then COMMIT only if every
check passed, otherwise ROLLBACK.

T-01 blocks everything. Do not start T-02 until a deliberately failed restore has
been shown to leave the database intact.

Phase A (T-01 to T-08) is strictly sequential and single-agent — do all of it
yourself before any parallel work begins.

Do not ask me questions. Part 5 gives a default for every unknown. Honour the stop
conditions in Part 2: if a verification count moves and the task did not predict it,
halt and report rather than continuing.
```

## Prompt 2 — the code agent (start after Phase A is done)

```
You are the CODE AGENT for this project. You must NEVER change the database schema —
no apply_migration, no DDL through execute_sql, no create_branch. If a task requires a
migration, stop and hand it to the migration agent.

Read AGENTS.md (or CLAUDE.md), then docs/IMPLEMENTATION_PLAN.md in full — especially
Parts 0-5 and Part 8. Then read docs/FINANCIAL_AUDIT.md.

Work on branch finance-overhaul. Pull and rebase before every commit.

Check docs/IMPLEMENTATION_LOG.md. If Phase A (T-01 to T-08) is not yet complete, stop
and wait — do not start. Once it is complete, take code-only tasks whose Part 7
dependencies are met, starting with T-11 (src/app/sales/page.tsx, 1,972 lines — the
largest pure-code job in the plan).

Claim every task in docs/IMPLEMENTATION_LOG.md and push the claim BEFORE writing any
other code. The push is the lock. Never work on an unclaimed task.

Do not ask me questions. Part 5 gives a default for every unknown. If your reading
contradicts what the other agent already did, stop and report — do not "fix" it.
```

---

## What to expect

**Week one** is Phase A — the safety work. The most important moment in the whole project is T-01:
until restore is atomic, there is no rollback for anything that follows. Expect the agent to spend
real time there, and treat a fast T-01 as a warning sign rather than good progress.

**Phase B** flags the historical records nobody can resolve — the four orphaned sales, the SRD 500
drift, the "Personal Items" bucket — and excludes them from every derived figure. Nothing is deleted
and nothing is guessed.

**Phase C** is the largest code change, rewriting sale creation server-side. This is where the four
item-less sales and the wallet drift stop being possible.

**Phase D** delivers what you asked for: overstock visibility, subscriptions that deduct themselves,
and month-end payouts.

**Phases E and F** are the ledger, the company entity, investments, and automation.

Roughly 14–18 weeks at a steady pace. Phases A and B are about two weeks and remove most of the risk.

---

## The two things you still have to do yourself

**Count the cash.** No software can verify banknotes in a drawer. The system no longer waits for it —
T-10 establishes a ledger baseline and continues — but until someone counts, every wallet balance is
the system's belief rather than a verified fact. Given that manual corrections have moved more money
than the business has earned (F-34), that distinction is worth taking seriously. Once all 13 wallets
have been counted once, reconciliation enforcement escalates itself from `warn` to `block`.

**Check the subscription amounts.** T-18 seeds Codex, Claude and Spotify from list prices, flagged as
estimated, and corrects them from the first real charge. If you know the true amounts, entering them
takes a minute and removes the estimate.

Neither blocks the run.

---

## If something goes wrong

The agents are instructed to halt rather than improvise. If one stops and reports:

1. Read `docs/IMPLEMENTATION_LOG.md` — the last entry says what it was doing.
2. Run the Part 6 verification suite. If the counts match the baseline, nothing was damaged.
3. The baseline is `149 sales / 490 wallet transactions / 490 ledger entries / 83 expenses /
   SRD 42,005.99 / USD 534.00`.

If counts have moved and no task explains it, restore the T-02 backup — which is why T-01 comes
first.
