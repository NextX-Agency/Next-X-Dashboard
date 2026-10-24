'use client';

import { Plus, ReceiptText } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Money } from '@/components/ui/money';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { businessDateInput } from '@/lib/business-date';
import {
  createFinanceObligation,
  recordFinanceObligationPayment,
} from '@/server/actions/finance-core';
import type { FinanceObligationRow, WalletRow } from '@/server/queries/finance';

const today = () => businessDateInput();

export function FinanceObligationSheet() {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'receivable' | 'payable'>('payable');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'SRD'>('SRD');
  const [amount, setAmount] = useState('');
  const [issuedAt, setIssuedAt] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const formId = useId();
  const action = useAction(createFinanceObligation, {
    onSuccess() {
      toast.success('Obligation created');
      setOpen(false);
      setCounterpartyName('');
      setAmount('');
      setNotes('');
      window.location.reload();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create obligation'),
  });

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New obligation
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="New obligation"
        description="Track a bill or amount owed outside a sale or purchase order. Settlements post to a wallet ledger."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={action.isPending}>
              Save obligation
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            action.execute({
              direction,
              counterpartyName,
              currency,
              originalAmountCents: amount,
              issuedAt,
              dueDate: dueDate || null,
              notes: notes || undefined,
            });
          }}
        >
          <SheetSection title="Balance">
            <FieldRow>
              <Field label="Type" htmlFor={`${formId}-direction`}>
                <Select
                  id={`${formId}-direction`}
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as typeof direction)}
                >
                  <option value="payable">We owe</option>
                  <option value="receivable">Owed to us</option>
                </Select>
              </Field>
              <Field label="Currency" htmlFor={`${formId}-currency`}>
                <Select
                  id={`${formId}-currency`}
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as typeof currency)}
                >
                  <option value="SRD">SRD</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </FieldRow>
            <Field label="Counterparty" htmlFor={`${formId}-party`} required>
              <Input
                id={`${formId}-party`}
                value={counterpartyName}
                required
                maxLength={180}
                onChange={(event) => setCounterpartyName(event.target.value)}
              />
            </Field>
            <Field label="Original amount" htmlFor={`${formId}-amount`} required>
              <Input
                id={`${formId}-amount`}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amount}
                required
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <FieldRow>
              <Field label="Issued on" htmlFor={`${formId}-issued`} required>
                <Input
                  id={`${formId}-issued`}
                  type="date"
                  value={issuedAt}
                  required
                  onChange={(event) => setIssuedAt(event.target.value)}
                />
              </Field>
              <Field label="Due date" htmlFor={`${formId}-due`}>
                <Input
                  id={`${formId}-due`}
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            </FieldRow>
            <Field label="Notes" htmlFor={`${formId}-notes`}>
              <Textarea
                id={`${formId}-notes`}
                value={notes}
                maxLength={2000}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

export function FinanceObligationPaymentSheet({
  obligation,
  wallets,
}: {
  obligation: FinanceObligationRow;
  wallets: WalletRow[];
}) {
  const candidates = wallets.filter(
    (wallet) => wallet.active && wallet.currency === obligation.currency,
  );
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState(candidates[0]?.id ?? '');
  const [amount, setAmount] = useState((obligation.outstandingCents / 100).toFixed(2));
  const [occurredAt, setOccurredAt] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'bank_transfer' | 'card' | 'other'
  >(
    candidates[0]?.kind === 'cash' ||
      candidates[0]?.kind === 'card' ||
      candidates[0]?.kind === 'bank_transfer'
      ? candidates[0].kind
      : 'other',
  );
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>();
  const formId = useId();
  const action = useAction(recordFinanceObligationPayment, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success(data.reused ? 'Settlement already recorded' : 'Settlement posted');
      setOpen(false);
      setIdempotencyKey(undefined);
      window.location.reload();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not post settlement'),
  });

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={candidates.length === 0}
        onClick={() => setOpen(true)}
      >
        <ReceiptText className="size-3.5" /> Settle
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={obligation.direction === 'receivable' ? 'Record receipt' : 'Record payment'}
        description={`${obligation.counterpartyName} · ${obligation.currency} outstanding`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={action.isPending}>
              Post settlement
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            const retryKey = idempotencyKey ?? crypto.randomUUID();
            setIdempotencyKey(retryKey);
            action.execute({
              obligationId: obligation.id,
              walletId,
              amountCents: amount,
              occurredAt,
              paymentMethod,
              idempotencyKey: retryKey,
              notes: notes || undefined,
            });
          }}
        >
          <SheetSection title="Settlement">
            <div className="flex items-center justify-between rounded-control border border-line-subtle bg-inset px-3 py-2 text-[12px]">
              <span className="text-ink-3">Still outstanding</span>
              <Money cents={obligation.outstandingCents} currency={obligation.currency} />
            </div>
            <Field label="Wallet" htmlFor={`${formId}-wallet`} required>
              <Select
                id={`${formId}-wallet`}
                value={walletId}
                required
                onChange={(event) => setWalletId(event.target.value)}
              >
                {candidates.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" htmlFor={`${formId}-amount`} required>
              <Input
                id={`${formId}-amount`}
                type="number"
                min="0.01"
                max={(obligation.outstandingCents / 100).toFixed(2)}
                step="0.01"
                inputMode="decimal"
                value={amount}
                required
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <FieldRow>
              <Field label="Date" htmlFor={`${formId}-date`} required>
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={occurredAt}
                  required
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </Field>
              <Field label="Method" htmlFor={`${formId}-method`}>
                <Select
                  id={`${formId}-method`}
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as typeof paymentMethod)
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </FieldRow>
            <Field label="Notes" htmlFor={`${formId}-notes`}>
              <Textarea
                id={`${formId}-notes`}
                value={notes}
                maxLength={2000}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

export function ObligationStatus({ status }: { status: FinanceObligationRow['status'] }) {
  const tone =
    status === 'paid'
      ? 'positive'
      : status === 'partial'
        ? 'warning'
        : status === 'cancelled'
          ? 'neutral'
          : 'accent';
  return <Badge tone={tone}>{status}</Badge>;
}
