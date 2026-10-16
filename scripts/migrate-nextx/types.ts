export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type LegacyRow = Record<string, unknown>;

export type LegacyEntity =
  | 'companies'
  | 'users'
  | 'locations'
  | 'categories'
  | 'items'
  | 'comboItems'
  | 'stock'
  | 'stockTransfers'
  | 'exchangeRates'
  | 'clients'
  | 'reservations'
  | 'sales'
  | 'saleItems'
  | 'salePayments'
  | 'saleRefunds'
  | 'wallets'
  | 'expenses'
  | 'recurringExpenses'
  | 'expenseCategories'
  | 'walletTransactions'
  | 'financeLedgerEntries'
  | 'walletReconciliations'
  | 'invoices'
  | 'invoiceSequences'
  | 'financeObligations'
  | 'storeSettings'
  | 'sellers'
  | 'sellerCategoryRates'
  | 'commissions'
  | 'payoutRuns'
  | 'budgets'
  | 'activityLogs'
  | 'notifications'
  | 'purchaseOrders'
  | 'purchaseOrderItems';

export type DestinationEntity =
  | 'locations'
  | 'categories'
  | 'products'
  | 'product_variants'
  | 'product_images'
  | 'price_lists'
  | 'price_list_items'
  | 'bundles'
  | 'bundle_components'
  | 'storefronts'
  | 'storefront_products'
  | 'storefront_locations'
  | 'customers'
  | 'sellers'
  | 'seller_category_rates'
  | 'commissions'
  | 'commission_payouts'
  | 'sales'
  | 'sale_items'
  | 'sale_refunds'
  | 'sale_payments'
  | 'wallets'
  | 'wallet_transfers'
  | 'ledger_entries'
  | 'expenses'
  | 'recurring_expenses'
  | 'expense_categories'
  | 'fx_rates'
  | 'reconciliations'
  | 'inventory_movements'
  | 'inventory_reservations'
  | 'activity_logs'
  | 'document_sequences'
  | 'finance_obligations'
  | 'legacy_store_settings'
  | 'legacy_catalog_price_archive'
  | 'legacy_payout_run_archive'
  | 'legacy_stock_transfer_archive'
  | 'legacy_reservation_archive'
  | 'settings';

export type MigrationAction = 'DIRECT' | 'TRANSFORM' | 'DERIVE' | 'MERGE' | 'DROP' | 'DEFER';
export type ConflictSeverity = 'fatal' | 'warning' | 'info';

export interface LegacySnapshot {
  metadata: LegacyRow;
  companies: LegacyRow[];
  users: LegacyRow[];
  locations: LegacyRow[];
  categories: LegacyRow[];
  items: LegacyRow[];
  comboItems: LegacyRow[];
  stock: LegacyRow[];
  stockTransfers: LegacyRow[];
  exchangeRates: LegacyRow[];
  clients: LegacyRow[];
  reservations: LegacyRow[];
  sales: LegacyRow[];
  saleItems: LegacyRow[];
  salePayments: LegacyRow[];
  saleRefunds: LegacyRow[];
  wallets: LegacyRow[];
  expenses: LegacyRow[];
  recurringExpenses: LegacyRow[];
  expenseCategories: LegacyRow[];
  walletTransactions: LegacyRow[];
  financeLedgerEntries: LegacyRow[];
  walletReconciliations: LegacyRow[];
  invoices: LegacyRow[];
  invoiceSequences: LegacyRow[];
  financeObligations: LegacyRow[];
  storeSettings: LegacyRow[];
  sellers: LegacyRow[];
  sellerCategoryRates: LegacyRow[];
  commissions: LegacyRow[];
  payoutRuns: LegacyRow[];
  budgets: LegacyRow[];
  activityLogs: LegacyRow[];
  notifications: LegacyRow[];
  purchaseOrders: LegacyRow[];
  purchaseOrderItems: LegacyRow[];
}

