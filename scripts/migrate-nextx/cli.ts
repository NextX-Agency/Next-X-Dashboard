import { config as loadDotenv } from 'dotenv';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import postgres from 'postgres';
import { auditLegacyMediaSources, prepareLegacyMedia } from './media';
import { ownerReviewCsv } from './owner-review';
import { assertReadinessReport, workingTreeFingerprint } from './readiness';
import {
  buildMigrationPlan,
  hasFatalConflicts,
  summaryText,
} from './transform';
import { normalizeSnapshot, type LegacyRow, type MigrationOperation, type MigrationPlan } from './types';

loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ quiet: true });

type Flags = Record<string, string | boolean>;

const REQUIRED_DESTINATION_TABLES = [
  'locations',
  'categories',
  'products',
  'product_variants',
  'product_images',
  'inventory_movements',
  'inventory_reservations',
  'customers',
  'document_sequences',
  'finance_obligations',
  'finance_obligation_payments',
  'legacy_store_settings',
  'legacy_catalog_price_archive',
  'legacy_payout_run_archive',
  'legacy_stock_transfer_archive',
  'legacy_reservation_archive',
  'settings',
  'sellers',
  'seller_category_rates',
  'commissions',
  'commission_payouts',
  'sales',
  'sale_items',
  'sale_payments',
  'sale_refunds',
  'storefronts',
  'storefront_products',
  'price_lists',
  'price_list_items',
  'bundles',
  'bundle_components',
  'storefront_locations',
  'wallets',
  'wallet_transfers',
  'ledger_entries',
  'expenses',
  'recurring_expenses',
  'expense_categories',
  'fx_rates',
  'reconciliations',
  'activity_logs',
] as const;

const SOURCE_TABLES: Record<string, string> = {
  companies: 'companies',
  users: 'users',
  locations: 'locations',
  categories: 'categories',
  items: 'items',
  comboItems: 'combo_items',
  stock: 'stock',
  stockTransfers: 'stock_transfers',
  exchangeRates: 'exchange_rates',
  clients: 'clients',
  reservations: 'reservations',
  sales: 'sales',
  saleItems: 'sale_items',
  salePayments: 'sale_payments',
  saleRefunds: 'sale_refunds',
  wallets: 'wallets',
  expenses: 'expenses',
  recurringExpenses: 'recurring_expenses',
  expenseCategories: 'expense_categories',
  walletTransactions: 'wallet_transactions',
  financeLedgerEntries: 'finance_ledger_entries',
  walletReconciliations: 'wallet_reconciliations',
  invoices: 'invoices',
  invoiceSequences: 'invoice_sequences',
  financeObligations: 'finance_obligations',
  storeSettings: 'store_settings',
  sellers: 'sellers',
  sellerCategoryRates: 'seller_category_rates',
  commissions: 'commissions',
  payoutRuns: 'payout_runs',
  budgets: 'budgets',
  activityLogs: 'activity_logs',
  notifications: 'user_notifications',
  purchaseOrders: 'purchase_orders',
  purchaseOrderItems: 'purchase_order_items',
};

function parseFlags(argv: string[]): { command: string; flags: Flags } {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'inspect';
  const flags: Flags = {};
  for (let index = command === 'inspect' && argv[0]?.startsWith('-') ? 0 : 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) continue;
    const trimmed = argument.slice(2);
    const equalsAt = trimmed.indexOf('=');
    if (equalsAt >= 0) {
      flags[trimmed.slice(0, equalsAt)] = trimmed.slice(equalsAt + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[trimmed] = next;
      index += 1;
    } else {
      flags[trimmed] = true;
    }
  }
  return { command, flags };
}

function flag(flags: Flags, key: string): string | null {
  const value = flags[key];
  return typeof value === 'string' ? value : null;
}

