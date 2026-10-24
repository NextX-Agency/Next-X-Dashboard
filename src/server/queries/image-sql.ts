import { type SQL, sql } from 'drizzle-orm';

/**
 * The photograph for one variant, in SQL: its own first photo, else a shared one (primary first), else
 * the product's primary photo only when the product has a single option. Mirrors
 * src/lib/product-images.ts so a list thumbnail matches the shop and the sale picker.
 */
export function variantImageSql(variantRef: string, productRef: string): SQL {
  const v = sql.raw(variantRef);
  const p = sql.raw(productRef);
  return sql`COALESCE(
    (SELECT COALESCE(i.thumb_url, i.url) FROM product_images i
      WHERE i.variant_id = ${v} ORDER BY i.position LIMIT 1),
    (SELECT COALESCE(i.thumb_url, i.url) FROM product_images i
      WHERE i.product_id = ${p} AND i.variant_id IS NULL
      ORDER BY i.is_primary DESC, i.position LIMIT 1),
    CASE WHEN (SELECT COUNT(*) FROM product_variants sv
                WHERE sv.product_id = ${p} AND sv.is_active) <= 1
      THEN (SELECT COALESCE(i.thumb_url, i.url) FROM product_images i
             WHERE i.product_id = ${p} ORDER BY i.is_primary DESC, i.position LIMIT 1)
    END
  )`;
}

/**
 * The photograph that represents a whole product in a list: the owner-flagged primary, else a shared
 * one, else the first. The SQL twin of `representativeImage` in src/lib/product-images.ts. One
 * correlated subquery per row, resolved by the `product_images` product index, so a list page is a
 * single query (no per-row lookups).
 */
export function productImageSql(productRef: string): SQL {
  const p = sql.raw(productRef);
  return sql`(SELECT COALESCE(i.thumb_url, i.url) FROM product_images i
    WHERE i.product_id = ${p}
    ORDER BY i.is_primary DESC, (i.variant_id IS NULL) DESC, i.position LIMIT 1)`;
}
