-- Add open receivables/payables without changing existing financial records.
-- This table tracks manual debtor/creditor items such as loans, unpaid invoices,
-- future payouts, and other outstanding obligations.

CREATE TABLE IF NOT EXISTS finance_obligations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(20) NOT NULL,
  counterparty_name TEXT NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'SRD',
  original_amount NUMERIC(10, 2) NOT NULL,
  paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  due_date DATE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  source_type VARCHAR(50),
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finance_obligations_type_check
    CHECK (type IN ('receivable', 'payable')),
  CONSTRAINT finance_obligations_currency_check
    CHECK (currency IN ('SRD', 'USD')),
  CONSTRAINT finance_obligations_status_check
    CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  CONSTRAINT finance_obligations_amount_check
    CHECK (original_amount >= 0 AND paid_amount >= 0 AND paid_amount <= original_amount)
);

CREATE INDEX IF NOT EXISTS idx_finance_obligations_type_status
  ON finance_obligations(type, status);

CREATE INDEX IF NOT EXISTS idx_finance_obligations_location
  ON finance_obligations(location_id);

CREATE INDEX IF NOT EXISTS idx_finance_obligations_due_date
  ON finance_obligations(due_date);

CREATE INDEX IF NOT EXISTS idx_finance_obligations_created_at
  ON finance_obligations(created_at DESC);

ALTER TABLE public.finance_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users" ON public.finance_obligations
  FOR ALL USING (auth.role() = 'authenticated');
