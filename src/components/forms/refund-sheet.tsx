'use client';

import { Banknote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Cents, CurrencyCode } from '@/lib/money';
import { formatMoney, parseMoney, toDecimalString } from '@/lib/money';
import { pickDefaultWallet, walletShortfall } from '@/lib/wallet-rules';
import { refundSale } from '@/server/actions/sales';
import type { WalletBalanceChoice } from '@/server/queries/pickers';

/**
 * Pay out money after a return or other approved credit. This is separate from
 * ReturnSheet by design: restocking goods must not silently post a cash out.
 */
export function RefundSheet({
  saleId,
  number,
  currency,
  refundableCents,
  wallets = [],
}: {
  saleId: string;
  number: string;
  currency: CurrencyCode;
  refundableCents: Cents;
  /** Active wallets with balances, so a refund that would overdraw one can say so first. */
  wallets?: WalletBalanceChoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(toDecimalString(refundableCents, currency));
  const [method, setMethod] = useState('cash');
  const [refundedAt, setRefundedAt] = useState('');
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>();
  const formId = useId();

  let parsed: Cents = 0;
  try {
    parsed = parseMoney(amount || '0');
  } catch {
    parsed = 0;
  }
  if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;

  // The wallet the server will pay from (same rule as `defaultWalletFor`), and whether this refund
  // would take it below zero. A warning only: the money has to go back to the customer.
  const shortfall = walletShortfall(
    pickDefaultWallet(wallets, { currency, method }),
    Math.min(parsed, refundableCents),
  );

  const action = useAction(refundSale, {
    onSuccess({ data }) {
      if (!data) return;
      if (data.walletWarning) {
        toast.warning(
          `${data.walletWarning.walletName} is now ${formatMoney(data.walletWarning.balanceCents, data.walletWarning.currency)}`,
          {
            description:
              'The refund is recorded, but that wallet is below zero. Check that the money is in the right wallet and that no receipt is missing.',
            duration: 12_000,
          },
        );
      }
      toast.success(
        `${formatMoney(data.amountCents, data.currency)} refunded from ${data.number}`,
        {
          description:
            data.refundableCents > 0
              ? `${formatMoney(data.refundableCents, data.currency)} remains refundable.`
              : 'The received balance has been fully refunded.',
        },
      );
      setOpen(false);
      setReason('');
      setIdempotencyKey(undefined);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not record the refund');
    },
  });

  if (refundableCents <= 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          // Re-read the refundable balance every time: after a partial refund
          // the sheet used to open with the amount from the previous visit.
          setAmount(toDecimalString(refundableCents, currency));
          setOpen(true);
        }}
      >
        <Banknote className="size-3.5" /> Refund payment
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Refund ${number}`}
        description={`Up to ${formatMoney(refundableCents, currency)} has been received and can be refunded. This action posts the cash out to the ledger.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              form={formId}
              variant="danger"
              pending={action.isPending}
              disabled={parsed <= 0}
            >
              Record refund
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (action.isPending) return;
            if (parsed <= 0 || parsed > refundableCents) {
              toast.error(
                `Enter an amount between 0.01 and ${formatMoney(refundableCents, currency)}`,
              );
              return;
            }
            const key = idempotencyKey ?? crypto.randomUUID();
            setIdempotencyKey(key);
            action.execute({
              saleId,
              amountCents: amount,
              paymentMethod: method as 'cash',
              refundedAt: refundedAt || undefined,
              reason,
              idempotencyKey: key,
            });
          }}
        >
          <SheetSection title="Refund">
            {shortfall ? (
              <p
                role="alert"
                className="rounded-control border border-warning/40 bg-warning-muted p-2.5 text-[12px] text-warning"
              >
                {shortfall.walletName} holds{' '}
                {formatMoney(shortfall.balanceCents, shortfall.currency)}. This refund would
                take it to {formatMoney(shortfall.afterCents, shortfall.currency)}. You can
                still record it, but check that the money is in the right wallet and that no
                earlier receipt is missing.
              </p>
            ) : null}
            <Field label={`Amount (${currency})`} htmlFor={`${formId}-amount`} required>
              <Input
                id={`${formId}-amount`}
                numeric
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Method" htmlFor={`${formId}-method`}>
                <Select
                  id={`${formId}-method`}
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Date refunded" htmlFor={`${formId}-date`} hint="Empty means today">
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={refundedAt}
                  onChange={(event) => setRefundedAt(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Reason" htmlFor={`${formId}-reason`} required>
              <Textarea
                id={`${formId}-reason`}
                value={reason}
                required
                minLength={3}
                placeholder="Customer returned the item and was paid back"
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
