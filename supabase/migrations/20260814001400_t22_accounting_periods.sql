-- T-22 — Period close is a database-enforced accounting boundary.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  close_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_accounting_periods_company_status
  ON public.accounting_periods (company_id, status, period_start DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounting_periods_no_overlap'
  ) THEN
    ALTER TABLE public.accounting_periods
      ADD CONSTRAINT accounting_periods_no_overlap
      EXCLUDE USING gist (
        company_id WITH =,
        daterange(period_start, period_end, '[]') WITH &&
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reject_closed_journal_period()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE journal_company UUID;
DECLARE journal_date DATE;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    journal_company := NEW.company_id;
    journal_date := NEW.entry_date;
  ELSE
    SELECT company_id, entry_date INTO journal_company, journal_date
    FROM public.journal_entries WHERE id = NEW.journal_entry_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accounting_periods period
    WHERE period.company_id = journal_company
      AND period.status = 'closed'
      AND journal_date BETWEEN period.period_start AND period.period_end
  ) THEN
    RAISE EXCEPTION 'Cannot post a journal entry inside a closed accounting period'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reject_closed_period_journal_entry ON public.journal_entries;
CREATE TRIGGER reject_closed_period_journal_entry
BEFORE INSERT OR UPDATE OF company_id, entry_date ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.reject_closed_journal_period();

DROP TRIGGER IF EXISTS reject_closed_period_journal_line ON public.journal_lines;
CREATE TRIGGER reject_closed_period_journal_line
BEFORE INSERT OR UPDATE OF journal_entry_id ON public.journal_lines
FOR EACH ROW EXECUTE FUNCTION public.reject_closed_journal_period();

DO $$
DECLARE n_sales int; n_wt int; n_ledger int;
BEGIN
  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 THEN
    RAISE EXCEPTION 'T-22 FAILED: financial baseline moved';
  END IF;
END $$;

COMMIT;
