import Image from 'next/image';
import Link from 'next/link';
import { whatsappDigits } from '@/lib/whatsapp';
import { StoreCartLink } from './store-cart-link';
import { StoreHeaderMenu, StoreHeaderSearch } from './store-header-client';

export type StoreNavLink = { href: string; label: string };

/**
 * The shop header: one compact bar. Mark on the left, shopping links in the
 * middle, search and cart on the right. Nothing for staff lives here; the
 * sign-in link is in the footer. Categories appear only when they exist.
 */
export function StoreHeader({
  storeName,
  links,
  whatsapp,
}: {
  storeName: string;
  links: StoreNavLink[];
  whatsapp: string | null;
}) {
  const digits = whatsappDigits(whatsapp);
  return (
    <header className="sticky top-0 z-30 border-night-line border-b bg-night text-night-ink">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 sm:gap-6 lg:px-8">
        <StoreHeaderMenu
          links={links}
          whatsappHref={digits ? `https://wa.me/${digits}` : null}
        />

        <Link
          href="/"
          aria-label={`${storeName}, naar de homepage`}
          className="mr-1 inline-flex shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-store-bright"
        >
          <Image
            src="/nextx-logo-dark.png"
            alt=""
            width={950}
            height={380}
            className="h-10 w-auto"
            priority
          />
        </Link>

        <nav aria-label="Winkel" className="hidden items-center lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href as never}
              className="px-3 py-2 text-[14px] font-medium text-night-ink-2 transition-colors hover:text-night-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-store-bright"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <StoreHeaderSearch />
          <StoreCartLink />
        </div>
      </div>
    </header>
  );
}
