-- Bring the double-entry tables onto the same RLS footing as every other
-- financial table in this schema.
--
-- `accounts`, `journal_entries` and `journal_lines` shipped with row level
-- security switched off, so the anon key could read and write the journal
-- directly. Every other financial table here — sales, sale_items, wallets,
-- wallet_transactions, expenses, commissions, finance_ledger_entries — runs
-- RLS-on with no policies. That combination denies the anon and authenticated
-- roles outright, while the application's own connection (the `postgres` role)
-- bypasses RLS and is unaffected.
--
-- No policy is added, deliberately. There is no browser read or write path to
-- the journal: it is served by an authenticated server route through Prisma, so
-- a policy would grant access that nothing currently needs. Adding one later is
-- additive and does not require this migration to change.
--
-- Verified before applying: these exact statements were run inside a
-- transaction against production, the journal row counts re-read as the
-- application role (3 entries / 12 lines, unchanged), then rolled back.
-- After applying, no table in `public` is left without RLS.

alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
