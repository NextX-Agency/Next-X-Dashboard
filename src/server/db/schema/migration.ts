import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customers, productVariants } from './catalog';
import { currencyCode } from './enums';
import { locations } from './locations';
import { bundles } from './planning';

/** Exact source catalog prices that need explicit conversion to currency minor
 * units. This import-only archive is revoked from API roles by migration. */
export const legacyCatalogPriceArchive = pgTable(
  'legacy_catalog_price_archive',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceEntity: text().notNull(),
    legacyId: text().notNull(),
    currency: currencyCode().notNull(),
    sourceAmount: text().notNull(),
    roundedSourceCents: bigint({ mode: 'number' }).notNull(),
    roundingRule: text().notNull(),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('legacy_catalog_price_archive_source_key').on(
      t.sourceEntity,
      t.legacyId,
      t.currency,
    ),
  ],
);

/** Historical automated payout runs are retained verbatim but never imported
 * as current drafts or replayed as wallet activity. Runtime roles cannot read
 * this migration-only archive. */
export const legacyPayoutRunArchive = pgTable(
  'legacy_payout_run_archive',
  {
    id: uuid().primaryKey(),
    legacyId: text().notNull(),
    sourceRecord: jsonb().notNull(),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('legacy_payout_run_archive_legacy_id_key').on(t.legacyId),
    check(
      'legacy_payout_run_archive_source_record_object',
      sql`jsonb_typeof(${t.sourceRecord}) = 'object'`,
    ),
  ],
);

/** Historical stock transfers are retained without replaying them into the
 * opening stock ledger, which would change the imported on-hand balances. */
export const legacyStockTransferArchive = pgTable(
  'legacy_stock_transfer_archive',
  {
    id: uuid().primaryKey().defaultRandom(),
    legacyId: text().notNull(),
    legacyItemId: text().notNull(),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    bundleId: uuid().references(() => bundles.id, { onDelete: 'restrict' }),
    legacyFromLocationId: text().notNull(),
    fromLocationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    legacyToLocationId: text().notNull(),
    toLocationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    quantity: integer().notNull(),
    sourceNotes: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('legacy_stock_transfer_archive_legacy_id_key').on(t.legacyId),
    check('legacy_stock_transfer_archive_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'legacy_stock_transfer_archive_distinct_locations',
      sql`${t.fromLocationId} <> ${t.toLocationId}`,
    ),
    check(
      'legacy_stock_transfer_archive_single_catalog_target',
      sql`(${t.variantId} IS NOT NULL) <> (${t.bundleId} IS NOT NULL)`,
    ),
  ],
);

/** Completed legacy reservations whose source has no authoritative link to the
 * sale that fulfilled them. The fulfilling sales are imported on their own, so
 * these rows are kept as history only: no order, stock or ledger effect. */
export const legacyReservationArchive = pgTable(
  'legacy_reservation_archive',
  {
    id: uuid().primaryKey().defaultRandom(),
    legacyId: text().notNull(),
    legacyItemId: text().notNull(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    legacyLocationId: text().notNull(),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    legacyClientId: text(),
    customerId: uuid().references(() => customers.id, { onDelete: 'restrict' }),
    quantity: integer().notNull(),
    sourceStatus: text().notNull(),
    sourceNotes: text(),
    reservedAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('legacy_reservation_archive_legacy_id_key').on(t.legacyId),
    check('legacy_reservation_archive_quantity_positive', sql`${t.quantity} > 0`),
  ],
);
