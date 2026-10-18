import { type SQL, sql } from 'drizzle-orm';
import { type CatalogReadiness, catalogReadiness } from '@/lib/catalog-readiness';
import { isDatabaseConfigured } from '@/lib/env';
import type {
  CustomerQuery,
  ExpenseQuery,
  LedgerQuery,
  OrderQuery,
  ProductQuery,
  PurchaseOrderQuery,
  SaleQuery,
  StockQuery,
} from '@/lib/list-params';
import type { Cents } from '@/lib/money';
import {
  OVERDUE_AFTER_DAYS,
  type PaymentBadgeCode,
  paymentBadgeOf,
} from '@/lib/payment-status';
import { db } from '../db/client';
import { variantImageSql } from './image-sql';
import { clampPage, clampPerPage, type Page, toPage } from './paginate';
import { bool, maybe, num, text } from './row';

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP state,
 * not an outage. Only an ABSENT connection string returns empty; a failing
 * query still throws, because an empty dashboard must never be able to mean
 * "the database is down". See src/app/setup/page.tsx.
 */

/**
 * List read models.
 *
 * One query per page, shaped exactly like the table it fills. Deliberately not
 * a generic repository: an aggregate report is easier to reason about and far
 * easier to make fast when it is written as the one query it actually is.
 */

export type ProductRow = {
  /** The product's representative photograph (thumbnail when one exists), or null. */
  imageUrl: string | null;
  id: string;
  code: string;
  name: string;
  needsReview: boolean;
  reviewReason: string | null;
  brandName: string | null;
  categoryName: string | null;
  supplierName: string | null;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  variantCount: number;
  imageCount: number;
  onHand: number;
  incoming: number;
  featured: boolean;
  updatedAt: string;
  stockValueCents: Cents;
  listPriceCents: Cents;
  catalogReadiness: CatalogReadiness;
};

// onHand/stockValue recompute the same subquery the SELECT list builds,
// rather than referencing its output alias: that alias is cast ::text for
// the JS driver, and Postgres would then sort it lexicographically —
// "10" before "2" — not numerically.
const PRODUCT_SORT: Record<ProductQuery['sort'], SQL> = {
  name: sql`p.name`,
  onHand: sql`COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl
                          WHERE sl.product_id = p.id), 0)`,
  stockValue: sql`COALESCE((SELECT SUM(sl.value_cents) FROM v_stock_levels sl
                              WHERE sl.product_id = p.id), 0)`,
  updated: sql`p.updated_at`,
};

