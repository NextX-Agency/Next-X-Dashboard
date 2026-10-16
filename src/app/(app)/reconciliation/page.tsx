import { Scale } from 'lucide-react';
import type { Metadata } from 'next';
import {
  ReconciliationActions,
  ReconciliationSheet,
} from '@/components/forms/reconciliation-sheet';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Surface } from '@/components/ui/surface';
import { formatDate } from '@/lib/format';
import { listReconciliations, listWallets } from '@/server/queries/finance';

export const metadata: Metadata = { title: 'Reconciliation' };

export default async function ReconciliationPage() {
  const [rows, wallets] = await Promise.all([listReconciliations(), listWallets()]);
  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Statement checkpoints compare external evidence with the derived wallet ledger. History is retained; it is never silently fixed."
        action={<ReconciliationSheet wallets={wallets} />}
      />
      <Surface className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            Icon={Scale}
            title="No checkpoints yet"
            description="Record a bank or cash statement balance to begin a reconciliation history."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle bg-inset text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Statement</th>
                  <th className="px-4 py-3 text-right">Ledger</th>
                  <th className="px-4 py-3 text-right">Difference</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line-subtle last:border-0">
                    <td className="px-4 py-3 text-ink">{row.walletName}</td>
                    <td className="px-4 py-3 text-ink-3">{formatDate(row.periodEnd)}</td>
                    <td className="px-4 py-3 text-right">
                      <Money
                        cents={row.statementBalanceCents}
                        currency={row.currency}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money cents={row.ledgerBalanceCents} currency={row.currency} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money
                        cents={row.differenceCents}
                        currency={row.currency}
                        tone="flow"
                        size="sm"
                        signed
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            row.differenceCents === 0
                              ? 'positive'
                              : row.status === 'completed'
                                ? 'neutral'
                                : 'accent'
                          }
                        >
                          {row.differenceCents === 0 ? 'Matched' : row.status}
                        </Badge>
                        <ReconciliationActions id={row.id} status={row.status} />
                      </div>
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
