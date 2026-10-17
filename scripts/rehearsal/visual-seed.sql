-- LOCAL DESIGN-REVIEW DATA for the disposable rehearsal cluster (127.0.0.1:55432) ONLY.
-- Never run against staging or production.
--
-- Product names, SRD prices and stock states are what the live shop showed publicly on 2026-10-17.
-- Placeholders, not facts: stock counts for items the live shop only listed as "in stock" (set to 10),
-- the business contact details, and which pickup location holds which unit (except the KZ AS16 Pro X,
-- which the live page listed as 1 + 1 + 0). Photographs are in public/dev-fixtures/live (gitignored).
-- Idempotent: re-running replaces the rows.

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
  'singleton', 'NextX', 'USD', 'SRD', NULL, 'Paramaribo', NULL,
  '+5970000000', NULL, NULL, NULL, true,
  'Alleen ophalen', 'Beschikbaar voor ophalen in de winkel.',
  false, NULL,
  '[]'::jsonb,
  'In-ear monitors en accessoires. Bestel via WhatsApp; prijzen in SRD.', false, false
);

INSERT INTO locations (id, name, slug, active) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Commewijne Alkmaar', 'main', true),
  ('00000000-0000-4000-8000-000000000002', 'Paramaribo-Noord, Blauwgrond', 'blauwgrond', true),
  ('00000000-0000-4000-8000-000000000003', 'Commissaris Thurkowweg 263A', 'thurkowweg', true);

INSERT INTO price_lists (id, name, currency) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Publiek SRD', 'SRD');

INSERT INTO storefronts (id, name, slug, domain, status, default_currency, default_locale,
  default_price_list_id, allow_pickup, allow_delivery, description)
VALUES ('00000000-0000-4000-8000-0000000000b1', 'NextX', 'audio', NULL, 'active', 'SRD', 'nl-SR',
  '00000000-0000-4000-8000-0000000000a1', true, false,
  'In-ear monitors en accessoires. Bestel via WhatsApp; prijzen in SRD.');

INSERT INTO storefront_locations (storefront_id, location_id, active, priority) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', true, 0),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000002', true, 1),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000003', true, 2);

INSERT INTO categories (id, name, slug, position) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'In-Ear Monitor', 'in-ear-monitor', 1),
  ('00000000-0000-4000-8000-0000000000c2', 'In-Ear Accessories', 'in-ear-accessories', 2),
  ('00000000-0000-4000-8000-0000000000c3', 'Wireless Earbuds', 'wireless-earbuds', 3);

INSERT INTO brands (id, name, slug) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'KZ', 'kz'),
  ('00000000-0000-4000-8000-0000000000d2', 'ESSAGER', 'essager'),
  ('00000000-0000-4000-8000-0000000000d3', 'M-Vave', 'm-vave');

