import {
  ArrowRight,
  BellRing,
  LayoutTemplate,
  type LucideIcon,
  Package,
  Settings,
  Shapes,
} from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import {
  getStorefrontOverview,
  listActionableRestockAlerts,
} from '@/server/queries/storefront';
import { listStorefronts } from '@/server/queries/storefronts';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Storefront' };

type Metric = { label: string; value: number; href: Route; attention?: boolean };

type Task = { href: Route; label: string; detail: string; Icon: LucideIcon; count?: number };

/**
 * Everything about the public shop on one page: what customers can see, what needs doing, and the
 * sales channels themselves. `/storefronts` used to list the channels separately under a name one
 * letter away from this one; it now redirects here.
 */
export default async function StorefrontPage() {
  const [overview, restockAlerts, storefronts] = await Promise.all([
    getStorefrontOverview(),
    listActionableRestockAlerts(),
    listStorefronts(),
  ]);
  const metrics: Metric[] = [
    { label: 'Published products', value: overview.published, href: '/items' },
    { label: 'In stock', value: overview.inStock, href: '/inventory' },
    {
      label: 'Out of stock',
      value: overview.outOfStock,
      href: '/inventory',
      attention: overview.outOfStock > 0,
    },
    { label: 'Incoming units', value: overview.incoming, href: '/purchase-orders' },
    {
      label: 'Restock requests waiting',
      value: overview.waitingRestocks,
      href: '/storefront/restock' as Route,
      attention: overview.waitingRestocks > 0,
    },
    { label: 'Quote requests, 30 days', value: overview.recentQuotes, href: '/quotes' },
  ];
  const tasks: Task[] = [
    {
      href: '/storefront/homepage' as Route,
      label: 'Homepage',
      detail: 'Hero, featured sections and their order',
      Icon: LayoutTemplate,
    },
    {
      href: '/storefront/collections' as Route,
      label: 'Collections',
      detail: 'Group products for the shop and homepage',
      Icon: Shapes,
    },
    {
      href: '/storefront/restock' as Route,
      label: 'Restock requests',
      detail: 'Customers asking to be told when stock returns',
      Icon: BellRing,
      count: overview.waitingRestocks,
    },
    {
      href: '/items',
      label: 'Products',
      detail: 'Photos, descriptions and what is published',
      Icon: Package,
    },
    {
      href: '/settings',
      label: 'Shop settings',
      detail: 'Contact details, WhatsApp, footer and currency',
      Icon: Settings,
    },
  ];
  return (
    <>
      <PageHeader
        title="Storefront"
        description="What customers can see in the public shop, the demand behind it, and the sales channels that publish it."
      />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
        {metrics.map((metric) => (
          <Link
            key={metric.label}
            href={metric.href}
            className="group rounded-card focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <Surface className="h-full p-3 transition-colors group-hover:border-line sm:p-4">
              <p className="text-[12px] text-ink-3">{metric.label}</p>
              <p
                className={`mt-1 font-semibold text-2xl tabular ${
                  metric.attention ? 'text-accent' : 'text-ink'
                }`}
              >
                {metric.value}
              </p>
            </Surface>
          </Link>
        ))}
      </div>

      {restockAlerts.length ? (
        <Surface className="mt-4">
          <SurfaceHeader
            title="Customers waiting for stock"
            hint="Stock is available again. Contacting these customers is a manual step."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href={'/storefront/restock' as Route}>Open requests</Link>
              </Button>
            }
          />
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

      <Surface className="mt-4 overflow-clip">
        <SurfaceHeader
          title="Manage the shop"
          hint="Where each part of the public site is edited"
        />
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map(({ href, label, detail, Icon, count }) => (
            <li key={href} className="border-line-subtle border-b sm:border-r">
              <Link
                href={href}
                className="group flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-inset text-ink-2">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium text-[13px] text-ink">
                    {label}
                    {count ? <Badge tone="accent">{count}</Badge> : null}
                  </span>
                  <span className="block truncate text-[12px] text-ink-3">{detail}</span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </Surface>

      <Surface className="mt-4 overflow-clip">
        <SurfaceHeader
          title="Sales channels"
          hint="Each channel is a shop over the shared catalog, with its own price list and stock locations"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href={'/storefronts/new' as Route}>New storefront</Link>
            </Button>
          }
        />
        {storefronts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-line-subtle border-b bg-inset text-[11px] text-ink-4 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Storefront</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Price list</th>
                  <th className="px-4 py-2.5 font-medium">Catalog</th>
                  <th className="px-4 py-2.5 font-medium">Locations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {storefronts.map((storefront) => (
                  <tr key={storefront.id} className="hover:bg-hover">
                    <td className="px-4 py-3">
                      <Link
                        href={`/storefronts/${storefront.id}` as Route}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {storefront.name}
                      </Link>
                      <p className="text-[12px] text-ink-4">
                        {storefront.domain ?? 'Shared domain'} · {storefront.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={storefront.status === 'active' ? 'positive' : 'neutral'}>
                        {storefront.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-3">
                      {storefront.priceListName ?? 'Not assigned'}
                      <span className="ml-1 text-ink-4">· {storefront.currency}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-3">
                      {storefront.visibleCount}/{storefront.productCount} visible
                    </td>
                    <td className="px-4 py-3 text-ink-3">{storefront.locationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-[13px] text-ink-3">
            No storefronts yet. Create one to open the first public channel.
          </p>
        )}
      </Surface>
    </>
  );
}
