/**
 * Price-range filter tiers for the public catalog. The catalog compares a variant's list price in
 * the storefront's own currency, so the thresholds must be in that currency too: an SRD shop that
 * used US$ thresholds would treat "Under US$50" as "under SRD 50".
 *
 * The URL keys stay the original four so existing links keep working; only the thresholds and the
 * labels depend on the currency. Thresholds are minor units (cents).
 */
export const PRICE_TIER_KEYS = ['under-50', '50-100', '100-250', '250-plus'] as const;
export type PriceTierKey = (typeof PRICE_TIER_KEYS)[number];

export type PriceCurrency = 'USD' | 'SRD';

const THRESHOLDS: Record<PriceCurrency, readonly [number, number, number]> = {
  USD: [5_000, 10_000, 25_000],
  SRD: [50_000, 100_000, 200_000],
};

export function priceTierThresholds(
  currency: PriceCurrency,
): readonly [number, number, number] {
  return THRESHOLDS[currency];
}

export function priceTierLabels(currency: PriceCurrency): Record<PriceTierKey, string> {
  return currency === 'SRD'
    ? {
        'under-50': 'Onder SRD 500',
        '50-100': 'SRD 500 – 1.000',
        '100-250': 'SRD 1.000 – 2.000',
        '250-plus': 'SRD 2.000 of meer',
      }
    : {
        'under-50': 'Onder US$50',
        '50-100': 'US$50 – 100',
        '100-250': 'US$100 – 250',
        '250-plus': 'US$250 of meer',
      };
}

export function isPriceTierKey(value: unknown): value is PriceTierKey {
  return typeof value === 'string' && (PRICE_TIER_KEYS as readonly string[]).includes(value);
}
