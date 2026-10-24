'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { normaliseToUsd } from '@/lib/fx';
import { formatMoney } from '@/lib/money';
import { assertOrderTransition, type OrderStatus } from '@/lib/order-state';
import { orderIdSchema, orderSchema } from '@/lib/schemas';
import { db } from '../db/client';
import {
  inventoryReservations,
  locations,
  orderFulfillments,
  orderItems,
  orders,
  products,
  productVariants,
  saleItems,
} from '../db/schema';
import {
  consumeStockFor,
  lockVariant,
  logActivity,
  nextDocumentNumber,
  type Tx,
} from '../services/posting';
import {
  createReservation,
  getAvailability,
  releaseExpiredReservations,
} from '../services/reservations';
import { heldOnSale } from '../services/sale-money';
import { ActionError, writeAction } from './client';

type OrderRow = typeof orders.$inferSelect;

async function lockOrder(tx: Tx, id: string): Promise<OrderRow | undefined> {
  await tx.execute(sql`SELECT id FROM sales WHERE id = ${id} FOR UPDATE`);
  const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
  return order;
}

function requireTransition(from: OrderStatus, to: OrderStatus) {
  try {
    assertOrderTransition(from, to);
  } catch {
    throw new ActionError(`That order cannot move from ${from} to ${to}.`);
  }
}

async function assertActiveLocation(tx: Tx, locationId: string): Promise<void> {
  const [location] = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.active, true)))
    .limit(1);
  if (!location) throw new ActionError('Choose an active fulfillment location.');
}

async function loadOrderVariants(tx: Tx, variantIds: string[]) {
  const rows = await tx
    .select({
      id: productVariants.id,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      active: productVariants.isActive,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, [...new Set(variantIds)]));

  if (
    rows.length !== new Set(variantIds).size ||
    rows.some((row) => !row.active || row.productStatus === 'archived')
  ) {
    throw new ActionError('Every order item must be an active product variant.');
  }
  return new Map(rows.map((row) => [row.id, row]));
}

/** Create a draft canonical order. No inventory is promised until confirmOrder. */
export const createOrder = writeAction
  .metadata({ action: 'created', entity: 'order' })
  .inputSchema(orderSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      // Same retry/double-click guard as createSale: the second request waits
      // for the first and gets its order back instead of a duplicate draft.
      if (input.idempotencyKey) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${input.idempotencyKey}`}, 0))`,
        );
        const [existing] = await tx
          .select({ id: orders.id, number: orders.number })
          .from(orders)
          .where(eq(orders.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (existing) return { ...existing, reused: true as const };
      }
      await assertActiveLocation(tx, input.locationId);
      const variants = await loadOrderVariants(
        tx,
        input.items.map((item) => item.variantId),
      );
      const rateMicros =
        input.currency === 'SRD'
          ? await sqlRateOn(tx, input.orderDate)
          : await sqlRateForRecord(tx, input.orderDate);
      const number = await nextDocumentNumber(tx, 'ORD-');

      const [order] = await tx
        .insert(orders)
        .values({
          number,
          customerId: input.customerId,
          status: 'draft',
          workflowStatus: 'draft',
          source: input.source,
          storefrontId: input.storefrontId ?? null,
          locationId: input.locationId,
          currency: input.currency,
          fxRateMicros: rateMicros,
          paymentMethod: input.paymentMethod,
          soldAt: input.orderDate,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning({ id: orders.id });
      if (!order) throw new ActionError('Could not create the order.');

      let totalCents = 0;
      for (const [position, item] of input.items.entries()) {
        const variant = variants.get(item.variantId);
        if (!variant) throw new ActionError('One order item no longer exists.');
        const lineTotalCents = item.unitPriceCents * item.quantity;
        const lineTotalUsdCents = normaliseToUsd(lineTotalCents, input.currency, rateMicros);
        totalCents += lineTotalCents;
        await tx.insert(orderItems).values({
          saleId: order.id,
          variantId: item.variantId,
          productNameSnapshot: variant.productName,
          variantNameSnapshot: variant.variantName,
          skuSnapshot: variant.sku,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          // The exact extended amount: documents read it, and it used to be
          // left at 0 on every order line.
          lineTotalCents,
          unitPriceUsdCents: normaliseToUsd(item.unitPriceCents, input.currency, rateMicros),
          lineTotalUsdCents,
          position: position + 1,
        });
      }

      await tx
        .update(orders)
        .set({
          totalCents,
          // Converted once for the document, the way a payment is converted.
          totalUsdCents: normaliseToUsd(totalCents, input.currency, rateMicros),
          grossProfitCents: normaliseToUsd(totalCents, input.currency, rateMicros),
        })
        .where(eq(orders.id, order.id));

      await tx.insert(orderFulfillments).values({
        orderId: order.id,
        type: input.fulfillmentType,
        status: 'pending',
        locationId: input.locationId,
        requestedAt: input.orderDate,
        scheduledFor: input.scheduledFor ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        notes: input.fulfillmentNotes ?? null,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created order',
        entityType: 'order',
        entityId: order.id,
        entityLabel: number,
      });
      return { id: order.id, number, reused: false as const };
    });
    return result;
  });

