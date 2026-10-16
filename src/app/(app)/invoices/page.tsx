import { FileText } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Surface } from '@/components/ui/surface';
import { formatDate } from '@/lib/format';
import { listInvoices } from '@/server/queries/finance';

export const metadata: Metadata = { title: 'Invoices' };

const TONE = { paid: 'positive', partial: 'accent', outstanding: 'negative' } as const;

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every invoice is the stable, printable view of a canonical confirmed Order/Sale. Payment state is derived from valid payments."
      />
      <Surface className="overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState
            Icon={FileText}
            title="No invoices yet"
            description="Confirm an order to create its invoice number and snapshot-backed invoice view."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle bg-inset text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-line-subtle last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-accent underline-offset-2 hover:underline"
                        href={`/invoice/${invoice.id}` as Route}
                      >
                        {invoice.invoiceNumber ?? invoice.number}
                      </Link>
                      <span className="ml-2 text-[11px] text-ink-4">{invoice.number}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {invoice.customerName ?? 'Walk-in customer'}
                    </td>
                    <td className="px-4 py-3 text-ink-3">{formatDate(invoice.soldAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Money cents={invoice.totalCents} currency={invoice.currency} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money
                        cents={invoice.outstandingCents}
                        currency={invoice.currency}
                        size="sm"
                        tone={invoice.outstandingCents > 0 ? 'flow' : 'muted'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TONE[invoice.status]}>{invoice.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </>
  );
}
