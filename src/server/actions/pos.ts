'use server';

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { undoAllowed } from '@/lib/pos/undo';
import { uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { salePayments, saleRefunds } from '../db/schema';
import { getPosToday } from '../queries/pos';
import { logActivity } from '../services/posting';
import { ActionError, memberAction, writeAction } from './client';
import { voidSale, voidSalePayment } from './sales';

/**
 * The two server entry points the counter screen adds. Recording a sale, taking the payment and the
 * customer link-up all stay in the existing actions (`createSale`, `createCustomer`,
 * `createPublicInvoiceLink`); nothing about money is re-implemented here.
 */

/** Today at the counter, read live. Any signed-in member may look; it changes nothing. */
export const loadPosToday = memberAction
  .metadata({ action: 'read', entity: 'pos today' })
  .inputSchema(z.object({}))
  .action(async () => getPosToday());

type ActionResult =
  | {
      serverError?: string;
      validationErrors?: unknown;
    }
  | undefined;

/** Run an existing action from here and turn its failure into this action's own refusal. */
function unwrap(result: ActionResult, fallback: string): void {
  if (result?.serverError) throw new ActionError(result.serverError);
  if (result?.validationErrors) throw new ActionError(fallback);
}

/**
 * Undo a sale that was just recorded.
 *
 * Allowed for the owner or the member who recorded it, within ten minutes (`lib/pos/undo.ts`). It is
 * not a new kind of reversal: it voids the sale's payments and then the sale with the same two
 * actions the sale page uses (`voidSalePayment`, `voidSale`), so stock goes back, the cash receipt is
 * reversed in the append-only ledger, commissions are cancelled and everything is in the activity log.
 *
 * A sale that already has a refund or a return is refused here: money or goods have moved on, and
 * that correction belongs on the sale page where the reason is written down.
 */
export const undoRecentSale = writeAction
  .metadata({ action: 'undid', entity: 'quick sale' })
  .inputSchema(z.object({ saleId: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const [sale] = await db.execute<{
      id: string;
      number: string;
      status: string;
      created_by_id: string | null;
      age_ms: string;
      returned: string;
    }>(sql`
      SELECT s.id::text AS id, s.number, s.status::text AS status,
             s.created_by_id::text AS created_by_id,
             (extract(epoch from (now() - s.created_at)) * 1000)::bigint::text AS age_ms,
             COALESCE((SELECT SUM(quantity_returned) FROM sale_items WHERE sale_id = s.id), 0)::text
               AS returned
        FROM sales s WHERE s.id = ${input.saleId}
    `);
    if (!sale) throw new ActionError('That sale no longer exists.');
    if (sale.status === 'void') return { number: sale.number, alreadyUndone: true as const };
    if (sale.status !== 'confirmed')
      throw new ActionError('Only a recorded sale can be undone.');

    // The age comes from the database clock, so a wrong clock on the phone cannot widen the window.
    const now = Date.now();
    const check = undoAllowed({
      createdAtMs: now - Number(sale.age_ms),
      nowMs: now,
      memberId: ctx.member.id,
      memberRole: ctx.member.role,
      createdById: sale.created_by_id,
    });
    if (!check.ok) throw new ActionError(check.reason);

    const [refund] = await db
      .select({ id: saleRefunds.id })
      .from(saleRefunds)
      .where(eq(saleRefunds.saleId, sale.id))
      .limit(1);
    if (refund || Number(sale.returned) > 0) {
      throw new ActionError(
        'This sale already has a refund or a return. Correct it from the sale page.',
      );
    }

    const reason = `Undone at the counter by ${ctx.member.fullName}`;
    const payments = await db
      .select({ id: salePayments.id })
      .from(salePayments)
      .where(and(eq(salePayments.saleId, sale.id), eq(salePayments.status, 'confirmed')));
    for (const payment of payments) {
      unwrap(await voidSalePayment({ id: payment.id, reason }), 'Could not void the payment.');
    }
    try {
      unwrap(await voidSale({ id: sale.id, reason }), 'Could not undo the sale.');
    } catch (error) {
      if (payments.length > 0 && error instanceof ActionError) {
        throw new ActionError(
          `${error.message} The payment was already reversed, so open ${sale.number} from Sales to finish voiding it.`,
        );
      }
      throw error;
    }

    await db.transaction((tx) =>
      logActivity(tx, {
        memberId: ctx.member.id,
        action: 'undid quick sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      }),
    );
    return { number: sale.number, alreadyUndone: false as const };
  });
