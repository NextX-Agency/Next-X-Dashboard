import { type Cents, CURRENCIES, type CurrencyCode, mulDivRound } from './money';

/**
 * Price arithmetic for the bulk "Change price" action, kept pure so the preview in the browser and
 * the write on the server use exactly the same numbers (and so it is unit tested).
 *
 * Every amount is an integer number of minor units (cents). A percentage is held in basis points
 * (1% = 100) so it never touches a float; the multiplication goes through `mulDivRound`, which
 * rounds half away from zero like every other proportional split in the books. The result is then
 * rounded to the step the person chose (nearest cent, 5 cents, whole unit...), and a price may
 * never end up zero or negative.
 */

export type PriceAdjustment =
  | {
      mode: 'percent';
      /** Whole basis points: +10% is 1000, -2.5% is -250. */
      basisPoints: number;
    }
  | {
      mode: 'fixed';
      /** A signed amount in the minor units of the price being changed. */
      deltaCents: Cents;
    };

export const MAX_PERCENT_BASIS_POINTS = 100_000; // +1000%
export const MIN_PERCENT_BASIS_POINTS = -9_500; // -95%
export const MAX_FIXED_DELTA_CENTS = 100_000_000; // 1,000,000.00

export type RoundingStep = { cents: number; label: string };

/** The rounding choices offered for a currency. SRD prices are quoted in whole dollars. */
export function roundingStepsFor(currency: CurrencyCode): RoundingStep[] {
  const { decimals } = CURRENCIES[currency];
  const unit = 10 ** decimals;
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  const whole = (amount: number) => `${symbol}${amount}`;
  if (currency === 'USD') {
    return [
      { cents: 1, label: 'Nearest cent' },
      { cents: 5, label: 'Nearest 5 cents' },
      { cents: unit / 2, label: `Nearest ${symbol}0.50` },
      { cents: unit, label: `Nearest ${whole(1)}` },
    ];
  }
  return [
    { cents: unit, label: `Nearest ${whole(1)}` },
    { cents: unit * 5, label: `Nearest ${whole(5)}` },
    { cents: unit * 10, label: `Nearest ${whole(10)}` },
    { cents: 1, label: 'Nearest cent' },
  ];
}

/** The step that is selected first: a cent for dollars, a whole unit for Surinamese dollars. */
export function defaultRoundingStep(currency: CurrencyCode): number {
  return currency === 'SRD' ? 10 ** CURRENCIES.SRD.decimals : 1;
}

/** Round to the nearest multiple of `step`, halves away from zero (so 2.5 steps becomes 3). */
export function roundToStep(cents: Cents, step: number): Cents {
  if (!Number.isInteger(step) || step < 1)
    throw new RangeError('The rounding step must be a whole number of cents.');
  if (step === 1) return cents;
  const steps = mulDivRound(cents, 1, step);
  return steps * step;
}

export type PriceChange =
  | { ok: true; fromCents: Cents; toCents: Cents; deltaCents: Cents }
  | { ok: false; fromCents: Cents; reason: string };

/** Why an adjustment itself cannot be used, or null. Checked before any row is touched. */
export function priceAdjustmentProblem(adjustment: PriceAdjustment): string | null {
  if (adjustment.mode === 'percent') {
    const bp = adjustment.basisPoints;
    if (!Number.isInteger(bp)) return 'Enter a percentage with at most two decimals.';
    if (bp === 0) return 'A change of 0% would not change any price.';
    if (bp < MIN_PERCENT_BASIS_POINTS) return 'A price cannot drop by more than 95%.';
    if (bp > MAX_PERCENT_BASIS_POINTS) return 'A price cannot rise by more than 1000%.';
    return null;
  }
  const delta = adjustment.deltaCents;
  if (!Number.isInteger(delta)) return 'Enter an amount with at most two decimals.';
  if (delta === 0) return 'A change of 0 would not change any price.';
  if (Math.abs(delta) > MAX_FIXED_DELTA_CENTS) return 'That amount is too large.';
  return null;
}

