import { sql } from 'drizzle-orm';
import { consumeStock, type Valuation } from '@/lib/costing';
import type { RateMicros } from '@/lib/fx';
import { normaliseToUsd } from '@/lib/fx';
import type { Cents, CurrencyCode } from '@/lib/money';
import type { db as database } from '../db/client';
import {
  activityLogs,
  type documentKind,
  inventoryMovements,
  type ledgerCategory,
  ledgerEntries,
  type movementKind,
  type paymentMethod,
  wallets,
} from '../db/schema';
import { ActionError } from '../errors';

/**
 * Posting.
 *
 * Documents (a purchase order, a sale) are what people create. Movements (stock
 * in, cash out) are what those documents *mean*. Nothing outside this file
 * writes to `inventory_movements` or `ledger_entries`, so a movement always
 * carries the document that caused it and the ledger cannot drift from the
 * paperwork — the exact failure the spreadsheet has.
 *
 * Every function here takes a transaction, never `db`. Receiving an order that
 * half-posted would be worse than one that failed outright.
 */

export type Tx = Parameters<Parameters<typeof database.transaction>[0]>[0];

type DocumentKind = (typeof documentKind.enumValues)[number];
type LedgerCategory = (typeof ledgerCategory.enumValues)[number];
type MovementKind = (typeof movementKind.enumValues)[number];
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];

/* ── Document numbering ──────────────────────────────────────────────────── */

/**
 * Next gapless number in a series: `PO-002`, `V014`.
 *
 * Bumped inside the caller's transaction, so a rollback un-bumps it. A Postgres
 * SEQUENCE cannot do this — it is non-transactional and leaves holes, and a
 * purchase order series with gaps is the first thing an auditor asks about.
 */
export async function nextDocumentNumber(
  tx: Tx,
  prefix: 'PO-' | 'V' | 'INV-' | 'QT-' | 'ORD-',
): Promise<string> {
  const rows = await tx.execute<{ next_document_number: string }>(
    sql`SELECT private.next_document_number(${prefix}) AS next_document_number`,
  );
  const value = rows[0]?.next_document_number;
  if (!value) throw new Error(`Could not allocate a number for series ${prefix}`);
  return value;
}

/* ── Stock ───────────────────────────────────────────────────────────────── */

/**
 * Current weighted-average position for a variant, locked for update.
 *
 * `FOR UPDATE` on the movement rows is what stops two concurrent sales reading
 * the same average and both writing a cost based on stock only one of them can
 * have. Without it, selling the last two units from two browser tabs
 * double-counts the cost.
 */
export async function lockValuation(tx: Tx, variantId: string): Promise<Valuation> {
  await lockVariant(tx, variantId);
  await tx.execute(
    sql`SELECT 1 FROM inventory_movements WHERE variant_id = ${variantId} FOR UPDATE`,
  );

  const rows = await tx.execute<{ quantity: string; value_cents: string }>(sql`
    SELECT COALESCE(SUM(quantity), 0)::text    AS quantity,
           COALESCE(SUM(value_cents), 0)::text AS value_cents
      FROM inventory_movements
     WHERE variant_id = ${variantId}
  `);

  return {
    quantity: Number(rows[0]?.quantity ?? 0),
    valueCents: Number(rows[0]?.value_cents ?? 0),
  };
}

/** Lock a variant even when it has no movement rows yet. Callers that touch
 * several variants should call this for sorted ids first to avoid deadlocks. */
export async function lockVariant(tx: Tx, variantId: string): Promise<void> {
  await tx.execute(sql`SELECT id FROM product_variants WHERE id = ${variantId} FOR UPDATE`);
}

export type StockPosting = {
  variantId: string;
  locationId?: string | null;
  kind: MovementKind;
  /** Signed: positive adds to stock, negative removes. */
  quantity: number;
  /** Signed cost movement, same sign convention as quantity. */
  valueCents: Cents;
  sourceKind: DocumentKind;
  /** Null for a manual adjustment, which has no document behind it. Matches
   *  the nullable column, and `LedgerPosting.sourceId` already allows null. */
  sourceId: string | null;
  occurredAt: Date;
  note?: string;
  memberId: string;
};

export async function postStockMovement(tx: Tx, posting: StockPosting): Promise<void> {
  await tx.insert(inventoryMovements).values({
    variantId: posting.variantId,
    kind: posting.kind,
    quantity: posting.quantity,
    valueCents: posting.valueCents,
    sourceKind: posting.sourceKind,
    sourceId: posting.sourceId,
    occurredAt: posting.occurredAt,
    note: posting.note ?? null,
    createdById: posting.memberId,
    locationId: posting.locationId ?? null,
  });
}

/**
 * Take `quantity` units out of stock at weighted-average cost.
 *
 * Returns the cost consumed and how many units were uncovered. Overselling is
 * permitted deliberately: stock is sometimes sold before its receipt is
 * entered, and refusing to record a sale that actually happened teaches people
 * to work around the system. The shortfall is reported instead.
 */
