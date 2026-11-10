import { type SQL, sql } from 'drizzle-orm';

/**
 * The cost of goods of one confirmed sale, in USD cents, as every report must read it.
 *
 * `sale_items.cogs_cents` is the cost snapshot taken when each line was sold, and the app rolls it up
 * into `sales.cogs_cents` when it records a sale. The historical import wrote the line snapshots but
 * left the header at zero, so reading the header alone reports a 100% margin on those sales. This
 * prefers the header when it was set and falls back to the sum of the lines when it was not, which
 * is exact for sales the app recorded and correct for the imported ones.
 *
 * A result of zero means "no cost was recorded", not "this was free": `uncostedSalePredicate` finds
 * those, so a report can say so instead of presenting the revenue as profit.
 *
 * @param alias the alias of the `sales` table in the surrounding query
 */
export function saleCostSql(alias = 's'): SQL {
  const sales = sql.raw(alias);
  return sql`COALESCE(
    NULLIF(${sales}.cogs_cents, 0),
    (SELECT SUM(si.cogs_cents) FROM sale_items si WHERE si.sale_id = ${sales}.id),
    0
  )`;
}

/** True for a confirmed sale that earned revenue but has no cost recorded anywhere. */
export function uncostedSalePredicate(alias = 's'): SQL {
  const sales = sql.raw(alias);
  return sql`(${sales}.total_usd_cents > 0 AND ${saleCostSql(alias)} = 0)`;
}
