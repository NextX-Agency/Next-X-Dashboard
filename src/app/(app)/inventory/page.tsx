import { Boxes, ImageOff } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { StockAdjustSheet } from '@/components/forms/finance-sheets';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import { ListFilter, ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
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
import { formatRelative } from '@/lib/format';
import { parseListParams, type RawSearchParams, stockQuerySchema } from '@/lib/list-params';
import { formatMoney } from '@/lib/money';
import { listStock } from '@/server/queries/lists';
import { listCategoryOptions, listLocationOptions } from '@/server/queries/pickers';
import { getSettings } from '@/server/queries/reference';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Inventory' };

export default function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand is the sum of the movement ledger, never a number anyone edits. Value is weighted-average landed cost, so it includes the freight and fees paid to get each unit here."
        action={<ExportCsvLink entity="inventory" searchParams={searchParams} />}
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <StockToolbar />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={4} widths={['w-48', 'w-28', 'w-16']} />}>
          <StockTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

const STATE_OPTIONS = [
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'over', label: 'Below zero' },
];

async function StockToolbar() {
  const [categories, locations] = await Promise.all([
    listCategoryOptions(),
    listLocationOptions(),
  ]);
  return (
    <ListToolbar>
      <ListSearch placeholder="Search product, variant, SKU, model or brand" />
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

async function StockTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(stockQuerySchema, raw);
  const hasFilters = Boolean(query.q || query.category || query.location || query.state);
  const [result, settings] = await Promise.all([listStock(query), getSettings()]);
  // The same threshold the alerts panel reads, so the "Low" badge here and
  // the "running low" alert on the Overview can never disagree.
  const lowStockAt = settings?.lowStockThreshold ?? 5;

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Boxes}
        title="Nothing in stock yet"
        description="Stock appears here as soon as a purchase order is marked received. Nothing is entered by hand."
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
                <TH>SKU</TH>
                <TH>Category</TH>
                {query.location ? <TH numeric>At location</TH> : null}
                <TH numeric>Received</TH>
                <TH numeric>Sold</TH>
                <TH numeric>Inbound</TH>
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
                <TH numeric>Reserved</TH>
                <TH numeric>Available</TH>
                <TH numeric>Unit cost</TH>
                <THSort
                  href={buildHref({ ...query, sort: 'value', dir: nextDir('value'), page: 1 })}
                  active={query.sort === 'value'}
                  dir={query.dir}
                  numeric
                >
                  Value
                </THSort>
                <TH>Last movement</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => {
                const low = row.onHand > 0 && row.onHand <= lowStockAt;
                const negative = row.onHand < 0;
                return (
                  <TR key={row.variantId}>
                    <TD className="whitespace-nowrap text-ink">
                      <span className="inline-flex items-center gap-2">
                        <StockThumb url={row.imageUrl} name={row.productName} />
                        <span>
                          {row.productName}
                          <span className="text-ink-4"> · {row.variantName}</span>
                        </span>
                      </span>
                    </TD>
                    <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                      {row.sku}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-3">{row.categoryName ?? '—'}</TD>
                    {query.location ? (
                      <TD numeric className="text-ink">
                        {row.atLocation ?? 0}
                      </TD>
                    ) : null}
                    <TD numeric className="text-ink-3">
                      {row.received}
                    </TD>
                    <TD numeric className="text-ink-3">
                      {row.sold}
                    </TD>
                    <TD numeric className={row.inbound > 0 ? 'text-accent' : 'text-ink-4'}>
                      {row.inbound || '—'}
                    </TD>
                    <TD numeric>
                      <span className="inline-flex items-center gap-1.5">
                        {negative ? (
                          <Badge tone="negative">Below zero</Badge>
                        ) : low ? (
                          <Badge tone="warning">Low</Badge>
                        ) : null}
                        {row.onHand}
                      </span>
                    </TD>
                    <TD numeric className={row.reserved > 0 ? 'text-warning' : 'text-ink-3'}>
                      {row.reserved || '—'}
                    </TD>
                    <TD numeric className={row.available < 0 ? 'text-negative' : 'text-ink'}>
                      {row.available}
                    </TD>
                    <TD numeric className="text-ink-3">
                      {row.unitCostCents === null
                        ? '—'
                        : `$${(row.unitCostCents / 100).toFixed(4)}`}
                    </TD>
                    <TD numeric>{formatMoney(row.valueCents)}</TD>
                    <TD className="whitespace-nowrap text-[12px] text-ink-4">
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
                <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={6}>
                  {result.rows.length} variants, this page
                </td>
                <td className="tabular h-9 px-3 text-right text-ink">{pageUnits}</td>
                <td className="tabular h-9 px-3 text-right text-ink-3">
                  {result.rows.reduce((sum, row) => sum + row.reserved, 0) || '—'}
                </td>
                <td className="tabular h-9 px-3 text-right text-ink">
                  {result.rows.reduce((sum, row) => sum + row.available, 0)}
                </td>
                <td />
                <td className="h-9 px-3 text-right">
                  <Money cents={pageValue} size="sm" />
                </td>
                <td />
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
          return (
            <MobileRow key={row.variantId} interactive={false}>
              <MobileRowHeader>
                <span className="flex min-w-0 items-center gap-2">
                  <StockThumb url={row.imageUrl} name={row.productName} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">
                      {row.productName} <span className="text-ink-4">· {row.variantName}</span>
                    </span>
                    <span className="tabular block text-[11px] text-ink-4">{row.sku}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {negative ? (
                    <Badge tone="negative">Below zero</Badge>
                  ) : low ? (
                    <Badge tone="warning">Low</Badge>
                  ) : null}
                  <span className="tabular text-[13px] text-ink">{row.onHand}</span>
                </span>
              </MobileRowHeader>
              <MobileRowMeta>
                <MobileRowMetaItem label="Category">
                  {row.categoryName ?? '—'}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Inbound">{row.inbound || '—'}</MobileRowMetaItem>
                <MobileRowMetaItem label="Reserved">{row.reserved || '—'}</MobileRowMetaItem>
                <MobileRowMetaItem label="Available">{row.available}</MobileRowMetaItem>
                <MobileRowMetaItem label="Value">
                  {formatMoney(row.valueCents)}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Last movement">
                  {formatRelative(row.lastMovementAt)}
                </MobileRowMetaItem>
              </MobileRowMeta>
              <div className="flex justify-end pt-0.5">
                <StockAdjustSheet
                  variantId={row.variantId}
                  label={`${row.productName} · ${row.variantName}`}
                  onHand={row.onHand}
                />
              </div>
            </MobileRow>
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
  return (search ? `/inventory?${search}` : '/inventory') as Route;
}

function StockThumb({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-control bg-white">
      {url ? (
        <Image src={url} alt="" fill sizes="32px" className="object-contain p-0.5" />
      ) : (
        <ImageOff className="size-3.5 text-ink-4" aria-label={`No photo of ${name}`} />
      )}
    </span>
  );
}