/** Apply one adjustment to one price. Never produces a price at or below zero. */
export function applyAdjustment(
  fromCents: Cents,
  adjustment: PriceAdjustment,
  roundTo = 1,
): PriceChange {
  const problem = priceAdjustmentProblem(adjustment);
  if (problem) return { ok: false, fromCents, reason: problem };
  if (fromCents <= 0) {
    return {
      ok: false,
      fromCents,
      reason: 'It has no price yet, so there is nothing to adjust.',
    };
  }
  const raw =
    adjustment.mode === 'percent'
      ? fromCents + mulDivRound(fromCents, adjustment.basisPoints, 10_000)
      : fromCents + adjustment.deltaCents;
  const toCents = roundToStep(raw, roundTo);
  if (toCents <= 0) {
    return { ok: false, fromCents, reason: 'The new price would be zero or negative.' };
  }
  if (toCents === fromCents) {
    return { ok: false, fromCents, reason: 'The price stays the same after rounding.' };
  }
  return { ok: true, fromCents, toCents, deltaCents: toCents - fromCents };
}

export type PricedRow = { id: string; priceCents: Cents };

export type PricePreview = {
  rows: ({ id: string } & PriceChange)[];
  changed: number;
  skipped: number;
  /** Total of every changed price before and after, to show "from 120.00 to 132.00". */
  beforeCents: Cents;
  afterCents: Cents;
};

/** The whole preview for a set of prices, in the order given. */
export function previewPriceChanges(
  rows: readonly PricedRow[],
  adjustment: PriceAdjustment,
  roundTo = 1,
): PricePreview {
  let changed = 0;
  let skipped = 0;
  let beforeCents = 0;
  let afterCents = 0;
  const out = rows.map((row) => {
    const change = applyAdjustment(row.priceCents, adjustment, roundTo);
    if (change.ok) {
      changed += 1;
      beforeCents += change.fromCents;
      afterCents += change.toCents;
    } else {
      skipped += 1;
    }
    return { id: row.id, ...change };
  });
  return { rows: out, changed, skipped, beforeCents, afterCents };
}

/**
 * Turn what someone typed into an adjustment. `percent` is "10" or "-2.5", `amount` is "1.50" in
 * the units of the currency. Returns an error message instead of throwing, for a form.
 */
export function parseAdjustmentInput(
  mode: 'percent' | 'fixed',
  raw: string,
  currency: CurrencyCode,
  direction: 'increase' | 'decrease',
): { ok: true; adjustment: PriceAdjustment } | { ok: false; error: string } {
  const text = raw.trim().replace(/,/g, '');
  if (text === '') return { ok: false, error: 'Enter a number.' };
  if (!/^\d*\.?\d*$/.test(text) || text === '.') {
    return { ok: false, error: 'Enter a positive number, like 10 or 2.5.' };
  }
  const sign = direction === 'decrease' ? -1 : 1;
  if (mode === 'percent') {
    const [whole = '0', fraction = ''] = text.split('.');
    if (fraction.length > 2) return { ok: false, error: 'At most two decimals.' };
    const bp = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
    return { ok: true, adjustment: { mode: 'percent', basisPoints: sign * bp } };
  }
  const { decimals } = CURRENCIES[currency];
  const [whole = '0', fraction = ''] = text.split('.');
  if (fraction.length > decimals) return { ok: false, error: `At most ${decimals} decimals.` };
  const cents =
    Number(whole || '0') * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || '0');
  return { ok: true, adjustment: { mode: 'fixed', deltaCents: sign * cents } };
}

/** "+10%", "-2.5%", "+$1.50" for a summary line. */
export function describeAdjustment(
  adjustment: PriceAdjustment,
  currency: CurrencyCode,
): string {
  if (adjustment.mode === 'percent') {
    const percent = adjustment.basisPoints / 100;
    return `${percent > 0 ? '+' : ''}${percent}%`;
  }
  const { decimals } = CURRENCIES[currency];
  const amount = (Math.abs(adjustment.deltaCents) / 10 ** decimals).toFixed(decimals);
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${adjustment.deltaCents > 0 ? '+' : '-'}${prefix}${amount}`;
}
