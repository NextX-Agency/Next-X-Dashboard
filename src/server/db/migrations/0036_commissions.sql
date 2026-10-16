CREATE TYPE commission_status AS ENUM ('open', 'paid', 'cancelled');--> statement-breakpoint

ALTER TABLE locations
  ADD COLUMN commission_rate_bps integer NOT NULL DEFAULT 0
    CHECK (commission_rate_bps BETWEEN 0 AND 10000);--> statement-breakpoint

CREATE TABLE sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  default_rate_bps integer NOT NULL DEFAULT 0 CHECK (default_rate_bps BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX sellers_location_active_idx ON sellers(location_id, active);--> statement-breakpoint

ALTER TABLE sales
  ADD COLUMN seller_id uuid REFERENCES sellers(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX sales_seller_idx ON sales(seller_id);--> statement-breakpoint

CREATE TABLE seller_category_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, category_id)
);--> statement-breakpoint
CREATE INDEX seller_category_rates_category_idx ON seller_category_rates(category_id);--> statement-breakpoint

CREATE TABLE commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_usd_cents bigint NOT NULL,
  currency currency_code NOT NULL,
  fx_rate_micros bigint NOT NULL CHECK (fx_rate_micros > 0),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX commission_payouts_expense_key ON commission_payouts(expense_id);--> statement-breakpoint
CREATE INDEX commission_payouts_seller_idx ON commission_payouts(seller_id, created_at DESC);--> statement-breakpoint

CREATE TABLE commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  group_key text NOT NULL,
  basis_cents bigint CHECK (basis_cents IS NULL OR basis_cents >= 0),
  basis_is_estimated boolean NOT NULL DEFAULT false,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_usd_cents bigint NOT NULL,
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  currency currency_code NOT NULL,
  fx_rate_micros bigint NOT NULL CHECK (fx_rate_micros > 0),
  status commission_status NOT NULL DEFAULT 'open',
  paid_at timestamptz,
  payout_id uuid REFERENCES commission_payouts(id) ON DELETE RESTRICT,
  created_by_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, group_key)
);--> statement-breakpoint
CREATE INDEX commissions_seller_status_idx ON commissions(seller_id, status, created_at);--> statement-breakpoint
CREATE INDEX commissions_category_idx ON commissions(category_id);--> statement-breakpoint
CREATE INDEX commissions_location_idx ON commissions(location_id);--> statement-breakpoint
CREATE INDEX commissions_payout_idx ON commissions(payout_id);--> statement-breakpoint

ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sellers FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sellers TO authenticated;--> statement-breakpoint
CREATE POLICY sellers_select ON sellers FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY sellers_insert ON sellers FOR INSERT TO authenticated WITH CHECK (private.is_owner());--> statement-breakpoint
CREATE POLICY sellers_update ON sellers FOR UPDATE TO authenticated USING (private.is_owner()) WITH CHECK (private.is_owner());--> statement-breakpoint
CREATE POLICY sellers_delete ON sellers FOR DELETE TO authenticated USING (private.is_owner());--> statement-breakpoint

ALTER TABLE seller_category_rates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE seller_category_rates FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON seller_category_rates TO authenticated;--> statement-breakpoint
CREATE POLICY seller_category_rates_select ON seller_category_rates FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY seller_category_rates_write ON seller_category_rates FOR ALL TO authenticated USING (private.is_owner()) WITH CHECK (private.is_owner());--> statement-breakpoint

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE commissions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON commissions TO authenticated;--> statement-breakpoint
CREATE POLICY commissions_select ON commissions FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY commissions_insert ON commissions FOR INSERT TO authenticated WITH CHECK (private.can_write());--> statement-breakpoint

ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE commission_payouts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON commission_payouts TO authenticated;--> statement-breakpoint
CREATE POLICY commission_payouts_select ON commission_payouts FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY commission_payouts_insert ON commission_payouts FOR INSERT TO authenticated WITH CHECK (private.is_owner());--> statement-breakpoint