export async function consumeStockFor(
  tx: Tx,
  input: {
    variantId: string;
    quantity: number;
    locationId?: string | null;
    sourceKind: DocumentKind;
    sourceId: string;
    occurredAt: Date;
    memberId: string;
    note?: string;
  },
): Promise<{ cogsCents: Cents; shortfall: number }> {
  const valuation = await lockValuation(tx, input.variantId);
  const { cogsCents, shortfall } = consumeStock(valuation, input.quantity);

  await postStockMovement(tx, {
    variantId: input.variantId,
    kind: 'sale',
    quantity: -input.quantity,
    valueCents: -cogsCents,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    locationId: input.locationId ?? null,
    occurredAt: input.occurredAt,
    note: input.note,
    memberId: input.memberId,
  });

  return { cogsCents, shortfall };
}

/* ── Cash ────────────────────────────────────────────────────────────────── */

export type LedgerPosting = {
  direction: 'in' | 'out';
  category: LedgerCategory;
  description: string;
  currency: CurrencyCode;
  rateMicros: RateMicros;
  /** Always positive. Direction carries the sign. */
  amountCents: Cents;
  paymentMethod: PaymentMethod;
  occurredAt: Date;
  memberId: string | null;
  /** The owner a contribution or draw belongs to. */
  principalId?: string | null;
  walletId?: string | null;
  locationId?: string | null;
  storefrontId?: string | null;
  correlationId?: string | null;
  eventType?: string;
  sourceKind?: DocumentKind;
  sourceId?: string | null;
  reversalOfId?: string | null;
  notes?: string | null;
};

export async function postLedgerEntry(tx: Tx, posting: LedgerPosting): Promise<void> {
  if (posting.amountCents <= 0) {
    throw new Error('Ledger amounts must be greater than zero; direction carries the sign.');
  }

  if (posting.walletId) {
    const [wallet] = await tx
      .select({ id: wallets.id, currency: wallets.currency, active: wallets.active })
      .from(wallets)
      .where(sql`${wallets.id} = ${posting.walletId}`)
      .limit(1);
    if (!wallet) throw new ActionError('That wallet no longer exists.');
    if (!wallet.active) throw new ActionError('The selected wallet is inactive.');
    if (wallet.currency !== posting.currency) {
      throw new ActionError(
        `The wallet holds ${wallet.currency} but this is a ${posting.currency} amount. Choose a ${posting.currency} wallet.`,
      );
    }
  }

  await tx.insert(ledgerEntries).values({
    direction: posting.direction,
    category: posting.category,
    description: posting.description,
    currency: posting.currency,
    fxRateMicros: posting.rateMicros,
    amountCents: posting.amountCents,
    amountUsdCents: normaliseToUsd(posting.amountCents, posting.currency, posting.rateMicros),
    memberId: posting.principalId ?? null,
    walletId: posting.walletId ?? null,
    locationId: posting.locationId ?? null,
    storefrontId: posting.storefrontId ?? null,
    correlationId: posting.correlationId ?? null,
    eventType: posting.eventType ?? 'legacy',
    sourceKind: posting.sourceKind ?? 'manual',
    sourceId: posting.sourceId ?? null,
    reversalOfId: posting.reversalOfId ?? null,
    paymentMethod: posting.paymentMethod,
    occurredAt: posting.occurredAt,
    notes: posting.notes ?? null,
    createdById: posting.memberId,
  });
}

/** Resolve the configured default wallet for legacy payment forms. The form
 * still captures a payment method, while the posting always identifies the
 * actual wallet once the finance migration is installed. */
export async function defaultWalletFor(
  tx: Tx,
  input: { currency: CurrencyCode; method: PaymentMethod },
): Promise<string | null> {
  const [exact] = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(
      sql`${wallets.currency} = ${input.currency}::currency_code
        AND ${wallets.kind} = ${input.method}
        AND ${wallets.active} = true`,
    )
    .limit(1);
  if (exact) return exact.id;

  const [fallback] = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(
      sql`${wallets.currency} = ${input.currency}::currency_code AND ${wallets.active} = true`,
    )
    .orderBy(wallets.createdAt)
    .limit(1);
  return fallback?.id ?? null;
}

/** Derived balance in one wallet. No counter is stored or incremented. */
export async function walletBalanceCents(tx: Tx, walletId: string): Promise<Cents> {
  const [row] = await tx.execute<{ balance: string }>(sql`
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE -amount_cents END), 0)::text AS balance
      FROM ledger_entries
     WHERE wallet_id = ${walletId}
  `);
  return Number(row?.balance ?? 0);
}

/**
 * Remove the cash entries a document previously posted.
 *
 * Used when a document is edited or voided and its postings need to be
 * replaced. `ledger_entries` has no DELETE policy for `authenticated`, but this
 * runs as `postgres`, which is exactly why it lives here behind a narrow
 * signature rather than being available to any call site.
 */
export async function clearDocumentPostings(
  tx: Tx,
  sourceKind: DocumentKind,
  sourceId: string,
): Promise<void> {
  await tx.execute(
    sql`DELETE FROM ledger_entries WHERE source_kind = ${sourceKind} AND source_id = ${sourceId}`,
  );
  await tx.execute(
    sql`DELETE FROM inventory_movements WHERE source_kind = ${sourceKind} AND source_id = ${sourceId}`,
  );
}

/* ── Audit ───────────────────────────────────────────────────────────────── */

export async function logActivity(
  tx: Tx,
  input: {
    memberId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    diff?: Record<string, { from: unknown; to: unknown }> | null;
  },
): Promise<void> {
  await tx.insert(activityLogs).values({
    actorId: input.memberId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    entityLabel: input.entityLabel ?? null,
    diff: input.diff ?? null,
  });
}
