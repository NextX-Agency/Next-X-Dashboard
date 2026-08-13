-- T-21 — Forward-only chart of accounts and balanced journal.
-- Opening positions are posted once at cutover; historical transactions are not replayed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  currency TEXT NOT NULL DEFAULT 'SRD' CHECK (currency IN ('SRD','USD')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code, currency)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  source_type TEXT,
  source_id UUID,
  correlation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','reversed')),
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK (currency IN ('SRD','USD')),
  debit NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  wallet_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((debit = 0) <> (credit = 0))
);

CREATE OR REPLACE FUNCTION public.enforce_balanced_journal_entry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE unbalanced int;
BEGIN
  SELECT count(*) INTO unbalanced
  FROM (
    SELECT currency, round(sum(debit - credit), 4) AS difference
    FROM public.journal_lines
    WHERE journal_entry_id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id)
    GROUP BY currency
  ) balances WHERE difference <> 0;
  IF unbalanced <> 0 THEN
    RAISE EXCEPTION 'Journal entry must balance by currency';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS journal_entry_must_balance ON public.journal_lines;
CREATE CONSTRAINT TRIGGER journal_entry_must_balance
AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_balanced_journal_entry();

-- Minimal accounts required for the opening cutover and cash subledger bridge.
INSERT INTO public.accounts (company_id, code, name, account_type, currency)
SELECT c.id, values.code, values.name, values.account_type, values.currency
FROM public.companies c
CROSS JOIN (VALUES
  ('1000','Cash and bank','asset','SRD'),
  ('1001','Cash and bank','asset','USD'),
  ('3000','Opening equity','equity','SRD'),
  ('3001','Opening equity','equity','USD')
) AS values(code, name, account_type, currency)
WHERE c.is_active
ON CONFLICT (company_id, code, currency) DO NOTHING;

-- The opening balance is the reconciled cutover position, not a replay of history.
WITH positions AS (
  SELECT company_id, currency, round(sum(balance), 4) amount
  FROM public.wallets GROUP BY company_id, currency HAVING round(sum(balance), 4) <> 0
), companies_with_positions AS (
  SELECT DISTINCT company_id FROM positions
), entries AS (
  INSERT INTO public.journal_entries (company_id, entry_date, description, source_type, status, posted_at)
  SELECT p.company_id, CURRENT_DATE, 'T-21 opening cash position', 'opening_balance', 'posted', NOW()
  FROM companies_with_positions p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.journal_entries existing
    WHERE existing.company_id = p.company_id AND existing.source_type = 'opening_balance'
      AND existing.description = 'T-21 opening cash position'
  )
  RETURNING id, company_id
)
INSERT INTO public.journal_lines (journal_entry_id, account_id, currency, debit, credit)
SELECT e.id, cash.id, p.currency, p.amount, 0
FROM entries e JOIN positions p ON p.company_id = e.company_id
JOIN public.accounts cash ON cash.company_id = p.company_id AND cash.code = CASE WHEN p.currency = 'SRD' THEN '1000' ELSE '1001' END AND cash.currency = p.currency
UNION ALL
SELECT e.id, equity.id, p.currency, 0, p.amount
FROM entries e JOIN positions p ON p.company_id = e.company_id
JOIN public.accounts equity ON equity.company_id = p.company_id AND equity.code = CASE WHEN p.currency = 'SRD' THEN '3000' ELSE '3001' END AND equity.currency = p.currency;

DO $$
DECLARE unbalanced int; n_sales int; n_wt int; n_ledger int;
BEGIN
  SELECT count(*) INTO unbalanced FROM (
    SELECT journal_entry_id, currency, round(sum(debit-credit),4) diff FROM public.journal_lines GROUP BY journal_entry_id,currency
  ) x WHERE diff <> 0;
  IF unbalanced <> 0 THEN RAISE EXCEPTION 'T-21 FAILED: % unbalanced journal groups', unbalanced; END IF;
  SELECT count(*) INTO n_sales FROM public.sales; SELECT count(*) INTO n_wt FROM public.wallet_transactions; SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 THEN RAISE EXCEPTION 'T-21 FAILED: financial baseline moved'; END IF;
END $$;

COMMIT;
