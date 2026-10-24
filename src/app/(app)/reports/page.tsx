import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/patterns/page-header';
import { PeriodSelector } from '@/components/patterns/period-selector';
import { FxExposureReport } from '@/components/reports/fx-exposure';
import { MarginByProduct } from '@/components/reports/margin-by-product';
import { ProfitAndLossReport } from '@/components/reports/profit-and-loss';
import { Skeleton } from '@/components/ui/skeleton';
import { isPeriodPreset, type PeriodPreset } from '@/lib/report-period';
import type { ProductMarginSort } from '@/server/queries/reports';
import { getDefaultPeriod, getFxExposure } from '@/server/queries/reports';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Reports' };

type SearchParams = Promise<{ period?: string; marginSort?: string }>;

export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Profit and loss over a chosen period, margin by product, and exposure to the exchange rate — everything already in the ledgers, read back out."
        action={
          <Suspense fallback={null}>
            <ReportsPeriodSelector />
          </Suspense>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-[340px] rounded-card" />}>
          <PnlSection searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[340px] rounded-card" />}>
          <FxSection />
        </Suspense>
      </div>
      <div className="mt-4">
        <Suspense fallback={<Skeleton className="h-[280px] rounded-card" />}>
          <MarginSection searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

/** The control must show the same default the figures were computed for. */
async function ReportsPeriodSelector() {
  return <PeriodSelector defaultValue={await getDefaultPeriod()} />;
}

async function FxSection() {
  const exposure = await getFxExposure();
  return <FxExposureReport exposure={exposure} />;
}

async function PnlSection({ searchParams }: { searchParams: SearchParams }) {
  const { period } = await searchParams;
  const preset: PeriodPreset = isPeriodPreset(period) ? period : await getDefaultPeriod();
  return <ProfitAndLossReport preset={preset} />;
}

async function MarginSection({ searchParams }: { searchParams: SearchParams }) {
  const { period, marginSort } = await searchParams;
  const preset: PeriodPreset = isPeriodPreset(period) ? period : await getDefaultPeriod();
  const sort: ProductMarginSort =
    marginSort === 'revenue' || marginSort === 'units' ? marginSort : 'gross';
  return <MarginByProduct sort={sort} period={preset} />;
}
