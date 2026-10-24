import { AlertTriangle, Package } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { BulkBar } from '@/components/catalog/bulk-bar';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { InlinePrice, InlineStock } from '@/components/catalog/quick-edit';
import { SavedViews } from '@/components/catalog/saved-views';
import {
  SelectAllCheckbox,
  type SelectableItem,
  SelectableMobileRow,
  SelectionCheckbox,
  SelectionProvider,
  SelectModeButton,
} from '@/components/catalog/selection';
import { ProductActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import {
  ListFilter,
  ListNumberRange,
  ListSearch,
  ListSort,
  ListToolbar,
} from '@/components/patterns/list-toolbar';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MobileList,
  MobileRowActions,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Money } from '@/components/ui/money';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, THSort, TR } from '@/components/ui/table';
import { formatMarginPercent } from '@/lib/catalog-quality';
import { PRODUCT_VIEWS } from '@/lib/catalog-views';
import { cn } from '@/lib/cn';
import { parseListParams, productQuerySchema, type RawSearchParams } from '@/lib/list-params';
import { getProductViewCounts, listPriceListChoices } from '@/server/queries/catalog-ops';
import { listProducts, type ProductRow } from '@/server/queries/lists';
import {
  listBrandOptions,
  listCategoryOptions,
  listLocationOptions,
} from '@/server/queries/pickers';
import { getAdminSettings } from '@/server/queries/reference';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Products' };

const STATUS_TONE = { draft: 'neutral', active: 'positive', archived: 'neutral' } as const;
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const CATALOG_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
  { value: 'missing', label: 'Missing catalog information' },
];
const STOCK_OPTIONS = [
  { value: 'out-of-stock', label: 'Out of stock' },
  { value: 'low-stock', label: 'Low stock' },
];
const COST_OPTIONS = [
  { value: 'missing', label: 'No cost known' },
  { value: 'negative', label: 'Selling below cost' },
];
const IMAGE_OPTIONS = [
  { value: 'missing', label: 'No photo' },
  { value: 'has', label: 'Has photo' },
];
const OPTION_OPTIONS = [
  { value: 'multiple', label: 'Several variants' },
  { value: 'single', label: 'One variant' },
];
const FEATURED_OPTIONS = [
  { value: 'yes', label: 'Featured' },
  { value: 'no', label: 'Not featured' },
];
const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Name, A to Z' },
  { value: 'name:desc', label: 'Name, Z to A' },
  { value: 'price:asc', label: 'Price, low to high' },
  { value: 'price:desc', label: 'Price, high to low' },
  { value: 'onHand:desc', label: 'Stock, most first' },
  { value: 'onHand:asc', label: 'Stock, least first' },
  { value: 'margin:asc', label: 'Margin, lowest first' },
  { value: 'margin:desc', label: 'Margin, highest first' },
  { value: 'updated:desc', label: 'Recently updated' },
  { value: 'stockValue:desc', label: 'Stock value, highest first' },
];

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Products"
        description="A product is what a customer recognises; a variant is what is actually stocked and sold. Tap a price or a stock figure to change it here. Hold a row (or tick the boxes) to change many products at once."
        action={
          <>
            <ExportCsvLink entity="products" searchParams={searchParams} />
            <Button asChild variant="primary">
              <Link href="/items/new">Add product</Link>
            </Button>
          </>
        }
      />
      <Surface className="overflow-clip">
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <ProductViews />
        </Suspense>
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <ProductsToolbar />
        </Suspense>
        <Suspense fallback={<ProductListSkeleton />}>
          <ProductsTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function ProductViews() {
  const counts = await getProductViewCounts();
  return (
    <SavedViews
      storageKey="nx:views:products"
      basePath="/items"
      builtIn={PRODUCT_VIEWS}
      counts={counts.views}
      allCount={counts.all}
      trailing={
        <Link
          href={'/items/attention' as Route}
          className={cn(
            'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors sm:h-8',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            counts.attention > 0
              ? 'border-transparent bg-warning-muted text-warning hover:brightness-95'
              : 'border-line bg-raised text-ink-2 hover:bg-hover',
          )}
        >
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          Needs attention
          <span className="tabular text-[11px]">{counts.attention}</span>
        </Link>
      }
    />
  );
}