function hasFlag(flags: Flags, key: string): boolean {
  return flags[key] === true || typeof flags[key] === 'string';
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

function sourceInputPath(flags: Flags): string | null {
  return flag(flags, 'source') ?? process.env.NEXTX_SOURCE_EXPORT ?? null;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function loadSourceExport(path: string): Promise<unknown> {
  const details = await stat(path);
  if (details.isFile()) return readJson(path);
  if (!details.isDirectory()) throw new Error(`Source path is not a file or directory: ${path}`);
  const files = (await readdir(path)).filter((entry) => entry.toLowerCase().endsWith('.json'));
  const preferred = files.find((entry) => ['snapshot.json', 'nextx.json', 'export.json'].includes(entry.toLowerCase()));
  if (preferred) return readJson(join(path, preferred));
  const raw: Record<string, unknown> = {};
  for (const file of files) {
    const value = await readJson(join(path, file));
    raw[basename(file, extname(file))] = value;
  }
  return raw;
}

function databaseUrl(flags: Flags, name: 'source' | 'destination'): string | null {
  if (name === 'source') return process.env.NEXTX_SOURCE_DATABASE_URL ?? null;
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? null;
}

async function loadSourceFromDatabase(url: string): Promise<unknown> {
  const client = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    return await client.begin('isolation level repeatable read read only', async (tx) => {
      const names = Object.values(SOURCE_TABLES);
      const rows = await tx.unsafe(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])',
        ['public', names],
      );
      const available = new Set(rows.map((row) => String(row.table_name)));
      const snapshot: Record<string, unknown> = {
        metadata: {
          sourceSystem: 'nextx',
          sourceSchemaVersion: 'postgres-prisma',
          exportedAt: new Date().toISOString(),
          sourceTableInventoryComplete: true,
          sourceTableCounts: {},
        },
      };
      for (const [key, table] of Object.entries(SOURCE_TABLES)) {
        if (!available.has(table)) {
          snapshot[key] = [];
          continue;
        }
        snapshot[key] = await tx.unsafe(`SELECT * FROM ${quoteIdentifier(table)}`);
      }

      const inventoryRows = await tx.unsafe(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = $2',
        ['public', 'BASE TABLE'],
      );
      const loadedTables = new Set(Object.values(SOURCE_TABLES));
      for (const row of inventoryRows) {
        const table = String(row.table_name);
        if (loadedTables.has(table)) continue;
        const [countRow] = await tx.unsafe(
          `SELECT count(*)::text AS row_count FROM ${quoteIdentifier(table)}`,
        );
        (snapshot.metadata as Record<string, unknown>).sourceTableCounts = {
          ...((snapshot.metadata as Record<string, unknown>).sourceTableCounts as Record<string, string>),
          [table]: String(countRow?.row_count ?? '0'),
        };
      }
      return snapshot;
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function loadSource(flags: Flags): Promise<{ raw: unknown; descriptor: string }> {
  const path = sourceInputPath(flags);
  if (path) return { raw: await loadSourceExport(resolve(path)), descriptor: resolve(path) };
  const url = databaseUrl(flags, 'source');
  if (url) return { raw: await loadSourceFromDatabase(url), descriptor: 'NEXTX_SOURCE_DATABASE_URL' };
  throw new Error(
    'No source supplied. Use --source <sanitized-export.json|directory> or set NEXTX_SOURCE_DATABASE_URL. No source credentials are assumed.',
  );
}

function reportView(plan: MigrationPlan): Record<string, unknown> {
  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSystem: plan.sourceSystem,
    sourceSchemaVersion: plan.sourceSchemaVersion,
    sourceExportedAt: plan.sourceExportedAt,
    sourceChecksum: plan.sourceChecksum,
    sourceTableInventoryComplete: plan.snapshot.metadata.sourceTableInventoryComplete === true,
    sourceTableCounts: plan.snapshot.metadata.sourceTableCounts ?? {},
    summary: plan.summary,
    currencyTotals: plan.currencyTotals,
    expected: plan.expected,
    conflicts: plan.conflicts,
    mappings: plan.mappings,
    validation: offlineValidation(plan),
  };
}

async function writeReport(plan: MigrationPlan, mode: string, requestedPath: string | null): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultPath = resolve('migration-reports', `nextx-${mode}-${stamp}.json`);
  const outputPath = requestedPath ? resolve(requestedPath) : defaultPath;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(reportView(plan), null, 2)}\n`, 'utf8');
  const textPath = outputPath.replace(/\.json$/i, '.txt');
  await writeFile(textPath, `${summaryText(plan)}\n\nConflicts:\n${plan.conflicts.map((conflict) => `[${conflict.severity}] ${conflict.kind}: ${conflict.message}`).join('\n')}\n`, 'utf8');
  const statePath = outputPath.replace(/\.json$/i, '.state.json');
  await writeFile(statePath, `${JSON.stringify({ reportVersion: 1, sourceChecksum: plan.sourceChecksum, mappings: plan.mappings }, null, 2)}\n`, 'utf8');
  return outputPath;
}

function safeTargetEnvironment(flags: Flags): 'local' | 'development' | 'staging' {
  const environment = flag(flags, 'target-environment') ?? process.env.NEXTLY_MIGRATION_TARGET ?? null;
  const confirmed = flag(flags, 'confirm-safe-target') ?? null;
  if (!environment || !['local', 'development', 'staging'].includes(environment)) {
    throw new Error('Refusing destination writes: use --target-environment local|development|staging. Production is never accepted.');
  }
  if (confirmed !== environment) {
    throw new Error(`Refusing destination writes: repeat the exact environment with --confirm-safe-target ${environment}.`);
  }
  return environment as 'local' | 'development' | 'staging';
}

function isIsolatedRehearsalTarget(flags: Flags): boolean {
  if (flag(flags, 'target-environment') !== 'local') return false;
  const url = databaseUrl(flags, 'destination');
  if (!url) return false;
  try {
    const target = new URL(url);
    return (
      ['127.0.0.1', 'localhost'].includes(target.hostname) &&
      target.port === '55432' &&
      target.pathname === '/nextly_migration_rehearsal'
    );
  } catch {
    return false;
  }
}

async function openDestination(flags: Flags): Promise<postgres.Sql> {
  safeTargetEnvironment(flags);
  const url = databaseUrl(flags, 'destination');
  if (!url) throw new Error('DIRECT_URL or DATABASE_URL is required for destination validation/import.');
  return postgres(url, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    connection: { application_name: 'nextly-nextx-migration' },
  });
}

async function destinationPreflight(client: postgres.Sql): Promise<Record<string, unknown>> {
  const tableRows = await client.unsafe(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])',
    ['public', [...REQUIRED_DESTINATION_TABLES]],
  );
  const available = new Set(tableRows.map((row) => String(row.table_name)));
  const missingTables = REQUIRED_DESTINATION_TABLES.filter((table) => !available.has(table));
  const migrationRows = await client.unsafe(
    `SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = '__drizzle_migrations' ORDER BY table_schema`,
  );
  const walletViewRows = await client.unsafe(
    `SELECT to_regclass('public.v_wallet_balances') AS wallet_view, to_regclass('public.v_cash_ledger') AS ledger_view`,
  );
  if (missingTables.length > 0 || !walletViewRows[0]?.wallet_view || !walletViewRows[0]?.ledger_view) {
    throw new Error(`Destination schema is not ready through finance foundation: missing tables=${missingTables.join(',') || 'none'}, finance views=${JSON.stringify(walletViewRows[0] ?? {})}`);
  }
  return {
    requiredTables: REQUIRED_DESTINATION_TABLES.length,
    missingTables,
    migrationJournalTables: migrationRows,
    financeViews: walletViewRows[0],
  };
}

async function resolveDestinationAliases(client: postgres.Sql, plan: MigrationPlan): Promise<string[]> {
  const storefrontOperations = plan.operations.filter((operation) => operation.table === 'storefronts');
  const slugs = storefrontOperations
    .map((operation) => operation.values.slug)
    .filter((slug): slug is string => typeof slug === 'string');
  if (slugs.length === 0) return [];

  const rows = await client.unsafe(
    'SELECT id, slug FROM storefronts WHERE slug = ANY($1::text[])',
    [slugs] as never[],
  );
  const aliases = new Map<string, string>();
  for (const operation of storefrontOperations) {
    const slug = operation.values.slug;
    const desiredId = operation.values.id;
    const existingId = rows.find((row) => String(row.slug) === slug)?.id;
    if (typeof desiredId !== 'string' || existingId === undefined || String(existingId) === desiredId) continue;
    aliases.set(desiredId, String(existingId));
  }
  if (aliases.size === 0) return [];

  for (const operation of plan.operations) {
    for (const [column, value] of Object.entries(operation.values)) {
      if ((column === 'id' || column.endsWith('_id')) && typeof value === 'string') {
        const alias = aliases.get(value);
        if (alias) operation.values[column] = alias;
      }
    }
  }
  for (const mapping of plan.mappings) {
    const alias = mapping.destinationId ? aliases.get(mapping.destinationId) : undefined;
    if (alias) mapping.destinationId = alias;
  }
  for (const [desiredId, existingId] of aliases) {
    plan.conflicts.push({
      severity: 'info',
      kind: 'DESTINATION_ALIAS',
      entityType: 'storefronts',
      entityKey: desiredId,
      message: `Reused existing destination storefront ${existingId} for the matching slug; dependent operations were remapped before import`,
    });
    plan.summary.conflictCounts.info += 1;
  }
  return [...aliases.entries()].map(([desiredId, existingId]) => `${desiredId}->${existingId}`);
}

function parameterValue(value: unknown): unknown {
  // postgres serializes plain objects/arrays as JSON parameters. Keeping the
  // object intact matters: passing a pre-stringified value to a ::jsonb
  // placeholder stores a JSON string, not a JSON object.
  return value;
}

const JSONB_COLUMNS = new Set([
  'attributes',
  'box_contents',
  'buyer_requirements',
  'compatibility',
  'diff',
  'faq_items',
  'key_features',
  'specs',
  'source_record',
  'value',
]);
const TEXT_ARRAY_COLUMNS = new Set(['best_for']);

async function insertOperation(client: postgres.ISql, operation: MigrationOperation): Promise<void> {
  const values = Object.entries(operation.values).filter(([, value]) => value !== undefined);
  if (values.length === 0) throw new Error(`Operation ${operation.table}/${operation.sourceId} has no values`);
  const columnNames = values.map(([column]) => column);
  const columns = columnNames.map(quoteIdentifier).join(', ');
  const placeholders = values
    .map(([column], index) => {
      const cast = JSONB_COLUMNS.has(column)
        ? '::jsonb'
        : TEXT_ARRAY_COLUMNS.has(column)
          ? '::text[]'
          : '';
      return `$${index + 1}${cast}`;
    })
    .join(', ');
  const target = operation.conflictTarget.map(quoteIdentifier).join(', ');
  const conflictAction = operation.table === 'document_sequences'
    ? `DO UPDATE SET "last_value" = GREATEST("document_sequences"."last_value", EXCLUDED."last_value"),
                     "padding" = GREATEST("document_sequences"."padding", EXCLUDED."padding"),
                     "updated_at" = GREATEST("document_sequences"."updated_at", EXCLUDED."updated_at")`
    : operation.table === 'settings'
      ? `DO UPDATE SET ${columnNames.filter((column) => column !== 'singleton').map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')}`
      : operation.table === 'storefronts'
        ? `DO UPDATE SET ${columnNames.filter((column) => column !== 'id').map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')}`
        : operation.table === 'legacy_store_settings'
          ? `DO UPDATE SET "value" = EXCLUDED."value", "source_updated_at" = EXCLUDED."source_updated_at"`
    : 'DO NOTHING';
  const query = `INSERT INTO ${quoteIdentifier(operation.table)} (${columns}) VALUES (${placeholders}) ON CONFLICT (${target}) ${conflictAction}`;
  await client.unsafe(query, values.map(([, value]) => parameterValue(value)) as never[]);
}

function operationBatches(plan: MigrationPlan): MigrationOperation[][] {
  const groups = new Map<string, MigrationOperation[]>();
  let referenceIndex = 0;
  let inventoryIndex = 0;
  plan.operations.forEach((operation) => {
    let group = operation.group;
    if (operation.group === 'reference') group = `reference:${Math.floor(referenceIndex++ / 100)}`;
    if (operation.group === 'inventory') group = `inventory:${Math.floor(inventoryIndex++ / 100)}`;
    const entries = groups.get(group) ?? [];
    entries.push(operation);
    groups.set(group, entries);
  });
  return [...groups.values()];
}

async function applyPlan(client: postgres.Sql, plan: MigrationPlan): Promise<{ batches: number; operations: number }> {
  const batches = operationBatches(plan);
  for (const batch of batches) {
    await client.begin(async (transaction) => {
      for (const operation of batch) await insertOperation(transaction, operation);
    });
  }
  return { batches: batches.length, operations: plan.operations.length };
}

function offlineValidation(plan: MigrationPlan): Record<string, unknown> {
  const operationKeys = new Set<string>();
  const duplicateOperations: string[] = [];
  for (const operation of plan.operations) {
    const key = `${operation.table}:${operation.conflictTarget
      .map((column) => `${column}=${String(operation.values[column] ?? '')}`)
      .join('|')}`;
    if (operationKeys.has(key)) duplicateOperations.push(key);
    operationKeys.add(key);
  }
  const orderMismatches: string[] = [];
  for (const [legacyId, expected] of Object.entries(plan.expected.orders)) {
    const operation = plan.operations.find((candidate) => candidate.table === 'sales' && candidate.sourceId === legacyId);
    if (!operation || String(operation.values.total_cents) !== expected.totalCents || String(operation.values.currency) !== expected.currency) orderMismatches.push(legacyId);
  }
  const inventoryMismatches: string[] = [];
  for (const [legacyId, expected] of Object.entries(plan.expected.inventory)) {
    const operation = plan.operations.find((candidate) => candidate.table === 'inventory_movements' && candidate.sourceId === legacyId);
    if (!operation || String(operation.values.quantity) !== expected.quantity) inventoryMismatches.push(legacyId);
  }
  const paymentMismatches: string[] = [];
  for (const [legacyId, expected] of Object.entries(plan.expected.payments)) {
    const operation = plan.operations.find((candidate) => candidate.table === 'sale_payments' && candidate.sourceId === legacyId);
    if (!operation || String(operation.values.amount_cents) !== expected.amountCents || String(operation.values.currency) !== expected.currency) {
      paymentMismatches.push(legacyId);
    }
  }
  const invoiceMismatches: string[] = [];
  for (const [legacyId, expected] of Object.entries(plan.expected.invoices)) {
    const operation = plan.operations.find((candidate) => candidate.table === 'sales' && candidate.sourceId === legacyId);
    if (!operation || String(operation.values.invoice_number ?? '') !== expected.number || String(operation.values.total_cents) !== expected.totalCents || String(operation.values.currency) !== expected.currency) {
      invoiceMismatches.push(legacyId);
    }
  }
  const reconciliation = {
    inventory: { expected: Object.keys(plan.expected.inventory).length, mismatches: inventoryMismatches },
    orders: { expected: Object.keys(plan.expected.orders).length, mismatches: orderMismatches },
    payments: { expected: Object.keys(plan.expected.payments).length, mismatches: paymentMismatches },
    invoices: { expected: Object.keys(plan.expected.invoices).length, mismatches: invoiceMismatches },
    finance: {
      wallets: Object.keys(plan.expected.wallets).length,
      ledgerEntries: plan.operations.filter((operation) => operation.table === 'ledger_entries').length,
    },
  };
  const reconciliationChecks = [reconciliation.inventory, reconciliation.orders, reconciliation.payments, reconciliation.invoices];
  return {
    mode: 'offline',
    duplicateOperations,
    reconciliation,
    fatalConflicts: plan.summary.conflictCounts.fatal,
    status: duplicateOperations.length === 0 && reconciliationChecks.every((entry) => entry.mismatches.length === 0) && !hasFatalConflicts(plan) ? 'pass' : 'fail',
  };
}

async function onlineValidation(client: postgres.Sql, plan: MigrationPlan): Promise<Record<string, unknown>> {
  const tableCounts: Record<string, { expected: number; found: number }> = {};
  for (const table of new Set(plan.operations.map((operation) => operation.table))) {
    const ids = plan.operations
      .filter((operation) => operation.table === table && typeof operation.values.id === 'string')
      .map((operation) => operation.values.id as string);
    if (ids.length === 0) continue;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const rows = await client.unsafe(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)} WHERE id IN (${placeholders})`, ids as never[]);
    tableCounts[table] = { expected: ids.length, found: Number(rows[0]?.count ?? 0) };
  }
  const walletIds = plan.operations
    .filter((operation) => operation.table === 'wallets' && typeof operation.values.id === 'string')
    .map((operation) => operation.values.id as string);
  const walletRows = walletIds.length > 0
    ? await client.unsafe(`SELECT wallet_id, balance_cents::text FROM v_wallet_balances WHERE wallet_id = ANY($1::uuid[])`, [walletIds] as never[])
    : [];
  return {
    mode: 'online',
    tableCounts,
    walletBalances: walletRows,
    status: Object.values(tableCounts).every((entry) => entry.found === entry.expected) ? 'pass' : 'fail',
  };
}

function printHelp(): void {
  console.log(`NextX migration tooling

Commands:
  pnpm migrate:nextx:inspect -- --source <export.json|directory>
  pnpm migrate:nextx:media-audit -- --source <export.json|directory>
  pnpm migrate:nextx:media-prepare -- --source <export.json|directory> --media-preparation-report <report.json> --target-environment staging --confirm-safe-target staging [--out <media-map.json>]
  pnpm migrate:nextx:snapshot -- [--out <snapshot.json>]   (reads NEXTX_SOURCE_DATABASE_URL)
  pnpm migrate:nextx:readiness-fingerprint
  pnpm migrate:nextx:dry-run -- --source <export.json|directory> [--out <report.json>]
  pnpm migrate:nextx:run -- --source <export.json|directory> --readiness-report <report.json> --target-environment staging --confirm-safe-target staging
  pnpm migrate:nextx:validate -- --source <export.json|directory> [safe target flags]

Source alternatives:
  NEXTX_SOURCE_DATABASE_URL=<legacy direct Postgres URL>
  NEXTX_SOURCE_EXPORT=<sanitized JSON export path>

Migration writes require DIRECT_URL/DATABASE_URL and a current report with all
ten gates marked PASS. Production is never accepted by this tool. Media
preparation is limited to isolated staging and requires a current
MEDIA_PREPARATION report with the self-hosting, Coolify, Supabase runtime and
RLS prerequisites plus a passing Storage smoke test.`);
}

async function main(): Promise<void> {
  const { command, flags } = parseFlags(process.argv.slice(2));
  if (hasFlag(flags, 'help') || command === 'help') {
    printHelp();
    return;
  }
  if (command === 'readiness-fingerprint') {
    console.log(JSON.stringify(await workingTreeFingerprint(), null, 2));
    return;
  }
  if (command === 'owner-review') {
    const reportPath = flag(flags, 'report');
    if (!reportPath) throw new Error('owner-review requires --report <migration-report.json>.');
    const outputPath = resolve(flag(flags, 'out') ?? 'migration-reports/nextx-owner-review.csv');
    const csv = ownerReviewCsv(await readJson(resolve(reportPath)));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, csv, 'utf8');
    const rowCount = csv.split('\r\n').filter(Boolean).length - 1;
    console.log(`Owner review sheet written with ${rowCount} non-informational findings: ${outputPath}`);
    return;
  }
  if (command === 'snapshot') {
    // Freezes the read-only source into one JSON export, so later phases can
    // run where the source credentials are not available (the self-hosted
    // VPS) and every phase plans from the same checksum.
    const url = databaseUrl(flags, 'source');
    if (!url) throw new Error('snapshot requires NEXTX_SOURCE_DATABASE_URL.');
    const outputPath = resolve(flag(flags, 'out') ?? 'migration-reports/nextx-source-snapshot.json');
    const raw = (await loadSourceFromDatabase(url)) as Record<string, unknown>;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(raw), { encoding: 'utf8', mode: 0o600 });
    const rows = Object.entries(raw)
      .filter(([, value]) => Array.isArray(value))
      .reduce((total, [, value]) => total + (value as unknown[]).length, 0);
    console.log(`Source snapshot written (${rows} rows, values omitted): ${outputPath}`);
    return;
  }
  if (!['inspect', 'media-audit', 'media-prepare', 'dry-run', 'migrate', 'validate'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const source = await loadSource(flags);
  if (command === 'media-audit') {
    console.log(`Source input: ${source.descriptor}`);
    await auditLegacyMediaSources(source.raw);
    return;
  }
  if (command === 'media-prepare') {
    console.log(`Source input: ${source.descriptor}`);
    await prepareLegacyMedia(
      source.raw,
      flag(flags, 'out') ?? 'migration-reports/nextx-media-map.json',
      flag(flags, 'target-environment') ?? undefined,
      flag(flags, 'confirm-safe-target') ?? undefined,
      flag(flags, 'media-preparation-report') ?? undefined,
    );
    return;
  }
  let migrationInput = source.raw;
  const mediaMapPath = flag(flags, 'media-map');
  if (mediaMapPath) {
    const mediaMap = await readJson(resolve(mediaMapPath));
    if (!migrationInput || typeof migrationInput !== 'object' || Array.isArray(migrationInput)) {
      throw new Error('Source snapshot must be an object to attach the validated media map.');
    }
    const sourceSnapshot = migrationInput as Record<string, unknown>;
    const metadata = sourceSnapshot.metadata && typeof sourceSnapshot.metadata === 'object' && !Array.isArray(sourceSnapshot.metadata)
      ? sourceSnapshot.metadata as Record<string, unknown>
      : {};
    migrationInput = { ...sourceSnapshot, metadata: { ...metadata, nextxMediaMap: mediaMap } };
  }
  const plan = buildMigrationPlan(migrationInput);
  console.log(`Source input: ${source.descriptor}`);
  console.log(summaryText(plan));
  if (command === 'inspect') {
    const tableCounts = plan.snapshot.metadata.sourceTableCounts;
    if (tableCounts && typeof tableCounts === 'object' && !Array.isArray(tableCounts)) {
      console.log('Count-only source table inventory:');
      for (const [table, count] of Object.entries(tableCounts).sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`  ${table}: ${String(count)}`);
      }
    }
    const conflictGroups = new Map<string, number>();
    for (const conflict of plan.conflicts) {
      const key = `${conflict.severity.toUpperCase()} ${conflict.kind} / ${conflict.entityType}`;
      conflictGroups.set(key, (conflictGroups.get(key) ?? 0) + 1);
    }
    if (conflictGroups.size > 0) {
      console.log('Conflict categories (sensitive row values omitted):');
      for (const [conflict, count] of [...conflictGroups].sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`  ${conflict}: ${count}`);
      }
    }
    return;
  }
  const reportPath = await writeReport(plan, command, flag(flags, 'out'));
  console.log(`Machine-readable report: ${reportPath}`);
  if (command === 'dry-run') {
    const validation = offlineValidation(plan);
    console.log(`Offline validation: ${String(validation.status)}`);
    if (hasFatalConflicts(plan)) throw new Error('Dry-run found fatal conflicts; destination was not touched. Resolve the report before migrating.');
    if (validation.status !== 'pass') throw new Error('Dry-run failed offline validation; destination was not touched. Resolve the report before migrating.');
    return;
  }
  if (command === 'validate') {
    const destinationUrl = databaseUrl(flags, 'destination');
    if (!destinationUrl) {
      console.log(JSON.stringify(offlineValidation(plan), null, 2));
      return;
    }
    const client = await openDestination(flags);
    try {
      const preflight = await destinationPreflight(client);
      const aliases = await resolveDestinationAliases(client, plan);
      if (aliases.length > 0) {
        console.log(`Destination aliases resolved: ${aliases.join(', ')}`);
        await writeReport(plan, command, reportPath);
      }
      const validation = await onlineValidation(client, plan);
      console.log(JSON.stringify({ preflight, validation }, null, 2));
      if (validation.status !== 'pass') throw new Error('Online validation found destination count mismatches.');
    } finally {
      await client.end({ timeout: 5 });
    }
    return;
  }
  if (hasFatalConflicts(plan)) throw new Error('Migration refused: resolve fatal dry-run conflicts first.');
  const validation = offlineValidation(plan);
  if (validation.status !== 'pass') throw new Error('Migration refused: offline validation did not pass. Run the dry-run report and resolve the listed mismatches first.');
  if (!isIsolatedRehearsalTarget(flags)) {
    const readinessReportPath = flag(flags, 'readiness-report');
    if (!readinessReportPath) {
      throw new Error('Migration writes require --readiness-report with every required gate set to PASS.');
    }
    const { fingerprint } = await workingTreeFingerprint();
    assertReadinessReport(await readJson(resolve(readinessReportPath)), fingerprint);
  }
  const client = await openDestination(flags);
  try {
    const preflight = await destinationPreflight(client);
    const aliases = await resolveDestinationAliases(client, plan);
    if (aliases.length > 0) {
      console.log(`Destination aliases resolved: ${aliases.join(', ')}`);
      await writeReport(plan, command, reportPath);
    }
    console.log(`Destination preflight: ${JSON.stringify(preflight)}`);
    const result = await applyPlan(client, plan);
    console.log(`Migration applied in ${result.batches} logical batches (${result.operations} operations).`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
