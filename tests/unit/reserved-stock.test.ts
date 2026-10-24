import { describe, expect, it } from 'vitest';
import {
  availableToSell,
  describeReservedConflict,
  type ReservedStockPosition,
  reservedStockConflicts,
  reservedStockRefusal,
} from '@/lib/reserved-stock';

const positions = (entries: Record<string, ReservedStockPosition>) =>
  new Map(Object.entries(entries));

describe('availableToSell', () => {
  it('is on hand less reserved and never negative', () => {
    expect(availableToSell({ onHand: 10, reserved: 4 })).toBe(6);
    expect(availableToSell({ onHand: 2, reserved: 5 })).toBe(0);
    expect(availableToSell({ onHand: -1, reserved: 0 })).toBe(0);
  });
});

describe('reservedStockConflicts', () => {
  it('is quiet when the sale leaves the reserved units in place', () => {
    const result = reservedStockConflicts(
      [{ variantId: 'a', label: 'Lamp', quantity: 6 }],
      positions({ a: { onHand: 10, reserved: 4 } }),
    );
    expect(result).toEqual([]);
  });

  it('flags a sale that dips into reserved units', () => {
    const [conflict] = reservedStockConflicts(
      [{ variantId: 'a', label: 'Lamp', quantity: 7 }],
      positions({ a: { onHand: 10, reserved: 4 } }),
    );
    expect(conflict).toMatchObject({
      variantId: 'a',
      quantity: 7,
      available: 6,
      reserved: 4,
      takesReserved: 1,
    });
  });

  it('ignores variants with nothing reserved, even when the sale oversells them', () => {
    const result = reservedStockConflicts(
      [{ variantId: 'a', label: 'Lamp', quantity: 9 }],
      positions({ a: { onHand: 3, reserved: 0 } }),
    );
    expect(result).toEqual([]);
  });

  it('adds the lines of one variant together before judging', () => {
    const result = reservedStockConflicts(
      [
        { variantId: 'a', label: 'Lamp', quantity: 4 },
        { variantId: 'a', label: 'Lamp', quantity: 4 },
      ],
      positions({ a: { onHand: 10, reserved: 4 } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.quantity).toBe(8);
  });

  it('never takes more reserved units than are reserved', () => {
    const [conflict] = reservedStockConflicts(
      [{ variantId: 'a', label: 'Lamp', quantity: 50 }],
      positions({ a: { onHand: 10, reserved: 4 } }),
    );
    expect(conflict?.takesReserved).toBe(4);
  });

  it('skips unknown variants and unusable quantities', () => {
    expect(
      reservedStockConflicts(
        [
          { variantId: 'missing', label: 'Ghost', quantity: 1 },
          { variantId: 'a', label: 'Lamp', quantity: 0 },
          { variantId: 'a', label: 'Lamp', quantity: Number.NaN },
        ],
        positions({ a: { onHand: 1, reserved: 1 } }),
      ),
    ).toEqual([]);
  });
});

describe('reservedStockRefusal', () => {
  const conflicts = reservedStockConflicts(
    [{ variantId: 'a', label: 'Lamp · Warm', quantity: 7 }],
    positions({ a: { onHand: 10, reserved: 4 } }),
  );

  it('allows a sale with no conflict', () => {
    expect(reservedStockRefusal([], { override: false, isOwner: false })).toBeNull();
  });

  it('refuses a conflict and names the product and the figures', () => {
    const message = reservedStockRefusal(conflicts, { override: false, isOwner: false });
    expect(message).toContain('Lamp · Warm');
    expect(message).toContain('reserved for open orders');
    expect(message).toContain('ask the owner');
  });

  it('tells an owner how to proceed on purpose', () => {
    const message = reservedStockRefusal(conflicts, { override: false, isOwner: true });
    expect(message).toContain('Sell reserved stock anyway');
  });

  it('lets an owner override', () => {
    expect(reservedStockRefusal(conflicts, { override: true, isOwner: true })).toBeNull();
  });

  it('does not let staff override: the flag comes from the browser', () => {
    const message = reservedStockRefusal(conflicts, { override: true, isOwner: false });
    expect(message).toContain('Only the owner');
  });
});

describe('describeReservedConflict', () => {
  it('says when none of the stock is free', () => {
    const [conflict] = reservedStockConflicts(
      [{ variantId: 'a', label: 'Lamp', quantity: 1 }],
      positions({ a: { onHand: 3, reserved: 3 } }),
    );
    expect(conflict && describeReservedConflict(conflict)).toContain('none of it is free');
  });
});
