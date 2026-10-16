import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  currencyCode,
  documentKind,
  ledgerCategory,
  ledgerDirection,
  paymentMethod,
  recurringExpenseCadence,
} from './enums';
import { members } from './identity';
import { locations } from './locations';

/** A real place money can sit. Balances are always derived from ledger rows. */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    /** cash, bank, card, or another business-controlled store of value. */
    kind: text().notNull().default('cash'),
    currency: currencyCode().notNull(),
    locationId: uuid().references(() => locations.id, { onDelete: 'set null' }),
    active: boolean().notNull().default(true),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wallets_name_currency_key').on(t.name, t.currency),
    index('wallets_active_idx').on(t.active, t.currency),
    index('wallets_location_idx').on(t.locationId),
  ],
);

/** A same-currency movement between two wallets. Its two ledger rows share a
 * correlation id, so the transfer is one business event, not two unrelated
 * manual movements. */
export const walletTransfers = pgTable(
  'wallet_transfers',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceWalletId: uuid()
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    destinationWalletId: uuid()
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    amountCents: bigint({ mode: 'number' }).notNull(),
    currency: currencyCode().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    correlationId: uuid().notNull().defaultRandom(),
    idempotencyKey: text(),
    note: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wallet_transfers_idempotency_key').on(t.idempotencyKey),
    index('wallet_transfers_occurred_idx').on(t.occurredAt.desc()),
    index('wallet_transfers_correlation_idx').on(t.correlationId),
    index('wallet_transfers_source_idx').on(t.sourceWalletId),
    index('wallet_transfers_destination_idx').on(t.destinationWalletId),
  ],
);

/** A statement checkpoint. Reconciliation never rewrites ledger history; it
 * records what was checked, when, and what still needs attention. */
export const reconciliations = pgTable(
  'reconciliations',
  {
    id: uuid().primaryKey().defaultRandom(),
    walletId: uuid()
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    periodEnd: timestamp({ withTimezone: true }).notNull(),
    statementBalanceCents: bigint({ mode: 'number' }).notNull(),
    status: text().notNull().default('open'),
    notes: text(),
    completedAt: timestamp({ withTimezone: true }),
    completedById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reconciliations_wallet_period_idx').on(t.walletId, t.periodEnd.desc()),
    index('reconciliations_status_idx').on(t.status, t.periodEnd.desc()),
  ],
);

/**
 * Versioned exchange rates. Never updated in place: a new rate is a new row
 * with a later effectiveFrom, so any historical amount can be re-derived.
 */
export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid().primaryKey().defaultRandom(),
    base: text().notNull().default('USD'),
    quote: text().notNull().default('SRD'),
    /** Rate x 1_000_000. 38.5 SRD per USD is stored as 38_500_000. */
    rateMicros: bigint({ mode: 'number' }).notNull(),
    effectiveFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    source: text().notNull().default('manual'),
    note: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fx_rates_pair_effective_key').on(t.base, t.quote, t.effectiveFrom),
    index('fx_rates_effective_idx').on(t.effectiveFrom.desc()),
    index('fx_rates_created_by_idx').on(t.createdById),
  ],
);

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('expense_categories_slug_key').on(t.slug)],
);

/**
 * A repeatable operating cost. Each due period is posted through the ordinary
 * expense and cash-ledger path, with a unique period key preventing duplicate
 * charges when a scheduler retries or two runs overlap.
 */
export const recurringExpenses = pgTable(
  'recurring_expenses',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    vendorName: text().notNull(),
    amountCents: bigint({ mode: 'number' }).notNull(),
    currency: currencyCode().notNull().default('USD'),
    cadence: recurringExpenseCadence().notNull().default('monthly'),
    anchorDay: integer().notNull().default(1),
    walletId: uuid().references(() => wallets.id, { onDelete: 'restrict' }),
    locationId: uuid().references(() => locations.id, { onDelete: 'set null' }),
    categoryId: uuid().references(() => expenseCategories.id, { onDelete: 'set null' }),
    nextRunOn: date({ mode: 'string' }).notNull(),
    lastPostedAt: timestamp({ withTimezone: true }),
    lastAttemptAt: timestamp({ withTimezone: true }),
    lastError: text(),
    isActive: boolean().notNull().default(true),
    autoPost: boolean().notNull().default(true),
    amountIsEstimated: boolean().notNull().default(false),
    anchorDayIsEstimated: boolean().notNull().default(false),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recurring_expenses_due_idx').on(t.isActive, t.autoPost, t.nextRunOn),
    index('recurring_expenses_wallet_idx').on(t.walletId),
    index('recurring_expenses_category_idx').on(t.categoryId),
  ],
);

