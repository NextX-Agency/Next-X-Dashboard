'use client';

import { Banknote, ExternalLink, Loader2, MessageCircle, RefreshCw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { formatPos } from '@/lib/pos/format';
import { buildReceiptText, receiptWhatsappUrl } from '@/lib/pos/receipt';
import { undoAllowed, undoMinutesLeft } from '@/lib/pos/undo';
import { undoRecentSale } from '@/server/actions/pos';
import type { PosToday, PosTodaySale } from '@/server/queries/pos';
import { useNow } from './hooks';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Paramaribo',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Paramaribo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Today at the counter: how the day is going, what is in the till, what sold, and the sales themselves. */
export function TodayPanel({
  data,
  memberId,
  role,
  businessName,
  refreshing,
  onRefresh,
}: {
  data: PosToday;
  memberId: string;
  role: 'owner' | 'staff' | 'viewer';
  businessName: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const now = useNow(20_000);
  const [undoing, setUndoing] = useState<PosTodaySale | null>(null);
  const [busy, setBusy] = useState(false);

  const cashWallets = data.wallets.filter((wallet) => wallet.kind === 'cash');
  const otherWallets = data.wallets.filter((wallet) => wallet.kind !== 'cash');
  const dayLabel = dateFormat.format(new Date(`${data.date}T15:00:00Z`));

  async function confirmUndo() {
    if (!undoing || busy) return;
    setBusy(true);
    try {
      const result = await undoRecentSale({ saleId: undoing.id });
      if (result?.data) {
        toast.success(`Sale ${undoing.number} undone`);
        setUndoing(null);
        onRefresh();
      } else {
        toast.error(result?.serverError ?? 'Could not undo that sale');
        setUndoing(null);
      }
    } catch {
      toast.error('Could not undo that sale. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-medium text-[16px] text-ink">Today</h2>
          <p className="text-[13px] text-ink-3">{dayLabel}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          Refresh
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Sales" value={String(data.salesCount)} />
        <Stat label="Items sold" value={String(data.units)} />
        {data.revenue.length === 0 ? (
          <Stat label="Revenue" value="Nothing yet" muted />
        ) : (
          data.revenue.map((row) => (
            <Stat
              key={row.currency}
              label={`Revenue ${row.currency}`}
              value={formatPos(row.totalCents, row.currency)}
              hint={`${row.count} sale${row.count === 1 ? '' : 's'}`}
            />
          ))
        )}
        {data.owed.map((row) => (
          <Stat
            key={`owed-${row.currency}`}
            label={`Still owed ${row.currency}`}
            value={formatPos(row.cents, row.currency)}
            tone="warning"
          />
        ))}
        {data.voidedCount > 0 ? (
          <Stat label="Voided" value={String(data.voidedCount)} muted />
        ) : null}
      </dl>

      <section
        aria-labelledby="pos-till"
        className="rounded-card border border-line-subtle bg-raised"
      >
        <header className="flex items-center gap-2 border-line-subtle border-b px-3 py-2.5">
          <Banknote aria-hidden="true" className="size-4 text-ink-3" />
          <h3 id="pos-till" className="font-medium text-[14px] text-ink">
            Money by wallet
          </h3>
        </header>
        {data.wallets.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-ink-3">No active wallets.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {[...cashWallets, ...otherWallets].map((wallet) => {
              const net = wallet.receivedCents - wallet.refundedCents;
              const isCash = wallet.kind === 'cash';
              return (
                <li
                  key={wallet.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[14px] text-ink">
                      {wallet.name}{' '}
                      <span className="font-normal text-ink-3">{wallet.currency}</span>
                    </p>
                    <p className="tabular text-[12px] text-ink-3">
                      Received today {formatPos(wallet.receivedCents, wallet.currency)}
                      {wallet.refundedCents > 0
                        ? ` · refunded ${formatPos(wallet.refundedCents, wallet.currency)}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-bold text-[15px] text-ink">
                      {formatPos(net, wallet.currency)}
                    </p>
                    <p className="tabular text-[12px] text-ink-3">
                      {isCash ? 'In the drawer now ' : 'Balance '}
                      {formatPos(wallet.balanceCents, wallet.currency)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-line-subtle border-t px-3 py-2 text-[12px] text-ink-3">
          Count the drawer against "In the drawer now". It is the cash wallet balance in the
          ledger.
        </p>
      </section>

      {data.topItems.length > 0 ? (
        <section
          aria-labelledby="pos-top"
          className="rounded-card border border-line-subtle bg-raised"
        >
          <h3
            id="pos-top"
            className="border-line-subtle border-b px-3 py-2.5 font-medium text-[14px] text-ink"
          >
            Top items today
          </h3>
          <ol className="divide-y divide-line-subtle">
            {data.topItems.map((item, index) => (
              <li key={item.name} className="flex items-center gap-3 px-3 py-2.5">
                <span className="tabular w-5 text-[13px] text-ink-4">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                  {item.name}
                </span>
                <span className="tabular text-[13px] text-ink-2">{item.quantity} sold</span>
                <span className="tabular w-20 text-right text-[13px] text-ink-3">
                  {formatMoney(item.revenueUsdCents, 'USD')}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section
        aria-labelledby="pos-recent"
        className="rounded-card border border-line-subtle bg-raised"
      >
        <h3
          id="pos-recent"
          className="border-line-subtle border-b px-3 py-2.5 font-medium text-[14px] text-ink"
        >
          Sales today
        </h3>
        {data.recent.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-ink-3">No sales yet today.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {data.recent.map((sale) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                now={now}
                memberId={memberId}
                role={role}
                businessName={businessName}
                dateLabel={formatDate(`${data.date}T00:00:00Z`)}
                onUndo={() => setUndoing(sale)}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setUndoing(null);
        }}
        title={`Undo sale ${undoing?.number ?? ''}?`}
        description="The goods go back into stock and the payment is reversed. The sale stays on record as voided."
        confirmLabel="Undo sale"
        pending={busy}
        onConfirm={() => void confirmUndo()}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  muted,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  tone?: 'warning';
}) {
  return (
    <div className="rounded-card border border-line-subtle bg-raised p-3">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          'tabular mt-0.5 font-bold text-[20px] text-ink leading-7',
          muted && 'font-medium text-ink-3',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </dd>
      {hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

function SaleRow({
  sale,
  now,
  memberId,
  role,
  businessName,
  dateLabel,
  onUndo,
}: {
  sale: PosTodaySale;
  now: number;
  memberId: string;
  role: 'owner' | 'staff' | 'viewer';
  businessName: string;
  dateLabel: string;
  onUndo: () => void;
}) {
  const voided = sale.status === 'void';
  const balance = Math.max(0, sale.totalCents - sale.paidCents);
  const undo =
    !voided && role !== 'viewer'
      ? undoAllowed({
          createdAtMs: sale.createdAtMs,
          nowMs: now,
          memberId,
          memberRole: role,
          createdById: sale.createdById,
        })
      : { ok: false as const, reason: '' };

  const receipt = buildReceiptText({
    businessName,
    number: sale.number,
    dateLabel,
    currency: sale.currency,
    lines: sale.items.map((item) => ({
      name: item.name,
      option: item.option,
      quantity: item.quantity,
      unitCents: item.unitPriceCents,
      lineCents: item.lineTotalCents,
    })),
    discountCents: sale.discountCents,
    totalCents: sale.totalCents,
    paidCents: sale.paidCents,
    customerName: sale.customerName,
  });

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5',
        voided && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] text-ink">
          <span className="font-medium">{sale.number}</span>
          <span className="tabular text-[12px] text-ink-3">
            {timeFormat.format(new Date(sale.createdAtMs))}
          </span>
          {voided ? <Badge tone="neutral">Voided</Badge> : null}
          {!voided && balance > 0 ? (
            <Badge tone="warning">Owes {formatPos(balance, sale.currency)}</Badge>
          ) : null}
        </p>
        <p className="truncate text-[12px] text-ink-3">
          {sale.customerName ?? 'Walk-in'} ·{' '}
          {sale.items.map((item) => `${item.quantity} x ${item.name}`).join(', ') || 'No items'}
        </p>
      </div>
      <p className={cn('tabular font-bold text-[15px] text-ink', voided && 'line-through')}>
        {formatPos(sale.totalCents, sale.currency)}
      </p>
      <div className="flex items-center">
        <Button asChild variant="ghost" size="sm" className="h-11">
          <Link href={`/sales/${sale.id}` as never}>
            <ExternalLink aria-hidden="true" /> View
          </Link>
        </Button>
        {voided ? null : (
          <Button asChild variant="ghost" size="sm" className="h-11">
            <a
              href={receiptWhatsappUrl(receipt, sale.customerPhone)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden="true" /> Receipt
            </a>
          </Button>
        )}
        {voided || role === 'viewer' ? null : (
          <Button asChild variant="ghost" size="sm" className="h-11">
            <Link href={`/sales/${sale.id}` as never}>Refund</Link>
          </Button>
        )}
        {undo.ok ? (
          <Button type="button" variant="ghost" size="sm" className="h-11" onClick={onUndo}>
            <Undo2 aria-hidden="true" /> Undo ({undoMinutesLeft(sale.createdAtMs, now)} min)
          </Button>
        ) : null}
      </div>
    </li>
  );
}
