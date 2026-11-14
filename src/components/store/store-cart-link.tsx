'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { CART_PATH } from '@/lib/storefront-domain';
import { useStoreCart } from './store-cart-provider';
import { useCountBump } from './use-count-bump';

/**
 * The cart in the header. The badge is always rendered at the same width (a dot until the saved cart has
 * been read), so hydrating the count never moves the search field or the WhatsApp action beside it.
 */
export function StoreCartLink() {
  const { count, ready } = useStoreCart();
  const bump = useCountBump(count, ready);
  return (
    <Link
      href={CART_PATH as never}
      aria-label={ready ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}
      className="relative inline-flex size-[44px] items-center justify-center nx-press rounded-[10px] font-semibold text-[14px] text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring sm:h-11 sm:w-auto sm:min-w-11 sm:gap-2 sm:px-2.5"
    >
      <ShoppingBag aria-hidden="true" className="size-[20px]" />
      <span className="hidden sm:inline">Cart</span>
      <span
        key={bump}
        className={`tabular absolute top-0.5 right-0 grid h-[20px] min-w-[20px] place-items-center rounded-full px-1 font-bold text-[11px] sm:static ${
          bump > 0 ? 'nx-bump ' : ''
        }${ready && count > 0 ? 'bg-cta text-cta-fg' : 'bg-sunken text-ink-3'}`}
      >
        {ready ? count : '·'}
      </span>
    </Link>
  );
}
