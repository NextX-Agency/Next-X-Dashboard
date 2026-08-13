-- T-26 — Supplier-document inbox. OCR text is retained as audit evidence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bill_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  source_document_name TEXT NOT NULL,
  source_text TEXT NOT NULL,
  ocr_provider TEXT NOT NULL DEFAULT 'supplied_text',
  vendor_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  description TEXT,
  amount NUMERIC(18,4),
  currency TEXT CHECK (currency IN ('SRD','USD')),
  classification TEXT NOT NULL DEFAULT 'unclassified',
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','posted')),
  rejection_reason TEXT,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE RESTRICT,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'posted') = (expense_id IS NOT NULL)),
  CHECK ((status IN ('approved','posted')) = (approved_at IS NOT NULL)),
  CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))
);

ALTER TABLE public.bill_inbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bill_inbox_company_status ON public.bill_inbox (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_inbox_wallet ON public.bill_inbox (wallet_id) WHERE wallet_id IS NOT NULL;

DO $$
DECLARE n_sales int; n_wt int; n_ledger int;
BEGIN
  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 THEN
    RAISE EXCEPTION 'T-26 FAILED: financial baseline moved';
  END IF;
END $$;

COMMIT;
