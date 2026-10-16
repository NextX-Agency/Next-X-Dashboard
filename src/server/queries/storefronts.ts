import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { clampPage, clampPerPage, type Page, toPage } from './paginate';
import { maybe, num, text } from './row';

export type StorefrontListRow = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: 'draft' | 'active' | 'inactive';
  currency: 'USD' | 'SRD';
  priceListName: string | null;
  productCount: number;
  visibleCount: number;
  locationCount: number;
};

export async function listStorefronts(): Promise<StorefrontListRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id, s.name, s.slug, s.domain, s.status::text, s.default_currency::text,
           pl.name AS price_list_name,
           COUNT(DISTINCT sp.product_id)::text AS product_count,
           COUNT(DISTINCT sp.product_id) FILTER (WHERE sp.visible)::text AS visible_count,
           COUNT(DISTINCT sl.location_id) FILTER (WHERE sl.active)::text AS location_count
      FROM storefronts s
      LEFT JOIN price_lists pl ON pl.id = s.default_price_list_id
      LEFT JOIN storefront_products sp ON sp.storefront_id = s.id
      LEFT JOIN storefront_locations sl ON sl.storefront_id = s.id
     GROUP BY s.id, pl.name
     ORDER BY s.name
  `);
  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    domain: maybe(row.domain),
    status: text(row.status, 'draft') as StorefrontListRow['status'],
    currency: text(row.default_currency, 'USD') as StorefrontListRow['currency'],
    priceListName: maybe(row.price_list_name),
    productCount: num(row.product_count),
    visibleCount: num(row.visible_count),
    locationCount: num(row.location_count),
  }));
}

export type StorefrontAdminDetail = StorefrontListRow & {
  defaultPriceListId: string | null;
  defaultLocale: string;
  allowPickup: boolean;
  allowDelivery: boolean;
};

export async function getStorefrontAdmin(id: string): Promise<StorefrontAdminDetail | null> {
  if (!isDatabaseConfigured()) return null;
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id, s.name, s.slug, s.domain, s.status::text, s.default_currency::text,
           s.default_locale, s.default_price_list_id, s.allow_pickup::text, s.allow_delivery::text,
           pl.name AS price_list_name,
           COUNT(DISTINCT sp.product_id)::text AS product_count,
           COUNT(DISTINCT sp.product_id) FILTER (WHERE sp.visible)::text AS visible_count,
           COUNT(DISTINCT sl.location_id) FILTER (WHERE sl.active)::text AS location_count
      FROM storefronts s
      LEFT JOIN price_lists pl ON pl.id = s.default_price_list_id
      LEFT JOIN storefront_products sp ON sp.storefront_id = s.id
      LEFT JOIN storefront_locations sl ON sl.storefront_id = s.id
     WHERE s.id = ${id}
     GROUP BY s.id, pl.name
     LIMIT 1
  `);
  if (!row) return null;
  return {
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    domain: maybe(row.domain),
    status: text(row.status, 'draft') as StorefrontAdminDetail['status'],
    currency: text(row.default_currency, 'USD') as StorefrontAdminDetail['currency'],
    defaultPriceListId: maybe(row.default_price_list_id),
    defaultLocale: text(row.default_locale, 'en-SR'),
    allowPickup: row.allow_pickup === 'true',
    allowDelivery: row.allow_delivery === 'true',
    priceListName: maybe(row.price_list_name),
    productCount: num(row.product_count),
    visibleCount: num(row.visible_count),
    locationCount: num(row.location_count),
  };
}

export type StorefrontProductAdminRow = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  categoryName: string | null;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  visible: boolean;
  featured: boolean;
  variantCount: number;
  pricedVariantCount: number;
};

