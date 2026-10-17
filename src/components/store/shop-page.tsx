import { PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductCard } from '@/components/store/product-card';
import { ActiveFilters, ShopFilters, ShopToolbar } from '@/components/store/shop-controls';
import { Skeleton } from '@/components/ui/skeleton';
import type { RawSearchParams } from '@/lib/list-params';
import { priceTierLabels } from '@/lib/price-tiers';
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
 * The catalogue. A page header with the count, a toolbar (search, availability,
 * sort), a filter column on desktop that becomes a sheet on phones, and a grid
 * of product cards. `searchParams` is passed down unawaited so the shell stays
 * part of the static prerender and only the data-reading part streams.
 */
export function ShopPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-10 pb-20 lg:px-8 lg:pt-14 lg:pb-28">
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

  const [products, categories, options, rate] = await Promise.all([
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
  ]);

  const filterData = { categories, ...options };
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
  const filters = <ShopFilters data={filterData} />;

  return (
    <>
      <header className="flex flex-col gap-3 border-line border-b pb-6">
        <p className="nx-label text-ink-3">Winkel</p>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h1 className="nx-display text-[clamp(36px,6vw,72px)] text-ink">
            {activeCategory?.name ?? 'Alle producten'}
          </h1>
          <p className="tabular pb-1.5 text-[13px] text-ink-3">
            {products.length} {products.length === 1 ? 'product' : 'producten'}
          </p>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        <ShopToolbar filters={filters} />
        <ActiveFilters
          labels={{
            category: activeCategory?.name,
            brand: options.brands.find((entry) => entry.slug === brand)?.name,
            price: price ? priceTierLabels(options.priceCurrency)[price] : undefined,
          }}
        />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24">{filters}</div>
        </aside>

        <section aria-label="Producten">
          {products.length === 0 ? (
            <EmptyResults filtered={filtered} query={q} />
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 lg:gap-x-6">
              {products.map((product, index) => (
                <li key={product.id}>
                  <ProductCard
                    product={product}
                    srdRate={rate?.rateMicros}
                    priority={index < 6}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function EmptyResults({ filtered, query }: { filtered: boolean; query: string | undefined }) {
  return (
    <div className="flex flex-col items-start gap-4 border-line border-y py-16">
      <PackageSearch aria-hidden="true" className="size-8 text-ink-3" />
      <div>
        <h2 className="nx-display text-[28px]">
          {filtered ? 'Niets gevonden' : 'Nog geen producten'}
        </h2>
        <p className="mt-2 max-w-[48ch] text-[15px] text-ink-2">
          {filtered
            ? `Geen producten gevonden${query ? ` voor “${query}”` : ' met deze filters'}. Probeer een andere zoekterm of verwijder een filter.`
            : 'Zodra producten zijn gepubliceerd, verschijnen ze hier met prijs, foto’s en voorraad.'}
        </p>
      </div>
      {filtered ? (
        <Link href={SHOP_PATH as never} className="nx-btn nx-btn-ink">
          Filters wissen
        </Link>
      ) : null}
    </div>
  );
}

const SKELETON_CARDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function ShopSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-4 h-14 w-2/3 max-w-md" />
      <Skeleton className="mt-8 h-11 w-full" />
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {SKELETON_CARDS.map((id) => (
          <div key={id}>
            <Skeleton className="aspect-square w-full rounded-tile" />
            <Skeleton className="mt-3 h-3 w-1/3" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
