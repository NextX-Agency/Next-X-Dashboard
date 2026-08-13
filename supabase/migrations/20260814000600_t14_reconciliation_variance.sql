-- T-14 — Reconcile wallets on variance, not on a declared balance (F-21, F-34)
--
-- STATUS: NOT APPLIED.
--
-- `wallet_reconciliations` stores only `confirmed_balance` — someone asserting a
-- number. That is an assertion, not a reconciliation: nothing compares it to
-- what the ledger says should be there, so a difference cannot be detected, let
-- alone explained.
--
-- F-34 is why this matters: SRD 232,403 of manual corrections have moved more
-- money than the business has earned, and none of them carry a reason.
--
-- Historical rows are deliberately NOT backfilled with `expected_balance`.
-- There are none, and per F-34 the trail cannot be replayed. Inventing an
-- expectation for a past reconciliation would be exactly the fabrication R12
-- forbids.

BEGIN;

ALTER TABLE public.wallet_reconciliations
  ADD COLUMN IF NOT EXISTS expected_balance NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS variance NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS variance_reason TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_reconciliations_status_check') THEN
    ALTER TABLE public.wallet_reconciliations
      ADD CONSTRAINT wallet_reconciliations_status_check
      CHECK (status IN ('confirmed', 'variance_pending', 'variance_explained', 'system_baseline'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallet_reconciliations_status
  ON public.wallet_reconciliations (status) WHERE status <> 'confirmed';

DO $$
DECLARE
  bad int; n_wt int; n_ledger int; srd numeric;
BEGIN
  -- Nothing historical may be backfilled. T-10's baseline rows legitimately
  -- carry an expected_balance (that is what a baseline is), so they are
  -- excluded; anything else with one would be an invented expectation for a
  -- reconciliation that already happened, which is what R12 forbids.
  SELECT count(*) INTO bad
    FROM public.wallet_reconciliations
   WHERE expected_balance IS NOT NULL AND status <> 'system_baseline';
  IF bad <> 0 THEN
    RAISE EXCEPTION 'T-14 FAILED: % historical reconciliation(s) gained an invented expected_balance', bad;
  END IF;

  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  IF n_wt <> n_ledger OR srd <> 42005.99 THEN
    RAISE EXCEPTION 'T-14 FAILED: baseline moved — wt=% ledger=% SRD=%', n_wt, n_ledger, srd;
  END IF;

  RAISE NOTICE 'T-14 verified: variance columns added, no historical row backfilled.';
END $$;

COMMIT;

-- Still owed in code, and NOT done by this file:
--   * an ADMIN reconciliation page (the only UI today is in the seller portal
--     the admin never opens — F-30)
--   * a non-zero variance posts a ledger adjustment through a wallet_transactions
--     row, never a balance edit
--   * variance above a threshold requires a typed reason and blocks month-end close
