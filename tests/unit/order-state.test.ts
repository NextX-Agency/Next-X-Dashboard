import { describe, expect, it } from 'vitest';
import { assertOrderTransition, canTransitionOrder } from '@/lib/order-state';

describe('canonical order state machine', () => {
  it('allows the operational path', () => {
    expect(canTransitionOrder('draft', 'confirmed')).toBe(true);
    expect(canTransitionOrder('confirmed', 'ready')).toBe(true);
    expect(canTransitionOrder('ready', 'completed')).toBe(true);
  });

  it('allows cancellation before completion', () => {
    expect(canTransitionOrder('draft', 'cancelled')).toBe(true);
    expect(canTransitionOrder('confirmed', 'cancelled')).toBe(true);
    expect(canTransitionOrder('ready', 'cancelled')).toBe(true);
  });

  it('keeps terminal states terminal', () => {
    expect(canTransitionOrder('completed', 'draft')).toBe(false);
    expect(canTransitionOrder('cancelled', 'confirmed')).toBe(false);
    expect(() => assertOrderTransition('completed', 'draft')).toThrow();
  });
});
