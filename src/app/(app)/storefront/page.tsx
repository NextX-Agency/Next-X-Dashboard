import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import {
  getStorefrontOverview,
  listActionableRestockAlerts,
} from '@/server/queries/storefront';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Storefront' };

export default async function StorefrontPage() {
  const [overview, restockAlerts] = await Promise.all([
    getStorefrontOverview(),
    listActionableRestockAlerts(),
  ]);
  const metrics = [
    ['Published products', overview.published],
    ['In stock', overview.inStock],
    ['Out of stock', overview.outOfStock],
    ['Incoming units', overview.incoming],
    ['Restock requests waiting', overview.waitingRestocks],
    ['Quote requests, 30 days', overview.recentQuotes],
  ];
  return (
    <>
      <PageHeader
        title="Storefront"
        description="What customers can see and the operational demand behind it."
      />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <Surface key={label as string} className="p-3 sm:p-4">
            <p className="text-[12px] text-ink-3">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular text-ink">{value}</p>
          </Surface>
        ))}
      </div>
      {restockAlerts.length ? (
        <Surface className="mt-5">
          <div className="border-line-subtle border-b px-4 py-3">
            <h2 className="text-[13px] font-medium text-ink">Customers waiting for stock</h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Stock is now available. Contacting customers remains a manual action.
            </p>
          </div>
          <ul className="divide-y divide-line-subtle">
            {restockAlerts.map((alert) => (
              <li
                key={`${alert.productName}-${alert.variantName}`}
                className="px-4 py-3 text-[13px]"
              >
                <span className="font-medium text-ink">
                  {alert.waitingCount} customer{alert.waitingCount === 1 ? '' : 's'} waiting for{' '}
                  {alert.productName}
                  {alert.variantName ? ` · ${alert.variantName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-0 text-[13px] sm:mt-5 sm:gap-3">
        <Link
          className="inline-flex min-h-11 items-center text-accent hover:underline sm:min-h-0"
          href={'/storefront/homepage' as Route}
        >
          Homepage configuration
        </Link>
        <Link
          className="inline-flex min-h-11 items-center text-accent hover:underline sm:min-h-0"
          href={'/storefront/restock' as Route}
        >
          Manage restock requests
        </Link>
        <Link
          className="inline-flex min-h-11 items-center text-accent hover:underline sm:min-h-0"
          href={'/storefront/collections' as Route}
        >
          Manage collections
        </Link>
        <Link
          className="inline-flex min-h-11 items-center text-accent hover:underline sm:min-h-0"
          href="/settings"
        >
          Storefront settings
        </Link>
        <Link
          className="inline-flex min-h-11 items-center text-accent hover:underline sm:min-h-0"
          href="/items"
        >
          Improve catalog products
        </Link>
      </div>
    </>
  );
}
