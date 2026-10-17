import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  StorefrontForm,
  StorefrontLocationsForm,
  StorefrontProductVisibility,
} from '@/components/forms/storefront-admin-forms';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Surface, SurfaceBody, SurfaceHeader } from '@/components/ui/surface';
import {
  getStorefrontAdmin,
  listPriceLists,
  listStorefrontProductsAdmin,
} from '@/server/queries/storefronts';
import { listStorefrontLocations } from '@/server/services/storefront';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Storefront' };

export default async function StorefrontDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const page = Number(query.page) || 1;
  const [storefront, priceLists, locations, products] = await Promise.all([
    getStorefrontAdmin(id),
    listPriceLists(),
    listStorefrontLocations(id),
    listStorefrontProductsAdmin(id, { q: query.q, page }),
  ]);
  if (!storefront) notFound();
  return (
    <>
      <PageHeader
        title={storefront.name}
        description={`/${storefront.slug}${storefront.domain ? ` · ${storefront.domain}` : ''}`}
        action={
          <Button asChild variant="ghost">
            <Link href={'/storefronts' as Route}>All storefronts</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Surface>
            <SurfaceHeader
              title="Catalog exposure"
              hint="Visibility controls the channel; products and stock remain canonical."
            />
            <SurfaceBody>
              <StorefrontProductVisibility storefrontId={id} products={products.rows} />
              <Pagination
                page={products.page}
                pageCount={products.pageCount}
                total={products.total}
                perPage={products.perPage}
                buildHref={(next) => `/storefronts/${id}?page=${next}` as never}
              />
            </SurfaceBody>
          </Surface>
          <Surface>
            <SurfaceHeader
              title="Fulfillment locations"
              hint="Availability is on hand minus active reservations in these locations."
            />
            <SurfaceBody>
              <StorefrontLocationsForm storefrontId={id} locations={locations} />
            </SurfaceBody>
          </Surface>
        </div>
        <Surface>
          <SurfaceHeader
            title="Storefront settings"
            hint="A missing price or location makes a product unavailable publicly."
          />
          <SurfaceBody>
            <StorefrontForm
              initial={{
                id: storefront.id,
                name: storefront.name,
                slug: storefront.slug,
                domain: storefront.domain,
                status: storefront.status,
                defaultCurrency: storefront.currency,
                defaultLocale: storefront.defaultLocale,
                defaultPriceListId: storefront.defaultPriceListId,
                allowPickup: storefront.allowPickup,
                allowDelivery: storefront.allowDelivery,
              }}
              priceLists={priceLists.map(({ id: priceListId, name, currency }) => ({
                id: priceListId,
                name,
                currency,
              }))}
            />
          </SurfaceBody>
        </Surface>
      </div>
    </>
  );
}
