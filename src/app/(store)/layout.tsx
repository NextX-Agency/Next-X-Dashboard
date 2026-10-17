import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StoreCartProvider } from '@/components/store/store-cart-provider';
import { StoreFooter } from '@/components/store/store-footer';
import { StoreHeader, type StoreNavLink } from '@/components/store/store-header';
import { isStagingEnvironment, publicAppUrl } from '@/lib/env';
import { STORE_DESCRIPTION, storefrontDescription } from '@/lib/store-copy';
import { SHOP_PATH, storefrontPublicOrigin } from '@/lib/storefront-domain';
import { listCatalogBundles, listCatalogCategories } from '@/server/queries/catalog';
import { getSettings } from '@/server/queries/reference';
import { getRequestStorefront } from '@/server/services/storefront';

// The footer shows this year, not a frozen build-time year. `use cache` keeps
// the prerender static under Cache Components (an uncached `new Date()` in the
// layout would block prerendering every storefront page).
async function currentYear(): Promise<number> {
  'use cache';
  return new Date().getFullYear();
}

/**
 * The public storefront.
 *
 * A separate route group from the dashboard on purpose: no auth guard, no
 * sidebar, no member context, and no cost figure anywhere, because the
 * queries behind these pages (`server/queries/catalog.ts`) never select one.
 *
 * Forced light with an explicit background rather than a second `next-themes`
 * provider: nothing in the shop calls `useTheme()`, and nesting a second
 * `attribute="class"` provider inside the root one made both fight over
 * `document.documentElement`'s class, so a visitor with OS dark mode got
 * `.dark` back on `<html>`. `.nx-store` carries its own opaque values (see
 * tokens.css), which apply whatever class an ancestor has.
 *
 * The shell is category-neutral: the brand is NextX, the nav is built from the
 * categories that actually have public products, and no product family is
 * named anywhere in a URL.
 */

// The dashboard and staging storefronts must not be indexed. A custom public
// storefront gets its own canonical origin after production DNS is configured.
export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getRequestStorefront();
  const staging = isStagingEnvironment();
  return {
    metadataBase: new URL(storefrontPublicOrigin(storefront?.domain, publicAppUrl(), staging)),
    // The root layout's title template belongs to the staff dashboard; the shop has its own.
    title: { default: 'NextX', template: '%s · NextX' },
    description: STORE_DESCRIPTION,
    openGraph: { siteName: 'NextX', type: 'website' },
    robots: { index: !staging, follow: !staging },
  };
}
// Settings are live database data used by the storefront footer. With a
// production database configured, leaving this segment as an instant route
// makes Next.js reject the uncached read during prerendering. The catalog grid
// remains streamed where it is wrapped in Suspense; this flag only makes the
// shared store shell wait for its live settings read.
export const instant = false;

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [settings, categories, bundles, year, storefront] = await Promise.all([
    getSettings(),
    listCatalogCategories(),
    listCatalogBundles(1),
    currentYear(),
    getRequestStorefront(),
  ]);

  const links: StoreNavLink[] = [
    { href: SHOP_PATH, label: 'Alle producten' },
    ...categories.slice(0, 4).map((category) => ({
      href: `${SHOP_PATH}?category=${category.slug}`,
      label: category.name,
    })),
    ...(bundles.length ? [{ href: '/#sets', label: 'Sets' }] : []),
  ];

  return (
    <StoreCartProvider storageScope={storefront?.id ?? 'main'}>
      <div className="nx-store flex min-h-dvh flex-col bg-base text-ink">
        <StoreHeader
          storeName={settings?.businessName ?? 'NextX'}
          links={links}
          whatsapp={settings?.whatsapp ?? null}
        />
        <main className="w-full flex-1">{children}</main>
        <StoreFooter
          settings={settings}
          description={storefrontDescription(
            storefront?.description,
            settings?.storeDescription,
          )}
          links={links}
          currency={storefront?.defaultCurrency ?? settings?.displayCurrency ?? 'SRD'}
          year={year}
        />
      </div>
    </StoreCartProvider>
  );
}
