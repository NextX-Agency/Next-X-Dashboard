'use client';

import { Copy, ExternalLink, Link2Off, Printer, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { createPublicInvoiceLink, revokePublicInvoiceLink } from '@/server/actions/invoices';

/**
 * The screen-only controls above a printable invoice. Hidden by `@media print`
 * (see globals.css), so they never land on the paper.
 *
 * Printing goes through the browser rather than a generated PDF: it needs no
 * dependency, respects the customer's own printer, and the print stylesheet is
 * the same one the on-screen document already uses.
 *
 * A link is created server-side with an unguessable token that expires and can
 * be revoked. Only its hash is stored, so a link cannot be shown twice:
 * creating another one replaces it, and the sender is asked before that
 * happens because whatever was already sent would stop working.
 */
export function InvoiceActions({
  saleId,
  number,
  whatsapp,
  totalText,
  canShare,
  linkActive,
  linkExpiresAt,
}: {
  saleId: string;
  number: string;
  whatsapp: string | null;
  totalText: string;
  canShare: boolean;
  linkActive: boolean;
  linkExpiresAt: string | null;
}) {
  const router = useRouter();
  const digits = whatsapp?.replace(/\D/g, '') ?? '';
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const share = useAction(createPublicInvoiceLink, {
    onSuccess: async ({ data }) => {
      if (!data) return;
      setPublicUrl(data.url);
      setReplacing(false);
      router.refresh();
      try {
        await navigator.clipboard.writeText(data.url);
        toast.success('Secure invoice link copied', {
          description: `Valid until ${formatDate(data.expiresAt)}.`,
        });
      } catch {
        toast.success('Secure invoice link created', {
          description: `Valid until ${formatDate(data.expiresAt)}.`,
        });
      }
      if (digits) {
        const message = `https://wa.me/${digits}?text=${encodeURIComponent(
          `Invoice ${number} — ${totalText}\n${data.url}`,
        )}`;
        window.open(message, '_blank', 'noopener,noreferrer');
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create invoice link'),
  });

  const revoke = useAction(revokePublicInvoiceLink, {
    onSuccess() {
      setPublicUrl(null);
      setRevoking(false);
      toast.success('Invoice link switched off');
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not revoke the link'),
  });

  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer />
        Print
      </Button>
      {canShare ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            linkActive || publicUrl ? setReplacing(true) : share.execute({ saleId })
          }
          disabled={share.isPending}
        >
          <Copy />{' '}
          {share.isPending
            ? 'Creating link…'
            : linkActive || publicUrl
              ? 'Replace share link'
              : 'Create share link'}
        </Button>
      ) : null}
      {canShare && (linkActive || publicUrl) ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setRevoking(true)}>
          <Link2Off /> Switch link off
        </Button>
      ) : null}
      {canShare && linkActive && linkExpiresAt && !publicUrl ? (
        <span className="text-[12px] text-ink-4">
          Link live until {formatDate(linkExpiresAt)}
        </span>
      ) : null}
      {publicUrl ? (
        <>
          <Button asChild variant="ghost" size="sm">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open public invoice
            </a>
          </Button>
          {digits ? (
            <Send className="size-4 text-positive" aria-label="WhatsApp link ready" />
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={replacing}
        onOpenChange={setReplacing}
        title="Replace the share link?"
        description="The link already sent to the customer stops working as soon as the new one is created. Only do this if you want to send a fresh link."
        confirmLabel="Replace link"
        pending={share.isPending}
        onConfirm={() => share.execute({ saleId })}
      />
      <ConfirmDialog
        open={revoking}
        onOpenChange={setRevoking}
        title="Switch the share link off?"
        description="Anyone holding the link will see 'not found' immediately. You can create a new link later."
        confirmLabel="Switch off"
        pending={revoke.isPending}
        onConfirm={() => revoke.execute({ saleId })}
      />
    </div>
  );
}
