'use server';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  priceListItemSchema,
  priceListSchema,
  priceListUpdateSchema,
  storefrontLocationsSchema,
  storefrontPriceListSchema,
  storefrontProductBulkSchema,
  storefrontProductSchema,
  storefrontSchema,
  storefrontUpdateSchema,
} from '@/lib/schemas';
import { priceListCurrencyMatches } from '@/lib/storefront-rules';
import { db } from '../db/client';
import {
  locations,
  priceListItems,
  priceLists,
  products,
  productVariants,
  storefrontLocations,
  storefrontProducts,
  storefronts,
} from '../db/schema';
import type { Tx } from '../services/posting';
import { logActivity } from '../services/posting';
import { ActionError, writeAction } from './client';

async function assertPriceListCurrency(
  tx: Tx,
  storefrontId: string,
  priceListId: string | null | undefined,
  expectedCurrency?: 'USD' | 'SRD',
) {
  if (!priceListId) return;
  const [row] = await tx
    .select({
      storefrontCurrency: storefronts.defaultCurrency,
      priceCurrency: priceLists.currency,
    })
    .from(storefronts)
    .leftJoin(priceLists, eq(priceLists.id, priceListId))
    .where(eq(storefronts.id, storefrontId))
    .limit(1);
  if (!row) throw new ActionError('That storefront no longer exists.');
  if (!row.priceCurrency) throw new ActionError('Choose an existing price list.');
  if (
    !priceListCurrencyMatches(expectedCurrency ?? row.storefrontCurrency, row.priceCurrency)
  ) {
    throw new ActionError('The price list currency must match the storefront currency.');
  }
}

export const createPriceList = writeAction
  .metadata({ action: 'created', entity: 'price_list' })
  .inputSchema(priceListSchema)
  .action(async ({ parsedInput: input, ctx }) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(priceLists)
        .values(input)
        .returning({ id: priceLists.id, name: priceLists.name });
      if (!row) throw new ActionError('Could not create the price list.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created price list',
        entityType: 'price_list',
        entityId: row.id,
        entityLabel: row.name,
      });
      return row;
    }),
  );

export const updatePriceList = writeAction
  .metadata({ action: 'updated', entity: 'price_list' })
  .inputSchema(priceListUpdateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [used] = await tx
        .select({ id: storefronts.id, currency: storefronts.defaultCurrency })
        .from(storefronts)
        .where(eq(storefronts.defaultPriceListId, input.id))
        .limit(1);
      if (used && used.currency !== input.currency) {
        throw new ActionError('A price list assigned to a storefront cannot change currency.');
      }
      if (used && !input.active) {
        throw new ActionError('An assigned price list must remain active.');
      }
      const [row] = await tx
        .update(priceLists)
        .set({
          name: input.name,
          currency: input.currency,
          active: input.active,
          updatedAt: new Date(),
        })
        .where(eq(priceLists.id, input.id))
        .returning({ id: priceLists.id, name: priceLists.name });
      if (!row) throw new ActionError('That price list no longer exists.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated price list',
        entityType: 'price_list',
        entityId: row.id,
        entityLabel: row.name,
      });
      return row;
    });
    return result;
  });

export const upsertPriceListItem = writeAction
  .metadata({ action: 'updated', entity: 'price' })
  .inputSchema(priceListItemSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [priceList] = await tx
        .select({ id: priceLists.id, active: priceLists.active })
        .from(priceLists)
        .where(eq(priceLists.id, input.priceListId))
        .limit(1);
      if (!priceList) throw new ActionError('That price list no longer exists.');
      if (!priceList.active)
        throw new ActionError('Activate the price list before editing prices.');
      const [variant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.id, input.variantId))
        .limit(1);
      if (!variant) throw new ActionError('That product variant no longer exists.');
      const [row] = await tx
        .insert(priceListItems)
        .values({ ...input, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [priceListItems.priceListId, priceListItems.variantId],
          set: { amountCents: input.amountCents, updatedAt: new Date() },
        })
        .returning({ id: priceListItems.id });
      if (!row) throw new ActionError('Could not save the price.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated price',
        entityType: 'price_list_item',
        entityId: row.id,
        entityLabel: input.variantId,
      });
      return row;
    });
    return result;
  });

export const createStorefront = writeAction
  .metadata({ action: 'created', entity: 'storefront' })
  .inputSchema(storefrontSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      if (input.defaultPriceListId) {
        const [priceList] = await tx
          .select({ currency: priceLists.currency })
          .from(priceLists)
          .where(eq(priceLists.id, input.defaultPriceListId))
          .limit(1);
        if (!priceList) throw new ActionError('Choose an existing price list.');
        if (priceList.currency !== input.defaultCurrency) {
          throw new ActionError('The price list currency must match the storefront currency.');
        }
      }
      const [row] = await tx
        .insert(storefronts)
        .values({ ...input, defaultPriceListId: input.defaultPriceListId ?? null })
        .returning({ id: storefronts.id, name: storefronts.name, slug: storefronts.slug });
      if (!row) throw new ActionError('Could not create the storefront.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created storefront',
        entityType: 'storefront',
        entityId: row.id,
        entityLabel: row.name,
      });
      return row;
    });
    return result;
  });

