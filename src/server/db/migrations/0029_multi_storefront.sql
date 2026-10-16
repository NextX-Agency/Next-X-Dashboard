-- Multi-storefront commerce foundation. This migration adds presentation and
-- pricing relationships around the existing products, variants, stock and
-- sales tables. It does not create a second catalog or inventory ledger.

DO $$ BEGIN
  CREATE TYPE public.storefront_status AS ENUM ('draft', 'active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency public.currency_code NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_lists_name_currency_key
  ON public.price_lists(name, currency);
CREATE INDEX IF NOT EXISTS price_lists_active_idx ON public.price_lists(active);

CREATE TABLE IF NOT EXISTS public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_list_items_price_list_variant_key
  ON public.price_list_items(price_list_id, variant_id);
CREATE INDEX IF NOT EXISTS price_list_items_variant_idx ON public.price_list_items(variant_id);

CREATE TABLE IF NOT EXISTS public.storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  domain text,
  status public.storefront_status NOT NULL DEFAULT 'draft',
  default_currency public.currency_code NOT NULL DEFAULT 'USD',
  default_locale text NOT NULL DEFAULT 'en-SR',
  default_price_list_id uuid REFERENCES public.price_lists(id) ON DELETE RESTRICT,
  allow_pickup boolean NOT NULL DEFAULT false,
  allow_delivery boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefronts_slug_key ON public.storefronts(slug);
CREATE UNIQUE INDEX IF NOT EXISTS storefronts_domain_key ON public.storefronts(domain);
CREATE INDEX IF NOT EXISTS storefronts_status_idx ON public.storefronts(status);

CREATE TABLE IF NOT EXISTS public.storefront_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_id uuid NOT NULL REFERENCES public.storefronts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  title_override text,
  description_override text,
  slug_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_products_storefront_product_key
  ON public.storefront_products(storefront_id, product_id);
CREATE INDEX IF NOT EXISTS storefront_products_visibility_idx
  ON public.storefront_products(storefront_id, visible, sort_order);
CREATE INDEX IF NOT EXISTS storefront_products_product_idx ON public.storefront_products(product_id);
CREATE INDEX IF NOT EXISTS storefront_products_slug_idx
  ON public.storefront_products(storefront_id, slug_override);

CREATE TABLE IF NOT EXISTS public.storefront_locations (
  storefront_id uuid NOT NULL REFERENCES public.storefronts(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (storefront_id, location_id)
);
CREATE INDEX IF NOT EXISTS storefront_locations_active_idx
  ON public.storefront_locations(storefront_id, active, priority);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS storefront_id uuid REFERENCES public.storefronts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_storefront_idx ON public.sales(storefront_id, sold_at DESC);

-- Preserve the current single public catalog as the first storefront. Existing
-- list prices are USD book prices, so the default price list stays USD and the
-- existing SRD display conversion remains a presentation concern.
INSERT INTO public.price_lists (name, currency)
VALUES ('Retail USD', 'USD'::public.currency_code)
ON CONFLICT (name, currency) DO NOTHING;

INSERT INTO public.storefronts (
  name, slug, status, default_currency, default_locale, default_price_list_id,
  allow_pickup, allow_delivery
)
SELECT
  COALESCE((SELECT business_name FROM public.settings LIMIT 1), 'Main storefront'),
  'main',
  'active'::public.storefront_status,
  'USD'::public.currency_code,
  'en-SR',
  pl.id,
  COALESCE((SELECT pickup_enabled FROM public.settings LIMIT 1), false),
  COALESCE((SELECT delivery_enabled FROM public.settings LIMIT 1), false)
FROM public.price_lists pl
WHERE pl.name = 'Retail USD' AND pl.currency = 'USD'::public.currency_code
ON CONFLICT (slug) DO NOTHING;

UPDATE public.storefronts
SET default_price_list_id = pl.id,
    updated_at = now()
FROM public.price_lists pl
WHERE storefronts.slug = 'main'
  AND storefronts.default_price_list_id IS NULL
  AND pl.name = 'Retail USD'
  AND pl.currency = 'USD'::public.currency_code;

INSERT INTO public.price_list_items (price_list_id, variant_id, amount_cents)
SELECT pl.id, v.id, v.list_price_cents
FROM public.price_lists pl
JOIN public.product_variants v ON v.list_price_cents > 0
WHERE pl.name = 'Retail USD' AND pl.currency = 'USD'::public.currency_code
ON CONFLICT (price_list_id, variant_id) DO NOTHING;

INSERT INTO public.storefront_products (storefront_id, product_id, visible, sort_order)
SELECT s.id, p.id, true, COALESCE(p.featured_position, 0)
FROM public.storefronts s
JOIN public.products p ON p.catalog_published
WHERE s.slug = 'main'
ON CONFLICT (storefront_id, product_id) DO NOTHING;

INSERT INTO public.storefront_locations (storefront_id, location_id, active, priority)
SELECT s.id, l.id, l.active, 0
FROM public.storefronts s
JOIN public.locations l ON l.active
WHERE s.slug = 'main'
ON CONFLICT (storefront_id, location_id) DO NOTHING;

DO $$ BEGIN
  ALTER TABLE public.price_list_items
    ADD CONSTRAINT price_list_items_amount_positive CHECK (amount_cents > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_lists_select ON public.price_lists;
DROP POLICY IF EXISTS price_lists_insert ON public.price_lists;
DROP POLICY IF EXISTS price_lists_update ON public.price_lists;
CREATE POLICY price_lists_select ON public.price_lists FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY price_lists_insert ON public.price_lists FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY price_lists_update ON public.price_lists FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_list_items_select ON public.price_list_items;
DROP POLICY IF EXISTS price_list_items_insert ON public.price_list_items;
DROP POLICY IF EXISTS price_list_items_update ON public.price_list_items;
DROP POLICY IF EXISTS price_list_items_delete ON public.price_list_items;
CREATE POLICY price_list_items_select ON public.price_list_items FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY price_list_items_insert ON public.price_list_items FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY price_list_items_update ON public.price_list_items FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());
CREATE POLICY price_list_items_delete ON public.price_list_items FOR DELETE TO authenticated USING (private.can_write());

ALTER TABLE public.storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefronts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storefronts_select ON public.storefronts;
DROP POLICY IF EXISTS storefronts_insert ON public.storefronts;
DROP POLICY IF EXISTS storefronts_update ON public.storefronts;
CREATE POLICY storefronts_select ON public.storefronts FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY storefronts_insert ON public.storefronts FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY storefronts_update ON public.storefronts FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

ALTER TABLE public.storefront_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storefront_products_select ON public.storefront_products;
DROP POLICY IF EXISTS storefront_products_insert ON public.storefront_products;
DROP POLICY IF EXISTS storefront_products_update ON public.storefront_products;
DROP POLICY IF EXISTS storefront_products_delete ON public.storefront_products;
CREATE POLICY storefront_products_select ON public.storefront_products FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY storefront_products_insert ON public.storefront_products FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY storefront_products_update ON public.storefront_products FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());
CREATE POLICY storefront_products_delete ON public.storefront_products FOR DELETE TO authenticated USING (private.can_write());

ALTER TABLE public.storefront_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storefront_locations_select ON public.storefront_locations;
DROP POLICY IF EXISTS storefront_locations_insert ON public.storefront_locations;
DROP POLICY IF EXISTS storefront_locations_update ON public.storefront_locations;
DROP POLICY IF EXISTS storefront_locations_delete ON public.storefront_locations;
CREATE POLICY storefront_locations_select ON public.storefront_locations FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY storefront_locations_insert ON public.storefront_locations FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY storefront_locations_update ON public.storefront_locations FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());
CREATE POLICY storefront_locations_delete ON public.storefront_locations FOR DELETE TO authenticated USING (private.can_write());
