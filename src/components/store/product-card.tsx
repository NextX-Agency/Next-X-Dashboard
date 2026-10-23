import { Package } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { RateMicros } from '@/lib/fx';
import { variantLabel } from '@/lib/store-messages';
import { storefrontProductPath } from '@/lib/storefront-domain';
import type { CatalogListItem } from '@/server/queries/catalog';
import { QuickAdd } from './quick-add';
import { SafeImage } from './safe-image';
import { StockNote } from './stock-pill';
import { StorePrice } from './store-price';

/** What a card's photograph is sized for when the caller does not know its grid. */
const DEFAULT_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 22vw';

/**
 * One product in a grid: the photograph on a soft field, brand, name, price, and an action only when
 * there is one to take.
 *
 * - One purchasable option in stock: a real "Add to cart" button (Quick Add).
 * - Several options: the card says how many; the page is where the choice is made.
 * - Sold out: the words "Sold out" (or "On the way"). Available needs no label.
 *
 * The name is a stretched link (`::after` covers the card), so the card is ONE link for mouse, touch and
 * keyboard. Quick Add is a sibling button raised above that overlay, so nothing is nested.
 */
export function ProductCard({
  product,
  srdRate,
  priority = false,
  sizes = DEFAULT_SIZES,
}: {
  product: CatalogListItem;
  srdRate?: RateMicros;
  /** The first visible row: load eagerly and at high priority. */
  priority?: boolean;
  /** The `sizes` of this card's grid, so the browser fetches the right width. */
  sizes?: string;
}) {
  // A card that matched a colour or option shows THAT option's price and stock, not the product's range.
  const option = product.matchedVariant;
  const onHand = option ? option.onHand : product.onHand;
  const minPrice = option ? option.priceCents : product.minPriceCents;
  const inStock = onHand > 0;
  const hasRange = !option && product.maxPriceCents > product.minPriceCents;
  const several = product.optionCount > 1;
  const optionName = option && several ? variantLabel(option.name) : null;
  // A brand that repeats the start of the name ("KZ" + "KZ AS16 Pro X") says nothing; the category does.
  const brandRepeats = product.brandName
    ? product.name.toLowerCase().startsWith(product.brandName.toLowerCase())
    : false;
  const eyebrow = product.brandName && !brandRepeats ? product.brandName : product.categoryName;
  const base = storefrontProductPath(null, product.slug);
  // A card that matched on a colour or option opens the page on that option.
  const href = option && several ? `${base}?variant=${encodeURIComponent(option.sku)}` : base;
  const only = product.onlyOption;
  const canQuickAdd = !several && inStock && only !== null && only.onHand > 0;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-tile border border-line bg-raised transition-colors duration-200 focus-within:border-ink hover:border-line-strong">
      <div className="relative aspect-square bg-sunken">
        {product.image ? (
          <SafeImage
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            fill
            {...(priority ? { loading: 'eager' as const, fetchPriority: 'high' as const } : {})}
            sizes={sizes}
            className={cn(
              'object-contain p-[8%] mix-blend-multiply transition-transform duration-300 ease-out-instrument group-hover:scale-[1.03]',
              !inStock && 'opacity-45',
            )}
            fallback={<NoPhoto name={product.name} />}
            {...(product.image.blurDataUrl
              ? { placeholder: 'blur' as const, blurDataURL: product.image.blurDataUrl }
              : {})}
          />
        ) : (
          <NoPhoto name={product.name} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5 sm:p-4">
        {eyebrow ? (
          <p className="font-semibold text-[11px] text-ink-3 uppercase tracking-[0.08em]">
            {eyebrow}
          </p>
        ) : null}
        {/* Stretched link: the name is the accessible name; ::after extends the hit area to the card. */}
        <Link
          href={href as never}
          className="line-clamp-2 font-semibold text-[15px] leading-[1.3] text-ink after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {product.name}
        </Link>
        {optionName ? <p className="text-[13px] text-ink-2">{optionName}</p> : null}
        {several && !option ? (
          <p className="text-[13px] text-ink-2">{product.optionCount} options</p>
        ) : null}
        <StorePrice
          amountCents={minPrice}
          currency={product.priceCurrency}
          srdRate={srdRate}
          size="card"
          prefix={hasRange ? 'from' : undefined}
          className="mt-auto pt-2"
        />
        <StockNote onHand={onHand} incoming={option ? 0 : product.incoming} className="mt-1" />
        {canQuickAdd && only ? (
          <QuickAdd
            className="mt-3"
            line={{
              productId: product.id,
              productSlug: product.slug,
              productName: product.name,
              variantId: only.id,
              variantName: only.name,
              sku: only.sku,
              priceCents: only.priceCents,
              currency: product.priceCurrency,
              available: only.onHand,
              imageUrl: product.image?.url ?? null,
            }}
          />
        ) : null}
      </div>
    </article>
  );
}

/** Shown when a product has no photograph, or its file will not load: a calm placeholder, never a broken icon. */
function NoPhoto({ name }: { name: string }) {
  return (
    <div
      role="img"
      aria-label={`No photograph available for ${name}`}
      className="absolute inset-0 grid place-items-center"
    >
      <Package aria-hidden="true" className="size-9 text-ink-4" />
    </div>
  );
}
