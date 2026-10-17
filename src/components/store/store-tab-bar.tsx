'use client';

import { Home, MessageCircle, Package, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { CART_PATH, SHOP_PATH } from '@/lib/storefront-domain';
import { useStoreCart } from './store-cart-provider';

/**
 * Phone navigation: four tabs at the thumb. Hidden on product pages, where the buy bar takes the
 * bottom edge, and from `sm` up, where the header carries everything.
 */
export function StoreTabBar({ whatsappHref }: { whatsappHref: string | null }) {
  const pathname = usePathname();
  const { count, ready } = useStoreCart();
  if (pathname.startsWith('/products/')) return null;

  const tabs = [
    { key: 'home', label: 'Home', href: '/', Icon: Home, active: pathname === '/' },
    {
      key: 'shop',
      label: 'Winkel',
      href: SHOP_PATH,
      Icon: Package,
      active: pathname === SHOP_PATH,
    },
    {
      key: 'cart',
      label: 'Mand',
      href: CART_PATH,
      Icon: ShoppingBag,
      active: pathname === CART_PATH,
    },
  ];

  const tabClass = (active: boolean) =>
    cn(
      'flex h-14 flex-col items-center justify-center gap-0.5 font-semibold text-[11px]',
      'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
      active ? 'text-ink' : 'text-ink-3',
    );

  return (
    <nav
      aria-label="Snelnavigatie"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-line border-t bg-base/97 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {tabs.map(({ key, label, href, Icon, active }) => (
        <Link
          key={key}
          href={href as never}
          aria-current={active ? 'page' : undefined}
          className={tabClass(active)}
        >
          <span className="relative">
            <Icon aria-hidden="true" className="size-5" />
            {key === 'cart' && ready && count > 0 ? (
              <span className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-night px-1 font-bold text-[10px] text-night-ink">
                {count}
              </span>
            ) : null}
          </span>
          {label}
        </Link>
      ))}
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={tabClass(false)}
        >
          <MessageCircle aria-hidden="true" className="size-5" />
          WhatsApp
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
