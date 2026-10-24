import { describe, expect, it } from 'vitest';
import { adjustmentProblem } from '@/lib/stock-rules';

describe('stock adjustments', () => {
  it('allows additions and removals within what is on hand', () => {
    expect(adjustmentProblem({ kind: 'adjustment', quantity: 5, onHand: 0 })).toBeNull();
    expect(adjustmentProblem({ kind: 'adjustment', quantity: -3, onHand: 3 })).toBeNull();
    expect(adjustmentProblem({ kind: 'write_off', quantity: -1, onHand: 10 })).toBeNull();
    expect(adjustmentProblem({ kind: 'return', quantity: 2, onHand: 0 })).toBeNull();
  });

  it('refuses to take stock below zero', () => {
    expect(adjustmentProblem({ kind: 'adjustment', quantity: -4, onHand: 3 })).toBe(
      'Only 3 on hand, so you cannot remove 4.',
    );
    expect(adjustmentProblem({ kind: 'write_off', quantity: -1, onHand: 0 })).toBe(
      'There is no stock on hand to remove.',
    );
    // Already below zero (an oversold variant): removing more only digs deeper.
    expect(adjustmentProblem({ kind: 'adjustment', quantity: -1, onHand: -2 })).toBe(
      'There is no stock on hand to remove.',
    );
    // But a positive correction on an oversold variant is exactly how it gets fixed.
    expect(adjustmentProblem({ kind: 'adjustment', quantity: 3, onHand: -2 })).toBeNull();
  });

  it('keeps the kind and the sign consistent', () => {
    expect(adjustmentProblem({ kind: 'write_off', quantity: 2, onHand: 5 })).toMatch(
      /negative/,
    );
    expect(adjustmentProblem({ kind: 'return', quantity: -2, onHand: 5 })).toMatch(/positive/);
  });

  it('rejects zero and fractions', () => {
    expect(adjustmentProblem({ kind: 'adjustment', quantity: 0, onHand: 5 })).toMatch(
      /whole number/,
    );
    expect(adjustmentProblem({ kind: 'adjustment', quantity: 1.5, onHand: 5 })).toMatch(
      /whole number/,
    );
    expect(adjustmentProblem({ kind: 'adjustment', quantity: Number.NaN, onHand: 5 })).toMatch(
      /whole number/,
    );
  });
});
