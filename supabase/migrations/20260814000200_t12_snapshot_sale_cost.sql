-- T-12 — Snapshot unit cost and FX rate onto sale lines (F-01, F-18)
--
-- STATUS: NOT APPLIED. Written by a session with no database access; nothing
-- here has run against production. Apply with the Part 1 transactional
-- protocol, after a backup (T-02).
--
-- REQUIRES T-09 FIRST. Reports currently read the item's *current*
-- purchase_price_usd, so editing a product's cost silently rewrites the margin
-- on every sale ever made. This freezes the cost and FX rate onto the line.
-- Running it before T-09 would freeze the five known zero costs in as though
-- they were facts.
--
-- Everything backfilled is flagged cost_is_estimated = true. It is an
-- inference — today's cost applied to a past sale — and must never become
-- indistinguishable from a cost that was actually recorded at the time (R3).
-- New sales write real values with cost_is_estimated = false.
--
-- Idempotent: columns added IF NOT EXISTS, backfill touches only NULL rows.

BEGIN;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost_usd NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS fx_rate_at_sale NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS cost_is_estimated BOOLEAN NOT NULL DEFAULT true;

-- Backfill from the item's cost today and the sale's own FX rate. 15 of the 149
-- sales carry no exchange_rate, so those fall back to 38.0 — the rate active
-- since 2026-06-05.
UPDATE public.sale_items si
   SET unit_cost_usd   = i.purchase_price_usd,
       fx_rate_at_sale = COALESCE(s.exchange_rate, 38.0),
       cost_is_estimated = true
  FROM public.items i, public.sales s
 WHERE si.item_id = i.id
   AND si.sale_id = s.id
   AND si.unit_cost_usd IS NULL;

-- ---------------------------------------------------------------------------
-- Verification, inside the transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  null_cost int; null_rate int; estimated int; total_lines int;
  unflagged_zero_cost int;
  n_sales int; n_wt int; n_ledger int; n_expenses int;
  srd numeric; usd numeric;
BEGIN
  SELECT count(*) INTO null_cost FROM public.sale_items WHERE unit_cost_usd IS NULL;
  IF null_cost <> 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: % sale_items still have a null unit_cost_usd', null_cost;
  END IF;

  SELECT count(*) INTO null_rate FROM public.sale_items WHERE fx_rate_at_sale IS NULL;
  IF null_rate <> 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: % sale_items still have a null fx_rate_at_sale', null_rate;
  END IF;

  SELECT count(*) INTO total_lines FROM public.sale_items;
  IF total_lines <> 306 THEN
    RAISE EXCEPTION 'T-12 FAILED: sale_items is %, expected 306', total_lines;
  END IF;

  SELECT count(*) INTO estimated FROM public.sale_items WHERE cost_is_estimated;
  IF estimated <> total_lines THEN
    RAISE EXCEPTION 'T-12 FAILED: % of % backfilled lines are not flagged estimated', total_lines - estimated, total_lines;
  END IF;

  -- Guard the T-09 dependency: a line whose cost snapshotted to zero must
  -- belong to an item already flagged for review, or the zero has just been
  -- frozen into history unnoticed.
  SELECT count(*) INTO unflagged_zero_cost
    FROM public.sale_items si JOIN public.items i ON i.id = si.item_id
   WHERE si.unit_cost_usd = 0 AND NOT i.needs_review;
  IF unflagged_zero_cost > 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: % line(s) snapshotted a zero cost from an unflagged item. Run T-09 first.',
      unflagged_zero_cost;
  END IF;

  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT count(*) INTO n_expenses FROM public.expenses;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  SELECT round(sum(balance),2) INTO usd FROM public.wallets WHERE currency='USD';
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 OR n_expenses <> 83
     OR srd <> 42005.99 OR usd <> 534.00 THEN
    RAISE EXCEPTION 'T-12 FAILED: baseline moved — sales=% wt=% ledger=% expenses=% SRD=% USD=%',
      n_sales, n_wt, n_ledger, n_expenses, srd, usd;
  END IF;

  RAISE NOTICE 'T-12 verified: % lines carry a snapshotted cost and FX rate, all flagged estimated.', total_lines;
END $$;

COMMIT;

-- Still owed by T-12, and NOT done by this file:
--   * src/lib/reportCalculations.ts:107 must read si.unit_cost_usd, never
--     item.purchasePriceUsd. Until it does, the columns exist but change nothing.
--   * POST /api/sales must write the real cost with cost_is_estimated = false.
--   * Reports covering pre-cutover periods show an "includes estimated costs" note.
--
-- Acceptance test for the whole point of this task: change an item's
-- purchase_price_usd and confirm historical gross profit does not move.
