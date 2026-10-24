import { type SQL, sql } from 'drizzle-orm';
import { type QualityIssue, type QualityIssueCode, qualityIssues } from '@/lib/catalog-quality';
import { PRODUCT_VIEWS, STOCK_VIEWS } from '@/lib/catalog-views';
import { isDatabaseConfigured } from '@/lib/env';
import { parseListParams, productQuerySchema } from '@/lib/list-params';
import { db } from '../db/client';
import { productImageSql } from './image-sql';
import { productConditions } from './lists';
import { PRODUCT_ECON_CTE } from './product-econ';
import { bool, maybe, num, text } from './row';

/**
 * Read models behind the catalog's saved views and its "Needs attention" list.
 *
 * Counts are computed with the SAME conditions as the lists they sit on (`productConditions`), in
 * one statement, so the number on a chip is exactly the number of rows you land on.
 */

export type ProductViewCounts = {
  all: number;
  views: Record<string, number>;
  /** Products with at least one catalog-quality problem (see `needsAttentionSql`). */
  attention: number;
};

/**
 * The SQL twin of `qualityIssues` in src/lib/catalog-quality.ts: true when a product has at least
 * one problem. A test compares the two on the same data. Expects `products p` and `product_econ pe`.
 */
const needsAttentionSql = sql`(
  p.status <> 'archived' AND (
    (COALESCE(pe.active_count, 0) > 0 AND COALESCE(pe.no_price_count, 0) > 0)
    OR COALESCE(pe.min_margin_bp, 0) < 0
    OR NOT EXISTS (SELECT 1 FROM product_images ai WHERE ai.product_id = p.id)
    OR (COALESCE(pe.active_count, 0) > 0 AND COALESCE(pe.no_cost_count, 0) > 0)
    OR p.category_id IS NULL
    OR (p.catalog_published AND COALESCE(pe.on_hand_active, 0) <= 0)
    OR (p.status = 'active' AND NOT p.catalog_published AND COALESCE(pe.on_hand_active, 0) > 0)
  )
)`;

function whereOf(conditions: SQL[]): SQL {
  return conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
}

export async function getProductViewCounts(): Promise<ProductViewCounts> {
  if (!isDatabaseConfigured()) return { all: 0, views: {}, attention: 0 };

  const counts = PRODUCT_VIEWS.map((view) => {
    const query = parseListParams(productQuerySchema, view.params);
    return sql`(SELECT COUNT(*) FROM products p LEFT JOIN product_econ pe ON pe.product_id = p.id
                ${whereOf(productConditions(query))})::text AS ${sql.raw(`v_${view.key}`)}`;
  });
  const [row] = await db.execute<Record<string, string | null>>(sql`
    ${PRODUCT_ECON_CTE}
    SELECT
      (SELECT COUNT(*) FROM products)::text AS all_count,
      (SELECT COUNT(*) FROM products p LEFT JOIN product_econ pe ON pe.product_id = p.id
        WHERE ${needsAttentionSql})::text AS attention,
      ${sql.join(counts, sql`, `)}
  `);

  const views: Record<string, number> = {};
  for (const view of PRODUCT_VIEWS) views[view.key] = num(row?.[`v_${view.key}`]);
  return { all: num(row?.all_count), views, attention: num(row?.attention) };
}

export type StockViewCounts = { all: number; views: Record<string, number> };

export async function getStockViewCounts(): Promise<StockViewCounts> {
  if (!isDatabaseConfigured()) return { all: 0, views: {} };
  const [row] = await db.execute<Record<string, string | null>>(sql`
    WITH threshold AS (SELECT COALESCE((SELECT low_stock_threshold FROM settings LIMIT 1), 0) AS value)
    SELECT COUNT(*)::text AS all_count,
           COUNT(*) FILTER (WHERE s.on_hand > 0 AND s.on_hand <= t.value)::text AS v_low,
           COUNT(*) FILTER (WHERE s.on_hand = 0)::text AS v_out,
           COUNT(*) FILTER (WHERE s.on_hand < 0)::text AS v_over
      FROM v_stock_levels s CROSS JOIN threshold t
  `);
  const views: Record<string, number> = {};
  for (const view of STOCK_VIEWS) views[view.key] = num(row?.[`v_${view.key}`]);
  return { all: num(row?.all_count), views };
}

