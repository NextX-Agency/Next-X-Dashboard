import { config as loadDotenv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';
import { buildMigrationPlan, deterministicUuid } from '../migrate-nextx/transform';
import type { LegacyRow, MigrationPlan } from '../migrate-nextx/types';

loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ quiet: true });

const sourcePath = resolve(process.env.REHEARSAL_SOURCE ?? 'tests/fixtures/nextx-sanitized.json');
const reportPath = resolve(process.env.REHEARSAL_VALIDATION_REPORT ?? 'migration-reports/local-rehearsal-validation.json');
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DIRECT_URL or DATABASE_URL is required for rehearsal validation');

type Check = {
  name: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
  details?: string;
};

const checks: Check[] = [];

function check(name: string, expected: unknown, actual: unknown, details?: string): void {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  checks.push({ name, expected, actual, pass, ...(details ? { details } : {}) });
}

function mappingId(plan: MigrationPlan, entityType: string, legacyId: string, destinationEntity: string): string {
  const mapping = plan.mappings.find(
    (entry) =>
      entry.entityType === entityType &&
      entry.legacyId === legacyId &&
      entry.destinationEntity === destinationEntity &&
      entry.destinationId,
  );
  if (!mapping?.destinationId) throw new Error(`No mapping for ${entityType}:${legacyId} -> ${destinationEntity}`);
  return mapping.destinationId;
}

function operationIds(plan: MigrationPlan, table: string): string[] {
  return plan.operations
    .filter((operation) => operation.table === table)
    .map((operation) => String(operation.values.id ?? ''))
    .filter(Boolean);
}

function valuesById(plan: MigrationPlan, table: string, id: string): Record<string, unknown> {
  const operation = plan.operations.find(
    (entry) => entry.table === table && String(entry.values.id ?? '') === id,
  );
  if (!operation) throw new Error(`No operation for ${table}:${id}`);
  return operation.values;
}

function text(value: unknown): string {
  return String(value ?? '');
}

async function loadPlan(): Promise<MigrationPlan> {
  const raw = JSON.parse(await readFile(sourcePath, 'utf8')) as LegacyRow;
  return buildMigrationPlan(raw);
}

