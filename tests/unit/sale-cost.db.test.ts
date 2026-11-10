import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

/**
 * Gross profit must not treat a missing cost as a free product.
 *
 * Runs only against the disposable local rehearsal database (127.0.0.1:55432); it inserts rows in a
 * window of 2001 that nothing else uses and removes them again.
 *
 *   NEXTLY_LOCAL_REHEARSAL=1 DATABASE_URL=postgresql://postgres@127.0.0.1:55432/nextly_migration_rehearsal \
 *     pnpm exec vitest run tests/unit/sale-cost.db.test.ts
 */
config({ path: '.env.local', quiet: true });
const url = process.env.DATABASE_URL ?? '';
const enabled =
  process.env.NEXTLY_LOCAL_REHEARSAL === '1' &&
  /127\.0\.0\.1:55432\/nextly_migration_rehearsal$/.test(url);

describe.skipIf(!enabled)('cost of goods in the profit and loss', () => {
  it('reads cost from the lines when the header is zero, and flags sales with no cost at all', async () => {
    const { sql } = await import('drizzle-orm');
    const { db } = await import('@/server/db/client');
    const { pnlTotals } = await import('@/server/queries/reports');

    const [variant] = await db.execute<{ id: string }>(
      sql`SELECT id FROM product_variants ORDER BY sku LIMIT 1`,
    );
    if (!variant) throw new Error('The rehearsal database has no product variant to sell');
    const tag = `T${Date.now()}`;
    const soldAt = '2001-03-04T12:00:00Z';

    // Imported-style: header cost 0, line cost 40.00 on a 100.00 sale.
    // App-style: header cost 25.00 equals its line cost.
    // Uncosted: revenue 50.00, no cost anywhere.
    // Draft and void must not count at all.
    const make = async (
      suffix: string,
      status: string,
      total: number,
      headerCogs: number,
      lineCogs: number,
    ) => {
      const [sale] = await db.execute<{ id: string }>(sql`
        INSERT INTO sales (number, status, currency, total_cents, total_usd_cents, cogs_cents,
                           gross_profit_cents, sold_at)
        VALUES (${`${tag}-${suffix}`}, ${status}::sale_status, 'USD', ${total}, ${total},
                ${headerCogs}, ${total - headerCogs}, ${soldAt})
        RETURNING id`);
      if (!sale) throw new Error('Could not insert the test sale');
      await db.execute(sql`
        INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price_cents, unit_price_usd_cents,
                                line_total_cents, line_total_usd_cents, cogs_cents)
        VALUES (${sale.id}, ${variant.id}, 1, ${total}, ${total}, ${total}, ${total}, ${lineCogs})`);
      return sale.id;
    };

    const ids: string[] = [];
    try {
      ids.push(await make('imported', 'confirmed', 10000, 0, 4000));
      ids.push(await make('app', 'confirmed', 6000, 2500, 2500));
      ids.push(await make('uncosted', 'confirmed', 5000, 0, 0));
      ids.push(await make('draft', 'draft', 9999, 0, 7777));
      ids.push(await make('void', 'void', 8888, 0, 0));

      const totals = await pnlTotals(
        new Date('2001-03-01T00:00:00Z'),
        new Date('2001-04-01T00:00:00Z'),
      );
      expect(totals.revenueCents).toBe(21000);
      expect(totals.cogsCents).toBe(4000 + 2500);
      expect(totals.grossCents).toBe(21000 - 6500);
      expect(totals.uncostedSales).toBe(1);
      expect(totals.uncostedRevenueCents).toBe(5000);
    } finally {
      for (const id of ids) {
        await db.execute(sql`DELETE FROM sale_items WHERE sale_id = ${id}`);
        await db.execute(sql`DELETE FROM sales WHERE id = ${id}`);
      }
    }
  });
});
