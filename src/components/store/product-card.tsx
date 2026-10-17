import { ArrowUpRight, Package } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { RateMicros } from '@/lib/fx';
import { storefrontProductPath } from '@/lib/storefront-domain';
import type { CatalogListItem } from '@/server/queries/catalog';
import { StorePrice } from './store-price';

/**
 * One product in a grid. The product is the card: a quiet warm field, the
 * photograph, then a caption (brand and category, name, price, stock). The
 * whole tile is one link; there is no second button to compete with it.
 * Purchase happens on the product page, where variants live.
 */
export function ProductCard({
  product,
  srdRate,
  priority = false,
}: {
  product: CatalogListItem;
  srdRate?: RateMicros;
  /** First row of a page: load eagerly. */
  priority?: boolean;
}) {
  const inStock = product.onHand > 0;
  const hasRange = product.maxPriceCents > product.minPriceCents;
  const isNew = product.newUntil ? Date.parse(product.newUntil) >= Date.now() : false;
  const aspect = product.image ? product.image.width / Math.max(1, product.image.height) : 1;
  // Near-square photography fills the field; unusual shapes are never cropped.
  const fill = aspect > 0.7 && aspect < 1.4;
  const context = [product.brandName, product.categoryName].filter(Boolean).join(' · ');

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-tile bg-sunken">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              'mix-blend-multiply transition-transform duration-500 ease-out-instrument group-hover:scale-[1.035]',
              fill ? 'object-cover' : 'object-contain p-6',
              !inStock && 'opacity-55',
            )}
            {...(product.image.blurDataUrl
              ? { placeholder: 'blur' as const, blurDataURL: product.image.blurDataUrl }
              : {})}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Package aria-hidden="true" className="size-8 text-ink-4" />
          </div>
        )}
        {isNew && inStock ? (
          <span className="nx-label absolute top-3 left-3 bg-store-bright px-1.5 py-1 text-[10px] text-[#0f0e0d]">
            Nieuw
          </span>
        ) : null}
        {!inStock ? (
          <span className="nx-label absolute top-3 left-3 bg-night px-1.5 py-1 text-[10px] text-night-ink">
            {product.incoming > 0 ? 'Onderweg' : 'Uitverkocht'}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className="absolute right-3 bottom-3 grid size-9 translate-y-1 place-items-center bg-night text-night-ink opacity-0 transition-all duration-200 ease-out-instrument group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <ArrowUpRight className="size-4" />
        </span>
      </div>

      <div className="flex flex-1 flex-col pt-3.5">
        {context ? <p className="nx-label truncate text-[10px] text-ink-3">{context}</p> : null}
        {/* Stretched link: the name is the accessible name; ::after extends the hit area to the tile. */}
        <Link
          href={storefrontProductPath(null, product.slug) as never}
          className="mt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {product.name}
        </Link>
        <div className="mt-auto flex flex-col gap-1.5 pt-3 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <StorePrice
            amountCents={product.minPriceCents}
            currency={product.priceCurrency}
            srdRate={srdRate}
            size="md"
            prefix={hasRange ? 'vanaf' : undefined}
          />
          <p
            className={cn(
              'flex items-center gap-1.5 text-[12px]',
              inStock ? 'text-ink-2' : 'text-ink-3',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('size-1.5 rounded-full', inStock ? 'bg-store-bright' : 'bg-ink-4')}
            />
            {inStock ? 'Op voorraad' : 'Niet op voorraad'}
          </p>
        </div>
      </div>
    </article>
  );
}
