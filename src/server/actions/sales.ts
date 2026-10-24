'use server';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { netLineTotals } from '@/lib/commission-rules';
import { returnedPortion } from '@/lib/costing';
import type { RateMicros } from '@/lib/fx';
import { normaliseToUsd } from '@/lib/fx';
import { alreadySubmittedMessage, isSameSubmission } from '@/lib/idempotent-replay';
import type { Cents, CurrencyCode } from '@/lib/money';
import { formatMoney } from '@/lib/money';
import { balanceCentsOf, paymentStatusOf } from '@/lib/payment-status';
import {
  type ReservedStockLine,
  type ReservedStockPosition,
  reservedStockConflicts,
  reservedStockRefusal,
} from '@/lib/reserved-stock';
import {
  isRepeatedReturn,
  RETURN_DUPLICATE_WINDOW_SECONDS,
  unitsByVariant,
} from '@/lib/return-duplicate';
import {
  moneyInput,
  optionalUuid,
  quantity,
  salePaymentSchema,
  saleRefundSchema,
  saleSchema,
  uuid,
} from '@/lib/schemas';
import { db } from '../db/client';
import {
  bundleComponents,
  bundles,
  inventoryReservations,
  ledgerEntries,
  orderFulfillments,
  products,
  productVariants,
  saleItemComponents,
  saleItemSerials,
  saleItems,
  salePayments,
  saleRefunds,
  sales,
  wallets,
} from '../db/schema';
import {
  cancelOpenCommissionsForSale,
  createSaleCommissions,
  netOpenCommissionsForReturns,
} from '../services/commissions';
import {
  clearDocumentPostings,
  consumeStockFor,
  defaultWalletFor,
  lockValuation,
  lockVariant,
  logActivity,
  nextDocumentNumber,
  type PaymentMethod as PaymentMethodName,
  postLedgerEntry,
  postStockMovement,
  type Tx,
  walletBelowZero,
} from '../services/posting';
import { rateForRecord, rateOn } from '../services/rates';
import { heldOnSale, lockSale, paidOnSale, refundedOnSale } from '../services/sale-money';
import { ActionError, writeAction } from './client';

/**
 * Recording a sale is the highest-frequency action in the system, and the one
 * with the most consequences: it moves stock, fixes the cost of goods at the
 * weighted average in force *at that moment*, computes margin, and posts cash.
 *
 * All of it happens in one transaction. A sale that moved stock but never
 * posted its receipt would be worse than one that failed outright, because
 * nobody would notice until the books stopped balancing.
 */

/**
 * Record money received against a sale and post its receipt (F-4).
 *
 * The ledger entry is tagged with the *payment's* id, not the sale's. That is
 * deliberate: `clearDocumentPostings(tx, 'sale', saleId)` removes what a sale
 * posted whenever it is edited or voided, and receipts for money that actually
 * arrived must survive that. The payment row and its receipt are created and
 * destroyed together, so derived `paid` can never disagree with banked cash.
 */
