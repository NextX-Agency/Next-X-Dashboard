-- T-20 — Company entity (F-07)
--
-- STATUS: NOT APPLIED.
--
-- The three locations are BRANCHES OF ONE COMPANY, not three companies. All map
-- to NextX. company_id is denormalised onto every financial table deliberately,
-- so RLS never needs a join to decide access.
--
-- Nothing may be forked before this exists: a fork without company identity has
-- nothing to consolidate on (T-25).

BEGIN;

CREATE TABLE IF NOT EXISTS public.companies (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT NOT NULL,
  legal_name              TEXT,
  base_currency           TEXT NOT NULL DEFAULT 'SRD',
  tax_id                  TEXT,
  fiscal_year_start_month INT NOT NULL DEFAULT 1,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.companies (name, base_currency)
SELECT 'NextX', 'SRD' WHERE NOT EXISTS (SELECT 1 FROM public.companies);

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
UPDATE public.locations SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
 WHERE company_id IS NULL;
ALTER TABLE public.locations ALTER COLUMN company_id SET NOT NULL;

-- company_id on every financial table, backfilled via location_id.
DO $$
DECLARE
  t text;
  company uuid;
BEGIN
  SELECT id INTO company FROM public.companies ORDER BY created_at LIMIT 1;

  FOREACH t IN ARRAY ARRAY['sales','expenses','wallets','commissions','finance_obligations','budgets','purchase_orders'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id)', t);
    EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', t, company);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_company ON public.%I (company_id)', t, t);
  END LOOP;

  -- sale_items and wallet_transactions inherit through their parent, but carry
  -- it too so an RLS policy never has to join.
  FOREACH t IN ARRAY ARRAY['sale_items','wallet_transactions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id)', t);
    EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', t, company);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_company ON public.%I (company_id)', t, t);
  END LOOP;

  -- finance_ledger_entries is append-only and rejects UPDATE at the database
  -- level, so backfilling a column on it needs the one sanctioned bypass:
  -- the scoped app.finance_ledger_maintenance flag the wipe-restore path uses
  -- (R9). It is switched on for this single statement and off immediately.
  --
  -- Worth knowing: without this the whole migration aborts with
  -- "finance_ledger_entries is append-only". That is the trigger working, not a
  -- bug — but it means this table cannot be backfilled like the others.
  ALTER TABLE public.finance_ledger_entries
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
  PERFORM set_config('app.finance_ledger_maintenance', 'on', true);
  UPDATE public.finance_ledger_entries SET company_id = company WHERE company_id IS NULL;
  PERFORM set_config('app.finance_ledger_maintenance', 'off', true);
  CREATE INDEX IF NOT EXISTS idx_finance_ledger_entries_company
    ON public.finance_ledger_entries (company_id);
END $$;

DO $$
DECLARE
  t text; nulls int; companies int;
  n_sales int; n_wt int; n_ledger int; srd numeric;
BEGIN
  SELECT count(*) INTO companies FROM public.companies;
  IF companies <> 1 THEN RAISE EXCEPTION 'T-20 FAILED: % companies, expected exactly 1 (NextX)', companies; END IF;

  FOREACH t IN ARRAY ARRAY['locations','sales','expenses','wallets','commissions','sale_items','wallet_transactions','finance_ledger_entries'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id IS NULL', t) INTO nulls;
    IF nulls <> 0 THEN RAISE EXCEPTION 'T-20 FAILED: % row(s) in % have no company_id', nulls, t; END IF;
  END LOOP;

  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 OR srd <> 42005.99 THEN
    RAISE EXCEPTION 'T-20 FAILED: baseline moved — sales=% wt=% ledger=% SRD=%', n_sales, n_wt, n_ledger, srd;
  END IF;

  RAISE NOTICE 'T-20 verified: 1 company, every financial row scoped, baseline unchanged.';
END $$;

COMMIT;
