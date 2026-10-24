import { sql } from 'drizzle-orm';
import {
  marginBasisPoints,
  type QualityIssue,
  qualityIssues,
  unitCostCents,
} from '@/lib/catalog-quality';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { maybe, num, text } from './row';

/**
 * Everything the product screen shows beyond the edit form, from real rows only.
 *
 * One query per topic, each for the whole product (never one per variant): stock and cost,
 * prices in every currency, stock per location, the last purchase, the last sales, recorded price
 * changes, and the latest reorder suggestion. Nothing is invented: a figure that does not exist
 * (a cost before anything was received, a price in a currency nobody priced) is null and shown as
 * a dash, not as zero.
 */

export type VariantOverview = {
  id: string;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  valueCents: Cents;
  /** Weighted-average landed cost per unit while stock is on hand. */
  landedUnitCostCents: number | null;
  /** The cost used for margin: landed average, else the supplier list cost, else null. */
  unitCostCents: number | null;
  marginBp: number | null;
  lastMovementAt: string | null;
  /** The variant's own prices: its list price first, then each active price list. */
  prices: { key: string; label: string; currency: 'USD' | 'SRD'; cents: Cents }[];
  locations: { id: string; name: string; onHand: number }[];
  reorder: {
    recommendedQty: number;
    daysOfCover: number | null;
    dailyDemand: number;
    unitsSold90d: number;
  } | null;
};

export type LastPurchase = {
  orderId: string;
  number: string;
  supplierName: string | null;
  receivedAt: string | null;
  orderedAt: string | null;
  variantName: string;
  quantity: number;
  /** Landed cost per unit, freight and fees included. */
  landedUnitCostCents: number;
  currency: 'USD' | 'SRD';
};

export type RecentSale = {
  saleId: string;
  number: string;
  soldAt: string;
  status: 'draft' | 'confirmed' | 'void';
  customerName: string | null;
  variantName: string;
  quantity: number;
  unitPriceCents: Cents;
  currency: 'USD' | 'SRD';
};

export type PriceChange = {
  at: string;
  who: string | null;
  variantName: string;
  fromCents: Cents;
  toCents: Cents;
  /** Which price: the list price, or the name of a price list. */
  listName: string;
  currency: 'USD' | 'SRD';
};

export type ChargedPrice = {
  since: string;
  variantName: string;
  unitPriceCents: Cents;
  currency: 'USD' | 'SRD';
  saleNumber: string;
};

export type ProductOverview = {
  variants: Map<string, VariantOverview>;
  totals: {
    onHand: number;
    reserved: number;
    available: number;
    incoming: number;
    valueCents: Cents;
  };
  lowStockThreshold: number;
  lastPurchase: LastPurchase | null;
  recentSales: RecentSale[];
  priceChanges: PriceChange[];
  chargedPrices: ChargedPrice[];
  issues: QualityIssue[];
};

