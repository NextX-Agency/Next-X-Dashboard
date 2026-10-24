import { eq, sql } from 'drizzle-orm';
import { consumeStock } from '@/lib/costing';
import { mulDivRound } from '@/lib/money';
import { type AdjustmentKind, adjustmentProblem } from '@/lib/stock-rules';
import { productVariants } from '../db/schema';
import { ActionError } from '../errors';
import { lockValuation, logActivity, postStockMovement, type Tx } from './posting';

/**
 * One manual stock correction, posted as an append-only movement.
 *
 * Shared by `adjustStock` (a single correction from the Inventory list) and the stock count, so the
 * rules cannot drift apart: the quantity is judged against the figure locked inside the transaction
 * (never what the browser last showed), a removal can never take a variant below zero, and the
 * movement is valued at the current weighted average so a correction does not silently change what
 * the remaining units are worth each.
 *
 * With a `locationId` the movement is booked to that location, and a removal is additionally
 * limited to what that location holds (legacy movements without a location count at the main one).
 */
export type AdjustmentResult = {
  variantId: string;
  sku: string;
  onHandBefore: number;
  onHandAfter: number;
};

export async function postManualAdjustment(
  tx: Tx,
  input: {
    variantId: string;
    quantity: number;
    kind: AdjustmentKind;
    reason: string;
    memberId: string;
    locationId?: string | null;
    logAction?: string;
    /** Name the SKU in refusals; wanted when many variants are posted together. */
    nameSku?: boolean;
  },
): Promise<AdjustmentResult> {
  const [variant] = await tx
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, input.variantId))
    .limit(1);
  if (!variant) throw new ActionError('That variant no longer exists.');

  // `lockValuation`, not a bare SUM: an adjustment read without FOR UPDATE races a concurrent sale
  // reading the same average, and both write a cost based on stock only one of them can have.
  const valuation = await lockValuation(tx, input.variantId);

  const problem = adjustmentProblem({
    kind: input.kind,
    quantity: input.quantity,
    onHand: valuation.quantity,
  });
  if (problem) throw new ActionError(input.nameSku ? `${variant.sku}: ${problem}` : problem);

  if (input.locationId && input.quantity < 0) {
    const [row] = await tx.execute<{ on_hand: string; name: string }>(sql`
      SELECT COALESCE(SUM(m.quantity), 0)::text AS on_hand,
             (SELECT name FROM locations WHERE id = ${input.locationId}) AS name
        FROM inventory_movements m
       WHERE m.variant_id = ${input.variantId}
         AND (m.location_id = ${input.locationId}
              OR (m.location_id IS NULL
                  AND ${input.locationId} = (SELECT id FROM locations WHERE slug = 'main' LIMIT 1)))
    `);
    const atLocation = Number(row?.on_hand ?? 0);
    if (atLocation + input.quantity < 0) {
      const held = Math.max(atLocation, 0);
      throw new ActionError(
        `${input.nameSku ? `${variant.sku}: o` : 'O'}nly ${held} at ${row?.name ?? 'that location'}, so ${-input.quantity} cannot be removed there.`,
      );
    }
  }

  const valueCents =
    input.quantity > 0
      ? valuation.quantity > 0
        ? mulDivRound(valuation.valueCents, input.quantity, valuation.quantity)
        : 0
      : -consumeStock(valuation, -input.quantity).cogsCents;

  await postStockMovement(tx, {
    variantId: input.variantId,
    locationId: input.locationId ?? null,
    kind: input.kind,
    quantity: input.quantity,
    valueCents,
    sourceKind: 'manual',
    sourceId: null,
    occurredAt: new Date(),
    note: input.reason,
    memberId: input.memberId,
  });

  await logActivity(tx, {
    memberId: input.memberId,
    action: input.logAction ?? `adjusted stock by ${input.quantity}`,
    entityType: 'variant',
    entityId: variant.id,
    entityLabel: variant.sku,
  });

  return {
    variantId: variant.id,
    sku: variant.sku,
    onHandBefore: valuation.quantity,
    onHandAfter: valuation.quantity + input.quantity,
  };
}
