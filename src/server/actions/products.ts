'use server';

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { productSchema, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import {
  inventoryMovements,
  priceListItems,
  products,
  productVariants,
  purchaseOrderItems,
  quoteRequests,
  saleItems,
} from '../db/schema';
import {
  type ProductStatus,
  publishabilityProblem,
  syncLegacyUsdPrices,
} from '../services/catalog-rules';
import { logActivity } from '../services/posting';
import { postManualAdjustment } from '../services/stock-adjust';
import { ActionError, ownerAction, writeAction } from './client';

/**
 * A SKU identifies one variant everywhere (sale lines, stock, the shop). Say exactly which one is
 * taken instead of surfacing a bare "already exists" from the unique index.
 */
async function assertSkusAvailable(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  variants: { id?: string | undefined; sku: string }[],
): Promise<void> {
  const wanted = variants.map((variant) => variant.sku.trim().toUpperCase());
  const repeated = wanted.find((sku, index) => wanted.indexOf(sku) !== index);
  if (repeated)
    throw new ActionError(`SKU ${repeated} is used by two variants on this product.`);
  if (wanted.length === 0) return;
  const rows = await tx
    .select({ id: productVariants.id, sku: productVariants.sku, product: products.name })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.sku, wanted));
  const own = new Set(variants.flatMap((variant) => (variant.id ? [variant.id] : [])));
  const taken = rows.find((row) => !own.has(row.id));
  if (taken) {
    throw new ActionError(
      `SKU ${taken.sku} is already used by ${taken.product}. Use a different SKU.`,
    );
  }
}

/**
 * True when anything still points at one of these variants through a RESTRICT foreign key: stock
 * movements, sale and purchase lines, bundle components, reservations, reorder history and the
 * migration archives. Such a variant is history and can only be deactivated; deleting it would
 * fail with a raw constraint error (or, worse, succeed and orphan a record elsewhere).
 */
async function variantsHaveReferences(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  variantIds: string[],
): Promise<boolean> {
  if (variantIds.length === 0) return false;
  const ids = sql.join(
    variantIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const [row] = await tx.execute<{ used: string }>(sql`
    SELECT (
      EXISTS (SELECT 1 FROM inventory_movements WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM sale_items WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM sale_item_components WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM purchase_order_items WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM bundle_components WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM inventory_reservations WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM reorder_recommendations WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM legacy_stock_transfer_archive WHERE variant_id IN (${ids}))
      OR EXISTS (SELECT 1 FROM legacy_reservation_archive WHERE variant_id IN (${ids}))
    )::text AS used
  `);
  return row?.used === 'true';
}

/** Publishing is a public promise, so enforce the minimum page quality at the server boundary
 * instead of trusting the checkbox in the admin form. */
async function assertCatalogPublishable(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  productId: string,
  status: ProductStatus,
): Promise<void> {
  const problem = await publishabilityProblem(tx, productId, status);
  if (problem) throw new ActionError(problem);
}

export const createProduct = writeAction
  .metadata({ action: 'created', entity: 'product' })
  .inputSchema(productSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          code: input.code.toUpperCase(),
          name: input.name,
          slug: input.slug,
          categoryId: input.categoryId,
          supplierId: input.supplierId,
          brandId: input.brandId,
          sourceUrl: input.sourceUrl ?? null,
          summary: input.summary ?? null,
          description: input.description ?? null,
          specs: input.specs,
          modelNumber: input.modelNumber ?? null,
          keyFeatures: input.keyFeatures,
          bestFor: input.bestFor,
          compatibility: input.compatibility,
          buyerRequirements: input.buyerRequirements ?? {},
          boxContents: input.boxContents,
          nextlyTake: input.nextlyTake ?? null,
          faqItems: input.faqItems,
          featured: input.featured,
          featuredPosition: input.featuredPosition ?? null,
          newUntil: input.newUntil ?? null,
          showWhenOutOfStock: input.showWhenOutOfStock,
          restockNotificationsEnabled: input.restockNotificationsEnabled,
          status: input.status,
          warrantyMonths: input.warrantyMonths,
          catalogPublished: input.catalogPublished,
          catalogPublishedAt: input.catalogPublished ? new Date() : null,
          notes: input.notes ?? null,
        })
        .returning();

      if (!product) throw new ActionError('Could not create the product.');

      await assertSkusAvailable(tx, input.variants);
      const createdVariants = await tx
        .insert(productVariants)
        .values(
          input.variants.map((variant, index) => ({
            productId: product.id,
            sku: variant.sku.toUpperCase(),
            name: variant.name,
            listPriceCents: variant.listPriceCents,
            referenceCostCents: variant.referenceCostCents,
            barcode: variant.barcode ?? null,
            attributes: variant.attributes,
            weightGrams: variant.weightGrams,
            isStrategic: variant.isStrategic,
            isDefault:
              variant.isDefault ||
              (!input.variants.some((item) => item.isDefault) && index === 0),
            isActive: variant.isActive,
            position: index + 1,
          })),
        )
        .returning({ id: productVariants.id, listPriceCents: productVariants.listPriceCents });

      await syncLegacyUsdPrices(
        tx,
        createdVariants.map((variant) => ({
          id: variant.id,
          amountCents: variant.listPriceCents,
        })),
      );

      if (input.catalogPublished) {
        await assertCatalogPublishable(tx, product.id, input.status);
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created product',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.name,
      });

      return { id: product.id, name: product.name };
    });
    return result;
  });

