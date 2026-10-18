import { sql } from 'drizzle-orm';
import { publicName } from '@/lib/english-content';
import { isDatabaseConfigured } from '@/lib/env';
import { likeContains } from '@/lib/like';
import { type Cents, toDecimalString } from '@/lib/money';
import { priceTierThresholds } from '@/lib/price-tiers';
import { type ResolvableImage, resolveVariantImage } from '@/lib/product-images';
import { cleanPublicCopy } from '@/lib/public-copy';
import { db } from '../db/client';
import {
  getRequestStorefront,
  getStorefrontBySlug,
  type StorefrontRecord,
} from '../services/storefront';
import { bool, maybe, num, text } from './row';

/**
 * The public storefront's read models.
 *
 * The storefront reads the same product rows the dashboard does, behind the
 * `catalog_published` filter — one source of truth for price and
 * availability, per the roadmap. Two rules follow from the fact that these
 * pages are PUBLIC:
 *
 * 1. Every query here filters on `catalog_published AND status = 'active'`
 *    itself. The filter is not a parameter a caller could forget; a draft or
 *    an unpublished product has no path to these pages.
 * 2. No cost figure is ever selected. Landed cost, reference cost and stock
 *    VALUE are the business's private arithmetic; the storefront selects
 *    price and unit counts only.
 */

export type CatalogImage = {
  url: string;
  width: number;
  height: number;
  alt: string | null;
  blurDataUrl: string | null;
};

/** A product photograph with the option it is pinned to (null: shared by every option). */
export type CatalogGalleryImage = CatalogImage & {
  id: string;
  variantId: string | null;
  isPrimary: boolean;
  position: number;
};

export type CatalogListItem = {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  brandName: string | null;
  compatibility: { platforms: string[]; protocols: string[]; ecosystems: string[] };
  buyerRequirements: {
    hubRequired?: boolean;
    indoorOutdoor?: 'indoor' | 'outdoor' | 'indoor-outdoor';
  };
  newUntil: string | null;
  /** Units on hand across the product's active variants. */
  onHand: number;
  incoming: number;
  expectedAt: string | null;
  minPriceCents: Cents;
  maxPriceCents: Cents;
  priceCurrency: 'USD' | 'SRD';
  image: CatalogImage | null;
  /** The first option that satisfies an active colour/option/in-stock filter, so the card can open on it. */
  matchedVariant: { id: string; sku: string; name: string } | null;
  /** Publish-adjacent signal: the product row's creation instant, used to
   *  flag recent arrivals ("NEW") in the grid. */
  createdAt: string;
  /** Marked as featured on the storefront or on the product itself. */
  featured: boolean;
};

export type CatalogSort = 'newest' | 'name' | 'price-asc' | 'price-desc';
export type CatalogFilterOptions = {
  brands: { name: string; slug: string }[];
  platforms: string[];
  protocols: string[];
  /** The storefront's currency, which the price-range filter is expressed in. */
  priceCurrency: 'USD' | 'SRD';
};

export type StorePickupLocation = { id: string; name: string };

/** Locations enabled for pickup at the storefront resolved for this request. */
export async function listStorePickupLocations(): Promise<StorePickupLocation[]> {
  if (!isDatabaseConfigured()) return [];
  const storefront = await getRequestStorefront();
  if (!storefront?.allowPickup) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT l.id, l.name
      FROM storefront_locations sl
      JOIN locations l ON l.id = sl.location_id
     WHERE sl.storefront_id = ${storefront.id}
       AND sl.active AND l.active
     ORDER BY sl.priority, l.name
  `);
  return rows.map((row) => ({ id: text(row.id), name: text(row.name) }));
}

// Ordered by the `price` LATERAL's own numeric columns, qualified — never by
// the outer SELECT list's same-named aliases, which are cast to `::text` for
// transport and would sort "100" before "20" if ORDER BY resolved to them
// instead. Qualifying with `price.` is what keeps it resolving to the
// LATERAL's native bigint rather than the outer alias.
const CATALOG_SORT_CLAUSES: Record<CatalogSort, ReturnType<typeof sql>> = {
  newest: sql`p.created_at DESC, p.name ASC`,
  name: sql`p.name ASC`,
  'price-asc': sql`price.min_price ASC NULLS LAST, p.name ASC`,
  'price-desc': sql`price.max_price DESC NULLS LAST, p.name ASC`,
};

/** A product that the operator has chosen to hide while sold out is not part
 * of the public catalog at all. Keep this predicate in every public read
 * model, including filter/navigation option queries, so a visitor is never
 * offered a path that resolves to an empty catalog. */
function stockOnHandSql(storefrontId: string, variantReference = 'v.id') {
  return sql`COALESCE((
    SELECT SUM(m.quantity)
      FROM inventory_movements m
      JOIN storefront_locations stock_location
        ON (
          stock_location.location_id = m.location_id
          OR (m.location_id IS NULL AND stock_location.location_id = (
            SELECT id FROM locations WHERE slug = 'main' LIMIT 1
          ))
        )
       AND stock_location.storefront_id = ${storefrontId}
       AND stock_location.active
     WHERE m.variant_id = ${sql.raw(variantReference)}
  ), 0)`;
}

function stockReservedSql(storefrontId: string, variantReference = 'v.id') {
  return sql`COALESCE((
    SELECT SUM(r.quantity)
      FROM inventory_reservations r
      JOIN storefront_locations reserved_location
        ON reserved_location.location_id = r.location_id
       AND reserved_location.storefront_id = ${storefrontId}
       AND reserved_location.active
     WHERE r.variant_id = ${sql.raw(variantReference)}
       AND r.status = 'active'
       AND (r.expires_at IS NULL OR r.expires_at > now())
  ), 0)`;
}

function stockAvailableSql(storefrontId: string, variantReference = 'v.id') {
  return sql`GREATEST(0, ${stockOnHandSql(storefrontId, variantReference)} - ${stockReservedSql(storefrontId, variantReference)})`;
}

export function publicStockVisibility(storefrontId: string, productReference = 'p.id') {
  const productAlias = productReference.split('.')[0] ?? 'p';
  return sql`
    (
      ${sql.raw(productAlias)}.show_when_out_of_stock
      OR EXISTS (
        SELECT 1
          FROM product_variants public_stock_variant
           WHERE public_stock_variant.product_id = ${sql.raw(productReference)}
           AND public_stock_variant.is_active
           AND ${stockAvailableSql(storefrontId, 'public_stock_variant.id')} > 0
      )
    )
  `;
}

export function publicPriceVisibility(
  _storefrontId: string,
  priceListId: string,
  productReference = 'p.id',
) {
  return sql`
    EXISTS (
      SELECT 1
        FROM product_variants public_price_variant
        JOIN price_list_items public_price_item
          ON public_price_item.variant_id = public_price_variant.id
         AND public_price_item.price_list_id = ${priceListId}
         AND public_price_item.amount_cents > 0
       WHERE public_price_variant.product_id = ${sql.raw(productReference)}
         AND public_price_variant.is_active
    )
  `;
}

export type CatalogVariantSearchItem = {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  sku: string;
  description: string | null;
  price: { amount: string; currency: StorefrontRecord['defaultCurrency'] };
};

/** Customer-safe variant search using the same storefront visibility rules as
 * the public catalog. No cost, margin, notes or inventory internals cross this
 * boundary. */
export async function searchCatalogVariantsForStorefront(
  storefront: StorefrontRecord,
  input: { query: string; limit: number },
): Promise<CatalogVariantSearchItem[]> {
  if (!isDatabaseConfigured() || !storefront.defaultPriceListId) return [];
  const likeQuery = likeContains(input.query);
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT p.id AS product_id,
           v.id AS variant_id,
           COALESCE(sp.title_override, p.name) AS name,
           v.name AS variant_name,
           v.sku,
           COALESCE(sp.description_override, p.description, p.summary) AS description,
           pli.amount_cents::text AS amount_cents
      FROM products p
      JOIN storefront_products sp
        ON sp.product_id = p.id
       AND sp.storefront_id = ${storefront.id}
       AND sp.visible
      JOIN product_variants v
        ON v.product_id = p.id
       AND v.is_active
      JOIN price_list_items pli
        ON pli.variant_id = v.id
       AND pli.price_list_id = ${storefront.defaultPriceListId}
       AND pli.amount_cents > 0
     WHERE p.catalog_published
       AND p.status = 'active'
       AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
       AND ${publicStockVisibility(storefront.id)}
       AND (
         p.name ILIKE ${likeQuery}
         OR v.name ILIKE ${likeQuery}
         OR v.sku ILIKE ${likeQuery}
       )
     ORDER BY p.name, v.position, v.name
     LIMIT ${input.limit}
  `);
  return rows.map((row) => ({
    productId: text(row.product_id),
    variantId: text(row.variant_id),
    name: publicName(text(row.name)),
    variantName: text(row.variant_name),
    sku: text(row.sku),
    description: maybe(row.description),
    price: {
      amount: toDecimalString(num(row.amount_cents), storefront.defaultCurrency),
      currency: storefront.defaultCurrency,
    },
  }));
}

