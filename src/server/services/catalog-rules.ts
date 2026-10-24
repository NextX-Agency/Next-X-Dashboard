import { and, eq, sql } from 'drizzle-orm';
import { priceListItems, priceLists } from '../db/schema';
import type { Tx } from './posting';

/**
 * Catalog rules that more than one action needs, kept out of the `'use server'` action files
 * (every export of those files is a callable endpoint) and testable on their own.
 */

/**
 * Keep the product editor's USD list price and the USD price list in step. The editor edits
 * `product_variants.list_price_cents`; the shop reads `price_list_items`. Public storefront reads
 * never use the column; they read the price list.
 */
export async function syncLegacyUsdPrices(
  tx: Tx,
  variants: { id: string; amountCents: number }[],
): Promise<void> {
  if (!variants.length) return;
  const [priceList] = await tx
    .select({ id: priceLists.id })
    .from(priceLists)
    .where(and(eq(priceLists.currency, 'USD'), eq(priceLists.active, true)))
    .orderBy(
      sql`CASE WHEN ${priceLists.name} = 'Retail USD' THEN 0 ELSE 1 END`,
      priceLists.createdAt,
    )
    .limit(1);
  if (!priceList) return;
  await tx
    .insert(priceListItems)
    .values(
      variants.map((variant) => ({
        priceListId: priceList.id,
        variantId: variant.id,
        amountCents: variant.amountCents,
      })),
    )
    .onConflictDoUpdate({
      target: [priceListItems.priceListId, priceListItems.variantId],
      set: { amountCents: sql`excluded.amount_cents`, updatedAt: new Date() },
    });
}

export type ProductStatus = 'draft' | 'active' | 'archived';

/**
 * Publishing is a public promise, so the minimum page quality is enforced at the server boundary
 * instead of trusting a checkbox. Returns a sentence a person can act on, or null when the product
 * may be published. (`assertCatalogPublishable` in the product actions throws this message.)
 */
export async function publishabilityProblem(
  tx: Tx,
  productId: string,
  status: ProductStatus,
): Promise<string | null> {
  if (status !== 'active') return 'Only active products can be published to the catalog.';

  const [row] = await tx.execute<{
    summary: string | null;
    has_image: string;
    has_variant: string;
  }>(sql`
    SELECT p.summary,
           EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)::text AS has_image,
           EXISTS (
             SELECT 1 FROM product_variants v
              WHERE v.product_id = p.id AND v.is_active AND v.list_price_cents > 0
           )::text AS has_variant
      FROM products p
     WHERE p.id = ${productId}
     LIMIT 1
  `);

  if (!row) return 'That product no longer exists.';
  if (!row.summary?.trim()) return 'Add a summary before publishing this product.';
  if (row.has_image !== 'true') return 'Add a product image before publishing it.';
  if (row.has_variant !== 'true')
    return 'Add an active variant with a price before publishing it.';
  return null;
}
