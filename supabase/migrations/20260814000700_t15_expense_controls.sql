-- T-15 — Classify and document expenses (F-20, F-27, F-29)
--
-- STATUS: NOT APPLIED.
--
-- `classification`, `vendor_name`, `receipt_number` and `reviewed_at` all exist
-- and all 83 expense rows have none of them. A control that is not enforced at
-- entry does not exist.
--
-- Backfill is by existing category, and only where the category genuinely
-- determines the answer:
--
--   Business Expense -> inventory      Shipping  -> operating
--   Marketing        -> marketing      Copilot   -> operating
--   Personal Items   -> LEFT unclassified, deliberately
--
-- "Personal Items" mixes inventory, personal spending and one Spotify charge.
-- T-09 flags those nine rows for individual review; sweeping them into a
-- classification here would erase the very uncertainty T-09 recorded.
--
-- REQUIRES T-09 to have run, so the nine rows are already flagged.

BEGIN;

INSERT INTO public.expense_categories (name)
SELECT 'Software & subscriptions'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Software & subscriptions');

UPDATE public.expenses e
   SET classification = CASE ec.name
     WHEN 'Business Expense' THEN 'inventory'
     WHEN 'Shipping'         THEN 'operating'
     WHEN 'Marketing'        THEN 'marketing'
     WHEN 'Copilot'          THEN 'operating'
     ELSE e.classification
   END
  FROM public.expense_categories ec
 WHERE ec.id = e.category_id
   AND e.classification = 'unclassified'
   AND ec.name IN ('Business Expense', 'Shipping', 'Marketing', 'Copilot');

-- Fold Copilot into the new subscriptions category, keeping the expenses.
UPDATE public.expenses e
   SET category_id = (SELECT id FROM public.expense_categories WHERE name = 'Software & subscriptions')
  FROM public.expense_categories ec
 WHERE ec.id = e.category_id AND ec.name = 'Copilot';

DELETE FROM public.expense_categories ec
 WHERE ec.name = 'Copilot'
   AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.category_id = ec.id);

DO $$
DECLARE
  unclassified int; flagged_unclassified int; n_expenses int; srd numeric;
BEGIN
  SELECT count(*) INTO unclassified FROM public.expenses WHERE classification = 'unclassified';
  SELECT count(*) INTO flagged_unclassified
    FROM public.expenses WHERE classification = 'unclassified' AND needs_review;

  -- The only rows still unclassified must be the nine T-09 flagged.
  IF unclassified <> flagged_unclassified THEN
    RAISE EXCEPTION 'T-15 FAILED: % unclassified expenses but only % are flagged for review',
      unclassified, flagged_unclassified;
  END IF;
  IF unclassified <> 9 THEN
    RAISE EXCEPTION 'T-15 FAILED: % unclassified expenses, expected the 9 Personal Items rows', unclassified;
  END IF;

  SELECT count(*) INTO n_expenses FROM public.expenses;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  IF n_expenses <> 83 OR srd <> 42005.99 THEN
    RAISE EXCEPTION 'T-15 FAILED: baseline moved — expenses=% SRD=%', n_expenses, srd;
  END IF;

  RAISE NOTICE 'T-15 verified: only the 9 flagged Personal Items rows remain unclassified.';
END $$;

COMMIT;

-- Still owed in code: require date, vendor, receipt and classification at entry.
-- POST /api/expenses already enforces vendor, description and classification;
-- the expenses UI must stop offering "unclassified" as a choice.
