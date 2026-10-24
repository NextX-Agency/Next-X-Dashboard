import { describe, expect, it } from 'vitest';
import {
  buildUndoPlan,
  describeResults,
  inversePriceChanges,
  inverseProductChanges,
  matchesExpectation,
  UNDO_WINDOW_MS,
  undoSecondsLeft,
} from '@/lib/bulk-undo';

describe('inverse of a change', () => {
  it('restores what was there before and expects what the change wrote', () => {
    const [item] = inverseProductChanges([
      {
        id: 'p1',
        name: 'KZ Duo',
        before: { status: 'active', catalogPublished: true },
        after: { status: 'archived', catalogPublished: false },
      },
    ]);
    expect(item).toEqual({
      id: 'p1',
      restore: { status: 'active', catalogPublished: true },
      expect: { status: 'archived', catalogPublished: false },
    });
  });

  it('inverts prices: put back the old figure, only if the new one is still there', () => {
    const [item] = inversePriceChanges([
      { variantId: 'v1', label: 'x', target: { kind: 'list' }, fromCents: 1000, toCents: 1100 },
    ]);
    expect(item).toEqual({
      variantId: 'v1',
      target: { kind: 'list' },
      restoreCents: 1000,
      expectCents: 1100,
    });
  });

  it('leaves fields a change did not touch out of the undo', () => {
    const plan = buildUndoPlan({
      products: [
        { id: 'p', name: 'n', before: { categoryId: 'a' }, after: { categoryId: 'b' } },
      ],
    });
    expect(plan?.products[0]?.restore).toEqual({ categoryId: 'a' });
    expect(plan?.products[0]?.expect).toEqual({ categoryId: 'b' });
  });

  it('has no plan when nothing changed', () => {
    expect(buildUndoPlan({})).toBeNull();
    expect(buildUndoPlan({ products: [], prices: [] })).toBeNull();
  });
});

describe('matchesExpectation', () => {
  it('only compares the fields the change wrote', () => {
    const current = { status: 'archived' as const, catalogPublished: false, categoryId: 'x' };
    expect(matchesExpectation(current, { status: 'archived' })).toBe(true);
    expect(matchesExpectation(current, { status: 'active' })).toBe(false);
    expect(matchesExpectation(current, { categoryId: null })).toBe(false);
    expect(matchesExpectation(current, {})).toBe(true);
  });
});

describe('undo window', () => {
  it('counts down 30 seconds and never goes negative', () => {
    expect(UNDO_WINDOW_MS).toBe(30_000);
    expect(undoSecondsLeft(1000, 1000)).toBe(30);
    expect(undoSecondsLeft(1000, 1000 + 29_001)).toBe(1);
    expect(undoSecondsLeft(1000, 1000 + 31_000)).toBe(0);
  });
});

describe('describeResults', () => {
  it('summarises in words', () => {
    expect(
      describeResults([
        { id: '1', name: 'a', outcome: 'changed' },
        { id: '2', name: 'b', outcome: 'changed' },
        { id: '3', name: 'c', outcome: 'skipped', message: 'no photo' },
        { id: '4', name: 'd', outcome: 'unchanged' },
      ]),
    ).toBe('2 updated, 1 already that way, 1 skipped');
    expect(describeResults([{ id: '1', name: 'a', outcome: 'changed' }], 'archived')).toBe(
      '1 archived',
    );
  });
});
