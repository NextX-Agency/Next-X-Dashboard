import { NextResponse } from 'next/server';
import { listCatalogCategories } from '@/server/queries/catalog';
import { getRequestStorefront } from '@/server/services/storefront';

/** Public storefront context. Internal ids, pricing internals and audit data
 * deliberately stay behind the admin boundary. */
export async function GET() {
  const storefront = await getRequestStorefront();
  if (!storefront) {
    return NextResponse.json({ error: 'Storefront not found' }, { status: 404 });
  }

  const categories = await listCatalogCategories();
  return NextResponse.json({
    storefront: {
      name: storefront.name,
      slug: storefront.slug,
      domain: storefront.domain,
      status: storefront.status,
      currency: storefront.defaultCurrency,
      locale: storefront.defaultLocale,
      fulfillment: {
        pickup: storefront.allowPickup,
        delivery: storefront.allowDelivery,
      },
    },
    categories,
  });
}
