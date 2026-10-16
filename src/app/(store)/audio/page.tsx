import type { Metadata } from 'next';
import { CatalogPage } from '@/components/store/catalog-page';
import type { RawSearchParams } from '@/lib/list-params';
import { getStorefrontBySlug } from '@/server/services/storefront';

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontBySlug('audio', true);
  return {
    title: storefront?.name ?? 'Audio',
    description: storefront?.description ?? 'Shop audio products available in Paramaribo.',
    alternates: { canonical: '/audio' },
  };
}

export default function AudioStorefrontPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return <CatalogPage searchParams={searchParams} />;
}
