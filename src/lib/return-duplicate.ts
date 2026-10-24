/**
 * A double-clicked or retried "Record return" must not put the goods back twice.
 *
 * A return has no document of its own, so the evidence of an earlier submit is the stock it posted:
 * return movements for the sale, made by the same person, moments ago. If one earlier request posted
 * exactly the units this request is about to post, this is that request again. Same idea as the
 * 45 second duplicate window on expenses (finance.ts), made exact by comparing per request rather
 * than adding units across requests. Pure so it is testable without a database.
 */

/** A second identical return inside this window is a double click or a retry, not a second return. */
export const RETURN_DUPLICATE_WINDOW_SECONDS = 45;

export type ReturnedUnits = ReadonlyMap<string, number>;

/** One return movement already posted. `batch` groups the rows of a single earlier request. */
export type RecentReturnMovement = { batch: string; variantId: string; quantity: number };

/** Units a return would put back, per variant (bundle components multiplied out), zeros dropped. */
export function unitsByVariant(
  lines: readonly { variantId: string; quantity: number }[],
): Map<string, number> {
  const units = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    units.set(line.variantId, (units.get(line.variantId) ?? 0) + line.quantity);
  }
  return units;
}

function sameUnits(a: ReturnedUnits, b: ReturnedUnits): boolean {
  if (a.size !== b.size) return false;
  for (const [variantId, quantity] of a) {
    if (b.get(variantId) !== quantity) return false;
  }
  return true;
}

/** True when one earlier request posted exactly `planned`. */
export function isRepeatedReturn(
  planned: ReturnedUnits,
  recent: readonly RecentReturnMovement[],
): boolean {
  if (planned.size === 0) return false;
  const batches = new Map<string, Map<string, number>>();
  for (const movement of recent) {
    const units = batches.get(movement.batch) ?? new Map<string, number>();
    units.set(movement.variantId, (units.get(movement.variantId) ?? 0) + movement.quantity);
    batches.set(movement.batch, units);
  }
  return [...batches.values()].some((units) => sameUnits(planned, units));
}
