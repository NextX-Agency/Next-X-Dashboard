import { PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { CategoryChips } from '@/components/store/category-chips';
import { ProductCard } from '@/components/store/product-card';
import {
  ActiveFilters,
  ShopFilters,
  ShopToolbar,
  ShowMore,
} from '@/components/store/shop-controls';
import { Skeleton } from '@/components/ui/skeleton';
import type { RawSearchParams } from '@/lib/list-params';
import { hasPriceRange, parsePriceRange, priceRangeLabel } from '@/lib/price-range';
import { didYouMean } from '@/lib/search-query';
import { plural } from '@/lib/store-money';
import { SHOP_PATH } from '@/lib/storefront-domain';
import {
  type CatalogSort,
  listCatalogCategories,
  listCatalogFacets,
  listCatalogFilterOptions,
  listCatalogProducts,
  listSearchVocabulary,
} from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';

const SORTS: CatalogSort[] = ['relevance', 'newest', 'name', 'price-asc', 'price-desc'];

/** Products shown per step; "Show more" adds another step. Plenty for today's catalogue and a long one. */
const PAGE_SIZE = 24;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** A list-valued parameter: `a,b,c` (or repeated keys) becomes an array of non-empty values. */
function many(value: string | string[] | undefined): string[] {
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  return parts
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** `key:value` pairs from the address bar. */
function optionPairs(value: string | string[] | undefined): { key: string; value: string }[] {
  return many(value).flatMap((token) => {
    const at = token.indexOf(':');
    return at > 0 && at < token.length - 1
      ? [{ key: token.slice(0, at), value: token.slice(at + 1) }]
      : [];
  });
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
  const brand = many(raw.brand);
  const colour = many(raw.colour);
  const options = optionPairs(raw.opt);
  const platform = one(raw.platform);
  const protocol = one(raw.protocol);
  const collection = one(raw.collection);
  const newArrival = raw.new === 'true';
  const availability: 'in-stock' | 'incoming' | undefined =
    raw.availability === 'in-stock' || raw.availability === 'incoming'
      ? raw.availability
      : undefined;
  const sort = SORTS.find((value) => value === raw.sort) ?? (q ? 'relevance' : undefined);
  const page = Math.min(Math.max(Number.parseInt(one(raw.page) ?? '1', 10) || 1, 1), 50);

  const filters = {
    q,
    category,
    brand,
    colour,
    options,
    platform,
    protocol,
    collection,
    newArrival,
    availability,
  };
  // `listCatalogFilterOptions` knows the shop currency, which the range is written in.
  const filterOptions = await listCatalogFilterOptions();
  const priceRange = parsePriceRange(
    { min: one(raw.min), max: one(raw.max), price: one(raw.price) },
    filterOptions.priceCurrency,
  );
  const [all, categories, facets, rate, everything] = await Promise.all([
    listCatalogProducts({ ...filters, priceRange, sort }),
    listCatalogCategories(),
    listCatalogFacets({ ...filters, priceRange }),
    getCurrentRate(),
    // The chips show the size of the whole catalogue, not of the current filter.
    listCatalogProducts({}),
  ]);

  const products = all.slice(0, page * PAGE_SIZE);
  const suggestion = all.length === 0 && q ? didYouMean(q, await listSearchVocabulary()) : null;
  const activeCategory = categories.find((entry) => entry.slug === category);
  const filtered = Boolean(
    q ||
      category ||
      brand.length ||
      colour.length ||
      options.length ||
      platform ||
      protocol ||
      collection ||
      newArrival ||
      hasPriceRange(priceRange) ||
      availability,
  );
  const filterPanel = (
    <ShopFilters
      data={{
        categories: [],
        // Every public brand, counted under the other active filters (0 when none would match).
        brands: filterOptions.brands.map((entry) => ({
          ...entry,
          count: facets.brands.find((facet) => facet.slug === entry.slug)?.count ?? 0,
        })),
        platforms: filterOptions.platforms,
        protocols: filterOptions.protocols,
        priceCurrency: filterOptions.priceCurrency,
        priceBounds: facets.priceBounds,
        colours: facets.colours,
        options: facets.options,
        availability: facets.availability,
      }}
    />
  );

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h1 className="nx-display text-[clamp(28px,4vw,40px)]">
          {activeCategory?.name ?? (q ? `Results for “${q}”` : 'All products')}
        </h1>
        <p className="tabular pb-1 text-[14px] text-ink-3 lg:hidden">
          {plural(all.length, 'product')}
        </p>
      </header>

      <div className="mt-5">
        <CategoryChips
          categories={categories}
          total={everything.length}
          active={activeCategory ? activeCategory.slug : null}
        />
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-2 pb-6">
            {filterPanel}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="space-y-3">
            <ShopToolbar
              filters={filterPanel}
              inStockCount={facets.availability.inStock}
              total={all.length}
            />
            <ActiveFilters
              labels={{
                category: activeCategory?.name,
                brands: Object.fromEntries(
                  filterOptions.brands.map((entry) => [entry.slug, entry.name]),
                ),
                price: hasPriceRange(priceRange)
                  ? priceRangeLabel(priceRange, filterOptions.priceCurrency)
                  : undefined,
              }}
            />
          </div>

          <section aria-label="Products" className="mt-5">
            {all.length === 0 ? (
              <EmptyResults
                filtered={filtered}
                query={q}
                suggestion={suggestion}
                categories={categories}
              />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
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
            {all.length > products.length ? (
              <ShowMore shown={products.length} total={all.length} />
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}

function EmptyResults({
  filtered,
  query,
  suggestion,
  categories,
}: {
  filtered: boolean;
  query: string | undefined;
  suggestion: string | null;
  categories: { slug: string; name: string; count: number }[];
}) {
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
        {suggestion ? (
          <p className="mt-3 text-[15px] text-ink-2">
            Did you mean{' '}
            <Link
              href={`${SHOP_PATH}?q=${encodeURIComponent(suggestion)}` as never}
              className="font-semibold text-ink underline underline-offset-4"
            >
              {suggestion}
            </Link>
            ?
          </p>
        ) : null}
      </div>
      {filtered ? (
        <div className="flex flex-wrap gap-2">
          <Link href={SHOP_PATH as never} className="nx-btn nx-btn-primary">
            Clear filters
          </Link>
          {categories.slice(0, 3).map((category) => (
            <Link
              key={category.slug}
              href={`${SHOP_PATH}?category=${category.slug}` as never}
              className="nx-btn nx-btn-line"
            >
              {category.name}
            </Link>
          ))}
        </div>
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
