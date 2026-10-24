'use client';

import { ArrowLeftRight, Plus } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { businessDateInput } from '@/lib/business-date';
import {
  createWallet,
  transferBetweenWallets,
  updateWallet,
} from '@/server/actions/finance-core';
import type { WalletRow } from '@/server/queries/finance';

export function WalletSheet() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('cash');
  const [currency, setCurrency] = useState<'USD' | 'SRD'>('USD');
  const [notes, setNotes] = useState('');
  const formId = useId();
  const action = useAction(createWallet, {
    onSuccess({ data }) {
      toast.success(`${data?.name} created`);
      setOpen(false);
      setName('');
      setNotes('');
      window.location.reload();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create wallet'),
  });

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New wallet
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="New wallet"
        description="A wallet is a real place money sits. Its balance is derived from the finance ledger."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={action.isPending}>
              Create wallet
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            action.execute({
              name,
              kind: kind as 'cash' | 'bank_transfer' | 'card' | 'other',
              currency,
              notes: notes || undefined,
            });
          }}
        >
          <SheetSection title="Wallet">
            <Field label="Name" htmlFor={`${formId}-name`} required>
              <Input
                id={`${formId}-name`}
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
                placeholder="Shop cash"
              />
            </Field>
            <FieldRow>
              <Field label="Type" htmlFor={`${formId}-kind`}>
                <Select
                  id={`${formId}-kind`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Currency" htmlFor={`${formId}-currency`}>
                <Select
                  id={`${formId}-currency`}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'USD' | 'SRD')}
                >
                  <option value="USD">USD</option>
                  <option value="SRD">SRD</option>
                </Select>
              </Field>
            </FieldRow>
            <Field label="Notes" htmlFor={`${formId}-notes`}>
              <Textarea
                id={`${formId}-notes`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

export function WalletTransferSheet({ wallets }: { wallets: WalletRow[] }) {
  const [open, setOpen] = useState(false);
  const [sourceWalletId, setSourceWalletId] = useState(
    wallets.find((wallet) => wallet.active)?.id ?? '',
  );
  const [destinationWalletId, setDestinationWalletId] = useState('');
  const [amountCents, setAmountCents] = useState('');
  const [occurredAt, setOccurredAt] = useState(businessDateInput());
  const [note, setNote] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>();
  const formId = useId();
  const action = useAction(transferBetweenWallets, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success('Wallet transfer posted');
      setOpen(false);
      setIdempotencyKey(undefined);
      window.location.reload();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not transfer funds'),
  });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="size-4" /> Transfer
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Transfer between wallets"
        description="Only same-currency transfers are allowed. The source wallet must have enough derived balance."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={action.isPending}>
              Post transfer
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            const key = idempotencyKey ?? crypto.randomUUID();
            setIdempotencyKey(key);
            action.execute({
              sourceWalletId,
              destinationWalletId,
              amountCents,
              occurredAt,
              idempotencyKey: key,
              note: note || undefined,
            });
          }}
        >
          <SheetSection title="Movement">
            <FieldRow>
              <Field label="From" htmlFor={`${formId}-source`} required>
                <Select
                  id={`${formId}-source`}
                  value={sourceWalletId}
                  onChange={(e) => setSourceWalletId(e.target.value)}
                >
                  <option value="">Choose wallet</option>
                  {wallets
                    .filter((wallet) => wallet.active)
                    .map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name} · {wallet.currency}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="To" htmlFor={`${formId}-destination`} required>
                <Select
                  id={`${formId}-destination`}
                  value={destinationWalletId}
                  onChange={(e) => setDestinationWalletId(e.target.value)}
                >
                  <option value="">Choose wallet</option>
                  {wallets
                    .filter((wallet) => wallet.active)
                    .map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name} · {wallet.currency}
                      </option>
                    ))}
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Amount" htmlFor={`${formId}-amount`} required>
                <Input
                  id={`${formId}-amount`}
                  numeric
                  inputMode="decimal"
                  value={amountCents}
                  required
                  onChange={(e) => setAmountCents(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Date" htmlFor={`${formId}-date`} required>
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={occurredAt}
                  required
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </Field>
            </FieldRow>
            <Field label="Note" htmlFor={`${formId}-note`}>
              <Input
                id={`${formId}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Move cash to bank"
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

export function WalletActions({ wallet }: { wallet: WalletRow }) {
  const action = useAction(updateWallet, {
    onSuccess() {
      toast.success(wallet.active ? 'Wallet deactivated' : 'Wallet activated');
      window.location.reload();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update wallet'),
  });
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={action.isPending}
      onClick={() =>
        action.execute({
          id: wallet.id,
          name: wallet.name,
          kind: wallet.kind as 'cash' | 'bank_transfer' | 'card' | 'other',
          currency: wallet.currency,
          locationId: wallet.locationId,
          active: !wallet.active,
        })
      }
    >
      {wallet.active ? 'Deactivate' : 'Activate'}
    </Button>
  );
}