async function insertPayment(
  tx: Tx,
  input: {
    saleId: string;
    number: string;
    amountCents: Cents;
    currency: CurrencyCode;
    rateMicros: RateMicros;
    method: PaymentMethodName;
    receivedAt: Date;
    memberId: string;
    notes?: string | null;
    idempotencyKey?: string;
    walletId?: string | null;
    locationId?: string | null;
    storefrontId?: string | null;
  },
): Promise<{ id: string; amountCents: Cents; reused: boolean }> {
  if (input.amountCents <= 0) throw new ActionError('A payment must be more than zero.');

  if (input.idempotencyKey) {
    const [existing] = await tx
      .select({ id: salePayments.id, amountCents: salePayments.amountCents })
      .from(salePayments)
      .where(
        and(
          eq(salePayments.saleId, input.saleId),
          eq(salePayments.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return { id: existing.id, amountCents: existing.amountCents, reused: true };
  }

  const [saleContext] = await tx
    .select({ locationId: sales.locationId, storefrontId: sales.storefrontId })
    .from(sales)
    .where(eq(sales.id, input.saleId))
    .limit(1);
  const walletId =
    input.walletId ??
    (await defaultWalletFor(tx, { currency: input.currency, method: input.method }));
  // How the customer paid follows where the money landed: a transfer into the
  // bank wallet is a bank transfer, whatever the sale form's method said.
  let method = input.method;
  if (input.walletId) {
    const [chosen] = await tx
      .select({ kind: wallets.kind })
      .from(wallets)
      .where(eq(wallets.id, input.walletId))
      .limit(1);
    if (chosen) method = chosen.kind as PaymentMethodName;
  }

  const [payment] = await tx
    .insert(salePayments)
    .values({
      saleId: input.saleId,
      amountCents: input.amountCents,
      currency: input.currency,
      fxRateMicros: input.rateMicros,
      method,
      walletId,
      receivedAt: input.receivedAt,
      notes: input.notes ?? null,
      memberId: input.memberId,
      createdById: input.memberId,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();

  if (!payment) throw new ActionError('Could not record the payment.');

  await postLedgerEntry(tx, {
    direction: 'in',
    category: 'sales_receipt',
    description: `${input.number} · payment`,
    currency: input.currency,
    rateMicros: input.rateMicros,
    amountCents: input.amountCents,
    paymentMethod: method,
    occurredAt: input.receivedAt,
    memberId: input.memberId,
    sourceKind: 'sale',
    sourceId: payment.id,
    walletId,
    locationId: input.locationId ?? saleContext?.locationId ?? null,
    storefrontId: input.storefrontId ?? saleContext?.storefrontId ?? null,
    eventType: 'sale_payment',
  });

  return { id: payment.id, amountCents: input.amountCents, reused: false };
}

/** An order (stock reserved, fulfilled later) has its own workflow. Running it
 *  through the direct-sale actions would move stock without its reservations. */
async function assertNotFulfillmentOrder(tx: Tx, saleId: string): Promise<void> {
  const [fulfillment] = await tx
    .select({ id: orderFulfillments.id })
    .from(orderFulfillments)
    .where(eq(orderFulfillments.orderId, saleId))
    .limit(1);
  if (fulfillment) {
    throw new ActionError(
      'This record is an order with a fulfilment. Confirm, complete or cancel it from Orders so its stock reservation stays consistent.',
    );
  }
}

/** A client-supplied wallet must be able to hold this sale's money. */
async function assertWalletFor(
  tx: Tx,
  walletId: string | null | undefined,
  currency: CurrencyCode,
): Promise<void> {
  if (!walletId) return;
  const [wallet] = await tx
    .select({ currency: wallets.currency, active: wallets.active, name: wallets.name })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .limit(1);
  if (!wallet) throw new ActionError('That wallet no longer exists.');
  if (!wallet.active)
    throw new ActionError(`${wallet.name} is inactive. Choose another wallet.`);
  if (wallet.currency !== currency) {
    throw new ActionError(
      `${wallet.name} holds ${wallet.currency}, but this sale is in ${currency}. Choose a ${currency} wallet.`,
    );
  }
}

async function assertSellableVariants(tx: Tx, variantIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(variantIds)];
  const rows = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        inArray(productVariants.id, uniqueIds),
        eq(productVariants.isActive, true),
        sql`${products.status} <> 'archived'`,
      ),
    );
  if (rows.length !== uniqueIds.length) {
    throw new ActionError('Every sale item must be an active product variant.');
  }
}

/** Confirming a saved draft: the same sellable rule `createSale` applies, with a message that tells
 *  the cashier what to do about a draft rather than about a new sale. */
async function assertDraftStillSellable(
  tx: Tx,
  variantIds: string[],
  bundleIds: string[],
): Promise<void> {
  const unsellable =
    'A product or bundle on this draft has been archived or switched off since it was saved. Edit the draft to replace it, then confirm.';
  try {
    await assertSellableVariants(tx, variantIds);
  } catch (error) {
    if (error instanceof ActionError) throw new ActionError(unsellable);
    throw error;
  }
  const uniqueBundles = [...new Set(bundleIds)];
  if (uniqueBundles.length === 0) return;
  const active = await tx
    .select({ id: bundles.id })
    .from(bundles)
    .where(and(inArray(bundles.id, uniqueBundles), eq(bundles.isActive, true)));
  if (active.length !== uniqueBundles.length) throw new ActionError(unsellable);
}

async function lockSaleVariants(tx: Tx, variantIds: string[]): Promise<void> {
  for (const variantId of [...new Set(variantIds)].sort()) await lockVariant(tx, variantId);
}

type ResolvedBundle = {
  id: string;
  name: string;
  sku: string;
  components: {
    variantId: string;
    quantity: number;
    productName: string;
    variantName: string;
    sku: string;
    weightGrams: number;
  }[];
};

async function resolveBundle(tx: Tx, bundleId: string): Promise<ResolvedBundle> {
  const [header] = await tx
    .select({ id: bundles.id, name: bundles.name, sku: bundles.sku })
    .from(bundles)
    .where(and(eq(bundles.id, bundleId), eq(bundles.isActive, true)))
    .limit(1);
  if (!header) throw new ActionError('That bundle is inactive or no longer exists.');
  const components = await tx
    .select({
      variantId: bundleComponents.variantId,
      quantity: bundleComponents.quantity,
      productName: bundleComponents.productName,
      variantName: bundleComponents.variantName,
      sku: bundleComponents.sku,
      weightGrams: bundleComponents.weightGrams,
      active: productVariants.isActive,
      productStatus: products.status,
    })
    .from(bundleComponents)
    .innerJoin(productVariants, eq(productVariants.id, bundleComponents.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(bundleComponents.bundleId, bundleId))
    .orderBy(bundleComponents.position);
  if (
    components.length === 0 ||
    components.some((component) => !component.active || component.productStatus === 'archived')
  ) {
    throw new ActionError('Every bundle component must be an active product.');
  }
  return {
    ...header,
    components: components.map(
      ({ active: _active, productStatus: _status, ...component }) => component,
    ),
  };
}

async function resolveSaleBundles(tx: Tx, items: { bundleId?: string | null }[]) {
  const map = new Map<string, ResolvedBundle>();
  for (const bundleId of items
    .map((item) => item.bundleId)
    .filter((id): id is string => Boolean(id))) {
    if (!map.has(bundleId)) map.set(bundleId, await resolveBundle(tx, bundleId));
  }
  return map;
}

async function createSaleLine(
  tx: Tx,
  input: {
    saleId: string;
    number: string;
    soldAt: Date;
    currency: CurrencyCode;
    rateMicros: RateMicros;
    memberId: string;
    item: {
      variantId: string;
      bundleId?: string | null;
      quantity: number;
      unitPriceCents: Cents;
      serials: string[];
    };
    bundle?: ResolvedBundle;
    confirm: boolean;
    position: number;
  },
): Promise<{ totalCents: Cents; totalUsdCents: Cents; cogsCents: Cents; shortfall: number }> {
  const lineTotalCents = input.item.unitPriceCents * input.item.quantity;
  const lineTotalUsdCents = normaliseToUsd(lineTotalCents, input.currency, input.rateMicros);
  const unitPriceUsdCents = normaliseToUsd(
    input.item.unitPriceCents,
    input.currency,
    input.rateMicros,
  );
  const components = input.bundle?.components ?? [
    {
      variantId: input.item.variantId,
      quantity: 1,
      productName: '',
      variantName: '',
      sku: '',
      weightGrams: 0,
    },
  ];
  const [variantSnapshot] = await tx
    .select({
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, input.item.variantId))
    .limit(1);
  let cogsCents = 0;
  let shortfall = 0;
  const allocations: { component: (typeof components)[number]; cogsCents: Cents }[] = [];
  if (input.confirm) {
    for (const component of components) {
      const consumed = await consumeStockFor(tx, {
        variantId: component.variantId,
        quantity: input.item.quantity * component.quantity,
        sourceKind: 'sale',
        sourceId: input.saleId,
        occurredAt: input.soldAt,
        memberId: input.memberId,
        note: `${input.number}${input.bundle ? ` · ${input.bundle.sku}` : ''} at weighted-average landed cost.`,
      });
      cogsCents += consumed.cogsCents;
      shortfall += consumed.shortfall;
      if (input.bundle) allocations.push({ component, cogsCents: consumed.cogsCents });
    }
  }
  const [line] = await tx
    .insert(saleItems)
    .values({
      saleId: input.saleId,
      variantId: input.bundle?.components[0]?.variantId ?? input.item.variantId,
      bundleId: input.bundle?.id ?? null,
      bundleName: input.bundle?.name ?? null,
      bundleSku: input.bundle?.sku ?? null,
      quantity: input.item.quantity,
      productNameSnapshot: input.bundle?.name ?? variantSnapshot?.productName ?? null,
      variantNameSnapshot: input.bundle?.sku ?? variantSnapshot?.variantName ?? null,
      skuSnapshot: input.bundle?.sku ?? variantSnapshot?.sku ?? null,
      unitPriceCents: input.item.unitPriceCents,
      lineTotalCents,
      unitPriceUsdCents,
      lineTotalUsdCents,
      cogsCents,
      shortfall,
      position: input.position,
    })
    .returning({ id: saleItems.id });
  if (!line) throw new ActionError('Could not create the sale line.');
  if (input.bundle) {
    await tx.insert(saleItemComponents).values(
      input.bundle.components.map((component, index) => ({
        saleItemId: line.id,
        variantId: component.variantId,
        quantityPerBundle: component.quantity,
        quantity: input.item.quantity * component.quantity,
        productName: component.productName,
        variantName: component.variantName,
        sku: component.sku,
        weightGrams: component.weightGrams,
        cogsCents: allocations[index]?.cogsCents ?? 0,
      })),
    );
  }
  if (input.item.serials.length > 0) {
    await tx
      .insert(saleItemSerials)
      .values(input.item.serials.map((serial) => ({ saleItemId: line.id, serial })));
  }
  return { totalCents: lineTotalCents, totalUsdCents: lineTotalUsdCents, cogsCents, shortfall };
}

const returnItemsSchema = z
  .array(z.object({ saleItemId: uuid, quantity }))
  .min(1, 'Return at least one unit')
  .superRefine((items, ctx) => {
    const ids = new Set(items.map((item) => item.saleItemId));
    if (ids.size !== items.length) {
      ctx.addIssue({ code: 'custom', message: 'Choose each sale line only once.' });
    }
  });
type SaleInput = z.infer<typeof saleSchema>;

/**
 * Refuse a confirmed sale that would sell units open orders are waiting for.
 *
 * Orders reserve stock without moving it, and completing an order needs those units on hand. A direct
 * sale only sees physical stock, so without this it could take them and leave a confirmed order
 * impossible to complete. Called with the variants already locked, so the figures cannot change under
 * it (confirming an order takes the same locks). Selling past unreserved stock stays allowed: that is
 * the existing shortfall flow. The owner may override on purpose; the override is written to the
 * activity log.
 */
async function assertReservedStockRespected(
  tx: Tx,
  input: {
    lines: { variantId: string; quantity: number }[];
    override: boolean;
    member: { id: string; role: string };
    saleId: string;
    saleNumber: string;
  },
): Promise<void> {
  const quantities = new Map<string, number>();
  for (const line of input.lines) {
    quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  }
  if (quantities.size === 0) return;
  const ids = [...quantities.keys()];
  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const rows = await tx.execute<{
    variant_id: string;
    label: string;
    on_hand: string;
    reserved: string;
  }>(sql`
    SELECT v.id::text AS variant_id,
           p.name || ' · ' || v.name AS label,
           COALESCE((SELECT SUM(m.quantity) FROM inventory_movements m WHERE m.variant_id = v.id), 0)::text AS on_hand,
           COALESCE((
             SELECT SUM(r.quantity) FROM inventory_reservations r
              WHERE r.variant_id = v.id AND r.status = 'active'
                AND (r.expires_at IS NULL OR r.expires_at > now())
           ), 0)::text AS reserved
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
     WHERE v.id IN (${idList})
  `);

  const positions = new Map<string, ReservedStockPosition>();
  const lines: ReservedStockLine[] = [];
  for (const row of rows) {
    positions.set(row.variant_id, {
      onHand: Number(row.on_hand),
      reserved: Number(row.reserved),
    });
    lines.push({
      variantId: row.variant_id,
      label: row.label,
      quantity: quantities.get(row.variant_id) ?? 0,
    });
  }

  const conflicts = reservedStockConflicts(lines, positions);
  const refusal = reservedStockRefusal(conflicts, {
    override: input.override,
    isOwner: input.member.role === 'owner',
  });
  if (refusal) throw new ActionError(refusal);
  if (conflicts.length > 0) {
    await logActivity(tx, {
      memberId: input.member.id,
      action: 'sold reserved stock (owner override)',
      entityType: 'sale',
      entityId: input.saleId,
      entityLabel: input.saleNumber,
    });
  }
}

/** What a sale (bundles broken into their components) takes of each variant. */
function unitsTakenBySale(
  items: SaleInput['items'],
  bundleMap: Map<string, ResolvedBundle>,
): { variantId: string; quantity: number }[] {
  return items.flatMap((item) => {
    const bundle = item.bundleId ? bundleMap.get(item.bundleId) : undefined;
    const quantity = Number(item.quantity);
    return bundle
      ? bundle.components.map((component) => ({
          variantId: component.variantId,
          quantity: quantity * component.quantity,
        }))
      : [{ variantId: item.variantId, quantity }];
  });
}

/**
 * Everything the two write paths (a new sale, an edited draft) have in common:
 * lines, totals, commissions and the money that arrived with the sale.
 *
 * One body means a fix to the arithmetic cannot land in one path and miss the
 * other, which is exactly how the old copy-pasted pair drifted.
 */
async function writeSaleBody(
  tx: Tx,
  input: {
    saleId: string;
    number: string;
    sale: SaleInput;
    memberId: string;
    rateMicros: RateMicros;
    bundleMap: Map<string, ResolvedBundle>;
  },
): Promise<{
  totalCents: Cents;
  totalUsdCents: Cents;
  cogsCents: Cents;
  shortfallTotal: number;
}> {
  const { sale } = input;
  let grossCents = 0;
  let cogsCents = 0;
  let shortfallTotal = 0;

  for (const [index, item] of sale.items.entries()) {
    const line = await createSaleLine(tx, {
      saleId: input.saleId,
      number: input.number,
      soldAt: sale.soldAt,
      currency: sale.currency,
      rateMicros: input.rateMicros,
      memberId: input.memberId,
      item,
      bundle: item.bundleId ? input.bundleMap.get(item.bundleId) : undefined,
      confirm: sale.confirm,
      position: index + 1,
    });
    grossCents += line.totalCents;
    cogsCents += line.cogsCents;
    shortfallTotal += line.shortfall;
  }

  // The discount is subtracted from the document, never from the lines:
  // `sale_items` keeps what each product was charged at so price
  // realisation stays measurable, while `total_*` is what is payable and
  // what the receipt posts for.
  const totalCents = grossCents - sale.discountCents;
  if (totalCents < 0)
    throw new ActionError('The discount cannot exceed the total of the items.');
  // Converted once for the whole document, with the same function a receipt
  // uses. Summing per-line conversions drifted from the receipt by a cent or
  // two on SRD sales, so revenue and the cash that paid for it disagreed.
  const totalUsdCents = normaliseToUsd(totalCents, sale.currency, input.rateMicros);

  await tx
    .update(sales)
    .set({
      totalCents,
      totalUsdCents,
      discountCents: sale.discountCents,
      discountReason: sale.discountReason ?? null,
      cogsCents,
      grossProfitCents: totalUsdCents - cogsCents,
      workflowStatus: sale.confirm ? 'completed' : 'draft',
    })
    .where(eq(sales.id, input.saleId));

  if (sale.confirm) await createSaleCommissions(tx, input.saleId, input.memberId);

  // A draft has not happened yet, so it moves no cash. A confirmed sale whose
  // money has not arrived posts nothing either (F-4): the balance stays
  // receivable until each payment banks its own receipt. Every amount that did
  // arrive, including a paid-in-full sale, goes through insertPayment so the
  // payment row and its ledger receipt cannot drift.
  if (sale.confirm) {
    const paidNow = sale.paidInFull ? totalCents : Math.min(sale.paidNowCents ?? 0, totalCents);
    if (paidNow > 0 && totalCents > 0) {
      await insertPayment(tx, {
        saleId: input.saleId,
        number: `${input.number}${sale.customerId || !sale.paidInFull ? '' : ' (walk-in)'}`,
        amountCents: paidNow,
        currency: sale.currency,
        rateMicros: input.rateMicros,
        method: sale.paymentMethod,
        receivedAt: sale.soldAt,
        memberId: input.memberId,
        walletId: sale.walletId ?? null,
      });
    }
  }

  return { totalCents, totalUsdCents, cogsCents, shortfallTotal };
}

async function sellableIdsOf(tx: Tx, items: SaleInput['items']) {
  const bundleMap = await resolveSaleBundles(tx, items);
  const sellableIds = items.flatMap((item) => {
    const bundle = item.bundleId ? bundleMap.get(item.bundleId) : undefined;
    return bundle
      ? bundle.components.map((component) => component.variantId)
      : [item.variantId];
  });
  return { bundleMap, sellableIds };
}

export const createSale = writeAction
  .metadata({ action: 'created', entity: 'sale' })
  .inputSchema(saleSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      // A retried or double-clicked submit carries the same key. The advisory
      // lock makes the second request wait for the first to commit, then find
      // its sale instead of recording (and charging stock for) another one.
      if (input.idempotencyKey) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sale:${input.idempotencyKey}`}, 0))`,
        );
        const [existing] = await tx
          .select({
            id: sales.id,
            number: sales.number,
            totalUsdCents: sales.totalUsdCents,
            cogsCents: sales.cogsCents,
            status: sales.status,
            currency: sales.currency,
            customerId: sales.customerId,
            discountCents: sales.discountCents,
          })
          .from(sales)
          .where(eq(sales.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (existing) {
          // The key outlives the page when the browser restores it (Back), so a
          // hit is only a replay if the stored sale is what was asked for now.
          const storedLines = await tx
            .select({
              variantId: saleItems.variantId,
              bundleId: saleItems.bundleId,
              quantity: saleItems.quantity,
              unitPriceCents: saleItems.unitPriceCents,
            })
            .from(saleItems)
            .where(eq(saleItems.saleId, existing.id));
          const sameSubmission = isSameSubmission(
            {
              status: existing.status,
              currency: existing.currency,
              customerId: existing.customerId,
              discountCents: existing.discountCents,
              lines: storedLines.map((line) => ({
                ref: line.bundleId ?? line.variantId,
                quantity: line.quantity,
                unitPriceCents: line.unitPriceCents,
              })),
            },
            {
              status: input.confirm ? 'confirmed' : 'draft',
              currency: input.currency,
              customerId: input.customerId ?? null,
              discountCents: input.discountCents,
              lines: input.items.map((item) => ({
                ref: item.bundleId ?? item.variantId,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
              })),
            },
          );
          if (!sameSubmission) throw new ActionError(alreadySubmittedMessage('sale'));
          const [short] = await tx.execute<{ units: string }>(
            sql`SELECT COALESCE(SUM(shortfall), 0)::text AS units FROM sale_items WHERE sale_id = ${existing.id}`,
          );
          return {
            id: existing.id,
            number: existing.number,
            totalUsdCents: existing.totalUsdCents,
            cogsCents: existing.cogsCents,
            shortfallTotal: Number(short?.units ?? 0),
            reused: true as const,
          };
        }
      }

      const { bundleMap, sellableIds } = await sellableIdsOf(tx, input.items);
      await assertSellableVariants(tx, sellableIds);
      await lockSaleVariants(tx, sellableIds);
      await assertWalletFor(tx, input.walletId, input.currency);
      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.soldAt, tx)
          : await rateForRecord(input.soldAt, tx);

      const number = await nextDocumentNumber(tx, 'V');

      const [sale] = await tx
        .insert(sales)
        .values({
          number,
          customerId: input.customerId,
          sellerId: input.sellerId ?? null,
          status: input.confirm ? 'confirmed' : 'draft',
          workflowStatus: input.confirm ? 'completed' : 'draft',
          source: 'manual',
          currency: input.currency,
          fxRateMicros: rateMicros,
          paymentMethod: input.paymentMethod,
          soldAt: input.soldAt,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
          idempotencyKey: input.idempotencyKey ?? null,
          // Issued with the sale, so a paid-in-full sale leaves with an invoice
          // number the same way a confirmed draft does.
          invoiceNumber: input.confirm ? await nextDocumentNumber(tx, 'INV-') : null,
        })
        .returning();

      if (!sale) throw new ActionError('Could not create the sale.');

      if (input.confirm) {
        await assertReservedStockRespected(tx, {
          lines: unitsTakenBySale(input.items, bundleMap),
          override: input.allowReservedStock,
          member: ctx.member,
          saleId: sale.id,
          saleNumber: number,
        });
      }

      const totals = await writeSaleBody(tx, {
        saleId: sale.id,
        number,
        sale: input,
        memberId: ctx.member.id,
        rateMicros,
        bundleMap,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.confirm ? 'confirmed sale' : 'drafted sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: number,
      });

      return {
        id: sale.id,
        number,
        totalUsdCents: totals.totalUsdCents,
        cogsCents: totals.cogsCents,
        shortfallTotal: totals.shortfallTotal,
        reused: false as const,
      };
    });

    return result;
  });

