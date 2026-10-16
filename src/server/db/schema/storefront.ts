import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products, productVariants } from './catalog';
import { currencyCode, storefrontStatus } from './enums';
import { locations } from './locations';

/** A sales presentation/channel over the shared catalog, price and stock. */
export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    currency: currencyCode().notNull(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_lists_active_idx').on(t.active),
    uniqueIndex('price_lists_name_currency_key').on(t.name, t.currency),
  ],
);

/** One exact minor-unit price per SKU in a price list. */
export const priceListItems = pgTable(
  'price_list_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    priceListId: uuid()
      .notNull()
      .references(() => priceLists.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    amountCents: bigint({ mode: 'number' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('price_list_items_price_list_variant_key').on(t.priceListId, t.variantId),
    index('price_list_items_variant_idx').on(t.variantId),
  ],
);

export const storefronts = pgTable(
  'storefronts',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    domain: text(),
    status: storefrontStatus().notNull().default('draft'),
    defaultCurrency: currencyCode().notNull().default('USD'),
    defaultLocale: text().notNull().default('en-SR'),
    defaultPriceListId: uuid().references(() => priceLists.id, { onDelete: 'restrict' }),
    description: text(),
    logoUrl: text(),
    heroTitle: text(),
    heroSubtitle: text(),
    heroImageUrl: text(),
    heroMobileImageUrl: text(),
    allowPickup: boolean().notNull().default(false),
    allowDelivery: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('storefronts_slug_key').on(t.slug),
    uniqueIndex('storefronts_domain_key').on(t.domain),
    index('storefronts_status_idx').on(t.status),
  ],
);

/** Exposure only. Product, variant and inventory records stay canonical. */
export const storefrontProducts = pgTable(
  'storefront_products',
  {
    id: uuid().primaryKey().defaultRandom(),
    storefrontId: uuid()
      .notNull()
      .references(() => storefronts.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    visible: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    featured: boolean().notNull().default(false),
    titleOverride: text(),
    descriptionOverride: text(),
    slugOverride: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('storefront_products_storefront_product_key').on(t.storefrontId, t.productId),
    index('storefront_products_visibility_idx').on(t.storefrontId, t.visible, t.sortOrder),
    index('storefront_products_product_idx').on(t.productId),
  ],
);

export const storefrontLocations = pgTable(
  'storefront_locations',
  {
    storefrontId: uuid()
      .notNull()
      .references(() => storefronts.id, { onDelete: 'cascade' }),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    active: boolean().notNull().default(true),
    priority: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('storefront_locations_key').on(t.storefrontId, t.locationId),
    index('storefront_locations_active_idx').on(t.storefrontId, t.active, t.priority),
  ],
);
