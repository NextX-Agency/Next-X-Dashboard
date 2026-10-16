CREATE TYPE recurring_expense_cadence AS ENUM ('monthly', 'weekly', 'quarterly', 'yearly');--> statement-breakpoint

CREATE TABLE recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  vendor_name text NOT NULL CHECK (length(trim(vendor_name)) > 0),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency currency_code NOT NULL DEFAULT 'USD',
  cadence recurring_expense_cadence NOT NULL DEFAULT 'monthly',
  anchor_day integer NOT NULL DEFAULT 1 CHECK (anchor_day BETWEEN 1 AND 31),
  wallet_id uuid REFERENCES wallets(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  next_run_on date NOT NULL,
  last_posted_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  is_active boolean NOT NULL DEFAULT true,
  auto_post boolean NOT NULL DEFAULT true,
  amount_is_estimated boolean NOT NULL DEFAULT false,
  anchor_day_is_estimated boolean NOT NULL DEFAULT false,
  created_by_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX recurring_expenses_due_idx ON recurring_expenses(is_active, auto_post, next_run_on);--> statement-breakpoint
CREATE INDEX recurring_expenses_wallet_idx ON recurring_expenses(wallet_id);--> statement-breakpoint
CREATE INDEX recurring_expenses_category_idx ON recurring_expenses(category_id);--> statement-breakpoint

ALTER TABLE expenses
  ADD COLUMN recurring_expense_id uuid REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  ADD COLUMN period_key text;--> statement-breakpoint

CREATE UNIQUE INDEX expenses_recurring_period_unique
  ON expenses(recurring_expense_id, period_key)
  WHERE recurring_expense_id IS NOT NULL AND period_key IS NOT NULL;--> statement-breakpoint

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE recurring_expenses FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON recurring_expenses TO authenticated;--> statement-breakpoint
CREATE POLICY recurring_expenses_select ON recurring_expenses
  FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY recurring_expenses_insert ON recurring_expenses
  FOR INSERT TO authenticated WITH CHECK (private.can_write());--> statement-breakpoint
CREATE POLICY recurring_expenses_update ON recurring_expenses
  FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());--> statement-breakpoint
