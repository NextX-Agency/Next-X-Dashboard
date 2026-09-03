-- W-01 — Order-to-cash: give a customer order somewhere to live.
--
-- Before this migration the webshop persisted nothing. `sendWhatsAppOrder` built
-- a text message, opened wa.me and cleared the cart, so an order existed only in
-- a WhatsApp thread and had to be retyped into the sales desk by hand. There was
-- no customer order document, no stock hold behind a reservation, and no link
-- from a sale back to the customer who bought.
--
-- This migration is additive. It creates two new tables and adds two nullable /
-- defaulted columns. No existing row is updated or deleted, and no money path
-- changes behaviour.

BEGIN;

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot
-- ---------------------------------------------------------------------------
--
-- The Part 6 figures recorded in docs/IMPLEMENTATION_LOG.md are a snapshot from
-- 2026-08-13 and the business has traded since, so asserting them literally
-- fails on live data that is perfectly healthy. What actually matters for an
-- additive migration is stronger and self-validating: *this migration must not
-- change a single financial row*. Snapshot the counts and balances now, compare
-- them at the end, and abort if anything moved.

CREATE TEMP TABLE w01_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.sales)                  AS n_sales,
  (SELECT count(*) FROM public.sale_items)             AS n_sale_items,
  (SELECT count(*) FROM public.wallet_transactions)    AS n_wallet_transactions,
  (SELECT count(*) FROM public.finance_ledger_entries) AS n_ledger_entries,
  (SELECT count(*) FROM public.expenses)               AS n_expenses,
  (SELECT count(*) FROM public.commissions)            AS n_commissions,
  (SELECT COALESCE(sum(balance),0) FROM public.wallets WHERE currency = 'SRD') AS srd_balance,
  (SELECT COALESCE(sum(balance),0) FROM public.wallets WHERE currency = 'USD') AS usd_balance,
  (SELECT COALESCE(sum(quantity),0) FROM public.stock)  AS total_stock;

