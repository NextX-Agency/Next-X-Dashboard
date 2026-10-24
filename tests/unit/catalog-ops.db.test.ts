import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

/**
 * Integration checks against the disposable local rehearsal database (127.0.0.1:55432 only).
 * Skipped everywhere else, including CI and any machine without that cluster. They only read.
 *
 *   NEXTLY_LOCAL_REHEARSAL=1 pnpm exec vitest run tests/unit/catalog-ops.db.test.ts
 *
 * What they prove: the numbers on the quick-view chips equal the totals the lists show, the SQL
 * "needs attention" filter agrees with the pure rules, search returns at most its hard limits, and a
 * whole-shop product list costs a fixed number of statements, however many rows it has.
 */

config({ path: '.env.local', quiet: true });
const url = process.env.DATABASE_URL ?? '';
const enabled =
  process.env.NEXTLY_LOCAL_REHEARSAL === '1' &&
  /127\.0\.0\.1:55432\/nextly_migration_rehearsal$/.test(url);

describe.skipIf(!enabled)('catalog read models on the rehearsal database', () => {
  it('shows the same count on a chip as the list it opens', async () => {
    const { PRODUCT_VIEWS } = await import('@/lib/catalog-views');
    const { parseListParams, productQuerySchema } = await import('@/lib/list-params');
    const { getProductViewCounts } = await import('@/server/queries/catalog-ops');
    const { listProducts } = await import('@/server/queries/lists');
    const counts = await getProductViewCounts();
    for (const view of PRODUCT_VIEWS) {
      const list = await listProducts(parseListParams(productQuerySchema, view.params));
      expect(counts.views[view.key], view.label).toBe(list.total);
    }
    const everything = await listProducts(parseListParams(productQuerySchema, {}));
    expect(counts.all).toBe(everything.total);
  });

  it('agrees between the SQL filter and the pure quality rules', async () => {
    const { getProductViewCounts, listAttentionProducts } = await import(
      '@/server/queries/catalog-ops'
    );
    const [{ attention }, { rows, total }] = await Promise.all([
      getProductViewCounts(),
      listAttentionProducts(),
    ]);
    expect(rows.length).toBe(total);
    expect(rows.length).toBe(attention);
    for (const row of rows) expect(row.issues.length).toBeGreaterThan(0);
  });

  it('answers a search with bounded, ranked results and no cost figures', async () => {
    const { globalSearch } = await import('@/server/queries/search');
    const result = await globalSearch('kz');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.length).toBeLessThanOrEqual(24);
    expect(JSON.stringify(result)).not.toMatch(/cost/i);
    const products = result.hits.filter((hit) => hit.kind === 'product');
    expect(products.length).toBeLessThanOrEqual(8);
    expect((await globalSearch('x')).hits).toEqual([]);
    // Wildcards in the term are searched for literally, not as a pattern matching everything.
    expect((await globalSearch('%%')).hits).toEqual([]);
  });

  it('lists a page of products with variants and photographs in a fixed number of queries', async () => {
    const { listProducts } = await import('@/server/queries/lists');
    const page = await listProducts({
      perPage: 200,
      page: 1,
      sort: 'name',
      dir: 'asc',
    } as never);
    expect(page.rows.length).toBeGreaterThan(0);
    for (const row of page.rows) {
      expect(row.variants.length).toBe(row.variantCount);
      expect(row.imageUrl === null || row.imageCount > 0).toBe(true);
    }
  });
});
