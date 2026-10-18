import { describe, expect, it } from 'vitest';
import {
  centsToUnits,
  hasPriceRange,
  parsePriceRange,
  pricePresets,
  priceRangeLabel,
  unitsToCents,
} from '@/lib/price-range';

describe('unitsToCents', () => {
  it('reads whole and two-decimal amounts, with thousands separators', () => {
    expect(unitsToCents('500')).toBe(50_000);
    expect(unitsToCents('1,500')).toBe(150_000);
    expect(unitsToCents('12.5')).toBe(1_250);
    expect(unitsToCents('0')).toBe(0);
  });

  it('ignores anything that is not a price', () => {
    for (const bad of ['', 'abc', '-5', '1e9', '12.345', '99999999999', undefined, null]) {
      expect(unitsToCents(bad as string | undefined)).toBeNull();
    }
  });
});

describe('parsePriceRange', () => {
  it('takes a minimum, a maximum or both, inclusive, in the shop currency', () => {
    expect(parsePriceRange({ min: '1000', max: '2000' }, 'SRD')).toEqual({
      minCents: 100_000,
      maxCents: 200_000,
    });
    expect(parsePriceRange({ min: '1000' }, 'SRD')).toEqual({
      minCents: 100_000,
      maxCents: null,
    });
    expect(parsePriceRange({ max: '500' }, 'SRD')).toEqual({
      minCents: null,
      maxCents: 50_000,
    });
  });

  it('swaps a reversed range instead of matching nothing', () => {
    expect(parsePriceRange({ min: '2000', max: '1000' }, 'SRD')).toEqual({
      minCents: 100_000,
      maxCents: 200_000,
    });
  });

  it('maps the old tier links onto the same range', () => {
    expect(parsePriceRange({ price: 'under-50' }, 'SRD')).toEqual({
      minCents: null,
      maxCents: 49_999,
    });
    expect(parsePriceRange({ price: '50-100' }, 'SRD')).toEqual({
      minCents: 50_000,
      maxCents: 99_999,
    });
    expect(parsePriceRange({ price: '250-plus' }, 'SRD')).toEqual({
      minCents: 200_000,
      maxCents: null,
    });
    expect(parsePriceRange({ price: 'under-50' }, 'USD')).toEqual({
      minCents: null,
      maxCents: 4_999,
    });
  });

  it('prefers an explicit range over an old tier, and ignores junk', () => {
    expect(parsePriceRange({ min: '10', price: 'under-50' }, 'SRD')).toEqual({
      minCents: 1_000,
      maxCents: null,
    });
    expect(parsePriceRange({ min: 'x', max: '??', price: 'nope' }, 'SRD')).toEqual({
      minCents: null,
      maxCents: null,
    });
  });

  it('knows whether a range is set', () => {
    expect(hasPriceRange({ minCents: null, maxCents: null })).toBe(false);
    expect(hasPriceRange({ minCents: 0, maxCents: null })).toBe(true);
  });
});

describe('labels', () => {
  it('writes the range for the removable chip', () => {
    expect(priceRangeLabel({ minCents: 50_000, maxCents: 150_000 }, 'SRD')).toBe(
      'SRD 500 – 1,500',
    );
    expect(priceRangeLabel({ minCents: 50_000, maxCents: null }, 'SRD')).toBe('From SRD 500');
    expect(priceRangeLabel({ minCents: null, maxCents: 150_000 }, 'SRD')).toBe(
      'Up to SRD 1,500',
    );
  });

  it('offers four presets that parse back to a range', () => {
    const presets = pricePresets('SRD');
    expect(presets.map((preset) => preset.label)).toEqual([
      'Up to SRD 500',
      'SRD 500 – 1,000',
      'SRD 1,000 – 2,000',
      'SRD 2,000 and up',
    ]);
    const second = presets[1];
    expect(
      parsePriceRange({ min: second?.min ?? undefined, max: second?.max ?? undefined }, 'SRD'),
    ).toEqual({ minCents: 50_000, maxCents: 100_000 });
    expect(centsToUnits(150_050)).toBe('1500.50');
  });
});
