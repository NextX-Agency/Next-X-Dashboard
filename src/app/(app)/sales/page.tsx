import { AlertTriangle, Receipt } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SaleActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import {
  ListDateRange,
  ListFilter,
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
import { Money, Percent } from '@/components/ui/money';
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
import { formatDate } from '@/lib/format';
import { parseListParams, type RawSearchParams, saleQuerySchema } from '@/lib/list-params';
import { PAYMENT_LABELS, type PaymentBadgeCode } from '@/lib/payment-status';
import { listSales } from '@/server/queries/lists';
import { listSellerOptions } from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Sales' };

const STATUS_TONE = { draft: 'neutral', confirmed: 'positive', void: 'negative' } as const;
/** Money badges sit beside the status because they answer a different question:
 *  did the sale happen vs. did the cash arrive. Overdue is the only one that
 *  demands attention, so it is the only one in full colour. */
const PAYMENT_TONE: Record<PaymentBadgeCode, 'positive' | 'warning' | 'info' | 'negative'> = {
  paid: 'positive',
  partly: 'info',
  unpaid: 'warning',
  overdue: 'negative',
};
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'void', label: 'Void' },
];

export default function SalesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Sales"
        description="Each sale stores the exchange rate in force when it happened and the weighted-average cost it consumed, so neither a rate change nor a later purchase can rewrite a margin recorded months ago."
        action={
          <>
            <ExportCsvLink entity="sales" searchParams={searchParams} />
            <Button asChild variant="primary">
              <Link href="/sales/new">Record sale</Link>
            </Button>
          </>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <SalesToolbar />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-14', 'w-36', 'w-20']} />}>
          <SalesTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

const PAYMENT_OPTIONS = [
  { value: 'paid', label: 'Paid' },
  { value: 'partly', label: 'Partly paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
];
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'SRD', label: 'SRD' },
];

async function SalesToolbar() {
  const sellers = await listSellerOptions();
  return (
    <ListToolbar>
      <ListSearch placeholder="Search number, customer, product or SKU" />
      <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
      <ListFilter param="payment" label="Payment" options={PAYMENT_OPTIONS} />
      <ListFilter param="currency" label="Currency" options={CURRENCY_OPTIONS} />
      {sellers.length > 0 ? (
        <ListFilter
          param="seller"
          label="Seller"
          options={sellers.map((seller) => ({ value: seller.id, label: seller.label }))}
        />
      ) : null}
      <ListDateRange label="Sold" />
    </ListToolbar>
  );
}