-- ---------------------------------------------------------------------------
-- Customer orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT NOT NULL UNIQUE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('webshop_audio','webshop_watches','counter')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','confirmed','reserved','fulfilled','invoiced','cancelled','expired')),
  currency TEXT NOT NULL CHECK (currency IN ('SRD','USD')),
  exchange_rate NUMERIC(18,8),
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_notes TEXT,

  pickup_date DATE,

  -- Set only when the order is converted into a posted sale. An order is a
  -- promise, not money: nothing here touches a wallet or the ledger.
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,

  -- The order held stock between `reserved` and `fulfilled`/`cancelled`. Kept
  -- so a release can never run twice.
  stock_reserved BOOLEAN NOT NULL DEFAULT FALSE,

  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancel_reason TEXT,

  -- Coarse abuse signal for the unauthenticated shop endpoint. Hashed, never
  -- the raw address.
  source_ip_hash TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT customer_orders_invoiced_has_sale
    CHECK ((status = 'invoiced') = (sale_id IS NOT NULL)),
  CONSTRAINT customer_orders_cancelled_has_reason
    CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
);

ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_customer_orders_status
  ON public.customer_orders (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_orders_channel
  ON public.customer_orders (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_orders_client
  ON public.customer_orders (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_orders_sale
  ON public.customer_orders (sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_orders_location
  ON public.customer_orders (location_id) WHERE location_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Customer order lines
-- ---------------------------------------------------------------------------
--
-- `unit_price` is the price the customer was quoted, snapshotted at order time.
-- It is never recomputed from `items` afterwards: a price change next week must
-- not silently rewrite what somebody was told last week.

CREATE TABLE IF NOT EXISTS public.customer_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,4) NOT NULL CHECK (unit_price >= 0),
  subtotal NUMERIC(18,4) NOT NULL CHECK (subtotal >= 0),
  combo_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_customer_order_items_order
  ON public.customer_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_customer_order_items_item
  ON public.customer_order_items (item_id);

-- ---------------------------------------------------------------------------
-- Stock actually held by a reservation
-- ---------------------------------------------------------------------------
--
-- `reservations` has held nothing until now: neither saleCreation nor stockUtils
-- had any concept of reserved quantity, so the webshop could offer the same
-- watch to two people. Available stock is `quantity - reserved_quantity`.
--
-- This column is maintained only inside serializable transactions using atomic
-- increments, never read-then-write.

ALTER TABLE public.stock
  ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_reserved_quantity_non_negative'
  ) THEN
    ALTER TABLE public.stock
      ADD CONSTRAINT stock_reserved_quantity_non_negative CHECK (reserved_quantity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_quantity_non_negative'
  ) THEN
    ALTER TABLE public.stock
      ADD CONSTRAINT stock_quantity_non_negative CHECK (quantity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_reserved_not_over_quantity'
  ) THEN
    ALTER TABLE public.stock
      ADD CONSTRAINT stock_reserved_not_over_quantity CHECK (reserved_quantity <= quantity);
  END IF;
END $$;

-- Backfill: reserved quantity is the sum of open reservations per item and
-- location. Production currently holds no open reservation, so this settles at
-- zero; it is written as a real backfill so it stays correct if that changes
-- before this migration is applied.
WITH open_reservations AS (
  SELECT item_id, location_id, SUM(quantity)::int AS held
  FROM public.reservations
  WHERE status NOT IN ('completed','cancelled')
  GROUP BY item_id, location_id
)
UPDATE public.stock s
SET reserved_quantity = LEAST(o.held, s.quantity)
FROM open_reservations o
WHERE s.item_id = o.item_id
  AND s.location_id = o.location_id
  AND s.reserved_quantity IS DISTINCT FROM LEAST(o.held, s.quantity);

-- ---------------------------------------------------------------------------
-- A sale finally knows who bought
-- ---------------------------------------------------------------------------
--
-- `sales` has never carried a customer, so there is no purchase history, no
-- receivable by customer and no repeat-purchase view. The column is added
-- nullable and is NOT backfilled: there is no stored reservation-to-sale link,
-- so any historical assignment would be a guess, and a guess must never become
-- indistinguishable from a fact.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_client
  ON public.sales (client_id) WHERE client_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Verification — runs inside the transaction, before COMMIT
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  b            w01_baseline%ROWTYPE;
  n_sales      int; n_sale_items int; n_wt int; n_ledger int;
  n_expenses   int; n_commissions int;
  srd          numeric; usd numeric; stock_total bigint;
  offenders    int;
BEGIN
  SELECT * INTO b FROM w01_baseline;

  SELECT count(*) INTO n_sales       FROM public.sales;
  SELECT count(*) INTO n_sale_items  FROM public.sale_items;
  SELECT count(*) INTO n_wt          FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger      FROM public.finance_ledger_entries;
  SELECT count(*) INTO n_expenses    FROM public.expenses;
  SELECT count(*) INTO n_commissions FROM public.commissions;
  SELECT COALESCE(sum(balance),0) INTO srd FROM public.wallets WHERE currency = 'SRD';
  SELECT COALESCE(sum(balance),0) INTO usd FROM public.wallets WHERE currency = 'USD';
  SELECT COALESCE(sum(quantity),0) INTO stock_total FROM public.stock;

  -- 1. This migration must have changed no financial row at all.
  IF n_sales       <> b.n_sales
     OR n_sale_items  <> b.n_sale_items
     OR n_wt          <> b.n_wallet_transactions
     OR n_ledger      <> b.n_ledger_entries
     OR n_expenses    <> b.n_expenses
     OR n_commissions <> b.n_commissions THEN
    RAISE EXCEPTION 'W-01 FAILED: a financial row count moved during an additive migration';
  END IF;

  IF srd <> b.srd_balance OR usd <> b.usd_balance THEN
    RAISE EXCEPTION 'W-01 FAILED: wallet balances moved during an additive migration (SRD % -> %, USD % -> %)',
      b.srd_balance, srd, b.usd_balance, usd;
  END IF;

  IF stock_total <> b.total_stock THEN
    RAISE EXCEPTION 'W-01 FAILED: on-hand stock moved during an additive migration (% -> %)',
      b.total_stock, stock_total;
  END IF;

  -- 2. Standing invariants that must hold before and after.
  IF n_wt <> n_ledger THEN
    RAISE EXCEPTION 'W-01 FAILED: wallet transactions (%) and ledger entries (%) diverged', n_wt, n_ledger;
  END IF;

  SELECT count(*) INTO offenders
  FROM public.stock
  WHERE quantity < 0 OR reserved_quantity < 0 OR reserved_quantity > quantity;
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'W-01 FAILED: % stock rows violate the quantity invariants', offenders;
  END IF;

  SELECT count(*) INTO offenders
  FROM public.sale_items si LEFT JOIN public.sales s ON s.id = si.sale_id
  WHERE s.id IS NULL;
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'W-01 FAILED: % orphaned sale items', offenders;
  END IF;

  -- 3. The new structures must start empty and unset.
  SELECT count(*) INTO offenders FROM public.customer_orders;
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'W-01 FAILED: customer_orders is not empty at creation';
  END IF;

  SELECT count(*) INTO offenders FROM public.customer_order_items;
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'W-01 FAILED: customer_order_items is not empty at creation';
  END IF;

  SELECT count(*) INTO offenders FROM public.sales WHERE client_id IS NOT NULL;
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'W-01 FAILED: sales.client_id was backfilled; it must stay unset';
  END IF;

  -- 4. Reserved stock must equal the open reservations behind it.
  SELECT count(*) INTO offenders
  FROM public.stock s
  LEFT JOIN (
    SELECT item_id, location_id, SUM(quantity)::int AS held
    FROM public.reservations
    WHERE status NOT IN ('completed','cancelled')
    GROUP BY item_id, location_id
  ) o ON o.item_id = s.item_id AND o.location_id = s.location_id
  WHERE s.reserved_quantity <> LEAST(COALESCE(o.held, 0), s.quantity);
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'W-01 FAILED: % stock rows disagree with their open reservations', offenders;
  END IF;

  RAISE NOTICE 'W-01 verification passed. Baseline held at % sales / % sale_items / % wallet_transactions / % ledger_entries / % expenses / SRD % / USD %',
    n_sales, n_sale_items, n_wt, n_ledger, n_expenses, srd, usd;
END $$;

COMMIT;