/** Running costs that are not the cost of goods: ads, tools, transport. */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid().primaryKey().defaultRandom(),
    description: text().notNull(),
    vendorName: text(),
    classification: text().notNull().default('unclassified'),
    needsReview: boolean().notNull().default(false),
    reviewReason: text(),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewedById: uuid().references(() => members.id, { onDelete: 'set null' }),
    /** Source account IDs are retained for imported review history; auth users are invited separately. */
    reviewedByLegacyId: text(),
    categoryId: uuid().references(() => expenseCategories.id, { onDelete: 'set null' }),
    recurringExpenseId: uuid().references(() => recurringExpenses.id, { onDelete: 'set null' }),
    periodKey: text(),

    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),
    amountCents: bigint({ mode: 'number' }).notNull().default(0),
    amountUsdCents: bigint({ mode: 'number' }).notNull().default(0),

    paymentMethod: paymentMethod().notNull().default('cash'),
    walletId: uuid().references(() => wallets.id, { onDelete: 'set null' }),
    locationId: uuid().references(() => locations.id, { onDelete: 'set null' }),
    storefrontId: uuid(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    receiptNumber: text(),
    /** Kept null for private receipts; signed links are generated on demand. */
    receiptUrl: text(),
    receiptPathname: text(),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('expenses_occurred_idx').on(t.occurredAt.desc()),
    index('expenses_category_idx').on(t.categoryId),
    index('expenses_created_by_idx').on(t.createdById),
    index('expenses_wallet_idx').on(t.walletId, t.occurredAt.desc()),
    index('expenses_location_idx').on(t.locationId, t.occurredAt.desc()),
    uniqueIndex('expenses_recurring_period_unique')
      .on(t.recurringExpenseId, t.periodKey)
      .where(sql`${t.recurringExpenseId} IS NOT NULL AND ${t.periodKey} IS NOT NULL`),
  ],
);

/**
 * A durable, non-destructive record of a data exception found during
 * reconciliation. These rows document what needs a human decision; they never
 * pretend to be a receipt, payment, or stock movement.
 */
export const reconciliationExceptions = pgTable(
  'reconciliation_exceptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    entityType: text().notNull(),
    entityKey: text().notNull(),
    severity: text().notNull().default('warning'),
    status: text().notNull().default('open'),
    description: text().notNull(),
    detectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolutionNotes: text(),
    resolvedById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reconciliation_exception_key').on(t.kind, t.entityType, t.entityKey, t.status),
    index('reconciliation_exception_status_idx').on(t.status, t.detectedAt.desc()),
    index('reconciliation_exception_resolved_by_idx').on(t.resolvedById),
  ],
);

