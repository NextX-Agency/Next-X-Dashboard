-- Finance traceability and vendor access are intentionally additive.
-- Existing business records are never updated or deleted by this migration.

BEGIN;

-- Opaque, server-managed sessions replace user-controlled JSON cookies.
CREATE TABLE IF NOT EXISTS public.app_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent_hash TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_active
  ON public.app_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- A seller can be linked to their own dashboard account without disturbing
-- existing sellers or historical sale-to-seller references.
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_user_id_unique
  ON public.sellers (user_id)
  WHERE user_id IS NOT NULL;

-- Access is granted per location. This is the enforcement boundary used by
-- the seller portal and all seller-facing API routes.
CREATE TABLE IF NOT EXISTS public.user_location_access (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  can_manage_wallet BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_location_access_location
  ON public.user_location_access (location_id, user_id);

-- Explicit wallet reconciliations distinguish a seller physically checking a
-- wallet from normal sales/expense activity that happens to change its balance.
CREATE TABLE IF NOT EXISTS public.wallet_reconciliations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  confirmed_balance NUMERIC(10, 2) NOT NULL,
  note TEXT,
  reconciled_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_reconciliations_balance_check CHECK (confirmed_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wallet_reconciliations_wallet_recent
  ON public.wallet_reconciliations (wallet_id, reconciled_at DESC);

-- Notifications are durable so a reminder cannot silently disappear between
-- browser sessions. An unresolved reminder is unique per wallet and user.
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT user_notifications_type_check
    CHECK (notification_type IN ('wallet_reconciliation_due'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_open_wallet_reconciliation
  ON public.user_notifications (user_id, wallet_id, notification_type)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON public.user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- The ledger is append-only. It is separate from the current wallet
-- transaction table so legacy records remain intact while finance reporting
-- has one stable, auditable shape for every money movement.
CREATE TABLE IF NOT EXISTS public.finance_ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_transaction_id UUID UNIQUE REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  source_type TEXT,
  source_id UUID,
  counterparty TEXT,
  description TEXT,
  correlation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT finance_ledger_entries_event_type_check
    CHECK (event_type IN (
      'opening_balance', 'sale', 'expense', 'wallet_adjustment',
      'wallet_transfer', 'wallet_reconciliation', 'commission', 'other'
    )),
  CONSTRAINT finance_ledger_entries_direction_check
    CHECK (direction IN ('in', 'out')),
  CONSTRAINT finance_ledger_entries_amount_check
    CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_entries_occurred
  ON public.finance_ledger_entries (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_entries_wallet_occurred
  ON public.finance_ledger_entries (wallet_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_entries_location_occurred
  ON public.finance_ledger_entries (location_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_entries_source
  ON public.finance_ledger_entries (source_type, source_id);

-- Backfill only the trace pointers present in wallet_transactions. This is
-- idempotent and leaves all legacy rows unchanged.
INSERT INTO public.finance_ledger_entries (
  wallet_transaction_id,
  wallet_id,
  location_id,
  event_type,
  direction,
  amount,
  currency,
  source_type,
  source_id,
  description,
  occurred_at,
  metadata
)
SELECT
  transaction.id,
  transaction.wallet_id,
  wallet.location_id,
  CASE
    WHEN transaction.reference_type = 'sale' OR transaction.sale_id IS NOT NULL THEN 'sale'
    WHEN transaction.reference_type = 'expense' OR transaction.expense_id IS NOT NULL THEN 'expense'
    WHEN transaction.reference_type = 'transfer' THEN 'wallet_transfer'
    WHEN transaction.reference_type = 'opening_balance' THEN 'opening_balance'
    ELSE 'wallet_adjustment'
  END,
  CASE
    WHEN transaction.balance_after >= transaction.balance_before THEN 'in'
    ELSE 'out'
  END,
  transaction.amount,
  COALESCE(transaction.currency, wallet.currency),
  COALESCE(transaction.reference_type, 'wallet_transaction'),
  COALESCE(transaction.reference_id, transaction.sale_id, transaction.expense_id),
  transaction.description,
  COALESCE(transaction.created_at, NOW()),
  jsonb_build_object(
    'backfilled', TRUE,
    'legacy_transaction_type', transaction.type
  )
FROM public.wallet_transactions AS transaction
LEFT JOIN public.wallets AS wallet ON wallet.id = transaction.wallet_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.finance_ledger_entries AS entry
  WHERE entry.wallet_transaction_id = transaction.id
);

-- Financial journal entries must not be edited or deleted after recording.
CREATE OR REPLACE FUNCTION public.prevent_finance_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.finance_ledger_maintenance', TRUE) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'finance_ledger_entries is append-only; record a corrective entry instead';
END;
$$;

DROP TRIGGER IF EXISTS finance_ledger_entries_immutable ON public.finance_ledger_entries;
CREATE TRIGGER finance_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON public.finance_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_finance_ledger_mutation();

-- Legacy pages still create wallet_transactions directly. This trigger makes
-- those money movements visible too, while server routes set a transaction
-- flag and write their richer actor/context entry themselves.
CREATE OR REPLACE FUNCTION public.capture_wallet_transaction_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet_location_id UUID;
  wallet_currency VARCHAR(10);
BEGIN
  IF current_setting('app.finance_ledger_recorded', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT location_id, currency
  INTO wallet_location_id, wallet_currency
  FROM public.wallets
  WHERE id = NEW.wallet_id;

  INSERT INTO public.finance_ledger_entries (
    wallet_transaction_id,
    wallet_id,
    location_id,
    event_type,
    direction,
    amount,
    currency,
    source_type,
    source_id,
    description,
    occurred_at,
    metadata
  ) VALUES (
    NEW.id,
    NEW.wallet_id,
    wallet_location_id,
    CASE
      WHEN NEW.reference_type = 'sale' OR NEW.sale_id IS NOT NULL THEN 'sale'
      WHEN NEW.reference_type = 'expense' OR NEW.expense_id IS NOT NULL THEN 'expense'
      WHEN NEW.reference_type = 'transfer' THEN 'wallet_transfer'
      WHEN NEW.reference_type = 'opening_balance' THEN 'opening_balance'
      ELSE 'wallet_adjustment'
    END,
    CASE WHEN NEW.balance_after >= NEW.balance_before THEN 'in' ELSE 'out' END,
    NEW.amount,
    COALESCE(NEW.currency, wallet_currency, 'SRD'),
    COALESCE(NEW.reference_type, 'wallet_transaction'),
    COALESCE(NEW.reference_id, NEW.sale_id, NEW.expense_id),
    NEW.description,
    COALESCE(NEW.created_at, NOW()),
    jsonb_build_object('captured_by', 'wallet_transactions_trigger', 'legacy_transaction_type', NEW.type)
  ) ON CONFLICT (wallet_transaction_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_wallet_transaction_ledger() FROM PUBLIC;

DROP TRIGGER IF EXISTS wallet_transactions_capture_ledger ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_capture_ledger
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_wallet_transaction_ledger();

-- New sensitive tables are server-only. Prisma uses the database connection;
-- the public Supabase Data API has no policy granting browser access.
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_ledger_entries ENABLE ROW LEVEL SECURITY;

COMMIT;
