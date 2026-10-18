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
 * The shop header: logo, a wide search field, a way to ask, and the cart. From `lg` a second row names
 * the places to go (all products, each category, how ordering works), so a first-time visitor sees what
 * the shop sells without scrolling. Nothing for staff lives here; the sign-in link is in the footer. On
 * phones the search sits under the logo and the tab bar carries the main places.
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
    'inline-flex h-11 items-center border-b-2 border-transparent px-1 font-semibold text-[14px] text-ink-2 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring';
  return (
    <header className="sticky top-0 z-30 border-line border-b bg-base/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 sm:gap-6 lg:px-8">
        <Link
          href="/"
          aria-label={`${storeName}, go to the homepage`}
          className="inline-flex shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Image
            src="/nextx-logo-light.png"
            alt=""
            width={950}
            height={380}
            className="h-10 w-auto sm:h-11"
            priority
          />
        </Link>
        <Suspense
          fallback={<div className="hidden h-11 flex-1 rounded-[12px] bg-sunken sm:block" />}
        >
          <StoreHeaderSearch className="hidden flex-1 sm:block" />
        </Suspense>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          {ask ? (
            <a
              href={ask}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-10 items-center gap-2 rounded-[10px] px-3 font-semibold text-[14px] text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring md:inline-flex"
            >
              <MessageCircle aria-hidden="true" className="size-[18px]" /> Questions?
            </a>
          ) : null}
          <StoreCartLink />
        </div>
      </div>
      <nav
        aria-label="Shop sections"
        className="mx-auto hidden w-full max-w-[1320px] gap-6 px-8 lg:flex"
      >
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
        <Link href={'/#how-ordering-works' as never} className={navLink}>
          How ordering works
        </Link>
      </nav>
      <div className="px-4 pb-3 sm:hidden">
        <Suspense fallback={<div className="h-11 rounded-[12px] bg-sunken" />}>
          <StoreHeaderSearch />
        </Suspense>
      </div>
    </header>
  );
}
