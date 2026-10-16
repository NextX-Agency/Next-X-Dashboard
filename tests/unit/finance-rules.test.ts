import { describe, expect, it } from 'vitest';
import {
  invoicePaymentState,
  ledgerNetCents,
  walletTransferAllowed,
} from '@/lib/finance-rules';
import { fromBase, toBase } from '@/lib/fx';

describe('finance rules', () => {
  it('allows only active, same-currency, sufficiently funded transfers', () => {
    const usd = { active: true, currency: 'USD' as const };
    const srd = { active: true, currency: 'SRD' as const };
    expect(walletTransferAllowed(usd, usd, 100, 100)).toBe(true);
    expect(walletTransferAllowed(usd, usd, 101, 100)).toBe(false);
    expect(walletTransferAllowed(usd, srd, 100, 100)).toBe(false);
    expect(walletTransferAllowed({ ...usd, active: false }, usd, 100, 100)).toBe(false);
  });

  it('derives invoice state from payments rather than an isPaid flag', () => {
    expect(invoicePaymentState(1000, 0)).toBe('outstanding');
    expect(invoicePaymentState(1000, 400)).toBe('partial');
    expect(invoicePaymentState(1000, 1000)).toBe('paid');
    expect(invoicePaymentState(1000, 1100)).toBe('paid');
  });

  it('keeps ledger direction signed and FX direction explicit', () => {
    expect(ledgerNetCents('in', 250)).toBe(250);
    expect(ledgerNetCents('out', 250)).toBe(-250);
    expect(fromBase(100, 38_500_000)).toBe(3850);
    expect(toBase(3850, 38_500_000)).toBe(100);
  });
});
