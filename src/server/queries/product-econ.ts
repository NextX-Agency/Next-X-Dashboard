import { sql } from 'drizzle-orm';

/**
 * Per-product economics, computed in one pass for a whole list.
 *
 * A product's figures come from its variants and the append-only movement ledger. This CTE reads the
 * ledger ONCE (a single grouped scan, not a lookup per row) and exposes, per `product_id`:
 *
 *   active_count      active variants
 *   no_price_count    active variants priced at zero
 *   no_cost_count     active variants with no known cost
 *   min_price/max_price (cents)  over active variants
 *   min_margin_bp     the lowest margin over active variants that have a price and a cost, in basis
 *                     points ((price - cost) / price * 10000)
 *   on_hand_active    units on hand across active variants (what can actually be sold)
 *
 * "Cost" of a variant is what its units on hand really cost (landed value / quantity) once any are in
 * stock, otherwise the supplier list cost, otherwise unknown. The same definition as
 * `unitCostCents` in src/lib/catalog-quality.ts.
 *
 * Usage: `sql`${PRODUCT_ECON_CTE} SELECT ... FROM products p LEFT JOIN product_econ pe ON pe.product_id = p.id``.
 */
export const PRODUCT_ECON_CTE = sql`
  WITH variant_econ AS (
    SELECT v.id AS variant_id, v.product_id, v.is_active, v.list_price_cents, v.reference_cost_cents,
           COALESCE(SUM(m.quantity), 0)::bigint AS on_hand,
           COALESCE(SUM(m.value_cents), 0)::bigint AS value_cents
      FROM product_variants v
      LEFT JOIN inventory_movements m ON m.variant_id = v.id
     GROUP BY v.id
  ), variant_unit AS (
    SELECT ve.*,
           CASE WHEN ve.on_hand > 0 AND ve.value_cents > 0 THEN ve.value_cents::numeric / ve.on_hand
                WHEN ve.reference_cost_cents > 0 THEN ve.reference_cost_cents::numeric
           END AS unit_cost
      FROM variant_econ ve
  ), product_econ AS (
    SELECT vu.product_id,
           COUNT(*) FILTER (WHERE vu.is_active) AS active_count,
           COUNT(*) FILTER (WHERE vu.is_active AND vu.list_price_cents <= 0) AS no_price_count,
           COUNT(*) FILTER (WHERE vu.is_active AND vu.unit_cost IS NULL) AS no_cost_count,
           MIN(vu.list_price_cents) FILTER (WHERE vu.is_active) AS min_price,
           MAX(vu.list_price_cents) FILTER (WHERE vu.is_active) AS max_price,
           MIN(ROUND((vu.list_price_cents - vu.unit_cost) * 10000 / vu.list_price_cents))
             FILTER (WHERE vu.is_active AND vu.list_price_cents > 0 AND vu.unit_cost IS NOT NULL)
             AS min_margin_bp,
           COALESCE(SUM(vu.on_hand) FILTER (WHERE vu.is_active), 0) AS on_hand_active
      FROM variant_unit vu
     GROUP BY vu.product_id
  )`;
