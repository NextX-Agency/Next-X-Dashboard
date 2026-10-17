import { PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { CategoryChips } from '@/components/store/category-chips';
import { ProductCard } from '@/components/store/product-card';
import { ActiveFilters, ShopFilters, ShopToolbar } from '@/components/store/shop-controls';
import { Skeleton } from '@/components/ui/skeleton';
import type { RawSearchParams } from '@/lib/list-params';
import { priceTierLabels } from '@/lib/price-tiers';
import { plural } from '@/lib/store-money';
import { SHOP_PATH } from '@/lib/storefront-domain';
import {
  type CatalogSort,
  listCatalogCategories,
  listCatalogFilterOptions,
  listCatalogProducts,
} from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';

const SORTS: CatalogSort[] = ['newest', 'name', 'price-asc', 'price-desc'];
const PRICES = ['under-50', '50-100', '100-250', '250-plus'] as const;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * The catalogue: categories as chips, one row of controls (in stock only, sort, more filters), then
 * the grid. Search is in the header and writes the same `?q=`. `searchParams` is passed down unawaited
 * so the shell stays part of the static prerender and only the data-reading part streams.
 */
export function ShopPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-5 pb-16 lg:px-8 lg:pt-8 lg:pb-24">
      <Suspense fallback={<ShopSkeleton />}>
        <ShopContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ShopContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const q = one(raw.q);
  const category = one(raw.category);
  const brand = one(raw.brand);
  const platform = one(raw.platform);
  const protocol = one(raw.protocol);
  const collection = one(raw.collection);
  const newArrival = raw.new === 'true';
  const price = PRICES.find((value) => value === raw.price);
  const availability =
    raw.availability === 'in-stock' || raw.availability === 'incoming'
      ? raw.availability
      : undefined;
  const sort = SORTS.find((value) => value === raw.sort);

  const [products, categories, options, rate, everything] = await Promise.all([
    listCatalogProducts({
      q,
      category,
      brand,
      platform,
      protocol,
      collection,
      newArrival,
      price,
      availability,
      sort,
    }),
    listCatalogCategories(),
    listCatalogFilterOptions(),
    getCurrentRate(),
    // The chips show the size of the whole catalogue, not of the current filter.
    listCatalogProducts({}),
  ]);

  const activeCategory = categories.find((entry) => entry.slug === category);
  const filtered = Boolean(
    q ||
      category ||
      brand ||
      platform ||
      protocol ||
      collection ||
      newArrival ||
      price ||
      availability,
  );
  const filters = <ShopFilters data={{ categories: [], ...options }} />;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h1 className="nx-display text-[clamp(28px,4vw,40px)]">
          {activeCategory?.name ?? 'All products'}
        </h1>
        <p className="tabular pb-1 text-[14px] text-ink-3">
          {plural(products.length, 'product')}
        </p>
      </header>

      <div className="mt-5">
        <CategoryChips
          categories={categories}
          total={everything.length}
          active={activeCategory ? activeCategory.slug : null}
        />
      </div>

      <div className="mt-3 space-y-3">
        <ShopToolbar filters={filters} />
        <ActiveFilters
          labels={{
            category: activeCategory?.name,
            brand: options.brands.find((entry) => entry.slug === brand)?.name,
            price: price ? priceTierLabels(options.priceCurrency)[price] : undefined,
          }}
        />
      </div>

      <section aria-label="Products" className="mt-5">
        {products.length === 0 ? (
          <EmptyResults filtered={filtered} query={q} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product, index) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  srdRate={rate?.rateMicros}
                  priority={index < 4}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function EmptyResults({ filtered, query }: { filtered: boolean; query: string | undefined }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-tile bg-sunken p-8 sm:p-12">
      <PackageSearch aria-hidden="true" className="size-8 text-ink-3" />
      <div>
        <h2 className="nx-display text-[24px]">
          {filtered ? 'Nothing found' : 'No products yet'}
        </h2>
        <p className="mt-2 max-w-[48ch] text-[15px] text-ink-2">
          {filtered
            ? `No products found${query ? ` for “${query}”` : ' with these filters'}. Try a different search or remove a filter.`
            : 'Products will appear here with their price, photos and stock once they are published.'}
        </p>
      </div>
      {filtered ? (
        <Link href={SHOP_PATH as never} className="nx-btn nx-btn-primary">
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}

const SKELETON_CARDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function ShopSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-10 w-1/2 max-w-sm" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {SKELETON_CARDS.map((id) => (
          <Skeleton key={id} className="aspect-[3/4] rounded-tile" />
        ))}
      </div>
    </div>
  );
}
