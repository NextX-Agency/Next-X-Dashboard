-- T-23 — Forward-only asset and investment registers; no historical wallet mutation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.investment_holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  investee TEXT NOT NULL,
  instrument TEXT NOT NULL,
  ownership_percent NUMERIC(7,4),
  cost NUMERIC(18,4) NOT NULL CHECK (cost >= 0),
  carrying_value NUMERIC(18,4) NOT NULL CHECK (carrying_value >= 0),
  currency TEXT NOT NULL DEFAULT 'SRD' CHECK (currency IN ('SRD','USD')),
  valuation_method TEXT NOT NULL DEFAULT 'cost',
  valued_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
  disposed_on DATE,
  disposal_proceeds NUMERIC(18,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ownership_percent IS NULL OR ownership_percent BETWEEN 0 AND 100),
  CHECK ((status = 'disposed') = (disposed_on IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  acquired_on DATE NOT NULL,
  cost NUMERIC(18,4) NOT NULL CHECK (cost >= 0),
  residual_value NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  currency TEXT NOT NULL DEFAULT 'SRD' CHECK (currency IN ('SRD','USD')),
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line','none')),
  useful_life_months INTEGER CHECK (useful_life_months IS NULL OR useful_life_months > 0),
  accumulated_depreciation NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (accumulated_depreciation >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
  disposed_on DATE,
  disposal_proceeds NUMERIC(18,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (residual_value <= cost),
  CHECK (accumulated_depreciation <= cost - residual_value),
  CHECK ((depreciation_method = 'none' AND useful_life_months IS NULL) OR (depreciation_method = 'straight_line' AND useful_life_months IS NOT NULL)),
  CHECK ((status = 'disposed') = (disposed_on IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.asset_depreciation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fixed_asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE RESTRICT,
  period_key TEXT NOT NULL CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fixed_asset_id, period_key)
);

ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_depreciation_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_investment_holdings_company_status ON public.investment_holdings (company_id, status, investee);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_company_status ON public.fixed_assets (company_id, status, acquired_on);
CREATE INDEX IF NOT EXISTS idx_asset_depreciation_runs_period ON public.asset_depreciation_runs (period_key, posted_at DESC);

INSERT INTO public.accounts (company_id, code, name, account_type, currency)
SELECT c.id, values.code, values.name, values.account_type, values.currency
FROM public.companies c
CROSS JOIN (VALUES
  ('1600', 'Fixed assets at cost', 'asset', 'SRD'),
  ('1601', 'Fixed assets at cost', 'asset', 'USD'),
  ('1610', 'Accumulated depreciation', 'asset', 'SRD'),
  ('1611', 'Accumulated depreciation', 'asset', 'USD'),
  ('6100', 'Depreciation expense', 'expense', 'SRD'),
  ('6101', 'Depreciation expense', 'expense', 'USD')
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
    RAISE EXCEPTION 'T-23 FAILED: financial baseline moved';
  END IF;
END $$;

COMMIT;