async function SalesTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(saleQuerySchema, raw);
  const hasFilters = Boolean(
    query.q ||
      query.status ||
      query.payment ||
      query.currency ||
      query.seller ||
      query.from ||
      query.to,
  );
  const result = await listSales(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Receipt}
        title="No sales recorded yet"
        description="Recording a sale moves stock, books the cost of goods and posts the receipt to the cash ledger, all in one step."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/sales/new">Record sale</Link>
          </Button>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Receipt}
        title="No sales match these filters"
        description="Try a different search or clear the status filter."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/sales">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  const pageTotals = result.rows
    .filter((row) => row.status === 'confirmed')
    .reduce(
      (sum, row) => ({
        revenue: sum.revenue + row.totalUsdCents,
        cogs: sum.cogs + row.cogsCents,
        gross: sum.gross + row.grossCents,
      }),
      { revenue: 0, cogs: 0, gross: 0 },
    );

  const nextDir = (sort: typeof query.sort) =>
    query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc';

  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-[70px]">Number</TH>
                <THSort
                  href={buildHref({ ...query, sort: 'date', dir: nextDir('date'), page: 1 })}
                  active={query.sort === 'date'}
                  dir={query.dir}
                >
                  Date
                </THSort>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'customer',
                    dir: nextDir('customer'),
                    page: 1,
                  })}
                  active={query.sort === 'customer'}
                  dir={query.dir}
                >
                  Customer
                </THSort>
                <TH>Status</TH>
                <TH numeric>Units</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'revenue',
                    dir: nextDir('revenue'),
                    page: 1,
                  })}
                  active={query.sort === 'revenue'}
                  dir={query.dir}
                  numeric
                >
                  Revenue
                </THSort>
                <TH numeric>Cost</TH>
                <TH numeric>Gross</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'margin',
                    dir: nextDir('margin'),
                    page: 1,
                  })}
                  active={query.sort === 'margin'}
                  dir={query.dir}
                  numeric
                >
                  Margin
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="tabular whitespace-nowrap text-ink">
                    <Link
                      href={`/sales/${row.id}` as Route}
                      className="hover:text-accent hover:underline"
                    >
                      {row.number}
                    </Link>
                  </TD>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {formatDate(row.soldAt)}
                  </TD>
                  <TD className="text-ink-2">{row.customerName ?? '—'}</TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1">
                      {row.paymentStatus ? (
                        <Badge tone={PAYMENT_TONE[row.paymentStatus]}>
                          {PAYMENT_LABELS[row.paymentStatus]}
                        </Badge>
                      ) : (
                        <Badge tone={STATUS_TONE[row.status]}>
                          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </Badge>
                      )}
                      {row.needsReview ? <Badge tone="warning">Needs review</Badge> : null}
                      {row.needsReview && row.reviewReason ? (
                        <span className="max-w-[260px] truncate text-[11px] text-warning">
                          {row.reviewReason}
                        </span>
                      ) : null}
                    </div>
                  </TD>
                  <TD numeric className="text-ink-3">
                    {row.unitCount}
                  </TD>
                  <TD numeric>
                    <Money cents={row.totalUsdCents} size="sm" />
                  </TD>
                  {/* A draft has booked no cost of goods yet, so its margin would read 100%. */}
                  <TD numeric>
                    {row.status === 'draft' ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <Money cents={row.cogsCents} size="sm" tone="muted" />
                    )}
                  </TD>
                  <TD numeric>
                    {row.status === 'draft' ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <Money cents={row.grossCents} size="sm" tone="flow" />
                    )}
                  </TD>
                  <TD numeric>
                    <span className="inline-flex items-center gap-1">
                      {row.status === 'draft' ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <Percent
                          value={
                            row.totalUsdCents === 0 ? 0 : row.grossCents / row.totalUsdCents
                          }
                          className={row.shortfall > 0 ? 'text-warning' : undefined}
                        />
                      )}
                      {row.shortfall > 0 ? (
                        <span
                          title={`${row.shortfall} unit${row.shortfall === 1 ? '' : 's'} had no stock; cost of goods is understated`}
                        >
                          <AlertTriangle className="size-3 text-warning" />
                        </span>
                      ) : null}
                    </span>
                  </TD>
                  <TD className="text-right">
                    <SaleActions
                      id={row.id}
                      number={row.number}
                      status={row.status}
                      totalCents={row.totalCents}
                      paidCents={row.paidCents}
                      paymentStatus={row.paymentStatus}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot className="border-line-subtle border-t bg-inset/60">
              <tr>
                <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={5}>
                  Confirmed, this page
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={pageTotals.revenue} size="sm" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={pageTotals.cogs} size="sm" tone="muted" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={pageTotals.gross} size="sm" tone="flow" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Percent
                    value={pageTotals.revenue === 0 ? 0 : pageTotals.gross / pageTotals.revenue}
                  />
                </td>
                <td />
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {result.rows.map((row) => (
          <MobileRow key={row.id}>
            <Link
              href={`/sales/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MobileRowHeader>
                <span className="min-w-0">
                  <span className="tabular block text-[13px] text-ink">{row.number}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {row.customerName ?? '—'} · {formatDate(row.soldAt)}
                  </span>
                </span>
                <Badge
                  tone={
                    row.paymentStatus
                      ? PAYMENT_TONE[row.paymentStatus]
                      : STATUS_TONE[row.status]
                  }
                  className="shrink-0"
                >
                  {row.paymentStatus
                    ? PAYMENT_LABELS[row.paymentStatus]
                    : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                </Badge>
              </MobileRowHeader>
              {row.needsReview ? (
                <div className="flex flex-col items-start gap-1">
                  <Badge tone="warning">Needs review</Badge>
                  {row.reviewReason ? (
                    <span className="line-clamp-2 text-[11px] text-warning">
                      {row.reviewReason}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <MobileRowMeta>
                <MobileRowMetaItem label="Units">{row.unitCount}</MobileRowMetaItem>
                <MobileRowMetaItem label="Revenue">
                  <Money cents={row.totalUsdCents} size="sm" />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Gross">
                  {row.status === 'draft' ? (
                    '—'
                  ) : (
                    <Money cents={row.grossCents} size="sm" tone="flow" />
                  )}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Margin">
                  {row.status === 'draft' ? (
                    '—'
                  ) : (
                    <Percent
                      value={row.totalUsdCents === 0 ? 0 : row.grossCents / row.totalUsdCents}
                    />
                  )}
                </MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <div className="flex justify-end pt-0.5">
              <SaleActions
                id={row.id}
                number={row.number}
                status={row.status}
                totalCents={row.totalCents}
                paidCents={row.paidCents}
                paymentStatus={row.paymentStatus}
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
  return (search ? `/sales?${search}` : '/sales') as Route;
}