/**
 * The cash ledger. APPEND ONLY.
 *
 * Every movement of money lands here exactly once. Entries caused by a
 * document (a purchase order being paid, a sale being collected) are posted by
 * the system from that document and carry sourceKind and sourceId, which is
 * what stops the ledger drifting away from the documents it describes. The
 * spreadsheet posts these by hand and has already drifted: PO-001 is booked at
 * 294.75 against a purchase order totalling 147.74.
 *
 * The running balance is not stored. It is a window function over this table,
 * so it cannot go stale.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Monotonic insertion order. `created_at` is the TRANSACTION timestamp in
     *  Postgres, so several entries posted together share it exactly and
     *  cannot break their own tie. A running balance ordered on a tie is
     *  nondeterministic, so the ledger carries its own sequence. */
    seq: bigserial({ mode: 'number' }).notNull(),
    direction: ledgerDirection().notNull(),
    category: ledgerCategory().notNull().default('other'),
    description: text().notNull(),

    currency: currencyCode().notNull().default('USD'),
    fxRateMicros: bigint({ mode: 'number' }).notNull().default(1_000_000),
    /** Always positive. Direction carries the sign. */
    amountCents: bigint({ mode: 'number' }).notNull(),
    amountUsdCents: bigint({ mode: 'number' }).notNull(),

    /** Set on owner contributions and draws; drives the equity split. */
    memberId: uuid().references(() => members.id, { onDelete: 'set null' }),

    /** Finance attribution. These are nullable for legacy rows and imports. */
    walletId: uuid().references(() => wallets.id, { onDelete: 'set null' }),
    locationId: uuid().references(() => locations.id, { onDelete: 'set null' }),
    storefrontId: uuid(),
    correlationId: uuid(),
    eventType: text().notNull().default('legacy'),

    sourceKind: documentKind().notNull().default('manual'),
    sourceId: uuid(),
    /** One reversal per original entry; corrections never erase history. */
    reversalOfId: uuid(),

    paymentMethod: paymentMethod().notNull().default('cash'),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ledger_entries_occurred_idx').on(t.occurredAt.desc(), t.seq.desc()),
    uniqueIndex('ledger_entries_seq_key').on(t.seq),
    index('ledger_entries_category_idx').on(t.category),
    index('ledger_entries_member_idx').on(t.memberId),
    index('ledger_entries_created_by_idx').on(t.createdById),
    index('ledger_entries_source_idx').on(t.sourceKind, t.sourceId),
    index('ledger_entries_wallet_idx').on(t.walletId, t.occurredAt.desc()),
    index('ledger_entries_attribution_idx').on(t.locationId, t.storefrontId),
    index('ledger_entries_correlation_idx').on(t.correlationId),
    index('ledger_entries_event_type_idx').on(t.eventType, t.occurredAt.desc()),
    uniqueIndex('ledger_entries_reversal_key').on(t.reversalOfId),
  ],
);

/** A manually issued receivable or payable that is not backed by a sale or
 * purchase order. Historical paid amounts are snapshots; future cash events
 * must be posted through the ordinary wallet ledger. */
export const financeObligations = pgTable(
  'finance_obligations',
  {
    id: uuid().primaryKey().defaultRandom(),
    direction: text().notNull(),
    counterpartyName: text().notNull(),
    locationId: uuid().references(() => locations.id, { onDelete: 'set null' }),
    currency: currencyCode().notNull(),
    originalAmountCents: bigint({ mode: 'number' }).notNull(),
    paidAmountCents: bigint({ mode: 'number' }).notNull().default(0),
    status: text().notNull().default('open'),
    dueDate: date({ mode: 'string' }),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    notes: text(),
    sourceType: text(),
    sourceId: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('finance_obligations_direction_status_idx').on(t.direction, t.status),
    index('finance_obligations_location_idx').on(t.locationId),
    index('finance_obligations_due_idx').on(t.dueDate),
    index('finance_obligations_issued_idx').on(t.issuedAt.desc()),
  ],
);

/** Append-only settlement events for manually issued receivables and payables.
 * Each event pairs a wallet-backed ledger entry with its source document. */
export const financeObligationPayments = pgTable(
  'finance_obligation_payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    obligationId: uuid()
      .notNull()
      .references(() => financeObligations.id, { onDelete: 'restrict' }),
    walletId: uuid()
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    amountCents: bigint({ mode: 'number' }).notNull(),
    currency: currencyCode().notNull(),
    paymentMethod: paymentMethod().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    correlationId: uuid().notNull().defaultRandom(),
    idempotencyKey: text().notNull(),
    notes: text(),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('finance_obligation_payments_idempotency_key').on(t.idempotencyKey),
    index('finance_obligation_payments_obligation_idx').on(t.obligationId, t.occurredAt.desc()),
    index('finance_obligation_payments_wallet_idx').on(t.walletId, t.occurredAt.desc()),
    index('finance_obligation_payments_correlation_idx').on(t.correlationId),
  ],
);
