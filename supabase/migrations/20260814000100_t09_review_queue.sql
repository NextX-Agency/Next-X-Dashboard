-- T-09 — Review queue for unresolvable history (Part 5 items)
--
-- STATUS: NOT APPLIED. Written by a session with no database access; nothing
-- here has run against production. Apply with the Part 1 transactional
-- protocol, after a backup (T-02).
--
-- This task resolves nothing and deletes nothing. It records which historical
-- rows cannot be trusted and why, so that derived figures can exclude them
-- (R12). Every count below was measured against production on 2026-08-13 and
-- matches the runbook: 4 sales with no lines, 4 header/line mismatches,
-- 5 zero-cost items, 9 "Personal Items" expenses.
--
-- Idempotent: columns are added IF NOT EXISTS, and the flag updates are
-- restricted to rows not already flagged for the same reason, so re-running
-- changes nothing.
--
-- MUST run before T-12. T-12 freezes item cost onto sale lines; flagging the
-- zero-cost items first is what stops a zero being frozen in as though it were
-- a real cost.

BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_needs_review ON public.sales (needs_review) WHERE needs_review;
CREATE INDEX IF NOT EXISTS idx_expenses_needs_review ON public.expenses (needs_review) WHERE needs_review;
CREATE INDEX IF NOT EXISTS idx_items_needs_review ON public.items (needs_review) WHERE needs_review;

-- 4 sale headers with no line items — SRD 11,420.02.
-- Revenue recorded with no cost of goods, so margin on these is meaningless.
UPDATE public.sales s
   SET needs_review = true,
       review_reason = 'No line items: revenue recorded with no cost of goods. Restore lines or void.'
 WHERE NOT EXISTS (SELECT 1 FROM public.sale_items si WHERE si.sale_id = s.id)
   AND s.review_reason IS DISTINCT FROM
       'No line items: revenue recorded with no cost of goods. Restore lines or void.';

-- 4 header/line mismatches — SRD 1,050.02.
-- The line-item sum is authoritative for margin (it is the only figure with a
-- cost attached); the header stays authoritative for cash, because that is what
-- moved through the wallet.
UPDATE public.sales s
   SET needs_review = true,
       review_reason = 'Header total disagrees with sum of line items.'
  FROM (SELECT sale_id, sum(subtotal) AS line_sum FROM public.sale_items GROUP BY sale_id) i
 WHERE i.sale_id = s.id
   AND abs(s.total_amount - i.line_sum) > 0.01
   AND s.review_reason IS DISTINCT FROM 'Header total disagrees with sum of line items.';

-- 5 items with no purchase cost. Any sale of these reports 100% margin.
UPDATE public.items
   SET needs_review = true,
       review_reason = 'Purchase cost is zero: sales of this item report 100% margin.'
 WHERE purchase_price_usd = 0
   AND deleted_at IS NULL
   AND review_reason IS DISTINCT FROM
       'Purchase cost is zero: sales of this item report 100% margin.';

-- 9 "Personal Items" expenses — SRD 10,662. The category mixes inventory,
-- personal spending and one Spotify charge. Left unclassified deliberately;
-- T-15 must not sweep these into a classification.
UPDATE public.expenses e
   SET needs_review = true,
       review_reason = 'Category mixes inventory, personal spending and a subscription. Classify individually.'
  FROM public.expense_categories ec
 WHERE ec.id = e.category_id
   AND ec.name = 'Personal Items'
   AND e.review_reason IS DISTINCT FROM
       'Category mixes inventory, personal spending and a subscription. Classify individually.';

-- ---------------------------------------------------------------------------
-- Verification, inside the transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  no_lines int; mismatch int; zero_cost int; personal int;
  n_sales int; n_items int; n_wt int; n_ledger int; n_expenses int;
  srd numeric; usd numeric;
BEGIN
  SELECT count(*) INTO no_lines FROM public.sales
   WHERE needs_review AND review_reason LIKE 'No line items:%';
  SELECT count(*) INTO mismatch FROM public.sales
   WHERE needs_review AND review_reason = 'Header total disagrees with sum of line items.';
  SELECT count(*) INTO zero_cost FROM public.items WHERE needs_review;
  SELECT count(*) INTO personal FROM public.expenses WHERE needs_review;

  IF no_lines <> 4 THEN RAISE EXCEPTION 'T-09 FAILED: % sales flagged for missing lines, expected 4', no_lines; END IF;
  IF mismatch <> 4 THEN RAISE EXCEPTION 'T-09 FAILED: % sales flagged for mismatch, expected 4', mismatch; END IF;
  IF zero_cost <> 5 THEN RAISE EXCEPTION 'T-09 FAILED: % items flagged, expected 5', zero_cost; END IF;
  IF personal <> 9 THEN RAISE EXCEPTION 'T-09 FAILED: % expenses flagged, expected 9', personal; END IF;

  -- Nothing may be deleted or altered in value by a flagging migration.
  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_items FROM public.sale_items;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT count(*) INTO n_expenses FROM public.expenses;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  SELECT round(sum(balance),2) INTO usd FROM public.wallets WHERE currency='USD';

  IF n_sales <> 149 OR n_items <> 306 OR n_wt <> 490 OR n_ledger <> 490 OR n_expenses <> 83
     OR srd <> 42005.99 OR usd <> 534.00 THEN
    RAISE EXCEPTION 'T-09 FAILED: baseline moved — sales=% sale_items=% wt=% ledger=% expenses=% SRD=% USD=%',
      n_sales, n_items, n_wt, n_ledger, n_expenses, srd, usd;
  END IF;

  RAISE NOTICE 'T-09 verified: 4 sales without lines, 4 mismatches, 5 items, 9 expenses flagged; baseline unchanged.';
END $$;

COMMIT;

-- Still owed by T-09, and NOT done by this file:
--   * exclude needs_review rows from margin, run-rate and payout calculations
--   * an admin review page listing them with their reason
--   * docs/reports/commission-payout-backfill.csv — a REPORT of the 106
--     proposed commission-payout expenses totalling SRD 9,458.05.
--     Report only. Do not insert them (Part 5, R1, R11).