export const updateStorefront = writeAction
  .metadata({ action: 'updated', entity: 'storefront' })
  .inputSchema(storefrontUpdateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      await assertPriceListCurrency(
        tx,
        input.id,
        input.defaultPriceListId,
        input.defaultCurrency,
      );
      const [row] = await tx
        .update(storefronts)
        .set({
          name: input.name,
          slug: input.slug,
          domain: input.domain ?? null,
          status: input.status,
          defaultCurrency: input.defaultCurrency,
          defaultLocale: input.defaultLocale,
          defaultPriceListId: input.defaultPriceListId ?? null,
          allowPickup: input.allowPickup,
          allowDelivery: input.allowDelivery,
          updatedAt: new Date(),
        })
        .where(eq(storefronts.id, input.id))
        .returning({ id: storefronts.id, name: storefronts.name });
      if (!row) throw new ActionError('That storefront no longer exists.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated storefront',
        entityType: 'storefront',
        entityId: row.id,
        entityLabel: row.name,
      });
      return row;
    });
    return result;
  });

export const setStorefrontProduct = writeAction
  .metadata({ action: 'updated', entity: 'storefront_product' })
  .inputSchema(storefrontProductSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);
      if (!product) throw new ActionError('That product no longer exists.');
      if (input.slugOverride) {
        const [duplicate] = await tx
          .select({ id: storefrontProducts.id })
          .from(storefrontProducts)
          .innerJoin(products, eq(products.id, storefrontProducts.productId))
          .where(
            and(
              eq(storefrontProducts.storefrontId, input.storefrontId),
              ne(storefrontProducts.productId, input.productId),
              sql`COALESCE(${storefrontProducts.slugOverride}, ${products.slug}) = ${input.slugOverride}`,
            ),
          )
          .limit(1);
        if (duplicate) throw new ActionError('That storefront slug is already in use.');
      }
      await tx
        .insert(storefrontProducts)
        .values(input)
        .onConflictDoUpdate({
          target: [storefrontProducts.storefrontId, storefrontProducts.productId],
          set: { ...input, updatedAt: new Date() },
        });
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.visible
          ? 'published storefront product'
          : 'unpublished storefront product',
        entityType: 'storefront_product',
        entityId: input.productId,
        entityLabel: product.slug,
      });
      return input;
    });
    return result;
  });

export const bulkSetStorefrontProducts = writeAction
  .metadata({ action: 'updated', entity: 'storefront_product' })
  .inputSchema(storefrontProductBulkSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const productsFound = await tx
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, input.productIds));
      if (productsFound.length !== input.productIds.length) {
        throw new ActionError('One or more selected products no longer exist.');
      }
      for (const productId of input.productIds) {
        await tx
          .insert(storefrontProducts)
          .values({ storefrontId: input.storefrontId, productId, visible: input.visible })
          .onConflictDoUpdate({
            target: [storefrontProducts.storefrontId, storefrontProducts.productId],
            set: { visible: input.visible, updatedAt: new Date() },
          });
      }
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.visible
          ? 'published storefront products'
          : 'unpublished storefront products',
        entityType: 'storefront',
        entityId: input.storefrontId,
        entityLabel: `${input.productIds.length} products`,
      });
      return { count: input.productIds.length };
    });
    return result;
  });

export const setStorefrontLocations = writeAction
  .metadata({ action: 'updated', entity: 'storefront_location' })
  .inputSchema(storefrontLocationsSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const found = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(inArray(locations.id, input.locationIds));
      if (found.length !== input.locationIds.length) {
        throw new ActionError('One or more selected locations no longer exist.');
      }
      await tx
        .delete(storefrontLocations)
        .where(eq(storefrontLocations.storefrontId, input.storefrontId));
      if (input.locationIds.length) {
        await tx.insert(storefrontLocations).values(
          input.locationIds.map((locationId, index) => ({
            storefrontId: input.storefrontId,
            locationId,
            active: true,
            priority: index,
          })),
        );
      }
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated storefront locations',
        entityType: 'storefront',
        entityId: input.storefrontId,
        entityLabel: `${input.locationIds.length} locations`,
      });
      return { count: input.locationIds.length };
    });
    return result;
  });

export const setStorefrontPriceList = writeAction
  .metadata({ action: 'updated', entity: 'storefront' })
  .inputSchema(storefrontPriceListSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      await assertPriceListCurrency(tx, input.storefrontId, input.priceListId);
      const [priceList] = await tx
        .select({ active: priceLists.active })
        .from(priceLists)
        .where(eq(priceLists.id, input.priceListId))
        .limit(1);
      if (!priceList?.active) throw new ActionError('Assign an active price list.');
      const [row] = await tx
        .update(storefronts)
        .set({ defaultPriceListId: input.priceListId, updatedAt: new Date() })
        .where(eq(storefronts.id, input.storefrontId))
        .returning({ id: storefronts.id, name: storefronts.name });
      if (!row) throw new ActionError('That storefront no longer exists.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'assigned storefront price list',
        entityType: 'storefront',
        entityId: row.id,
        entityLabel: row.name,
      });
      return row;
    });
    return result;
  });
