'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { CART_PATH } from '@/lib/storefront-domain';
import { useStoreCart } from './store-cart-provider';

export function StoreCartLink() {
  const { count, ready } = useStoreCart();
  return (
    <Link
      href={CART_PATH as never}
      aria-label={
        ready ? `Winkelwagen, ${count} ${count === 1 ? 'artikel' : 'artikelen'}` : 'Winkelwagen'
      }
      className="relative inline-flex h-10 items-center gap-2 rounded-tile px-2.5 text-night-ink transition-colors hover:bg-night-2 focus-visible:outline-2 focus-visible:outline-store-bright sm:border sm:border-night-line sm:px-3"
    >
      <ShoppingBag aria-hidden="true" className="size-5 sm:size-4" />
      <span className="hidden text-[14px] font-medium sm:inline">Winkelwagen</span>
      <span
        className={`tabular grid min-w-5 place-items-center px-1 text-[11px] font-semibold ${
          ready && count > 0 ? 'bg-store-bright text-[#0f0e0d]' : 'bg-night-2 text-night-ink-2'
        }`}
      >
        {ready ? count : '·'}
      </span>
    </Link>
  );
}