export type CatalogVariantDetail = CatalogVariantSearchItem & {
  attributes: Record<string, string>;
};

/** Resolve one visible, priced variant for a storefront. The narrow DTO keeps
 * operator-only product fields out of integration responses. */
export async function getCatalogVariantForStorefront(
  storefront: StorefrontRecord,
  variantId: string,
): Promise<CatalogVariantDetail | null> {
  if (!isDatabaseConfigured() || !storefront.defaultPriceListId) return null;
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT p.id AS product_id,
           v.id AS variant_id,
           COALESCE(sp.title_override, p.name) AS name,
           v.name AS variant_name,
           v.sku,
           COALESCE(sp.description_override, p.description, p.summary) AS description,
           v.attributes::text AS attributes,
           pli.amount_cents::text AS amount_cents
      FROM products p
      JOIN storefront_products sp
        ON sp.product_id = p.id
       AND sp.storefront_id = ${storefront.id}
       AND sp.visible
      JOIN product_variants v
        ON v.product_id = p.id
       AND v.id = ${variantId}
       AND v.is_active
      JOIN price_list_items pli
        ON pli.variant_id = v.id
       AND pli.price_list_id = ${storefront.defaultPriceListId}
       AND pli.amount_cents > 0
     WHERE p.catalog_published
       AND p.status = 'active'
       AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
       AND ${publicStockVisibility(storefront.id)}
     LIMIT 1
  `);
  if (!row) return null;
  return {
    productId: text(row.product_id),
    variantId: text(row.variant_id),
    name: publicName(text(row.name)),
    variantName: text(row.variant_name),
    sku: text(row.sku),
    description: maybe(row.description),
    attributes: parseStringRecord(row.attributes ?? null),
    price: {
      amount: toDecimalString(num(row.amount_cents), storefront.defaultCurrency),
      currency: storefront.defaultCurrency,
    },
  };
}

export type StoreCartQuoteItem = {
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  priceCents: number;
  currency: StorefrontRecord['defaultCurrency'];
  available: number;
  /** The photograph of this exact option (src/lib/product-images.ts); null shows a placeholder. */
  imageUrl: string | null;
};

/** Public photographs for a set of products, in the shape the resolution policy reads. */
async function loadProductImages(
  productIds: string[],
): Promise<Map<string, ResolvableImage[]>> {
  const byProduct = new Map<string, ResolvableImage[]>();
  if (productIds.length === 0) return byProduct;
  const ids = sql.join(
    productIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT product_id, variant_id, url, thumb_url, width::text, height::text, alt,
           blur_data_url, is_primary::text AS is_primary, position::text AS position
      FROM product_images
     WHERE product_id IN (${ids})
  `);
  for (const row of rows) {
    const list = byProduct.get(text(row.product_id)) ?? [];
    list.push({
      url: text(row.url),
      thumbUrl: maybe(row.thumb_url),
      width: num(row.width),
      height: num(row.height),
      alt: maybe(row.alt),
      blurDataUrl: maybe(row.blur_data_url),
      variantId: maybe(row.variant_id),
      isPrimary: bool(row.is_primary),
      position: num(row.position),
    });
    byProduct.set(text(row.product_id), list);
  }
  return byProduct;
}

/** Revalidate a public cart against this storefront's current public price
 * list and location-scoped available stock. This is a quote, not a reservation. */