/**
 * Edit a draft.
 *
 * Refused for anything else: a confirmed sale has already moved stock and
 * cash at a specific cost and rate, and rewriting its lines would rewrite a
 * margin someone has already relied on. The correction for a confirmed sale
 * is `voidSale`, the same principle `reverseLedgerEntry` uses — a mistake
 * gets undone, not erased.
 *
 * Otherwise this runs exactly `createSale`'s logic — recompute totals, and if
 * `confirm` is set, consume stock and post the receipt — starting from the
 * existing row's id instead of creating a new one. A draft has posted nothing
 * yet, so replacing its line items outright is safe.
 */
export const updateSale = writeAction
  .metadata({ action: 'updated', entity: 'sale' })
  .inputSchema(saleSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.id);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'draft') {
        // A double click on "Save and confirm" lands here for the second
        // request, once the first has committed.
        throw new ActionError(
          sale.status === 'confirmed'
            ? 'This sale is already confirmed. A confirmed sale cannot be edited — void it and record the correction.'
            : 'A void sale cannot be edited.',
        );
      }
      await assertNotFulfillmentOrder(tx, sale.id);

      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.soldAt, tx)
          : await rateForRecord(input.soldAt, tx);

      // A draft has posted no stock and no cash, so there is nothing to
      // unwind — this only guards the case of a leftover posting. Payments are
      // checked because their receipts are tagged with the payment's own id
      // and would survive that cleanup: money on a draft means something went
      // wrong earlier, and silently orphaning it is worse than refusing.
      if ((await paidOnSale(tx, input.id)) > 0) {
        throw new ActionError(
          'Money has already been recorded against this sale. Void it and record the correction instead.',
        );
      }
      const { bundleMap, sellableIds } = await sellableIdsOf(tx, input.items);
      await assertSellableVariants(tx, sellableIds);
      await lockSaleVariants(tx, sellableIds);
      await assertWalletFor(tx, input.walletId, input.currency);
      if (input.confirm) {
        await assertReservedStockRespected(tx, {
          lines: unitsTakenBySale(input.items, bundleMap),
          override: input.allowReservedStock,
          member: ctx.member,
          saleId: input.id,
          saleNumber: sale.number,
        });
      }
      await clearDocumentPostings(tx, 'sale', input.id);
      await tx.delete(saleItems).where(eq(saleItems.saleId, input.id));

      await tx
        .update(sales)
        .set({
          customerId: input.customerId,
          sellerId: input.sellerId ?? null,
          status: input.confirm ? 'confirmed' : 'draft',
          currency: input.currency,
          fxRateMicros: rateMicros,
          paymentMethod: input.paymentMethod,
          soldAt: input.soldAt,
          notes: input.notes ?? null,
          invoiceNumber: input.confirm
            ? (sale.invoiceNumber ?? (await nextDocumentNumber(tx, 'INV-')))
            : sale.invoiceNumber,
          updatedAt: new Date(),
        })
        .where(eq(sales.id, input.id));

      const totals = await writeSaleBody(tx, {
        saleId: input.id,
        number: sale.number,
        sale: input,
        memberId: ctx.member.id,
        rateMicros,
        bundleMap,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.confirm ? 'confirmed sale' : 'updated draft sale',
        entityType: 'sale',
        entityId: input.id,
        entityLabel: sale.number,
      });

      return {
        id: input.id,
        number: sale.number,
        totalUsdCents: totals.totalUsdCents,
        cogsCents: totals.cogsCents,
        shortfallTotal: totals.shortfallTotal,
      };
    });

    return result;
  });

