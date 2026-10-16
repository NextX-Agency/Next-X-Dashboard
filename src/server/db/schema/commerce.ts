import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { productVariants } from './catalog';
import { fulfillmentStatus, fulfillmentType, reservationStatus } from './enums';
import { members } from './identity';
import { locations } from './locations';
import { orderItems, orders } from './sales';

/** One operational fulfillment record per canonical order. Delivery is only a
 * destination snapshot here; dispatch and routing are intentionally deferred. */
export const orderFulfillments = pgTable(
  'order_fulfillments',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: fulfillmentType().notNull().default('pickup'),
    status: fulfillmentStatus().notNull().default('pending'),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    requestedAt: timestamp({ withTimezone: true }),
    scheduledFor: timestamp({ withTimezone: true }),
    deliveryAddress: text(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_fulfillments_order_key').on(t.orderId),
    index('order_fulfillments_location_idx').on(t.locationId, t.status),
  ],
);

/** A claim against stock, separate from physical inventory movements. */
export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    quantity: integer().notNull(),
    status: reservationStatus().notNull().default('active'),
    expiresAt: timestamp({ withTimezone: true }),
    releasedAt: timestamp({ withTimezone: true }),
    consumedAt: timestamp({ withTimezone: true }),
    createdById: uuid().references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_reservations_order_idx').on(t.orderId),
    index('inventory_reservations_item_idx').on(t.orderItemId),
    index('inventory_reservations_variant_location_idx').on(
      t.variantId,
      t.locationId,
      t.status,
    ),
    index('inventory_reservations_expiry_idx').on(t.status, t.expiresAt),
  ],
);