async function ProductsToolbar() {
  const [brands, categories] = await Promise.all([listBrandOptions(), listCategoryOptions()]);
  return (
    <ListToolbar search={<ListSearch placeholder="Search name, code, model, brand or SKU" />}>
      <ListSort sorting options={SORT_OPTIONS} defaultSort="name" />
      <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
      <ListFilter param="catalog" label="Catalog" options={CATALOG_OPTIONS} />
      <ListFilter param="stock" label="Stock" options={STOCK_OPTIONS} />
      <ListFilter param="cost" label="Cost" options={COST_OPTIONS} />
      <ListFilter param="images" label="Photos" options={IMAGE_OPTIONS} />
      <ListFilter param="options" label="Variants" options={OPTION_OPTIONS} />
      <ListFilter param="featured" label="Merchandising" options={FEATURED_OPTIONS} />
      <ListNumberRange minParam="minPrice" maxParam="maxPrice" label="Price US$" />
      <ListFilter
        param="brand"
        label="Brand"
        options={brands.map((brand) => ({ value: brand.id, label: brand.label }))}
      />
      <ListFilter
        param="category"
        label="Category"
        options={categories.map((category) => ({ value: category.id, label: category.label }))}
      />
    </ListToolbar>
  );
}

/** What each row keeps for "Export CSV" of the selection, and for the confirmations. */
function selectableItems(rows: ProductRow[]): SelectableItem[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.code,
    imageUrl: row.imageUrl,
    status: row.status,
    published: row.catalogPublished,
    imageCount: row.imageCount,
    csv: {
      code: row.code,
      name: row.name,
      brand: row.brandName,
      category: row.categoryName,
      status: row.status,
      on_shop: row.catalogPublished ? 'yes' : 'no',
      variants: row.variantCount,
      on_hand: row.onHand,
      price_from_usd: (row.priceMinCents / 100).toFixed(2),
      price_to_usd: (row.priceMaxCents / 100).toFixed(2),
      lowest_margin_pct:
        row.lowestMarginBp === null ? null : (row.lowestMarginBp / 100).toFixed(1),
      stock_value_usd: (row.stockValueCents / 100).toFixed(2),
    },
  }));
}

function MarginText({ bp }: { bp: number | null }) {
  if (bp === null) {
    return (
      <span className="text-ink-4" title="No price or no cost yet">
        —
      </span>
    );
  }
  return (
    <span className={cn('tabular', bp < 0 ? 'text-negative' : 'text-ink-2')}>
      {formatMarginPercent(bp)}
      {bp < 0 ? <span className="sr-only"> (below cost)</span> : null}
    </span>
  );
}