/**
 * Confirm a draft sale: this is when it actually happens.
 *
 * `paidInFull` decides what happens to the money (F-4). A full payment and a
 * deposit both become payment rows with their own ledger receipt. "Later"
 * posts nothing: stock moves and margin books, but the cash stays receivable
 * until each payment arrives.
 */
export const confirmSale = writeAction
  .metadata({ action: 'confirmed', entity: 'sale' })
  .inputSchema(
    z.object({
      id: uuid,
      paidInFull: z.boolean().default(true),
      /** Only meaningful with `paidInFull: false`; clamped below the total by
       *  the code below, because the total lives in the database, not here. */
      paidNowCents: moneyInput.default(0),
      /** Where the money lands; empty means the wallet matching the method. */
      walletId: optionalUuid.optional(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.id);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'draft') {
        throw new ActionError(
          sale.status === 'confirmed'
            ? `${sale.number} is already confirmed.`
            : `${sale.number} is void and cannot be confirmed.`,
        );
      }
      await assertNotFulfillmentOrder(tx, sale.id);
      await assertWalletFor(tx, input.walletId, sale.currency);

      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
      if (items.length === 0) {
        throw new ActionError('Add at least one item before confirming this sale.');
      }
      const componentRows = await tx
        .select()
        .from(saleItemComponents)
        .where(
          inArray(
            saleItemComponents.saleItemId,
            items.map((item) => item.id),
          ),
        );
      const componentsByLine = new Map<string, typeof componentRows>();
      for (const component of componentRows)
        componentsByLine.set(component.saleItemId, [
          ...(componentsByLine.get(component.saleItemId) ?? []),
          component,
        ]);
      const draftVariantIds = items.flatMap(
        (item) =>
          componentsByLine.get(item.id)?.map((component) => component.variantId) ?? [
            item.variantId,
          ],
      );
      await lockSaleVariants(tx, draftVariantIds);
      // A draft can sit for days. Whatever was archived or switched off since it
      // was saved must not go through just because the draft already names it.
      await assertDraftStillSellable(
        tx,
        draftVariantIds,
        items.flatMap((item) => (item.bundleId ? [item.bundleId] : [])),
      );

      await assertReservedStockRespected(tx, {
        lines: items.flatMap(
          (item) =>
            componentsByLine.get(item.id)?.map((component) => ({
              variantId: component.variantId,
              quantity: component.quantity,
            })) ?? [{ variantId: item.variantId, quantity: item.quantity }],
        ),
        // No override here: the owner records a knowing exception from the sale form.
        override: false,
        member: ctx.member,
        saleId: sale.id,
        saleNumber: sale.number,
      });

      let cogsCents = 0;

      for (const item of items) {
        const components = componentsByLine.get(item.id);
        const consumedRows: {
          component: NonNullable<typeof components>[number];
          consumed: { cogsCents: Cents; shortfall: number };
        }[] = [];
        if (components?.length) {
          for (const component of components) {
            consumedRows.push({
              component,
              consumed: await consumeStockFor(tx, {
                variantId: component.variantId,
                quantity: component.quantity,
                sourceKind: 'sale',
                sourceId: sale.id,
                occurredAt: sale.soldAt,
                memberId: ctx.member.id,
                note: `${sale.number} · ${item.bundleSku ?? 'bundle'} at weighted-average landed cost.`,
              }),
            });
          }
        }
        const consumed = consumedRows.length
          ? {
              cogsCents: consumedRows.reduce((sum, row) => sum + row.consumed.cogsCents, 0),
              shortfall: consumedRows.reduce((sum, row) => sum + row.consumed.shortfall, 0),
            }
          : await consumeStockFor(tx, {
              variantId: item.variantId,
              quantity: item.quantity,
              sourceKind: 'sale',
              sourceId: sale.id,
              occurredAt: sale.soldAt,
              memberId: ctx.member.id,
              note: `${sale.number} at weighted-average landed cost.`,
            });

        if (consumedRows.length) {
          for (const row of consumedRows) {
            await tx
              .update(saleItemComponents)
              .set({ cogsCents: row.consumed.cogsCents })
              .where(eq(saleItemComponents.id, row.component.id));
          }
        }

        await tx
          .update(saleItems)
          .set({ cogsCents: consumed.cogsCents, shortfall: consumed.shortfall })
          .where(eq(saleItems.id, item.id));

        cogsCents += consumed.cogsCents;
      }

      await tx
        .update(sales)
        .set({
          status: 'confirmed',
          workflowStatus: 'completed',
          invoiceNumber: sale.invoiceNumber ?? (await nextDocumentNumber(tx, 'INV-')),
          cogsCents,
          grossProfitCents: sale.totalUsdCents - cogsCents,
        })
        .where(eq(sales.id, sale.id));

      await createSaleCommissions(tx, sale.id, ctx.member.id);

      const alreadyPaid = await paidOnSale(tx, sale.id);
      const paidNow = Math.min(
        input.paidInFull ? sale.totalCents : input.paidNowCents + alreadyPaid,
        sale.totalCents,
      );

      if (paidNow >= sale.totalCents && alreadyPaid === 0 && sale.totalCents > 0) {
        await insertPayment(tx, {
          saleId: sale.id,
          number: sale.number,
          amountCents: sale.totalCents,
          currency: sale.currency,
          rateMicros: sale.fxRateMicros,
          method: sale.paymentMethod,
          receivedAt: sale.soldAt,
          memberId: ctx.member.id,
          walletId: input.walletId ?? null,
        });
      } else if (paidNow > alreadyPaid) {
        await insertPayment(tx, {
          saleId: sale.id,
          number: sale.number,
          amountCents: paidNow - alreadyPaid,
          currency: sale.currency,
          rateMicros: sale.fxRateMicros,
          method: sale.paymentMethod,
          receivedAt: sale.soldAt,
          memberId: ctx.member.id,
          walletId: input.walletId ?? null,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.paidInFull ? 'confirmed sale' : 'confirmed sale on credit',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });

      return sale.number;
    });

    return { number };
  });

