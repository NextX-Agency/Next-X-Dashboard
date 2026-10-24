/**
 * Stock that is promised to open orders, and what a direct sale may take.
 *
 * A confirmed order reserves units without moving them. A direct sale reads only physical stock, so
 * it can sell the very units an order is waiting for, and that order then cannot be completed
 * ("Stock changed before completion"). These rules are pure so the sale form (a warning) and the
 * sale actions (a guard) judge the same way.
 *
 *   available = on hand - reserved
 *
 * A sale takes reserved stock when, after it, fewer units would remain on hand than are reserved.
 */

export type ReservedStockPosition = { onHand: number; reserved: number };

export type ReservedStockLine = {
  variantId: string;
  /** What a person recognises: product and option, or the bundle name. */
  label: string;
  /** Units this line takes of the variant (bundle components already multiplied out). */
  quantity: number;
};

export type ReservedStockConflict = {
  variantId: string;
  label: string;
  /** Total units the sale takes of this variant, all lines together. */
  quantity: number;
  onHand: number;
  reserved: number;
  /** On hand less reserved, never negative. */
  available: number;
  /** How many of the reserved units this sale would use up. */
  takesReserved: number;
};

/** Units free to sell: on hand less reserved, never below zero. */
export function availableToSell(position: ReservedStockPosition): number {
  return Math.max(position.onHand - position.reserved, 0);
}

/**
 * Variants where this sale would take stock reserved for open orders. Lines for the same variant are
 * added together, so selling it on two lines is judged as one sale. Variants with nothing reserved
 * are never listed: running short on unreserved stock is the existing shortfall warning, not this.
 */
export function reservedStockConflicts(
  lines: readonly ReservedStockLine[],
  positions: ReadonlyMap<string, ReservedStockPosition>,
): ReservedStockConflict[] {
  const totals = new Map<string, { label: string; quantity: number }>();
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    const current = totals.get(line.variantId);
    totals.set(line.variantId, {
      label: current?.label ?? line.label,
      quantity: (current?.quantity ?? 0) + line.quantity,
    });
  }

  const conflicts: ReservedStockConflict[] = [];
  for (const [variantId, { label, quantity }] of totals) {
    const position = positions.get(variantId);
    if (!position || position.reserved <= 0) continue;
    const remaining = position.onHand - quantity;
    if (remaining >= position.reserved) continue;
    const available = availableToSell(position);
    conflicts.push({
      variantId,
      label,
      quantity,
      onHand: position.onHand,
      reserved: position.reserved,
      available,
      takesReserved: Math.min(Math.max(quantity - available, 0), position.reserved),
    });
  }
  return conflicts;
}

/** One plain sentence per conflict, shared by the form warning and the server refusal. */
export function describeReservedConflict(conflict: ReservedStockConflict): string {
  const free =
    conflict.available === 0
      ? 'none of it is free'
      : `only ${conflict.available} ${conflict.available === 1 ? 'is' : 'are'} free`;
  return `${conflict.label}: ${conflict.quantity} in this sale, but ${conflict.reserved} of the ${Math.max(conflict.onHand, 0)} on hand ${conflict.reserved === 1 ? 'is' : 'are'} reserved for open orders (${free}).`;
}

/**
 * The refusal a sale gets for taking reserved stock, or null when it may go ahead (nothing reserved
 * is touched, or the owner has explicitly chosen to sell it anyway). Only an owner's override counts:
 * the flag arrives from the browser, so the role is judged here, not trusted from the form.
 */
export function reservedStockRefusal(
  conflicts: readonly ReservedStockConflict[],
  options: { override: boolean; isOwner: boolean },
): string | null {
  if (conflicts.length === 0) return null;
  if (options.override) {
    return options.isOwner
      ? null
      : 'Only the owner can sell stock that is reserved for open orders. Reduce the quantity or ask the owner.';
  }
  const detail = conflicts.map(describeReservedConflict).join(' ');
  return `This sale would use stock reserved for open orders, so a confirmed order could no longer be completed. ${detail} ${
    options.isOwner
      ? 'Reduce the quantity, or edit the sale and tick "Sell reserved stock anyway" if you accept that.'
      : 'Reduce the quantity, or ask the owner to sell it anyway.'
  }`;
}
