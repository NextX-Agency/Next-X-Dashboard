import { Boxes, ClipboardCheck } from 'lucide-react';
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
import { StockAdjustSheet } from '@/components/forms/finance-sheets';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import {
  ListFilter,
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
import { STOCK_VIEWS } from '@/lib/catalog-views';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { parseListParams, type RawSearchParams, stockQuerySchema } from '@/lib/list-params';
import { formatMoney } from '@/lib/money';
import { getStockViewCounts, listPriceListChoices } from '@/server/queries/catalog-ops';
import { listStock, type ProductVariantLite, type StockLevelRow } from '@/server/queries/lists';
import { listCategoryOptions, listLocationOptions } from '@/server/queries/pickers';
import { getAdminSettings } from '@/server/queries/reference';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Inventory' };

const STATE_OPTIONS = [
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'over', label: 'Below zero' },
];

const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Name, A to Z' },
  { value: 'name:desc', label: 'Name, Z to A' },
  { value: 'onHand:asc', label: 'Stock, least first' },
  { value: 'onHand:desc', label: 'Stock, most first' },
  { value: 'price:asc', label: 'Price, low to high' },
  { value: 'price:desc', label: 'Price, high to low' },
  { value: 'value:desc', label: 'Value, highest first' },
  { value: 'updated:desc', label: 'Last movement, newest first' },
];

export default function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand is the sum of the movement ledger, never a number anyone edits. Value is weighted-average landed cost, so it includes the freight and fees paid to get each unit here. Tap a stock figure to count it; every count is recorded as a movement."
        action={
          <>
            <ExportCsvLink entity="inventory" searchParams={searchParams} />
            <Button asChild variant="primary">
              <Link href={'/inventory/count' as Route}>
                <ClipboardCheck aria-hidden="true" /> Count stock
              </Link>
            </Button>
          </>
        }
      />
      <Surface className="overflow-clip">
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <StockViews />
        </Suspense>
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <StockToolbar />
        </Suspense>
        <Suspense fallback={<StockListSkeleton />}>
          <StockTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function StockViews() {
  const counts = await getStockViewCounts();
  return (
    <SavedViews
      storageKey="nx:views:inventory"
      basePath="/inventory"
      builtIn={STOCK_VIEWS}
      counts={counts.views}
      allCount={counts.all}
    />
  );
}

async function StockToolbar() {
  const [categories, locations] = await Promise.all([
    listCategoryOptions(),
    listLocationOptions(),
  ]);
  return (
    <ListToolbar
      search={<ListSearch placeholder="Search product, variant, SKU, model or brand" />}
    >
      <ListSort sorting options={SORT_OPTIONS} defaultSort="name" />
      <ListFilter param="state" label="Stock level" options={STATE_OPTIONS} />
      <ListFilter
        param="category"
        label="Category"
        options={categories.map((entry) => ({ value: entry.id, label: entry.label }))}
      />
      <ListFilter
        param="location"
        label="Location"
        options={locations.map((entry) => ({ value: entry.id, label: entry.name }))}
      />
    </ListToolbar>
  );
}

const liteOf = (row: StockLevelRow): ProductVariantLite => ({
  id: row.variantId,
  name: row.variantName,
  sku: row.sku,
  isActive: true,
  priceCents: row.priceCents,
  unitCostCents: row.unitCostCents,
  onHand: row.onHand,
  locations: row.locations,
});

function selectableItems(rows: StockLevelRow[]): SelectableItem[] {
  return rows.map((row) => ({
    id: row.variantId,
    name: `${row.productName} · ${row.variantName}`,
    sku: row.sku,
    imageUrl: row.imageUrl,
    productId: row.productId,
    csv: {
      sku: row.sku,
      product: row.productName,
      variant: row.variantName,
      category: row.categoryName,
      on_hand: row.onHand,
      reserved: row.reserved,
      available: row.available,
      inbound: row.inbound,
      price_usd: (row.priceCents / 100).toFixed(2),
      unit_cost_usd: row.unitCostCents === null ? null : (row.unitCostCents / 100).toFixed(4),
      value_usd: (row.valueCents / 100).toFixed(2),
    },
  }));
}

