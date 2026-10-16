-- Commerce core. This migration is additive: existing sales, inventory
-- movements, invoices, quotes and payments remain valid and keep their
-- established table names. New orders use those same sales rows as the
-- canonical commercial transaction.

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('confirmed', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_source AS ENUM ('manual', 'pos', 'web', 'whatsapp', 'messenger');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('draft', 'confirmed', 'ready', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fulfillment_type AS ENUM ('pickup', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fulfillment_status AS ENUM ('pending', 'ready', 'fulfilled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reservation_status AS ENUM ('active', 'released', 'consumed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS locations_slug_key ON public.locations(slug);
CREATE INDEX IF NOT EXISTS locations_active_idx ON public.locations(active);

INSERT INTO public.locations (name, slug)
VALUES ('Main location', 'main')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS workflow_status public.order_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source public.order_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS product_name_snapshot text,
  ADD COLUMN IF NOT EXISTS variant_name_snapshot text,
  ADD COLUMN IF NOT EXISTS sku_snapshot text;

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS status public.payment_status NOT NULL DEFAULT 'confirmed';

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

-- Existing confirmed sales already consumed physical stock and are therefore
-- completed orders in the new workflow. Existing void rows are cancelled.
UPDATE public.sales
SET workflow_status = CASE
  WHEN status = 'confirmed' THEN 'completed'::public.order_status
  WHEN status = 'void' THEN 'cancelled'::public.order_status
  ELSE 'draft'::public.order_status
END
WHERE workflow_status = 'draft'::public.order_status;

UPDATE public.sales
SET location_id = (SELECT id FROM public.locations WHERE slug = 'main' LIMIT 1)
WHERE location_id IS NULL;

UPDATE public.inventory_movements
SET location_id = (SELECT id FROM public.locations WHERE slug = 'main' LIMIT 1)
WHERE location_id IS NULL;

UPDATE public.sale_items si
SET product_name_snapshot = p.name,
    variant_name_snapshot = v.name,
    sku_snapshot = v.sku
FROM public.product_variants v
JOIN public.products p ON p.id = v.product_id
WHERE si.variant_id = v.id
  AND (si.product_name_snapshot IS NULL OR si.variant_name_snapshot IS NULL OR si.sku_snapshot IS NULL);

INSERT INTO public.document_sequences (prefix, last_value, padding)
VALUES ('ORD-', 0, 3)
ON CONFLICT (prefix) DO NOTHING;

CREATE INDEX IF NOT EXISTS sales_workflow_status_idx
  ON public.sales(workflow_status, sold_at DESC);
CREATE INDEX IF NOT EXISTS sales_source_idx
  ON public.sales(source, sold_at DESC);
CREATE INDEX IF NOT EXISTS sales_location_idx
  ON public.sales(location_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_location_idx
  ON public.inventory_movements(location_id, variant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  type public.fulfillment_type NOT NULL DEFAULT 'pickup',
  status public.fulfillment_status NOT NULL DEFAULT 'pending',
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  requested_at timestamptz,
  scheduled_for timestamptz,
  delivery_address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_fulfillments_order_key
  ON public.order_fulfillments(order_id);
CREATE INDEX IF NOT EXISTS order_fulfillments_location_idx
  ON public.order_fulfillments(location_id, status);

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  status public.reservation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  released_at timestamptz,
  consumed_at timestamptz,
  created_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_reservations_order_idx
  ON public.inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS inventory_reservations_item_idx
  ON public.inventory_reservations(order_item_id);
CREATE INDEX IF NOT EXISTS inventory_reservations_variant_location_idx
  ON public.inventory_reservations(variant_id, location_id, status);
CREATE INDEX IF NOT EXISTS inventory_reservations_expiry_idx
  ON public.inventory_reservations(status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_active_item_key
  ON public.inventory_reservations(order_item_id)
  WHERE status = 'active';

DO $$ BEGIN
  ALTER TABLE public.sale_items
    ADD CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sale_payments
    ADD CONSTRAINT sale_payments_amount_positive CHECK (amount_cents > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS protects the public Supabase surface. Server actions still authorize
-- independently because the Drizzle connection uses the postgres role.
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locations_select ON public.locations;
DROP POLICY IF EXISTS locations_insert ON public.locations;
DROP POLICY IF EXISTS locations_update ON public.locations;
CREATE POLICY locations_select ON public.locations FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY locations_insert ON public.locations FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY locations_update ON public.locations FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_fulfillments_select ON public.order_fulfillments;
DROP POLICY IF EXISTS order_fulfillments_insert ON public.order_fulfillments;
DROP POLICY IF EXISTS order_fulfillments_update ON public.order_fulfillments;
CREATE POLICY order_fulfillments_select ON public.order_fulfillments FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY order_fulfillments_insert ON public.order_fulfillments FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY order_fulfillments_update ON public.order_fulfillments FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_reservations_select ON public.inventory_reservations;
DROP POLICY IF EXISTS inventory_reservations_insert ON public.inventory_reservations;
DROP POLICY IF EXISTS inventory_reservations_update ON public.inventory_reservations;
CREATE POLICY inventory_reservations_select ON public.inventory_reservations FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY inventory_reservations_insert ON public.inventory_reservations FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY inventory_reservations_update ON public.inventory_reservations FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());
