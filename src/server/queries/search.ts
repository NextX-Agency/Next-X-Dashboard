import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { likeContains } from '@/lib/like';
import {
  MAX_TOTAL_HITS,
  normaliseTerm,
  type RankedHit,
  rankHits,
  type SearchHit,
} from '@/lib/search-rank';
import { db } from '../db/client';
import { productImageSql, variantImageSql } from './image-sql';
import { bool, maybe, num, text } from './row';

/**
 * Global search for the staff dashboard.
 *
 * One bounded lookup per kind of record (each with its own small LIMIT), run in parallel, then
 * ranked in memory by `rankHits`. Nothing here can return a large result however short or odd the
 * term is: the term is cleaned and length-capped, `%` and `_` are escaped, and every statement
 * carries a hard LIMIT.
 *
 * Staff only. The caller (`app/api/search/route.ts`) must have authenticated a member first; these
 * functions do not know who is asking. Because staff may see cost, a product hit could carry it,
 * but it deliberately carries only what the palette shows: price, stock, photo and codes.
 *
 * Indexing: exact lookups by SKU, product code, document number and customer code use the unique
 * btree indexes. `ILIKE '%term%'` on names is a scan of a few thousand narrow rows, bounded by the
 * LIMIT. A trigram index (`pg_trgm`) is the upgrade if the catalogue ever passes tens of thousands
 * of rows; it is not needed at this size and would be a migration.
 */

const PER_KIND_FETCH = 10;

async function searchProducts(term: string): Promise<SearchHit[]> {
  const like = likeContains(term);
  const prefix = `${like.slice(1)}`; // the escaped term followed by % (prefix match)
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT p.id, p.name, p.code, p.model_number, p.status::text AS status,
           p.catalog_published::text AS published,
           b.name AS brand_name,
           ${productImageSql('p.id')} AS image_url,
           (SELECT v.sku FROM product_variants v
             WHERE v.product_id = p.id
               AND (v.sku ILIKE ${like} OR v.barcode ILIKE ${like})
             ORDER BY (v.sku ILIKE ${prefix} OR v.barcode ILIKE ${prefix}) DESC, v.position
             LIMIT 1) AS matched_sku,
           (SELECT v.barcode FROM product_variants v
             WHERE v.product_id = p.id AND v.barcode ILIKE ${like}
             ORDER BY v.position LIMIT 1) AS matched_barcode,
           (SELECT MIN(v.list_price_cents) FROM product_variants v
             WHERE v.product_id = p.id AND v.is_active) AS price_cents,
           (SELECT COALESCE(SUM(m.quantity), 0) FROM inventory_movements m
              JOIN product_variants v ON v.id = m.variant_id
             WHERE v.product_id = p.id AND v.is_active) AS on_hand,
           (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
     WHERE p.name ILIKE ${like} OR p.code ILIKE ${like} OR p.model_number ILIKE ${like}
        OR b.name ILIKE ${like}
        OR EXISTS (SELECT 1 FROM product_variants v
                    WHERE v.product_id = p.id AND (v.sku ILIKE ${like} OR v.barcode ILIKE ${like}
                                                   OR v.name ILIKE ${like}))
     ORDER BY (p.name ILIKE ${prefix} OR p.code ILIKE ${prefix}) DESC, p.name
     LIMIT ${PER_KIND_FETCH}
  `);
  return rows.map((row) => {
    const variants = num(row.variant_count);
    const skuLine = row.matched_sku ?? row.code;
    const subtitle = [
      maybe(row.brand_name),
      skuLine,
      variants > 1 ? `${variants} variants` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      kind: 'product' as const,
      id: text(row.id),
      title: text(row.name),
      subtitle: subtitle || null,
      href: `/items/${text(row.id)}`,
      imageUrl: maybe(row.image_url),
      priceCents: row.price_cents === null ? null : num(row.price_cents),
      onHand: num(row.on_hand),
      status:
        text(row.status) === 'archived'
          ? 'Archived'
          : bool(row.published)
            ? null
            : text(row.status) === 'draft'
              ? 'Draft'
              : 'Not on shop',
      keys: [
        text(row.name),
        text(row.code),
        text(row.model_number),
        text(row.brand_name),
        text(row.matched_sku),
        text(row.matched_barcode),
        `${text(row.brand_name)} ${text(row.name)}`,
      ].filter(Boolean),
    };
  });
}

async function searchCustomers(term: string): Promise<SearchHit[]> {
  const like = likeContains(term);
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT c.id, c.name, c.code, c.phone, c.email,
           (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'confirmed') AS orders
      FROM customers c
     WHERE c.name ILIKE ${like} OR c.code ILIKE ${like} OR c.phone ILIKE ${like}
        OR c.email ILIKE ${like}
     ORDER BY c.name
     LIMIT ${PER_KIND_FETCH}
  `);
  return rows.map((row) => ({
    kind: 'customer' as const,
    id: text(row.id),
    title: text(row.name),
    subtitle:
      [maybe(row.phone), maybe(row.email), `${num(row.orders)} orders`]
        .filter(Boolean)
        .join(' · ') || null,
    href: `/customers/${text(row.id)}`,
    keys: [text(row.name), text(row.code), text(row.phone), text(row.email)].filter(Boolean),
  }));
}

