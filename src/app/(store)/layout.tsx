import type { Metadata, Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StoreCartLink } from '@/components/store/store-cart-link';
import { StoreCartProvider } from '@/components/store/store-cart-provider';
import { StoreFooterBanner } from '@/components/store/store-hero';
import { isStagingEnvironment, publicAppUrl } from '@/lib/env';
import { storefrontPagePath, storefrontPublicOrigin } from '@/lib/storefront-domain';
import { whatsappDigits } from '@/lib/whatsapp';
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
 * The public storefront — the "Northlight" skin (see tokens.css).
 *
 * A separate route group from the dashboard on purpose: no auth guard, no
 * sidebar, no member context — and no cost figure anywhere, because the
 * queries behind these pages (`server/queries/catalog.ts`) never select one.
 *
 * Forced light with an explicit background, not a second `next-themes`
 * provider: nothing in the storefront calls `useTheme()`, and nesting a
 * second `attribute="class"` provider inside the root one (dashboard-wide,
 * system-aware) previously caused exactly the bug it was meant to prevent —
 * both instances fight over `document.documentElement`'s class, and on
 * mount the *outer* one's effect runs after the inner one's and wins, so a
 * visitor with OS-level dark mode got `.dark` back on `<html>` regardless.
 * Since `<body>` sits outside `.nx-store`'s scope, its background then
 * followed `.dark`'s near-black value and showed through any store section
 * with no background of its own — a public shop reading as near-black
 * because of a visitor's OS preference is exactly the conversion problem
 * this was meant to avoid. `.nx-store`'s own light values apply regardless
 * of `.dark` on an ancestor (CSS inheritance, not `next-themes`), so the
 * real fix is just giving this root its own opaque light background
 * (`bg-base`) so nothing can show through it in the first place.
 *
 * The shell takes Fairphone's structure: one calm bar with the mark and the
 * catalogue's own sections, content on white, and a closing navy promise
 * above the legal strip. The `.nx-store` class on the root re-skins every
 * token utility inside — the dashboard keeps Instrument untouched.
 */

// The dashboard and staging storefronts must not be indexed. A custom public
// storefront gets its own canonical origin after production DNS is configured.
export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getRequestStorefront();
  const staging = isStagingEnvironment();
  return {
    metadataBase: new URL(storefrontPublicOrigin(storefront?.domain, publicAppUrl(), staging)),
    robots: { index: !staging, follow: !staging },
  };
}
// Settings are live database data used by the storefront footer. With a
// production database configured, leaving this segment as an instant route
// makes Next.js reject the uncached read during prerendering. The catalog grid
// remains streamed where it is wrapped in Suspense; this flag only makes the
// shared store shell wait for its live settings read.
export const instant = false;

