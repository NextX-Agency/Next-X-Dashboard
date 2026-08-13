-- T-19 — Month-end payout on a percentage waterfall (F-26, audit §7)
--
-- STATUS: NOT APPLIED. Requires T-07 and T-15, or the run rate is computed from
-- unclassified data.
--
-- A draw is an expense with classification = 'owner_draw', which already exists
-- and is already excluded from operating profit. This adds the batch that
-- computes and posts it.
--
-- Commissions are a cost ABOVE the line: resellers are paid first, always.
-- Distributable profit then splits savings 65 / founders 20 / restock cap 15,
-- moving to 50/30/20 once savings clears SRD 23,439.
--
-- The restock share is a PURCHASING CEILING, not a transfer. No money moves for it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.founders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  split_percent NUMERIC(5,2) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT founders_split_check CHECK (split_percent >= 0 AND split_percent <= 100)
);

CREATE TABLE IF NOT EXISTS public.payout_runs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_key             TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'draft',
  -- The waterfall, recorded as computed so a run can always explain itself.
  trailing_months        INT NOT NULL DEFAULT 3,
  trailing_avg_profit    NUMERIC(18,4) NOT NULL DEFAULT 0,
  distributable          NUMERIC(18,4) NOT NULL DEFAULT 0,
  savings_amount         NUMERIC(18,4) NOT NULL DEFAULT 0,
  founders_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
  restock_ceiling        NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency               TEXT NOT NULL DEFAULT 'SRD',
  source_wallet_id       UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  savings_wallet_id      UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  correlation_id         UUID NOT NULL DEFAULT uuid_generate_v4(),
  -- Which breaker downgraded it, if any. Null on a posted run.
  blocked_by             TEXT,
  blocked_detail         TEXT,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at              TIMESTAMPTZ,
  reversed_at            TIMESTAMPTZ,
  created_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes                  TEXT,
  CONSTRAINT payout_runs_status_check CHECK (status IN ('draft','posted','reversed','skipped'))
);

-- One run per period. A second attempt at the same month cannot post twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_runs_period_unique
  ON public.payout_runs (period_key) WHERE status IN ('draft','posted');

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payout_run_id UUID REFERENCES public.payout_runs(id) ON DELETE SET NULL;

-- Policy defaults. All tunable without a deploy; all deliberately conservative.
INSERT INTO public.store_settings (key, value)
SELECT k, v FROM (VALUES
  ('finance.payout_max_srd', '10000'),
  ('finance.payout_reserve_floor_srd', '15000'),
  ('finance.payout_savings_target_srd', '23439'),
  ('finance.payout_split_savings_pct', '65'),
  ('finance.payout_split_founders_pct', '20'),
  ('finance.payout_split_restock_pct', '15'),
  ('finance.payout_split_savings_pct_after_target', '50'),
  ('finance.payout_split_founders_pct_after_target', '30'),
  ('finance.payout_split_restock_pct_after_target', '20'),
  ('finance.payout_trailing_months', '3'),
  ('finance.payout_anomaly_multiple', '2'),
  ('finance.payout_stale_fx_days', '30')
) AS s(k, v)
WHERE NOT EXISTS (SELECT 1 FROM public.store_settings ss WHERE ss.key = s.k);

DO $$
DECLARE
  posted int; splits numeric; n_expenses int; srd numeric;
BEGIN
  -- Creating the machinery must not post anything.
  SELECT count(*) INTO posted FROM public.payout_runs WHERE status = 'posted';
  IF posted <> 0 THEN RAISE EXCEPTION 'T-19 FAILED: % payout run(s) already posted', posted; END IF;

  SELECT sum(value::numeric) INTO splits FROM public.store_settings
   WHERE key IN ('finance.payout_split_savings_pct','finance.payout_split_founders_pct','finance.payout_split_restock_pct');
  IF splits <> 100 THEN RAISE EXCEPTION 'T-19 FAILED: waterfall splits sum to %, expected 100', splits; END IF;

  SELECT count(*) INTO n_expenses FROM public.expenses;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  IF n_expenses <> 83 OR srd <> 42005.99 THEN
    RAISE EXCEPTION 'T-19 FAILED: baseline moved — expenses=% SRD=%', n_expenses, srd;
  END IF;

  RAISE NOTICE 'T-19 verified: payout machinery in place, nothing posted, splits sum to 100.';
END $$;

COMMIT;

-- ⚠️ NO FOUNDER ROWS ARE SEEDED. Split percentages between founders are a
-- commercial agreement, not something an agent may invent. Until a founders row
-- exists, a payout run computes and stays a draft.
--
-- Still owed in code, and NOT done by this file — the eight circuit breakers,
-- every one of which downgrades a run to a draft rather than posting:
--   negative earnings · reserve floor · hard cap · absolute ceiling
--   (finance.payout_max_srd, default SRD 10,000) · anomaly (>2x trailing average)
--   · data integrity (unexplained wallet variance, or a subscription due and
--   unposted) · stale FX (>30 days) · reconciliation (block enforcement only)
--
-- Back-test to reproduce before shipping: trailing-3 for 2026-07 is SRD 4,789
-- and 20% of it is SRD 958. A different number means the maths is wrong.
--
-- Reuse src/lib/serializableTransaction.ts — a payout touches the same wallet
-- rows as sales and will hit the same P2034 conflict.
