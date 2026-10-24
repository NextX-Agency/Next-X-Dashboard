import type { Cents, CurrencyCode } from './money';

export type PaymentState = 'paid' | 'partial' | 'outstanding';

export function walletTransferAllowed(
  source: { active: boolean; currency: CurrencyCode },
  destination: { active: boolean; currency: CurrencyCode },
  amountCents: Cents,
  sourceBalanceCents: Cents,
): boolean {
  return (
    source.active &&
    destination.active &&
    source.currency === destination.currency &&
    amountCents > 0 &&
    sourceBalanceCents >= amountCents
  );
}

export function invoicePaymentState(totalCents: Cents, paidCents: Cents): PaymentState {
  if (paidCents >= totalCents) return 'paid';
  if (paidCents > 0) return 'partial';
  return 'outstanding';
}

export function ledgerNetCents(direction: 'in' | 'out', amountCents: Cents): Cents {
  if (amountCents <= 0) throw new RangeError('Ledger amount must be positive');
  return direction === 'in' ? amountCents : -amountCents;
}

/** Event types a person may undo straight from the ledger. Anything a document
 *  posted is corrected by voiding that document instead. */
const MANUAL_EVENT_TYPES = new Set(['manual', 'legacy']);

export type ReversibleVerdict = { ok: true } | { ok: false; reason: string };

export function isManuallyReversible(entry: {
  sourceKind: string;
  eventType: string | null;
  reversalOfId: string | null;
}): ReversibleVerdict {
  if (entry.reversalOfId) {
    return {
      ok: false,
      reason: 'That entry is already a reversal. Record a new entry instead.',
    };
  }
  if (entry.sourceKind === 'sale') {
    return {
      ok: false,
      reason: 'A sale payment or refund is undone from the sale: void the payment there.',
    };
  }
  if (entry.sourceKind === 'expense') {
    return { ok: false, reason: 'An expense is undone by voiding the expense.' };
  }
  if (entry.sourceKind === 'purchase_order') {
    return { ok: false, reason: 'A supplier payment is undone from its purchase order.' };
  }
  if (!MANUAL_EVENT_TYPES.has(entry.eventType ?? 'legacy')) {
    return {
      ok: false,
      reason:
        'This entry belongs to a transfer or settlement and cannot be reversed on its own.',
    };
  }
  return { ok: true };
}
