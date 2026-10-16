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
