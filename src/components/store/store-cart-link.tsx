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
      className="relative inline-flex h-10 items-center gap-2 rounded-[10px] px-2.5 font-semibold text-[14px] text-ink transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ShoppingBag aria-hidden="true" className="size-5 sm:size-4" />
      <span className="hidden sm:inline">Mand</span>
      <span
        className={`tabular grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold ${
          ready && count > 0 ? 'bg-night text-night-ink' : 'bg-sunken text-ink-3'
        }`}
      >
        {ready ? count : '·'}
      </span>
    </Link>
  );
}