export interface Conflict {
  severity: ConflictSeverity;
  kind: string;
  entityType: LegacyEntity | string;
  entityKey?: string;
  message: string;
  details?: Record<string, JsonValue>;
}

export interface MappingRecord {
  sourceSystem: string;
  entityType: LegacyEntity | string;
  legacyId: string;
  destinationEntity: DestinationEntity | string | null;
  destinationId: string | null;
  action: MigrationAction;
  note?: string;
}

export interface MigrationOperation {
  table: DestinationEntity;
  values: Record<string, JsonValue | undefined>;
  conflictTarget: string[];
  group: string;
  sourceType: LegacyEntity | string;
  sourceId: string;
  action: MigrationAction;
}

export interface CurrencyTotals {
  [currency: string]: {
    sourceCents: string;
    operationCents: string;
  };
}

export interface MigrationSummary {
  sourceRows: Record<string, number>;
  transformableRows: Record<string, number>;
  skippedRows: Record<string, number>;
  operationRows: Record<string, number>;
  conflictCounts: Record<ConflictSeverity, number>;
}

export interface MigrationPlan {
  sourceSystem: string;
  sourceSchemaVersion: string;
  sourceExportedAt: string | null;
  sourceChecksum: string;
  snapshot: LegacySnapshot;
  mappings: MappingRecord[];
  operations: MigrationOperation[];
  conflicts: Conflict[];
  summary: MigrationSummary;
  currencyTotals: CurrencyTotals;
  expected: {
    inventory: Record<string, { variantKey: string; locationKey: string; quantity: string }>;
    orders: Record<string, { totalCents: string; currency: string }>;
    payments: Record<string, { amountCents: string; currency: string }>;
    wallets: Record<string, { balanceCents: string; currency: string }>;
    invoices: Record<string, { number: string; totalCents: string; currency: string }>;
  };
}

export const EMPTY_SNAPSHOT: LegacySnapshot = {
  metadata: {},
  companies: [],
  users: [],
  locations: [],
  categories: [],
  items: [],
  comboItems: [],
  stock: [],
  stockTransfers: [],
  exchangeRates: [],
  clients: [],
  reservations: [],
  sales: [],
  saleItems: [],
  salePayments: [],
  saleRefunds: [],
  wallets: [],
  expenses: [],
  recurringExpenses: [],
  expenseCategories: [],
  walletTransactions: [],
  financeLedgerEntries: [],
  walletReconciliations: [],
  invoices: [],
  invoiceSequences: [],
  financeObligations: [],
  storeSettings: [],
  sellers: [],
  sellerCategoryRates: [],
  commissions: [],
  payoutRuns: [],
  budgets: [],
  activityLogs: [],
  notifications: [],
  purchaseOrders: [],
  purchaseOrderItems: [],
};

