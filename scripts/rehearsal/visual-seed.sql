-- SYNTHETIC storefront data for local design review ONLY.
-- Applies to the disposable rehearsal cluster (127.0.0.1:55432). Never run against
-- staging or production: the products, prices, stock and contact details below are
-- invented and exist so the storefront can be rendered and screenshotted.
-- Images are crops of the checked-in public/iems.webp, written to public/dev-fixtures/
-- (gitignored). Idempotent: re-running replaces the fixture rows.

BEGIN;

DELETE FROM storefront_products;
DELETE FROM storefront_locations;
DELETE FROM inventory_movements;
DELETE FROM product_images;
DELETE FROM price_list_items;
DELETE FROM product_variants;
DELETE FROM products;
DELETE FROM storefronts;
DELETE FROM price_lists;
DELETE FROM brands;
DELETE FROM categories;
DELETE FROM locations;
DELETE FROM settings;

INSERT INTO settings (
  singleton, business_name, base_currency, display_currency, address_line, city, phone, whatsapp,
  email, instagram, opening_hours, pickup_enabled, pickup_label, pickup_details,
  delivery_enabled, delivery_details, payment_methods, store_description,
  homepage_available_now_enabled, homepage_featured_bundles_enabled
) VALUES (
  'singleton', 'NextX', 'USD', 'SRD', 'Voorbeeldstraat 1', 'Paramaribo', '+597 000 0000',
  '+5970000000', 'hallo@example.invalid', 'nextx.sr', 'Ma-za 09:00-18:00', true,
  'Ophalen na bevestiging', 'We bevestigen je bestelling via WhatsApp en spreken een moment af.',
  false, NULL,
  '[{"name":"Contant","details":null},{"name":"Overschrijving","details":null}]'::jsonb,
  'Audio en accessoires voor wie verschil hoort.', false, false
);

INSERT INTO locations (id, name, slug, active) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Hoofdlocatie', 'main', true);

INSERT INTO price_lists (id, name, currency) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Publiek SRD', 'SRD');

INSERT INTO storefronts (id, name, slug, domain, status, default_currency, default_locale,
  default_price_list_id, allow_pickup, allow_delivery, description)
VALUES ('00000000-0000-4000-8000-0000000000b1', 'NextX', 'audio', NULL, 'active', 'SRD', 'nl-SR',
  '00000000-0000-4000-8000-0000000000a1', true, false,
  'Audio en accessoires voor wie verschil hoort.');

INSERT INTO storefront_locations (storefront_id, location_id, active, priority)
VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', true, 0);

INSERT INTO categories (id, name, slug) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'In-ear monitors', 'in-ear-monitors'),
  ('00000000-0000-4000-8000-0000000000c2', 'Draadloze oordopjes', 'draadloze-oordopjes'),
  ('00000000-0000-4000-8000-0000000000c3', 'Spelers en DAC''s', 'spelers-en-dacs'),
  ('00000000-0000-4000-8000-0000000000c4', 'Accessoires', 'accessoires');

INSERT INTO brands (id, name, slug) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'Halden', 'halden'),
  ('00000000-0000-4000-8000-0000000000d2', 'Kestrel', 'kestrel'),
  ('00000000-0000-4000-8000-0000000000d3', 'Voss', 'voss');

-- code, name, slug, category, brand, summary, price SRD, stock, image, new?
CREATE TEMP TABLE seed_products (
  n int, code text, name text, slug text, cat text, brand text, summary text,
  price_srd numeric, stock int, image text, is_new boolean, out_ok boolean, specs jsonb
) ON COMMIT DROP;

