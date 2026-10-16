ALTER TABLE settings ADD COLUMN store_description text;--> statement-breakpoint

ALTER TABLE storefronts
  ADD COLUMN description text,
  ADD COLUMN logo_url text,
  ADD COLUMN hero_title text,
  ADD COLUMN hero_subtitle text,
  ADD COLUMN hero_image_url text,
  ADD COLUMN hero_mobile_image_url text;--> statement-breakpoint

CREATE TABLE finance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CONSTRAINT finance_obligations_direction_check
    CHECK (direction IN ('receivable', 'payable')),
  counterparty_name text NOT NULL CONSTRAINT finance_obligations_counterparty_name_check
    CHECK (length(trim(counterparty_name)) > 0),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  currency currency_code NOT NULL,
  original_amount_cents bigint NOT NULL CONSTRAINT finance_obligations_original_amount_check
    CHECK (original_amount_cents > 0),
  paid_amount_cents bigint NOT NULL DEFAULT 0
    CONSTRAINT finance_obligations_paid_amount_check
    CHECK (paid_amount_cents >= 0 AND paid_amount_cents <= original_amount_cents),
  status text NOT NULL DEFAULT 'open'
    CONSTRAINT finance_obligations_status_check
    CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  due_date date,
  issued_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  source_type text,
  source_id text,
  created_by_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_obligations_status_amount_check CHECK (
    status = 'cancelled'
    OR (status = 'open' AND paid_amount_cents = 0)
    OR (status = 'partial' AND paid_amount_cents > 0 AND paid_amount_cents < original_amount_cents)
    OR (status = 'paid' AND paid_amount_cents = original_amount_cents)
  )
);--> statement-breakpoint

CREATE INDEX finance_obligations_direction_status_idx ON finance_obligations(direction, status);--> statement-breakpoint
CREATE INDEX finance_obligations_location_idx ON finance_obligations(location_id);--> statement-breakpoint
CREATE INDEX finance_obligations_due_idx ON finance_obligations(due_date);--> statement-breakpoint
CREATE INDEX finance_obligations_issued_idx ON finance_obligations(issued_at DESC);--> statement-breakpoint

ALTER TABLE finance_obligations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE finance_obligations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON finance_obligations TO authenticated;--> statement-breakpoint
CREATE POLICY finance_obligations_select ON finance_obligations FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint

CREATE TABLE legacy_store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  source_updated_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

ALTER TABLE legacy_store_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE legacy_store_settings FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON legacy_store_settings FROM PUBLIC, anon, authenticated;

--> statement-breakpoint
CREATE TABLE finance_obligation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES finance_obligations(id) ON DELETE RESTRICT,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency currency_code NOT NULL,
  payment_method payment_method NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL CONSTRAINT finance_obligation_payments_idempotency_key UNIQUE,
  notes text,
  created_by_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX finance_obligation_payments_obligation_idx ON finance_obligation_payments(obligation_id, occurred_at DESC);--> statement-breakpoint
CREATE INDEX finance_obligation_payments_wallet_idx ON finance_obligation_payments(wallet_id, occurred_at DESC);--> statement-breakpoint
CREATE INDEX finance_obligation_payments_correlation_idx ON finance_obligation_payments(correlation_id);--> statement-breakpoint

ALTER TABLE finance_obligation_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE finance_obligation_payments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON finance_obligation_payments TO authenticated;--> statement-breakpoint
CREATE POLICY finance_obligation_payments_select ON finance_obligation_payments FOR SELECT TO authenticated USING (private.is_member());
