import { and, eq } from 'drizzle-orm';
import {
  buildCommissionDrafts,
  netCommissionBases,
  planCommissionNetting,
} from '@/lib/commission-rules';
import { normaliseToUsd } from '@/lib/fx';
import {
  commissions,
  locations,
  products,
  productVariants,
  saleItems,
  sales,
  sellerCategoryRates,
  sellers,
} from '../db/schema';
import { ActionError } from '../errors';
import type { Tx } from './posting';

/** Freeze the commission arithmetic alongside a newly confirmed sale. */
export async function createSaleCommissions(
  tx: Tx,
  saleId: string,
  memberId: string,
): Promise<void> {
  const [sale] = await tx
    .select({
      sellerId: sales.sellerId,
      status: sales.status,
      currency: sales.currency,
      fxRateMicros: sales.fxRateMicros,
      discountCents: sales.discountCents,
    })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (sale?.status !== 'confirmed' || !sale.sellerId) return;

  const [alreadyCreated] = await tx
    .select({ id: commissions.id })
    .from(commissions)
    .where(eq(commissions.saleId, saleId))
    .limit(1);
  if (alreadyCreated) return;

  const [seller] = await tx
    .select({
      id: sellers.id,
      active: sellers.active,
      locationId: sellers.locationId,
      defaultRateBps: sellers.defaultRateBps,
    })
    .from(sellers)
    .where(eq(sellers.id, sale.sellerId))
    .limit(1);
  if (!seller?.active)
    throw new ActionError(
      'The selected seller is inactive or no longer exists. Choose another seller.',
    );

  const [location] = seller.locationId
    ? await tx
        .select({ commissionRateBps: locations.commissionRateBps })
        .from(locations)
        .where(eq(locations.id, seller.locationId))
        .limit(1)
    : [];
  const [lines, categoryRateRows] = await Promise.all([
    tx
      .select({
        id: saleItems.id,
        quantity: saleItems.quantity,
        unitPriceCents: saleItems.unitPriceCents,
        bundleId: saleItems.bundleId,
        categoryId: products.categoryId,
      })
      .from(saleItems)
      .innerJoin(productVariants, eq(productVariants.id, saleItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(saleItems.saleId, saleId))
      .orderBy(saleItems.position),
    tx
      .select({
        categoryId: sellerCategoryRates.categoryId,
        rateBps: sellerCategoryRates.rateBps,
      })
      .from(sellerCategoryRates)
      .where(eq(sellerCategoryRates.sellerId, seller.id)),
  ]);

  const drafts = buildCommissionDrafts({
    lines: lines.map((line) => ({
      id: line.id,
      categoryId: line.categoryId,
      basisCents: line.unitPriceCents * line.quantity,
      bundle: line.bundleId !== null,
    })),
    discountCents: sale.discountCents,
    categoryRates: new Map(categoryRateRows.map((row) => [row.categoryId, row.rateBps])),
    sellerRateBps: seller.defaultRateBps,
    locationRateBps: location?.commissionRateBps ?? 0,
  });

  if (drafts.length === 0) return;
  await tx.insert(commissions).values(
    drafts.map((draft) => ({
      sellerId: seller.id,
      saleId,
      locationId: seller.locationId,
      categoryId: draft.categoryId,
      groupKey: draft.groupKey,
      basisCents: draft.basisCents,
      amountCents: draft.amountCents,
      amountUsdCents: normaliseToUsd(draft.amountCents, sale.currency, sale.fxRateMicros),
      rateBps: draft.rateBps,
      currency: sale.currency,
      fxRateMicros: sale.fxRateMicros,
      createdById: memberId,
    })),
  );
}

/**
 * Keep unpaid commissions honest after goods come back.
 *
 * A commission is earned on goods the customer kept. Rates stay frozen on each
 * commission row, so only the basis is recomputed from the units not returned.
 * Rows that are already paid are never touched — a payout is a fact — but the
 * amount over-paid is returned so the caller can tell the owner.
 */
export async function netOpenCommissionsForReturns(
  tx: Tx,
  saleId: string,
): Promise<{ reducedCents: number; overpaidCents: number; unmatchedGroups: number }> {
  const rows = await tx.select().from(commissions).where(eq(commissions.saleId, saleId));
  if (rows.length === 0) return { reducedCents: 0, overpaidCents: 0, unmatchedGroups: 0 };

  const [sale] = await tx
    .select({ discountCents: sales.discountCents })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale) return { reducedCents: 0, overpaidCents: 0, unmatchedGroups: 0 };

  const lines = await tx
    .select({
      id: saleItems.id,
      quantity: saleItems.quantity,
      quantityReturned: saleItems.quantityReturned,
      unitPriceCents: saleItems.unitPriceCents,
      bundleId: saleItems.bundleId,
      categoryId: products.categoryId,
    })
    .from(saleItems)
    .innerJoin(productVariants, eq(productVariants.id, saleItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(saleItems.saleId, saleId))
    .orderBy(saleItems.position);

  const bases = netCommissionBases({
    discountCents: sale.discountCents,
    lines: lines.map((line) => ({
      id: line.id,
      categoryId: line.categoryId,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      quantityReturned: line.quantityReturned,
      bundle: line.bundleId !== null,
    })),
  });

  let reducedCents = 0;
  let overpaidCents = 0;
  let unmatchedGroups = 0;
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const decision of planCommissionNetting(rows, bases)) {
    if (decision.kind === 'unmatched') {
      unmatchedGroups += 1;
    } else if (decision.kind === 'overpaid') {
      overpaidCents += decision.overpaidCents;
    } else if (decision.kind === 'reduce') {
      const row = rowsById.get(decision.id);
      if (!row) continue;
      reducedCents += decision.reducedCents;
      await tx
        .update(commissions)
        .set(
          decision.cancel
            ? { status: 'cancelled' }
            : {
                basisCents: decision.basisCents,
                amountCents: decision.amountCents,
                amountUsdCents: normaliseToUsd(
                  decision.amountCents,
                  row.currency,
                  row.fxRateMicros,
                ),
              },
        )
        .where(and(eq(commissions.id, row.id), eq(commissions.status, 'open')));
    }
  }
  return { reducedCents, overpaidCents, unmatchedGroups };
}

/** A voided sale earns nothing. Unpaid commissions are cancelled; the amount
 *  already paid out (if any) is returned so it can be flagged for the owner. */
export async function cancelOpenCommissionsForSale(
  tx: Tx,
  saleId: string,
): Promise<{ cancelledCents: number; paidCents: number }> {
  const rows = await tx.select().from(commissions).where(eq(commissions.saleId, saleId));
  let cancelledCents = 0;
  let paidCents = 0;
  for (const row of rows) {
    if (row.status === 'paid') paidCents += row.amountCents;
    if (row.status !== 'open') continue;
    cancelledCents += row.amountCents;
    await tx
      .update(commissions)
      .set({ status: 'cancelled' })
      .where(and(eq(commissions.id, row.id), eq(commissions.status, 'open')));
  }
  return { cancelledCents, paidCents };
}
