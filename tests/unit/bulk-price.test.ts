import { describe, expect, it } from 'vitest';
import {
  applyAdjustment,
  defaultRoundingStep,
  describeAdjustment,
  parseAdjustmentInput,
  previewPriceChanges,
  roundingStepsFor,
  roundToStep,
} from '@/lib/bulk-price';

describe('roundToStep', () => {
  it('rounds half away from zero to the step', () => {
    expect(roundToStep(1234, 1)).toBe(1234);
    expect(roundToStep(1234, 5)).toBe(1235);
    expect(roundToStep(1232, 5)).toBe(1230);
    expect(roundToStep(1250, 100)).toBe(1300);
    expect(roundToStep(1249, 100)).toBe(1200);
    expect(roundToStep(-1250, 100)).toBe(-1300);
  });
  it('refuses a step that is not a whole number of cents', () => {
    expect(() => roundToStep(100, 0)).toThrow();
    expect(() => roundToStep(100, 2.5)).toThrow();
  });
});

describe('applyAdjustment', () => {
  it('raises by a percentage without float drift', () => {
    // 29.99 + 10% = 32.989 -> 3299 cents
    const change = applyAdjustment(2999, { mode: 'percent', basisPoints: 1000 });
    expect(change).toEqual({ ok: true, fromCents: 2999, toCents: 3299, deltaCents: 300 });
  });
  it('handles two-decimal percentages and rounds the half away from zero', () => {
    expect(applyAdjustment(1000, { mode: 'percent', basisPoints: 250 })).toMatchObject({
      ok: true,
      toCents: 1025,
    });
    // 1 cent + 50% = 1.5 cents, which rounds to 2
    expect(applyAdjustment(1, { mode: 'percent', basisPoints: 5000 })).toMatchObject({
      ok: true,
      toCents: 2,
    });
  });
  it('lowers by a fixed amount and rounds to the chosen step (SRD whole dollars)', () => {
    const change = applyAdjustment(485_000, { mode: 'fixed', deltaCents: -12_345 }, 100);
    expect(change).toMatchObject({ ok: true, toCents: 472_700 });
  });
  it('rounds USD to 50 cents', () => {
    expect(applyAdjustment(3899, { mode: 'percent', basisPoints: 1000 }, 50)).toMatchObject({
      ok: true,
      toCents: 4300,
    });
  });
  it('never produces a price at or below zero', () => {
    expect(applyAdjustment(500, { mode: 'fixed', deltaCents: -500 })).toMatchObject({
      ok: false,
    });
    expect(applyAdjustment(500, { mode: 'fixed', deltaCents: -9000 })).toMatchObject({
      ok: false,
    });
  });
  it('skips a price that has not been set, and one that rounds back to itself', () => {
    expect(applyAdjustment(0, { mode: 'percent', basisPoints: 1000 })).toMatchObject({
      ok: false,
    });
    expect(applyAdjustment(1000, { mode: 'percent', basisPoints: 100 }, 1000)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('rounding'),
    });
  });
  it('rejects an adjustment that cannot be used', () => {
    expect(applyAdjustment(1000, { mode: 'percent', basisPoints: 0 })).toMatchObject({
      ok: false,
    });
    expect(applyAdjustment(1000, { mode: 'percent', basisPoints: -9600 })).toMatchObject({
      ok: false,
    });
    expect(applyAdjustment(1000, { mode: 'percent', basisPoints: 100_001 })).toMatchObject({
      ok: false,
    });
    expect(applyAdjustment(1000, { mode: 'fixed', deltaCents: 1.5 })).toMatchObject({
      ok: false,
    });
  });
});

describe('previewPriceChanges', () => {
  it('counts changed and skipped rows and totals what changed', () => {
    const preview = previewPriceChanges(
      [
        { id: 'a', priceCents: 1000 },
        { id: 'b', priceCents: 0 },
        { id: 'c', priceCents: 2000 },
      ],
      { mode: 'percent', basisPoints: 1000 },
    );
    expect(preview.changed).toBe(2);
    expect(preview.skipped).toBe(1);
    expect(preview.beforeCents).toBe(3000);
    expect(preview.afterCents).toBe(3300);
    expect(preview.rows.map((row) => row.ok)).toEqual([true, false, true]);
  });
});

describe('rounding choices per currency', () => {
  it('offers whole dollars first for SRD and cents first for USD', () => {
    expect(defaultRoundingStep('SRD')).toBe(100);
    expect(defaultRoundingStep('USD')).toBe(1);
    expect(roundingStepsFor('SRD')[0]?.cents).toBe(100);
    expect(roundingStepsFor('USD').map((step) => step.cents)).toEqual([1, 5, 50, 100]);
  });
});

describe('parseAdjustmentInput', () => {
  it('reads a percentage as basis points and applies the direction', () => {
    expect(parseAdjustmentInput('percent', '10', 'USD', 'increase')).toEqual({
      ok: true,
      adjustment: { mode: 'percent', basisPoints: 1000 },
    });
    expect(parseAdjustmentInput('percent', '2.5', 'USD', 'decrease')).toEqual({
      ok: true,
      adjustment: { mode: 'percent', basisPoints: -250 },
    });
  });
  it('reads an amount in the currency decimals', () => {
    expect(parseAdjustmentInput('fixed', '1.5', 'USD', 'increase')).toEqual({
      ok: true,
      adjustment: { mode: 'fixed', deltaCents: 150 },
    });
    expect(parseAdjustmentInput('fixed', '1,250', 'SRD', 'decrease')).toEqual({
      ok: true,
      adjustment: { mode: 'fixed', deltaCents: -125_000 },
    });
  });
  it('explains what is wrong with the input', () => {
    expect(parseAdjustmentInput('percent', '', 'USD', 'increase')).toMatchObject({ ok: false });
    expect(parseAdjustmentInput('percent', 'ten', 'USD', 'increase')).toMatchObject({
      ok: false,
    });
    expect(parseAdjustmentInput('percent', '1.234', 'USD', 'increase')).toMatchObject({
      ok: false,
    });
    expect(parseAdjustmentInput('fixed', '1.999', 'USD', 'increase')).toMatchObject({
      ok: false,
    });
  });
});

describe('describeAdjustment', () => {
  it('writes a signed summary', () => {
    expect(describeAdjustment({ mode: 'percent', basisPoints: 1000 }, 'USD')).toBe('+10%');
    expect(describeAdjustment({ mode: 'percent', basisPoints: -250 }, 'USD')).toBe('-2.5%');
    expect(describeAdjustment({ mode: 'fixed', deltaCents: 150 }, 'USD')).toBe('+$1.50');
    expect(describeAdjustment({ mode: 'fixed', deltaCents: -10_000 }, 'SRD')).toBe(
      '-SRD 100.00',
    );
  });
});
