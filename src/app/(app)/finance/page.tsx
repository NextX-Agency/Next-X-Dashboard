import { ArrowRight, Landmark, ReceiptText } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceBody, SurfaceHeader } from '@/components/ui/surface';
import { getFinanceSummary } from '@/server/queries/finance';

export const metadata: Metadata = { title: 'Finance' };

export default async function FinancePage() {
  const summary = await getFinanceSummary();
  const cards = [
    {
      label: 'USD wallets',
      value: summary.usdBalanceCents,
      currency: 'USD' as const,
      icon: Landmark,
    },
    {
      label: 'SRD wallets',
      value: summary.srdBalanceCents,
      currency: 'SRD' as const,
      icon: Landmark,
    },
    {
      label: 'Outstanding invoices',
      value: summary.outstandingUsdCents,
      currency: 'USD' as const,
      icon: ReceiptText,
      hint: `${summary.outstandingInvoices} open`,
    },
  ];
  return (
    <>
      <PageHeader
        title="Finance"
        description="A controlled posting boundary around the existing Orders, Sales and invoice records."
      />
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map(({ label, value, currency, icon: Icon, hint }) => (
          <Surface key={label}>
            <SurfaceBody>
              <div className="flex items-center justify-between text-ink-3">
                <span className="text-[12px]">{label}</span>
                <Icon className="size-4" />
              </div>
              <Money cents={value} currency={currency} size="xl" className="mt-4" />
              {hint ? <p className="mt-2 text-[12px] text-ink-3">{hint}</p> : null}
            </SurfaceBody>
          </Surface>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Surface>
          <SurfaceHeader
            title="Finance workspaces"
            hint="Operational views, all derived from the same ledger"
          />
          <SurfaceBody className="grid gap-2 sm:grid-cols-2">
            <FinanceLink href="/wallets" label="Wallets" detail="Balances and transfers" />
            <FinanceLink
              href="/finance/transactions"
              label="Transactions"
              detail="Append-only postings"
            />
            <FinanceLink href="/expenses" label="Expenses" detail="Running costs and voids" />
            <FinanceLink
              href="/commissions"
              label="Commissions"
              detail="Seller balances and payouts"
            />
            <FinanceLink href="/invoices" label="Invoices" detail="Order-backed receivables" />
            <FinanceLink
              href="/exchange-rates"
              label="Exchange rates"
              detail="Historical rate series"
            />
            <FinanceLink
              href="/reconciliation"
              label="Reconciliation"
              detail="Statement checkpoints"
            />
          </SurfaceBody>
        </Surface>
        <Surface>
          <SurfaceHeader title="Control posture" hint="Rules that protect financial history" />
          <SurfaceBody className="space-y-3 text-[13px] text-ink-2">
            <p>
              <Badge tone="positive">Append-only</Badge> Corrections are reversals, not edits or
              deletes.
            </p>
            <p>
              <Badge tone="positive">Derived</Badge> Wallet and invoice balances come from valid
              ledger/payment rows.
            </p>
            <p>
              <Badge tone="positive">Atomic</Badge> Business payment and posting writes share
              one transaction.
            </p>
            <p>
              <Badge tone="neutral">{summary.openReconciliations} open</Badge> reconciliation
              checkpoints need review.
            </p>
          </SurfaceBody>
        </Surface>
      </div>
    </>
  );
}

function FinanceLink({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <Button asChild variant="secondary" className="h-auto justify-between py-3 text-left">
      <Link href={href as Route}>
        <span>
          <span className="block text-[13px]">{label}</span>
          <span className="block text-[11px] text-ink-3">{detail}</span>
        </span>
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}