async function StockTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(stockQuerySchema, raw);
  const hasFilters = Boolean(query.q || query.category || query.location || query.state);
  const [result, settings, priceLists, locations] = await Promise.all([
    listStock(query),
    getAdminSettings(),
    listPriceListChoices(),
    listLocationOptions(),
  ]);
  // The same threshold the alerts panel reads, so the "Low" badge here and
  // the "running low" alert on the Overview can never disagree.
  const lowStockAt = settings?.lowStockThreshold ?? 5;

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Boxes}
        title="Nothing in stock yet"
        description="Stock appears here as soon as a purchase order is marked received, or when you count what is on the shelf."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href={'/inventory/count' as Route}>Count stock</Link>
          </Button>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Boxes}
        title="No stock matches these filters"
        description="Try a different product, variant or SKU, or clear the filters."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/inventory">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  const pageValue = result.rows.reduce((sum, row) => sum + row.valueCents, 0);
  const pageUnits = result.rows.reduce((sum, row) => sum + Math.max(row.onHand, 0), 0);

  const nextDir = (sort: typeof query.sort) =>
    query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc';
  const sortLink = (sort: typeof query.sort) =>
    buildHref({ ...query, sort, dir: nextDir(sort), page: 1 });

  return (
    <SelectionProvider items={selectableItems(result.rows)}>
      <div className="flex items-center justify-between gap-3 border-line-subtle border-b px-4 py-2 lg:hidden">
        <p className="text-[12px] text-ink-3">
          {result.total} {result.total === 1 ? 'variant' : 'variants'}
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
                <TH className="hidden 2xl:table-cell">Category</TH>
                {query.location ? <TH numeric>At location</TH> : null}
                <TH numeric className="hidden 2xl:table-cell">
                  Received
                </TH>
                <TH numeric className="hidden 2xl:table-cell">
                  Sold
                </TH>
                <TH numeric className="hidden xl:table-cell">
                  Inbound
                </TH>
                <THSort
                  href={sortLink('onHand')}
                  active={query.sort === 'onHand'}
                  dir={query.dir}
                  numeric
                >
                  On hand
                </THSort>
                <TH numeric className="hidden 2xl:table-cell">
                  Reserved
                </TH>
                <TH numeric>Available</TH>
                <TH numeric className="hidden 2xl:table-cell">
                  Unit cost
                </TH>
                <THSort
                  href={sortLink('price')}
                  active={query.sort === 'price'}
                  dir={query.dir}
                  numeric
                >
                  Price
                </THSort>
                <THSort
                  href={sortLink('value')}
                  active={query.sort === 'value'}
                  dir={query.dir}
                  numeric
                  className="hidden xl:table-cell"
                >
                  Value
                </THSort>
                <THSort
                  href={sortLink('updated')}
                  active={query.sort === 'updated'}
                  dir={query.dir}
                  className="hidden 2xl:table-cell"
                >
                  Last movement
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => {
                const low = row.onHand > 0 && row.onHand <= lowStockAt;
                const negative = row.onHand < 0;
                const lite = liteOf(row);
                return (
                  <TR key={row.variantId}>
                    <TD className="w-10 pr-0">
                      <SelectionCheckbox
                        id={row.variantId}
                        name={`${row.productName} ${row.variantName}`}
                      />
                    </TD>
                    <TD className="min-w-[190px] max-w-[250px] text-ink xl:max-w-[340px]">
                      <Link
                        href={`/items/${row.productId}` as Route}
                        className="flex items-center gap-3 rounded-row hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <ProductThumb
                          src={row.imageUrl}
                          name={row.productName}
                          detail={row.variantName}
                          size="sm"
                          decorative
                        />
                        <span className="min-w-0">
                          <span className="block truncate hover:underline">
                            {row.productName}
                            <span className="text-ink-4"> · {row.variantName}</span>
                          </span>
                          <span className="tabular block truncate text-[11px] text-ink-4">
                            {row.sku}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="hidden whitespace-nowrap text-ink-3 2xl:table-cell">
                      {row.categoryName ?? '—'}
                    </TD>
                    {query.location ? (
                      <TD numeric className="text-ink">
                        {row.atLocation ?? 0}
                      </TD>
                    ) : null}
                    <TD numeric className="hidden text-ink-3 2xl:table-cell">
                      {row.received}
                    </TD>
                    <TD numeric className="hidden text-ink-3 2xl:table-cell">
                      {row.sold}
                    </TD>
                    <TD
                      numeric
                      className={cn(
                        'hidden xl:table-cell',
                        row.inbound > 0 ? 'text-accent' : 'text-ink-4',
                      )}
                    >
                      {row.inbound || '—'}
                    </TD>
                    <TD numeric>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {negative ? (
                          <Badge tone="negative">Below zero</Badge>
                        ) : low ? (
                          <Badge tone="warning">Low</Badge>
                        ) : row.onHand === 0 ? (
                          <Badge tone="negative">Out</Badge>
                        ) : null}
                        <InlineStock
                          productName={`${row.productName} · ${row.variantName}`}
                          variants={[lite]}
                          locations={locations}
                        />
                      </span>
                    </TD>
                    <TD
                      numeric
                      className={cn(
                        'hidden 2xl:table-cell',
                        row.reserved > 0 ? 'text-warning' : 'text-ink-3',
                      )}
                    >
                      {row.reserved || '—'}
                    </TD>
                    <TD numeric className={row.available < 0 ? 'text-negative' : 'text-ink'}>
                      {row.available}
                    </TD>
                    <TD numeric className="hidden text-ink-3 2xl:table-cell">
                      {row.unitCostCents === null
                        ? '—'
                        : `$${(row.unitCostCents / 100).toFixed(4)}`}
                    </TD>
                    <TD numeric>
                      <InlinePrice
                        productName={`${row.productName} · ${row.variantName}`}
                        variants={[lite]}
                      />
                    </TD>
                    <TD numeric className="hidden xl:table-cell">
                      {formatMoney(row.valueCents)}
                    </TD>
                    <TD className="hidden whitespace-nowrap text-[12px] text-ink-4 2xl:table-cell">
                      {formatRelative(row.lastMovementAt)}
                    </TD>
                    <TD className="text-right">
                      <StockAdjustSheet
                        variantId={row.variantId}
                        label={`${row.productName} · ${row.variantName}`}
                        onHand={row.onHand}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            <tfoot className="border-line-subtle border-t bg-inset/60">
              <tr>
                <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={2}>
                  {result.rows.length} variants, this page
                </td>
                <td className="hidden 2xl:table-cell" />
                {query.location ? <td /> : null}
                <td className="hidden 2xl:table-cell" colSpan={2} />
                <td className="hidden xl:table-cell" />
                <td className="tabular h-9 px-3 text-right text-ink">{pageUnits}</td>
                <td className="tabular hidden h-9 px-3 text-right text-ink-3 2xl:table-cell">
                  {result.rows.reduce((sum, row) => sum + row.reserved, 0) || '—'}
                </td>
                <td className="tabular h-9 px-3 text-right text-ink">
                  {result.rows.reduce((sum, row) => sum + row.available, 0)}
                </td>
                <td className="hidden 2xl:table-cell" />
                <td />
                <td className="hidden h-9 px-3 text-right xl:table-cell">
                  <Money cents={pageValue} size="sm" />
                </td>
                <td className="hidden 2xl:table-cell" />
                <td />
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {result.rows.map((row) => {
          const low = row.onHand > 0 && row.onHand <= lowStockAt;
          const negative = row.onHand < 0;
          const lite = liteOf(row);
          const label = `${row.productName} · ${row.variantName}`;
          return (
            <SelectableMobileRow key={row.variantId} id={row.variantId} name={label}>
              <Link
                href={`/items/${row.productId}` as Route}
                className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <MobileRowHeader>
                  <span className="flex min-w-0 items-center gap-3">
                    <ProductThumb
                      src={row.imageUrl}
                      name={row.productName}
                      detail={row.variantName}
                      size="md"
                      decorative
                    />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[14px] text-ink">
                        {row.productName}{' '}
                        <span className="text-ink-4">· {row.variantName}</span>
                      </span>
                      <span className="tabular block truncate text-[11px] text-ink-4">
                        {row.sku}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {negative ? (
                          <Badge tone="negative">Below zero</Badge>
                        ) : low ? (
                          <Badge tone="warning">Low</Badge>
                        ) : row.onHand === 0 ? (
                          <Badge tone="negative">Out</Badge>
                        ) : null}
                        {row.inbound > 0 ? (
                          <Badge tone="accent">{row.inbound} on the way</Badge>
                        ) : null}
                      </span>
                    </span>
                  </span>
                </MobileRowHeader>
              </Link>
              <MobileRowMeta className="relative z-[1]">
                <MobileRowMetaItem label="On hand">
                  <span data-no-select>
                    <InlineStock
                      productName={label}
                      variants={[lite]}
                      locations={locations}
                      className="justify-start"
                    />
                  </span>
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Price">
                  <span data-no-select>
                    <InlinePrice productName={label} variants={[lite]} />
                  </span>
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Available">
                  <span className={cn(row.available < 0 && 'text-negative')}>
                    {row.available}
                  </span>
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Reserved">{row.reserved || '—'}</MobileRowMetaItem>
                <MobileRowMetaItem label="Value">
                  {formatMoney(row.valueCents)}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Last movement">
                  {formatRelative(row.lastMovementAt)}
                </MobileRowMetaItem>
              </MobileRowMeta>
              <MobileRowActions wide>
                <span data-no-select>
                  <StockAdjustSheet
                    variantId={row.variantId}
                    label={label}
                    onHand={row.onHand}
                  />
                </span>
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

      <BulkBar kind="variants" priceLists={priceLists} />
    </SelectionProvider>
  );
}

/** Same row height and thumbnail box as the loaded list, so nothing jumps when it arrives. */
function StockListSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="hidden divide-y divide-line-subtle lg:block">
        <div className="h-8 bg-inset/60" />
        {['a', 'b', 'c', 'd', 'e'].map((key) => (
          <div key={key} className="flex h-[60px] items-center gap-3 px-3">
            <Skeleton className="size-[18px]" />
            <Skeleton className="size-11 rounded-control" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-52" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="ml-auto h-3 w-12" />
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
  return (search ? `/inventory?${search}` : '/inventory') as Route;
}
