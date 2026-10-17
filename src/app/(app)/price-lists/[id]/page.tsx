import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PriceListForm, PriceListItemEditor } from '@/components/forms/storefront-admin-forms';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { Surface, SurfaceBody, SurfaceHeader } from '@/components/ui/surface';
import { getPriceListAdmin } from '@/server/queries/storefronts';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Price list' };

export default async function PriceListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const priceList = await getPriceListAdmin(id, { q: query.q, page: Number(query.page) || 1 });
  if (!priceList) notFound();
  return (
    <>
      <PageHeader
        title={priceList.name}
        description={`Canonical ${priceList.currency} prices for variants.`}
        action={
          <Button asChild variant="ghost">
            <Link href={'/price-lists' as Route}>All price lists</Link>
          </Button>
        }
      />
      <div className="space-y-4">
        <Surface>
          <SurfaceHeader
            title="Price list settings"
            hint="Assigned storefronts must use the same currency."
          />
          <SurfaceBody>
            <PriceListForm
              initial={{
                id: priceList.id,
                name: priceList.name,
                currency: priceList.currency,
                active: priceList.active,
              }}
            />
          </SurfaceBody>
        </Surface>
        <Surface className="overflow-hidden">
          <SurfaceHeader
            title="Variant prices"
            hint="Prices are stored in minor units and never inferred from another currency."
            action={
              <form>
                <Input
                  name="q"
                  defaultValue={query.q ?? ''}
                  placeholder="Search variants"
                  className="h-8 w-48"
                />
              </form>
            }
          />
          <div className="divide-y divide-line-subtle px-4">
            {priceList.items.rows.map((item) => (
              <div key={item.id} className="py-3">
                <PriceListItemEditor
                  priceListId={priceList.id}
                  currency={priceList.currency}
                  item={item}
                />
              </div>
            ))}
            {!priceList.items.rows.length ? (
              <p className="py-8 text-center text-[13px] text-ink-3">
                No variant prices in this list yet.
              </p>
            ) : null}
          </div>
          <Pagination
            page={priceList.items.page}
            pageCount={priceList.items.pageCount}
            total={priceList.items.total}
            perPage={priceList.items.perPage}
            buildHref={(next) => `/price-lists/${id}?page=${next}` as never}
          />
        </Surface>
      </div>
    </>
  );
}
