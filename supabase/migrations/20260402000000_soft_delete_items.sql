-- Add soft delete support to items table.
-- Instead of hard-deleting items (which cascade-deletes sale_items and destroys
-- historical profit data), we now set deleted_at on the item and filter it out
-- from all UI queries. The sale_items rows remain intact so reports stay accurate.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index so filtering by deleted_at IS NULL remains fast on large catalogs
CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON items (deleted_at)
  WHERE deleted_at IS NULL;
