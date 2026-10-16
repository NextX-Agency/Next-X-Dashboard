import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** A stock / fulfillment location. Inventory movements remain backward
 * compatible with legacy global stock, while new reservations identify the
 * location that will supply the order. */
export const locations = pgTable(
  'locations',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    active: boolean().notNull().default(true),
    /** Legacy location fallback commission rate, stored as basis points. */
    commissionRateBps: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('locations_slug_key').on(t.slug),
    index('locations_active_idx').on(t.active),
  ],
);