export async function getPublicStoreCartQuote(
  storefront: StorefrontRecord,
  variantIds: string[],
): Promise<StoreCartQuoteItem[] | null> {
  if (!isDatabaseConfigured() || !storefront.defaultPriceListId) return null;
  if (variantIds.length === 0) return [];

  const requestedIds = [...new Set(variantIds)];
  const idList = sql.join(
    requestedIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT p.id AS product_id,
           COALESCE(sp.slug_override, p.slug) AS product_slug,
           COALESCE(sp.title_override, p.name) AS product_name,
           v.id AS variant_id,
           v.name AS variant_name,
           v.sku,
           pli.amount_cents::text AS price_cents,
           ${stockAvailableSql(storefront.id, 'v.id')}::text AS available,
           (SELECT COUNT(*) FROM product_variants sv
             WHERE sv.product_id = p.id AND sv.is_active)::text AS option_count
      FROM products p
      JOIN storefront_products sp
        ON sp.product_id = p.id
       AND sp.storefront_id = ${storefront.id}
       AND sp.visible
      JOIN product_variants v
        ON v.product_id = p.id
       AND v.id IN (${idList})
       AND v.is_active
      JOIN price_list_items pli
        ON pli.variant_id = v.id
       AND pli.price_list_id = ${storefront.defaultPriceListId}
       AND pli.amount_cents > 0
     WHERE p.catalog_published
       AND p.status = 'active'
       AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
       AND ${publicStockVisibility(storefront.id)}
     ORDER BY p.name, v.position, v.name
  `);

  const images = await loadProductImages([...new Set(rows.map((row) => text(row.product_id)))]);
  return rows.map((row) => {
    const resolved = resolveVariantImage(
      images.get(text(row.product_id)) ?? [],
      text(row.variant_id),
      num(row.option_count, 1),
    );
    return {
      productId: text(row.product_id),
      productSlug: text(row.product_slug),
      productName: publicName(text(row.product_name)),
      variantId: text(row.variant_id),
      variantName: text(row.variant_name),
      sku: text(row.sku),
      priceCents: num(row.price_cents),
      currency: storefront.defaultCurrency,
      available: num(row.available),
      imageUrl: resolved.image ? (resolved.image.thumbUrl ?? resolved.image.url) : null,
    };
  });
}

export type CatalogFilters = {
  q?: string | undefined;
  category?: string | undefined;
  collection?: string | undefined;
  /** One or several brand slugs; several mean "any of these". */
  brand?: string | string[] | undefined;
  platform?: string | undefined;
  protocol?: string | undefined;
  hub?: 'required' | 'not-required' | undefined;
  indoorOutdoor?: 'indoor' | 'outdoor' | 'indoor-outdoor' | undefined;
  newArrival?: boolean | undefined;
  price?: 'under-50' | '50-100' | '100-250' | '250-plus' | undefined;
  availability?: 'in-stock' | 'incoming' | undefined;
  /** Colour names, any of. Matched on the same variant as every other option and "in stock". */
  colour?: string | string[] | undefined;
  /** Other variant options such as connector or size; values of one key mean "any of these". */
  options?: { key: string; value: string }[] | undefined;
};

const COLOUR_ATTRIBUTE_KEYS = ['colour', 'color', 'kleur'];
const COLOUR_EXPRESSION = sql`COALESCE(mv.attributes->>'colour', mv.attributes->>'color', mv.attributes->>'kleur')`;
/** Option keys come from the address bar, so they are held to a plain-word shape before use. */
const OPTION_KEY = /^[A-Za-z][A-Za-z0-9 _-]{0,39}$/;

function asList(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => item.trim())
    .filter(Boolean);
}

function textArray(values: string[]) {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** The option filters grouped by key, lower-cased, with unsafe keys dropped. */
function groupedOptions(options: CatalogFilters['options']): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const option of options ?? []) {
    if (!OPTION_KEY.test(option.key) || !option.value.trim()) continue;
    const key = option.key.toLowerCase();
    if (COLOUR_ATTRIBUTE_KEYS.includes(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), option.value.trim().toLowerCase()]);
  }
  return groups;
}

/**
 * Conditions on one variant (alias `mv`): it is active, has a public price, and matches the colour,
 * the other options and "in stock" all at once. A product matches when any single variant does, so
 * "Black and in stock" never matches a product whose Black is sold out but whose Silver is not.
 */
function variantConditions(
  storefrontId: string,
  filters: CatalogFilters,
  omit: ReadonlySet<string>,
): ReturnType<typeof sql>[] {
  const conditions: ReturnType<typeof sql>[] = [];
  const colours = asList(filters.colour).map((value) => value.toLowerCase());
  if (colours.length && !omit.has('colour')) {
    conditions.push(sql`lower(${COLOUR_EXPRESSION}) = ANY(${textArray(colours)})`);
  }
  for (const [key, values] of groupedOptions(filters.options)) {
    if (omit.has(`option:${key}`)) continue;
    conditions.push(sql`lower(mv.attributes->>${key}) = ANY(${textArray(values)})`);
  }
  if (filters.availability === 'in-stock' && !omit.has('availability')) {
    conditions.push(sql`${stockAvailableSql(storefrontId, 'mv.id')} > 0`);
  }
  return conditions;
}

function hasVariantFilters(filters: CatalogFilters, omit: ReadonlySet<string>): boolean {
  return (
    (asList(filters.colour).length > 0 && !omit.has('colour')) ||
    [...groupedOptions(filters.options).keys()].some((key) => !omit.has(`option:${key}`)) ||
    (filters.availability === 'in-stock' && !omit.has('availability'))
  );
}

/** The products FROM clause shared by the grid, the counts and the facets, so they cannot disagree. */
function catalogFrom(storefront: StorefrontRecord, withImage: boolean) {
  return sql`
    FROM products p
    JOIN storefront_products sp
      ON sp.product_id = p.id
     AND sp.storefront_id = ${storefront.id}
     AND sp.visible
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    ${
      withImage
        ? sql`LEFT JOIN LATERAL (
      SELECT i.url, i.width, i.height, i.alt, i.blur_data_url
        FROM product_images i
       WHERE i.product_id = p.id
       -- The owner-flagged primary, else a shared photo, else the first (representativeImage).
       ORDER BY i.is_primary DESC, (i.variant_id IS NULL) DESC, i.position
       LIMIT 1
    ) img ON true`
        : sql``
    }
    -- Zero-priced variants are draft/unpriced siblings of a real one; a
    -- published product is guaranteed at least one variant with a real price
    -- (assertCatalogPublishable, server/actions/products.ts), so excluding
    -- non-positive prices here never leaves a product with no price at all —
    -- it just stops a $0 draft variant from winning the "from" figure.
    LEFT JOIN LATERAL (
      SELECT MIN(pli.amount_cents) AS min_price, MAX(pli.amount_cents) AS max_price
        FROM product_variants v
        JOIN price_list_items pli
          ON pli.variant_id = v.id
         AND pli.price_list_id = ${storefront.defaultPriceListId}
       WHERE v.product_id = p.id AND v.is_active AND pli.amount_cents > 0
    ) price ON true
  `;
}

/** Every public-catalog condition for a set of filters. `omit` leaves a facet's own filter out. */
function catalogConditions(
  storefront: StorefrontRecord,
  filters: CatalogFilters,
  omit: ReadonlySet<string> = new Set(),
) {
  const [tierLow, tierMid, tierHigh] = priceTierThresholds(storefront.defaultCurrency);
  const category = filters.category?.trim() || null;
  const collection = filters.collection?.trim() || null;
  const brands = asList(filters.brand);
  const platform = filters.platform?.trim() || null;
  const protocol = filters.protocol?.trim() || null;
  const hub = filters.hub ?? null;
  const indoorOutdoor = filters.indoorOutdoor ?? null;
  const newArrival = filters.newArrival ?? false;
  const priceBucket = omit.has('price') ? null : (filters.price ?? null);
  const availability = omit.has('availability') ? null : (filters.availability ?? null);
  const likeQuery = filters.q?.trim() ? likeContains(filters.q) : null;

  const variantExists = hasVariantFilters(filters, omit)
    ? sql`AND EXISTS (
        SELECT 1
          FROM product_variants mv
          JOIN price_list_items mpli
            ON mpli.variant_id = mv.id
           AND mpli.price_list_id = ${storefront.defaultPriceListId}
           AND mpli.amount_cents > 0
         WHERE mv.product_id = p.id AND mv.is_active
           AND ${sql.join(variantConditions(storefront.id, filters, omit), sql` AND `)}
      )`
    : sql``;
  // `in-stock` alone is a variant condition handled above; `incoming` is a product-level one.
  const incoming =
    availability === 'incoming'
      ? sql`AND EXISTS (SELECT 1 FROM purchase_order_items ai JOIN purchase_orders ao ON ao.id = ai.purchase_order_id JOIN product_variants av ON av.id = ai.variant_id WHERE av.product_id = p.id AND ao.status IN ('ordered', 'shipped') AND ai.quantity > ai.quantity_received)`
      : sql``;

  return sql`
    p.catalog_published AND p.status = 'active'
      AND price.min_price IS NOT NULL
      AND ${publicStockVisibility(storefront.id)}
      AND (${category}::text IS NULL OR c.slug = ${category})
      AND (${collection}::text IS NULL OR EXISTS (SELECT 1 FROM storefront_collection_products fcp JOIN storefront_collections fc ON fc.id = fcp.collection_id WHERE fcp.product_id = p.id AND fc.active AND fc.slug = ${collection}))
      ${brands.length && !omit.has('brand') ? sql`AND b.slug = ANY(${textArray(brands)})` : sql``}
      AND (${platform}::text IS NULL OR COALESCE(p.compatibility->'platforms', '[]'::jsonb) ? ${platform})
      AND (${protocol}::text IS NULL OR COALESCE(p.compatibility->'protocols', '[]'::jsonb) ? ${protocol})
      AND (${hub}::text IS NULL OR (${hub} = 'required' AND COALESCE(p.buyer_requirements->>'hubRequired', 'false') = 'true') OR (${hub} = 'not-required' AND COALESCE(p.buyer_requirements->>'hubRequired', 'false') <> 'true'))
      AND (${indoorOutdoor}::text IS NULL OR p.buyer_requirements->>'indoorOutdoor' = ${indoorOutdoor})
      AND (NOT ${newArrival} OR p.new_until >= CURRENT_DATE)
      AND (${priceBucket}::text IS NULL
        OR (${priceBucket} = 'under-50' AND price.min_price < ${tierLow})
        OR (${priceBucket} = '50-100' AND price.min_price >= ${tierLow} AND price.min_price < ${tierMid})
        OR (${priceBucket} = '100-250' AND price.min_price >= ${tierMid} AND price.min_price < ${tierHigh})
        OR (${priceBucket} = '250-plus' AND price.min_price >= ${tierHigh}))
      ${variantExists}
      ${incoming}
      AND (${likeQuery}::text IS NULL OR p.name ILIKE ${likeQuery} OR sp.title_override ILIKE ${likeQuery} OR p.summary ILIKE ${likeQuery} OR p.model_number ILIKE ${likeQuery} OR b.name ILIKE ${likeQuery} OR p.key_features::text ILIKE ${likeQuery} OR p.compatibility::text ILIKE ${likeQuery}
        OR EXISTS (SELECT 1 FROM product_variants qv WHERE qv.product_id = p.id AND qv.is_active AND (qv.name ILIKE ${likeQuery} OR qv.sku ILIKE ${likeQuery})))
  `;
}

export async function listCatalogProducts(
  params: CatalogFilters & {
    sort?: CatalogSort;
    limit?: number;
    storefrontSlug?: string;
  } = {},
): Promise<CatalogListItem[]> {
  if (!isDatabaseConfigured()) return [];
  const storefront = params.storefrontSlug
    ? await getStorefrontBySlug(params.storefrontSlug, true)
    : await getRequestStorefront();
  if (!storefront?.defaultPriceListId) return [];

  // A `NULL` limit reads as "no limit" to Postgres, so the hero's "newest one" read and the
  // grid's "every match" read share this one query with no branching SQL.
  const order = CATALOG_SORT_CLAUSES[params.sort ?? 'newest'];
  const limit = params.limit ?? null;
  const none: ReadonlySet<string> = new Set();

  // When a variant-level filter is active, name the first variant that satisfies it, so the card can
  // open the page on that option and show its photograph instead of the product's representative one.
  const matchedVariant = hasVariantFilters(params, none)
    ? sql`(
        SELECT mv.id::text || '|' || mv.sku || '|' || mv.name
          FROM product_variants mv
          JOIN price_list_items mpli
            ON mpli.variant_id = mv.id
           AND mpli.price_list_id = ${storefront.defaultPriceListId}
           AND mpli.amount_cents > 0
         WHERE mv.product_id = p.id AND mv.is_active
           AND ${sql.join(variantConditions(storefront.id, params, none), sql` AND `)}
         ORDER BY mv.is_default DESC, mv.position
         LIMIT 1
      )`
    : sql`NULL::text`;

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, COALESCE(sp.title_override, p.name) AS name,
      COALESCE(sp.slug_override, p.slug) AS public_slug,
      COALESCE(sp.description_override, p.summary) AS summary,
      p.created_at::text AS created_at, p.new_until::text AS new_until,
      (sp.featured OR p.featured)::text AS featured,
      c.name AS category_name, c.slug AS category_slug,
      b.name AS brand_name, p.compatibility::text AS compatibility, p.buyer_requirements::text AS buyer_requirements,
      COALESCE((
        SELECT SUM(${stockAvailableSql(storefront.id, 'v.id')})
          FROM product_variants v
         WHERE v.product_id = p.id AND v.is_active
      ), 0)::text AS on_hand,
      COALESCE((SELECT SUM(poi.quantity - poi.quantity_received) FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id JOIN product_variants iv ON iv.id = poi.variant_id WHERE iv.product_id = p.id AND po.status IN ('ordered', 'shipped')), 0)::text AS incoming,
      (SELECT MIN(po.expected_at)::text FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id JOIN product_variants iv ON iv.id = poi.variant_id WHERE iv.product_id = p.id AND po.status IN ('ordered', 'shipped') AND po.expected_at IS NOT NULL) AS expected_at,
      price.min_price::text AS min_price,
      price.max_price::text AS max_price,
      img.url AS image_url, img.width::text AS image_width,
      img.height::text AS image_height, img.alt AS image_alt,
      img.blur_data_url AS image_blur,
      ${matchedVariant} AS matched_variant,
      (SELECT COUNT(*) FROM product_variants cv WHERE cv.product_id = p.id AND cv.is_active)::text AS option_count
    ${catalogFrom(storefront, true)}
    WHERE ${catalogConditions(storefront, params)}
    ORDER BY ${order}
    LIMIT ${limit}
  `);

  // Cards that matched on a specific option show that option's own photograph.
  const matchedIds = rows.flatMap((row) => (row.matched_variant ? [text(row.id)] : []));
  const optionImages = matchedIds.length ? await loadProductImages(matchedIds) : new Map();

  return rows.map((row) => {
    const [matchedId, matchedSku, matchedName] = (row.matched_variant ?? '').split('|');
    const resolved =
      matchedId && optionImages.size
        ? resolveVariantImage(
            optionImages.get(text(row.id)) ?? [],
            matchedId,
            num(row.option_count, 1),
          )
        : null;
    const baseImage = row.image_url
      ? {
          url: text(row.image_url),
          width: num(row.image_width),
          height: num(row.image_height),
          alt: maybe(row.image_alt),
          blurDataUrl: maybe(row.image_blur),
        }
      : null;
    const optionImage =
      resolved?.image && resolved.source === 'variant'
        ? {
            url: resolved.image.url,
            width: resolved.image.width,
            height: resolved.image.height,
            alt: resolved.image.alt,
            blurDataUrl: resolved.image.blurDataUrl,
          }
        : null;
    return {
      id: text(row.id),
      name: publicName(text(row.name)),
      slug: text(row.public_slug),
      summary: cleanPublicCopy(row.summary),
      categoryName: maybe(row.category_name),
      categorySlug: maybe(row.category_slug),
      brandName: maybe(row.brand_name),
      compatibility: parseCompatibility(row.compatibility ?? null),
      buyerRequirements: parseBuyerRequirements(row.buyer_requirements ?? null),
      newUntil: maybe(row.new_until),
      onHand: num(row.on_hand),
      incoming: num(row.incoming),
      expectedAt: maybe(row.expected_at),
      minPriceCents: num(row.min_price),
      maxPriceCents: num(row.max_price),
      priceCurrency: storefront.defaultCurrency,
      image: optionImage ?? baseImage,
      matchedVariant:
        matchedId && matchedSku
          ? { id: matchedId, sku: matchedSku, name: matchedName ?? '' }
          : null,
      createdAt: text(row.created_at),
      featured: row.featured === 'true',
    };
  });
}

