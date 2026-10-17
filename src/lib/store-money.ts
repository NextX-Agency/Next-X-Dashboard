import type { Cents } from '@/lib/money';

/**
 * Number and date formats for the public shop. The page language is `en-SR` (English, as written in
 * Suriname). `Intl` has no data for that region, so formatting uses `en-GB`: comma thousands separators
 * and day-before-month dates, which is how customers there read them.
 */
export const STORE_LANG = 'en-SR';
export const STORE_FORMAT_LOCALE = 'en-GB';

const wholeFormatter = new Intl.NumberFormat(STORE_FORMAT_LOCALE, { maximumFractionDigits: 0 });
const centsFormatter = new Intl.NumberFormat(STORE_FORMAT_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `SRD 4,850`, or `SRD 4,850.50` when there are cents. The code is always written out. */
export function formatSrd(cents: Cents): string {
  const units = cents / 100;
  return `SRD ${cents % 100 === 0 ? wholeFormatter.format(units) : centsFormatter.format(units)}`;
}

/** `Saturday, 17 October 2026` for a `YYYY-MM-DD` date, in Paramaribo time. */
export function formatPickupDate(value: string): string {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 15));
  return new Intl.DateTimeFormat(STORE_FORMAT_LOCALE, {
    timeZone: 'America/Paramaribo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** "1 product" / "3 products". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