INSERT INTO products (id, code, name, slug, category_id, brand_id, summary, description, specs, status, catalog_published, catalog_published_at, show_when_out_of_stock, warranty_months, created_at, key_features, box_contents) VALUES
  ('00000000-0000-4000-8000-000000000101', 'KZ-AS16-PRO-X', 'KZ AS16 Pro X', 'kz-as16-pro-x', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', NULL, 'De KZ AS16 Pro X is een premium bedrade in-ear monitor die professionele geluidskwaliteit levert voor de veeleisende luisteraar. Uitgerust met maar liefst 16 Balanced Armature (BA) drivers (8 per oor) biedt hij ongeëvenaarde details, een strakke bas en een breed geluidsbeeld voor de ultieme audio-ervaring.

Het hoogwaardige, ergonomische ontwerp garandeert langdurig draagcomfort. Daarnaast zorgt de meegeleverde afneembare, verzilverde 0,75 mm 2-pin kabel voor een loepzuivere signaaloverdracht. Een uitstekende keuze voor audiofielen en muzikanten die streven naar compromisloze audioperfectie.', '{"Drivers": "16 Balanced Armature (8 per oor)", "Kabel": "Afneembaar, verzilverd, 0,75 mm 2-pin", "Type": "Bedrade in-ear monitor"}'::jsonb, 'active', true, now(), true, 0, now() - interval '1 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000102', 'KZ-ZS10-PRO-X', 'KZ ZS10 PRO X', 'kz-zs10-pro-x', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '2 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000103', 'KZ-ZSN-PRO-2', 'KZ ZSN Pro 2', 'kz-zsn-pro-2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '3 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000104', 'KZ-CASTOR-PRO', 'KZ Castor PRO', 'kz-castor-pro', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '4 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000105', 'KZ-VADER', 'KZ Vader', 'kz-vader', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '5 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000106', 'KZ-EDX-PRO-X', 'KZ EDX Pro X', 'kz-edx-pro-x', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '6 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000107', 'KZ-EDX-PRO', 'KZ EDX PRO', 'kz-edx-pro', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '7 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000108', 'KZ-CAROL', 'KZ Carol', 'kz-carol', '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '8 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000109', 'M-VAVE-SWS12', 'M-Vave SWS12 Wireless IEM System', 'm-vave-sws12', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d3', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '9 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000110', 'KZ-AZ09', 'KZ AZ09', 'kz-az09', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '10 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000111', 'KZ-IEM-CABLE', 'KZ IEM 3.5mm Kabel', 'kz-iem-cable', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '11 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000112', 'ESSAGER-2M-AUX', 'ESSAGER 2m Aux(3.5mm) to Aux Verlengkabel', 'essager-2m-aux', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d2', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '12 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000113', 'ESSAGER-1M-AUX', 'ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel', 'essager-1m-aux', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d2', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '13 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000114', 'ESSAGER-TYPE-C-DAC', 'ESSAGER AUX(3.5mm) to Type-C DAC', 'essager-type-c-dac', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d2', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '14 days', '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000000115', 'KZ-ELLIPTICAL-POUCH', 'KZ Elliptical Pouch', 'kz-elliptical-pouch', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d1', NULL, NULL, '{}'::jsonb, 'active', true, now(), true, 0, now() - interval '15 days', '[]'::jsonb, '[]'::jsonb);
INSERT INTO product_variants (id, product_id, sku, name, list_price_cents, reference_cost_cents, is_default, is_active, position) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'KZ-AS16-PRO-X', 'Standaard', 7792, 4286, true, true, 0),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'KZ-ZS10-PRO-X', 'Standaard', 5714, 3143, true, true, 0),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', 'KZ-ZSN-PRO-2', 'Standaard', 3896, 2143, true, true, 0),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000104', 'KZ-CASTOR-PRO', 'Standaard', 3896, 2143, true, true, 0),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000105', 'KZ-VADER', 'Standaard', 3896, 2143, true, true, 0),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000106', 'KZ-EDX-PRO-X', 'Standaard', 1299, 714, true, true, 0),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000107', 'KZ-EDX-PRO', 'Standaard', 1299, 714, true, true, 0),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-000000000108', 'KZ-CAROL', 'Standaard', 3636, 2000, true, true, 0),
  ('00000000-0000-4000-8000-000000000209', '00000000-0000-4000-8000-000000000109', 'M-VAVE-SWS12', 'Standaard', 7792, 4286, true, true, 0),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000110', 'KZ-AZ09', 'Standaard', 3377, 1857, true, true, 0),
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000111', 'KZ-IEM-CABLE', 'Standaard', 649, 357, true, true, 0),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000112', 'ESSAGER-2M-AUX', 'Standaard', 649, 357, true, true, 0),
  ('00000000-0000-4000-8000-000000000213', '00000000-0000-4000-8000-000000000113', 'ESSAGER-1M-AUX', 'Standaard', 649, 357, true, true, 0),
  ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-000000000114', 'ESSAGER-TYPE-C-DAC', 'Standaard', 519, 286, true, true, 0),
  ('00000000-0000-4000-8000-000000000215', '00000000-0000-4000-8000-000000000115', 'KZ-ELLIPTICAL-POUCH', 'Standaard', 519, 286, true, true, 0);
