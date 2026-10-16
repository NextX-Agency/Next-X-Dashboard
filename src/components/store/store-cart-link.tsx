'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { storefrontPagePath } from '@/lib/storefront-domain';
import { useStoreCart } from './store-cart-provider';

export function StoreCartLink({ storefrontSlug }: { storefrontSlug?: string | null }) {
  const { count, ready } = useStoreCart();
  return (
    <Link
      href={storefrontPagePath(storefrontSlug, 'cart') as never}
      aria-label={ready ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ShoppingBag aria-hidden="true" className="size-4" />
      <span>Cart</span>
      <span className="min-w-5 rounded-full bg-accent-muted px-1.5 py-0.5 text-center text-[11px] tabular text-accent">
        {ready ? count : '…'}
      </span>
    </Link>
  );
}