async function searchSales(term: string): Promise<SearchHit[]> {
  const like = likeContains(term);
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id, s.number, s.invoice_number, s.status::text AS status, s.currency::text AS currency,
           s.total_cents::text, s.sold_at::text, c.name AS customer_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.number ILIKE ${like} OR s.invoice_number ILIKE ${like}
     ORDER BY s.sold_at DESC
     LIMIT ${PER_KIND_FETCH}
  `);
  const hits: SearchHit[] = [];
  for (const row of rows) {
    const number = text(row.number);
    const invoiceNumber = maybe(row.invoice_number);
    const currency = text(row.currency, 'USD') === 'SRD' ? ('SRD' as const) : ('USD' as const);
    const when = text(row.sold_at).slice(0, 10);
    const subtitle = [maybe(row.customer_name) ?? 'Walk-in', when].join(' · ');
    const totalCents = num(row.total_cents);
    const status =
      text(row.status) === 'void' ? 'Void' : text(row.status) === 'draft' ? 'Draft' : null;
    const isOrder = number.startsWith('ORD-');
    hits.push({
      kind: isOrder ? 'order' : 'sale',
      id: text(row.id),
      title: number,
      subtitle,
      href: isOrder ? `/orders/${text(row.id)}` : `/sales/${text(row.id)}`,
      totalCents,
      currency,
      status,
      keys: [number],
    });
    if (invoiceNumber) {
      hits.push({
        kind: 'invoice',
        id: text(row.id),
        title: invoiceNumber,
        subtitle: `${number} · ${subtitle}`,
        href: `/invoice/${text(row.id)}`,
        totalCents,
        currency,
        status,
        keys: [invoiceNumber],
      });
    }
  }
  return hits;
}

async function searchSuppliers(term: string): Promise<SearchHit[]> {
  const like = likeContains(term);
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id, s.name, s.kind::text AS kind
      FROM suppliers s
     WHERE s.name ILIKE ${like}
     ORDER BY s.name
     LIMIT ${PER_KIND_FETCH}
  `);
  return rows.map((row) => ({
    kind: 'supplier' as const,
    id: text(row.id),
    title: text(row.name),
    subtitle: text(row.kind).replace(/_/g, ' ') || null,
    href: `/suppliers/${text(row.id)}`,
    keys: [text(row.name)],
  }));
}

