'use client';

import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  Wallet,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { type CurrencyCode, toDecimalString } from '@/lib/money';
import type { SaleError } from '@/lib/pos/errors';
import { formatPos } from '@/lib/pos/format';
import { roundUpAmounts, type SettlePlan, WALLET_KIND_LABEL } from '@/lib/pos/payment';
import type { PosCustomer } from '@/lib/pos/types';

const KIND_ICON: Record<string, typeof Wallet> = {
  cash: Banknote,
  bank_transfer: Landmark,
  card: CreditCard,
};

export type PayWallet = { id: string; name: string; kind: string };

/**
 * Taking the money. One screen, in the order a cashier thinks: how much, where it goes, what was
 * handed over, what comes back. The button says exactly what will be recorded, so a part payment or a
 * sale on account is never a surprise.
 */
export function PayView({
  currency,
  dueCents,
  customer,
  wallets,
  walletId,
  received,
  onAccount,
  plan,
  busy,
  online,
  canWrite,
  error,
  unconfirmedNote,
  ownerCanOverride,
  onWallet,
  onReceived,
  onAccountChange,
  onBack,
  onPay,
  onPayOverride,
}: {
  currency: CurrencyCode;
  dueCents: number;
  customer: PosCustomer | null;
  wallets: PayWallet[];
  walletId: string | null;
  received: string;
  onAccount: boolean;
  plan: SettlePlan;
  busy: boolean;
  online: boolean;
  canWrite: boolean;
  error: SaleError | null;
  unconfirmedNote: string | null;
  ownerCanOverride: boolean;
  onWallet: (id: string) => void;
  onReceived: (value: string) => void;
  onAccountChange: (value: boolean) => void;
  onBack: () => void;
  onPay: () => void;
  onPayOverride: () => void;
}) {
  const wallet = wallets.find((candidate) => candidate.id === walletId) ?? null;
  const isCash = wallet?.kind === 'cash';
  const showReceived = isCash || onAccount;
  const quick = isCash && !onAccount ? roundUpAmounts(dueCents, currency) : [];
  const blocked = plan.kind === 'blocked';
  const disabled = busy || !online || !canWrite || blocked;

  const label =
    plan.kind === 'full'
      ? `Pay ${formatPos(plan.paidNowCents, currency)} and record`
      : plan.kind === 'partial'
        ? `Record ${formatPos(plan.paidNowCents, currency)} now, ${formatPos(plan.balanceCents, currency)} owed`
        : plan.kind === 'credit'
          ? `Record on account, ${formatPos(plan.balanceCents, currency)} owed`
          : 'Pay and record';

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onPay();
      }}
    >
      <header className="relative flex shrink-0 items-center gap-1 border-line-subtle border-b px-2 pt-3 pb-2 lg:pt-2">
        <span
          aria-hidden="true"
          className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong/60 lg:hidden"
        />
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft aria-hidden="true" /> Cart
        </Button>
        <h2 className="font-medium text-[16px] text-ink">Payment</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="rounded-card border border-line-subtle bg-inset p-3 text-center">
          <p className="text-[12px] text-ink-3 uppercase tracking-[0.08em]">Amount due</p>
          <p className="tabular font-bold text-[34px] text-ink leading-10">
            {formatPos(dueCents, currency)}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {customer ? customer.name : 'Walk-in customer'}
          </p>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[12px] text-ink-3 uppercase tracking-[0.08em]">
            Money goes to
          </legend>
          {wallets.length === 0 ? (
            <p
              role="alert"
              className="rounded-control border border-warning/40 bg-warning-muted p-3 text-[13px] text-warning"
            >
              There is no active {currency} wallet. Add one under Wallets, or switch the
              currency.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {wallets.map((candidate) => {
                const Icon = KIND_ICON[candidate.kind] ?? Wallet;
                const selected = candidate.id === walletId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onWallet(candidate.id)}
                    className={cn(
                      'flex min-h-14 items-center gap-2.5 rounded-control border px-3 text-left transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                      selected
                        ? 'border-accent bg-accent-muted text-ink'
                        : 'border-line bg-raised text-ink-2 hover:border-line-strong',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[14px]">
                        {candidate.name}
                      </span>
                      <span className="block text-[11px] text-ink-3">
                        {WALLET_KIND_LABEL[candidate.kind] ?? 'Other'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        {showReceived ? (
          <div className="mt-4">
            <label
              htmlFor="pos-received"
              className="mb-1.5 block text-[12px] text-ink-3 uppercase tracking-[0.08em]"
            >
              {onAccount ? 'Paid now (optional)' : 'Received'}
            </label>
            <input
              id="pos-received"
              inputMode="decimal"
              autoComplete="off"
              placeholder={onAccount ? '0' : toDecimalString(dueCents)}
              value={received}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => onReceived(event.target.value)}
              className="tabular h-14 w-full min-w-0 rounded-control border border-line bg-raised px-3 text-right text-[22px] text-ink outline-none placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
            {quick.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <QuickButton
                  active={received === ''}
                  onClick={() => onReceived('')}
                  label={`Exact ${formatPos(dueCents, currency)}`}
                >
                  Exact
                </QuickButton>
                {quick.map((cents) => (
                  <QuickButton
                    key={cents}
                    active={received === String(cents / 100)}
                    onClick={() => onReceived(String(cents / 100))}
                    label={`Hand over ${formatPos(cents, currency)}`}
                  >
                    {formatPos(cents, currency)}
                  </QuickButton>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {plan.kind === 'full' && plan.changeCents > 0 ? (
          <div
            aria-live="polite"
            className="mt-4 rounded-card border border-positive/40 bg-positive-muted p-3 text-center"
          >
            <p className="text-[12px] text-positive uppercase tracking-[0.08em]">
              Change to give
            </p>
            <p className="tabular font-bold text-[30px] text-positive leading-9">
              {formatPos(plan.changeCents, currency)}
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-line bg-raised px-3">
            <input
              type="checkbox"
              checked={onAccount}
              disabled={!customer}
              onChange={(event) => onAccountChange(event.target.checked)}
              className="size-5 accent-[var(--nx-accent)]"
            />
            <span className="min-w-0">
              <span className="block font-medium text-[14px] text-ink">
                Customer pays later
              </span>
              <span className="block text-[12px] text-ink-3">
                {customer
                  ? 'Leave a balance on account'
                  : 'Choose a customer in the cart to sell on account'}
              </span>
            </span>
          </label>
        </div>

        {plan.kind === 'partial' || plan.kind === 'credit' ? (
          <p className="tabular mt-3 text-center text-[13px] text-ink-2">
            Paid now {formatPos(plan.paidNowCents, currency)} · Balance{' '}
            <strong className="text-ink">{formatPos(plan.balanceCents, currency)}</strong>
          </p>
        ) : null}

        {plan.kind === 'blocked' ? (
          <p className="mt-3 text-center text-[13px] text-ink-3">{plan.reason}</p>
        ) : null}

        {unconfirmedNote ? (
          <p
            role="alert"
            className="mt-3 rounded-control border border-warning/40 bg-warning-muted p-3 text-[13px] text-warning"
          >
            {unconfirmedNote}
          </p>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-control border border-negative/40 bg-negative-muted p-3 text-[13px] text-negative"
          >
            <p className="font-medium">{error.message}</p>
            {error.hint ? <p className="mt-1">{error.hint}</p> : null}
            {error.kind === 'reserved' && ownerCanOverride ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-2"
                disabled={busy || !online}
                onClick={onPayOverride}
              >
                Sell it anyway (owner)
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-line-subtle border-t bg-raised px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {!online ? (
          <p role="status" className="mb-2 flex items-center gap-1.5 text-[13px] text-warning">
            <WifiOff aria-hidden="true" className="size-4" /> Offline. Reconnect to pay. The
            cart is kept on this device.
          </p>
        ) : null}
        {!canWrite ? (
          <p role="status" className="mb-2 text-[13px] text-warning">
            This account is read only, so it cannot record sales.
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          disabled={disabled}
          className="h-14 w-full text-[16px] max-sm:h-14"
        >
          {busy ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : null}
          {busy ? 'Recording' : label}
        </Button>
        <p className="mt-1.5 hidden text-center text-[12px] text-ink-3 lg:block">
          Enter or Ctrl+Enter to record
        </p>
      </footer>
    </form>
  );
}

function QuickButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'tabular h-11 min-w-16 rounded-control border px-3 text-[14px] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active
          ? 'border-accent bg-accent-muted text-ink'
          : 'border-line bg-raised text-ink-2 hover:border-line-strong',
      )}
    >
      {children}
    </button>
  );
}