async function ProductsTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(productQuerySchema, raw);
  const hasFilters = Boolean(
    query.q ||
      query.status ||
      query.catalog ||
      query.stock ||
      query.cost ||
      query.featured ||
      query.images ||
      query.options ||
      query.minPrice !== undefined ||
      query.maxPrice !== undefined ||
      query.brand ||
      query.category,
  );
  const [result, categories, priceLists, locations, settings] = await Promise.all([
    listProducts(query),
    listCategoryOptions(),
    listPriceListChoices(),
    listLocationOptions(),
    getAdminSettings(),
  ]);
  const lowStockAt = settings?.lowStockThreshold ?? 5;

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Package}
        title="No products yet"
        description="Add a product, give it a variant for each colour or size, and it becomes available to buy on a purchase order and to sell."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/items/new">Add product</Link>
          </Button>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Package}
        title="No products match these filters"
        description="Try a different search, or clear the filters to see every product again."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/items">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  const nextDir = (sort: typeof query.sort) =>
    query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc';
  const sortLink = (sort: typeof query.sort) =>
    buildHref({ ...query, sort, dir: nextDir(sort), page: 1 });

  return (
    <SelectionProvider items={selectableItems(result.rows)}>
      <div className="flex items-center justify-between gap-3 border-line-subtle border-b px-4 py-2 lg:hidden">
        <p className="text-[12px] text-ink-3">
          {result.total} {result.total === 1 ? 'product' : 'products'}
        </p>
        <SelectModeButton />
      </div>

      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-10 pr-0">
                  <SelectAllCheckbox />
                </TH>
                <THSort href={sortLink('name')} active={query.sort === 'name'} dir={query.dir}>
                  Product
                </THSort>
                <TH className="hidden xl:table-cell">Category</TH>
                <TH className="hidden xl:table-cell">Status</TH>
                <THSort
                  href={sortLink('onHand')}
                  active={query.sort === 'onHand'}
                  dir={query.dir}
                  numeric
                >
                  On hand
                </THSort>
                <THSort
                  href={sortLink('price')}
                  active={query.sort === 'price'}
                  dir={query.dir}
                  numeric
                >
                  Price
                </THSort>
                <THSort
                  href={sortLink('margin')}
                  active={query.sort === 'margin'}
                  dir={query.dir}
                  numeric
                >
                  Margin
                </THSort>
                <THSort
                  href={sortLink('stockValue')}
                  active={query.sort === 'stockValue'}
                  dir={query.dir}
                  numeric
                  className="hidden xl:table-cell"
                >
                  Stock value
                </THSort>
                <TH numeric className="hidden 2xl:table-cell">
                  Incoming
                </TH>
                <TH numeric className="hidden 2xl:table-cell">
                  Readiness
                </TH>
                <THSort
                  href={sortLink('updated')}
                  active={query.sort === 'updated'}
                  dir={query.dir}
                  className="hidden 2xl:table-cell"
                >
                  Updated
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => {
                const low = row.onHandActive > 0 && row.onHandActive <= lowStockAt;
                return (
                  <TR key={row.id}>
                    <TD className="w-10 pr-0">
                      <SelectionCheckbox id={row.id} name={row.name} />
                    </TD>
                    <TD className="min-w-[220px] max-w-[300px] text-ink">
                      <Link
                        href={`/items/${row.id}` as Route}
                        className="flex items-center gap-3 rounded-row hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <ProductThumb src={row.imageUrl} name={row.name} size="sm" decorative />
                        <span className="min-w-0">
                          <span className="block truncate hover:underline">{row.name}</span>
                          <span className="mt-0.5 flex items-center gap-1 xl:hidden">
                            <Badge tone={STATUS_TONE[row.status]}>
                              {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                            </Badge>
                            {row.catalogPublished ? <Badge tone="accent">On shop</Badge> : null}
                          </span>
                          <span className="tabular block truncate text-[11px] text-ink-4">
                            {[
                              row.brandName,
                              row.code,
                              row.variantCount > 1 ? `${row.variantCount} variants` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </Link>
                      {row.needsReview ? (
                        <div className="mt-1 flex flex-col items-start gap-0.5 pl-[56px]">
                          <Badge tone="warning">Needs review</Badge>
                          {row.reviewReason ? (
                            <span className="max-w-[280px] truncate text-[11px] text-warning">
                              {row.reviewReason}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </TD>
                    <TD className="hidden whitespace-nowrap text-ink-3 xl:table-cell">
                      {row.categoryName ?? '—'}
                    </TD>
                    <TD className="hidden xl:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        <Badge tone={STATUS_TONE[row.status]}>
                          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </Badge>
                        {row.catalogPublished ? <Badge tone="accent">On shop</Badge> : null}
                      </span>
                    </TD>
                    <TD numeric>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {row.onHandActive <= 0 && row.status === 'active' ? (
                          <Badge tone="negative">Out</Badge>
                        ) : low ? (
                          <Badge tone="warning">Low</Badge>
                        ) : null}
                        <InlineStock
                          productName={row.name}
                          variants={row.variants}
                          locations={locations}
                        />
                      </span>
                    </TD>
                    <TD numeric>
                      <InlinePrice productName={row.name} variants={row.variants} />
                    </TD>
                    <TD numeric>
                      <MarginText bp={row.lowestMarginBp} />
                    </TD>
                    <TD numeric className="hidden xl:table-cell">
                      <Money cents={row.stockValueCents} size="sm" />
                    </TD>
                    <TD numeric className="hidden text-ink-3 2xl:table-cell">
                      {row.incoming}
                    </TD>
                    <TD numeric className="hidden 2xl:table-cell">
                      <span
                        className={
                          row.catalogReadiness.blockers.length ? 'text-negative' : 'text-ink-3'
                        }
                      >
                        {row.catalogReadiness.percent}%
                      </span>
                    </TD>
                    <TD className="hidden whitespace-nowrap text-[12px] text-ink-3 2xl:table-cell">
                      {new Intl.DateTimeFormat('en-SR', { dateStyle: 'medium' }).format(
                        new Date(row.updatedAt),
                      )}
                    </TD>
                    <TD className="text-right">
                      <ProductActions
                        id={row.id}
                        name={row.name}
                        status={row.status}
                        catalogPublished={row.catalogPublished}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {result.rows.map((row) => {
          const low = row.onHandActive > 0 && row.onHandActive <= lowStockAt;
          return (
            <SelectableMobileRow key={row.id} id={row.id} name={row.name}>
              <Link
                href={`/items/${row.id}` as Route}
                className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <MobileRowHeader>
                  <span className="flex min-w-0 items-center gap-3">
                    <ProductThumb src={row.imageUrl} name={row.name} size="md" decorative />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[14px] text-ink">{row.name}</span>
                      <span className="tabular block truncate text-[11px] text-ink-4">
                        {[row.brandName, row.code].filter(Boolean).join(' · ')}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge tone={STATUS_TONE[row.status]}>
                          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </Badge>
                        {row.catalogPublished ? <Badge tone="accent">On shop</Badge> : null}
                        {row.onHandActive <= 0 && row.status === 'active' ? (
                          <Badge tone="negative">Out</Badge>
                        ) : low ? (
                          <Badge tone="warning">Low</Badge>
                        ) : null}
                        {row.needsReview ? <Badge tone="warning">Needs review</Badge> : null}
                      </span>
                    </span>
                  </span>
                </MobileRowHeader>
                {row.needsReview && row.reviewReason ? (
                  <span className="line-clamp-2 text-[11px] text-warning">
                    {row.reviewReason}
                  </span>
                ) : null}
              </Link>
              <MobileRowMeta className="relative z-[1]">
                <MobileRowMetaItem label="Price">
                  <span data-no-select>
                    <InlinePrice productName={row.name} variants={row.variants} />
                  </span>
                </MobileRowMetaItem>
                <MobileRowMetaItem label="On hand">
                  <span data-no-select>
                    <InlineStock
                      productName={row.name}
                      variants={row.variants}
                      locations={locations}
                      className="justify-start"
                    />
                  </span>
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Margin">
                  <MarginText bp={row.lowestMarginBp} />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Category">
                  {row.categoryName ?? '—'}
                </MobileRowMetaItem>
              </MobileRowMeta>
              <MobileRowActions>
                <ProductActions
                  id={row.id}
                  name={row.name}
                  status={row.status}
                  catalogPublished={row.catalogPublished}
                />
              </MobileRowActions>
            </SelectableMobileRow>
          );
        })}
      </MobileList>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        perPage={result.perPage}
        buildHref={(page) => buildHref({ ...query, page })}
      />

      <BulkBar kind="products" categories={categories} priceLists={priceLists} />
    </SelectionProvider>
  );
}

/** Matches the final layout: the same row height and the same thumbnail box, so nothing jumps. */
function ProductListSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="hidden divide-y divide-line-subtle lg:block">
        <div className="h-8 bg-inset/60" />
        {['a', 'b', 'c', 'd', 'e'].map((key) => (
          <div key={key} className="flex h-[60px] items-center gap-3 px-3">
            <Skeleton className="size-[18px]" />
            <Skeleton className="size-11 rounded-control" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-2.5 w-28" />
            </div>
            <Skeleton className="ml-auto h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-line-subtle lg:hidden">
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-16 rounded-card" />
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildHref(query: Record<string, string | number | undefined>): Route {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || key === 'perPage') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return (search ? `/items?${search}` : '/items') as Route;
}
