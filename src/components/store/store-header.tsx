import { MessageCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { enquiryMessage } from '@/lib/store-messages';
import { whatsappLink } from '@/lib/whatsapp';
import { StoreCartLink } from './store-cart-link';
import { StoreHeaderSearch } from './store-header-search';

/**
 * The shop header: logo, a wide search field, a way to ask, and the cart. Nothing for staff lives here;
 * the sign-in link is in the footer. Categories are chips on the shop and home pages, where they act as
 * filters, rather than a second navigation row here. On phones the search sits under the logo.
 */
export function StoreHeader({
  storeName,
  whatsapp,
}: {
  storeName: string;
  whatsapp: string | null;
}) {
  const ask = whatsappLink(whatsapp, enquiryMessage(storeName));
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
      <div className="px-4 pb-3 sm:hidden">
        <Suspense fallback={<div className="h-11 rounded-[12px] bg-sunken" />}>
          <StoreHeaderSearch />
        </Suspense>
      </div>
    </header>
  );
}
