import { describe, expect, it } from 'vitest';
import { isGroupOpen, revealCurrentGroup } from '@/lib/nav-toggle';

describe('sidebar group state', () => {
  it('opens the group holding the current page when untouched', () => {
    expect(isGroupOpen({}, 'sell', 'sell')).toBe(true);
    expect(isGroupOpen({}, 'stock', 'sell')).toBe(false);
  });

  it('respects a manual choice while staying on the same page', () => {
    expect(isGroupOpen({ sell: false }, 'sell', 'sell')).toBe(false);
    expect(isGroupOpen({ stock: true }, 'stock', 'sell')).toBe(true);
  });

  it('reopens a hand-closed group once you navigate into it', () => {
    const closedByHand = { sell: false, money: true };
    const after = revealCurrentGroup(closedByHand, 'sell');
    expect(isGroupOpen(after, 'sell', 'sell')).toBe(true);
    // Other groups keep what the user chose.
    expect(isGroupOpen(after, 'money', 'sell')).toBe(true);
  });

  it('returns the same object when there is nothing to forget', () => {
    const toggles = { money: true };
    expect(revealCurrentGroup(toggles, 'sell')).toBe(toggles);
    expect(revealCurrentGroup(toggles, undefined)).toBe(toggles);
  });
});
