/**
 * Money going out of a wallet that does not hold enough.
 *
 * A wallet balance is derived from the ledger, and nothing stops an expense or a refund from taking
 * it below zero: refusing would make people skip the entry, and the cash did leave. So it is a
 * warning, shown before the entry is saved and repeated after, because a negative cash or bank
 * balance almost always means money is missing from the books or was entered into the wrong wallet.
 * Pure so the form and the tests share it.
 */

export type WalletBalance = {
  id: string;
  name: string;
  kind: string;
  currency: 'USD' | 'SRD';
  balanceCents: number;
};

export type WalletShortfall = {
  walletId: string;
  walletName: string;
  currency: 'USD' | 'SRD';
  balanceCents: number;
  /** What the balance would be after the payment (negative). */
  afterCents: number;
};

/**
 * The wallet a payment lands in when none is chosen. Mirrors `defaultWalletFor` on the server: an
 * active wallet of this currency and kind, else the first active wallet of the currency. Callers pass
 * the wallets in the same order the server tries them (oldest first).
 */
export function pickDefaultWallet<T extends WalletBalance>(
  wallets: readonly T[],
  input: { currency: 'USD' | 'SRD'; method: string },
): T | null {
  const sameCurrency = wallets.filter((wallet) => wallet.currency === input.currency);
  return sameCurrency.find((wallet) => wallet.kind === input.method) ?? sameCurrency[0] ?? null;
}

/** Kinds of wallet that hold real money that must exist: a negative balance there is a red flag. */
export const WARN_NEGATIVE_WALLET_KINDS: readonly string[] = ['cash', 'bank_transfer'];

/** A shortfall when paying `outCents` from this cash or bank wallet would take it below zero, else null. */
export function walletShortfall(
  wallet: WalletBalance | null,
  outCents: number,
): WalletShortfall | null {
  if (!wallet || !WARN_NEGATIVE_WALLET_KINDS.includes(wallet.kind)) return null;
  if (!Number.isFinite(outCents) || outCents <= 0) return null;
  const afterCents = wallet.balanceCents - outCents;
  if (afterCents >= 0) return null;
  return {
    walletId: wallet.id,
    walletName: wallet.name,
    currency: wallet.currency,
    balanceCents: wallet.balanceCents,
    afterCents,
  };
}