export async function listProducts(
  query: ProductQuery = {} as ProductQuery,
): Promise<Page<ProductRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(
      p.name ILIKE ${term} OR p.code ILIKE ${term} OR p.model_number ILIKE ${term}
      OR EXISTS (SELECT 1 FROM brands qb WHERE qb.id = p.brand_id AND qb.name ILIKE ${term})
      OR EXISTS (SELECT 1 FROM product_variants qv
                  WHERE qv.product_id = p.id
                    AND (qv.sku ILIKE ${term} OR qv.name ILIKE ${term} OR qv.barcode ILIKE ${term}))
    )`);
  }
  if (query.images === 'missing') {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM product_images xi WHERE xi.product_id = p.id)`,
    );
  }
  if (query.images === 'has') {
    conditions.push(sql`EXISTS (SELECT 1 FROM product_images xi WHERE xi.product_id = p.id)`);
  }
  if (query.options) {
    conditions.push(
      query.options === 'multiple'
        ? sql`(SELECT COUNT(*) FROM product_variants xv WHERE xv.product_id = p.id AND xv.is_active) > 1`
        : sql`(SELECT COUNT(*) FROM product_variants xv WHERE xv.product_id = p.id AND xv.is_active) <= 1`,
    );
  }
  // The price range matches a product when any active variant is priced inside it.
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const min = Math.round((query.minPrice ?? 0) * 100);
    const max = query.maxPrice === undefined ? null : Math.round(query.maxPrice * 100);
    conditions.push(sql`EXISTS (
      SELECT 1 FROM product_variants pv
       WHERE pv.product_id = p.id AND pv.is_active
         AND pv.list_price_cents >= ${min}
         AND (${max}::bigint IS NULL OR pv.list_price_cents <= ${max}::bigint)
    )`);
  }
  if (query.status) conditions.push(sql`p.status = ${query.status}::product_status`);
  if (query.catalog) {
    conditions.push(
      query.catalog === 'published'
        ? sql`p.catalog_published = true`
        : query.catalog === 'unpublished'
          ? sql`p.catalog_published = false`
          : sql`(
              p.summary IS NULL OR p.brand_id IS NULL OR p.key_features = '[]'::jsonb
              OR p.compatibility = '{}'::jsonb OR p.buyer_requirements = '{}'::jsonb
              OR p.box_contents = '[]'::jsonb OR p.nextly_take IS NULL OR p.seo_description IS NULL
              OR EXISTS (SELECT 1 FROM product_images mi WHERE mi.product_id = p.id AND (mi.alt IS NULL OR btrim(mi.alt) = ''))
            )`,
    );
  }
  if (query.stock === 'out-of-stock') {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM product_variants sv JOIN v_stock_levels ss ON ss.variant_id = sv.id
       WHERE sv.product_id = p.id AND sv.is_active AND ss.on_hand > 0
    )`);
  }
  if (query.stock === 'low-stock') {
    conditions.push(sql`COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl WHERE sl.product_id = p.id), 0) > 0
      AND COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl WHERE sl.product_id = p.id), 0)
          <= COALESCE((SELECT low_stock_threshold FROM settings LIMIT 1), 0)`);
  }
  if (query.featured) conditions.push(sql`p.featured = ${query.featured === 'yes'}`);
  if (query.brand) conditions.push(sql`p.brand_id = ${query.brand}`);
  if (query.category) conditions.push(sql`p.category_id = ${query.category}`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = PRODUCT_SORT[query.sort] ?? PRODUCT_SORT.name;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.code, p.name, p.slug, p.summary, p.brand_id, p.compatibility::text,
      p.key_features::text, p.buyer_requirements::text, p.box_contents::text, p.nextly_take,
      p.seo_description, p.status::text AS status, p.featured::text AS featured, p.updated_at::text AS updated_at,
      p.catalog_published::text AS catalog_published, p.needs_review::text AS needs_review,
      p.review_reason,
      c.name AS category_name,
      b.name AS brand_name,
      s.name AS supplier_name,
      (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_count,
      (SELECT COALESCE(i.thumb_url, i.url) FROM product_images i WHERE i.product_id = p.id
        ORDER BY i.is_primary DESC, (i.variant_id IS NULL) DESC, i.position LIMIT 1) AS image_url,
      (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id)::text AS image_count,
      COALESCE((SELECT SUM(sl.on_hand) FROM v_stock_levels sl
                 WHERE sl.product_id = p.id), 0)::text AS on_hand,
      COALESCE((SELECT SUM(poi.quantity - poi.quantity_received)
                  FROM purchase_order_items poi
                  JOIN purchase_orders po ON po.id = poi.purchase_order_id
                  JOIN product_variants iv ON iv.id = poi.variant_id
                 WHERE iv.product_id = p.id AND po.status IN ('ordered', 'shipped')), 0)::text AS incoming,
      COALESCE((SELECT SUM(sl.value_cents) FROM v_stock_levels sl
                 WHERE sl.product_id = p.id), 0)::text AS stock_value_cents,
      COALESCE((SELECT MIN(v.list_price_cents) FROM product_variants v
                 WHERE v.product_id = p.id AND v.is_active), 0)::text AS list_price_cents,
      COALESCE((SELECT json_agg(json_build_object('isActive', v.is_active, 'listPriceCents', v.list_price_cents))::text FROM product_variants v WHERE v.product_id = p.id), '[]') AS readiness_variants,
      COALESCE((SELECT json_agg(json_build_object('alt', i.alt))::text FROM product_images i WHERE i.product_id = p.id), '[]') AS readiness_images,
      COUNT(*) OVER()::text AS total_count
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN suppliers  s ON s.id = p.supplier_id
    ${where}
    ORDER BY ${orderBy} ${direction}, p.name
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      imageUrl: maybe(row.image_url),
      code: text(row.code),
      name: text(row.name),
      needsReview: bool(row.needs_review),
      reviewReason: maybe(row.review_reason),
      brandName: maybe(row.brand_name),
      categoryName: maybe(row.category_name),
      supplierName: maybe(row.supplier_name),
      status: text(row.status) as ProductRow['status'],
      catalogPublished: bool(row.catalog_published),
      variantCount: num(row.variant_count),
      imageCount: num(row.image_count),
      onHand: num(row.on_hand),
      incoming: num(row.incoming),
      featured: bool(row.featured),
      updatedAt: text(row.updated_at),
      stockValueCents: num(row.stock_value_cents),
      listPriceCents: num(row.list_price_cents),
      catalogReadiness: catalogReadiness({
        name: row.name,
        slug: row.slug,
        summary: row.summary,
        brandId: row.brand_id,
        images: parseReadinessImages(row.readiness_images),
        variants: parseReadinessVariants(row.readiness_variants),
        compatibility: parseReadinessCompatibility(row.compatibility),
        keyFeatures: parseReadinessStrings(row.key_features),
        buyerRequirements: parseReadinessObject(row.buyer_requirements),
        boxContents: parseReadinessStrings(row.box_contents),
        nextlyTake: row.nextly_take,
        seoDescription: row.seo_description,
      }),
    })),
    total,
    page,
    perPage,
  );
}

function parseReadinessStrings(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
function parseReadinessObject(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
function parseReadinessCompatibility(value: string | null | undefined) {
  const raw = parseReadinessObject(value);
  return {
    platforms: Array.isArray(raw.platforms)
      ? raw.platforms.filter((item): item is string => typeof item === 'string')
      : [],
    protocols: Array.isArray(raw.protocols)
      ? raw.protocols.filter((item): item is string => typeof item === 'string')
      : [],
    ecosystems: Array.isArray(raw.ecosystems)
      ? raw.ecosystems.filter((item): item is string => typeof item === 'string')
      : [],
  };
}
function parseReadinessVariants(
  value: string | null | undefined,
): { isActive: boolean; listPriceCents: number }[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.flatMap((item) =>
          item &&
          typeof item === 'object' &&
          typeof (item as { isActive?: unknown }).isActive === 'boolean' &&
          typeof (item as { listPriceCents?: unknown }).listPriceCents === 'number'
            ? [
                {
                  isActive: (item as { isActive: boolean }).isActive,
                  listPriceCents: (item as { listPriceCents: number }).listPriceCents,
                },
              ]
            : [],
        )
      : [];
  } catch {
    return [];
  }
}
function parseReadinessImages(value: string | null | undefined): { alt?: string | null }[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.flatMap((item) =>
          item && typeof item === 'object'
            ? [
                {
                  alt:
                    typeof (item as { alt?: unknown }).alt === 'string'
                      ? (item as { alt: string }).alt
                      : null,
                },
              ]
            : [],
        )
      : [];
  } catch {
    return [];
  }
}

export type StockLevelRow = {
  variantId: string;
  imageUrl: string | null;
  /** Units held at the selected location, when the list is filtered by location. */
  atLocation: number | null;
  sku: string;
  productName: string;
  variantName: string;
  categoryName: string | null;
  onHand: number;
  reserved: number;
  available: number;
  received: number;
  sold: number;
  inbound: number;
  valueCents: Cents;
  /** Derived, not stored: value / quantity carries sub-cent precision. */
  unitCostCents: number | null;
  lastMovementAt: string | null;
};

const STOCK_SORT: Record<StockQuery['sort'], SQL> = {
  name: sql`s.product_name, s.variant_name`,
  onHand: sql`s.on_hand`,
  value: sql`s.value_cents`,
};

export async function listStock(
  query: StockQuery = {} as StockQuery,
): Promise<Page<StockLevelRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(
      sql`(s.sku ILIKE ${term} OR s.product_name ILIKE ${term} OR s.variant_name ILIKE ${term}
        OR pr.model_number ILIKE ${term}
        OR EXISTS (SELECT 1 FROM brands qb WHERE qb.id = pr.brand_id AND qb.name ILIKE ${term}))`,
    );
  }
  if (query.category) conditions.push(sql`pr.category_id = ${query.category}`);
  if (query.state === 'in') conditions.push(sql`s.on_hand > 0`);
  if (query.state === 'out') conditions.push(sql`s.on_hand = 0`);
  if (query.state === 'over') conditions.push(sql`s.on_hand < 0`);
  if (query.state === 'low') {
    conditions.push(
      sql`s.on_hand > 0 AND s.on_hand <= COALESCE((SELECT low_stock_threshold FROM settings LIMIT 1), 0)`,
    );
  }
  // Legacy movements with no location count at the main location, as the shop's stock does.
  const atLocation = query.location
    ? sql`COALESCE((
        SELECT SUM(lm.quantity) FROM inventory_movements lm
         WHERE lm.variant_id = s.variant_id
           AND (lm.location_id = ${query.location}
                OR (lm.location_id IS NULL AND ${query.location} = (SELECT id FROM locations WHERE slug = 'main' LIMIT 1)))
      ), 0)`
    : null;
  if (atLocation) conditions.push(sql`${atLocation} <> 0`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = STOCK_SORT[query.sort] ?? STOCK_SORT.name;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.variant_id, s.sku, s.product_name, s.variant_name,
      ${variantImageSql('s.variant_id', 's.product_id')} AS image_url,
      ${atLocation ?? sql`NULL::bigint`}::text AS at_location,
      s.on_hand::text, s.total_received::text, s.total_sold::text,
      s.value_cents::text, s.last_movement_at::text,
      c.name AS category_name,
      COALESCE((
        SELECT SUM(i.quantity - i.quantity_received)
          FROM purchase_order_items i
          JOIN purchase_orders p ON p.id = i.purchase_order_id
         WHERE i.variant_id = s.variant_id AND p.status IN ('ordered', 'shipped')
      ), 0)::text AS inbound,
      COALESCE((
        SELECT SUM(r.quantity)
          FROM inventory_reservations r
         WHERE r.variant_id = s.variant_id
           AND r.status = 'active'
           AND (r.expires_at IS NULL OR r.expires_at > now())
      ), 0)::text AS reserved,
      COUNT(*) OVER()::text AS total_count
    FROM v_stock_levels s
    JOIN products pr ON pr.id = s.product_id
    LEFT JOIN categories c ON c.id = pr.category_id
    ${where}
    ORDER BY ${orderBy} ${direction}
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => {
      const onHand = num(row.on_hand);
      const reserved = num(row.reserved);
      const valueCents = num(row.value_cents);
      return {
        variantId: text(row.variant_id),
        imageUrl: maybe(row.image_url),
        atLocation: row.at_location === null ? null : num(row.at_location),
        sku: text(row.sku),
        productName: text(row.product_name),
        variantName: text(row.variant_name),
        categoryName: maybe(row.category_name),
        onHand,
        reserved,
        available: onHand - reserved,
        received: num(row.total_received),
        sold: num(row.total_sold),
        inbound: num(row.inbound),
        valueCents,
        unitCostCents: onHand > 0 ? valueCents / onHand : null,
        lastMovementAt: maybe(row.last_movement_at),
      };
    }),
    total,
    page,
    perPage,
  );
}

export type LedgerRow = {
  id: string;
  seq: number;
  occurredAt: string;
  direction: 'in' | 'out';
  category: string;
  description: string;
  memberName: string | null;
  paymentMethod: string;
  walletName: string | null;
  eventType: string;
  netCents: Cents;
  balanceCents: Cents;
};

export async function listLedger(
  query: LedgerQuery = {} as LedgerQuery,
): Promise<Page<LedgerRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  // The running balance is a window function baked into v_cash_ledger's own
  // definition, computed over every entry before this query's WHERE ever
  // runs — so a filtered or paginated row still shows its true balance as
  // of that moment, never one relative to just the filtered set.
  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(l.description ILIKE ${term} OR m.full_name ILIKE ${term})`);
  }
  if (query.category) conditions.push(sql`l.category = ${query.category}::ledger_category`);
  if (query.from)
    conditions.push(sql`(l.occurred_at AT TIME ZONE 'UTC')::date >= ${query.from}::date`);
  if (query.to)
    conditions.push(sql`(l.occurred_at AT TIME ZONE 'UTC')::date <= ${query.to}::date`);
  if (query.wallet) conditions.push(sql`l.wallet_id = ${query.wallet}`);
  if (query.type) conditions.push(sql`l.direction = ${query.type}::ledger_direction`);
  // The view carries the US-dollar amount only; the currency the money moved in lives on the entry.
  if (query.currency)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ledger_entries le WHERE le.id = l.id AND le.currency = ${query.currency}::currency_code)`,
    );
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      l.id, l.seq::text, l.occurred_at::text, l.direction::text, l.category::text,
      l.description, l.payment_method::text, l.net_usd_cents::text,
      l.balance_usd_cents::text, m.full_name AS member_name, w.name AS wallet_name,
      l.event_type,
      COUNT(*) OVER()::text AS total_count
    FROM v_cash_ledger l
    LEFT JOIN members m ON m.id = l.member_id
    LEFT JOIN wallets w ON w.id = l.wallet_id
    ${where}
    ORDER BY l.occurred_at ${direction}, l.seq ${direction}
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      seq: num(row.seq),
      occurredAt: text(row.occurred_at),
      direction: text(row.direction) as 'in' | 'out',
      category: text(row.category),
      description: text(row.description),
      memberName: maybe(row.member_name),
      paymentMethod: text(row.payment_method),
      walletName: maybe(row.wallet_name),
      eventType: text(row.event_type, 'legacy'),
      netCents: num(row.net_usd_cents),
      balanceCents: num(row.balance_usd_cents),
    })),
    total,
    page,
    perPage,
  );
}

export type SaleRow = {
  id: string;
  number: string;
  soldAt: string;
  customerName: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  status: 'draft' | 'confirmed' | 'void';
  currency: string;
  itemCount: number;
  unitCount: number;
  totalUsdCents: Cents;
  cogsCents: Cents;
  grossCents: Cents;
  paymentMethod: string;
  shortfall: number;
  /** Money received against the sale, in its own currency (F-4). */
  totalCents: Cents;
  paidCents: Cents;
  /** Derived from those two plus the sale's age — never stored. Draft and void
   *  sales are not owed, so they get no badge. */
  paymentStatus: PaymentBadgeCode | null;
};

export type OrderRow = {
  id: string;
  number: string;
  orderedAt: string;
  customerName: string | null;
  status: 'draft' | 'confirmed' | 'ready' | 'completed' | 'cancelled';
  source: 'manual' | 'pos' | 'web' | 'whatsapp' | 'messenger';
  fulfillmentType: 'pickup' | 'delivery' | null;
  currency: string;
  itemCount: number;
  unitCount: number;
  totalCents: Cents;
  paidCents: Cents;
  balanceCents: Cents;
};

export async function listOrders(
  query: OrderQuery = {} as OrderQuery,
): Promise<Page<OrderRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);
  const conditions: SQL[] = [sql`s.number LIKE 'ORD-%'`];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(s.number ILIKE ${term} OR c.name ILIKE ${term})`);
  }
  if (query.status) conditions.push(sql`s.workflow_status = ${query.status}::order_status`);
  if (query.source) conditions.push(sql`s.source = ${query.source}::order_source`);
  if (query.customer) conditions.push(sql`s.customer_id = ${query.customer}`);
  if (query.from)
    conditions.push(sql`(s.sold_at AT TIME ZONE 'UTC')::date >= ${query.from}::date`);
  if (query.to) conditions.push(sql`(s.sold_at AT TIME ZONE 'UTC')::date <= ${query.to}::date`);
  if (query.payment) {
    // Same figure the list's Balance column shows: confirmed payments against the total. A draft
    // or cancelled order is not owed anything, so it matches none of the three.
    const paid = sql`COALESCE((SELECT SUM(fp.amount_cents) FROM sale_payments fp
                               WHERE fp.sale_id = s.id AND fp.status = 'confirmed'), 0)`;
    conditions.push(
      query.payment === 'paid'
        ? sql`(s.workflow_status NOT IN ('draft', 'cancelled') AND ${paid} >= s.total_cents)`
        : query.payment === 'partly'
          ? sql`(s.workflow_status NOT IN ('draft', 'cancelled') AND ${paid} > 0 AND ${paid} < s.total_cents)`
          : sql`(s.workflow_status NOT IN ('draft', 'cancelled') AND ${paid} <= 0 AND s.total_cents > 0)`,
    );
  }
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`;
  const orderBy =
    query.sort === 'customer'
      ? sql`c.name NULLS LAST`
      : query.sort === 'total'
        ? sql`s.total_cents`
        : sql`s.sold_at`;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.id, s.number, s.sold_at::text, s.workflow_status::text, s.source::text,
      s.currency::text, s.total_cents::text, c.name AS customer_name,
      f.type::text AS fulfillment_type,
      (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id)::text AS item_count,
      COALESCE((SELECT SUM(i.quantity) FROM sale_items i WHERE i.sale_id = s.id), 0)::text AS unit_count,
      COALESCE((SELECT SUM(p.amount_cents) FROM sale_payments p
                WHERE p.sale_id = s.id AND p.status = 'confirmed'), 0)::text AS paid_cents,
      COUNT(*) OVER()::text AS total_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN order_fulfillments f ON f.order_id = s.id
    ${where}
    ORDER BY ${orderBy} ${direction}, s.number DESC
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);
  const total = num(rows[0]?.total_count);
  return toPage(
    rows.map((row) => {
      const totalCents = num(row.total_cents);
      const paidCents = num(row.paid_cents);
      return {
        id: text(row.id),
        number: text(row.number),
        orderedAt: text(row.sold_at),
        customerName: maybe(row.customer_name),
        status: text(row.workflow_status) as OrderRow['status'],
        source: text(row.source, 'manual') as OrderRow['source'],
        fulfillmentType: maybe(row.fulfillment_type) as OrderRow['fulfillmentType'],
        currency: text(row.currency, 'USD'),
        itemCount: num(row.item_count),
        unitCount: num(row.unit_count),
        totalCents,
        paidCents,
        balanceCents: Math.max(0, totalCents - paidCents),
      };
    }),
    total,
    page,
    perPage,
  );
}

/** `ORDER BY` from a whitelist, never interpolated user input — an unknown
 *  or missing key falls back to the default so a hand-edited URL degrades
 *  rather than errors. */
const SALE_SORT: Record<SaleQuery['sort'], SQL> = {
  date: sql`s.sold_at`,
  customer: sql`c.name NULLS LAST`,
  revenue: sql`s.total_usd_cents`,
  margin: sql`CASE WHEN s.total_usd_cents = 0 THEN 0
                    ELSE s.gross_profit_cents::numeric / s.total_usd_cents END`,
};

export async function listSales(query: SaleQuery = {} as SaleQuery): Promise<Page<SaleRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(
      s.number ILIKE ${term} OR c.name ILIKE ${term}
      OR EXISTS (
        SELECT 1 FROM sale_items qi
          JOIN product_variants qv ON qv.id = qi.variant_id
          JOIN products qp ON qp.id = qv.product_id
         WHERE qi.sale_id = s.id
           AND (qp.name ILIKE ${term} OR qv.sku ILIKE ${term} OR qv.name ILIKE ${term})
      )
    )`);
  }
  if (query.status) conditions.push(sql`s.status = ${query.status}::sale_status`);
  if (query.from)
    conditions.push(sql`(s.sold_at AT TIME ZONE 'UTC')::date >= ${query.from}::date`);
  if (query.to) conditions.push(sql`(s.sold_at AT TIME ZONE 'UTC')::date <= ${query.to}::date`);
  if (query.seller) conditions.push(sql`s.seller_id = ${query.seller}`);
  if (query.currency) conditions.push(sql`s.currency = ${query.currency}::currency_code`);
  if (query.payment) {
    // Same rule as src/lib/payment-status.ts: only a confirmed sale is owed anything.
    const paid = sql`(
      COALESCE((SELECT SUM(fp.amount_cents) FROM sale_payments fp WHERE fp.sale_id = s.id), 0)
      + COALESCE((
          SELECT SUM(CASE WHEN fl.direction = 'in' THEN fl.amount_cents ELSE -fl.amount_cents END)
            FROM ledger_entries fl
           WHERE fl.source_kind = 'sale' AND fl.source_id = s.id AND fl.category = 'sales_receipt'
        ), 0)
    )`;
    const aged = sql.raw(`s.sold_at < now() - interval '${OVERDUE_AFTER_DAYS} days'`);
    conditions.push(
      query.payment === 'paid'
        ? sql`(s.status = 'confirmed' AND ${paid} >= s.total_cents)`
        : query.payment === 'overdue'
          ? sql`(s.status = 'confirmed' AND ${paid} < s.total_cents AND ${aged})`
          : query.payment === 'partly'
            ? sql`(s.status = 'confirmed' AND ${paid} > 0 AND ${paid} < s.total_cents AND NOT (${aged}))`
            : sql`(s.status = 'confirmed' AND ${paid} <= 0 AND NOT (${aged}))`,
    );
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  // Sequential scan over an ILIKE, not a trigram index: at a few hundred
  // rows a scan is faster than the index would be and far easier to read.
  // Reconsider only if a single list nears the tens of thousands of rows.
  const orderBy = SALE_SORT[query.sort] ?? SALE_SORT.date;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      s.id, s.number, s.sold_at::text, s.status::text, s.currency::text,
      s.total_cents::text,
      s.total_usd_cents::text, s.cogs_cents::text, s.gross_profit_cents::text,
      s.payment_method::text, c.name AS customer_name,
      s.needs_review::text AS needs_review, s.review_reason,
      (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id)::text AS item_count,
      COALESCE((SELECT SUM(i.quantity) FROM sale_items i WHERE i.sale_id = s.id), 0)::text
        AS unit_count,
      COALESCE((SELECT SUM(i.shortfall) FROM sale_items i WHERE i.sale_id = s.id), 0)::text
        AS shortfall,
      (
        COALESCE((SELECT SUM(p.amount_cents) FROM sale_payments p WHERE p.sale_id = s.id), 0)
        + COALESCE((
            SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
              FROM ledger_entries l
             WHERE l.source_kind = 'sale'
               AND l.source_id = s.id
               AND l.category = 'sales_receipt'
          ), 0)
      )::text AS paid_cents,
      COUNT(*) OVER()::text AS total_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    ${where}
    ORDER BY ${orderBy} ${direction}, s.number DESC
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => {
      const totalCents = num(row.total_cents);
      const paidCents = num(row.paid_cents);
      const status = text(row.status) as SaleRow['status'];
      return {
        id: text(row.id),
        number: text(row.number),
        soldAt: text(row.sold_at),
        customerName: maybe(row.customer_name),
        needsReview: bool(row.needs_review),
        reviewReason: maybe(row.review_reason),
        status,
        currency: text(row.currency),
        itemCount: num(row.item_count),
        unitCount: num(row.unit_count),
        totalUsdCents: num(row.total_usd_cents),
        cogsCents: num(row.cogs_cents),
        grossCents: num(row.gross_profit_cents),
        paymentMethod: text(row.payment_method),
        shortfall: num(row.shortfall),
        totalCents,
        paidCents,
        paymentStatus:
          status === 'confirmed'
            ? paymentBadgeOf(totalCents, paidCents, new Date(text(row.sold_at)))
            : null,
      };
    }),
    total,
    page,
    perPage,
  );
}

