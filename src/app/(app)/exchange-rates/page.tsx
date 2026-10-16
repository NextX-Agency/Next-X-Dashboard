import { sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { FinanceRateSheet } from '@/components/forms/finance-rate-sheet';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import { isDatabaseConfigured } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { formatRate } from '@/lib/fx';
import { db } from '@/server/db/client';

export const metadata: Metadata = { title: 'Exchange rates' };

export default async function ExchangeRatesPage() {
  const rates = isDatabaseConfigured()
    ? await db.execute<Record<string, string | null>>(
        sql`SELECT rate_micros::text, effective_from::text, source, note FROM fx_rates ORDER BY effective_from DESC LIMIT 100`,
      )
    : [];
  return (
    <>
      <PageHeader
        title="Exchange rates"
        description="USD → SRD rates are historical snapshots. No edit rewrites a past payment, expense or invoice."
        action={<FinanceRateSheet />}
      />
      <Surface className="overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line-subtle bg-inset text-[11px] text-ink-4 uppercase tracking-[0.08em]">
              <th className="px-4 py-3">Effective</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr
                key={`${rate.effective_from}-${rate.rate_micros}`}
                className="border-b border-line-subtle last:border-0"
              >
                <td className="px-4 py-3 text-ink-2">
                  {formatDate(rate.effective_from ?? '')}
                </td>
                <td className="px-4 py-3 tabular text-ink">
                  1 USD = {formatRate(Number(rate.rate_micros ?? 0), 4)} SRD
                </td>
                <td className="px-4 py-3 text-ink-3">{rate.source ?? 'manual'}</td>
                <td className="px-4 py-3 text-ink-3">{rate.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rates.length === 0 ? (
          <p className="p-6 text-[13px] text-ink-3">No exchange rates recorded yet.</p>
        ) : null}
      </Surface>
    </>
  );
}
