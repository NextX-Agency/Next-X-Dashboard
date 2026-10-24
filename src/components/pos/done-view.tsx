'use client';

import { CheckCircle2, FileText, Loader2, MessageCircle, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { CurrencyCode } from '@/lib/money';
import { formatPos } from '@/lib/pos/format';

export type DoneSale = {
  id: string;
  number: string;
  currency: CurrencyCode;
  totalCents: number;
  paidCents: number;
  changeCents: number;
  balanceCents: number;
  /** Units sold beyond the recorded stock (the books show a shortfall to fix). */
  shortfall: number;
  customerName: string | null;
  walletName: string | null;
  whatsappUrl: string;
  invoiceUrl: string | null;
  /** The sale was a repeat of one already recorded; nothing was booked twice. */
  repeated: boolean;
  undone: boolean;
};

/**
 * The sale is in. What matters now: the change to hand back, a receipt for the customer, and a fast
 * way to ring up the next one. Undo stays within reach for a few minutes, with the time left spelled
 * out, because that is the moment a wrong item is noticed.
 */
export function DoneView({
  sale,
  undoMinutes,
  undoBusy,
  invoiceBusy,
  undoError,
  onUndo,
  onInvoice,
  onNew,
}: {
  sale: DoneSale;
  /** Minutes left to undo; 0 when the window has closed or this account may not undo. */
  undoMinutes: number;
  undoBusy: boolean;
  invoiceBusy: boolean;
  undoError: string | null;
  onUndo: () => void;
  onInvoice: () => void;
  onNew: () => void;
}) {
  const { currency } = sale;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 text-center">
        <CheckCircle2
          aria-hidden="true"
          className={cn('mx-auto size-12', sale.undone ? 'text-ink-4' : 'text-positive')}
        />
        <h2 className="mt-2 font-bold text-[20px] text-ink">
          {sale.undone
            ? `Sale ${sale.number} undone`
            : sale.repeated
              ? `Sale ${sale.number} was already recorded`
              : `Sale ${sale.number} recorded`}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {sale.customerName ?? 'Walk-in customer'}
          {sale.walletName ? ` · ${sale.walletName}` : ''}
        </p>

        {sale.undone ? (
          <p className="mt-4 text-[14px] text-ink-2">
            Stock is back and the payment was reversed. Nothing is left owing.
          </p>
        ) : (
          <>
            <p className="tabular mt-4 font-bold text-[34px] text-ink leading-10">
              {formatPos(sale.totalCents, currency)}
            </p>
            <p className="text-[12px] text-ink-3 uppercase tracking-[0.08em]">Total</p>

            {sale.changeCents > 0 ? (
              <div className="mx-auto mt-4 max-w-72 rounded-card border border-positive/40 bg-positive-muted p-3">
                <p className="text-[12px] text-positive uppercase tracking-[0.08em]">
                  Change to give
                </p>
                <p className="tabular font-bold text-[32px] text-positive leading-9">
                  {formatPos(sale.changeCents, currency)}
                </p>
              </div>
            ) : null}

            {sale.balanceCents > 0 ? (
              <p className="tabular mt-4 text-[14px] text-ink-2">
                Paid {formatPos(sale.paidCents, currency)} ·{' '}
                <strong className="text-ink">
                  {formatPos(sale.balanceCents, currency)} still owed
                </strong>
              </p>
            ) : null}

            {sale.shortfall > 0 ? (
              <p className="mx-auto mt-4 max-w-80 rounded-control border border-warning/40 bg-warning-muted p-2.5 text-[13px] text-warning">
                {sale.shortfall} unit{sale.shortfall === 1 ? ' was' : 's were'} sold beyond the
                recorded stock. Check the stock count in Inventory.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="shrink-0 border-line-subtle border-t bg-raised px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {sale.undone ? null : (
          <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Button asChild variant="secondary" className="h-12 max-sm:h-12">
              <a href={sale.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" /> Send receipt on WhatsApp
              </a>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-12 max-sm:h-12"
              disabled={invoiceBusy}
              onClick={onInvoice}
            >
              {invoiceBusy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <FileText aria-hidden="true" />
              )}
              {sale.invoiceUrl ? 'Open invoice again' : 'View invoice'}
            </Button>
          </div>
        )}
        {sale.invoiceUrl ? (
          <p className="mb-2 truncate text-center text-[12px] text-ink-3">
            Invoice link:{' '}
            <a
              href={sale.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              open
            </a>
          </p>
        ) : null}
        {undoError ? (
          <p role="alert" className="mb-2 text-center text-[13px] text-negative">
            {undoError}
          </p>
        ) : null}
        <Button
          type="button"
          variant="primary"
          className="h-14 w-full text-[16px] max-sm:h-14"
          onClick={onNew}
        >
          <Plus aria-hidden="true" /> New sale
        </Button>
        {sale.undone ? null : (
          <div className="mt-1 flex justify-center">
            {undoMinutes > 0 ? (
              <Button type="button" variant="ghost" disabled={undoBusy} onClick={onUndo}>
                {undoBusy ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Undo2 aria-hidden="true" />
                )}
                Undo this sale ({undoMinutes} min left)
              </Button>
            ) : (
              <p className="py-3 text-[12px] text-ink-3">
                To correct this sale later, open it from Sales.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