/**
 * Record money received against a sale (F-4).
 *
 * Overpaying is refused rather than rounded down: an extra cent in the ledger
 * that matches no invoice is exactly the drift this whole system exists to
 * prevent, and the cashier can look at the balance shown beside the form and
 * type what was actually handed over.
 */
export const recordSalePayment = writeAction
  .metadata({ action: 'recorded', entity: 'sale_payment' })
  .inputSchema(salePaymentSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError(
          sale.status === 'draft'
            ? 'A draft has not happened yet — confirm it before collecting money on it.'
            : 'That sale is void; nothing is owed on it.',
        );
      }

      if (input.idempotencyKey) {
        const [existing] = await tx
          .select({ amountCents: salePayments.amountCents })
          .from(salePayments)
          .where(
            and(
              eq(salePayments.saleId, sale.id),
              eq(salePayments.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          const paid = await paidOnSale(tx, sale.id);
          return {
            number: sale.number,
            currency: sale.currency,
            amountCents: existing.amountCents,
            paymentStatus: paymentStatusOf(sale.totalCents, paid),
            balanceCents: balanceCentsOf(sale.totalCents, paid),
          };
        }
      }

      const alreadyPaid = await paidOnSale(tx, sale.id);
      const balance = balanceCentsOf(sale.totalCents, alreadyPaid);
      if (balance <= 0) throw new ActionError('That sale is already paid in full.');
      if (input.amountCents > balance) {
        throw new ActionError(
          `That is more than the outstanding balance (${formatMoney(balance, sale.currency)}).`,
        );
      }

      const payment = await insertPayment(tx, {
        saleId: sale.id,
        number: sale.number,
        amountCents: input.amountCents,
        currency: sale.currency,
        rateMicros: sale.fxRateMicros,
        method: input.paymentMethod,
        receivedAt: input.receivedAt ?? new Date(),
        memberId: ctx.member.id,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
        walletId: input.walletId,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'recorded payment on sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
        diff: {
          paid_cents: { from: alreadyPaid, to: alreadyPaid + input.amountCents },
        },
      });

      const paid = alreadyPaid + payment.amountCents;
      return {
        number: sale.number,
        currency: sale.currency,
        amountCents: payment.amountCents,
        paymentStatus: paymentStatusOf(sale.totalCents, paid),
        balanceCents: balanceCentsOf(sale.totalCents, paid),
      };
    });

    return result;
  });