async function searchPurchaseOrders(term: string): Promise<SearchHit[]> {
  const like = likeContains(term);
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT o.id, o.number, o.status::text AS status, o.reference, o.ordered_at::text AS ordered_at,
           s.name AS supplier_name
      FROM purchase_orders o
      LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE o.number ILIKE ${like} OR o.reference ILIKE ${like}
     ORDER BY o.ordered_at DESC NULLS LAST
     LIMIT ${PER_KIND_FETCH}
  `);
  return rows.map((row) => ({
    kind: 'purchase_order' as const,
    id: text(row.id),
    title: text(row.number),
    subtitle:
      [maybe(row.supplier_name), maybe(row.reference), text(row.status)]
        .filter(Boolean)
        .join(' · ') || null,
    href: `/purchase-orders/${text(row.id)}`,
    keys: [text(row.number), text(row.reference)].filter(Boolean),
  }));
}

export type GlobalSearchResult = { term: string; hits: Omit<RankedHit, 'keys'>[] };

/** The palette's search. Returns an empty list for a term that is too short. */
export async function globalSearch(rawTerm: string): Promise<GlobalSearchResult> {
  const term = normaliseTerm(rawTerm);
  if (!term || !isDatabaseConfigured()) return { term: term ?? '', hits: [] };

  const settled = await Promise.allSettled([
    searchProducts(term),
    searchCustomers(term),
    searchSales(term),
    searchSuppliers(term),
    searchPurchaseOrders(term),
  ]);
  const candidates: SearchHit[] = [];
  let failures = 0;
  for (const result of settled) {
    if (result.status === 'fulfilled') candidates.push(...result.value);
    else failures += 1;
  }
  // Every lookup failing is an outage, not "no results": let the caller say so.
  if (failures === settled.length) throw new Error('Search is unavailable.');

  const ranked = rankHits(term, candidates, { total: MAX_TOTAL_HITS });
  return { term, hits: ranked.map(({ keys: _keys, ...hit }) => hit) };
}

/* ── Variant lookup for the stock count and quick receive ────────────────── */

export type CountVariant = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  imageUrl: string | null;
  /** What the books say is at the chosen place: the whole shop, or one location. */
  expected: number;
  /** Weighted-average cost per unit, when there is stock to average. */
  unitCostCents: number | null;
  referenceCostCents: number;
  isActive: boolean;
};

const COUNT_LIMIT = 12;

/**
 * Variants matching a term (SKU, barcode, product or option name), each with its photograph and the
 * quantity the books expect. With a `locationId`, expected is what that location holds (legacy
 * movements without a location count at the main one, as everywhere else).
 */
export async function searchCountVariants(
  rawTerm: string,
  locationId: string | null,
): Promise<CountVariant[]> {
  const term = normaliseTerm(rawTerm);
  if (!term || !isDatabaseConfigured()) return [];
  const like = likeContains(term);
  const prefix = like.slice(1);
  const atLocation = locationId
    ? sql`AND (m.location_id = ${locationId}
               OR (m.location_id IS NULL
                   AND ${locationId} = (SELECT id FROM locations WHERE slug = 'main' LIMIT 1)))`
    : sql``;
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT v.id, v.product_id, v.sku, v.barcode, v.name AS variant_name, v.is_active::text AS is_active,
           v.reference_cost_cents::text, p.name AS product_name,
           ${variantImageSql('v.id', 'v.product_id')} AS image_url,
           (SELECT COALESCE(SUM(m.quantity), 0) FROM inventory_movements m
             WHERE m.variant_id = v.id ${atLocation})::text AS expected,
           (SELECT COALESCE(SUM(m.quantity), 0) FROM inventory_movements m WHERE m.variant_id = v.id)::text AS total_qty,
           (SELECT COALESCE(SUM(m.value_cents), 0) FROM inventory_movements m WHERE m.variant_id = v.id)::text AS total_value
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
     WHERE p.status <> 'archived'
       AND (v.sku ILIKE ${like} OR v.barcode ILIKE ${like} OR v.name ILIKE ${like}
            OR p.name ILIKE ${like} OR p.code ILIKE ${like})
     ORDER BY (v.sku ILIKE ${prefix} OR v.barcode ILIKE ${prefix}) DESC,
              (v.sku = ${term} OR v.barcode = ${term}) DESC, p.name, v.position
     LIMIT ${COUNT_LIMIT}
  `);
  return rows.map((row) => {
    const totalQty = num(row.total_qty);
    const totalValue = num(row.total_value);
    return {
      variantId: text(row.id),
      productId: text(row.product_id),
      productName: text(row.product_name),
      variantName: text(row.variant_name),
      sku: text(row.sku),
      barcode: maybe(row.barcode),
      imageUrl: maybe(row.image_url),
      expected: num(row.expected),
      unitCostCents: totalQty > 0 && totalValue > 0 ? totalValue / totalQty : null,
      referenceCostCents: num(row.reference_cost_cents),
      isActive: bool(row.is_active),
    };
  });
}