/**
 * Update a product and reconcile its variants.
 *
 * A variant that has been dropped from the form is **deactivated, not
 * deleted**, whenever it has ever moved stock. Deleting it would orphan
 * historical sale lines and inventory movements, which is how a system quietly
 * loses the ability to explain last quarter.
 */
export const updateProduct = writeAction
  .metadata({ action: 'updated', entity: 'product' })
  .inputSchema(productSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (!existing) throw new ActionError('That product no longer exists.');

      await tx
        .update(products)
        .set({
          code: input.code.toUpperCase(),
          name: input.name,
          slug: input.slug,
          categoryId: input.categoryId,
          supplierId: input.supplierId,
          brandId: input.brandId,
          sourceUrl: input.sourceUrl ?? null,
          summary: input.summary ?? null,
          description: input.description ?? null,
          specs: input.specs,
          modelNumber: input.modelNumber ?? null,
          keyFeatures: input.keyFeatures,
          bestFor: input.bestFor,
          compatibility: input.compatibility,
          buyerRequirements: input.buyerRequirements ?? {},
          boxContents: input.boxContents,
          nextlyTake: input.nextlyTake ?? null,
          faqItems: input.faqItems,
          featured: input.featured,
          featuredPosition: input.featuredPosition ?? null,
          newUntil: input.newUntil ?? null,
          showWhenOutOfStock: input.showWhenOutOfStock,
          restockNotificationsEnabled: input.restockNotificationsEnabled,
          status: input.status,
          warrantyMonths: input.warrantyMonths,
          catalogPublished: input.catalogPublished,
          catalogPublishedAt: input.catalogPublished
            ? (existing.catalogPublishedAt ?? new Date())
            : null,
          notes: input.notes ?? null,
        })
        .where(eq(products.id, input.id));

      await assertSkusAvailable(tx, input.variants);
      const keptIds: string[] = [];
      const pricesToSync: { id: string; amountCents: number }[] = [];

      for (const [index, variant] of input.variants.entries()) {
        if (variant.id) {
          const [existingVariant] = await tx
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(
              and(eq(productVariants.id, variant.id), eq(productVariants.productId, input.id)),
            )
            .limit(1);
          if (!existingVariant) {
            throw new ActionError(
              'One of the selected variants does not belong to this product.',
            );
          }

          await tx
            .update(productVariants)
            .set({
              sku: variant.sku.toUpperCase(),
              name: variant.name,
              listPriceCents: variant.listPriceCents,
              referenceCostCents: variant.referenceCostCents,
              barcode: variant.barcode ?? null,
              attributes: variant.attributes,
              weightGrams: variant.weightGrams,
              isStrategic: variant.isStrategic,
              isActive: variant.isActive,
              isDefault:
                variant.isDefault ||
                (!input.variants.some((item) => item.isDefault) && index === 0),
              position: index + 1,
            })
            .where(
              and(eq(productVariants.id, variant.id), eq(productVariants.productId, input.id)),
            );
          keptIds.push(variant.id);
          pricesToSync.push({ id: variant.id, amountCents: variant.listPriceCents });
        } else {
          const [created] = await tx
            .insert(productVariants)
            .values({
              productId: input.id,
              sku: variant.sku.toUpperCase(),
              name: variant.name,
              listPriceCents: variant.listPriceCents,
              referenceCostCents: variant.referenceCostCents,
              barcode: variant.barcode ?? null,
              attributes: variant.attributes,
              weightGrams: variant.weightGrams,
              isStrategic: variant.isStrategic,
              isActive: variant.isActive,
              isDefault:
                variant.isDefault ||
                (!input.variants.some((item) => item.isDefault) && index === 0),
              position: index + 1,
            })
            .returning({ id: productVariants.id });
          if (created) {
            keptIds.push(created.id);
            pricesToSync.push({ id: created.id, amountCents: variant.listPriceCents });
          }
        }
      }

      await syncLegacyUsdPrices(tx, pricesToSync);

      const dropped = await tx
        .select({ id: productVariants.id, sku: productVariants.sku })
        .from(productVariants)
        .where(
          keptIds.length > 0
            ? and(
                eq(productVariants.productId, input.id),
                notInArray(productVariants.id, keptIds),
              )
            : eq(productVariants.productId, input.id),
        );

      for (const variant of dropped) {
        if (await variantsHaveReferences(tx, [variant.id])) {
          await tx
            .update(productVariants)
            .set({ isActive: false })
            .where(eq(productVariants.id, variant.id));
        } else {
          // Deliberately still on `updateProduct` (`writeAction`), not
          // promoted to owner-only like `deleteProduct`: this branch only
          // ever runs for a variant with no movements, no sale lines and no
          // PO lines — a variant with no history is a typo, not a record, and
          // requiring an owner to fix a typo mid-edit would be absurd.
          await tx.delete(priceListItems).where(eq(priceListItems.variantId, variant.id));
          await tx.delete(productVariants).where(eq(productVariants.id, variant.id));
        }
      }

      if (input.catalogPublished) {
        await assertCatalogPublishable(tx, input.id, input.status);
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated product',
        entityType: 'product',
        entityId: input.id,
        entityLabel: input.name,
      });

      return { id: input.id, name: input.name, deactivated: dropped.length };
    });
    return result;
  });

