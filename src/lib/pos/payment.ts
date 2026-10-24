import { type Cents, type CurrencyCode, parseMoney } from '@/lib/money';

/**
 * Taking the money: how much was handed over, what is given back, what stays owing.
 *
 * Pure rules so the pay panel and the tests agree. The server books the sale with a payment of
 * `paidNowCents` (and the rest as a balance owed); change is never booked, it is only the cashier's
 * arithmetic, so it cannot drift from the ledger.
 */

/** Notes and coins that are likely to be handed over, smallest first. */
const DENOMINATIONS: Record<CurrencyCode, number[]> = {
  // Surinamese banknotes: 5, 10, 20, 50, 100, 200 and 500 SRD.
  SRD: [5, 10, 20, 50, 100, 200, 500],
  USD: [1, 5, 10, 20, 50, 100],
};

/**
 * Suggested "received" amounts above the amount due: the due amount rounded up to a note, for each
 * note. Duplicates are folded, amounts more than double the bill are dropped, and four are kept so
 * they fit on one row on a phone. "Exact" is a separate button on the panel.
 */
export function roundUpAmounts(dueCents: Cents, currency: CurrencyCode, max = 4): Cents[] {
  if (dueCents <= 0) return [];
  const found = new Set<Cents>();
  for (const note of DENOMINATIONS[currency]) {
    const unit = note * 100;
    const rounded = Math.ceil(dueCents / unit) * unit;
    if (rounded > dueCents) found.add(rounded);
  }
  const sorted = [...found].sort((a, b) => a - b);
  const sensible = sorted.filter((amount) => amount <= dueCents * 2);
  return (sensible.length > 0 ? sensible : sorted).slice(0, max);
}

export function changeDue(receivedCents: Cents, dueCents: Cents): Cents {
  return Math.max(0, receivedCents - dueCents);
}

/** What the cashier typed in "Received" as cents; null when empty or unreadable. */
export function parseReceived(value: string): Cents | null {
  if (value.trim() === '') return null;
  try {
    const cents = parseMoney(value);
    return cents >= 0 ? cents : null;
  } catch {
    return null;
  }
}

export type SettlePlan =
  | { kind: 'full'; paidNowCents: Cents; changeCents: Cents; balanceCents: 0 }
  | { kind: 'partial'; paidNowCents: Cents; changeCents: 0; balanceCents: Cents }
  | { kind: 'credit'; paidNowCents: 0; changeCents: 0; balanceCents: Cents }
  | { kind: 'blocked'; reason: string };

/**
 * What pressing "Pay" will do.
 *
 *   received empty or at least the total  ->  paid in full (change when the wallet is cash)
 *   received between 0 and the total      ->  a part payment, the balance stays owed
 *   "on account"                          ->  nothing paid now, the whole total stays owed
 *
 * Leaving a balance needs a named customer: an unpaid walk-in sale is a debt nobody can collect.
 */
export function planSettlement(input: {
  dueCents: Cents;
  /** Null: not typed, which means the exact amount. */
  receivedCents: Cents | null;
  onAccount: boolean;
  isCashWallet: boolean;
  hasCustomer: boolean;
  hasWallet: boolean;
}): SettlePlan {
  const { dueCents, receivedCents, onAccount, isCashWallet, hasCustomer, hasWallet } = input;
  if (dueCents <= 0) return { kind: 'blocked', reason: 'There is nothing to charge.' };

  if (onAccount) {
    if (!hasCustomer) {
      return { kind: 'blocked', reason: 'Choose a customer to put a sale on account.' };
    }
    const paid = Math.min(receivedCents ?? 0, dueCents);
    if (paid >= dueCents) {
      if (!hasWallet) return { kind: 'blocked', reason: 'Choose where the money goes.' };
      return { kind: 'full', paidNowCents: dueCents, changeCents: 0, balanceCents: 0 };
    }
    if (paid > 0 && !hasWallet) {
      return { kind: 'blocked', reason: 'Choose where the money goes.' };
    }
    return paid > 0
      ? { kind: 'partial', paidNowCents: paid, changeCents: 0, balanceCents: dueCents - paid }
      : { kind: 'credit', paidNowCents: 0, changeCents: 0, balanceCents: dueCents };
  }

  if (!hasWallet) return { kind: 'blocked', reason: 'Choose where the money goes.' };

  const received = receivedCents ?? dueCents;
  if (received >= dueCents) {
    return {
      kind: 'full',
      paidNowCents: dueCents,
      changeCents: isCashWallet ? changeDue(received, dueCents) : 0,
      balanceCents: 0,
    };
  }
  if (received <= 0) {
    return {
      kind: 'blocked',
      reason: 'Enter the amount received, or put the sale on account.',
    };
  }
  if (!hasCustomer) {
    return {
      kind: 'blocked',
      reason: 'Less than the total was received. Choose a customer to leave a balance.',
    };
  }
  return {
    kind: 'partial',
    paidNowCents: received,
    changeCents: 0,
    balanceCents: dueCents - received,
  };
}

export type WalletLike = { id: string; name: string; currency: CurrencyCode; kind: string };

/** Wallets that can take this sale's money, cash first. */
export function walletsFor<T extends WalletLike>(
  wallets: readonly T[],
  currency: CurrencyCode,
): T[] {
  const order = (kind: string) => (kind === 'cash' ? 0 : kind === 'bank_transfer' ? 1 : 2);
  return wallets
    .filter((wallet) => wallet.currency === currency)
    .map((wallet, index) => ({ wallet, index }))
    .sort((a, b) => order(a.wallet.kind) - order(b.wallet.kind) || a.index - b.index)
    .map((entry) => entry.wallet);
}

/** The payment method the sale schema wants, taken from the wallet's kind. */
export function methodForWallet(kind: string): 'cash' | 'bank_transfer' | 'card' | 'other' {
  return kind === 'cash' || kind === 'bank_transfer' || kind === 'card' ? kind : 'other';
}

export const WALLET_KIND_LABEL: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank',
  card: 'Card',
  other: 'Other',
};
