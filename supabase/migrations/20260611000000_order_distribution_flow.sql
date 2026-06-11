-- Order distribution flow
-- This keeps existing order data, stops orders from depending on wallet balance,
-- and records where each ordered line is expected to land.
-- Safety note for manual Supabase runs:
-- The DROP statements below only replace metadata (FK constraint, RLS policy, trigger).
-- This migration does not DROP tables, TRUNCATE data, or DELETE existing order rows.

BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.purchase_orders'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.purchase_orders'::regclass
           AND attname = 'wallet_id')
      ]
  LOOP
    EXECUTE format('ALTER TABLE public.purchase_orders DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.purchase_orders
  ALTER COLUMN wallet_id DROP NOT NULL;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_wallet_id_fkey
  FOREIGN KEY (wallet_id)
  REFERENCES public.wallets(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.purchase_order_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_order_allocations_quantity_check CHECK (quantity > 0),
  CONSTRAINT purchase_order_allocations_received_check CHECK (quantity_received >= 0 AND quantity_received <= quantity),
  CONSTRAINT purchase_order_allocations_unique_location UNIQUE (order_item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_allocations_order_item
  ON public.purchase_order_allocations(order_item_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_allocations_location
  ON public.purchase_order_allocations(location_id);

ALTER TABLE public.purchase_order_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on purchase_order_allocations"
  ON public.purchase_order_allocations;

CREATE POLICY "Allow all operations on purchase_order_allocations"
  ON public.purchase_order_allocations
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_purchase_order_allocations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_purchase_order_allocations_updated_at
  ON public.purchase_order_allocations;

CREATE TRIGGER trigger_update_purchase_order_allocations_updated_at
  BEFORE UPDATE ON public.purchase_order_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_purchase_order_allocations_updated_at();

-- Backfill existing orders into a single allocation matching their current destination.
-- Existing received quantities are preserved so current stock reversals and reports remain truthful.
INSERT INTO public.purchase_order_allocations (
  order_item_id,
  location_id,
  quantity,
  quantity_received,
  created_at,
  updated_at
)
SELECT
  poi.id,
  po.location_id,
  poi.quantity,
  LEAST(poi.quantity_received, poi.quantity),
  poi.created_at,
  NOW()
FROM public.purchase_order_items poi
JOIN public.purchase_orders po ON po.id = poi.order_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.purchase_order_allocations allocation
  WHERE allocation.order_item_id = poi.id
);

COMMIT;
