-- SYNTHETIC multi-variant test products for the DISPOSABLE rehearsal cluster (127.0.0.1:55432) ONLY.
-- Never run against staging or production.
--
-- The live catalogue has 15 single-option products, so nothing real exercises variants. These two
-- products exist to test variant selection, variant photographs, variant stock/price and filters.
-- Their names say "(test fixture)". The photographs are stand-ins borrowed from other fixtures; they do
-- NOT show a Black/Silver/Purple product and must never be mistaken for real photography.
--
-- Run after visual-seed.sql:  psql <rehearsal db> -f scripts/rehearsal/variant-fixture.sql
-- Idempotent.

BEGIN;

DELETE FROM storefront_products WHERE product_id IN ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902');
DELETE FROM inventory_movements WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902'));
DELETE FROM product_images WHERE product_id IN ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902');
DELETE FROM price_list_items WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902'));
DELETE FROM product_variants WHERE product_id IN ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902');
DELETE FROM products WHERE id IN ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902');

INSERT INTO products (id, code, name, slug, category_id, brand_id, model_number, summary, status, catalog_published, catalog_published_at, show_when_out_of_stock, created_at, compatibility) VALUES
  ('00000000-0000-4000-8000-000000000901', 'KZ-TEST-IEM', 'KZ Test IEM (test fixture)', 'kz-test-iem', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', 'KZT-1', 'Synthetic test product with Black, Silver and Purple options.', 'active', true, now(), true, now() - interval '1 day', '{"platforms":[],"protocols":["3.5mm wired"],"ecosystems":[]}'::jsonb),
  ('00000000-0000-4000-8000-000000000902', 'KZ-TEST-CASE', 'KZ Test Case (test fixture)', 'kz-test-case', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d1', NULL, 'Synthetic test product where only one option has a photograph.', 'active', true, now(), true, now() - interval '2 days', '{"platforms":[],"protocols":[],"ecosystems":[]}'::jsonb);

INSERT INTO product_variants (id, product_id, sku, name, attributes, list_price_cents, reference_cost_cents, is_default, is_active, position) VALUES
  ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901', 'KZ-TEST-IEM-BLK', 'Black', '{"colour":"Black","connector":"3.5mm"}'::jsonb, 3000, 1500, true, true, 0),
  ('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000901', 'KZ-TEST-IEM-SLV', 'Silver', '{"colour":"Silver","connector":"3.5mm"}'::jsonb, 3200, 1500, false, true, 1),
  ('00000000-0000-4000-8000-000000000913', '00000000-0000-4000-8000-000000000901', 'KZ-TEST-IEM-PRP', 'Purple', '{"colour":"Purple","connector":"Type-C"}'::jsonb, 3400, 1600, false, true, 2),
  ('00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000902', 'KZ-TEST-CASE-RED', 'Red', '{"colour":"Red"}'::jsonb, 800, 300, true, true, 0),
  ('00000000-0000-4000-8000-000000000922', '00000000-0000-4000-8000-000000000902', 'KZ-TEST-CASE-BLU', 'Blue', '{"colour":"Blue"}'::jsonb, 800, 300, false, true, 1);

INSERT INTO price_list_items (price_list_id, variant_id, amount_cents) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000911', 150000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000912', 160000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000913', 170000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000921', 40000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000922', 40000);

-- Black: 3 at the main location, 1 at Blauwgrond. Silver: none (sold out). Purple: 2 at Blauwgrond only.
-- Red: 5 at main. Blue: 1 at main.
INSERT INTO inventory_movements (variant_id, kind, quantity, location_id, note) VALUES
  ('00000000-0000-4000-8000-000000000911', 'receipt', 3, '00000000-0000-4000-8000-000000000001', 'variant fixture'),
  ('00000000-0000-4000-8000-000000000911', 'receipt', 1, '00000000-0000-4000-8000-000000000002', 'variant fixture'),
  ('00000000-0000-4000-8000-000000000913', 'receipt', 2, '00000000-0000-4000-8000-000000000002', 'variant fixture'),
  ('00000000-0000-4000-8000-000000000921', 'receipt', 5, '00000000-0000-4000-8000-000000000001', 'variant fixture'),
  ('00000000-0000-4000-8000-000000000922', 'receipt', 1, '00000000-0000-4000-8000-000000000001', 'variant fixture');

-- KZ Test IEM: a shared primary photograph; Black and Silver have their own; Purple has none (falls back
-- to the shared one). KZ Test Case: only Blue has a photograph and nothing is shared, so Red must show
-- the placeholder, never Blue's photograph.
INSERT INTO product_images (product_id, variant_id, url, blob_pathname, width, height, alt, position, is_primary) VALUES
  ('00000000-0000-4000-8000-000000000901', NULL, '/dev-fixtures/live/kz-zsn-pro-2.jpg', 'dev-fixtures/live/kz-zsn-pro-2.jpg', 1160, 1160, 'KZ Test IEM (shared stand-in photo)', 0, true),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000911', '/dev-fixtures/live/kz-castor-pro.jpg', 'dev-fixtures/live/kz-castor-pro.jpg', 998, 1000, 'KZ Test IEM Black (stand-in photo 1)', 1, false),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000911', '/dev-fixtures/live/kz-as16-pro-x.jpg', 'dev-fixtures/live/kz-as16-pro-x.jpg', 894, 906, 'KZ Test IEM Black (stand-in photo 2)', 2, false),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000912', '/dev-fixtures/live/kz-vader.jpg', 'dev-fixtures/live/kz-vader.jpg', 500, 500, 'KZ Test IEM Silver (stand-in photo)', 3, false),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000922', '/dev-fixtures/live/kz-elliptical-pouch.jpg', 'dev-fixtures/live/kz-elliptical-pouch.jpg', 1160, 1160, 'KZ Test Case Blue (stand-in photo)', 0, true);

INSERT INTO storefront_products (storefront_id, product_id, visible, sort_order, featured) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000901', true, 20, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000902', true, 21, false);

COMMIT;