export const setProductStatus = writeAction
  .metadata({ action: 'updated', entity: 'product' })
  .inputSchema(
    z
      .object({
        id: uuid,
        status: z.enum(['draft', 'active', 'archived']).optional(),
        catalogPublished: z.boolean().optional(),
      })
      .refine((input) => input.status !== undefined || input.catalogPublished !== undefined, {
        message: 'Choose a product status or catalog visibility change.',
      }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const name = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (!product) throw new ActionError('That product no longer exists.');

      if (input.catalogPublished === true) {
        await assertCatalogPublishable(tx, input.id, input.status ?? product.status);
      }

      // An archived or draft product must not stay marked as published: re-activating it later
      // would otherwise put it straight back on the shop without a fresh publish check.
      const leavingActive = input.status !== undefined && input.status !== 'active';
      const publishedChange =
        leavingActive && input.catalogPublished === undefined ? false : input.catalogPublished;

      await tx
        .update(products)
        .set({
          ...(input.status ? { status: input.status } : {}),
          ...(publishedChange === undefined
            ? {}
            : {
                catalogPublished: publishedChange,
                catalogPublishedAt: publishedChange
                  ? (product.catalogPublishedAt ?? new Date())
                  : null,
              }),
        })
        .where(eq(products.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action:
          input.catalogPublished === undefined
            ? `marked product ${input.status}`
            : input.catalogPublished
              ? 'published product to catalog'
              : 'unpublished product',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.name,
      });

      return product.name;
    });
    return { name };
  });

