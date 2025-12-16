-- Migration: Add missing columns for unified financial model with category-based commissions
-- Date: 2024-12-16
-- This migration adds ONLY the missing pieces to complete the unified model:
-- - Add location_id to expenses (for location-based expense tracking)
-- - Add location_id and category_id to commissions (for location + category based commissions)
-- - Update wallet_transactions table structure to match application needs

-- =====================================================
-- STEP 1: Add location_id to expenses
-- =====================================================

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_location ON expenses(location_id);

-- =====================================================
-- STEP 2: Add location_id and category_id to commissions
-- Commissions are calculated using seller_category_rates table (seller+category combo)
-- =====================================================

ALTER TABLE commissions ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commissions_location ON commissions(location_id);
CREATE INDEX IF NOT EXISTS idx_commissions_category ON commissions(category_id);

-- =====================================================
-- STEP 3: Update wallet_transactions table structure
-- Add missing columns needed by the application
-- =====================================================

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'SRD';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_id UUID;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_expense ON wallet_transactions(expense_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference_type ON wallet_transactions(reference_type);

-- =====================================================
-- NOTES FOR DATA MIGRATION (run manually if needed):
-- =====================================================
-- 1. For existing wallets without location_id:
--    UPDATE wallets SET location_id = (SELECT id FROM locations LIMIT 1) WHERE location_id IS NULL;
-- 
-- 2. For existing commissions, migrate seller_id to location_id:
--    UPDATE commissions c SET location_id = s.location_id FROM sellers s WHERE c.seller_id = s.id;
--
-- 3. After migration, you can optionally:
--    - DROP TABLE sellers CASCADE;
--    - DROP TABLE seller_category_rates CASCADE;
--    - ALTER TABLE wallets DROP COLUMN person_name;