/** Confirm atomically reserves every stock-tracked line. Variant row locks
 * serialize competing confirmations for the last available unit. */
export const confirmOrder = writeAction
  .metadata({ action: 'confirmed', entity: 'order' })
  .inputSchema(orderIdSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, input.id);
      if (!order) throw new ActionError('That order no longer exists.');
      requireTransition(order.workflowStatus as OrderStatus, 'confirmed');

      const [fulfillment] = await tx
        .select()
        .from(orderFulfillments)
        .where(eq(orderFulfillments.orderId, order.id))
        .limit(1);
      const locationId = fulfillment?.locationId ?? order.locationId;
      if (!locationId) throw new ActionError('That order has no fulfillment location.');
      await assertActiveLocation(tx, locationId);
      await releaseExpiredReservations(tx, locationId);

      const items = await tx.select().from(orderItems).where(eq(orderItems.saleId, order.id));
      if (items.length === 0) throw new ActionError('An order needs at least one item.');

      const variantIds = [...new Set(items.map((item) => item.variantId))].sort();
      for (const variantId of variantIds) await lockVariant(tx, variantId);

      const requested = new Map<string, number>();
      for (const item of items)
        requested.set(item.variantId, (requested.get(item.variantId) ?? 0) + item.quantity);
      for (const variantId of variantIds) {
        const availability = await getAvailability(tx, variantId, locationId);
        const needed = requested.get(variantId) ?? 0;
        if (availability.available < needed) {
          throw new ActionError(
            `Not enough stock to confirm this order. ${needed} requested, ${availability.available} available.`,
          );
        }
      }

      for (const item of items) {
        await createReservation(tx, {
          orderId: order.id,
          orderItemId: item.id,
          variantId: item.variantId,
          locationId,
          quantity: item.quantity,
          createdById: ctx.member.id,
        });
      }

      await tx
        .update(orders)
        .set({ status: 'confirmed', workflowStatus: 'confirmed', locationId })
        .where(eq(orders.id, order.id));
      await tx
        .update(orderFulfillments)
        .set({ locationId, status: 'pending' })
        .where(eq(orderFulfillments.orderId, order.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'confirmed order',
        entityType: 'order',
        entityId: order.id,
        entityLabel: order.number,
      });
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'reserved inventory',
        entityType: 'order',
        entityId: order.id,
        entityLabel: order.number,
      });
      return order.number;
    });
    return { number };
  });

export const markOrderReady = writeAction
  .metadata({ action: 'marked ready', entity: 'order' })
  .inputSchema(orderIdSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, input.id);
      if (!order) throw new ActionError('That order no longer exists.');
      requireTransition(order.workflowStatus as OrderStatus, 'ready');
      await tx.update(orders).set({ workflowStatus: 'ready' }).where(eq(orders.id, order.id));
      await tx
        .update(orderFulfillments)
        .set({ status: 'ready' })
        .where(eq(orderFulfillments.orderId, order.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'marked order ready',
        entityType: 'order',
        entityId: order.id,
        entityLabel: order.number,
      });
      return order.number;
    });
    return { number };
  });

/** Completion consumes active reservations and posts outbound movements in the
 * same transaction as the order transition. */
