# Restore verification harness

Evidence for **T-01** (`docs/IMPLEMENTATION_PLAN.md`): a deliberately failed restore must leave the
database exactly as it was. Reused by **T-02** to check a baseline backup restores cleanly.

Everything here runs against a **throwaway local Postgres**. Nothing in this directory should ever be
pointed at production — the whole point is a restore you are allowed to break.

## Why it exists

`POST /api/backup/restore` used to wipe every table in one committed transaction and then insert
table by table outside it. A failure partway left the database emptied and half-populated with
nothing to roll back to. The harness reproduces exactly that failure and asserts it can no longer
destroy data.

## Setup

Supabase branching is unavailable on the free plan, so the test target is a local cluster:

```bash
SCRATCH=/tmp/restore-verify
PGDIR=$SCRATCH/pgdata
export PATH=/usr/lib/postgresql/16/bin:$PATH

mkdir -p $PGDIR && chown postgres:postgres $PGDIR
su postgres -c "initdb -D $PGDIR -U postgres --auth=trust"
su postgres -c "pg_ctl -D $PGDIR -o '-p 55432 -c listen_addresses=127.0.0.1' -l $SCRATCH/pg.log start"
psql postgresql://postgres@127.0.0.1:55432/postgres -c 'CREATE DATABASE nextx_t01;'

export DATABASE_URL="postgresql://postgres@127.0.0.1:55432/nextx_t01"
export DIRECT_URL="$DATABASE_URL"
psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;'
./node_modules/.bin/prisma db push --skip-generate
```

`prisma db push` does not create triggers, and the restore path depends on them. Apply the ledger
trigger block from `supabase/migrations/20260812111000_finance_traceability_vendor_access.sql`
(the `prevent_finance_ledger_mutation` / `capture_wallet_transaction_ledger` functions and their two
triggers) before seeding, or the harness will not exercise the ledger scoping at all.

`saveBackupToBlob` needs Vercel Blob credentials. With none available, stub `@vercel/blob` with a
filesystem-backed `put`/`get`/`list`/`del` for the duration of the run — the pre-restore safety
snapshot happens before the restore transaction and would otherwise abort it early.

Then seed, build, and start the app against that database:

```bash
node scripts/restore-verification/seed.mjs
pnpm build && PORT=3210 pnpm start
```

## The two checks

```bash
node scripts/restore-verification/verify.mjs          # failure path
node scripts/restore-verification/verify-success.mjs  # happy path
```

`verify.mjs` exports a real backup, repoints one sale item at an item id that does not exist, drops
the payload checksum so validation lets it through, and fires a wipe restore. The foreign key
violation lands during the insert phase — after the wipe — which is precisely the case that used to
destroy data. It must print PASS.

`verify-success.mjs` restores an untouched backup and asserts it still commits and that
`wallet_transactions` still pair 1:1 with `finance_ledger_entries`.

## Confirm the test can actually fail

A test that passes against the broken code proves nothing. Check out the parent of the T-01 commit,
rebuild, and run `verify.mjs` again: it reports

```
FAIL — the database was modified by a restore that did not succeed.
       saleItems: 1 -> 0
```

The row is gone for good, and the old endpoint still answered HTTP 200. That is the bug, and that is
what the fix removes.
