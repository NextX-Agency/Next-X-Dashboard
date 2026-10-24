/**
 * Rules for a manual stock adjustment, kept pure so they are testable and shared by the action and
 * any screen that wants to warn before submitting.
 *
 * Stock is a ledger of movements. A correction that removes more than is on hand would drive the
 * variant below zero and silently invent a negative asset; the only legitimate way stock goes
 * negative is selling goods that were never received (shown as a shortfall), never a hand edit.
 */

export type AdjustmentKind = 'adjustment' | 'write_off' | 'return';

/** Returns a message a person can act on, or null when the adjustment is allowed. */
export function adjustmentProblem(input: {
  kind: AdjustmentKind;
  quantity: number;
  onHand: number;
}): string | null {
  const { kind, quantity, onHand } = input;
  if (!Number.isInteger(quantity) || quantity === 0) {
    return 'Enter a whole number of units, positive to add or negative to remove.';
  }
  if (kind === 'write_off' && quantity > 0) {
    return 'A write-off removes units. Enter a negative number, or choose Correction to add stock.';
  }
  if (kind === 'return' && quantity < 0) {
    return 'A customer return adds units back. Enter a positive number, or choose Write-off.';
  }
  if (quantity < 0 && onHand + quantity < 0) {
    const available = Math.max(onHand, 0);
    return available === 0
      ? 'There is no stock on hand to remove.'
      : `Only ${available} on hand, so you cannot remove ${-quantity}.`;
  }
  return null;
}