export async function listStorefrontProductsAdmin(
  storefrontId: string,
  query: { q?: string; page?: number; perPage?: number } = {},
): Promise<Page<StorefrontProductAdminRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);
  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);
  const term = query.q?.trim() ? `%${query.q.trim()}%` : null;
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT sp.id, p.id AS product_id, p.name, p.slug, c.name AS category_name,
           p.status::text, p.catalog_published::text, sp.visible::text, sp.featured::text,
           (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_count,
           (SELECT COUNT(*) FROM product_variants v
             JOIN price_list_items pli ON pli.variant_id = v.id
             JOIN storefronts ss ON ss.default_price_list_id = pli.price_list_id
            WHERE v.product_id = p.id AND ss.id = sp.storefront_id AND pli.amount_cents > 0)::text AS priced_variant_count,
           COUNT(*) OVER()::text AS total_count
      FROM products p
      LEFT JOIN storefront_products sp
        ON sp.product_id = p.id AND sp.storefront_id = ${storefrontId}
      LEFT JOIN categories c ON c.id = p.category_id
     WHERE (${term}::text IS NULL OR p.name ILIKE ${term} OR p.slug ILIKE ${term} OR p.code ILIKE ${term})
     ORDER BY COALESCE(sp.visible, false) DESC, COALESCE(sp.featured, false) DESC, COALESCE(sp.sort_order, 0), p.name
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);
  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      productId: text(row.product_id),
      name: text(row.name),
      slug: text(row.slug),
      categoryName: maybe(row.category_name),
      status: text(row.status, 'draft') as StorefrontProductAdminRow['status'],
      catalogPublished: row.catalog_published === 'true',
      visible: row.visible === 'true',
      featured: row.featured === 'true',
      variantCount: num(row.variant_count),
      pricedVariantCount: num(row.priced_variant_count),
    })),
    num(rows[0]?.total_count),
    page,
    perPage,
  );
}

export type PriceListRow = {
  id: string;
  name: string;
  currency: 'USD' | 'SRD';
  active: boolean;
  itemCount: number;
  assignedStorefrontCount: number;
};

export async function listPriceLists(): Promise<PriceListRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT pl.id, pl.name, pl.currency::text, pl.active::text,
           COUNT(DISTINCT pli.variant_id)::text AS item_count,
           COUNT(DISTINCT s.id)::text AS assigned_storefront_count
      FROM price_lists pl
      LEFT JOIN price_list_items pli ON pli.price_list_id = pl.id
      LEFT JOIN storefronts s ON s.default_price_list_id = pl.id
     GROUP BY pl.id
     ORDER BY pl.active DESC, pl.name
  `);
  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    currency: text(row.currency, 'USD') as PriceListRow['currency'],
    active: row.active === 'true',
    itemCount: num(row.item_count),
    assignedStorefrontCount: num(row.assigned_storefront_count),
  }));
}

export type PriceListItemAdminRow = {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  amountCents: Cents;
};

export async function getPriceListAdmin(
  id: string,
  query: { q?: string; page?: number; perPage?: number } = {},
) {
  if (!isDatabaseConfigured()) return null;
  const [header] = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, currency::text, active::text FROM price_lists WHERE id = ${id} LIMIT 1
  `);
  if (!header) return null;
  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);
  const term = query.q?.trim() ? `%${query.q.trim()}%` : null;
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT pli.id, pli.variant_id, p.name AS product_name, v.name AS variant_name,
           v.sku, pli.amount_cents::text,
           COUNT(*) OVER()::text AS total_count
      FROM price_list_items pli
      JOIN product_variants v ON v.id = pli.variant_id
      JOIN products p ON p.id = v.product_id
     WHERE pli.price_list_id = ${id}
       AND (${term}::text IS NULL OR p.name ILIKE ${term} OR v.name ILIKE ${term} OR v.sku ILIKE ${term})
     ORDER BY p.name, v.position, v.name
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);
  return {
    id: text(header.id),
    name: text(header.name),
    currency: text(header.currency, 'USD') as 'USD' | 'SRD',
    active: header.active === 'true',
    items: toPage(
      rows.map((row) => ({
        id: text(row.id),
        variantId: text(row.variant_id),
        productName: text(row.product_name),
        variantName: text(row.variant_name),
        sku: text(row.sku),
        amountCents: num(row.amount_cents),
      })),
      num(rows[0]?.total_count),
      page,
      perPage,
    ),
  };
}
