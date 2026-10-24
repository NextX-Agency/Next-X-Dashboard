import { describe, expect, it } from 'vitest';
import {
  countDifference,
  describeDifference,
  MAX_COUNTED,
  parseCounted,
  summariseCounts,
} from '@/lib/stock-count';

describe('parseCounted', () => {
  it('accepts whole numbers, zero included', () => {
    expect(parseCounted('0')).toEqual({ ok: true, value: 0 });
    expect(parseCounted(' 12 ')).toEqual({ ok: true, value: 12 });
    expect(parseCounted(7)).toEqual({ ok: true, value: 7 });
  });
  it('refuses blanks, negatives, decimals and absurd numbers in words', () => {
    for (const value of ['', '  ', '-1', '2.5', 'ten', '1e3', String(MAX_COUNTED + 1)]) {
      const result = parseCounted(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(5);
    }
    expect(parseCounted(null).ok).toBe(false);
  });
});

describe('differences', () => {
  it('is counted minus expected', () => {
    expect(countDifference(5, 8)).toBe(3);
    expect(countDifference(5, 2)).toBe(-3);
    expect(countDifference(5, 5)).toBe(0);
  });
  it('is written with a sign', () => {
    expect(describeDifference(3)).toBe('+3');
    expect(describeDifference(-2)).toBe('-2');
    expect(describeDifference(0)).toBe('No difference');
  });
});

describe('summariseCounts', () => {
  it('splits matched, over and short, and totals the net change', () => {
    const summary = summariseCounts([
      { variantId: 'a', expected: 5, counted: 5 },
      { variantId: 'b', expected: 5, counted: 8 },
      { variantId: 'c', expected: 5, counted: 2 },
      { variantId: 'd', expected: 0, counted: 1 },
    ]);
    expect(summary).toEqual({
      lines: 4,
      matched: 1,
      over: 2,
      short: 1,
      netUnits: 1,
      changing: 3,
    });
  });
  it('is empty for no lines', () => {
    expect(summariseCounts([])).toMatchObject({ lines: 0, changing: 0, netUnits: 0 });
  });
});
