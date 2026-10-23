'use client';

import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { StoreCartLineInput } from '@/lib/store-cart';
import { useStoreCart } from './store-cart-provider';

/**
 * "Add to cart" straight from a product card, for a product with exactly one purchasable option.
 * Products with a choice (colour and so on) never get this: nobody should add a colour they have not
 * seen. The button sits above the card's stretched link (`relative z-10`), so the card stays one link
 * and this stays one real button: no nesting. It stops at what is on hand, counting what is already
 * in the cart.
 */
export function QuickAdd({
  line,
  className,
}: {
  line: StoreCartLineInput;
  className?: string;
}) {
  const { lines, ready, addLine } = useStoreCart();
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const inCart = lines.find((item) => item.variantId === line.variantId)?.quantity ?? 0;
  const atLimit = inCart >= line.available;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function add() {
    if (!addLine({ ...line, quantity: 1 })) return;
    setJustAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setJustAdded(false), 2200);
  }

  return (
    <div className={cn('relative z-10 flex flex-col', className)}>
      <button
        type="button"
        onClick={add}
        disabled={!ready || atLimit}
        aria-label={`Add ${line.productName} to cart`}
        className={cn(
          'flex h-11 items-center justify-center gap-2 rounded-[10px] border font-semibold text-[14px] transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          justAdded
            ? 'border-ink bg-ink text-on-ink'
            : 'border-ink text-ink hover:border-cta hover:bg-cta hover:text-cta-fg disabled:border-line-strong disabled:text-ink-3 disabled:hover:bg-transparent disabled:hover:text-ink-3',
        )}
      >
        {justAdded ? <Check aria-hidden="true" className="size-4" /> : null}
        {justAdded ? 'Added' : atLimit ? 'All stock in cart' : 'Add to cart'}
      </button>
      {/* The button turns to "Added" and the header's cart count rises; this is the spoken version. */}
      <p className="sr-only" role="status" aria-live="polite">
        {justAdded ? `${line.productName} added. ${inCart} in your cart.` : ''}
      </p>
    </div>
  );
}
