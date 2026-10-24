'use client';

import { Plus } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { businessDateInput } from '@/lib/business-date';
import { completeReconciliation, createReconciliation } from '@/server/actions/finance-core';
import type { WalletRow } from '@/server/queries/finance';

export function ReconciliationSheet({ wallets }: { wallets: WalletRow[] }) {
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '');
  const [periodEnd, setPeriodEnd] = useState(businessDateInput());
  const [statementBalanceCents, setStatementBalanceCents] = useState('');
  const [notes, setNotes] = useState('');
  const formId = useId();
  const action = useAction(createReconciliation, {
    onSuccess({ data }) {
      toast.success(`Checkpoint saved${data ? ` · ledger ${data.ledgerBalanceCents}` : ''}`);
      setOpen(false);
      window.location.reload();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save reconciliation'),
  });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New checkpoint
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="New reconciliation"
        description="Record the statement balance. The difference against the derived ledger remains visible until investigated."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={action.isPending}>
              Save checkpoint
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            action.execute({
              walletId,
              periodEnd,
              statementBalanceCents,
              notes: notes || undefined,
            });
          }}
        >
          <SheetSection title="Statement">
            <Field label="Wallet" htmlFor={`${formId}-wallet`} required>
              <Select
                id={`${formId}-wallet`}
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
              >
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} · {wallet.currency}
                  </option>
                ))}
              </Select>
            </Field>
            <FieldRow>
              <Field label="Period end" htmlFor={`${formId}-date`} required>
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={periodEnd}
                  required
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </Field>
              <Field label="Statement balance" htmlFor={`${formId}-amount`} required>
                <Input
                  id={`${formId}-amount`}
                  numeric
                  inputMode="decimal"
                  value={statementBalanceCents}
                  required
                  placeholder="0.00"
                  onChange={(e) => setStatementBalanceCents(e.target.value)}
                />
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

export function ReconciliationActions({
  id,
  status,
}: {
  id: string;
  status: 'open' | 'completed';
}) {
  const action = useAction(completeReconciliation, {
    onSuccess() {
      toast.success('Reconciliation completed');
      window.location.reload();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not complete reconciliation'),
  });
  if (status === 'completed') return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={action.isPending}
      onClick={() => action.execute({ id })}
    >
      Complete
    </Button>
  );
}
