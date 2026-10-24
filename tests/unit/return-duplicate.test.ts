import { describe, expect, it } from 'vitest';
import { isRepeatedReturn, unitsByVariant } from '@/lib/return-duplicate';

describe('unitsByVariant', () => {
  it('adds lines of the same variant and drops unusable quantities', () => {
    const units = unitsByVariant([
      { variantId: 'a', quantity: 1 },
      { variantId: 'a', quantity: 2 },
      { variantId: 'b', quantity: 0 },
      { variantId: 'c', quantity: Number.NaN },
    ]);
    expect([...units]).toEqual([['a', 3]]);
  });
});

describe('isRepeatedReturn', () => {
  const planned = unitsByVariant([
    { variantId: 'a', quantity: 1 },
    { variantId: 'b', quantity: 2 },
  ]);

  it('recognises the same request arriving a second time', () => {
    expect(
      isRepeatedReturn(planned, [
        { batch: 't1', variantId: 'a', quantity: 1 },
        { batch: 't1', variantId: 'b', quantity: 2 },
      ]),
    ).toBe(true);
  });

  it('lets a different partial return through', () => {
    expect(isRepeatedReturn(planned, [{ batch: 't1', variantId: 'a', quantity: 1 }])).toBe(
      false,
    );
    expect(
      isRepeatedReturn(planned, [
        { batch: 't1', variantId: 'a', quantity: 2 },
        { batch: 't1', variantId: 'b', quantity: 2 },
      ]),
    ).toBe(false);
  });

  it('does not add two separate earlier returns together', () => {
    // Two single-unit returns are not one two-unit return.
    expect(
      isRepeatedReturn(unitsByVariant([{ variantId: 'a', quantity: 2 }]), [
        { batch: 't1', variantId: 'a', quantity: 1 },
        { batch: 't2', variantId: 'a', quantity: 1 },
      ]),
    ).toBe(false);
  });

  it('is false with nothing planned or nothing earlier', () => {
    expect(isRepeatedReturn(new Map(), [{ batch: 't1', variantId: 'a', quantity: 1 }])).toBe(
      false,
    );
    expect(isRepeatedReturn(planned, [])).toBe(false);
  });
});
