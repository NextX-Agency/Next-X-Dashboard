'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Item, Menu } from '@/components/ui/dropdown-menu';
import type { CurrencyCode } from '@/lib/money';
import { balanceCentsOf } from '@/lib/payment-status';
import {
  cancelOrder,
  completeOrder,
  confirmOrder,
  markOrderReady,
} from '@/server/actions/orders';
import { RecordPaymentSheet } from './row-actions';

export function OrderActions({
  id,
  number,
  status,
  totalCents,
  paidCents,
  currency,
}: {
  id: string;
  number: string;
  status: 'draft' | 'confirmed' | 'ready' | 'completed' | 'cancelled';
  totalCents: number;
  paidCents: number;
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const confirm = useAction(confirmOrder, {
    onSuccess: ({ data }) => {
      toast.success(`${data?.number} confirmed`, { description: 'Stock is reserved.' });
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not confirm the order'),
  });
  const ready = useAction(markOrderReady, {
    onSuccess: ({ data }) => {
      toast.success(`${data?.number} marked ready`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not mark the order ready'),
  });
  const complete = useAction(completeOrder, {
    onSuccess: ({ data }) => {
      toast.success(`${data?.number} completed`, { description: 'Stock left inventory.' });
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not complete the order'),
  });
  const cancel = useAction(cancelOrder, {
    onSuccess: ({ data }) => {
      toast.success(`${data?.number} cancelled`);
      setCancelling(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not cancel the order'),
  });

  if (status === 'cancelled') return null;
  const balance = balanceCentsOf(totalCents, paidCents);
  return (
    <>
      <Menu>
        {status === 'draft' ? (
          <Item onSelect={() => confirm.execute({ id })}>Confirm and reserve stock</Item>
        ) : null}
        {status === 'confirmed' ? (
          <Item onSelect={() => ready.execute({ id })}>Mark ready</Item>
        ) : null}
        {status === 'confirmed' || status === 'ready' ? (
          <Item onSelect={() => complete.execute({ id })}>Complete order</Item>
        ) : null}
        {balance > 0 && status !== 'draft' && status !== 'completed' ? (
          <Item onSelect={() => setPaying(true)}>Record payment</Item>
        ) : null}
        {status !== 'completed' ? (
          <Item danger onSelect={() => setCancelling(true)}>
            Cancel order
          </Item>
        ) : null}
      </Menu>
      {balance > 0 && status !== 'draft' && status !== 'completed' ? (
        <RecordPaymentSheet
          open={paying}
          onOpenChange={setPaying}
          saleId={id}
          number={number}
          currency={currency}
          balanceCents={balance}
        />
      ) : null}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${number}?`}
        description="The order stays on the books and any active stock reservations are released."
        confirmLabel="Cancel order"
        pending={cancel.isPending}
        onConfirm={() => cancel.execute({ id })}
      />
    </>
  );
}
