'use client';

import { Home, MessageCircle, Package, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { CART_PATH, SHOP_PATH } from '@/lib/storefront-domain';
import { useStoreCart } from './store-cart-provider';
import { useCountBump } from './use-count-bump';

/**
 * Phone navigation: four tabs at the thumb, 52 px plus the safe-area inset. It slides away with the
 * header while the visitor reads on (`StoreChrome`). It is never shown together with another bottom
 * bar: the product page's buy bar and the cart's order bar take the bottom edge instead, so there is
 * at most ONE fixed bar at the bottom. Hidden from `sm` up, where the header carries everything.
 */
export function StoreTabBar({ whatsappHref }: { whatsappHref: string | null }) {
  const pathname = usePathname();
  const { count, ready } = useStoreCart();
  const bump = useCountBump(count, ready);
  // The cart's own bar (total and Send order) replaces this one once there is something to send.
  // Until the saved cart is read nobody knows, so wait rather than flash a bar that then leaves.
  const cartBar = pathname === CART_PATH && (!ready || count > 0);
  if (pathname.startsWith('/products/') || cartBar) return null;

  const tabs = [
    { key: 'home', label: 'Home', href: '/', Icon: Home, active: pathname === '/' },
    {
      key: 'shop',
      label: 'Shop',
      href: SHOP_PATH,
      Icon: Package,
      active: pathname === SHOP_PATH,
    },
    {
      key: 'cart',
      label: 'Cart',
      href: CART_PATH,
      Icon: ShoppingBag,
      active: pathname === CART_PATH,
    },
  ];

  const tabClass = (active: boolean) =>
    cn(
      'nx-press nx-tab flex h-[52px] flex-col items-center justify-center gap-0.5 font-semibold text-[11px]',
      'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
      active ? 'text-accent' : 'text-ink-3',
    );

  return (
    <nav
      aria-label="Quick navigation"
      className="nx-tabbar fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-line border-t bg-base pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] sm:hidden"
    >
      {tabs.map(({ key, label, href, Icon, active }) => (
        <Link
          key={key}
          href={href as never}
          aria-current={active ? 'page' : undefined}
          className={tabClass(active)}
        >
          <span className="relative">
            <Icon aria-hidden="true" className="size-[20px]" />
            {key === 'cart' && ready && count > 0 ? (
              <span
                key={bump}
                className={cn(
                  'absolute -top-1.5 -right-2.5 grid min-w-[16px] place-items-center rounded-full bg-cta px-1 font-bold text-[10px] text-cta-fg',
                  bump > 0 && 'nx-bump',
                )}
              >
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
          <MessageCircle aria-hidden="true" className="size-[20px]" />
          WhatsApp
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
