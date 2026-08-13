-- T-13 — Void sales instead of deleting them (F-06)
--
-- STATUS: NOT APPLIED. Written by a session with no database access. Apply with
-- the Part 1 transactional protocol, after a backup.
--
-- The undo path deleted commissions, then sale_items, then the sale. Meanwhile
-- finance_ledger_entries rejects DELETE at the database level, so every undo
-- permanently diverged the operational tables from the immutable ledger: the
-- money movement stayed on the ledger for a sale that no longer existed.
--
-- After this, undo posts contra entries under the original correlation_id and
-- the rows stay put.
--
-- Idempotent.

BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  -- Ties a sale to its ledger entries so a reversal can share the id. Sales
  -- created before T-11 have none; the void path falls back to the ledger
  -- entry's own correlation_id, and to a fresh one if there is no entry at all.
  ADD COLUMN IF NOT EXISTS correlation_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_status_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_status_check CHECK (status IN ('posted', 'voided'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales (status) WHERE status <> 'posted';

-- Every existing sale is posted. There is no history of voids because voiding
-- did not exist — undo deleted the row.
UPDATE public.sales SET status = 'posted' WHERE status IS DISTINCT FROM 'posted';

-- ---------------------------------------------------------------------------
-- Verification, inside the transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  not_posted int; n_sales int; n_items int; n_wt int; n_ledger int; n_expenses int;
  srd numeric; usd numeric;
BEGIN
  SELECT count(*) INTO not_posted FROM public.sales WHERE status <> 'posted';
  IF not_posted <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: % sales are not backfilled to posted', not_posted;
  END IF;

  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_items FROM public.sale_items;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT count(*) INTO n_expenses FROM public.expenses;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  SELECT round(sum(balance),2) INTO usd FROM public.wallets WHERE currency='USD';

  IF n_sales <> 149 OR n_items <> 306 OR n_wt <> 490 OR n_ledger <> 490 OR n_expenses <> 83
     OR srd <> 42005.99 OR usd <> 534.00 THEN
    RAISE EXCEPTION 'T-13 FAILED: baseline moved — sales=% sale_items=% wt=% ledger=% expenses=% SRD=% USD=%',
      n_sales, n_items, n_wt, n_ledger, n_expenses, srd, usd;
  END IF;

  RAISE NOTICE 'T-13 verified: % sales all posted; baseline unchanged.', n_sales;
END $$;

COMMIT;
