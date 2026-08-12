-- Financial control fields are additive. Existing expense amounts, dates, and
-- descriptions are deliberately left intact; older records will appear in the
-- review queue until an administrator completes their documentation.
BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS expense_date DATE,
  ADD COLUMN IF NOT EXISTS vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_classification_check
  CHECK (classification IN (
    'operating',
    'inventory',
    'payroll',
    'marketing',
    'tax_fee',
    'owner_draw',
    'other',
    'unclassified'
  ));

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('posted', 'refunded'));

CREATE INDEX IF NOT EXISTS idx_expenses_financial_review
  ON public.expenses (status, classification, expense_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_vendor_name
  ON public.expenses (vendor_name)
  WHERE vendor_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_reviewed_by
  ON public.expenses (reviewed_by_user_id)
  WHERE reviewed_by_user_id IS NOT NULL;

-- Older wallet records already carry an unambiguous expense UUID in
-- reference_id. Populate only the missing pointer; no amount or history is
-- changed, and invalid references are ignored.
UPDATE public.wallet_transactions AS transaction
SET expense_id = expense.id
FROM public.expenses AS expense
WHERE transaction.expense_id IS NULL
  AND transaction.reference_id = expense.id
  AND transaction.reference_type IN ('expense', 'expense_correction', 'expense_refund');

COMMIT;