export type PurchaseOrderRow = {
  id: string;
  number: string;
  supplierName: string | null;
  status: 'draft' | 'ordered' | 'shipped' | 'received' | 'cancelled';
  orderedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  itemCount: number;
  unitCount: number;
  goodsCents: Cents;
  overheadCents: Cents;
  totalCents: Cents;
  /** True when a received order still has un-costed freight and fees. */
  unallocated: boolean;
  /** What the goods actually cost landed, once received (0 before that). */
  landedCents: Cents;
  /** Money paid to the supplier (F-9). Derived from purchase_order_payments. */
  paidCents: Cents;
};

// `total` recomputes the same sum the SELECT list builds, rather than
// referencing its alias: those aliases are cast ::text for the JS driver, and
// Postgres has no `+` operator for text.
const PURCHASE_ORDER_SORT: Record<PurchaseOrderQuery['sort'], SQL> = {
  ordered: sql`COALESCE(p.ordered_at, p.created_at)`,
  supplier: sql`s.name NULLS LAST`,
  total: sql`(p.tax_cents + p.card_fee_cents + p.delivery_cents
              + p.shipping_cents + p.shipping_tax_cents)
             + COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i
                          WHERE i.purchase_order_id = p.id), 0)`,
};

export async function listPurchaseOrders(
  query: PurchaseOrderQuery = {} as PurchaseOrderQuery,
): Promise<Page<PurchaseOrderRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(sql`(p.number ILIKE ${term} OR s.name ILIKE ${term})`);
  }
  if (query.status) conditions.push(sql`p.status = ${query.status}::purchase_order_status`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = PURCHASE_ORDER_SORT[query.sort] ?? PURCHASE_ORDER_SORT.ordered;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.number, p.status::text, p.ordered_at::text, p.expected_at::text,
      p.received_at::text, s.name AS supplier_name,
      (p.tax_cents + p.card_fee_cents + p.delivery_cents
       + p.shipping_cents + p.shipping_tax_cents)::text AS overhead_cents,
      COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i
                 WHERE i.purchase_order_id = p.id), 0)::text AS goods_cents,
      (SELECT COUNT(*) FROM purchase_order_items i
        WHERE i.purchase_order_id = p.id)::text AS item_count,
      COALESCE((SELECT SUM(i.quantity) FROM purchase_order_items i
                 WHERE i.purchase_order_id = p.id), 0)::text AS unit_count,
      (p.status = 'received'
        AND (p.tax_cents + p.card_fee_cents + p.delivery_cents
             + p.shipping_cents + p.shipping_tax_cents) > 0
        AND COALESCE((SELECT SUM(i.overhead_cents) FROM purchase_order_items i
                       WHERE i.purchase_order_id = p.id), 0) = 0)::text AS unallocated,
      COALESCE((SELECT SUM(i.landed_cost_cents) FROM purchase_order_items i
                 WHERE i.purchase_order_id = p.id), 0)::text AS landed_cents,
      (
        COALESCE((SELECT SUM(pp.amount_cents) FROM purchase_order_payments pp
                   WHERE pp.purchase_order_id = p.id), 0)
        + COALESCE((
            SELECT SUM(CASE WHEN l.direction = 'out' THEN l.amount_cents ELSE -l.amount_cents END)
              FROM ledger_entries l
             WHERE l.source_kind = 'purchase_order'
               AND l.source_id = p.id
               AND l.category = 'purchase'
          ), 0)
      )::text AS paid_cents,
      COUNT(*) OVER()::text AS total_count
    FROM purchase_orders p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${where}
    ORDER BY ${orderBy} ${direction}, p.number DESC
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => {
      const goodsCents = num(row.goods_cents);
      const overheadCents = num(row.overhead_cents);
      return {
        id: text(row.id),
        number: text(row.number),
        supplierName: maybe(row.supplier_name),
        status: text(row.status) as PurchaseOrderRow['status'],
        orderedAt: maybe(row.ordered_at),
        expectedAt: maybe(row.expected_at),
        receivedAt: maybe(row.received_at),
        itemCount: num(row.item_count),
        unitCount: num(row.unit_count),
        goodsCents,
        overheadCents,
        totalCents: goodsCents + overheadCents,
        unallocated: bool(row.unallocated),
        landedCents: num(row.landed_cents),
        paidCents: num(row.paid_cents),
      };
    }),
    total,
    page,
    perPage,
  );
}

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
  orderCount: number;
  spentCents: Cents;
  grossCents: Cents;
  lastOrderAt: string | null;
};

