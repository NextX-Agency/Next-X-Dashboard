'use client';

import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { RateMicros } from '@/lib/fx';
import type { CurrencyCode } from '@/lib/money';
import { listPriceIn } from '@/lib/pos/cart';
import { stockBadge } from '@/lib/pos/catalog';
import { formatPos } from '@/lib/pos/format';
import type { PosProduct, Sellable } from '@/lib/pos/types';
import { ProductPhoto } from './pos-image';

const TONE = { ok: 'neutral', low: 'warning', out: 'neutral', over: 'negative' } as const;

export function StockBadge({ onHand }: { onHand: number }) {
  const badge = stockBadge(onHand);
  return (
    <Badge tone={TONE[badge.tone]} className={cn(badge.tone === 'out' && 'text-ink-3')}>
      {badge.text}
    </Badge>
  );
}

export function priceRange(
  minUsdCents: number,
  maxUsdCents: number,
  currency: CurrencyCode,
  rateMicros: RateMicros,
): string {
  const min = listPriceIn(minUsdCents, currency, rateMicros);
  const max = listPriceIn(maxUsdCents, currency, rateMicros);
  return min === max ? formatPos(min, currency) : `From ${formatPos(min, currency)}`;
}

/**
 * One product in the grid: photograph, name, price, stock. A whole-tile button. A product with
 * options opens the option picker; a single-option product goes straight into the cart. The star and
 * the "in cart" count are separate controls laid over the corner, so nothing interactive is nested.
 */
export function ProductTile({
  product,
  currency,
  rateMicros,
  inCart,
  favourite,
  onPress,
  onToggleFavourite,
}: {
  product: PosProduct;
  currency: CurrencyCode;
  rateMicros: RateMicros;
  inCart: number;
  favourite: boolean;
  onPress: (product: PosProduct) => void;
  onToggleFavourite: (product: PosProduct) => void;
}) {
  const hasOptions = product.sellables.length > 1;
  const out = product.onHand <= 0;
  return (
    <li className="relative">
      <button
        type="button"
        data-pos-tile=""
        onClick={() => onPress(product)}
        className={cn(
          'pos-tile flex h-full w-full select-none flex-col overflow-hidden rounded-card border border-line-subtle bg-raised text-left',
          'shadow-[var(--nx-shadow-raised)] transition-[border-color,transform] duration-150 hover:border-accent',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        )}
      >
        <span
          className={cn(
            'relative block aspect-[4/3] w-full bg-white',
            out && 'opacity-55 grayscale-[0.4]',
          )}
        >
          <ProductPhoto
            key={product.image?.url ?? 'none'}
            image={product.image}
            sizes="(min-width: 1400px) 16vw, (min-width: 1024px) 24vw, (min-width: 640px) 30vw, 46vw"
          />
        </span>
        <span className="flex flex-1 flex-col gap-0.5 p-2.5">
          <span
            className={cn(
              'line-clamp-2 min-h-10 font-medium text-[14px] text-ink leading-5',
              out && 'text-ink-3',
            )}
          >
            {product.name}
          </span>
          <span className="truncate text-[12px] text-ink-3">
            {hasOptions
              ? `${product.sellables.length} options`
              : (product.sellables[0]?.option ?? product.brand ?? ' ')}
          </span>
          <span className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1 pt-1.5">
            <span className="tabular font-bold text-[15px] text-ink">
              {priceRange(product.minPriceCents, product.maxPriceCents, currency, rateMicros)}
            </span>
            <StockBadge onHand={product.onHand} />
          </span>
        </span>
      </button>
      {inCart > 0 ? (
        <span
          key={inCart}
          aria-hidden="true"
          className="pos-pop pointer-events-none absolute top-2 left-2 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 font-bold text-[12px] text-accent-fg shadow-[var(--nx-shadow-raised)]"
        >
          {inCart}
        </span>
      ) : null}
      <button
        type="button"
        aria-pressed={favourite}
        aria-label={
          favourite
            ? `Remove ${product.name} from favourites`
            : `Add ${product.name} to favourites`
        }
        onClick={() => onToggleFavourite(product)}
        className={cn(
          'absolute top-0.5 right-0.5 grid size-11 place-items-center rounded-full text-ink-3 transition-colors',
          'hover:text-accent focus-visible:outline-2 focus-visible:outline-ring',
          favourite && 'text-accent',
        )}
      >
        <Star
          aria-hidden="true"
          className={cn('size-[18px] drop-shadow-sm', favourite && 'fill-current')}
        />
      </button>
    </li>
  );
}

/** A compact card for the Favourites and Recent rows: tap to add, no scrolling through the grid. */
export function MiniCard({
  name,
  option,
  image,
  priceLabel,
  inCart,
  onPress,
}: {
  name: string;
  option: string | null;
  image: Sellable['image'];
  priceLabel: string;
  inCart: number;
  onPress: () => void;
}) {
  return (
    <li className="relative shrink-0">
      <button
        type="button"
        onClick={onPress}
        className="pos-tile flex h-14 w-[10.5rem] select-none items-center gap-2 rounded-control border border-line-subtle bg-raised p-1.5 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <span className="relative block size-11 shrink-0 overflow-hidden rounded-control bg-white">
          <ProductPhoto
            key={image?.url ?? 'none'}
            image={image}
            sizes="44px"
            className="p-0.5"
          />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-1 font-medium text-[13px] text-ink leading-4">
            {name}
          </span>
          <span className="line-clamp-1 text-[11px] text-ink-3 leading-4">{option ?? ' '}</span>
          <span className="tabular block font-bold text-[12px] text-ink leading-4">
            {priceLabel}
          </span>
        </span>
      </button>
      {inCart > 0 ? (
        <span
          key={inCart}
          aria-hidden="true"
          className="pos-pop pointer-events-none absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-bold text-[11px] text-accent-fg"
        >
          {inCart}
        </span>
      ) : null}
    </li>
  );
}