/** Void a payment after review. The payment row remains as evidence and its
 * receipt is reversed in the append-only ledger. */
export const voidSalePayment = writeAction
  .metadata({ action: 'voided', entity: 'sale payment' })
  .inputSchema(z.object({ id: uuid, reason: z.string().trim().min(3).max(500) }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [located] = await tx
        .select({ saleId: salePayments.saleId })
        .from(salePayments)
        .where(eq(salePayments.id, input.id))
        .limit(1);
      if (!located) throw new ActionError('That payment no longer exists.');
      // Same lock every other money action on this sale takes, so two people
      // voiding the same payment (or a payment and a refund) serialise instead
      // of both reading the pre-void state and reversing the receipt twice.
      const sale = await lockSale(tx, located.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      const [payment] = await tx
        .select()
        .from(salePayments)
        .where(eq(salePayments.id, input.id))
        .limit(1);
      if (!payment) throw new ActionError('That payment no longer exists.');
      if (payment.status === 'voided') throw new ActionError('That payment is already void.');

      const held = await heldOnSale(tx, sale.id);
      if (held - payment.amountCents < 0) {
        throw new ActionError(
          'Part of this payment was already refunded to the customer. Voiding it would leave more refunded than received.',
        );
      }

      const entries = await tx
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.sourceKind, 'sale'),
            eq(ledgerEntries.sourceId, payment.id),
            eq(ledgerEntries.category, 'sales_receipt'),
            isNull(ledgerEntries.reversalOfId),
          ),
        );
      if (entries.length === 0)
        throw new ActionError('That payment has no posted receipt to void.');
      for (const entry of entries) {
        const [reversal] = await tx
          .select({ id: ledgerEntries.id })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.reversalOfId, entry.id))
          .limit(1);
        if (!reversal) {
          await postLedgerEntry(tx, {
            direction: entry.direction === 'in' ? 'out' : 'in',
            category: entry.category,
            description: `Void ${entry.description}`,
            currency: entry.currency,
            rateMicros: entry.fxRateMicros,
            amountCents: entry.amountCents,
            paymentMethod: entry.paymentMethod,
            occurredAt: new Date(),
            memberId: ctx.member.id,
            principalId: entry.memberId,
            walletId: entry.walletId,
            locationId: entry.locationId,
            storefrontId: entry.storefrontId,
            reversalOfId: entry.id,
            // Linked to the payment so every reader that follows
            // sale_payments -> ledger_entries nets the reversal against the
            // receipt instead of missing it. (Void payments are also excluded
            // by status in those readers, for reversals posted before this.)
            sourceKind: 'sale',
            sourceId: payment.id,
            eventType: 'sale_payment_voided',
            notes: input.reason,
          });
        }
      }
      await tx
        .update(salePayments)
        .set({ status: 'voided' })
        .where(eq(salePayments.id, payment.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'voided sale payment',
        entityType: 'sale_payment',
        entityId: payment.id,
        entityLabel: input.id,
        diff: { reason: { from: null, to: input.reason } },
      });
      return { id: payment.id };
    });
  });

/**
 * Void a sale.
 *
 * The row is kept and marked `void` rather than deleted — a numbered document
 * that vanishes is exactly what makes a series untrustworthy. Its stock and
 * cash postings are removed, because those describe movements that did not
 * happen.
 */