const CUSTOMER_SORT: Record<CustomerQuery['sort'], SQL> = {
  name: sql`c.name`,
  orders: sql`t.order_count`,
  spent: sql`t.spent_usd_cents`,
};

export async function listCustomers(
  query: CustomerQuery = {} as CustomerQuery,
): Promise<Page<CustomerRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(
      sql`(c.name ILIKE ${term} OR c.code ILIKE ${term} OR c.phone ILIKE ${term} OR c.email ILIKE ${term})`,
    );
  }
  if (query.from)
    conditions.push(sql`(t.last_order_at AT TIME ZONE 'UTC')::date >= ${query.from}::date`);
  if (query.to)
    conditions.push(sql`(t.last_order_at AT TIME ZONE 'UTC')::date <= ${query.to}::date`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = CUSTOMER_SORT[query.sort] ?? CUSTOMER_SORT.spent;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      c.id, c.code, c.name, c.phone, c.email, c.address_line, c.city, c.notes,
      t.order_count::text, t.spent_usd_cents::text,
      t.gross_profit_cents::text, t.last_order_at::text,
      COUNT(*) OVER()::text AS total_count
    FROM customers c
    JOIN v_customer_totals t ON t.customer_id = c.id
    ${where}
    ORDER BY ${orderBy} ${direction}, c.name
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      code: text(row.code),
      name: text(row.name),
      phone: maybe(row.phone),
      email: maybe(row.email),
      addressLine: maybe(row.address_line),
      city: maybe(row.city),
      notes: maybe(row.notes),
      orderCount: num(row.order_count),
      spentCents: num(row.spent_usd_cents),
      grossCents: num(row.gross_profit_cents),
      lastOrderAt: maybe(row.last_order_at),
    })),
    total,
    page,
    perPage,
  );
}

