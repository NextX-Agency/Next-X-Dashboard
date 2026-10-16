-- Finance foundation. Additive to the existing ledger, sales/payments and
-- expense records: no second order system and no stored wallet balances.

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cash',
  currency public.currency_code NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_name_currency_key ON public.wallets(name, currency);
CREATE INDEX IF NOT EXISTS wallets_active_idx ON public.wallets(active, currency);
CREATE INDEX IF NOT EXISTS wallets_location_idx ON public.wallets(location_id);

INSERT INTO public.wallets (name, kind, currency, location_id)
SELECT v.name, v.kind, v.currency::public.currency_code,
       (SELECT id FROM public.locations WHERE slug = 'main' LIMIT 1)
FROM (VALUES
  ('Cash', 'cash', 'USD'), ('Bank', 'bank_transfer', 'USD'),
  ('Card', 'card', 'USD'), ('Other', 'other', 'USD'),
  ('Cash', 'cash', 'SRD'), ('Bank', 'bank_transfer', 'SRD'),
  ('Card', 'card', 'SRD'), ('Other', 'other', 'SRD')
) AS v(name, kind, currency)
ON CONFLICT (name, currency) DO NOTHING;

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storefront_id uuid REFERENCES public.storefronts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS ledger_entries_wallet_idx ON public.ledger_entries(wallet_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_attribution_idx ON public.ledger_entries(location_id, storefront_id);
CREATE INDEX IF NOT EXISTS ledger_entries_correlation_idx ON public.ledger_entries(correlation_id);
CREATE INDEX IF NOT EXISTS ledger_entries_event_type_idx ON public.ledger_entries(event_type, occurred_at DESC);
DO $$ BEGIN
  ALTER TABLE public.ledger_entries
    ADD CONSTRAINT ledger_entries_event_type_nonempty CHECK (length(trim(event_type)) > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storefront_id uuid REFERENCES public.storefronts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;
CREATE INDEX IF NOT EXISTS expenses_wallet_idx ON public.expenses(wallet_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS expenses_location_idx ON public.expenses(location_id, occurred_at DESC);

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL;
ALTER TABLE public.sale_refunds
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_order_payments
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_order_refunds
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sale_payments_wallet_idx ON public.sale_payments(wallet_id, received_at DESC);
CREATE INDEX IF NOT EXISTS sale_refunds_wallet_idx ON public.sale_refunds(wallet_id, refunded_at DESC);
CREATE INDEX IF NOT EXISTS po_payments_wallet_idx ON public.purchase_order_payments(wallet_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS po_refunds_wallet_idx ON public.purchase_order_refunds(wallet_id, refunded_at DESC);

-- Backfill the wallet dimension for historical payments and ledger postings.
-- The method remains separate from the destination wallet; these are only
-- defaults for legacy rows that predate explicit wallet selection.
UPDATE public.sale_payments p
SET wallet_id = w.id
FROM public.wallets w
WHERE p.wallet_id IS NULL AND w.currency = p.currency AND w.kind = p.method::text;
UPDATE public.purchase_order_payments p
SET wallet_id = w.id
FROM public.wallets w
WHERE p.wallet_id IS NULL AND w.currency = p.currency AND w.kind = p.method::text;
UPDATE public.sale_refunds p
SET wallet_id = w.id
FROM public.wallets w
WHERE p.wallet_id IS NULL AND w.currency = p.currency AND w.kind = p.method::text;
UPDATE public.purchase_order_refunds p
SET wallet_id = w.id
FROM public.wallets w
WHERE p.wallet_id IS NULL AND w.currency = p.currency AND w.kind = p.method::text;
UPDATE public.expenses e
SET wallet_id = w.id
FROM public.wallets w
WHERE e.wallet_id IS NULL AND w.currency = e.currency AND w.kind = e.payment_method::text;
UPDATE public.ledger_entries AS l
SET wallet_id = COALESCE(
  (SELECT sp.wallet_id FROM public.sale_payments sp WHERE l.source_kind = 'sale' AND sp.id = l.source_id),
  (SELECT pp.wallet_id FROM public.purchase_order_payments pp WHERE l.source_kind = 'purchase_order' AND pp.id = l.source_id),
  (SELECT sr.wallet_id FROM public.sale_refunds sr WHERE l.source_kind = 'sale' AND sr.id = l.source_id),
  (SELECT pr.wallet_id FROM public.purchase_order_refunds pr WHERE l.source_kind = 'purchase_order' AND pr.id = l.source_id),
  (SELECT e.wallet_id FROM public.expenses e WHERE l.source_kind = 'expense' AND e.id = l.source_id),
  (SELECT w.id FROM public.wallets w WHERE w.currency = l.currency AND w.kind = l.payment_method::text)
)
WHERE l.wallet_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.wallets w
    WHERE w.currency = l.currency AND w.kind = l.payment_method::text
  );

CREATE TABLE IF NOT EXISTS public.wallet_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  destination_wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency public.currency_code NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text,
  note text,
  created_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transfers_different_wallets CHECK (source_wallet_id <> destination_wallet_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transfers_idempotency_key ON public.wallet_transfers(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_transfers_occurred_idx ON public.wallet_transfers(occurred_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transfers_correlation_idx ON public.wallet_transfers(correlation_id);

CREATE TABLE IF NOT EXISTS public.reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  period_end timestamptz NOT NULL,
  statement_balance_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  notes text,
  completed_at timestamptz,
  completed_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconciliations_wallet_period_idx ON public.reconciliations(wallet_id, period_end DESC);
CREATE INDEX IF NOT EXISTS reconciliations_status_idx ON public.reconciliations(status, period_end DESC);

-- Security-invoker read model: balances remain a sum over immutable postings.
CREATE OR REPLACE VIEW public.v_wallet_balances
WITH (security_invoker = true) AS
SELECT w.id AS wallet_id, w.name, w.kind, w.currency, w.location_id, w.active,
       COALESCE(SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END), 0)::bigint AS balance_cents,
       COUNT(l.id)::bigint AS entry_count
  FROM public.wallets w
  LEFT JOIN public.ledger_entries l ON l.wallet_id = w.id
 GROUP BY w.id, w.name, w.kind, w.currency, w.location_id, w.active;
GRANT SELECT ON public.v_wallet_balances TO authenticated;

-- Extend the existing read model without changing its legacy columns. The
-- appended fields make the transaction screen able to show wallet and
-- storefront attribution while old reports keep their established shape.
CREATE OR REPLACE VIEW public.v_cash_ledger
WITH (security_invoker = true) AS
SELECT
  e.id, e.seq, e.occurred_at, e.created_at, e.direction, e.category, e.description,
  e.member_id, e.source_kind, e.source_id, e.payment_method, e.amount_usd_cents,
  CASE WHEN e.direction = 'in' THEN e.amount_usd_cents ELSE -e.amount_usd_cents END
    AS net_usd_cents,
  SUM(CASE WHEN e.direction = 'in' THEN e.amount_usd_cents ELSE -e.amount_usd_cents END)
    OVER (ORDER BY e.occurred_at, e.seq, e.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    AS balance_usd_cents,
  e.wallet_id, e.location_id, e.storefront_id, e.correlation_id, e.event_type
FROM public.ledger_entries e;
GRANT SELECT ON public.v_cash_ledger TO authenticated;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallets_select ON public.wallets;
DROP POLICY IF EXISTS wallets_insert ON public.wallets;
DROP POLICY IF EXISTS wallets_update ON public.wallets;
CREATE POLICY wallets_select ON public.wallets FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY wallets_insert ON public.wallets FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY wallets_update ON public.wallets FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

ALTER TABLE public.wallet_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transfers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_transfers_select ON public.wallet_transfers;
DROP POLICY IF EXISTS wallet_transfers_insert ON public.wallet_transfers;
CREATE POLICY wallet_transfers_select ON public.wallet_transfers FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY wallet_transfers_insert ON public.wallet_transfers FOR INSERT TO authenticated WITH CHECK (private.can_write());

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reconciliations_select ON public.reconciliations;
DROP POLICY IF EXISTS reconciliations_insert ON public.reconciliations;
DROP POLICY IF EXISTS reconciliations_update ON public.reconciliations;
CREATE POLICY reconciliations_select ON public.reconciliations FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY reconciliations_insert ON public.reconciliations FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY reconciliations_update ON public.reconciliations FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());
