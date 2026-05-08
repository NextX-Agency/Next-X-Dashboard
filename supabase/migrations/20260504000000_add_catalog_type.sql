-- Migration: Add catalog_type column to items and categories
-- Date: 2026-05-04
-- Safety: ADDITIVE ONLY — no existing data is dropped or modified
-- All existing items/categories default to 'audio'

-- Add catalog_type to items table
ALTER TABLE "items"
  ADD COLUMN IF NOT EXISTS "catalog_type" TEXT NOT NULL DEFAULT 'audio';

-- Add catalog_type to categories table
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "catalog_type" TEXT NOT NULL DEFAULT 'audio';

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS "idx_items_catalog_type" ON "items" ("catalog_type");
CREATE INDEX IF NOT EXISTS "idx_categories_catalog_type" ON "categories" ("catalog_type");

-- Verification queries (run manually to confirm data integrity):
-- SELECT catalog_type, COUNT(*) FROM items GROUP BY catalog_type;
-- SELECT catalog_type, COUNT(*) FROM categories GROUP BY catalog_type;