const ENTITY_ALIASES: Record<keyof LegacySnapshot, string[]> = {
  metadata: ['metadata', 'meta'],
  companies: ['companies', 'company'],
  users: ['users', 'user'],
  locations: ['locations', 'location'],
  categories: ['categories', 'category'],
  items: ['items', 'item', 'products'],
  comboItems: ['comboItems', 'combo_items', 'combo_items_combo_items'],
  stock: ['stock', 'stocks'],
  stockTransfers: ['stockTransfers', 'stock_transfers'],
  exchangeRates: ['exchangeRates', 'exchange_rates'],
  clients: ['clients', 'client', 'customers'],
  reservations: ['reservations', 'reservation'],
  sales: ['sales', 'sale', 'orders', 'order'],
  saleItems: ['saleItems', 'sale_items', 'orderItems', 'order_items'],
  salePayments: ['salePayments', 'sale_payments', 'payments'],
  saleRefunds: ['saleRefunds', 'sale_refunds', 'refunds'],
  wallets: ['wallets', 'wallet'],
  expenses: ['expenses', 'expense'],
  recurringExpenses: ['recurringExpenses', 'recurring_expenses'],
  expenseCategories: ['expenseCategories', 'expense_categories'],
  walletTransactions: ['walletTransactions', 'wallet_transactions'],
  financeLedgerEntries: [
    'financeLedgerEntries',
    'finance_ledger_entries',
    'ledgerEntries',
    'ledger_entries',
  ],
  walletReconciliations: ['walletReconciliations', 'wallet_reconciliations', 'reconciliations'],
  invoices: ['invoices', 'invoice'],
  invoiceSequences: ['invoiceSequences', 'invoice_sequences', 'invoiceSequence', 'invoice_sequence'],
  financeObligations: ['financeObligations', 'finance_obligations'],
  storeSettings: ['storeSettings', 'store_settings'],
  sellers: ['sellers', 'seller'],
  sellerCategoryRates: ['sellerCategoryRates', 'seller_category_rates'],
  commissions: ['commissions', 'commission'],
  payoutRuns: ['payoutRuns', 'payout_runs'],
  budgets: ['budgets', 'budget'],
  activityLogs: ['activityLogs', 'activity_logs'],
  notifications: ['notifications', 'userNotifications', 'user_notifications'],
  purchaseOrders: ['purchaseOrders', 'purchase_orders'],
  purchaseOrderItems: ['purchaseOrderItems', 'purchase_order_items'],
};

function asRecord(value: unknown): LegacyRow {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LegacyRow)
    : {};
}

function findValue(source: LegacyRow, names: string[]): unknown {
  for (const name of names) {
    if (name in source) return source[name];
  }
  return undefined;
}

function sourceRows(raw: LegacyRow, names: string[]): LegacyRow[] {
  const value = findValue(raw, names);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is LegacyRow => Boolean(entry) && typeof entry === 'object');
}

/** Accepts Prisma-shaped camelCase exports and raw snake_case JSON exports. */
export function normalizeSnapshot(raw: unknown): LegacySnapshot {
  const source = asRecord(raw);
  const metadata = asRecord(findValue(source, ENTITY_ALIASES.metadata));
  const snapshot = { ...EMPTY_SNAPSHOT, metadata };

  for (const key of Object.keys(ENTITY_ALIASES) as (keyof LegacySnapshot)[]) {
    if (key === 'metadata') continue;
    snapshot[key] = sourceRows(source, ENTITY_ALIASES[key]);
  }

  return snapshot;
}

export function rowValue(row: LegacyRow, ...names: string[]): unknown {
  for (const name of names) {
    if (name in row) return row[name];
  }
  return undefined;
}

export function rowString(row: LegacyRow, ...names: string[]): string | null {
  const value = rowValue(row, ...names);
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result === '' ? null : result;
}

export function rowBoolean(row: LegacyRow, ...names: string[]): boolean | null {
  const value = rowValue(row, ...names);
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 't', '1', 'yes', 'active'].includes(normalized)) return true;
  if (['false', 'f', '0', 'no', 'inactive'].includes(normalized)) return false;
  return null;
}

export function rowNumber(row: LegacyRow, ...names: string[]): number | null {
  const value = rowValue(row, ...names);
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function rowId(row: LegacyRow): string | null {
  return rowString(row, 'id', 'legacyId', 'legacy_id', 'key', 'uuid');
}

export function sourceMetadata(snapshot: LegacySnapshot): {
  sourceSystem: string;
  sourceSchemaVersion: string;
  sourceExportedAt: string | null;
} {
  return {
    sourceSystem: rowString(snapshot.metadata, 'sourceSystem', 'source_system') ?? 'nextx',
    sourceSchemaVersion:
      rowString(snapshot.metadata, 'schemaVersion', 'schema_version') ?? 'prisma-main',
    sourceExportedAt: rowString(snapshot.metadata, 'exportedAt', 'exported_at'),
  };
}