export type ExpenseRow = {
  id: string;
  occurredAt: string;
  /** `YYYY-MM-DD`, for seeding an `<input type="date">` when editing. */
  occurredDate: string;
  description: string;
  vendorName: string | null;
  classification: string;
  needsReview: boolean;
  reviewReason: string | null;
  receiptNumber: string | null;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  currency: string;
  amountCents: Cents;
  amountUsdCents: Cents;
  paymentMethod: string;
  walletName: string | null;
  voidedAt: string | null;
  /** Whether this expense currently has a matching ledger posting — what the
   *  edit form's "post to the cash ledger" checkbox should start checked as. */
  hasLedgerEntry: boolean;
  /** Only exposes receipt presence to the list; the private object key stays server-side. */
  hasReceipt: boolean;
};

const EXPENSE_SORT: Record<ExpenseQuery['sort'], SQL> = {
  date: sql`e.occurred_at`,
  amount: sql`e.amount_usd_cents`,
};

export async function listExpenses(
  query: ExpenseQuery = {} as ExpenseQuery,
): Promise<Page<ExpenseRow>> {
  if (!isDatabaseConfigured()) return toPage([], 0, 1, 50);

  const page = clampPage(query.page);
  const perPage = clampPerPage(query.perPage);

  const conditions: SQL[] = [];
  if (query.q) {
    const term = `%${query.q}%`;
    conditions.push(
      sql`(e.description ILIKE ${term} OR e.receipt_number ILIKE ${term} OR c.name ILIKE ${term})`,
    );
  }
  if (query.from)
    conditions.push(sql`(e.occurred_at AT TIME ZONE 'UTC')::date >= ${query.from}::date`);
  if (query.to)
    conditions.push(sql`(e.occurred_at AT TIME ZONE 'UTC')::date <= ${query.to}::date`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const orderBy = EXPENSE_SORT[query.sort] ?? EXPENSE_SORT.date;
  const direction = sql.raw(query.dir === 'asc' ? 'ASC' : 'DESC');

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      e.id, e.occurred_at::text, to_char(e.occurred_at, 'YYYY-MM-DD') AS occurred_date,
      e.description, e.vendor_name, e.classification, e.needs_review::text,
      e.review_reason, e.receipt_number, e.category_id, e.currency::text, e.notes,
      e.amount_cents::text, e.amount_usd_cents::text, e.payment_method::text,
      e.voided_at::text, w.name AS wallet_name,
      c.name AS category_name,
      EXISTS(
        SELECT 1 FROM ledger_entries l
         WHERE l.source_kind = 'expense' AND l.source_id = e.id
      )::text AS has_ledger_entry,
      (e.receipt_pathname IS NOT NULL)::text AS has_receipt,
      COUNT(*) OVER()::text AS total_count
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN wallets w ON w.id = e.wallet_id
    ${where}
    ORDER BY ${orderBy} ${direction}
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);

  const total = num(rows[0]?.total_count);

  return toPage(
    rows.map((row) => ({
      id: text(row.id),
      occurredAt: text(row.occurred_at),
      occurredDate: text(row.occurred_date),
      description: text(row.description),
      vendorName: maybe(row.vendor_name),
      classification: text(row.classification, 'unclassified'),
      needsReview: bool(row.needs_review),
      reviewReason: maybe(row.review_reason),
      receiptNumber: maybe(row.receipt_number),
      categoryId: maybe(row.category_id),
      categoryName: maybe(row.category_name),
      notes: maybe(row.notes),
      currency: text(row.currency),
      amountCents: num(row.amount_cents),
      amountUsdCents: num(row.amount_usd_cents),
      paymentMethod: text(row.payment_method),
      walletName: maybe(row.wallet_name),
      voidedAt: maybe(row.voided_at),
      hasLedgerEntry: bool(row.has_ledger_entry),
      hasReceipt: bool(row.has_receipt),
    })),
    total,
    page,
    perPage,
  );
}
