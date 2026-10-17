import { Package } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { RateMicros } from '@/lib/fx';
import { storefrontProductPath } from '@/lib/storefront-domain';
import type { CatalogListItem } from '@/server/queries/catalog';
import { StockPill } from './stock-pill';
import { StorePrice } from './store-price';

/**
 * One product in a grid. A white card: the photograph on a soft field, brand and name, the price as
 * the largest thing, a plain-language stock pill, and one clearly labelled action. The whole card is a
 * single link, so the action is the same destination as the photo and the name.
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
  // A brand label that repeats the start of the name ("KZ" + "KZ AS16 Pro X") is noise.
  const showBrand =
    product.brandName &&
    !product.name.toLowerCase().startsWith(product.brandName.toLowerCase());
  const href = storefrontProductPath(null, product.slug);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-tile border border-line bg-raised transition-shadow duration-200 hover:shadow-overlay">
      <div className="relative aspect-square bg-sunken">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 22vw"
            className={cn(
              'object-contain p-[8%] mix-blend-multiply transition-transform duration-300 ease-out-instrument group-hover:scale-[1.04]',
              !inStock && 'opacity-45',
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
          <span className="absolute top-3 left-3 rounded-full bg-night px-2.5 py-1 font-semibold text-[11px] text-night-ink">
            New
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5 sm:p-4">
        {showBrand ? (
          <p className="font-medium text-[12px] text-ink-3">{product.brandName}</p>
        ) : null}
        {/* Stretched link: the name is the accessible name; ::after extends the hit area to the card. */}
        <Link
          href={href as never}
          className="line-clamp-2 min-h-[2.6em] font-semibold text-[15px] leading-[1.3] text-ink after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {product.name}
        </Link>
        <StorePrice
          amountCents={product.minPriceCents}
          currency={product.priceCurrency}
          srdRate={srdRate}
          size="card"
          prefix={hasRange ? 'from' : undefined}
          className="mt-1"
        />
        <div className="mt-2.5">
          <StockPill onHand={product.onHand} incoming={product.incoming} />
        </div>
        <span
          aria-hidden="true"
          className={cn(
            'mt-3 flex h-10 items-center justify-center rounded-[10px] font-semibold text-[14px]',
            inStock ? 'bg-night text-night-ink' : 'border border-line-strong text-ink',
          )}
        >
          {inStock ? 'View product' : 'See availability'}
        </span>
      </div>
    </article>
  );
}