export const voidSale = writeAction
  .metadata({ action: 'voided', entity: 'sale' })
  .inputSchema(z.object({ id: uuid, reason: z.string().trim().max(500).optional() }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.id);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status === 'void') throw new ActionError('That sale is already void.');

      // Money received and not paid back blocks a void: voiding would leave
      // cash in the till that no document explains. Refunded-in-full and
      // payment-voided sales are fine.
      const held = await heldOnSale(tx, sale.id);
      if (held > 0) {
        throw new ActionError(
          `${formatMoney(held, sale.currency)} received on this sale has not been paid back. Refund it first, or void the payment if it was entered by mistake.`,
        );
      }
      const [returned] = await tx.execute<{ units: string }>(
        sql`SELECT COALESCE(SUM(quantity_returned), 0)::text AS units FROM sale_items WHERE sale_id = ${sale.id}`,
      );
      if (Number(returned?.units ?? 0) > 0) {
        throw new ActionError('This sale has returned items and cannot be voided.');
      }

      await clearDocumentPostings(tx, 'sale', sale.id);

      // A void sale earns nobody a commission. Unpaid commissions are cancelled
      // so they cannot be paid out later; any already paid are reported.
      const commission = await cancelOpenCommissionsForSale(tx, sale.id);

      // A voided order must not keep holding stock back from everyone else.
      await tx
        .update(inventoryReservations)
        .set({ status: 'released', releasedAt: new Date() })
        .where(
          and(
            eq(inventoryReservations.orderId, sale.id),
            eq(inventoryReservations.status, 'active'),
          ),
        );
      await tx
        .update(orderFulfillments)
        .set({ status: 'cancelled' })
        .where(eq(orderFulfillments.orderId, sale.id));

      await tx
        .update(sales)
        .set({
          status: 'void',
          workflowStatus: 'cancelled',
          cogsCents: 0,
          grossProfitCents: 0,
          notes: input.reason
            ? `${sale.notes ? `${sale.notes}\n` : ''}Voided: ${input.reason}`
            : sale.notes,
        })
        .where(eq(sales.id, sale.id));

      await tx
        .update(saleItems)
        .set({ cogsCents: 0, shortfall: 0 })
        .where(eq(saleItems.saleId, sale.id));
      const saleItemIds = (
        await tx
          .select({ id: saleItems.id })
          .from(saleItems)
          .where(eq(saleItems.saleId, sale.id))
      ).map((item) => item.id);
      if (saleItemIds.length > 0) {
        await tx
          .update(saleItemComponents)
          .set({ cogsCents: 0 })
          .where(inArray(saleItemComponents.saleItemId, saleItemIds));
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'voided sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
        diff: input.reason ? { reason: { from: null, to: input.reason } } : null,
      });

      return { number: sale.number, paidCommissionCents: commission.paidCents };
    });

    return result;
  });

/**
 * Return items from a confirmed sale.
 *
 * The sale itself stays exactly as it was — it happened, and rewriting it
 * would rewrite a margin someone has already relied on, the same reason
 * `updateSale` refuses a confirmed sale. Instead the return posts the
 * reverse of the sale's consequences:
 *
 *   stock  the goods come back in at the cost they went out at, so the
 *          weighted average is restored rather than re-priced;
 *   cash   no money moves automatically. The return creates a derived credit
 *          due; `refundSale` is the separate action that pays it out.
 *   margin the line's returned portion is tracked on `quantity_returned`,
 *          leaving the original figures intact beside it.
 *
 * The amounts are derived, never typed: each returned share is
 * `returnedPortion` of the line, so partial returns across time always foot
 * to the line exactly. A written reason is required — this reverses
 * postings, the same tier of friction as void and reversal.
 */
