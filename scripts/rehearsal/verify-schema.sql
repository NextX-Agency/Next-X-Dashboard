\pset pager off
\echo 'engine'
SELECT current_database() AS database_name, current_setting('server_version') AS server_version;

\echo 'required tables'
WITH required(table_name) AS (
  VALUES
    ('members'), ('notifications'), ('activity_logs'), ('locations'),
    ('categories'), ('products'), ('product_variants'), ('product_images'),
    ('inventory_movements'), ('inventory_reservations'),
    ('customers'), ('sales'), ('sale_items'), ('sale_payments'),
    ('order_fulfillments'), ('storefronts'), ('storefront_products'),
    ('storefront_locations'), ('price_lists'), ('price_list_items'),
    ('wallets'), ('ledger_entries'), ('expenses'), ('fx_rates'),
    ('reconciliations'), ('integration_credentials'),
    ('finance_obligations'), ('finance_obligation_payments'), ('legacy_store_settings'),
    ('legacy_catalog_price_archive'),
    ('legacy_payout_run_archive'),
    ('legacy_stock_transfer_archive'),
    ('sellers'), ('seller_category_rates'), ('commissions'), ('commission_payouts'),
    ('document_sequences')
)
SELECT r.table_name, CASE WHEN c.table_name IS NULL THEN 'MISSING' ELSE 'present' END AS status
FROM required r
LEFT JOIN information_schema.tables c
  ON c.table_schema = 'public' AND c.table_name = r.table_name
ORDER BY r.table_name;

\echo 'required views'
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('v_stock_levels', 'v_cash_ledger', 'v_wallet_balances', 'v_owner_equity', 'v_product_margins')
ORDER BY table_name;

\echo 'rls'
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       COUNT(p.polname)::int AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;

\echo 'constraints'
SELECT conname, conrelid::regclass AS relation_name, contype
FROM pg_constraint
WHERE conname IN (
  'wallet_transfers_different_wallets',
  'ledger_entries_amount_positive',
  'inventory_movements_quantity_nonzero',
  'legacy_stock_transfer_archive_quantity_positive',
  'legacy_stock_transfer_archive_distinct_locations',
  'legacy_stock_transfer_archive_single_catalog_target',
  'inventory_reservations_quantity_positive',
  'price_list_items_price_nonnegative',
  'sales_invoice_number_key',
  'sellers_default_rate_bps_check',
  'seller_category_rates_rate_bps_check',
  'commission_payouts_amount_cents_check',
  'finance_obligations_status_amount_check',
  'finance_obligations_original_amount_check',
  'finance_obligation_payments_amount_cents_check',
  'commissions_amount_cents_check'
)
ORDER BY relation_name, conname;

\echo 'migration journal'
SELECT COUNT(*)::int AS applied_migrations,
       MIN(id) AS first_journal_id,
       MAX(id) AS last_journal_id
FROM drizzle.__drizzle_migrations;
