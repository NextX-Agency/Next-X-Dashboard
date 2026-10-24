import { describe, expect, it } from 'vitest';
import { pickDefaultWallet, type WalletBalance, walletShortfall } from '@/lib/wallet-rules';

const wallets: WalletBalance[] = [
  {
    id: 'usd-bank',
    name: 'USD bank',
    kind: 'bank_transfer',
    currency: 'USD',
    balanceCents: 5_000,
  },
  { id: 'usd-cash', name: 'USD cash', kind: 'cash', currency: 'USD', balanceCents: 1_200 },
  { id: 'srd-cash', name: 'SRD cash', kind: 'cash', currency: 'SRD', balanceCents: 300 },
];

describe('pickDefaultWallet', () => {
  it('prefers the wallet of the same kind and currency', () => {
    expect(pickDefaultWallet(wallets, { currency: 'USD', method: 'cash' })?.id).toBe(
      'usd-cash',
    );
    expect(pickDefaultWallet(wallets, { currency: 'SRD', method: 'cash' })?.id).toBe(
      'srd-cash',
    );
  });

  it('falls back to the first wallet of the currency, like the server', () => {
    expect(pickDefaultWallet(wallets, { currency: 'USD', method: 'card' })?.id).toBe(
      'usd-bank',
    );
  });

  it('is null when no wallet holds the currency', () => {
    expect(
      pickDefaultWallet(wallets.slice(0, 2), { currency: 'SRD', method: 'cash' }),
    ).toBeNull();
  });
});

describe('walletShortfall', () => {
  const cash = wallets[1] as WalletBalance;

  it('is quiet while the wallet covers the payment, including to exactly zero', () => {
    expect(walletShortfall(cash, 1_000)).toBeNull();
    expect(walletShortfall(cash, 1_200)).toBeNull();
  });

  it('reports the balance before and after when it would go negative', () => {
    expect(walletShortfall(cash, 2_000)).toEqual({
      walletId: 'usd-cash',
      walletName: 'USD cash',
      currency: 'USD',
      balanceCents: 1_200,
      afterCents: -800,
    });
  });

  it('only warns for cash and bank wallets', () => {
    const card: WalletBalance = { ...cash, id: 'card', kind: 'card' };
    expect(walletShortfall(card, 9_999)).toBeNull();
    expect(walletShortfall({ ...cash, kind: 'bank_transfer' }, 9_999)).not.toBeNull();
  });

  it('ignores an unknown wallet and unusable amounts', () => {
    expect(walletShortfall(null, 5_000)).toBeNull();
    expect(walletShortfall(cash, 0)).toBeNull();
    expect(walletShortfall(cash, Number.NaN)).toBeNull();
  });
});
