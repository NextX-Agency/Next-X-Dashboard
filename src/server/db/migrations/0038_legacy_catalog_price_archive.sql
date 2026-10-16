CREATE TABLE legacy_catalog_price_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity text NOT NULL CHECK (source_entity = 'items'),
  legacy_id text NOT NULL,
  currency public.currency_code NOT NULL,
  source_amount text NOT NULL CHECK (source_amount ~ '^-?[0-9]+([.][0-9]+)?$'),
  rounded_source_cents bigint NOT NULL,
  rounding_rule text NOT NULL CHECK (rounding_rule = 'ROUND_HALF_AWAY_FROM_ZERO_TO_MINOR_UNIT'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_catalog_price_archive_source_key UNIQUE (source_entity, legacy_id, currency)
);

ALTER TABLE legacy_catalog_price_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_catalog_price_archive FORCE ROW LEVEL SECURITY;
REVOKE ALL ON legacy_catalog_price_archive FROM PUBLIC, anon, authenticated;
