import { describe, expect, it } from 'vitest';
import { allocateCommissionDiscount, buildCommissionDrafts } from '@/lib/commission-rules';

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
