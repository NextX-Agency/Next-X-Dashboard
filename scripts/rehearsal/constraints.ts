import { config as loadDotenv } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ quiet: true });

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const reportPath = resolve(process.env.REHEARSAL_CONSTRAINT_REPORT ?? 'migration-reports/local-rehearsal-constraints.json');
if (!databaseUrl) throw new Error('DIRECT_URL or DATABASE_URL is required for constraint rehearsal');

type Check = { name: string; expected: string; actual: string; pass: boolean; details?: string };
const checks: Check[] = [];

async function attempt(db: postgres.Sql, name: string, expected: 'rejected' | 'accepted', action: () => Promise<void>, details?: string): Promise<void> {
  await db.unsafe('SAVEPOINT constraint_attempt');
  let actual: 'rejected' | 'accepted' = 'accepted';
  try {
    await action();
  } catch {
    actual = 'rejected';
  }
  await db.unsafe('ROLLBACK TO SAVEPOINT constraint_attempt');
  await db.unsafe('RELEASE SAVEPOINT constraint_attempt');
  checks.push({ name, expected, actual, pass: expected === actual, ...(details ? { details } : {}) });
}

async function main(): Promise<void> {
  const db = postgres(databaseUrl!, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    await db.unsafe('BEGIN');
    const commissionSeed = await db.unsafe(
      `WITH seller_row AS (
         INSERT INTO public.sellers (id, name, location_id)
         SELECT gen_random_uuid(), 'Constraint rehearsal seller', id
           FROM public.locations ORDER BY id LIMIT 1
         RETURNING id
       ), category_row AS (
         SELECT id FROM public.categories ORDER BY id LIMIT 1
       )
       INSERT INTO public.seller_category_rates (seller_id, category_id, rate_bps)
       SELECT seller_row.id, category_row.id, 500 FROM seller_row CROSS JOIN category_row
       RETURNING seller_id`,
    );
    if (commissionSeed.length !== 1) throw new Error('Rehearsal data is missing a location or category for commission constraint checks');
    const rehearsalSellerId = String(commissionSeed[0]?.seller_id);
    const ids = await db.unsafe(
      `SELECT v.id AS variant_id, v.product_id, v.sku, l.id AS location_id,
              s.id AS sale_id, si.id AS sale_item_id,
              w.id AS wallet_id, w.currency::text AS wallet_currency,
              w2.id AS wallet_2_id, pl.id AS price_list_id, pli.id AS price_item_id,
              cat.id AS category_id
       FROM public.product_variants v
       JOIN public.products p ON p.id = v.product_id
       CROSS JOIN LATERAL (SELECT id FROM public.locations ORDER BY id LIMIT 1) l
       CROSS JOIN LATERAL (SELECT s.id FROM public.sales s ORDER BY s.created_at LIMIT 1) s
       JOIN public.sale_items si ON si.sale_id = s.id
       CROSS JOIN LATERAL (SELECT id, currency FROM public.wallets WHERE currency = 'SRD' ORDER BY id LIMIT 1) w
       CROSS JOIN LATERAL (SELECT id FROM public.wallets WHERE currency = 'SRD' ORDER BY id OFFSET 1 LIMIT 1) w2
       CROSS JOIN LATERAL (SELECT id FROM public.categories ORDER BY id LIMIT 1) cat
       JOIN public.price_list_items pli ON pli.variant_id = v.id
       JOIN public.price_lists pl ON pl.id = pli.price_list_id
       ORDER BY v.id LIMIT 1`,
    );
    const row = ids[0];
    if (!row) throw new Error('Rehearsal data is missing required catalog, order, wallet, or price rows');
    const variantId = String(row.variant_id);
    const productId = String(row.product_id);
    const locationId = String(row.location_id);
    const otherLocationRows = await db.unsafe(
      'SELECT id FROM public.locations WHERE id <> $1::uuid ORDER BY id LIMIT 1',
      [locationId],
    );
    if (!otherLocationRows[0]?.id) throw new Error('Rehearsal data needs two locations for stock-transfer constraint checks');
    const otherLocationId = String(otherLocationRows[0].id);
    const saleId = String(row.sale_id);
    const saleItemId = String(row.sale_item_id);
    const walletId = String(row.wallet_id);
    const wallet2Id = String(row.wallet_2_id);
    const priceListId = String(row.price_list_id);
    const priceItemId = String(row.price_item_id);
    const categoryId = String(row.category_id);
    const sellerId = rehearsalSellerId;

    await attempt(db, 'duplicate product variant SKU', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.product_variants (id, product_id, sku, name) VALUES (gen_random_uuid(), $1::uuid, $2, 'duplicate SKU')`,
        [productId, row.sku],
      );
    }, 'product_variants_sku_key');

    await attempt(db, 'duplicate invoice number', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.sales (id, number, invoice_number, currency, total_cents, total_usd_cents)
         VALUES (gen_random_uuid(), 'constraint-test-order', 'NX-HIST-0001', 'USD', 100, 100)`,
      );
    }, 'sales_invoice_number_key');

    await attempt(db, 'zero legacy transfer quantity', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.legacy_stock_transfer_archive (id, legacy_id, legacy_item_id,
           variant_id, legacy_from_location_id, from_location_id, legacy_to_location_id,
           to_location_id, quantity, occurred_at)
         VALUES (gen_random_uuid(), 'constraint-transfer-zero', 'legacy-item', $1::uuid,
           'legacy-from', $2::uuid, 'legacy-to', $3::uuid, 0, now())`,
        [variantId, locationId, otherLocationId],
      );
    }, 'legacy_stock_transfer_archive_quantity_positive');

    await attempt(db, 'same-location legacy transfer', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.legacy_stock_transfer_archive (id, legacy_id, legacy_item_id,
           variant_id, legacy_from_location_id, from_location_id, legacy_to_location_id,
           to_location_id, quantity, occurred_at)
         VALUES (gen_random_uuid(), 'constraint-transfer-same-location', 'legacy-item', $1::uuid,
           'legacy-from', $2::uuid, 'legacy-to', $2::uuid, 1, now())`,
        [variantId, locationId],
      );
    }, 'legacy_stock_transfer_archive_distinct_locations');

    await attempt(db, 'duplicate price-list item', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.price_list_items (id, price_list_id, variant_id, amount_cents) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 1)`,
        [priceListId, variantId],
      );
    }, 'price_list_items_price_list_variant_key');

    await attempt(db, 'zero inventory reservation quantity', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.inventory_reservations (id, order_id, order_item_id, variant_id, location_id, quantity, status)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 0, 'active')`,
        [saleId, saleItemId, variantId, locationId],
      );
    }, 'inventory_reservations quantity > 0');

    await attempt(db, 'zero sale payment amount', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.sale_payments (id, sale_id, amount_cents, currency, fx_rate_micros, method)
         VALUES (gen_random_uuid(), $1::uuid, 0, 'USD', 1000000, 'cash')`,
        [saleId],
      );
    }, 'sale_payments_amount_positive');

    await attempt(db, 'same-wallet transfer', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.wallet_transfers (id, source_wallet_id, destination_wallet_id, amount_cents, currency)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, 1, $2::currency_code)`,
        [walletId, row.wallet_currency],
      );
    }, 'wallet_transfers_different_wallets');

    await attempt(db, 'zero ledger amount at database layer', 'accepted', async () => {
      await db.unsafe(
        `INSERT INTO public.ledger_entries (id, direction, category, description, currency, fx_rate_micros, amount_cents, amount_usd_cents)
         VALUES (gen_random_uuid(), 'in', 'other', 'constraint rehearsal only', 'USD', 1000000, 0, 0)`,
      );
    }, 'No database CHECK currently enforces amount_cents > 0; application posting rejects non-positive amounts.');

    await attempt(db, 'negative inventory movement quantity', 'accepted', async () => {
      await db.unsafe(
        `INSERT INTO public.inventory_movements (id, variant_id, location_id, kind, quantity, value_cents)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'adjustment', -1, -1)`,
        [variantId, locationId],
      );
    }, 'Signed movement ledger intentionally permits negative quantity for sale/write-off postings.');

    await attempt(db, 'commission rate above 100 percent', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.seller_category_rates (id, seller_id, category_id, rate_bps)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 10001)`,
        [sellerId, categoryId],
      );
    }, 'seller_category_rates_rate_bps_check');

    await attempt(db, 'duplicate seller category rate', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.seller_category_rates (id, seller_id, category_id, rate_bps)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 500)`,
        [sellerId, categoryId],
      );
    }, 'seller_category_rates_seller_category_key');

    await attempt(db, 'zero commission amount', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.commissions (id, seller_id, sale_id, group_key, amount_cents,
           amount_usd_cents, rate_bps, currency, fx_rate_micros)
         SELECT gen_random_uuid(), $1::uuid, s.id, 'constraint-zero-commission', 0, 0, 0, s.currency, s.fx_rate_micros
           FROM public.sales s WHERE s.id = $2::uuid`,
        [sellerId, saleId],
      );
    }, 'commissions_amount_cents_check');

    await attempt(db, 'zero commission payout amount', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.commission_payouts (id, seller_id, wallet_id, expense_id,
           amount_cents, amount_usd_cents, currency, fx_rate_micros)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid,
           (SELECT id FROM public.expenses ORDER BY id LIMIT 1), 0, 0, $3::currency_code, 1000000)`,
        [sellerId, walletId, row.wallet_currency],
      );
    }, 'commission_payouts_amount_cents_check');

    await attempt(db, 'obligation partial state with zero paid balance', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.finance_obligations (direction, counterparty_name, currency,
           original_amount_cents, paid_amount_cents, status)
         VALUES ('payable', 'constraint fixture', 'USD', 100, 0, 'partial')`,
      );
    }, 'finance_obligations_status_amount_check');

    await attempt(db, 'zero obligation settlement amount', 'rejected', async () => {
      await db.unsafe(
        `INSERT INTO public.finance_obligation_payments (obligation_id, wallet_id, amount_cents,
           currency, payment_method, occurred_at, idempotency_key)
         VALUES ((SELECT id FROM public.finance_obligations ORDER BY id LIMIT 1), $1::uuid,
           0, $2::currency_code, 'cash', now(), 'constraint-zero-obligation-payment')`,
        [walletId, row.wallet_currency],
      );
    }, 'finance_obligation_payments_amount_cents_check');

    await attempt(db, 'duplicate obligation settlement retry key', 'rejected', async () => {
      const obligation = await db.unsafe(
        `SELECT id FROM public.finance_obligations ORDER BY id LIMIT 1`,
      );
      if (!obligation[0]?.id) throw new Error('Rehearsal fixture has no finance obligation');
      const obligationId = String(obligation[0].id);
      const key = `constraint-idempotency-${Date.now()}`;
      const insert = `INSERT INTO public.finance_obligation_payments (obligation_id, wallet_id,
        amount_cents, currency, payment_method, occurred_at, idempotency_key)
        VALUES ($1::uuid, $2::uuid, 1, $3::currency_code, 'cash', now(), $4)`;
      await db.unsafe(insert, [obligationId, walletId, row.wallet_currency, key]);
      await db.unsafe(insert, [obligationId, walletId, row.wallet_currency, key]);
    }, 'finance_obligation_payments_idempotency_key');

    await db.unsafe('ROLLBACK');
    const result = {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      database: 'nextly_migration_rehearsal',
      checks,
      status: checks.every((entry) => entry.pass) ? 'pass' : 'fail',
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Constraint report: ${reportPath}`);
    console.log(`Checks: ${checks.filter((entry) => entry.pass).length}/${checks.length} passed`);
    if (result.status !== 'pass') {
      for (const entry of checks.filter((item) => !item.pass)) console.error(`FAIL ${entry.name}: expected ${entry.expected} got ${entry.actual}`);
      process.exitCode = 1;
    }
  } finally {
    await db.end({ timeout: 5 });
  }
}

await main();
