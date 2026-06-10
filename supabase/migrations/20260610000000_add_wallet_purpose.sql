-- Store wallet purpose directly on wallets so each location can have separate
-- operational, savings, and reserve balances for the same type/currency.

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'operational';

DO $$
DECLARE
  purpose_map JSONB;
BEGIN
  SELECT value::jsonb
  INTO purpose_map
  FROM store_settings
  WHERE key = 'wallet_purpose_map';

  IF purpose_map IS NOT NULL THEN
    UPDATE wallets
    SET purpose = purpose_map ->> wallets.id::text
    WHERE purpose_map ? wallets.id::text
      AND purpose_map ->> wallets.id::text IN ('operational', 'savings', 'reserve');
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipping wallet purpose map backfill: %', SQLERRM;
END $$;

UPDATE wallets
SET purpose = 'operational'
WHERE purpose IS NULL
  OR purpose NOT IN ('operational', 'savings', 'reserve');

ALTER TABLE wallets
  ALTER COLUMN purpose SET DEFAULT 'operational';

ALTER TABLE wallets
  ALTER COLUMN purpose SET NOT NULL;

ALTER TABLE wallets
  DROP CONSTRAINT IF EXISTS wallets_purpose_check;

ALTER TABLE wallets
  ADD CONSTRAINT wallets_purpose_check
  CHECK (purpose IN ('operational', 'savings', 'reserve'));

ALTER TABLE wallets
  DROP CONSTRAINT IF EXISTS wallets_person_name_type_currency_key;

ALTER TABLE wallets
  DROP CONSTRAINT IF EXISTS wallets_person_name_type_currency_purpose_key;

ALTER TABLE wallets
  ADD CONSTRAINT wallets_person_name_type_currency_purpose_key
  UNIQUE (person_name, type, currency, purpose);

CREATE INDEX IF NOT EXISTS idx_wallets_location_type_currency_purpose
  ON wallets(location_id, type, currency, purpose);
