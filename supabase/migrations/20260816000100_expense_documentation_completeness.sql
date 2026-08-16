-- Expense documentation completeness.
--
-- `expense_date` shipped without a backfill (R6): 83 of 85 expenses carry NULL
-- while `created_at` is populated on every row. Every reader in the codebase
-- already falls back to `expense_date ?? created_at`, and every date window is
-- written as `expense_date >= x OR (expense_date IS NULL AND created_at >= x)`,
-- so filling the column from `created_at` in UTC hands each row the exact value
-- its own fallback was already using. Checked on production before applying:
-- 8 of the 83 rows land on a different calendar day under Suriname local time,
-- and 0 of them change calendar month, so no monthly or yearly figure moves.
-- The 8 are flagged like every other backfilled row and can be corrected in the
-- review queue.
--
-- An inferred value must never become indistinguishable from a recorded one
-- (R7), so every backfilled row is flagged. The flag is also the precise undo
-- for this backfill:
--   UPDATE public.expenses SET expense_date = NULL, date_is_inferred = false
--    WHERE date_is_inferred;
--
-- `vendor_is_inferred` and `description_is_inferred` carry the same guarantee
-- for the review queue's grouped answers: when the owner answers "every Shipping
-- expense went to <supplier>", the 20 rows that answer fills in are marked as
-- derived from a group answer rather than read off a document.
--
-- `expense_categories.default_vendor_name` / `default_description` remember
-- those answers so a new expense in the same category stops reopening the same
-- gap.
--
-- Nothing here touches an amount, a wallet, a wallet transaction or a ledger
-- entry, and no row is deleted (R4).

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS date_is_inferred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_is_inferred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description_is_inferred boolean NOT NULL DEFAULT false;

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS default_vendor_name text,
  ADD COLUMN IF NOT EXISTS default_description text;

COMMENT ON COLUMN public.expenses.receipt_number IS
  'Optional supporting reference. Deliberately excluded from the documentation '
  'completeness checks by owner decision on 2026-08-16: no expense in the book '
  'carries one, so a blank receipt is noise rather than an open question. '
  'Stored values are still kept, shown and never cleared.';

COMMENT ON COLUMN public.expenses.date_is_inferred IS
  'True when expense_date was derived rather than recorded. Set by the '
  '2026-08-16 backfill from created_at, and by any later inference.';

-- Backfill, in the same migration as the schema change.
UPDATE public.expenses
   SET expense_date = (created_at AT TIME ZONE 'UTC')::date,
       date_is_inferred = true
 WHERE expense_date IS NULL;
