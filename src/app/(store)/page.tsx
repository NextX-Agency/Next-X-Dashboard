import type { Metadata } from 'next';
import { HomePage } from '@/components/store/home-page';
import { storefrontDescription } from '@/lib/store-copy';
import { getRequestStorefront } from '@/server/services/storefront';

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getRequestStorefront();
  return {
    title: {
      absolute: `${storefront?.name ?? 'NextX'} | In-ear monitors and audio accessories`,
    },
    description: storefrontDescription(storefront?.description),
    alternates: { canonical: '/' },
  };
}

export default function StoreHomePage() {
  return <HomePage />;
}
