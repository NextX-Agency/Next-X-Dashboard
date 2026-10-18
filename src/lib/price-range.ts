import { isPriceTierKey, type PriceCurrency, priceTierThresholds } from '@/lib/price-tiers';

/**
 * The shop's price filter: an optional minimum and maximum in the storefront's own currency, held in
 * minor units (cents) and INCLUSIVE at both ends. It is applied to one variant at a time, the same
 * variant that satisfies the colour, option and stock filters, never to a product's cheapest price.
 *
 * The address carries whole currency units (`?min=500&max=1500`). Links made before the range
 * control existed used four fixed tiers (`?price=50-100`); they are mapped onto the same range so
 * they keep working.
 */
export type PriceRange = { minCents: number | null; maxCents: number | null };

export const NO_PRICE_RANGE: PriceRange = { minCents: null, maxCents: null };

/** Beyond this the number is not a price; it keeps a typo from reaching the database as an overflow. */
const MAX_UNITS = 10_000_000;

/** Whole or two-decimal units from the address bar ("1500", "1,500", "12.5") to cents; null when not a price. */
export function unitsToCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/,/g, '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(cleaned)) return null;
  const units = Number(cleaned);
  if (!Number.isFinite(units) || units < 0 || units > MAX_UNITS) return null;
  return Math.round(units * 100);
}

export function centsToUnits(cents: number): string {
  const units = cents / 100;
  return Number.isInteger(units) ? String(units) : units.toFixed(2);
}

export function parsePriceRange(
  raw: { min?: string | undefined; max?: string | undefined; price?: string | undefined },
  currency: PriceCurrency,
): PriceRange {
  let minCents = unitsToCents(raw.min);
  let maxCents = unitsToCents(raw.max);

  if (minCents === null && maxCents === null && isPriceTierKey(raw.price)) {
    const [low, mid, high] = priceTierThresholds(currency);
    // The old tiers were half-open ("under 500", "500 to under 1,000"); inclusive ends need the cent before.
    if (raw.price === 'under-50') maxCents = low - 1;
    else if (raw.price === '50-100') [minCents, maxCents] = [low, mid - 1];
    else if (raw.price === '100-250') [minCents, maxCents] = [mid, high - 1];
    else minCents = high;
  }

  if (minCents !== null && maxCents !== null && minCents > maxCents) {
    [minCents, maxCents] = [maxCents, minCents];
  }
  return { minCents, maxCents };
}

export function hasPriceRange(range: PriceRange): boolean {
  return range.minCents !== null || range.maxCents !== null;
}

/** Ready-made ranges for one tap. Both ends are inclusive, so a SRD 500 product matches the first two. */
export function pricePresets(
  currency: PriceCurrency,
): { key: string; label: string; min: string | null; max: string | null }[] {
  const [low, mid, high] = priceTierThresholds(currency);
  const symbol = currency === 'SRD' ? 'SRD ' : 'US$';
  const num = (cents: number) => Math.round(cents / 100).toLocaleString('en-GB');
  const fmt = (cents: number) => `${symbol}${num(cents)}`;
  return [
    { key: 'p1', label: `Up to ${fmt(low)}`, min: null, max: centsToUnits(low) },
    {
      key: 'p2',
      label: `${fmt(low)} – ${num(mid)}`,
      min: centsToUnits(low),
      max: centsToUnits(mid),
    },
    {
      key: 'p3',
      label: `${fmt(mid)} – ${num(high)}`,
      min: centsToUnits(mid),
      max: centsToUnits(high),
    },
    { key: 'p4', label: `${fmt(high)} and up`, min: centsToUnits(high), max: null },
  ];
}

/** "SRD 500 – 1,500", "From SRD 500", "Up to SRD 1,500" for the removable chip. */
export function priceRangeLabel(range: PriceRange, currency: PriceCurrency): string {
  const symbol = currency === 'SRD' ? 'SRD ' : 'US$';
  const fmt = (cents: number) => `${symbol}${(cents / 100).toLocaleString('en-GB')}`;
  if (range.minCents !== null && range.maxCents !== null)
    return `${fmt(range.minCents)} – ${(range.maxCents / 100).toLocaleString('en-GB')}`;
  if (range.minCents !== null) return `From ${fmt(range.minCents)}`;
  if (range.maxCents !== null) return `Up to ${fmt(range.maxCents)}`;
  return '';
}