export type CatalogFacets = {
  brands: { name: string; slug: string; count: number }[];
  colours: { value: string; count: number }[];
  options: { key: string; values: { value: string; count: number }[] }[];
  availability: { inStock: number; incoming: number };
  prices: Record<'under-50' | '50-100' | '100-250' | '250-plus', number>;
};

const EMPTY_FACETS: CatalogFacets = {
  brands: [],
  colours: [],
  options: [],
  availability: { inStock: 0, incoming: 0 },
  prices: { 'under-50': 0, '50-100': 0, '100-250': 0, '250-plus': 0 },
};

/**
 * Filter choices with counts. Counting rule: each group counts the products that match every OTHER
 * active filter (so a choice shows what picking it would give, and picking a second brand adds to the
 * first). A value that no public product has never appears; a colour or option shows only when the
 * catalogue really offers a choice (two or more values).
 */
export async function listCatalogFacets(filters: CatalogFilters = {}): Promise<CatalogFacets> {
  if (!isDatabaseConfigured()) return EMPTY_FACETS;
  const storefront = await getRequestStorefront();
  if (!storefront?.defaultPriceListId) return EMPTY_FACETS;
  const [tierLow, tierMid, tierHigh] = priceTierThresholds(storefront.defaultCurrency);
  const from = catalogFrom(storefront, false);

  // Which option keys exist at all, from the whole public catalogue (not the current filter).
  const keyRows = await db.execute<Record<string, string | null>>(sql`
    SELECT kv.key, COUNT(DISTINCT lower(kv.value))::text AS distinct_values,
           string_agg(DISTINCT trim(kv.value), chr(31)) AS all_values
      ${from}
      JOIN product_variants mv ON mv.product_id = p.id AND mv.is_active
      JOIN LATERAL jsonb_each_text(mv.attributes) kv ON true
     WHERE p.catalog_published AND p.status = 'active' AND price.min_price IS NOT NULL
       AND ${publicStockVisibility(storefront.id)}
       AND kv.key NOT LIKE 'legacy%' AND trim(kv.value) <> ''
     GROUP BY kv.key
     HAVING COUNT(DISTINCT lower(kv.value)) >= 2
     ORDER BY kv.key
  `);
  const offered = keyRows
    .filter((row) => OPTION_KEY.test(text(row.key)))
    .slice(0, 6)
    .map((row) => ({
      key: text(row.key),
      all: text(row.all_values).split('').filter(Boolean),
    }));
  const optionKeys = offered.map((entry) => entry.key);
  const colourOffered = optionKeys.some((key) =>
    COLOUR_ATTRIBUTE_KEYS.includes(key.toLowerCase()),
  );
  const otherKeys = optionKeys.filter(
    (key) => !COLOUR_ATTRIBUTE_KEYS.includes(key.toLowerCase()),
  );

  const optionFacet = async (key: string, omit: ReadonlySet<string>) => {
    const rows = await db.execute<Record<string, string | null>>(sql`
      SELECT MIN(value) AS value, COUNT(DISTINCT id)::text AS count
        FROM (
          SELECT p.id, mv.attributes->>${key} AS value
            ${from}
            JOIN product_variants mv ON mv.product_id = p.id AND mv.is_active
            JOIN price_list_items mpli
              ON mpli.variant_id = mv.id
             AND mpli.price_list_id = ${storefront.defaultPriceListId}
             AND mpli.amount_cents > 0
           WHERE ${catalogConditions(storefront, filters, omit)}
             AND trim(COALESCE(mv.attributes->>${key}, '')) <> ''
             ${(() => {
               const same = variantConditions(storefront.id, filters, omit);
               return same.length ? sql`AND ${sql.join(same, sql` AND `)}` : sql``;
             })()}
        ) x
       GROUP BY lower(value)
       ORDER BY lower(value)
    `);
    return rows.map((row) => ({ value: text(row.value), count: num(row.count) }));
  };

  const [brandRows, priceRow, stockCount, incomingCount, colours, options] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT b.name, b.slug, COUNT(*)::text AS count
        ${from}
       WHERE b.id IS NOT NULL AND b.active
         AND ${catalogConditions(storefront, filters, new Set(['brand']))}
       GROUP BY b.name, b.slug
       ORDER BY b.name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT
        COUNT(*) FILTER (WHERE price.min_price < ${tierLow})::text AS "under-50",
        COUNT(*) FILTER (WHERE price.min_price >= ${tierLow} AND price.min_price < ${tierMid})::text AS "50-100",
        COUNT(*) FILTER (WHERE price.min_price >= ${tierMid} AND price.min_price < ${tierHigh})::text AS "100-250",
        COUNT(*) FILTER (WHERE price.min_price >= ${tierHigh})::text AS "250-plus"
        ${from}
       WHERE ${catalogConditions(storefront, filters, new Set(['price']))}
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT COUNT(*)::text AS count ${from}
       WHERE ${catalogConditions(storefront, { ...filters, availability: 'in-stock' }, new Set())}
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT COUNT(*)::text AS count ${from}
       WHERE ${catalogConditions(storefront, { ...filters, availability: 'incoming' }, new Set())}
    `),
    colourOffered
      ? db.execute<Record<string, string | null>>(sql`
          SELECT MIN(value) AS value, COUNT(DISTINCT id)::text AS count
            FROM (
              SELECT p.id, ${COLOUR_EXPRESSION} AS value
                ${from}
                JOIN product_variants mv ON mv.product_id = p.id AND mv.is_active
                JOIN price_list_items mpli
                  ON mpli.variant_id = mv.id
                 AND mpli.price_list_id = ${storefront.defaultPriceListId}
                 AND mpli.amount_cents > 0
               WHERE ${catalogConditions(storefront, filters, new Set(['colour']))}
                 AND trim(COALESCE(${COLOUR_EXPRESSION}, '')) <> ''
                 ${(() => {
                   const same = variantConditions(storefront.id, filters, new Set(['colour']));
                   return same.length ? sql`AND ${sql.join(same, sql` AND `)}` : sql``;
                 })()}
            ) x
           GROUP BY lower(value)
           ORDER BY lower(value)
        `)
      : Promise.resolve([]),
    Promise.all(
      otherKeys.map(async (key) => ({
        key,
        values: await optionFacet(key, new Set([`option:${key.toLowerCase()}`])),
      })),
    ),
  ]);

  /** Every value the catalogue has, with the count under the current filters (0 when none). */
  const withAll = (all: string[], counted: { value: string; count: number }[]) => {
    const byLower = new Map(counted.map((entry) => [entry.value.toLowerCase(), entry]));
    for (const value of all) {
      if (!byLower.has(value.toLowerCase()))
        byLower.set(value.toLowerCase(), { value, count: 0 });
    }
    return [...byLower.values()].sort((a, b) => a.value.localeCompare(b.value));
  };
  const allColours = offered
    .filter((entry) => COLOUR_ATTRIBUTE_KEYS.includes(entry.key.toLowerCase()))
    .flatMap((entry) => entry.all);

  const price = priceRow[0] ?? {};
  return {
    brands: brandRows.map((row) => ({
      name: text(row.name),
      slug: text(row.slug),
      count: num(row.count),
    })),
    colours: withAll(
      allColours,
      colours.map((row) => ({ value: text(row.value), count: num(row.count) })),
    ),
    options: options.map((option) => ({
      key: option.key,
      values: withAll(
        offered.find((entry) => entry.key === option.key)?.all ?? [],
        option.values,
      ),
    })),
    availability: {
      inStock: num(stockCount[0]?.count),
      incoming: num(incomingCount[0]?.count),
    },
    prices: {
      'under-50': num(price['under-50']),
      '50-100': num(price['50-100']),
      '100-250': num(price['100-250']),
      '250-plus': num(price['250-plus']),
    },
  };
}

/** Filter values are derived from public catalog data; an empty choice is
 * never shown just because it exists in an internal product draft. */
export async function listCatalogFilterOptions(): Promise<CatalogFilterOptions> {
  if (!isDatabaseConfigured()) {
    return { brands: [], platforms: [], protocols: [], priceCurrency: 'SRD' };
  }
  const storefront = await getRequestStorefront();
  if (!storefront?.defaultPriceListId) {
    return { brands: [], platforms: [], protocols: [], priceCurrency: 'SRD' };
  }
  const [brands, platforms, protocols] = await Promise.all([
    db.execute<Record<string, string>>(
      sql`SELECT DISTINCT b.name, b.slug
            FROM products p
            JOIN storefront_products sp ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
           JOIN brands b ON b.id = p.brand_id
           WHERE p.catalog_published AND p.status = 'active' AND b.active
             AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
             AND ${publicStockVisibility(storefront.id)}
           ORDER BY b.name`,
    ),
    db.execute<Record<string, string>>(
      sql`SELECT DISTINCT value AS name
            FROM products p
            JOIN storefront_products sp ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
            CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.compatibility->'platforms', '[]'::jsonb)) value
           WHERE p.catalog_published AND p.status = 'active'
             AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
             AND ${publicStockVisibility(storefront.id)}
           ORDER BY name`,
    ),
    db.execute<Record<string, string>>(
      sql`SELECT DISTINCT value AS name
            FROM products p
            JOIN storefront_products sp ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
            CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.compatibility->'protocols', '[]'::jsonb)) value
           WHERE p.catalog_published AND p.status = 'active'
             AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
             AND ${publicStockVisibility(storefront.id)}
           ORDER BY name`,
    ),
  ]);
  return {
    brands: brands.map((row) => ({ name: text(row.name), slug: text(row.slug) })),
    platforms: platforms.map((row) => text(row.name)),
    protocols: protocols.map((row) => text(row.name)),
    priceCurrency: storefront.defaultCurrency,
  };
}

export type CatalogCategory = { slug: string; name: string; count: number };

/** Only categories with at least one published, active product — a filter
 *  chip that leads to a wall of nothing is worse than one fewer chip. */
export async function listCatalogCategories(): Promise<CatalogCategory[]> {
  if (!isDatabaseConfigured()) return [];
  const storefront = await getRequestStorefront();
  if (!storefront?.defaultPriceListId) return [];

  const rows = await db.execute<Record<string, string>>(sql`
    SELECT c.slug, c.name, COUNT(*)::text AS count
      FROM products p
      JOIN storefront_products sp
        ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
      JOIN categories c ON c.id = p.category_id
     WHERE p.catalog_published AND p.status = 'active' AND c.show_in_storefront_nav
       AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
       AND ${publicStockVisibility(storefront.id)}
     GROUP BY c.slug, c.name, c.position
     ORDER BY c.position, c.name
  `);

  return rows.map((row) => ({
    slug: text(row.slug),
    name: text(row.name),
    count: num(row.count),
  }));
}

export type StorefrontCollection = {
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
};
export type CatalogBundle = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  priceCents: Cents;
  availability: number;
};

/** Public bundle read model: availability is the limiting component quantity,
 * never a manually maintained stock number and never a cost calculation. */
export async function listCatalogBundles(limit = 6): Promise<CatalogBundle[]> {
  if (!isDatabaseConfigured()) return [];
  const storefront = await getRequestStorefront();
  if (!storefront?.defaultPriceListId) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT b.id, b.slug, b.name, b.summary, b.price_cents::text,
           MIN(FLOOR(${stockAvailableSql(storefront.id, 'bc.variant_id')}::numeric / NULLIF(bc.quantity, 0)))::text AS availability
      FROM bundles b JOIN bundle_components bc ON bc.bundle_id = b.id
      JOIN product_variants v ON v.id = bc.variant_id AND v.is_active
      JOIN products p ON p.id = v.product_id AND p.catalog_published AND p.status = 'active'
      JOIN storefront_products sp ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
     WHERE b.catalog_published AND b.is_active AND b.slug IS NOT NULL
       AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
       AND ${publicStockVisibility(storefront.id)}
       AND NOT EXISTS (
         SELECT 1
           FROM bundle_components invalid_bc
           JOIN product_variants invalid_v ON invalid_v.id = invalid_bc.variant_id
           JOIN products invalid_p ON invalid_p.id = invalid_v.product_id
           LEFT JOIN storefront_products invalid_sp
             ON invalid_sp.product_id = invalid_p.id
            AND invalid_sp.storefront_id = ${storefront.id}
            AND invalid_sp.visible
          WHERE invalid_bc.bundle_id = b.id
            AND (
              invalid_sp.product_id IS NULL
              OR NOT invalid_v.is_active
              OR NOT invalid_p.catalog_published
              OR invalid_p.status <> 'active'
              OR NOT ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId, 'invalid_p.id')}
              OR NOT ${publicStockVisibility(storefront.id, 'invalid_p.id')}
            )
       )
     GROUP BY b.id
     ORDER BY b.featured DESC, b.position, b.name
     LIMIT ${limit}
  `);
  return rows.map((row) => ({
    id: text(row.id),
    slug: text(row.slug),
    name: text(row.name),
    summary: cleanPublicCopy(row.summary),
    priceCents: num(row.price_cents),
    availability: num(row.availability),
  }));
}
export async function getCatalogBundle(slug: string) {
  if (!isDatabaseConfigured()) return null;
  const storefront = await getRequestStorefront();
  if (!storefront?.defaultPriceListId) return null;
  const [bundle] = await db.execute<Record<string, string | null>>(
    sql`SELECT id, name, slug, summary, description, storefront_image_url, best_for, compatibility_notes, nextly_take, price_cents::text
          FROM bundles b
         WHERE slug = ${slug} AND catalog_published AND is_active
           AND EXISTS (SELECT 1 FROM bundle_components bc WHERE bc.bundle_id = b.id)
           AND NOT EXISTS (
             SELECT 1
               FROM bundle_components bc
               JOIN product_variants v ON v.id = bc.variant_id
               JOIN products p ON p.id = v.product_id
               LEFT JOIN storefront_products sp ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
              WHERE bc.bundle_id = b.id
                AND (sp.product_id IS NULL OR NOT v.is_active OR NOT p.catalog_published OR p.status <> 'active'
                  OR NOT ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId, 'p.id')}
                  OR NOT ${publicStockVisibility(storefront.id, 'p.id')})
           )
         LIMIT 1`,
  );
  if (!bundle) return null;
  const components = await db.execute<Record<string, string | null>>(
    sql`SELECT COALESCE(sp.title_override, p.name) AS product_name, v.name AS variant_name,
               bc.quantity::text, (${stockAvailableSql(storefront.id, 'v.id')})::text AS on_hand
          FROM bundle_components bc
          JOIN product_variants v ON v.id = bc.variant_id
          JOIN products p ON p.id = v.product_id
          JOIN storefront_products sp ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
         WHERE bc.bundle_id = ${bundle.id}
         ORDER BY p.name, v.name`,
  );
  const items = components.map((row) => ({
    productName: publicName(text(row.product_name)),
    variantName: text(row.variant_name),
    quantity: num(row.quantity),
    onHand: num(row.on_hand),
  }));
  const availability = items.length
    ? Math.min(...items.map((item) => Math.floor(item.onHand / item.quantity)))
    : 0;
  return {
    id: text(bundle.id),
    name: text(bundle.name),
    slug: text(bundle.slug),
    summary: maybe(bundle.summary),
    description: maybe(bundle.description),
    storefrontImageUrl: maybe(bundle.storefront_image_url),
    bestFor: Array.isArray(bundle.best_for)
      ? bundle.best_for.filter((item): item is string => typeof item === 'string')
      : [],
    compatibilityNotes: maybe(bundle.compatibility_notes),
    nextlyTake: maybe(bundle.nextly_take),
    priceCents: num(bundle.price_cents),
    items,
    availability,
  };
}
/** Intent-led collections are separate from categories and only appear once
 * they contain something a visitor can actually buy. */
