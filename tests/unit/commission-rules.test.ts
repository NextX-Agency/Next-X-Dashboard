import { describe, expect, it } from 'vitest';
import {
  allocateCommissionDiscount,
  buildCommissionDrafts,
  netCommissionBases,
  netLineTotals,
  planCommissionNetting,
} from '@/lib/commission-rules';
import { returnedPortion } from '@/lib/costing';

describe('commission rules', () => {
  it('allocates document discounts in cents without losing any value', () => {
    const lines = [
      { id: 'a', categoryId: 'cat-a', basisCents: 1000, bundle: false },
      { id: 'b', categoryId: 'cat-b', basisCents: 2000, bundle: false },
    ];
    const allocations = allocateCommissionDiscount(lines, 101);

    expect(allocations).toEqual([34, 67]);
    expect(allocations.reduce((sum, cents) => sum + cents, 0)).toBe(101);
  });

  it('uses category, seller, then location rates and freezes one row per category', () => {
    const drafts = buildCommissionDrafts({
      lines: [
        { id: 'a', categoryId: 'cat-a', basisCents: 10000, bundle: false },
        { id: 'b', categoryId: 'cat-a', basisCents: 5000, bundle: false },
        { id: 'c', categoryId: 'cat-b', basisCents: 20000, bundle: false },
        { id: 'd', categoryId: null, basisCents: 5000, bundle: false },
      ],
      discountCents: 0,
      categoryRates: new Map([['cat-a', 350]]),
      sellerRateBps: 200,
      locationRateBps: 100,
    });

    expect(drafts).toEqual([
      {
        groupKey: 'category:cat-a',
        categoryId: 'cat-a',
        basisCents: 15000,
        rateBps: 350,
        amountCents: 525,
      },
      {
        groupKey: 'category:cat-b',
        categoryId: 'cat-b',
        basisCents: 20000,
        rateBps: 200,
        amountCents: 400,
      },
      {
        groupKey: 'category:none',
        categoryId: null,
        basisCents: 5000,
        rateBps: 200,
        amountCents: 100,
      },
    ]);
  });

  it('keeps each bundle commission separate and applies the category override', () => {
    const drafts = buildCommissionDrafts({
      lines: [
        { id: 'bundle-1', categoryId: 'cat-a', basisCents: 10000, bundle: true },
        { id: 'bundle-2', categoryId: 'cat-a', basisCents: 10000, bundle: true },
        { id: 'loose', categoryId: 'cat-a', basisCents: 10000, bundle: false },
      ],
      discountCents: 0,
      categoryRates: new Map([['cat-a', 250]]),
      sellerRateBps: 500,
      locationRateBps: 100,
    });

    expect(drafts).toEqual([
      {
        groupKey: 'bundle:bundle-1',
        categoryId: 'cat-a',
        basisCents: 10000,
        rateBps: 250,
        amountCents: 250,
      },
      {
        groupKey: 'bundle:bundle-2',
        categoryId: 'cat-a',
        basisCents: 10000,
        rateBps: 250,
        amountCents: 250,
      },
      {
        groupKey: 'category:cat-a',
        categoryId: 'cat-a',
        basisCents: 10000,
        rateBps: 250,
        amountCents: 250,
      },
    ]);
  });

  it('lets a zero category override intentionally suppress commission', () => {
    const drafts = buildCommissionDrafts({
      lines: [{ id: 'a', categoryId: 'cat-a', basisCents: 10000, bundle: false }],
      discountCents: 0,
      categoryRates: new Map([['cat-a', 0]]),
      sellerRateBps: 500,
      locationRateBps: 100,
    });
    expect(drafts).toEqual([]);
  });

  it('rejects invalid rates and discounts that exceed the sale total', () => {
    expect(() =>
      allocateCommissionDiscount(
        [{ id: 'a', categoryId: null, basisCents: 100, bundle: false }],
        101,
      ),
    ).toThrow('Sale discount is outside the sale total.');
    expect(() =>
      buildCommissionDrafts({
        lines: [],
        discountCents: 0,
        categoryRates: new Map(),
        sellerRateBps: 10_001,
        locationRateBps: 0,
      }),
    ).toThrow('Commission rates must be between 0% and 100%.');
  });
});

