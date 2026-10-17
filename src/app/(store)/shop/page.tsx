import type { Metadata } from 'next';
import { ShopPage } from '@/components/store/shop-page';
import type { RawSearchParams } from '@/lib/list-params';
import { storefrontDescription } from '@/lib/store-copy';
import { getRequestStorefront } from '@/server/services/storefront';

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getRequestStorefront();
  return {
    title: 'Winkel',
    description: storefrontDescription(storefront?.description),
    alternates: { canonical: '/shop' },
  };
}

export default function ShopRoute({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return <ShopPage searchParams={searchParams} />;
}
