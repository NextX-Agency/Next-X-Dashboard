'use server';

import { asc, eq, like, or } from 'drizzle-orm';
import { z } from 'zod';
import { uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { products, productVariants } from '../db/schema';
import { syncLegacyUsdPrices } from '../services/catalog-rules';
import { logActivity, type Tx } from '../services/posting';
import { ActionError, writeAction } from './client';

/** `base`, `base-copy`, `base-copy-2`, ... the first one not in `taken` (case-insensitive). */
function freeName(base: string, taken: ReadonlySet<string>, separator = '-'): string {
  const used = (value: string) => taken.has(value.toLowerCase());
  let candidate = `${base}${separator}copy`;
  for (let n = 2; used(candidate); n += 1) candidate = `${base}${separator}copy-${n}`;
  return candidate;
}

async function takenValues(
  tx: Tx,
  column: 'code' | 'slug',
  base: string,
): Promise<Set<string>> {
  const col = column === 'code' ? products.code : products.slug;
  const rows = await tx
    .select({ value: col })
    .from(products)
    .where(like(col, `${base.replace(/[%_]/g, '$&')}%`));
  return new Set(rows.map((row) => row.value.toLowerCase()));
}

/**
 * Copy a product as a new DRAFT: same description, options, prices and costs, with a new code, slug
 * and SKUs ("-copy" added, numbered if taken), not on the shop, no stock, and without photographs
 * (a photograph's files belong to one product; sharing them would let deleting one break the other).
 * Relationships, collections, serials and stock history are not copied.
 */
export const duplicateProduct = writeAction
  .metadata({ action: 'duplicated', entity: 'product' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);
      if (!source) throw new ActionError('That product no longer exists.');

      const variants = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, input.id))
        .orderBy(asc(productVariants.position), asc(productVariants.name));

      const code = freeName(
        source.code,
        await takenValues(tx, 'code', source.code),
      ).toUpperCase();
      const slug = freeName(source.slug, await takenValues(tx, 'slug', source.slug));
      const name = `${source.name} (copy)`;

      const [copy] = await tx
        .insert(products)
        .values({
          code,
          name,
          slug,
          brandId: source.brandId,
          categoryId: source.categoryId,
          supplierId: source.supplierId,
          sourceUrl: source.sourceUrl,
          summary: source.summary,
          description: source.description,
          specs: source.specs,
          modelNumber: source.modelNumber,
          keyFeatures: source.keyFeatures,
          bestFor: source.bestFor,
          compatibility: source.compatibility,
          buyerRequirements: source.buyerRequirements,
          boxContents: source.boxContents,
          nextlyTake: source.nextlyTake,
          faqItems: source.faqItems,
          showWhenOutOfStock: source.showWhenOutOfStock,
          restockNotificationsEnabled: source.restockNotificationsEnabled,
          warrantyMonths: source.warrantyMonths,
          seoTitle: source.seoTitle,
          seoDescription: source.seoDescription,
          notes: source.notes,
          status: 'draft',
          catalogPublished: false,
          featured: false,
        })
        .returning({ id: products.id, name: products.name });
      if (!copy) throw new ActionError('Could not copy the product.');

      // SKUs are unique across the whole catalogue; find every one already taken that starts alike.
      const skuRows = await tx
        .select({ sku: productVariants.sku })
        .from(productVariants)
        .where(
          or(
            ...variants.map((variant) =>
              like(productVariants.sku, `${variant.sku.replace(/[%_]/g, '$&')}%`),
            ),
          ),
        );
      const skus = new Set(skuRows.map((row) => row.sku.toLowerCase()));
      const created: { id: string; amountCents: number }[] = [];
      for (const variant of variants) {
        const sku = freeName(variant.sku, skus).toUpperCase();
        skus.add(sku.toLowerCase());
        const [row] = await tx
          .insert(productVariants)
          .values({
            productId: copy.id,
            sku,
            name: variant.name,
            attributes: variant.attributes,
            barcode: null,
            listPriceCents: variant.listPriceCents,
            referenceCostCents: variant.referenceCostCents,
            weightGrams: variant.weightGrams,
            isStrategic: variant.isStrategic,
            isDefault: variant.isDefault,
            isActive: variant.isActive,
            position: variant.position,
          })
          .returning({ id: productVariants.id, amountCents: productVariants.listPriceCents });
        if (row) created.push(row);
      }
      await syncLegacyUsdPrices(tx, created);

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'duplicated product',
        entityType: 'product',
        entityId: copy.id,
        entityLabel: copy.name,
        diff: { copiedFrom: { from: source.code, to: code } },
      });
      return { id: copy.id, name: copy.name, variants: created.length };
    });
  });