export type AttentionRow = {
  id: string;
  name: string;
  code: string;
  brandName: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  onHand: number;
  priceMinCents: number;
  issues: QualityIssue[];
};

const ATTENTION_LIMIT = 400;

/** Every non-archived product with at least one catalog-quality problem, worst first. */
export async function listAttentionProducts(): Promise<{
  rows: AttentionRow[];
  /** All products that need attention, which can exceed the rows returned. */
  total: number;
}> {
  if (!isDatabaseConfigured()) return { rows: [], total: 0 };

  const rows = await db.execute<Record<string, string | null>>(sql`
    ${PRODUCT_ECON_CTE}
    SELECT p.id, p.name, p.code, p.status::text AS status,
           p.catalog_published::text AS catalog_published, p.category_id,
           b.name AS brand_name, c.name AS category_name,
           ${productImageSql('p.id')} AS image_url,
           (SELECT COUNT(*) FROM product_images ci WHERE ci.product_id = p.id)::text AS image_count,
           COALESCE(pe.active_count, 0)::text AS active_count,
           COALESCE(pe.no_price_count, 0)::text AS no_price_count,
           COALESCE(pe.no_cost_count, 0)::text AS no_cost_count,
           pe.min_margin_bp::text AS min_margin_bp,
           COALESCE(pe.on_hand_active, 0)::text AS on_hand_active,
           COALESCE(pe.min_price, 0)::text AS min_price,
           COUNT(*) OVER()::text AS total_count
      FROM products p
      LEFT JOIN product_econ pe ON pe.product_id = p.id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${needsAttentionSql}
     ORDER BY p.name
     LIMIT ${ATTENTION_LIMIT}
  `);

  const SEVERITY = { high: 0, medium: 1, low: 2 } as const;
  const mapped = rows
    .map((row): AttentionRow => {
      const status = text(row.status) as AttentionRow['status'];
      const catalogPublished = bool(row.catalog_published);
      const onHand = num(row.on_hand_active);
      const issues = qualityIssues({
        status,
        catalogPublished,
        imageCount: num(row.image_count),
        categoryId: maybe(row.category_id),
        activeVariantCount: num(row.active_count),
        variantsWithoutPrice: num(row.no_price_count),
        variantsWithoutCost: num(row.no_cost_count),
        lowestMarginBp: row.min_margin_bp == null ? null : num(row.min_margin_bp),
        onHand,
      });
      return {
        id: text(row.id),
        name: text(row.name),
        code: text(row.code),
        brandName: maybe(row.brand_name),
        categoryName: maybe(row.category_name),
        imageUrl: maybe(row.image_url),
        status,
        catalogPublished,
        onHand,
        priceMinCents: num(row.min_price),
        issues,
      };
    })
    .filter((row) => row.issues.length > 0)
    .sort(
      (a, b) =>
        (SEVERITY[a.issues[0]?.severity ?? 'low'] ?? 3) -
          (SEVERITY[b.issues[0]?.severity ?? 'low'] ?? 3) ||
        b.issues.length - a.issues.length ||
        a.name.localeCompare(b.name),
    );

  return { rows: mapped, total: num(rows[0]?.total_count) };
}

export type { QualityIssue, QualityIssueCode };

export type PriceListChoice = { id: string; name: string; currency: 'USD' | 'SRD' };

/** Active price lists, for choosing which price a bulk change applies to. */
export async function listPriceListChoices(): Promise<PriceListChoice[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(
    sql`SELECT id, name, currency::text AS currency FROM price_lists WHERE active ORDER BY currency, name`,
  );
  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    currency: text(row.currency, 'USD') === 'SRD' ? 'SRD' : 'USD',
  }));
}