INSERT INTO price_list_items (price_list_id, variant_id, amount_cents) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000201', 300000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000202', 220000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000203', 150000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000204', 150000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000205', 150000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000206', 50000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000207', 50000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000208', 140000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000209', 300000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000210', 130000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000211', 25000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000212', 25000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000213', 25000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000214', 20000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000215', 20000);
INSERT INTO inventory_movements (variant_id, kind, quantity, location_id, note) VALUES
  ('00000000-0000-4000-8000-000000000201', 'receipt', 1, '00000000-0000-4000-8000-000000000001', 'live page: Commewijne Alkmaar 1'),
  ('00000000-0000-4000-8000-000000000201', 'receipt', 1, '00000000-0000-4000-8000-000000000002', 'live page: Blauwgrond 1'),
  ('00000000-0000-4000-8000-000000000202', 'receipt', 4, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000203', 'receipt', 4, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000206', 'receipt', 10, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000207', 'receipt', 10, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000208', 'receipt', 1, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000209', 'receipt', 2, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000211', 'receipt', 10, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000212', 'receipt', 10, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000213', 'receipt', 10, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000214', 'receipt', 10, '00000000-0000-4000-8000-000000000001', 'design fixture'),
  ('00000000-0000-4000-8000-000000000215', 'receipt', 10, '00000000-0000-4000-8000-000000000001', 'design fixture');
INSERT INTO product_images (product_id, url, blob_pathname, width, height, alt, position, is_primary) VALUES
  ('00000000-0000-4000-8000-000000000101', '/dev-fixtures/live/kz-as16-pro-x.jpg', 'dev-fixtures/live/kz-as16-pro-x.jpg', 894, 906, 'KZ AS16 Pro X', 0, true),
  ('00000000-0000-4000-8000-000000000102', '/dev-fixtures/live/kz-zs10-pro-x.jpg', 'dev-fixtures/live/kz-zs10-pro-x.jpg', 863, 1000, 'KZ ZS10 PRO X', 0, true),
  ('00000000-0000-4000-8000-000000000103', '/dev-fixtures/live/kz-zsn-pro-2.jpg', 'dev-fixtures/live/kz-zsn-pro-2.jpg', 1160, 1160, 'KZ ZSN Pro 2', 0, true),
  ('00000000-0000-4000-8000-000000000104', '/dev-fixtures/live/kz-castor-pro.jpg', 'dev-fixtures/live/kz-castor-pro.jpg', 998, 1000, 'KZ Castor PRO', 0, true),
  ('00000000-0000-4000-8000-000000000105', '/dev-fixtures/live/kz-vader.jpg', 'dev-fixtures/live/kz-vader.jpg', 500, 500, 'KZ Vader', 0, true),
  ('00000000-0000-4000-8000-000000000106', '/dev-fixtures/live/kz-edx-pro-x.webp', 'dev-fixtures/live/kz-edx-pro-x.webp', 640, 640, 'KZ EDX Pro X', 0, true),
  ('00000000-0000-4000-8000-000000000107', '/dev-fixtures/live/kz-edx-pro.jpg', 'dev-fixtures/live/kz-edx-pro.jpg', 640, 640, 'KZ EDX PRO', 0, true),
  ('00000000-0000-4000-8000-000000000108', '/dev-fixtures/live/kz-carol.jpg', 'dev-fixtures/live/kz-carol.jpg', 1500, 1500, 'KZ Carol', 0, true),
  ('00000000-0000-4000-8000-000000000109', '/dev-fixtures/live/m-vave-sws12.jpeg', 'dev-fixtures/live/m-vave-sws12.jpeg', 894, 837, 'M-Vave SWS12 Wireless IEM System', 0, true),
  ('00000000-0000-4000-8000-000000000110', '/dev-fixtures/live/kz-az09.jpg', 'dev-fixtures/live/kz-az09.jpg', 998, 1000, 'KZ AZ09', 0, true),
  ('00000000-0000-4000-8000-000000000111', '/dev-fixtures/live/kz-iem-cable.jpg', 'dev-fixtures/live/kz-iem-cable.jpg', 1000, 927, 'KZ IEM 3.5mm Kabel', 0, true),
  ('00000000-0000-4000-8000-000000000112', '/dev-fixtures/live/essager-2m-aux.jpeg', 'dev-fixtures/live/essager-2m-aux.jpeg', 720, 720, 'ESSAGER 2m Aux(3.5mm) to Aux Verlengkabel', 0, true),
  ('00000000-0000-4000-8000-000000000113', '/dev-fixtures/live/essager-1m-aux.jpg', 'dev-fixtures/live/essager-1m-aux.jpg', 720, 720, 'ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel', 0, true),
  ('00000000-0000-4000-8000-000000000114', '/dev-fixtures/live/essager-type-c-dac.jpg', 'dev-fixtures/live/essager-type-c-dac.jpg', 1000, 1000, 'ESSAGER AUX(3.5mm) to Type-C DAC', 0, true),
  ('00000000-0000-4000-8000-000000000115', '/dev-fixtures/live/kz-elliptical-pouch.jpg', 'dev-fixtures/live/kz-elliptical-pouch.jpg', 1160, 1160, 'KZ Elliptical Pouch', 0, true);
INSERT INTO storefront_products (storefront_id, product_id, visible, sort_order, featured) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000101', true, 1, true),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000102', true, 2, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000103', true, 3, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000104', true, 4, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000105', true, 5, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000106', true, 6, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000107', true, 7, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000108', true, 8, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000109', true, 9, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000110', true, 10, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000111', true, 11, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000112', true, 12, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000113', true, 13, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000114', true, 14, false),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000115', true, 15, false);

COMMIT;
