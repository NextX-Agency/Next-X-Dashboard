import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { listStorefronts } from '@/server/queries/storefronts';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Storefronts' };

export default async function StorefrontsPage() {
  const storefronts = await listStorefronts();
  return (
    <>
      <PageHeader
        title="Storefronts"
        description="Manage sales channels over the shared catalog, price lists, and inventory locations."
        action={
          <Button asChild variant="primary">
            <Link href={'/storefronts/new' as Route}>New storefront</Link>
          </Button>
        }
      />
      <Surface className="overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line-subtle bg-inset text-[11px] text-ink-4 uppercase">
              <tr>
                <th className="px-4 py-3">Storefront</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Price list</th>
                <th className="px-4 py-3">Catalog</th>
                <th className="px-4 py-3">Locations</th>
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
                  <td className="px-4 py-3 text-ink-3">
                    {storefront.priceListName ?? 'Not assigned'}
                    <span className="ml-1 text-ink-4">· {storefront.currency}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-3">
                    {storefront.visibleCount}/{storefront.productCount} visible
                  </td>
                  <td className="px-4 py-3 text-ink-3">{storefront.locationCount}</td>
                </tr>
              ))}
              {!storefronts.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-ink-3">
                    No storefronts yet. Create one to establish the first public channel.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Surface>
    </>
  );
}
