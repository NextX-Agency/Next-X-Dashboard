import type { CurrencyCode } from './money';

/** Shared arithmetic and guardrails for channel-level commerce rules. */
export function availableUnits(onHand: number, reserved: number): number {
  return Math.max(0, Math.trunc(onHand) - Math.trunc(reserved));
}

export function priceListCurrencyMatches(
  storefrontCurrency: CurrencyCode,
  priceListCurrency: CurrencyCode,
): boolean {
  return storefrontCurrency === priceListCurrency;
}
