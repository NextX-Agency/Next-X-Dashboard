'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { uuid } from '@/lib/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '../db/client';
import { productImages, products, productVariants } from '../db/schema';
import { deleteProductImageBlobs, recordProductImage } from '../services/media';
import { logActivity } from '../services/posting';
import { ActionError, ownerAction, writeAction } from './client';

/**
 * Product images. See docs/04-engineering/media-pipeline.md for the pipeline
 * these actions sit downstream of; `services/media.ts` validates uploads,
 * creates the public derivatives and records them in the product gallery.
 */

const productImageType = z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** Issues a path-scoped, short-lived upload token after the member is checked. */
export const startProductImageUpload = writeAction
  .metadata({ action: 'started upload', entity: 'product image' })
  .inputSchema(z.object({ productId: uuid, contentType: productImageType }))
  .action(async ({ parsedInput: input }) => {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new ActionError('That product no longer exists.');

    const path = `products/${input.productId}/${crypto.randomUUID()}`;
    const { data, error } = await createAdminClient()
      .storage.from('nextly-product-staging')
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) {
      throw new ActionError('Image uploads are not configured. Please contact the owner.');
    }
    return { path: data.path, token: data.token };
  });

export const finalizeProductImageUpload = writeAction
  .metadata({ action: 'uploaded', entity: 'product image' })
  .inputSchema(
    z.object({
      productId: uuid,
      pathname: z.string().min(1).max(300),
      alt: z.string().trim().max(200).optional(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const image = await recordProductImage(tx, {
        productId: input.productId,
        uploadPathname: input.pathname,
        alt: input.alt,
      });

      if (image) {
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'uploaded product image',
          entityType: 'product',
          entityId: input.productId,
        });
      }

      return image;
    });
    return result;
  });

/** `ownerAction`, matching the RLS policy: DELETE on product_images is
 *  granted to `private.is_owner()` only, and Drizzle bypasses RLS, so the
 *  app layer is what actually enforces this. */
export const removeProductImage = ownerAction
  .metadata({ action: 'deleted', entity: 'product image' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [image] = await tx
        .select()
        .from(productImages)
        .where(eq(productImages.id, input.id))
        .limit(1);

      if (!image) throw new ActionError('That image no longer exists.');

      await tx.delete(productImages).where(eq(productImages.id, input.id));

      // A primary image that just got deleted needs a successor, or the
      // product silently has none — promote whichever sorts first.
      if (image.isPrimary) {
        const [next] = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(eq(productImages.productId, image.productId))
          .orderBy(productImages.position)
          .limit(1);
        if (next) {
          await tx
            .update(productImages)
            .set({ isPrimary: true })
            .where(eq(productImages.id, next.id));
        }
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'deleted product image',
        entityType: 'product',
        entityId: image.productId,
      });

      await deleteProductImageBlobs(image);
    });
    return { id: input.id };
  });

export const setPrimaryProductImage = writeAction
  .metadata({ action: 'updated', entity: 'product image' })
  .inputSchema(z.object({ id: uuid, productId: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [image] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(
          and(eq(productImages.id, input.id), eq(productImages.productId, input.productId)),
        )
        .limit(1);
      if (!image) throw new ActionError('That image does not belong to this product.');

      await tx
        .update(productImages)
        .set({ isPrimary: false })
        .where(eq(productImages.productId, input.productId));
      await tx
        .update(productImages)
        .set({ isPrimary: true })
        .where(eq(productImages.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'set primary product image',
        entityType: 'product',
        entityId: input.productId,
      });
    });
    return { id: input.id };
  });

const imagePurpose = z.enum(['product', 'packaging', 'lifestyle', 'box_contents']);

/** Update customer-facing image context without changing the upload pipeline. */
export const updateProductImageDetails = writeAction
  .metadata({ action: 'updated', entity: 'product image' })
  .inputSchema(
    z.object({
      id: uuid,
      productId: uuid,
      alt: z.string().trim().max(200).nullable(),
      purpose: imagePurpose,
      variantId: uuid.nullable(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [image] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(
          and(eq(productImages.id, input.id), eq(productImages.productId, input.productId)),
        )
        .limit(1);
      if (!image) throw new ActionError('That image does not belong to this product.');

      if (input.variantId) {
        const [variant] = await tx
          .select({ productId: productVariants.productId })
          .from(productVariants)
          .where(eq(productVariants.id, input.variantId))
          .limit(1);
        if (!variant || variant.productId !== input.productId)
          throw new ActionError('Choose a variant from this product.');
      }

      await tx
        .update(productImages)
        .set({ alt: input.alt || null, purpose: input.purpose, variantId: input.variantId })
        .where(eq(productImages.id, input.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated product image details',
        entityType: 'product',
        entityId: input.productId,
      });
    });
    return { id: input.id };
  });

export const reorderProductImages = writeAction
  .metadata({ action: 'updated', entity: 'product image' })
  .inputSchema(z.object({ productId: uuid, orderedIds: z.array(uuid).min(1) }))
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      if (new Set(input.orderedIds).size !== input.orderedIds.length) {
        throw new ActionError('An image can only appear once in the new order.');
      }

      const rows = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.productId, input.productId));
      const actualIds = new Set(rows.map((row) => row.id));
      if (
        actualIds.size !== input.orderedIds.length ||
        input.orderedIds.some((id) => !actualIds.has(id))
      ) {
        throw new ActionError('The image order must contain every image for this product.');
      }

      for (const [index, id] of input.orderedIds.entries()) {
        await tx.update(productImages).set({ position: index }).where(eq(productImages.id, id));
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'reordered product images',
        entityType: 'product',
        entityId: input.productId,
      });
    });
    return { productId: input.productId };
  });