export async function getProductOverview(input: {
  productId: string;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  categoryId: string | null;
  imageCount: number;
  variants: {
    id: string;
    name: string;
    listPriceCents: number;
    referenceCostCents: number;
    isActive: boolean;
  }[];
}): Promise<ProductOverview> {
  const empty: ProductOverview = {
    variants: new Map(),
    totals: { onHand: 0, reserved: 0, available: 0, incoming: 0, valueCents: 0 },
    lowStockThreshold: 5,
    lastPurchase: null,
    recentSales: [],
    priceChanges: [],
    chargedPrices: [],
    issues: [],
  };
  if (!isDatabaseConfigured() || input.variants.length === 0) return empty;

  const variantIds = sql.join(
    input.variants.map((variant) => sql`${variant.id}::uuid`),
    sql`, `,
  );
  const nameById = new Map(input.variants.map((variant) => [variant.id, variant.name]));

  const [
    stockRows,
    reservedRows,
    incomingRows,
    priceRows,
    locationRows,
    reorderRows,
    settingsRows,
  ] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
        SELECT m.variant_id, SUM(m.quantity)::text AS on_hand, SUM(m.value_cents)::text AS value_cents,
               MAX(m.occurred_at)::text AS last_movement_at
          FROM inventory_movements m
         WHERE m.variant_id IN (${variantIds})
         GROUP BY m.variant_id
      `),
    db.execute<Record<string, string | null>>(sql`
        SELECT r.variant_id, SUM(r.quantity)::text AS reserved
          FROM inventory_reservations r
         WHERE r.variant_id IN (${variantIds}) AND r.status = 'active'
           AND (r.expires_at IS NULL OR r.expires_at > now())
         GROUP BY r.variant_id
      `),
    db.execute<Record<string, string | null>>(sql`
        SELECT i.variant_id, SUM(i.quantity - i.quantity_received)::text AS incoming
          FROM purchase_order_items i
          JOIN purchase_orders o ON o.id = i.purchase_order_id
         WHERE i.variant_id IN (${variantIds}) AND o.status IN ('ordered', 'shipped')
         GROUP BY i.variant_id
      `),
    db.execute<Record<string, string | null>>(sql`
        SELECT pli.variant_id, pl.id AS price_list_id, pl.name, pl.currency::text AS currency,
               pli.amount_cents::text AS amount_cents
          FROM price_list_items pli
          JOIN price_lists pl ON pl.id = pli.price_list_id
         WHERE pli.variant_id IN (${variantIds}) AND pl.active
         ORDER BY pl.currency, pl.name
      `),
    db.execute<Record<string, string | null>>(sql`
        SELECT m.variant_id,
               COALESCE(m.location_id, (SELECT id FROM locations WHERE slug = 'main' LIMIT 1)) AS location_id,
               SUM(m.quantity)::text AS on_hand
          FROM inventory_movements m
         WHERE m.variant_id IN (${variantIds})
         GROUP BY 1, 2
        HAVING SUM(m.quantity) <> 0
      `),
    db.execute<Record<string, string | null>>(sql`
        SELECT DISTINCT ON (r.variant_id) r.variant_id, r.recommended_qty::text, r.days_of_cover::text,
               r.daily_demand::text, r.units_sold_90d::text
          FROM reorder_recommendations r
          JOIN reorder_runs rr ON rr.id = r.run_id
         WHERE r.variant_id IN (${variantIds})
         ORDER BY r.variant_id, rr.run_date DESC
      `),
    db.execute<Record<string, string | null>>(
      sql`SELECT COALESCE(low_stock_threshold, 5)::text AS threshold FROM settings LIMIT 1`,
    ),
  ]);

  const locationNames = new Map(
    (await db.execute<Record<string, string | null>>(sql`SELECT id, name FROM locations`)).map(
      (row) => [text(row.id), text(row.name)],
    ),
  );

  const stockBy = new Map(stockRows.map((row) => [text(row.variant_id), row]));
  const reservedBy = new Map(
    reservedRows.map((row) => [text(row.variant_id), num(row.reserved)]),
  );
  const incomingBy = new Map(
    incomingRows.map((row) => [text(row.variant_id), num(row.incoming)]),
  );
  const reorderBy = new Map(reorderRows.map((row) => [text(row.variant_id), row]));

  const variants = new Map<string, VariantOverview>();
  const totals = { onHand: 0, reserved: 0, available: 0, incoming: 0, valueCents: 0 };
  let withoutPrice = 0;
  let withoutCost = 0;
  let activeCount = 0;
  let lowestMarginBp: number | null = null;
  let onHandActive = 0;

  for (const variant of input.variants) {
    const stock = stockBy.get(variant.id);
    const onHand = num(stock?.on_hand);
    const valueCents = num(stock?.value_cents);
    const reserved = reservedBy.get(variant.id) ?? 0;
    const incoming = incomingBy.get(variant.id) ?? 0;
    const cost = unitCostCents({
      onHand,
      valueCents,
      referenceCostCents: variant.referenceCostCents,
    });
    const marginBp = marginBasisPoints(variant.listPriceCents, cost);
    const prices: VariantOverview['prices'] = [
      { key: 'list', label: 'List price', currency: 'USD', cents: variant.listPriceCents },
      ...priceRows
        .filter((row) => text(row.variant_id) === variant.id)
        .map((row) => ({
          key: text(row.price_list_id),
          label: text(row.name),
          currency: (text(row.currency, 'USD') === 'SRD' ? 'SRD' : 'USD') as 'USD' | 'SRD',
          cents: num(row.amount_cents),
        })),
    ];
    const reorder = reorderBy.get(variant.id);
    variants.set(variant.id, {
      id: variant.id,
      onHand,
      reserved,
      available: onHand - reserved,
      incoming,
      valueCents,
      landedUnitCostCents: onHand > 0 && valueCents > 0 ? valueCents / onHand : null,
      unitCostCents: cost,
      marginBp,
      lastMovementAt: maybe(stock?.last_movement_at),
      prices,
      locations: locationRows
        .filter((row) => text(row.variant_id) === variant.id && row.location_id)
        .map((row) => ({
          id: text(row.location_id),
          name: locationNames.get(text(row.location_id)) ?? 'Unknown location',
          onHand: num(row.on_hand),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      reorder: reorder
        ? {
            recommendedQty: num(reorder.recommended_qty),
            daysOfCover: reorder.days_of_cover == null ? null : num(reorder.days_of_cover),
            dailyDemand: num(reorder.daily_demand),
            unitsSold90d: num(reorder.units_sold_90d),
          }
        : null,
    });

    totals.onHand += onHand;
    totals.reserved += reserved;
    totals.available += onHand - reserved;
    totals.incoming += incoming;
    totals.valueCents += valueCents;
    if (variant.isActive) {
      activeCount += 1;
      onHandActive += onHand;
      if (variant.listPriceCents <= 0) withoutPrice += 1;
      if (cost === null) withoutCost += 1;
      if (marginBp !== null && (lowestMarginBp === null || marginBp < lowestMarginBp)) {
        lowestMarginBp = marginBp;
      }
    }
  }

  const [purchaseRows, saleRows, changeRows, chargedRows] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT o.id, o.number, o.currency::text AS currency, o.ordered_at::text AS ordered_at,
             o.received_at::text AS received_at, s.name AS supplier_name, v.name AS variant_name,
             i.quantity_received, i.landed_cost_cents
        FROM purchase_order_items i
        JOIN purchase_orders o ON o.id = i.purchase_order_id
        JOIN product_variants v ON v.id = i.variant_id
        LEFT JOIN suppliers s ON s.id = o.supplier_id
       WHERE i.variant_id IN (${variantIds}) AND o.status = 'received' AND i.quantity_received > 0
       ORDER BY o.received_at DESC NULLS LAST, o.number DESC
       LIMIT 1
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT s.id, s.number, s.sold_at::text AS sold_at, s.status::text AS status,
             s.currency::text AS currency, c.name AS customer_name, v.name AS variant_name,
             si.quantity, si.unit_price_cents
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN product_variants v ON v.id = si.variant_id
        LEFT JOIN customers c ON c.id = s.customer_id
       WHERE si.variant_id IN (${variantIds})
       ORDER BY s.sold_at DESC, s.number DESC
       LIMIT 10
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT a.created_at::text AS at, m.full_name AS who, a.entity_id AS variant_id,
             (a.diff -> 'price' ->> 'from') AS from_cents, (a.diff -> 'price' ->> 'to') AS to_cents,
             (a.diff -> 'currency' ->> 'to') AS currency, (a.diff -> 'list' ->> 'to') AS list_ref,
             pl.name AS list_name
        FROM activity_logs a
        LEFT JOIN members m ON m.id = a.actor_id
        LEFT JOIN price_lists pl ON pl.id::text = (a.diff -> 'list' ->> 'to')
       WHERE a.entity_type = 'variant' AND a.entity_id IN (${variantIds})
         AND a.diff ? 'price'
       ORDER BY a.created_at DESC
       LIMIT 15
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT * FROM (
        SELECT s.sold_at::text AS sold_at, s.number, s.currency::text AS currency, v.name AS variant_name,
               si.variant_id, si.unit_price_cents,
               LAG(si.unit_price_cents) OVER (PARTITION BY si.variant_id, s.currency ORDER BY s.sold_at, s.number) AS previous
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          JOIN product_variants v ON v.id = si.variant_id
         WHERE si.variant_id IN (${variantIds}) AND s.status = 'confirmed'
      ) t
      WHERE previous IS DISTINCT FROM unit_price_cents
      ORDER BY sold_at DESC
      LIMIT 10
    `),
  ]);

  const purchase = purchaseRows[0];
  const lastPurchase: LastPurchase | null = purchase
    ? {
        orderId: text(purchase.id),
        number: text(purchase.number),
        supplierName: maybe(purchase.supplier_name),
        receivedAt: maybe(purchase.received_at),
        orderedAt: maybe(purchase.ordered_at),
        variantName: text(purchase.variant_name),
        quantity: num(purchase.quantity_received),
        landedUnitCostCents: Math.round(
          num(purchase.landed_cost_cents) / Math.max(1, num(purchase.quantity_received)),
        ),
        currency: text(purchase.currency, 'USD') === 'SRD' ? 'SRD' : 'USD',
      }
    : null;

  const issues = qualityIssues({
    status: input.status,
    catalogPublished: input.catalogPublished,
    imageCount: input.imageCount,
    categoryId: input.categoryId,
    activeVariantCount: activeCount,
    variantsWithoutPrice: withoutPrice,
    variantsWithoutCost: withoutCost,
    lowestMarginBp,
    onHand: onHandActive,
  });

  return {
    variants,
    totals,
    lowStockThreshold: num(settingsRows[0]?.threshold, 5),
    lastPurchase,
    recentSales: saleRows.map((row) => ({
      saleId: text(row.id),
      number: text(row.number),
      soldAt: text(row.sold_at),
      status: text(row.status, 'confirmed') as RecentSale['status'],
      customerName: maybe(row.customer_name),
      variantName: text(row.variant_name),
      quantity: num(row.quantity),
      unitPriceCents: num(row.unit_price_cents),
      currency: text(row.currency, 'USD') === 'SRD' ? 'SRD' : 'USD',
    })),
    priceChanges: changeRows.map((row) => ({
      at: text(row.at),
      who: maybe(row.who),
      variantName: nameById.get(text(row.variant_id)) ?? 'Variant',
      fromCents: num(row.from_cents),
      toCents: num(row.to_cents),
      listName: row.list_ref === 'list' || !row.list_name ? 'List price' : text(row.list_name),
      currency: text(row.currency, 'USD') === 'SRD' ? 'SRD' : 'USD',
    })),
    chargedPrices: chargedRows.map((row) => ({
      since: text(row.sold_at),
      variantName: text(row.variant_name),
      unitPriceCents: num(row.unit_price_cents),
      currency: text(row.currency, 'USD') === 'SRD' ? 'SRD' : 'USD',
      saleNumber: text(row.number),
    })),
    issues,
  };
}

