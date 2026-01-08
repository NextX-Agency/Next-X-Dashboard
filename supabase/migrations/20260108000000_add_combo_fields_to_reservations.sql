-- Add combo fields to reservations table
ALTER TABLE reservations 
ADD COLUMN combo_id TEXT,
ADD COLUMN combo_price DECIMAL(10, 2),
ADD COLUMN original_price DECIMAL(10, 2);

-- Create index for combo_id for faster lookups
CREATE INDEX idx_reservations_combo ON reservations(combo_id) WHERE combo_id IS NOT NULL;

COMMENT ON COLUMN reservations.combo_id IS 'Groups reservation items that are part of the same combo deal';
COMMENT ON COLUMN reservations.combo_price IS 'The total combo price (only set on first item of combo)';
COMMENT ON COLUMN reservations.original_price IS 'The original total price before combo discount';