export async function listHomepageCollections(): Promise<StorefrontCollection[]> {
  if (!isDatabaseConfigured()) return [];
  const storefront = await getRequestStorefront();
  if (!storefront?.defaultPriceListId) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT sc.name, sc.slug, sc.description, sc.image_url,
           COUNT(p.id)::text AS product_count
      FROM storefront_collections sc
      JOIN storefront_collection_products cp ON cp.collection_id = sc.id
      JOIN products p ON p.id = cp.product_id AND p.catalog_published AND p.status = 'active'
      JOIN storefront_products sp ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
                    AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
                    AND ${publicStockVisibility(storefront.id)}
     WHERE sc.active AND sc.homepage_visible
     GROUP BY sc.id
     ORDER BY sc.position, sc.name
  `);
  return rows.map((row) => ({
    name: text(row.name),
    slug: text(row.slug),
    description: maybe(row.description),
    imageUrl: maybe(row.image_url),
    productCount: num(row.product_count),
  }));
}

export type CatalogProduct = {
  id: string;
  code: string;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
  specs: Record<string, string>;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  brandName: string | null;
  modelNumber: string | null;
  keyFeatures: string[];
  bestFor: string[];
  compatibility: { platforms: string[]; protocols: string[]; ecosystems: string[] };
  buyerRequirements: Record<string, unknown>;
  boxContents: string[];
  nextlyTake: string | null;
  faqItems: { question: string; answer: string }[];
  warrantyMonths: number;
  restockNotificationsEnabled: boolean;
  priceCurrency: 'USD' | 'SRD';
  variants: {
    id: string;
    name: string;
    sku: string;
    /** Structured options such as { colour: "Black" }; internal legacy keys are removed. */
    attributes: Record<string, string>;
    listPriceCents: Cents;
    priceCurrency: 'USD' | 'SRD';
    onHand: number;
  }[];
  images: CatalogGalleryImage[];
  related: { name: string; slug: string; relationshipType: string; summary: string | null }[];
};

export async function getCatalogProduct(slug: string): Promise<CatalogProduct | null> {
  if (!isDatabaseConfigured()) return null;
  const storefront = await getRequestStorefront();
  if (!storefront?.defaultPriceListId) return null;

  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.code, COALESCE(sp.title_override, p.name) AS name,
      COALESCE(sp.slug_override, p.slug) AS public_slug,
      COALESCE(sp.description_override, p.summary) AS summary, p.description, p.specs::text,
      p.seo_title, p.seo_description, c.name AS category_name, c.slug AS category_slug,
      b.name AS brand_name, p.model_number, p.key_features::text, p.best_for::text,
      p.compatibility::text, p.buyer_requirements::text, p.box_contents::text, p.nextly_take,
      p.faq_items::text, p.restock_notifications_enabled::text, p.warranty_months::text
    FROM products p
    JOIN storefront_products sp
      ON sp.product_id = p.id AND sp.storefront_id = ${storefront.id} AND sp.visible
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE (
        COALESCE(sp.slug_override, p.slug) = ${slug}
        OR EXISTS (
          SELECT 1
            FROM product_variants legacy_variant
           WHERE legacy_variant.product_id = p.id
             AND legacy_variant.attributes ->> 'legacy_id' = ${slug}
        )
      )
      AND p.catalog_published AND p.status = 'active'
      AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId)}
      AND ${publicStockVisibility(storefront.id)}
    ORDER BY (COALESCE(sp.slug_override, p.slug) = ${slug}) DESC, p.created_at
    LIMIT 1
  `);

  if (!row) return null;

  const [variants, related, images] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT v.id, v.name, v.sku, v.attributes::text AS attributes,
             pli.amount_cents::text AS list_price_cents,
             (${stockAvailableSql(storefront.id, 'v.id')})::text AS on_hand
        FROM product_variants v
        JOIN price_list_items pli
          ON pli.variant_id = v.id
         AND pli.price_list_id = ${storefront.defaultPriceListId}
         AND pli.amount_cents > 0
       WHERE v.product_id = ${row.id} AND v.is_active
       ORDER BY v.is_default DESC, v.position
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT COALESCE(rsp.title_override, rp.name) AS name,
             COALESCE(rsp.slug_override, rp.slug) AS slug,
             COALESCE(rsp.description_override, rp.summary) AS summary,
             pr.relationship_type
        FROM product_relationships pr
        JOIN products rp ON rp.id = pr.related_product_id
        JOIN storefront_products rsp ON rsp.product_id = rp.id AND rsp.storefront_id = ${storefront.id} AND rsp.visible
       WHERE pr.product_id = ${row.id} AND rp.catalog_published AND rp.status = 'active'
         AND ${publicPriceVisibility(storefront.id, storefront.defaultPriceListId, 'rp.id')}
         AND ${publicStockVisibility(storefront.id, 'rp.id')}
         AND EXISTS (
           SELECT 1 FROM product_variants rv
           JOIN price_list_items rpli ON rpli.variant_id = rv.id AND rpli.price_list_id = ${storefront.defaultPriceListId}
            WHERE rv.product_id = rp.id AND rv.is_active AND rpli.amount_cents > 0
         )
       ORDER BY pr.position, rp.name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, variant_id, url, width::text, height::text, alt, blur_data_url,
             is_primary::text AS is_primary, position::text AS position
        FROM product_images
       WHERE product_id = ${row.id}
       ORDER BY is_primary DESC, position
    `),
  ]);

  let specs: Record<string, string> = {};
  try {
    specs = JSON.parse(text(row.specs, '{}'));
  } catch {
    specs = {};
  }

  return {
    id: text(row.id),
    code: text(row.code),
    name: publicName(text(row.name)),
    slug: text(row.public_slug),
    summary: cleanPublicCopy(row.summary),
    description: cleanPublicCopy(row.description),
    specs,
    seoTitle: maybe(row.seo_title),
    seoDescription: maybe(row.seo_description),
    categoryName: maybe(row.category_name),
    categorySlug: maybe(row.category_slug),
    brandName: maybe(row.brand_name),
    modelNumber: maybe(row.model_number),
    keyFeatures: parseStringArray(row.key_features ?? null),
    bestFor: parseStringArray(row.best_for ?? null),
    compatibility: parseCompatibility(row.compatibility ?? null),
    buyerRequirements: parseObject(row.buyer_requirements ?? null),
    boxContents: parseStringArray(row.box_contents ?? null),
    nextlyTake: maybe(row.nextly_take),
    faqItems: parseFaqItems(row.faq_items ?? null),
    warrantyMonths: num(row.warranty_months),
    restockNotificationsEnabled: bool(row.restock_notifications_enabled),
    priceCurrency: storefront.defaultCurrency,
    variants: variants.map((variant) => ({
      id: text(variant.id),
      name: text(variant.name),
      sku: text(variant.sku),
      attributes: publicAttributes(variant.attributes ?? null),
      listPriceCents: num(variant.list_price_cents),
      priceCurrency: storefront.defaultCurrency,
      onHand: num(variant.on_hand),
    })),
    images: images.map((image) => ({
      id: text(image.id),
      variantId: maybe(image.variant_id),
      position: num(image.position),
      url: text(image.url),
      width: num(image.width),
      height: num(image.height),
      alt: maybe(image.alt),
      blurDataUrl: maybe(image.blur_data_url),
      isPrimary: bool(image.is_primary),
    })),
    related: related.map((item) => ({
      name: publicName(text(item.name)),
      slug: text(item.slug),
      summary: cleanPublicCopy(item.summary),
      relationshipType: text(item.relationship_type),
    })),
  };
}

function parseObject(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
/** Variant options meant for customers: string values only, no `legacy_*` import bookkeeping. */
function publicAttributes(value: string | null): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parseStringRecord(value)).filter(
      ([key, entry]) => !key.startsWith('legacy') && entry.trim() !== '',
    ),
  );
}
function parseStringRecord(value: string | null): Record<string, string> {
  const record = parseObject(value);
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
function parseStringArray(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
function parseCompatibility(value: string | null) {
  const record = parseObject(value);
  return {
    platforms: Array.isArray(record.platforms)
      ? record.platforms.filter((item): item is string => typeof item === 'string')
      : [],
    protocols: Array.isArray(record.protocols)
      ? record.protocols.filter((item): item is string => typeof item === 'string')
      : [],
    ecosystems: Array.isArray(record.ecosystems)
      ? record.ecosystems.filter((item): item is string => typeof item === 'string')
      : [],
  };
}
function parseBuyerRequirements(value: string | null): CatalogListItem['buyerRequirements'] {
  const record = parseObject(value);
  const indoorOutdoor = record.indoorOutdoor;
  return {
    ...(typeof record.hubRequired === 'boolean' ? { hubRequired: record.hubRequired } : {}),
    ...(indoorOutdoor === 'indoor' ||
    indoorOutdoor === 'outdoor' ||
    indoorOutdoor === 'indoor-outdoor'
      ? { indoorOutdoor }
      : {}),
  };
}
function parseFaqItems(value: string | null): { question: string; answer: string }[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is { question: string; answer: string } =>
          Boolean(
            item &&
              typeof item === 'object' &&
              typeof (item as { question?: unknown }).question === 'string' &&
              typeof (item as { answer?: unknown }).answer === 'string',
          ),
        )
      : [];
  } catch {
    return [];
  }
}
