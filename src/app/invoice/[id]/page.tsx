import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { InvoiceActions } from '@/components/invoice/invoice-actions';
import { InvoicePaper } from '@/components/invoice/invoice-paper';
import { formatMoney } from '@/lib/money';
import { requireMember } from '@/server/auth';
import { getSale } from '@/server/queries/documents';
import { getInvoiceLinkState } from '@/server/queries/invoices';
import { getAdminSettings } from '@/server/queries/reference';

/** Authenticated print view for the owner/staff workspace. */
export const metadata: Metadata = { title: 'Invoice' };
export const instant = false;
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireMember();
  const { id } = await params;
  const [sale, settings, linkState] = await Promise.all([
    getSale(id),
    getAdminSettings(),
    getInvoiceLinkState(id),
  ]);
  if (!sale) notFound();

  return (
    <main className="mx-auto max-w-[820px] px-4 py-8 text-ink">
      <InvoiceActions
        saleId={sale.id}
        number={sale.number}
        whatsapp={settings?.whatsapp ?? null}
        totalText={`${formatMoney(sale.totalCents, sale.currency)} ${sale.currency}`}
        canShare={sale.status === 'confirmed'}
        linkActive={linkState.active}
        linkExpiresAt={linkState.expiresAt}
      />
      <InvoicePaper sale={sale} settings={settings} />
    </main>
  );
}
