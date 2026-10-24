import { eq, sql } from 'drizzle-orm';
import type { Cents } from '@/lib/money';
import { sales } from '../db/schema';
import type { Tx } from './posting';

/**
 * What has been received on, and paid back against, one sale.
 *
 * Shared by the sale and order actions. These live in a service, not in an
 * action file, because a `'use server'` module may only export server actions.
 */

/** What has been paid on a sale so far, in the currency of the sale. */
export async function paidOnSale(tx: Tx, saleId: string): Promise<Cents> {
  const [row] = await tx.execute<{ paid: string }>(
    sql`SELECT (
      COALESCE((SELECT SUM(amount_cents) FROM sale_payments
                 WHERE sale_id = ${saleId} AND status = 'confirmed'), 0)
      + COALESCE((
          SELECT SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE -amount_cents END)
            FROM ledger_entries
           WHERE source_kind = 'sale'
             AND source_id = ${saleId}
             AND category = 'sales_receipt'
        ), 0)
    )::text AS paid`,
  );
  return Number(row?.paid ?? 0);
}

export async function refundedOnSale(tx: Tx, saleId: string): Promise<Cents> {
  const [row] = await tx.execute<{ refunded: string }>(sql`
    SELECT (
      COALESCE((SELECT SUM(amount_cents) FROM sale_refunds WHERE sale_id = ${saleId}), 0)
      + COALESCE((
          SELECT SUM(amount_cents)
            FROM ledger_entries
           WHERE source_kind = 'sale'
             AND source_id = ${saleId}
             AND category = 'refund'
             AND direction = 'out'
        ), 0)
    )::text AS refunded
  `);
  return Number(row?.refunded ?? 0);
}

/** Money still held for the customer: received minus paid back. */
export async function heldOnSale(tx: Tx, saleId: string): Promise<Cents> {
  return (await paidOnSale(tx, saleId)) - (await refundedOnSale(tx, saleId));
}

/** Lock the sale row and read it. Every money action on a sale starts here, so
 *  two people acting on the same sale queue instead of racing. */
export async function lockSale(tx: Tx, saleId: string) {
  await tx.execute(sql`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`);
  const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1);
  return sale;
}
