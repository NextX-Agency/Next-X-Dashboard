import { MessageCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { enquiryMessage } from '@/lib/store-messages';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { whatsappLink } from '@/lib/whatsapp';
import { StoreCartLink } from './store-cart-link';
import { StoreHeaderSearch } from './store-header-search';

/**
 * One sticky unit on one grid. Everything lives inside the same 1320 px container with the same
 * gutters, so the logo, the nav's first link and the footer's left edge line up exactly.
 *
 * Row 1: logo, search, WhatsApp, cart. From `lg` row 2 lists the places to go (all products, each
 * category). On a phone the whole header is ONE 56 px row (logo, a search field that opens over the
 * row when it is tapped, the cart) and it slides away while the visitor reads on (`StoreChrome`); the
 * tab bar carries the main places. Every row has a fixed height, so the header never changes size
 * while the page scrolls or hydrates. Nothing for staff lives here.
 */
export function StoreHeader({
  storeName,
  whatsapp,
  categories,
}: {
  storeName: string;
  whatsapp: string | null;
  categories: { slug: string; name: string }[];
}) {
  const ask = whatsappLink(whatsapp, enquiryMessage(storeName));
  const navLink =
    'inline-flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 border-transparent font-semibold text-[14px] text-ink-2 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring';
  return (
    // Solid on a phone: a blurred backdrop on a sticky bar is expensive on a low-end GPU.
    <header className="nx-header sticky top-0 z-30 border-line border-b bg-base sm:bg-base/95 sm:backdrop-blur">
      <div className="nx-header-wrap mx-auto w-full max-w-[1320px] px-4 lg:px-8">
        <div className="nx-header-row relative flex h-16 items-center gap-3 sm:gap-6">
          <Link
            href="/"
            aria-label={`${storeName}, go to the homepage`}
            className="inline-flex h-[44px] shrink-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <Image
              src="/nextx-logo-light.png"
              alt=""
              width={950}
              height={380}
              className="h-[36px] w-auto sm:h-11"
              // Shown at most 110 px wide: do not preload the 1080 px rendition.
              sizes="120px"
              priority
            />
          </Link>
          <Suspense fallback={<div className="h-11 min-w-0 flex-1 rounded-[12px] bg-sunken" />}>
            <StoreHeaderSearch />
          </Suspense>
          <div className="flex shrink-0 items-center gap-1">
            {ask ? (
              <a
                href={ask}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Message us on WhatsApp (opens WhatsApp)"
                className="hidden h-11 min-w-11 items-center justify-center gap-2 nx-press rounded-[10px] px-2.5 font-semibold text-[14px] text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex"
              >
                <MessageCircle aria-hidden="true" className="size-5" />
                <span className="hidden md:inline">WhatsApp</span>
              </a>
            ) : null}
            <StoreCartLink />
          </div>
        </div>
        <nav aria-label="Shop sections" className="hidden items-center gap-6 lg:flex">
          <Link href={SHOP_PATH as never} className={navLink}>
            All products
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`${SHOP_PATH}?category=${category.slug}` as never}
              className={navLink}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
