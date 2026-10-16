import { eq } from 'drizzle-orm';
import { buildCommissionDrafts } from '@/lib/commission-rules';
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
  if (!seller?.active) throw new Error('The selected seller is inactive or no longer exists.');

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
