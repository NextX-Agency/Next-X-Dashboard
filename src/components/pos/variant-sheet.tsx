'use client';

import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import type { RateMicros } from '@/lib/fx';
import type { CurrencyCode } from '@/lib/money';
import { listPriceIn } from '@/lib/pos/cart';
import { formatPos } from '@/lib/pos/format';
import type { PosProduct, Sellable } from '@/lib/pos/types';
import { ProductPhoto } from './pos-image';
import { StockBadge } from './product-tiles';

/**
 * "Which one?" for a product with options (colour, length, version). Each option is a large chip
 * with its photograph, price and stock, so the choice is made by looking, not by reading. Tapping one
 * adds it and closes the sheet.
 */
export function VariantSheet({
  product,
  currency,
  rateMicros,
  inCartByKey,
  onChoose,
  onClose,
}: {
  product: PosProduct | null;
  currency: CurrencyCode;
  rateMicros: RateMicros;
  inCartByKey: ReadonlyMap<string, number>;
  onChoose: (sellable: Sellable) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={product?.name ?? 'Choose an option'}
      description="Tap an option to add it to the cart."
    >
      <ul className="grid gap-2 sm:grid-cols-1">
        {product?.sellables.map((sellable) => {
          const inCart = inCartByKey.get(sellable.key) ?? 0;
          const out = sellable.onHand <= 0;
          return (
            <li key={sellable.key}>
              <button
                type="button"
                onClick={() => onChoose(sellable)}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-card border border-line bg-raised p-2.5 text-left',
                  'transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                  out && 'bg-inset',
                )}
              >
                <span className="relative block size-14 shrink-0 overflow-hidden rounded-control bg-white">
                  <ProductPhoto
                    key={sellable.image?.url ?? 'none'}
                    image={sellable.image}
                    sizes="56px"
                    className="p-0.5"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block font-medium text-[16px] text-ink',
                      out && 'text-ink-3',
                    )}
                  >
                    {sellable.option ?? sellable.sku}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[12px] text-ink-3">{sellable.sku}</span>
                    <StockBadge onHand={sellable.onHand} />
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabular block font-bold text-[16px] text-ink">
                    {formatPos(
                      listPriceIn(sellable.listPriceCents, currency, rateMicros),
                      currency,
                    )}
                  </span>
                  {inCart > 0 ? (
                    <span className="block text-[12px] text-accent">{inCart} in cart</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