INSERT INTO seed_products VALUES
 (1,'HS-8','Halden Studio 8','halden-studio-8','c1','d1','Acht balanced-armature drivers, afneembare kabel, neutrale afstemming.',4850,6,'iem-pair',true,false,'{"Drivers":"8 BA","Impedantie":"14 Ω","Connector":"0,78 mm 2-pin","Kabel":"1,2 m, 4,4 mm balanced"}'),
 (2,'HS-4','Halden Studio 4','halden-studio-4','c1','d1','Vier drivers voor wie een warm, gedetailleerd geluid zoekt.',2650,9,'iem-left',false,false,'{"Drivers":"4 BA","Impedantie":"18 Ω","Connector":"0,78 mm 2-pin"}'),
 (3,'KT-D','Kestrel Dual','kestrel-dual','c1','d2','Hybride set-up met dynamische driver en twee balanced armatures.',1890,12,'iem-right',false,false,'{"Drivers":"1 DD + 2 BA","Impedantie":"20 Ω","Connector":"0,78 mm 2-pin"}'),
 (4,'KT-1','Kestrel One','kestrel-one','c1','d2','Instapmodel met een rustig, breed geluidsbeeld.',650,18,'iem-left',false,false,'{"Driver":"1 DD 10 mm","Impedantie":"16 Ω","Connector":"3,5 mm"}'),
 (5,'VS-A','Voss Air','voss-air','c2','d3','Draadloze oordopjes met actieve ruisonderdrukking en ruim twaalf uur batterij.',1450,7,'iem-right',true,false,'{"Bluetooth":"5.3","Batterij":"12 uur + 24 uur case","Ruisonderdrukking":"Actief"}'),
 (6,'VS-S','Voss Sport','voss-sport','c2','d3','Stevig draadloos model voor onderweg en sporten.',990,0,'iem-pair',false,true,'{"Bluetooth":"5.2","Batterij":"8 uur + 24 uur case"}'),
 (7,'HD-P','Halden Player','halden-player','c3','d1','Compacte audiospeler met balanced uitgang en lokale opslag.',3900,3,'dap',false,false,'{"Uitgangen":"3,5 mm + 4,4 mm balanced","Opslag":"128 GB + microSD"}'),
 (8,'KT-DAC','Kestrel Dongle DAC','kestrel-dongle-dac','c3','d2','USB-C DAC voor telefoon en laptop, 3,5 mm uitgang.',520,15,'dap',false,false,'{"Aansluiting":"USB-C","Uitgang":"3,5 mm"}'),
 (9,'AC-C','Balanced kabel 4,4 mm','balanced-kabel-44','c4','d2','Verzilverde koperen kabel, 0,78 mm 2-pin, 4,4 mm balanced.',480,10,'iem-left',false,false,'{"Lengte":"1,2 m","Connector":"0,78 mm 2-pin → 4,4 mm"}'),
 (10,'AC-T','Foam eartips (3 maten)','foam-eartips','c4','d3','Memory-foam eartips in S, M en L voor betere isolatie.',120,40,'iem-right',false,false,'{"Maten":"S / M / L"}'),
 (11,'AC-B','Beschermcase','beschermcase','c4','d3','Harde case met ruimte voor kabel en tips.',150,22,'iem-pair',false,false,'{}'),
 (12,'KT-X','Kestrel Reference','kestrel-reference','c1','d2','Referentiemodel met zes drivers, binnenkort opnieuw verkrijgbaar.',3350,0,'iem-pair',false,true,'{"Drivers":"6 BA","Impedantie":"12 Ω"}');

INSERT INTO products (id, code, name, slug, category_id, brand_id, summary, description, specs,
  status, catalog_published, catalog_published_at, new_until, show_when_out_of_stock,
  warranty_months, created_at, key_features, box_contents)
SELECT
  ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  code, name, slug,
  ('00000000-0000-4000-8000-0000000000' || cat)::uuid,
  ('00000000-0000-4000-8000-0000000000' || brand)::uuid,
  summary,
  summary || E'\n\nAlle producten worden vóór uitlevering gecontroleerd. Heb je hulp nodig bij kiezen? Stuur ons een bericht via WhatsApp.',
  specs, 'active', true, now(), CASE WHEN is_new THEN now() + interval '30 days' END, out_ok,
  CASE WHEN cat IN ('c1','c2','c3') THEN 6 ELSE 0 END,
  now() - (n || ' days')::interval,
  '[]'::jsonb,
  CASE WHEN cat = 'c1' THEN '["Oordopjes","Kabel","Eartips","Case"]'::jsonb ELSE '[]'::jsonb END
FROM seed_products;

INSERT INTO product_variants (id, product_id, sku, name, list_price_cents, reference_cost_cents, is_default, is_active, position)
SELECT ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  code, 'Standaard', round(price_srd / 38.5 * 100)::bigint, round(price_srd / 38.5 * 45)::bigint, true, true, 0
FROM seed_products;

INSERT INTO price_list_items (price_list_id, variant_id, amount_cents)
SELECT '00000000-0000-4000-8000-0000000000a1',
  ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
  (price_srd * 100)::bigint
FROM seed_products;

INSERT INTO inventory_movements (variant_id, kind, quantity, location_id, note)
SELECT ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'receipt', stock,
  '00000000-0000-4000-8000-000000000001', 'synthetic design fixture'
FROM seed_products WHERE stock > 0;

INSERT INTO product_images (product_id, url, blob_pathname, width, height, alt, position, is_primary)
SELECT ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  '/dev-fixtures/' || image || '.webp', 'dev-fixtures/' || image || '.webp',
  CASE WHEN image = 'iem-pair' THEN 1200 ELSE 900 END, 900, name, 0, true
FROM seed_products;

INSERT INTO product_images (product_id, url, blob_pathname, width, height, alt, position, is_primary)
SELECT ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  '/dev-fixtures/' || img2 || '.webp', 'dev-fixtures/' || img2 || '.webp', 900, 900, name || ' detail', 1, false
FROM (SELECT n, name, CASE WHEN image = 'iem-left' THEN 'iem-right' ELSE 'iem-left' END AS img2 FROM seed_products) s
WHERE n IN (1,2,3,5);

INSERT INTO storefront_products (storefront_id, product_id, visible, sort_order, featured)
SELECT '00000000-0000-4000-8000-0000000000b1',
  ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, true, n, n IN (1,5,7)
FROM seed_products;

COMMIT;