/** An Instagram handle or full URL → a profile URL. */
function instagramUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http')) return trimmed;
  return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
}

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [settings, categories, bundles, year, storefront] = await Promise.all([
    getSettings(),
    listCatalogCategories(),
    listCatalogBundles(1),
    currentYear(),
    getRequestStorefront(),
  ]);
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const waDigits = whatsappDigits(settings?.whatsapp);
  const isBrandEntry = !storefront || storefront.slug === 'main';
  const visibleCategories = isBrandEntry ? [] : categories;
  const visibleBundles = isBrandEntry ? [] : bundles;
  const catalogHref = isBrandEntry
    ? '/audio#catalog'
    : `${storefrontPagePath(storefront.slug)}#catalog`;
  return (
    <StoreCartProvider storageScope={storefront?.id ?? 'main'}>
      <div className="nx-store flex min-h-dvh flex-col bg-base text-ink">
        <header className="border-line-subtle border-b bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 lg:px-6">
            <Link
              href={storefrontPagePath(storefront?.slug) as never}
              aria-label={storefront?.name ?? settings?.businessName ?? 'NextX'}
              className="inline-flex rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {storefront?.logoUrl ? (
                <Image
                  src={storefront.logoUrl}
                  alt={storefront.name}
                  width={160}
                  height={36}
                  className="h-auto max-h-9 w-auto max-w-40 object-contain"
                />
              ) : (
                <Image
                  src="/nextx-logo-light.png"
                  alt="NextX"
                  width={160}
                  height={64}
                  className="h-auto max-h-9 w-auto max-w-40 object-contain"
                  priority
                />
              )}
            </Link>
            <nav aria-label="Catalog sections" className="hidden items-center gap-1 md:flex">
              {visibleCategories.slice(0, 4).map((category) => (
                <Link
                  key={category.slug}
                  href={
                    `${storefrontPagePath(storefront?.slug)}?category=${category.slug}` as never
                  }
                  className="rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {category.name}
                </Link>
              ))}
              <Link
                href={'/audio' as never}
                className="rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Audio
              </Link>
              {!isBrandEntry ? (
                <Link
                  href={catalogHref as never}
                  className="rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  All products
                </Link>
              ) : null}
            </nav>
            <div className="flex items-center gap-4">
              {!isBrandEntry ? <StoreCartLink storefrontSlug={storefront?.slug} /> : null}
              {waDigits ? (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden rounded-full bg-store-bright px-4 py-1.5 text-[13px] font-semibold text-store-navy transition-[filter] duration-150 ease-out-instrument hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:inline-flex"
                >
                  WhatsApp us
                </a>
              ) : null}
              <Link
                href="/login"
                className="rounded-control text-[13px] text-ink-3 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Sign in
              </Link>
            </div>
          </div>
        </header>

        <main className="w-full flex-1">{children}</main>

        <footer>
          <StoreFooterBanner storefrontSlug={storefront?.slug} />
          <div className="border-line-subtle border-t bg-sunken">
            <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.8fr_1fr] lg:px-6">
              <div className="min-w-0">
                {storefront?.logoUrl ? (
                  <Image
                    src={storefront.logoUrl}
                    alt={storefront.name}
                    width={160}
                    height={36}
                    className="h-auto max-h-9 w-auto max-w-40 object-contain"
                  />
                ) : (
                  <Image
                    src="/nextx-logo-light.png"
                    alt="NextX"
                    width={160}
                    height={64}
                    className="h-auto max-h-9 w-auto max-w-40 object-contain"
                  />
                )}
                <p className="mt-3 max-w-[40ch] text-[13px] text-ink-3 leading-relaxed">
                  {storefront?.description ??
                    settings?.storeDescription ??
                    'Premium audio, selected by NextX in Suriname.'}
                </p>
              </div>

              <div className="text-[13px]">
                <h2 className="mb-2 font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                  Shop
                </h2>
                <ul className="space-y-1 text-ink-3">
                  {visibleCategories.slice(0, 5).map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={
                          `${storefrontPagePath(storefront?.slug)}?category=${category.slug}` as never
                        }
                        className="transition-colors hover:text-accent"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                  {visibleBundles.length ? (
                    <li>
                      <Link
                        href={`${storefrontPagePath(storefront?.slug)}#setups` as never}
                        className="transition-colors hover:text-accent"
                      >
                        Starter setups
                      </Link>
                    </li>
                  ) : null}
                  {visibleCategories.length === 0 ? (
                    <li>
                      <Link
                        href={catalogHref as never}
                        className="transition-colors hover:text-accent"
                      >
                        All products
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </div>

              <div className="text-[13px]">
                <h2 className="mb-2 font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                  Help
                </h2>
                <ul className="space-y-1 text-ink-3">
                  <li>
                    <Link
                      href={catalogHref as never}
                      className="transition-colors hover:text-accent"
                    >
                      Compatibility
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${storefrontPagePath(storefront?.slug)}#buying` as never}
                      className="transition-colors hover:text-accent"
                    >
                      Pickup &amp; delivery
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${storefrontPagePath(storefront?.slug)}#support` as never}
                      className="transition-colors hover:text-accent"
                    >
                      Warranty &amp; support
                    </Link>
                  </li>
                </ul>
                <ul className="mt-4 space-y-1 border-t border-line-subtle pt-3 text-ink-3">
                  <li>
                    <Link
                      href={'/faq' as Route}
                      className="transition-colors hover:text-accent"
                    >
                      Veelgestelde vragen
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={'/testimonials' as Route}
                      className="transition-colors hover:text-accent"
                    >
                      Klantervaringen
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={'/blog' as Route}
                      className="transition-colors hover:text-accent"
                    >
                      Blog
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="text-[13px]">
                <h2 className="mb-2 font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                  NextX
                </h2>
                <ul className="space-y-1 text-ink-3">
                  {address ? <li>{address}</li> : <li>Paramaribo, Suriname</li>}
                  {settings?.openingHours ? <li>{settings.openingHours}</li> : null}
                  {settings?.phone ? (
                    <li>
                      <a
                        href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`}
                        className="transition-colors hover:text-accent"
                      >
                        {settings.phone}
                      </a>
                    </li>
                  ) : null}
                  {waDigits ? (
                    <li>
                      <a
                        href={`https://wa.me/${waDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-accent"
                      >
                        WhatsApp
                      </a>
                    </li>
                  ) : null}
                  {settings?.email ? (
                    <li>
                      <a
                        href={`mailto:${settings.email}`}
                        className="transition-colors hover:text-accent"
                      >
                        {settings.email}
                      </a>
                    </li>
                  ) : null}
                  {settings?.instagram ? (
                    <li>
                      <a
                        href={instagramUrl(settings.instagram)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-accent"
                      >
                        Instagram
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
            <div className="border-line-subtle border-t">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-[12px] text-ink-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
                <p>
                  © {year} {settings?.businessName ?? 'NextX'}
                </p>
                <p className="tabular">
                  Prices in {storefront?.defaultCurrency ?? settings?.displayCurrency ?? 'SRD'}
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </StoreCartProvider>
  );
}
