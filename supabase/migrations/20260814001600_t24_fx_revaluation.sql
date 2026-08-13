-- T-24 — Forward-only USD carrying-value revaluation in the SRD base currency.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fx_revaluation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  period_key TEXT NOT NULL CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  period_end DATE NOT NULL,
  exchange_rate_id UUID NOT NULL REFERENCES public.exchange_rates(id) ON DELETE RESTRICT,
  usd_balance NUMERIC(18,4) NOT NULL CHECK (usd_balance >= 0),
  carrying_value_srd NUMERIC(18,4) NOT NULL CHECK (carrying_value_srd >= 0),
  delta_srd NUMERIC(18,4) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('baseline','posted','zero')),
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, period_key),
  CHECK ((status = 'posted') = (journal_entry_id IS NOT NULL))
);

ALTER TABLE public.fx_revaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fx_revaluation_runs_company_period
  ON public.fx_revaluation_runs (company_id, period_end DESC);

INSERT INTO public.accounts (company_id, code, name, account_type, currency)
SELECT c.id, values.code, values.name, values.account_type, values.currency
FROM public.companies c
CROSS JOIN (VALUES
  ('1020', 'FX revaluation adjustment', 'asset', 'SRD'),
  ('7100', 'Unrealised FX gain', 'revenue', 'SRD'),
  ('7101', 'Unrealised FX loss', 'expense', 'SRD')
) AS values(code, name, account_type, currency)
WHERE c.is_active
ON CONFLICT (company_id, code, currency) DO NOTHING;

DO $$
DECLARE n_sales int; n_wt int; n_ledger int;
BEGIN
  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 THEN
    RAISE EXCEPTION 'T-24 FAILED: financial baseline moved';
  END IF;
END $$;

COMMIT;
