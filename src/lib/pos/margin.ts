import { normaliseToUsd, type RateMicros } from '@/lib/fx';
import { type Cents, type CurrencyCode, mulDivRound } from '@/lib/money';
import type { Sellable } from './types';

/**
 * The margin check at the counter.
 *
 * Same idea and same arithmetic as the full sale form: the books are in USD, cost of goods is the
 * weighted average of the units on hand (`value x n / q`, so the figure does not drift by a cent on
 * submit), and a sale is "below cost" when its USD revenue is less than that cost. The counter adds
 * one softer step, "thin", for a price that still clears cost but leaves little. It is a prompt to
 * look twice, never a block: the owner may sell at a loss on purpose.
 *
 * The server stays the authority: it fixes the real cost of goods when it books the sale. This only
 * warns before the money is taken.
 */

/** Under this share of the price, a sale is "thin". 10% of the USD revenue. */
export const THIN_MARGIN_RATIO = 0.1;

export type MarginLevel = 'unknown' | 'ok' | 'thin' | 'below-cost';

export type MarginCheck = {
  level: MarginLevel;
  /** USD revenue of what was checked. */
  revenueUsdCents: Cents;
  /** Estimated cost of goods, USD cents. 0 when the cost is unknown. */
  costUsdCents: Cents;
  /** 0 to 1, negative below cost. 0 when unknown. */
  marginRatio: number;
};

/**
 * Estimated cost of selling `quantity` units, USD cents.
 *
 * Units on hand cost their weighted average (exactly the server's split). Units beyond stock have no
 * recorded cost yet, so the reference cost stands in: a sale of goods not yet received should still
 * be checked, and treating them as free would hide a loss.
 */
export function estimateCostUsd(
  sellable: Pick<
    Sellable,
    'kind' | 'onHand' | 'valueCents' | 'referenceCostCents' | 'bundleCostCents'
  >,
  quantity: number,
): Cents {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (sellable.kind === 'bundle') return sellable.bundleCostCents * quantity;
  const { onHand, valueCents, referenceCostCents } = sellable;
  if (onHand <= 0 || valueCents <= 0) return referenceCostCents * quantity;
  const take = Math.min(quantity, onHand);
  const onStock = take === onHand ? valueCents : mulDivRound(valueCents, take, onHand);
  return onStock + (quantity - take) * referenceCostCents;
}

export function checkMargin(input: {
  revenueUsdCents: Cents;
  costUsdCents: Cents;
}): MarginCheck {
  const { revenueUsdCents, costUsdCents } = input;
  if (costUsdCents <= 0 || revenueUsdCents <= 0) {
    return { level: 'unknown', revenueUsdCents, costUsdCents, marginRatio: 0 };
  }
  const marginRatio = (revenueUsdCents - costUsdCents) / revenueUsdCents;
  const level: MarginLevel =
    revenueUsdCents < costUsdCents
      ? 'below-cost'
      : marginRatio < THIN_MARGIN_RATIO
        ? 'thin'
        : 'ok';
  return { level, revenueUsdCents, costUsdCents, marginRatio };
}

/** The margin of one cart line, priced in the cart's currency. */
export function lineMargin(input: {
  sellable: Sellable;
  quantity: number;
  unitPriceCents: Cents;
  currency: CurrencyCode;
  rateMicros: RateMicros;
}): MarginCheck {
  const revenue = normaliseToUsd(
    input.unitPriceCents * input.quantity,
    input.currency,
    input.rateMicros,
  );
  return checkMargin({
    revenueUsdCents: revenue,
    costUsdCents: estimateCostUsd(input.sellable, input.quantity),
  });
}

/** The whole cart after the discount: revenue is what is payable, cost is every line's estimate. */
export function orderMargin(input: {
  totalCents: Cents;
  currency: CurrencyCode;
  rateMicros: RateMicros;
  costUsdCents: Cents;
}): MarginCheck {
  return checkMargin({
    revenueUsdCents: normaliseToUsd(input.totalCents, input.currency, input.rateMicros),
    costUsdCents: input.costUsdCents,
  });
}

export function marginMessage(level: MarginLevel, scope: 'line' | 'order'): string | null {
  const what = scope === 'line' ? 'This price' : 'This sale';
  if (level === 'below-cost') return `${what} is below cost: you would lose money.`;
  if (level === 'thin') return `${what} leaves a very thin margin.`;
  return null;
}
