/**
 * Foreign exchange.
 *
 * USD is the base currency; the books are kept in USD cents. SRD is a
 * quotation. Rates are stored as integer MICRO-UNITS (rate x 1_000_000) so
 * conversion is exact integer arithmetic — 38.5 SRD/USD is `38_500_000`.
 *
 * The rate that applied at the moment of a transaction is written onto that
 * transaction row. Editing today's rate must never re-value last month's
 * sales, which is exactly what the spreadsheet does today.
 */

import { type Cents, type CurrencyCode, mulDivRound } from './money';

export const RATE_SCALE = 1_000_000;

export type RateMicros = number;

export function parseRate(input: string | number): RateMicros {
  const raw = String(input)
    .trim()
    .replace(/[\s,_]/g, '');
  const match = /^(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) throw new TypeError(`Not a valid exchange rate: ${JSON.stringify(input)}`);

  const [, whole = '', fraction = ''] = match;
  const padded = fraction.padEnd(7, '0');
  const kept = padded.slice(0, 6);
  const nextDigit = Number(padded[6] ?? '0');

  const micros = Number(`${whole || '0'}${kept}`) + (nextDigit >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    throw new RangeError(`Exchange rate out of range: ${input}`);
  }
  return micros;
}

export function formatRate(micros: RateMicros, digits = 4): string {
  return (micros / RATE_SCALE).toFixed(digits);
}

/** Quote currency (SRD) minor units → base currency (USD) minor units. */
export function toBase(amount: Cents, rate: RateMicros): Cents {
  return mulDivRound(amount, RATE_SCALE, rate);
}

/** Base currency (USD) minor units → quote currency (SRD) minor units. */
export function fromBase(amount: Cents, rate: RateMicros): Cents {
  return mulDivRound(amount, rate, RATE_SCALE);
}

/**
 * Normalise any transaction amount into USD cents using the rate recorded on
 * that transaction. A USD amount passes through untouched — we never round a
 * value that is already in the base currency.
 */
export function normaliseToUsd(amount: Cents, currency: CurrencyCode, rate: RateMicros): Cents {
  return currency === 'USD' ? amount : toBase(amount, rate);
}

/** True when a rate is old enough that the dashboard should warn about it. */
export function isRateStale(
  effectiveFrom: Date,
  now: Date = new Date(),
  maxAgeDays = 7,
): boolean {
  const ageMs = now.getTime() - effectiveFrom.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

/** SRD per USD. The market has sat between roughly 7 and 60 for a decade; the
 *  bounds are deliberately far outside that and only catch decimal-point typos. */
export const MIN_PLAUSIBLE_RATE_MICROS = 1 * RATE_SCALE;
export const MAX_PLAUSIBLE_RATE_MICROS = 500 * RATE_SCALE;

/** A new rate that moves this far from the previous one needs a second look. */
export const LARGE_RATE_CHANGE_RATIO = 0.25;

export type RateAssessment =
  | { status: 'ok' }
  | { status: 'implausible'; message: string }
  | { status: 'large-change'; change: number; message: string };

/**
 * Sanity-check a rate before it becomes the rate every new SRD sale is booked
 * at. Entering "385" for 38.5 would silently misvalue every sale until
 * somebody noticed, and historic documents keep the rate they were created with.
 */
export function assessRateChange(
  previous: RateMicros | null | undefined,
  next: RateMicros,
): RateAssessment {
  if (next < MIN_PLAUSIBLE_RATE_MICROS || next > MAX_PLAUSIBLE_RATE_MICROS) {
    return {
      status: 'implausible',
      message: `${formatRate(next, 4)} SRD per USD is outside the believable range (1 to 500). Check the decimal point.`,
    };
  }
  if (previous && previous > 0) {
    const change = (next - previous) / previous;
    if (Math.abs(change) > LARGE_RATE_CHANGE_RATIO) {
      return {
        status: 'large-change',
        change,
        message: `That is ${(Math.abs(change) * 100).toFixed(0)}% ${change > 0 ? 'higher' : 'lower'} than the current rate (${formatRate(previous, 4)}).`,
      };
    }
  }
  return { status: 'ok' };
}
