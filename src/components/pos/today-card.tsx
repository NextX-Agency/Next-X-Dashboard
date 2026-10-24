import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { formatPos } from '@/lib/pos/format';
import { getPosToday } from '@/server/queries/pos';

/**
 * Today at the counter, as a card for the Overview page: sales, takings by currency and cash in the
 * drawer, with a link into the full panel. Drop `<PosTodayCard />` into any page; it brings its own
 * Suspense boundary and reads live (never cached).
 */
export function PosTodayCard() {
  return (
    <Suspense fallback={<Skeleton className="h-[148px] rounded-card" />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  // "Today" is the current time: a request-time read, never prerendered.
  await connection();
  const today = await getPosToday();
  const cash = today.wallets.filter((wallet) => wallet.kind === 'cash');
  return (
    <Surface>
      <SurfaceHeader
        title="Today at the counter"
        hint={`${today.salesCount} sale${today.salesCount === 1 ? '' : 's'} · ${today.units} item${today.units === 1 ? '' : 's'}`}
        action={
          <Link
            href={'/pos/today' as never}
            className="inline-flex min-h-11 items-center gap-1 text-[13px] text-accent hover:underline sm:min-h-0"
          >
            Open <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        }
      />
      <dl className="grid grid-cols-2 gap-3 p-4">
        {today.revenue.length === 0 ? (
          <div className="col-span-2 text-[13px] text-ink-3">No sales yet today.</div>
        ) : (
          today.revenue.map((row) => (
            <div key={row.currency}>
              <dt className="text-[12px] text-ink-3">Revenue {row.currency}</dt>
              <dd className="tabular font-bold text-[18px] text-ink">
                {formatPos(row.totalCents, row.currency)}
              </dd>
            </div>
          ))
        )}
        {cash.map((wallet) => (
          <div key={wallet.id}>
            <dt className="text-[12px] text-ink-3">Cash drawer {wallet.currency}</dt>
            <dd className="tabular font-bold text-[18px] text-ink">
              {formatPos(wallet.balanceCents, wallet.currency)}
            </dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
