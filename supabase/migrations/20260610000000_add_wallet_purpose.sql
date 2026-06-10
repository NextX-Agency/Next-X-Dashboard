-- Store wallet purpose directly on wallets so each location can have separate
-- operational, savings, and reserve balances for the same type/currency.

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS purpose TEXT;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallets_purpose_check'
      AND conrelid = 'wallets'::regclass
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_purpose_check
      CHECK (purpose IN ('operational', 'savings', 'reserve'));
  END IF;
END $$;

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT location_id, type, currency, purpose
    FROM wallets
    GROUP BY location_id, type, currency, purpose
    HAVING COUNT(*) > 1
  ) duplicate_wallets;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot switch wallet uniqueness safely: duplicate location/type/currency/purpose wallets exist.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallets_location_type_currency_purpose_key'
      AND conrelid = 'wallets'::regclass
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_location_type_currency_purpose_key
      UNIQUE (location_id, type, currency, purpose);
  END IF;
END $$;

-- Data-safe schema cleanup: these remove only obsolete uniqueness rules that
-- blocked multiple purposes for the same location/type/currency. No wallet
-- rows, balances, transactions, sales, expenses, or orders are deleted.
ALTER TABLE wallets
  DROP CONSTRAINT IF EXISTS wallets_person_name_type_currency_key;

DROP INDEX IF EXISTS wallets_person_name_type_currency_key;

ALTER TABLE wallets
  DROP CONSTRAINT IF EXISTS wallets_person_name_type_currency_purpose_key;

DROP INDEX IF EXISTS wallets_person_name_type_currency_purpose_key;

CREATE INDEX IF NOT EXISTS idx_wallets_location_type_currency_purpose
  ON wallets(location_id, type, currency, purpose);

INSERT INTO wallet_transactions (
  wallet_id,
  type,
  amount,
  balance_before,
  balance_after,
  description,
  reference_type,
  currency
)
SELECT
  wallets.id,
  'adjustment',
  ABS(wallets.balance),
  0,
  wallets.balance,
  'Opening balance backfill',
  'opening_balance_backfill',
  wallets.currency
FROM wallets
WHERE wallets.balance <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM wallet_transactions
    WHERE wallet_transactions.wallet_id = wallets.id
  );