export const completeOrder = writeAction
  .metadata({ action: 'completed', entity: 'order' })
  .inputSchema(orderIdSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, input.id);
      if (!order) throw new ActionError('That order no longer exists.');
      if (order.workflowStatus !== 'confirmed' && order.workflowStatus !== 'ready') {
        throw new ActionError('Only a confirmed or ready order can be completed.');
      }
      const reservations = await tx
        .select()
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.orderId, order.id),
            eq(inventoryReservations.status, 'active'),
          ),
        );
      const items = await tx.select().from(orderItems).where(eq(orderItems.saleId, order.id));
      if (reservations.length !== items.length) {
        throw new ActionError(
          'This order does not have a complete active inventory reservation.',
        );
      }

      const variantIds = [
        ...new Set(reservations.map((reservation) => reservation.variantId)),
      ].sort();
      for (const variantId of variantIds) await lockVariant(tx, variantId);

      const cogsByItem = new Map<string, number>();
      for (const reservation of reservations) {
        const availability = await getAvailability(
          tx,
          reservation.variantId,
          reservation.locationId,
        );
        if (availability.onHand < reservation.quantity) {
          throw new ActionError(
            `Stock changed before completion. ${reservation.quantity} units are reserved, but only ${availability.onHand} remain on hand.`,
          );
        }
        const consumed = await consumeStockFor(tx, {
          variantId: reservation.variantId,
          quantity: reservation.quantity,
          locationId: reservation.locationId,
          sourceKind: 'sale',
          sourceId: order.id,
          occurredAt: order.soldAt,
          memberId: ctx.member.id,
          note: `${order.number} fulfillment at weighted-average landed cost.`,
        });
        cogsByItem.set(
          reservation.orderItemId,
          (cogsByItem.get(reservation.orderItemId) ?? 0) + consumed.cogsCents,
        );
        await tx
          .update(inventoryReservations)
          .set({ status: 'consumed', consumedAt: new Date() })
          .where(eq(inventoryReservations.id, reservation.id));
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'consumed inventory reservation',
          entityType: 'inventory_reservation',
          entityId: reservation.id,
          entityLabel: order.number,
        });
      }

      let cogsCents = 0;
      for (const item of items) {
        const cogs = cogsByItem.get(item.id) ?? 0;
        cogsCents += cogs;
        await tx.update(saleItems).set({ cogsCents: cogs }).where(eq(saleItems.id, item.id));
      }
      await tx
        .update(orders)
        .set({
          status: 'confirmed',
          workflowStatus: 'completed',
          // An invoice can only exist for goods that left; numbered here, in
          // the same series as a directly recorded sale.
          invoiceNumber: order.invoiceNumber ?? (await nextDocumentNumber(tx, 'INV-')),
          cogsCents,
          grossProfitCents: order.totalUsdCents - cogsCents,
        })
        .where(eq(orders.id, order.id));
      await tx
        .update(orderFulfillments)
        .set({ status: 'fulfilled' })
        .where(eq(orderFulfillments.orderId, order.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'completed order',
        entityType: 'order',
        entityId: order.id,
        entityLabel: order.number,
      });
      return order.number;
    });
    return { number };
  });

export const cancelOrder = writeAction
  .metadata({ action: 'cancelled', entity: 'order' })
  .inputSchema(orderIdSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, input.id);
      if (!order) throw new ActionError('That order no longer exists.');
      if (order.workflowStatus === 'completed') {
        throw new ActionError(
          'A completed order needs a return/refund workflow; it cannot be cancelled.',
        );
      }
      requireTransition(order.workflowStatus as OrderStatus, 'cancelled');
      const held = await heldOnSale(tx, order.id);
      if (held > 0) {
        throw new ActionError(
          `${formatMoney(held, order.currency)} has been received on this order and not paid back. Refund it first (or void the payment if it was a mistake), then cancel.`,
        );
      }
      const active = await tx
        .select({ id: inventoryReservations.id })
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.orderId, order.id),
            eq(inventoryReservations.status, 'active'),
          ),
        );
      if (active.length > 0) {
        await tx
          .update(inventoryReservations)
          .set({ status: 'released', releasedAt: new Date() })
          .where(
            and(
              eq(inventoryReservations.orderId, order.id),
              eq(inventoryReservations.status, 'active'),
            ),
          );
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'released inventory reservations',
          entityType: 'order',
          entityId: order.id,
          entityLabel: order.number,
        });
      }
      await tx
        .update(orders)
        .set({ status: 'void', workflowStatus: 'cancelled' })
        .where(eq(orders.id, order.id));
      await tx
        .update(orderFulfillments)
        .set({ status: 'cancelled' })
        .where(eq(orderFulfillments.orderId, order.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'cancelled order',
        entityType: 'order',
        entityId: order.id,
        entityLabel: order.number,
      });
      return order.number;
    });
    return { number };
  });

// Keep the rate lookups behind tiny wrappers so this module's transaction
// workflow stays readable and all pricing still uses the existing FX service.
import { rateForRecord, rateOn } from '../services/rates';

async function sqlRateOn(tx: Tx, date: Date) {
  return rateOn(date, tx);
}
async function sqlRateForRecord(tx: Tx, date: Date) {
  return rateForRecord(date, tx);
}
