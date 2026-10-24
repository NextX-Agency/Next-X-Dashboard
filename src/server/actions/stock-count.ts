'use server';

import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { uuid } from '@/lib/schemas';
import { MAX_COUNTED } from '@/lib/stock-count';
import { db } from '../db/client';
import { locations, productVariants } from '../db/schema';
import { lockVariant } from '../services/posting';
import { postManualAdjustment } from '../services/stock-adjust';
import { ActionError, writeAction } from './client';

/**
 * A stock count: "there are N on the shelf".
 *
 * Each line becomes one ordinary adjustment movement for the DIFFERENCE between what is counted and
 * what the books hold at the moment of posting (locked inside the transaction), through the same
 * `postManualAdjustment` as a single correction, so stock can never go below zero by a count and the
 * ledger stays append-only. A line whose books figure changed while the person was counting (a sale
 * went through) is flagged as `drifted`, with both figures, so nothing happens silently.
 *
 * One transaction for the whole count, with a savepoint per line: a line the rules refuse is
 * reported with the server's own message and left out, and the others still post.
 */

const countLine = z.object({
  variantId: uuid,
  counted: z.number().int().min(0, 'Whole units, zero or more.').max(MAX_COUNTED),
  /** What the screen showed as expected. Used only to detect drift; never trusted for the write. */
  expected: z.number().int(),
});

export type CountLineResult = {
  variantId: string;
  sku: string;
  outcome: 'posted' | 'unchanged' | 'refused';
  expected: number;
  /** The books' figure when the line was posted. */
  actual: number;
  counted: number;
  /** Units added (positive) or removed (negative). */
  delta: number;
  drifted: boolean;
  message?: string;
};

export type StockCountResult = {
  locationName: string | null;
  lines: CountLineResult[];
  posted: number;
  unchanged: number;
  refused: number;
  netUnits: number;
};

async function figureAt(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  variantId: string,
  locationId: string | null,
): Promise<number> {
  const [row] = await tx.execute<{ on_hand: string }>(
    locationId
      ? sql`SELECT COALESCE(SUM(m.quantity), 0)::text AS on_hand
              FROM inventory_movements m
             WHERE m.variant_id = ${variantId}
               AND (m.location_id = ${locationId}
                    OR (m.location_id IS NULL
                        AND ${locationId} = (SELECT id FROM locations WHERE slug = 'main' LIMIT 1)))`
      : sql`SELECT COALESCE(SUM(m.quantity), 0)::text AS on_hand
              FROM inventory_movements m WHERE m.variant_id = ${variantId}`,
  );
  return Number(row?.on_hand ?? 0);
}

export const submitStockCount = writeAction
  .metadata({ action: 'counted', entity: 'stock' })
  .inputSchema(
    z.object({
      lines: z.array(countLine).min(1, 'Count at least one product.').max(200),
      locationId: uuid.nullable(),
      note: z.string().trim().max(200).optional(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }): Promise<StockCountResult> => {
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (seen.has(line.variantId)) {
        throw new ActionError('A product is on the count twice. Count each product once.');
      }
      seen.add(line.variantId);
    }

    return db.transaction(async (tx) => {
      let locationName: string | null = null;
      if (input.locationId) {
        const [location] = await tx
          .select({ name: locations.name, active: locations.active })
          .from(locations)
          .where(eq(locations.id, input.locationId))
          .limit(1);
        if (!location) throw new ActionError('That location no longer exists.');
        locationName = location.name;
      }

      const known = await tx
        .select({ id: productVariants.id, sku: productVariants.sku })
        .from(productVariants)
        .where(
          inArray(
            productVariants.id,
            input.lines.map((line) => line.variantId),
          ),
        )
        .orderBy(asc(productVariants.id));
      const skuById = new Map(known.map((variant) => [variant.id, variant.sku]));

      // Lock in id order, then count in the order the person did.
      for (const variant of known) await lockVariant(tx, variant.id);

      const reason = input.note ? `Stock count: ${input.note}` : 'Stock count';
      const lines: CountLineResult[] = [];

      for (const line of input.lines) {
        const sku = skuById.get(line.variantId);
        if (!sku) {
          lines.push({
            variantId: line.variantId,
            sku: 'Unknown',
            outcome: 'refused',
            expected: line.expected,
            actual: 0,
            counted: line.counted,
            delta: 0,
            drifted: false,
            message: 'That variant no longer exists.',
          });
          continue;
        }

        const actual = await figureAt(tx, line.variantId, input.locationId);
        const delta = line.counted - actual;
        const drifted = actual !== line.expected;
        if (delta === 0) {
          lines.push({
            variantId: line.variantId,
            sku,
            outcome: 'unchanged',
            expected: line.expected,
            actual,
            counted: line.counted,
            delta: 0,
            drifted,
          });
          continue;
        }

        try {
          // A savepoint: a refusal rolls back only this line.
          await tx.transaction(async (savepoint) => {
            await postManualAdjustment(savepoint, {
              variantId: line.variantId,
              quantity: delta,
              kind: 'adjustment',
              reason,
              memberId: ctx.member.id,
              locationId: input.locationId,
              logAction: `counted stock: ${actual} to ${line.counted}`,
              nameSku: true,
            });
          });
          lines.push({
            variantId: line.variantId,
            sku,
            outcome: 'posted',
            expected: line.expected,
            actual,
            counted: line.counted,
            delta,
            drifted,
          });
        } catch (error) {
          if (!(error instanceof ActionError)) throw error;
          lines.push({
            variantId: line.variantId,
            sku,
            outcome: 'refused',
            expected: line.expected,
            actual,
            counted: line.counted,
            delta,
            drifted,
            message: error.message,
          });
        }
      }

      const posted = lines.filter((line) => line.outcome === 'posted');
      return {
        locationName,
        lines,
        posted: posted.length,
        unchanged: lines.filter((line) => line.outcome === 'unchanged').length,
        refused: lines.filter((line) => line.outcome === 'refused').length,
        netUnits: posted.reduce((total, line) => total + line.delta, 0),
      };
    });
  });