/**
 * Manual stock correction.
 *
 * Deliberately an *adjustment movement*, not an edit to a stock level: there is
 * no stock level to edit. The reason is required, because an unexplained
 * adjustment is the one thing that makes an inventory ledger as untrustworthy
 * as the spreadsheet it replaced.
 */
export const adjustStock = writeAction
  .metadata({ action: 'adjusted', entity: 'stock' })
  .inputSchema(
    z.object({
      variantId: uuid,
      quantity: z.coerce
        .number()
        .int()
        .refine((value) => value !== 0, {
          message: 'Enter a positive or negative number of units',
        }),
      reason: z.string().trim().min(3, 'Say what happened').max(500),
      kind: z.enum(['adjustment', 'write_off', 'return']),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      // The rules live in `postManualAdjustment` (locked on-hand figure, never negative, valued at
      // the weighted average), shared with the stock count so the two cannot drift apart.
      const posted = await postManualAdjustment(tx, {
        variantId: input.variantId,
        quantity: input.quantity,
        kind: input.kind,
        reason: input.reason,
        memberId: ctx.member.id,
      });
      return { sku: posted.sku, onHand: posted.onHandAfter };
    });
    return result;
  });

/** Only for a product nothing has ever referenced. Anything with history is
 *  archived instead — see `setProductStatus`. `ownerAction`, matching the
 *  RLS policy: DELETE is granted to `private.is_owner()` only, and Drizzle
 *  bypasses RLS, so the app layer is what actually enforces this. */
export const deleteProduct = ownerAction
  .metadata({ action: 'deleted', entity: 'product' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const name = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (!product) throw new ActionError('That product no longer exists.');

      const variants = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, input.id));

      const ids = variants.map((variant) => variant.id);
      if (ids.length > 0) {
        // `inArray` rather than interpolating the array into a template: the
        // sql`` tag would bind it as a single parameter, and `variant_id IN $1`
        // silently matches nothing.
        const [movement] = await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(inArray(inventoryMovements.variantId, ids))
          .limit(1);
        const [sold] = await tx
          .select({ id: saleItems.id })
          .from(saleItems)
          .where(inArray(saleItems.variantId, ids))
          .limit(1);
        const [ordered] = await tx
          .select({ id: purchaseOrderItems.id })
          .from(purchaseOrderItems)
          .where(inArray(purchaseOrderItems.variantId, ids))
          .limit(1);
        // A quote request names the product itself, so it is history of its
        // own even when nothing was ever sold — and the FK is RESTRICT for
        // exactly that reason. Without this check the visitor's question
        // would take the product down with it via a raw constraint error.
        const [quoted] = await tx
          .select({ id: quoteRequests.id })
          .from(quoteRequests)
          .where(eq(quoteRequests.productId, input.id))
          .limit(1);

        const referenced = await variantsHaveReferences(tx, ids);

        if (movement || sold || ordered || quoted || referenced) {
          throw new ActionError(
            'This product has stock or trading history. Archive it instead of deleting it.',
          );
        }
      }

      await tx.delete(products).where(eq(products.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'deleted product',
        entityType: 'product',
        entityLabel: product.name,
      });

      return product.name;
    });
    return { name };
  });
