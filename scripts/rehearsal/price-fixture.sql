-- SYNTHETIC product for the DISPOSABLE rehearsal cluster (127.0.0.1:55432) ONLY. Never run elsewhere.
--
-- One product whose two colours sit in different price ranges, so the shop's price filter can be proven
-- variant-aware: "KZ Duo (price fixture)" is Graphite at SRD 3,000 and Pearl at SRD 1,500, both in stock.
-- "Graphite" with a price of SRD 1,000 to 2,000 must NOT match it, although its cheapest option (Pearl,
-- SRD 1,500) is inside that range. "Pearl" with the same range must match, and the card must show
-- Pearl's price and name. (Own colour names keep the other fixtures' colour counts unchanged.)
--
-- Run after variant-fixture.sql:  psql <rehearsal db> -f scripts/rehearsal/price-fixture.sql
-- Idempotent.

BEGIN;

DELETE FROM storefront_products WHERE product_id = '00000000-0000-4000-8000-000000000903';
DELETE FROM inventory_movements WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = '00000000-0000-4000-8000-000000000903');
DELETE FROM product_images WHERE product_id = '00000000-0000-4000-8000-000000000903';
DELETE FROM price_list_items WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = '00000000-0000-4000-8000-000000000903');
DELETE FROM product_variants WHERE product_id = '00000000-0000-4000-8000-000000000903';
DELETE FROM products WHERE id = '00000000-0000-4000-8000-000000000903';

INSERT INTO products (id, code, name, slug, category_id, brand_id, model_number, summary, status, catalog_published, catalog_published_at, show_when_out_of_stock, created_at, compatibility) VALUES
  ('00000000-0000-4000-8000-000000000903', 'KZ-DUO', 'KZ Duo (price fixture)', 'kz-duo', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', 'KZD-1', 'Synthetic product: Graphite is SRD 3,000, Pearl is SRD 1,500.', 'active', true, now(), true, now() - interval '3 days', '{"platforms":[],"protocols":[],"ecosystems":[]}'::jsonb);

INSERT INTO product_variants (id, product_id, sku, name, attributes, list_price_cents, reference_cost_cents, is_default, is_active, position) VALUES
  ('00000000-0000-4000-8000-000000000931', '00000000-0000-4000-8000-000000000903', 'KZ-DUO-GPH', 'Graphite', '{"colour":"Graphite"}'::jsonb, 7800, 3000, true, true, 0),
  ('00000000-0000-4000-8000-000000000932', '00000000-0000-4000-8000-000000000903', 'KZ-DUO-PRL', 'Pearl', '{"colour":"Pearl"}'::jsonb, 3900, 1500, false, true, 1);

INSERT INTO price_list_items (price_list_id, variant_id, amount_cents) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000931', 300000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000932', 150000);

INSERT INTO inventory_movements (variant_id, kind, quantity, location_id, note) VALUES
  ('00000000-0000-4000-8000-000000000931', 'receipt', 4, '00000000-0000-4000-8000-000000000001', 'price fixture'),
  ('00000000-0000-4000-8000-000000000932', 'receipt', 4, '00000000-0000-4000-8000-000000000001', 'price fixture');

INSERT INTO product_images (product_id, variant_id, url, blob_pathname, width, height, alt, position, is_primary) VALUES
  ('00000000-0000-4000-8000-000000000903', NULL, '/dev-fixtures/live/kz-zs10-pro-x.jpg', 'dev-fixtures/live/kz-zs10-pro-x.jpg', 863, 1000, 'KZ Duo (shared stand-in photo)', 0, true),
  ('00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-000000000931', '/dev-fixtures/live/kz-carol.jpg', 'dev-fixtures/live/kz-carol.jpg', 1500, 1500, 'KZ Duo Graphite (stand-in photo)', 1, false),
  ('00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-000000000932', '/dev-fixtures/live/kz-az09.jpg', 'dev-fixtures/live/kz-az09.jpg', 998, 1000, 'KZ Duo Pearl (stand-in photo)', 2, false);

INSERT INTO storefront_products (storefront_id, product_id, visible, sort_order, featured) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000903', true, 22, false);

COMMIT;
