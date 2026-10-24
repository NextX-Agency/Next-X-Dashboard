import { describe, expect, it } from 'vitest';
import {
  changeDue,
  methodForWallet,
  parseReceived,
  planSettlement,
  roundUpAmounts,
  walletsFor,
} from '@/lib/pos/payment';

describe('change', () => {
  it('is what was handed over beyond the bill, never negative', () => {
    expect(changeDue(20_000, 184_700)).toBe(0);
    expect(changeDue(200_000, 184_700)).toBe(15_300);
    expect(changeDue(1_000, 1_500)).toBe(0);
  });

  it('reads the received field exactly', () => {
    expect(parseReceived('2000')).toBe(200_000);
    expect(parseReceived('20.55')).toBe(2_055);
    expect(parseReceived('')).toBeNull();
    expect(parseReceived('abc')).toBeNull();
    expect(parseReceived('-5')).toBeNull();
  });
});

describe('quick amounts', () => {
  it('offers the bill rounded up to the notes people carry (SRD)', () => {
    expect(roundUpAmounts(184_700, 'SRD')).toEqual([185_000, 186_000, 190_000, 200_000]);
  });

  it('offers dollar notes in USD', () => {
    expect(roundUpAmounts(1_847, 'USD')).toEqual([1_900, 2_000]);
  });

  it('drops amounts that are more than double the bill', () => {
    expect(roundUpAmounts(300, 'SRD')).toEqual([500]);
  });

  it('offers nothing for a zero bill, and nothing exact (that is its own button)', () => {
    expect(roundUpAmounts(0, 'SRD')).toEqual([]);
    expect(roundUpAmounts(10_000, 'SRD')).not.toContain(10_000);
  });
});

describe('what Pay will do', () => {
  const base = {
    dueCents: 184_700,
    receivedCents: null,
    onAccount: false,
    isCashWallet: true,
    hasCustomer: false,
    hasWallet: true,
  };

  it('takes the exact amount when nothing was typed', () => {
    expect(planSettlement(base)).toEqual({
      kind: 'full',
      paidNowCents: 184_700,
      changeCents: 0,
      balanceCents: 0,
    });
  });

  it('gives change on a cash payment of more than the bill', () => {
    const plan = planSettlement({ ...base, receivedCents: 200_000 });
    expect(plan).toMatchObject({ kind: 'full', paidNowCents: 184_700, changeCents: 15_300 });
  });

  it('gives no change on a bank or card payment: it books the bill, not the overpayment', () => {
    const plan = planSettlement({ ...base, receivedCents: 200_000, isCashWallet: false });
    expect(plan).toMatchObject({ kind: 'full', paidNowCents: 184_700, changeCents: 0 });
  });

  it('records a part payment for a named customer and leaves the balance', () => {
    const plan = planSettlement({ ...base, receivedCents: 100_000, hasCustomer: true });
    expect(plan).toEqual({
      kind: 'partial',
      paidNowCents: 100_000,
      changeCents: 0,
      balanceCents: 84_700,
    });
  });

  it('refuses a balance on a walk-in sale', () => {
    const plan = planSettlement({ ...base, receivedCents: 100_000 });
    expect(plan.kind).toBe('blocked');
  });

  it('puts a sale on account for a named customer with nothing paid', () => {
    const plan = planSettlement({
      ...base,
      onAccount: true,
      hasCustomer: true,
      hasWallet: false,
    });
    expect(plan).toEqual({
      kind: 'credit',
      paidNowCents: 0,
      changeCents: 0,
      balanceCents: 184_700,
    });
  });

  it('refuses account sales for a walk-in', () => {
    expect(planSettlement({ ...base, onAccount: true }).kind).toBe('blocked');
  });

  it('turns an on-account sale that was paid in full into a normal paid sale', () => {
    const plan = planSettlement({
      ...base,
      onAccount: true,
      hasCustomer: true,
      receivedCents: 184_700,
    });
    expect(plan.kind).toBe('full');
  });

  it('needs a wallet whenever money is taken', () => {
    expect(planSettlement({ ...base, hasWallet: false }).kind).toBe('blocked');
  });

  it('refuses a zero amount received unless the sale is on account', () => {
    expect(planSettlement({ ...base, receivedCents: 0 }).kind).toBe('blocked');
  });

  it('refuses to charge nothing', () => {
    expect(planSettlement({ ...base, dueCents: 0 }).kind).toBe('blocked');
  });
});

describe('wallets', () => {
  const wallets = [
    { id: '1', name: 'USD bank', currency: 'USD' as const, kind: 'bank_transfer' },
    { id: '2', name: 'SRD card', currency: 'SRD' as const, kind: 'card' },
    { id: '3', name: 'SRD cash', currency: 'SRD' as const, kind: 'cash' },
    { id: '4', name: 'SRD bank', currency: 'SRD' as const, kind: 'bank_transfer' },
  ];

  it('lists only wallets of the sale currency, cash first', () => {
    expect(walletsFor(wallets, 'SRD').map((wallet) => wallet.id)).toEqual(['3', '4', '2']);
    expect(walletsFor(wallets, 'USD').map((wallet) => wallet.id)).toEqual(['1']);
  });

  it('maps a wallet kind to a payment method the sale schema accepts', () => {
    expect(methodForWallet('cash')).toBe('cash');
    expect(methodForWallet('bank_transfer')).toBe('bank_transfer');
    expect(methodForWallet('card')).toBe('card');
    expect(methodForWallet('mobile money')).toBe('other');
  });
});