/* ── Stock movement history, with filters ────────────────────────────────── */

export type MovementRow = {
  id: string;
  occurredAt: string;
  kind: 'receipt' | 'sale' | 'return' | 'adjustment' | 'write_off';
  quantity: number;
  valueCents: Cents;
  variantName: string;
  sku: string;
  locationName: string | null;
  note: string | null;
  sourceKind: string;
  sourceId: string | null;
  sourceNumber: string | null;
  memberName: string | null;
};

export type MovementQuery = {
  kind?: string | undefined;
  variantId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
};

export const MOVEMENT_KINDS = ['receipt', 'sale', 'return', 'adjustment', 'write_off'] as const;
const MOVEMENTS_PER_PAGE = 20;

export async function listProductMovements(
  productId: string,
  query: MovementQuery,
): Promise<{ rows: MovementRow[]; total: number; page: number; pageCount: number }> {
  if (!isDatabaseConfigured()) return { rows: [], total: 0, page: 1, pageCount: 1 };
  const page = Math.max(1, Math.floor(query.page) || 1);
  const conditions = [sql`v.product_id = ${productId}`];
  if (query.kind && (MOVEMENT_KINDS as readonly string[]).includes(query.kind)) {
    conditions.push(sql`m.kind = ${query.kind}::movement_kind`);
  }
  if (query.variantId) conditions.push(sql`m.variant_id = ${query.variantId}`);
  if (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
    conditions.push(sql`m.occurred_at >= ${`${query.from}T00:00:00Z`}::timestamptz`);
  }
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    conditions.push(
      sql`m.occurred_at < (${`${query.to}T00:00:00Z`}::timestamptz + interval '1 day')`,
    );
  }
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT m.id, m.occurred_at::text AS occurred_at, m.kind::text AS kind, m.quantity::text,
           m.value_cents::text, m.note, m.source_kind::text AS source_kind, m.source_id,
           v.name AS variant_name, v.sku, l.name AS location_name, mem.full_name AS member_name,
           COALESCE(
             CASE WHEN m.source_kind = 'sale' THEN (SELECT s.number FROM sales s WHERE s.id = m.source_id) END,
             CASE WHEN m.source_kind = 'purchase_order'
                  THEN (SELECT o.number FROM purchase_orders o WHERE o.id = m.source_id) END
           ) AS source_number,
           COUNT(*) OVER()::text AS total_count
      FROM inventory_movements m
      JOIN product_variants v ON v.id = m.variant_id
      LEFT JOIN locations l ON l.id = m.location_id
      LEFT JOIN members mem ON mem.id = m.created_by_id
     WHERE ${sql.join(conditions, sql` AND `)}
     ORDER BY m.occurred_at DESC, m.seq DESC
     LIMIT ${MOVEMENTS_PER_PAGE} OFFSET ${(page - 1) * MOVEMENTS_PER_PAGE}
  `);
  const total = num(rows[0]?.total_count);
  return {
    rows: rows.map((row) => ({
      id: text(row.id),
      occurredAt: text(row.occurred_at),
      kind: text(row.kind) as MovementRow['kind'],
      quantity: num(row.quantity),
      valueCents: num(row.value_cents),
      variantName: text(row.variant_name),
      sku: text(row.sku),
      locationName: maybe(row.location_name),
      note: maybe(row.note),
      sourceKind: text(row.source_kind),
      sourceId: maybe(row.source_id),
      sourceNumber: maybe(row.source_number),
      memberName: maybe(row.member_name),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / MOVEMENTS_PER_PAGE)),
  };
}