export const returnSaleItems = writeAction
  .metadata({ action: 'returned', entity: 'sale' })
  .inputSchema(
    z.object({
      saleId: uuid,
      reason: z.string().trim().min(3, 'Say why the goods came back').max(500),
      items: returnItemsSchema,
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError(
          sale.status === 'draft'
            ? 'A draft has moved nothing — edit or void it instead of returning against it.'
            : 'A void sale has already had its postings removed; there is nothing to reverse.',
        );
      }

      // An order that is confirmed or ready has reserved stock but not shipped
      // it. Putting units "back" would add stock that never left.
      if (sale.workflowStatus === 'confirmed' || sale.workflowStatus === 'ready') {
        throw new ActionError(
          'This order has not been completed, so nothing has left stock. Cancel the order instead of returning items.',
        );
      }

      const items = await tx
        .select()
        .from(saleItems)
        .where(
          and(
            eq(saleItems.saleId, sale.id),
            inArray(
              saleItems.id,
              input.items.map((item) => item.saleItemId),
            ),
          ),
        );

      const byId = new Map(items.map((item) => [item.id, item]));
      // The customer paid the lines less their share of the document discount, so
      // that is what comes back for these goods (the same split commissions use).
      const allLines = await tx
        .select({
          id: saleItems.id,
          unitPriceCents: saleItems.unitPriceCents,
          quantity: saleItems.quantity,
        })
        .from(saleItems)
        .where(eq(saleItems.saleId, sale.id))
        .orderBy(saleItems.position);
      const netTotals = netLineTotals(allLines, sale.discountCents);
      const componentRows = await tx
        .select()
        .from(saleItemComponents)
        .where(
          inArray(
            saleItemComponents.saleItemId,
            items.map((item) => item.id),
          ),
        );
      const componentsByLine = new Map<string, typeof componentRows>();
      for (const component of componentRows)
        componentsByLine.set(component.saleItemId, [
          ...(componentsByLine.get(component.saleItemId) ?? []),
          component,
        ]);
      await lockSaleVariants(
        tx,
        items.flatMap(
          (item) =>
            componentsByLine.get(item.id)?.map((component) => component.variantId) ?? [
              item.variantId,
            ],
        ),
      );

      // A double click or a retry arrives after the first request has committed (lockSale made it
      // wait), with the same lines. Recognise it by the stock the first one posted and say so,
      // rather than putting the goods back, and crediting them, twice.
      const planned = unitsByVariant(
        input.items.flatMap((line) => {
          const item = byId.get(line.saleItemId);
          if (!item) return [];
          const components = componentsByLine.get(item.id);
          return components?.length
            ? components.map((component) => ({
                variantId: component.variantId,
                quantity: line.quantity * component.quantityPerBundle,
              }))
            : [{ variantId: item.variantId, quantity: line.quantity }];
        }),
      );
      if (planned.size > 0) {
        const recent = await tx.execute<{
          batch: string;
          variant_id: string;
          quantity: string;
        }>(sql`
          SELECT created_at::text AS batch, variant_id::text AS variant_id, quantity::text AS quantity
            FROM inventory_movements
           WHERE source_kind = 'sale' AND source_id = ${sale.id} AND kind = 'return'
             AND created_by_id = ${ctx.member.id}
             AND created_at > now() - make_interval(secs => ${RETURN_DUPLICATE_WINDOW_SECONDS})
        `);
        if (
          isRepeatedReturn(
            planned,
            recent.map((row) => ({
              batch: row.batch,
              variantId: row.variant_id,
              quantity: Number(row.quantity),
            })),
          )
        ) {
          return {
            number: sale.number,
            currency: sale.currency,
            creditCents: 0,
            creditUsdCents: 0,
            restockedCents: 0,
            units: 0,
            commissionReducedCents: 0,
            commissionOverpaidCents: 0,
            commissionUnmatchedGroups: 0,
            reused: true as const,
          };
        }
      }

      let creditCents = 0;
      let restockedCents = 0;
      let units = 0;
      const returnedAt = new Date();

      for (const line of input.items) {
        const item = byId.get(line.saleItemId);
        if (!item) throw new ActionError('One of those lines is not on this sale.');

        const returnable = item.quantity - item.quantityReturned;
        if (line.quantity > returnable) {
          throw new ActionError(
            returnable === 0
              ? 'That line has already been returned in full.'
              : `Only ${returnable} unit${returnable === 1 ? '' : 's'} of that line can still be returned.`,
          );
        }

        const refund = returnedPortion(
          netTotals.get(item.id) ?? item.unitPriceCents * item.quantity,
          item.quantity,
          item.quantityReturned,
          line.quantity,
        );
        const components = componentsByLine.get(item.id);
        let restockedLine = 0;
        if (components?.length) {
          for (const component of components) {
            const restock = returnedPortion(
              component.cogsCents,
              item.quantity,
              item.quantityReturned,
              line.quantity,
            );
            await lockValuation(tx, component.variantId);
            await postStockMovement(tx, {
              variantId: component.variantId,
              kind: 'return',
              quantity: line.quantity * component.quantityPerBundle,
              valueCents: restock,
              sourceKind: 'sale',
              sourceId: sale.id,
              occurredAt: returnedAt,
              note: `Returned from ${sale.number} · ${item.bundleSku ?? 'bundle'}.`,
              memberId: ctx.member.id,
            });
            restockedLine += restock;
          }
        } else {
          const restock = returnedPortion(
            item.cogsCents,
            item.quantity,
            item.quantityReturned,
            line.quantity,
          );
          await lockValuation(tx, item.variantId);
          await postStockMovement(tx, {
            variantId: item.variantId,
            kind: 'return',
            quantity: line.quantity,
            valueCents: restock,
            sourceKind: 'sale',
            sourceId: sale.id,
            occurredAt: returnedAt,
            note: `Returned from ${sale.number}.`,
            memberId: ctx.member.id,
          });
          restockedLine = restock;
        }

        await tx
          .update(saleItems)
          .set({ quantityReturned: item.quantityReturned + line.quantity })
          .where(eq(saleItems.id, item.id));

        creditCents += refund;
        restockedCents += restockedLine;
        units += line.quantity;
      }

      // Commission is earned on goods the customer kept.
      const commission = await netOpenCommissionsForReturns(tx, sale.id);

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'recorded return on sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
        diff: {
          reason: { from: null, to: input.reason },
          ...(commission.unmatchedGroups > 0
            ? {
                commission_review: {
                  from: null,
                  to: `${commission.unmatchedGroups} commission group(s) left unchanged: a product's category changed since the sale. Review them.`,
                },
              }
            : {}),
        },
      });

      return {
        number: sale.number,
        currency: sale.currency,
        creditCents,
        creditUsdCents: normaliseToUsd(creditCents, sale.currency, sale.fxRateMicros),
        restockedCents,
        units,
        commissionReducedCents: commission.reducedCents,
        commissionOverpaidCents: commission.overpaidCents,
        commissionUnmatchedGroups: commission.unmatchedGroups,
        reused: false as const,
      };
    });

    return result;
  });

/**
 * Pay out a credit created by a return. This is intentionally separate from
 * `returnSaleItems`: goods can be accepted back while the customer chooses a
 * replacement or store credit, and cash must never leave merely because stock
 * was restocked.
 */
export const refundSale = writeAction
  .metadata({ action: 'refunded', entity: 'sale' })
  .inputSchema(saleRefundSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError('Only a confirmed sale can be refunded.');
      }

      if (input.idempotencyKey) {
        const [existing] = await tx
          .select({ amountCents: saleRefunds.amountCents })
          .from(saleRefunds)
          .where(
            and(
              eq(saleRefunds.saleId, sale.id),
              eq(saleRefunds.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          const refundedCents = await refundedOnSale(tx, sale.id);
          return {
            number: sale.number,
            currency: sale.currency,
            amountCents: existing.amountCents,
            refundedCents,
            refundableCents: Math.max(0, (await paidOnSale(tx, sale.id)) - refundedCents),
            walletWarning: null,
          };
        }
      }

      const paidCents = await paidOnSale(tx, sale.id);
      const refundedCents = await refundedOnSale(tx, sale.id);
      const refundableCents = paidCents - refundedCents;
      if (refundableCents <= 0) {
        throw new ActionError('There is no received money left to refund on this sale.');
      }
      if (input.amountCents > refundableCents) {
        throw new ActionError(
          `That is more than the refundable balance (${formatMoney(refundableCents, sale.currency)}).`,
        );
      }

      const refundedAt = input.refundedAt ?? new Date();
      const walletId =
        input.walletId ??
        (await defaultWalletFor(tx, {
          currency: sale.currency,
          method: input.paymentMethod,
        }));
      const [refund] = await tx
        .insert(saleRefunds)
        .values({
          saleId: sale.id,
          amountCents: input.amountCents,
          currency: sale.currency,
          fxRateMicros: sale.fxRateMicros,
          method: input.paymentMethod,
          walletId,
          refundedAt,
          reason: input.reason,
          memberId: ctx.member.id,
          createdById: ctx.member.id,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning({ id: saleRefunds.id });
      if (!refund) throw new ActionError('Could not record the refund.');

      await postLedgerEntry(tx, {
        direction: 'out',
        category: 'refund',
        description: `Refund ${sale.number}`,
        currency: sale.currency,
        rateMicros: sale.fxRateMicros,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        occurredAt: refundedAt,
        memberId: ctx.member.id,
        sourceKind: 'sale',
        sourceId: refund.id,
        walletId,
        locationId: sale.locationId,
        storefrontId: sale.storefrontId,
        eventType: 'sale_refund',
        notes: input.reason,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'refunded sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
        diff: {
          refunded_cents: { from: refundedCents, to: refundedCents + input.amountCents },
        },
      });

      return {
        number: sale.number,
        currency: sale.currency,
        amountCents: input.amountCents,
        refundedCents: refundedCents + input.amountCents,
        refundableCents: refundableCents - input.amountCents,
        // A warning, not a refusal: the money did leave. Null when the wallet still holds money.
        walletWarning: await walletBelowZero(tx, walletId),
      };
    });

    return result;
  });
