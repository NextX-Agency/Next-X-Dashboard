'use client';

import { ArrowRightLeft, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { CreateQuoteDialog } from '@/components/forms/create-quote-dialog';
import { ConvertQuoteDialog } from '@/components/forms/quote-convert-dialog';
import { QuoteRequestSheet } from '@/components/forms/quote-request-sheet';
import { Item, Menu } from '@/components/ui/dropdown-menu';
import type { QuoteRequestStatus } from '@/lib/schemas';
import { setQuoteRequestStatus } from '@/server/actions/quotes';
import type { QuoteProductOption, QuoteVariantOption } from '@/server/queries/quotes';

/**
 * Per-row actions for a quote request (F-5).
 *
 * Status flips are one click with no prompt — they post nothing and are
 * trivially reversible, so a dialog would just train people to click through
 * it. Conversion is the only heavy action and gets its own sheet, because it
 * creates two records and a customer out of a visitor's message.
 */
export function QuoteRequestActions({
  id,
  name,
  quantity,
  contact,
  productId,
  details,
  status,
  variants,
  products,
}: {
  id: string;
  name: string;
  contact: string;
  productId: string | null;
  quantity: number;
  details: string | null;
  status: QuoteRequestStatus;
  variants: QuoteVariantOption[];
  products: QuoteProductOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Rendered beside the menu, not inside it: menu content unmounts as soon as the menu closes.
  const [dialog, setDialog] = useState<'create' | 'convert' | null>(null);

  const statusAction = useAction(setQuoteRequestStatus, {
    onSuccess({ data }) {
      toast.success(`${data?.name}'s request updated`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update the request'),
  });

  return (
    <>
      <Menu>
        {status !== 'converted' && status !== 'archived' ? (
          <Item onSelect={() => setEditing(true)}>Edit request</Item>
        ) : null}
        {status === 'new' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'contacted' })}>
            Mark contacted
          </Item>
        ) : null}
        {status !== 'converted' && status !== 'archived' ? (
          <Item onSelect={() => setDialog('create')}>
            <FileText className="size-3.5" /> Create quote
          </Item>
        ) : null}
        {status === 'contacted' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'new' })}>Back to new</Item>
        ) : null}
        {status === 'declined' ? (
          <Item onSelect={() => setDialog('convert')}>
            <ArrowRightLeft className="size-3.5" /> Convert to sale
          </Item>
        ) : null}
        {status !== 'converted' && status !== 'declined' && status !== 'archived' ? (
          <Item danger onSelect={() => statusAction.execute({ id, status: 'declined' })}>
            Decline
          </Item>
        ) : null}
        {status === 'archived' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'new' })}>
            Restore request
          </Item>
        ) : (
          <Item danger onSelect={() => statusAction.execute({ id, status: 'archived' })}>
            Archive request
          </Item>
        )}
      </Menu>
      {dialog === 'create' ? (
        <CreateQuoteDialog
          requestId={id}
          requesterName={name}
          quantity={quantity}
          variants={variants}
          open
          onOpenChange={(next) => setDialog(next ? 'create' : null)}
        />
      ) : null}
      {dialog === 'convert' ? (
        <ConvertQuoteDialog
          requestId={id}
          requesterName={name}
          quantity={quantity}
          variants={variants}
          open
          onOpenChange={(next) => setDialog(next ? 'convert' : null)}
        />
      ) : null}
      <QuoteRequestSheet
        initial={{ id, name, contact, productId, quantity, details }}
        products={products}
        open={editing}
        onOpenChange={setEditing}
      />
    </>
  );
}