describe('returns against a discounted sale', () => {
  it('credits what the customer paid for the goods, not the list price', () => {
    // 3 x 10.00 and 1 x 20.00 sold with 5.00 off: 45.00 was paid.
    const lines = [
      { id: 'a', unitPriceCents: 1000, quantity: 3 },
      { id: 'b', unitPriceCents: 2000, quantity: 1 },
    ];
    const net = netLineTotals(lines, 500);
    expect([...net.values()].reduce((sum, cents) => sum + cents, 0)).toBe(4500);
    expect(net.get('a')).toBe(2700);
    expect(net.get('b')).toBe(1800);

    // Returning one unit of line a hands back 9.00, not 10.00.
    expect(returnedPortion(net.get('a') ?? 0, 3, 0, 1)).toBe(900);
  });

  it('returns every cent of a line across partial returns, with an awkward discount', () => {
    const lines = [
      { id: 'a', unitPriceCents: 333, quantity: 3 },
      { id: 'b', unitPriceCents: 500, quantity: 1 },
    ];
    const net = netLineTotals(lines, 101);
    const a = net.get('a') ?? 0;
    const credited =
      returnedPortion(a, 3, 0, 1) + returnedPortion(a, 3, 1, 1) + returnedPortion(a, 3, 2, 1);
    expect(credited).toBe(a);
    expect([...net.values()].reduce((sum, cents) => sum + cents, 0)).toBe(333 * 3 + 500 - 101);
  });

  it('with no discount the credit is the plain extended price', () => {
    const net = netLineTotals([{ id: 'a', unitPriceCents: 1250, quantity: 2 }], 0);
    expect(net.get('a')).toBe(2500);
  });
});

describe('planCommissionNetting', () => {
  const bases = netCommissionBases({
    discountCents: 0,
    lines: [
      {
        id: 'l1',
        categoryId: 'cat-new',
        unitPriceCents: 1000,
        quantity: 2,
        quantityReturned: 1,
        bundle: false,
      },
    ],
  });

  it('reduces an open commission whose group still exists', () => {
    const plan = planCommissionNetting(
      [
        {
          id: 'r1',
          groupKey: 'category:cat-new',
          rateBps: 1000,
          amountCents: 200,
          status: 'open',
        },
      ],
      bases,
    );
    expect(plan).toEqual([
      {
        kind: 'reduce',
        id: 'r1',
        basisCents: 1000,
        amountCents: 100,
        reducedCents: 100,
        cancel: false,
      },
    ]);
  });

  it('leaves a row alone and flags it when its group key vanished (category changed)', () => {
    const plan = planCommissionNetting(
      [
        {
          id: 'r1',
          groupKey: 'category:cat-old',
          rateBps: 1000,
          amountCents: 200,
          status: 'open',
        },
      ],
      bases,
    );
    expect(plan).toEqual([{ kind: 'unmatched', id: 'r1', groupKey: 'category:cat-old' }]);
  });

  it('never touches a paid row, only reports the overpayment', () => {
    const plan = planCommissionNetting(
      [
        {
          id: 'r1',
          groupKey: 'category:cat-new',
          rateBps: 1000,
          amountCents: 200,
          status: 'paid',
        },
      ],
      bases,
    );
    expect(plan).toEqual([{ kind: 'overpaid', id: 'r1', overpaidCents: 100 }]);
  });

  it('cancels only when the whole group really came back', () => {
    const allBack = netCommissionBases({
      discountCents: 0,
      lines: [
        {
          id: 'l1',
          categoryId: 'cat-new',
          unitPriceCents: 1000,
          quantity: 2,
          quantityReturned: 2,
          bundle: false,
        },
      ],
    });
    const plan = planCommissionNetting(
      [
        {
          id: 'r1',
          groupKey: 'category:cat-new',
          rateBps: 1000,
          amountCents: 200,
          status: 'open',
        },
      ],
      allBack,
    );
    expect(plan[0]).toMatchObject({ kind: 'reduce', amountCents: 0, cancel: true });
  });

  it('skips cancelled rows', () => {
    expect(
      planCommissionNetting(
        [{ id: 'r1', groupKey: 'x', rateBps: 1000, amountCents: 200, status: 'cancelled' }],
        bases,
      ),
    ).toEqual([]);
  });
});