async function main(): Promise<void> {
    const plan = await loadPlan();
    const sql = postgres(databaseUrl!, { prepare: false, max: 1, connect_timeout: 10 });

  try {
    const checkedInJournal = JSON.parse(
      await readFile(resolve('src/server/db/migrations/meta/_journal.json'), 'utf8'),
    ) as { entries?: unknown[] };
    const expectedMigrationCount = checkedInJournal.entries?.length ?? 0;
    const identity = await sql.unsafe(
      `SELECT current_database() AS database, current_setting('server_version') AS server_version`,
    );
    const journal = await sql.unsafe(
      `SELECT count(*)::int AS count, min(id)::int AS first_id, max(id)::int AS last_id
       FROM drizzle.__drizzle_migrations`,
    );
    check('database identity', 'nextly_migration_rehearsal', text(identity[0]?.database));
    check('migration journal entries', { count: expectedMigrationCount, first_id: 1, last_id: expectedMigrationCount }, {
      count: Number(journal[0]?.count),
      first_id: Number(journal[0]?.first_id),
      last_id: Number(journal[0]?.last_id),
    });

    const invoiceSequence = await sql.unsafe(
      `SELECT last_value::text AS last_value
         FROM public.document_sequences WHERE prefix = 'INV-'`,
    );
    check(
      'invoice sequence remains above the imported legacy high-water mark',
      true,
      Number(invoiceSequence[0]?.last_value ?? 0) >= 163,
      'Legacy source sequence INV/163 must not be reused for a new invoice.',
    );

    const tableCounts: Record<string, number> = {};
    for (const table of [
      'categories',
      'locations',
      'products',
      'product_variants',
      'price_lists',
      'price_list_items',
      'storefronts',
      'storefront_products',
      'storefront_locations',
      'customers',
      'sales',
      'sale_items',
      'sale_payments',
      'sale_refunds',
      'wallets',
      'wallet_transfers',
      'ledger_entries',
      'expenses',
      'expense_categories',
      'fx_rates',
      'reconciliations',
      'inventory_movements',
      'inventory_reservations',
      'sellers',
      'seller_category_rates',
      'commissions',
      'commission_payouts',
      'finance_obligations',
      'legacy_store_settings',
      'legacy_catalog_price_archive',
      'legacy_payout_run_archive',
      'legacy_stock_transfer_archive',
    ]) {
      console.log(`Checking imported ${table}`);
      const ids = operationIds(plan, table);
      if (table === 'legacy_store_settings') {
        const keys = plan.operations
          .filter((operation) => operation.table === 'legacy_store_settings')
          .map((operation) => text(operation.values.key));
        const rows = await sql.unsafe(
          `SELECT count(*)::int AS count FROM public.legacy_store_settings WHERE key = ANY($1::text[])`,
          [keys],
        );
        tableCounts[table] = Number(rows[0]?.count ?? 0);
      } else if (table === 'storefronts') {
        const slugs = plan.operations
          .filter((operation) => operation.table === 'storefronts')
          .map((operation) => text(operation.values.slug));
        const rows = await sql.unsafe(
          `SELECT count(*)::int AS count FROM public.storefronts WHERE slug = ANY($1::text[])`,
          [slugs],
        );
        tableCounts[table] = Number(rows[0]?.count ?? 0);
      } else if (table === 'storefront_locations') {
        const operations = plan.operations.filter((operation) => operation.table === table);
        const locationIds = operations.map((operation) => text(operation.values.location_id));
        const storefrontSlugs = operations.map((operation) => {
          const storefrontId = text(operation.values.storefront_id);
          const storefront = plan.operations.find(
            (candidate) => candidate.table === 'storefronts' && text(candidate.values.id) === storefrontId,
          );
          return text(storefront?.values.slug);
        });
        const rows = await sql.unsafe(
          `SELECT count(*)::int AS count
           FROM public.storefront_locations sl
           JOIN public.storefronts s ON s.id = sl.storefront_id
           WHERE s.slug = ANY($1::text[]) AND sl.location_id = ANY($2::uuid[])`,
          [storefrontSlugs, locationIds],
        );
        tableCounts[table] = Number(rows[0]?.count ?? 0);
      } else {
        const rows = await sql.unsafe(
          `SELECT count(*)::int AS count FROM public.${table} WHERE id = ANY($1::uuid[])`,
          [ids],
        );
        tableCounts[table] = Number(rows[0]?.count ?? 0);
      }
      const expected = table === 'legacy_store_settings'
        ? new Set(plan.operations.filter((operation) => operation.table === table).map((operation) => text(operation.values.key))).size
        : table === 'storefronts' ? new Set(
        plan.operations.filter((operation) => operation.table === 'storefronts').map((operation) => text(operation.values.slug)),
      ).size : table === 'storefront_locations' ? plan.operations.filter((operation) => operation.table === table).length : new Set(ids).size;
      check(`imported ${table} rows`, expected, tableCounts[table]);
    }

    const obligationId = mappingId(plan, 'financeObligations', 'obligation-receivable-1', 'finance_obligations');
    const obligationRows = await sql.unsafe(
      `SELECT direction, original_amount_cents::text AS original_amount_cents,
              paid_amount_cents::text AS paid_amount_cents, status, currency::text AS currency
         FROM public.finance_obligations WHERE id = $1::uuid`,
      [obligationId],
    );
    check('legacy obligation opening balance', {
      direction: 'receivable', original_amount_cents: '12500', paid_amount_cents: '4000', status: 'partial', currency: 'USD',
    }, {
      direction: text(obligationRows[0]?.direction),
      original_amount_cents: text(obligationRows[0]?.original_amount_cents),
      paid_amount_cents: text(obligationRows[0]?.paid_amount_cents),
      status: text(obligationRows[0]?.status),
      currency: text(obligationRows[0]?.currency),
    });

    const mappedSettings = plan.operations.find((operation) => operation.table === 'settings')?.values;
    const settingsRows = await sql.unsafe(
      `SELECT business_name, display_currency::text AS display_currency, hero_title
         FROM public.settings WHERE singleton = 'settings'`,
    );
    check('legacy canonical store settings', {
      business_name: 'NextX', display_currency: 'SRD', hero_title: 'Everyday audio, ready today',
    }, {
      business_name: text(settingsRows[0]?.business_name),
      display_currency: text(settingsRows[0]?.display_currency),
      hero_title: text(settingsRows[0]?.hero_title),
    }, `Mapped operation present: ${Boolean(mappedSettings)}`);

    const brandRows = await sql.unsafe(
      `SELECT slug, hero_title, hero_image_url FROM public.storefronts WHERE slug = ANY($1::text[]) ORDER BY slug`,
      [['audio', 'watches']],
    );
    check('legacy storefront hero content', [
      { slug: 'audio', hero_title: 'Clear sound for the commute', hero_image_url: null },
      { slug: 'watches', hero_title: 'Everyday audio, ready today', hero_image_url: '/fixture/watches-hero.webp' },
    ], brandRows.map((row) => ({
      slug: text(row.slug), hero_title: row.hero_title === null ? null : text(row.hero_title),
      hero_image_url: row.hero_image_url === null ? null : text(row.hero_image_url),
    })));

    const variantIds = new Map<string, string>();
    for (const item of plan.snapshot.items) {
      const legacyId = text(item.id);
      variantIds.set(legacyId, deterministicUuid(plan.sourceSystem, 'product_variants', legacyId));
    }
    const locationIds = new Map<string, string>();
    for (const location of plan.snapshot.locations) {
      const legacyId = text(location.id);
      locationIds.set(legacyId, mappingId(plan, 'locations', legacyId, 'locations'));
    }

    for (const [legacyId, expected] of Object.entries(plan.expected.inventory)) {
      const variantId = variantIds.get(expected.variantKey);
      const locationId = locationIds.get(expected.locationKey);
      if (!variantId || !locationId) throw new Error(`Missing inventory mapping for ${legacyId}`);
      const rows = await sql.unsafe(
        `SELECT COALESCE(sum(m.quantity), 0)::int AS on_hand,
                COALESCE((SELECT sum(r.quantity) FROM public.inventory_reservations r
                  WHERE r.variant_id = $1::uuid AND r.location_id = $2::uuid AND r.status = 'active'), 0)::int AS reserved
         FROM public.inventory_movements m
         WHERE m.variant_id = $1::uuid
           AND m.location_id = $2::uuid
           AND m.source_kind = 'manual'`,
        [variantId, locationId],
      );
      const actual = { onHand: Number(rows[0]?.on_hand ?? 0), reserved: Number(rows[0]?.reserved ?? 0) };
      check(`inventory ${legacyId} on-hand`, Number(expected.quantity), actual.onHand);
      check(`inventory ${legacyId} available`, Number(expected.quantity) - actual.reserved, actual.onHand - actual.reserved);
    }

    for (const [legacyId, expected] of Object.entries(plan.expected.orders)) {
      const saleId = mappingId(plan, 'sales', legacyId, 'sales');
      const rows = await sql.unsafe(
        `SELECT number, invoice_number, total_cents::text AS total_cents, currency::text AS currency,
                status::text AS status, workflow_status::text AS workflow_status
         FROM public.sales WHERE id = $1::uuid`,
        [saleId],
      );
      const row = rows[0];
      check(`order ${legacyId}`, {
        total_cents: expected.totalCents,
        currency: expected.currency,
        status: 'confirmed',
        workflow_status: 'completed',
      }, {
        total_cents: text(row?.total_cents),
        currency: text(row?.currency),
        status: text(row?.status),
        workflow_status: text(row?.workflow_status),
      });
      const itemCount = await sql.unsafe(`SELECT count(*)::int AS count FROM public.sale_items WHERE sale_id = $1::uuid`, [saleId]);
      check(`order ${legacyId} line count`, 1, Number(itemCount[0]?.count ?? 0));
      const expectedLineTotals = plan.operations
        .filter((operation) => operation.table === 'sale_items' && operation.values.sale_id === saleId)
        .sort((left, right) => Number(left.values.position ?? 0) - Number(right.values.position ?? 0))
        .map((operation) => text(operation.values.line_total_cents));
      const lineTotalRows = await sql.unsafe(
        `SELECT line_total_cents::text AS line_total_cents
           FROM public.sale_items WHERE sale_id = $1::uuid ORDER BY position`,
        [saleId],
      );
      check(
        `order ${legacyId} source-currency line totals`,
        expectedLineTotals,
        lineTotalRows.map((line) => text(line.line_total_cents)),
      );
    }

    for (const [legacyId, expected] of Object.entries(plan.expected.payments)) {
      const paymentId = mappingId(plan, 'salePayments', legacyId, 'sale_payments');
      const rows = await sql.unsafe(
        `SELECT amount_cents::text AS amount_cents, currency::text AS currency, status::text AS status
         FROM public.sale_payments WHERE id = $1::uuid`,
        [paymentId],
      );
      check(`payment ${legacyId}`, {
        amount_cents: expected.amountCents,
        currency: expected.currency,
        status: 'confirmed',
      }, {
        amount_cents: text(rows[0]?.amount_cents),
        currency: text(rows[0]?.currency),
        status: text(rows[0]?.status),
      });
    }

    const aggregateRows = await sql.unsafe(
      `SELECT s.invoice_number, s.total_cents::text AS total_cents,
              COALESCE((SELECT sum(p.amount_cents) FROM public.sale_payments p WHERE p.sale_id = s.id AND p.status = 'confirmed'), 0)::text AS paid_cents,
              COALESCE((SELECT sum(r.amount_cents) FROM public.sale_refunds r WHERE r.sale_id = s.id), 0)::text AS refunded_cents
       FROM public.sales s
       WHERE s.id = ANY($1::uuid[]) ORDER BY s.invoice_number`,
      [Object.keys(plan.expected.orders).map((legacyId) => mappingId(plan, 'sales', legacyId, 'sales'))],
    );
    check('order payment/refund aggregates', [
      { invoice_number: 'NX-HIST-0001', total_cents: '847000', paid_cents: '847000', refunded_cents: '10000' },
      { invoice_number: 'NX-HIST-0002', total_cents: '7500', paid_cents: '3500', refunded_cents: '0' },
    ], aggregateRows.map((row) => ({
      invoice_number: text(row.invoice_number),
      total_cents: text(row.total_cents),
      paid_cents: text(row.paid_cents),
      refunded_cents: text(row.refunded_cents),
    })));

    for (const [legacyId, expected] of Object.entries(plan.expected.wallets)) {
      const walletId = mappingId(plan, 'wallets', legacyId, 'wallets');
      const rows = await sql.unsafe(
        `SELECT w.name, w.currency::text AS currency, COALESCE(v.balance_cents, 0)::text AS balance_cents
         FROM public.wallets w LEFT JOIN public.v_wallet_balances v ON v.wallet_id = w.id
         WHERE w.id = $1::uuid`,
        [walletId],
      );
      check(`wallet ${legacyId}`, {
        name: text(valuesById(plan, 'wallets', walletId).name),
        currency: expected.currency,
        balance_cents: expected.balanceCents,
      }, {
        name: text(rows[0]?.name),
        currency: text(rows[0]?.currency),
        balance_cents: text(rows[0]?.balance_cents),
      });
    }

    const importedLedgerIds = operationIds(plan, 'ledger_entries');
    const ledgerSources = await sql.unsafe(
      `SELECT source_kind::text AS source_kind, count(*)::int AS count
       FROM public.ledger_entries WHERE id = ANY($1::uuid[])
       GROUP BY source_kind ORDER BY source_kind`,
      [importedLedgerIds],
    );
    const expectedLedgerGroups = new Map<string, number>();
    for (const operation of plan.operations.filter((entry) => entry.table === 'ledger_entries')) {
      const sourceKind = text(operation.values.source_kind);
      expectedLedgerGroups.set(sourceKind, (expectedLedgerGroups.get(sourceKind) ?? 0) + 1);
    }
    check('imported ledger source groups', [...expectedLedgerGroups.entries()]
      .map(([source_kind, count]) => ({ source_kind, count }))
      .sort((left, right) => left.source_kind.localeCompare(right.source_kind)), ledgerSources.map((row) => ({ source_kind: text(row.source_kind), count: Number(row.count) })));

    const voided = await sql.unsafe(
      `SELECT count(*)::int AS count FROM public.expenses WHERE id = $1::uuid AND voided_at IS NOT NULL`,
      [mappingId(plan, 'expenses', 'expense-voided', 'expenses')],
    );
    const activeExpenseLedger = await sql.unsafe(
      `SELECT count(*)::int AS count FROM public.ledger_entries WHERE source_kind = 'expense' AND source_id = $1::uuid`,
      [mappingId(plan, 'expenses', 'expense-1', 'expenses')],
    );
    check('voided expense preserved', 1, Number(voided[0]?.count ?? 0));
    check('active expense has one ledger entry', 1, Number(activeExpenseLedger[0]?.count ?? 0));

    const fx = await sql.unsafe(
      `SELECT rate_micros::text AS rate_micros FROM public.fx_rates WHERE id = $1::uuid`,
      [mappingId(plan, 'exchangeRates', 'rate-1', 'fx_rates')],
    );
    check('historical FX snapshot', '38500000', text(fx[0]?.rate_micros));

    const jsonTypes = await sql.unsafe(
      `SELECT jsonb_typeof(p.specs) AS specs_type, jsonb_typeof(v.attributes) AS attributes_type
       FROM public.products p JOIN public.product_variants v ON v.product_id = p.id
       WHERE p.id = $1::uuid`,
      [mappingId(plan, 'items', 'item-audio-1', 'products')],
    );
    check('catalog JSONB objects', { specs_type: 'object', attributes_type: 'object' }, {
      specs_type: text(jsonTypes[0]?.specs_type),
      attributes_type: text(jsonTypes[0]?.attributes_type),
    });

    const publicSpecKeys = await sql.unsafe(
      `SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[]) AS keys
       FROM public.products p, jsonb_object_keys(p.specs) AS key
       WHERE p.id = $1::uuid`,
      [mappingId(plan, 'items', 'item-audio-1', 'products')],
    );
    check('public catalog specs contain no source metadata', [], publicSpecKeys[0]?.keys ?? []);

    const invoiceRows = await sql.unsafe(
      `SELECT invoice_number, total_cents::text AS total_cents, currency::text AS currency
       FROM public.sales WHERE invoice_number = ANY($1::text[]) ORDER BY invoice_number`,
      [['NX-HIST-0001', 'NX-HIST-0002']],
    );
    check('historical invoice numbers', [
      { invoice_number: 'NX-HIST-0001', total_cents: '847000', currency: 'SRD' },
      { invoice_number: 'NX-HIST-0002', total_cents: '7500', currency: 'USD' },
    ], invoiceRows.map((row) => ({
      invoice_number: text(row.invoice_number),
      total_cents: text(row.total_cents),
      currency: text(row.currency),
    })));

    const storefrontRows = await sql.unsafe(
      `SELECT s.slug, count(DISTINCT sp.product_id)::int AS products, count(DISTINCT sl.location_id)::int AS locations
       FROM public.storefronts s
       LEFT JOIN public.storefront_products sp ON sp.storefront_id = s.id AND sp.visible
       LEFT JOIN public.storefront_locations sl ON sl.storefront_id = s.id AND sl.active
       WHERE s.slug = ANY($1::text[])
       GROUP BY s.slug ORDER BY s.slug`,
      [['audio', 'main', 'watches']],
    );
    check('storefront exposure', [
      { slug: 'audio', products: 1, locations: 1 },
      { slug: 'main', products: 0, locations: 2 },
      { slug: 'watches', products: 1, locations: 2 },
    ], storefrontRows.map((row) => ({ slug: text(row.slug), products: Number(row.products), locations: Number(row.locations) })));

    const duplicateSourceRows = await sql.unsafe(
      `SELECT source_kind::text AS source_kind, source_id::text AS source_id, count(*)::int AS count
       FROM public.ledger_entries
       WHERE id = ANY($1::uuid[]) AND source_id IS NOT NULL
       GROUP BY source_kind, source_id HAVING count(*) > 1`,
      [importedLedgerIds],
    );
    check('no duplicate imported ledger provenance', [], duplicateSourceRows);

    const result = {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      sourcePath,
      database: text(identity[0]?.database),
      serverVersion: text(identity[0]?.server_version),
      sourceChecksum: plan.sourceChecksum,
      checks,
      status: checks.every((entry) => entry.pass) ? 'pass' : 'fail',
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Rehearsal validation report: ${reportPath}`);
    console.log(`Checks: ${checks.filter((entry) => entry.pass).length}/${checks.length} passed`);
    if (result.status !== 'pass') {
      for (const entry of checks.filter((item) => !item.pass)) console.error(`FAIL ${entry.name}: expected ${JSON.stringify(entry.expected)} got ${JSON.stringify(entry.actual)}`);
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
