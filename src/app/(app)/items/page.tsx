import { ImageOff, Package } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import {
  ListFilter,
  ListNumberRange,
  ListSearch,
  ListToolbar,
} from '@/components/patterns/list-toolbar';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MobileList,
  MobileRow,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Money } from '@/components/ui/money';
import { Pagination } from '@/components/ui/pagination';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableSkeleton,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  THSort,
  TR,
} from '@/components/ui/table';
import { parseListParams, productQuerySchema, type RawSearchParams } from '@/lib/list-params';
import { listProducts } from '@/server/queries/lists';
import { listBrandOptions, listCategoryOptions } from '@/server/queries/pickers';

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

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Products"
        description="A product is what a customer recognises; a variant is what is actually stocked and sold. Publishing a product is what will put it on the public catalog, from these same rows."
        action={
          <>
            <ExportCsvLink entity="products" searchParams={searchParams} />
            <Button asChild variant="primary">
              <Link href="/items/new">Add product</Link>
            </Button>
          </>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <ProductsToolbar />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-44', 'w-24', 'w-16']} />}>
          <ProductsTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function ProductsToolbar() {
  const [brands, categories] = await Promise.all([listBrandOptions(), listCategoryOptions()]);
  return (
    <ListToolbar>
      <ListSearch placeholder="Search name, code, model, brand or SKU" />
      <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
      <ListFilter param="catalog" label="Catalog" options={CATALOG_OPTIONS} />
      <ListFilter param="stock" label="Stock" options={STOCK_OPTIONS} />
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

async function ProductsTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(productQuerySchema, raw);
  const hasFilters = Boolean(
    query.q ||
      query.status ||
      query.catalog ||
      query.stock ||
      query.featured ||
      query.images ||
      query.options ||
      query.minPrice !== undefined ||
      query.maxPrice !== undefined ||
      query.brand ||
      query.category,
  );
  const result = await listProducts(query);

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
        description="Try a different search or clear the status filter."
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

  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <THSort
                  href={buildHref({ ...query, sort: 'name', dir: nextDir('name'), page: 1 })}
                  active={query.sort === 'name'}
                  dir={query.dir}
                >
                  Product
                </THSort>
                <TH>Brand</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'onHand',
                    dir: nextDir('onHand'),
                    page: 1,
                  })}
                  active={query.sort === 'onHand'}
                  dir={query.dir}
                  numeric
                >
                  On hand
                </THSort>
                <TH numeric>From</TH>
                <TH numeric>Readiness</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'stockValue',
                    dir: nextDir('stockValue'),
                    page: 1,
                  })}
                  active={query.sort === 'stockValue'}
                  dir={query.dir}
                  numeric
                >
                  Stock value
                </THSort>
                <TH numeric className="hidden 2xl:table-cell">
                  Incoming
                </TH>
                <TH className="hidden 2xl:table-cell">Featured</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'updated',
                    dir: nextDir('updated'),
                    page: 1,
                  })}
                  active={query.sort === 'updated'}
                  dir={query.dir}
                >
                  Updated
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="min-w-[220px] text-ink">
                    <Link
                      href={`/items/${row.id}` as Route}
                      className="inline-flex items-center gap-2 rounded-row hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      <ProductThumb url={row.imageUrl} name={row.name} />
                      {row.name}
                    </Link>
                    {row.needsReview ? (
                      <div className="mt-1 flex flex-col items-start gap-0.5">
                        <Badge tone="warning">Needs review</Badge>
                        {row.reviewReason ? (
                          <span className="max-w-[280px] truncate text-[11px] text-warning">
                            {row.reviewReason}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </TD>
                  <TD className="whitespace-nowrap text-ink-3">{row.brandName ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-ink-3">{row.categoryName ?? '—'}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone={STATUS_TONE[row.status]}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </Badge>
                      {row.catalogPublished ? <Badge tone="accent">Published</Badge> : null}
                    </span>
                  </TD>
                  <TD numeric>{row.onHand}</TD>
                  <TD numeric>
                    <Money cents={row.listPriceCents} size="sm" tone="muted" />
                  </TD>
                  <TD numeric>
                    <span
                      className={
                        row.catalogReadiness.blockers.length ? 'text-negative' : 'text-ink-3'
                      }
                    >
                      {row.catalogReadiness.percent}%
                    </span>
                  </TD>
                  <TD numeric>
                    <Money cents={row.stockValueCents} size="sm" />
                  </TD>
                  <TD numeric className="hidden text-ink-3 2xl:table-cell">
                    {row.incoming}
                  </TD>
                  <TD className="hidden 2xl:table-cell">
                    {row.featured ? <Badge tone="accent">Featured</Badge> : '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-3">
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
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {result.rows.map((row) => (
          <MobileRow key={row.id}>
            <Link
              href={`/items/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MobileRowHeader>
                <span className="flex min-w-0 items-center gap-1.5">
                  <ProductThumb url={row.imageUrl} name={row.name} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{row.name}</span>
                    <span className="tabular block text-[11px] text-ink-4">{row.code}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={STATUS_TONE[row.status]}>
                    {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                  </Badge>
                  {row.catalogPublished ? <Badge tone="accent">Published</Badge> : null}
                  {row.needsReview ? <Badge tone="warning">Needs review</Badge> : null}
                </span>
              </MobileRowHeader>
              {row.needsReview && row.reviewReason ? (
                <span className="line-clamp-2 text-[11px] text-warning">
                  {row.reviewReason}
                </span>
              ) : null}
              <MobileRowMeta>
                <MobileRowMetaItem label="Category">
                  {row.categoryName ?? '—'}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Brand">{row.brandName ?? '—'}</MobileRowMetaItem>
                <MobileRowMetaItem label="On hand">{row.onHand}</MobileRowMetaItem>
                <MobileRowMetaItem label="Incoming">{row.incoming}</MobileRowMetaItem>
                <MobileRowMetaItem label="From">
                  <Money cents={row.listPriceCents} size="sm" tone="muted" />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Stock value">
                  <Money cents={row.stockValueCents} size="sm" />
                </MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <div className="flex justify-end pt-0.5">
              <ProductActions
                id={row.id}
                name={row.name}
                status={row.status}
                catalogPublished={row.catalogPublished}
              />
            </div>
          </MobileRow>
        ))}
      </MobileList>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        perPage={result.perPage}
        buildHref={(page) => buildHref({ ...query, page })}
      />
    </>
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

/** A small photograph of the product, or a labelled placeholder so a missing photo is visible. */
function ProductThumb({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-control bg-white">
      {url ? (
        <Image src={url} alt="" fill sizes="36px" className="object-contain p-0.5" />
      ) : (
        <ImageOff className="size-4 text-ink-4" aria-label={`No photo of ${name}`} />
      )}
    </span>
  );
}
