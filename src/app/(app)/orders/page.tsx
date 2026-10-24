import { ClipboardList } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { OrderActions } from '@/components/forms/order-actions';
import { EmptyState } from '@/components/patterns/empty-state';
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
  MobileRowActions,
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
  TR,
} from '@/components/ui/table';
import { formatDate, humanise } from '@/lib/format';
import { orderQuerySchema, parseListParams, type RawSearchParams } from '@/lib/list-params';
import { listOrders } from '@/server/queries/lists';
import { listCustomerOptions } from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Orders' };

const STATUS_TONE = {
  draft: 'neutral',
  confirmed: 'info',
  ready: 'warning',
  completed: 'positive',
  cancelled: 'negative',
} as const;
const STATUS_OPTIONS = Object.entries(STATUS_TONE).map(([value, label]) => ({
  value,
  label: humanise(label),
}));

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Orders"
        action={
          <Button asChild variant="primary">
            <Link href={'/orders/new' as Route}>New order</Link>
          </Button>
        }
      />
      <Surface className="overflow-clip">
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <OrdersToolbar />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={4} widths={['w-20', 'w-36', 'w-20']} />}>
          <OrdersTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

const PAYMENT_OPTIONS = [
  { value: 'paid', label: 'Paid in full' },
  { value: 'partly', label: 'Partly paid' },
  { value: 'unpaid', label: 'Nothing paid' },
];

async function OrdersToolbar() {
  const customers = await listCustomerOptions();
  return (
    <ListToolbar search={<ListSearch placeholder="Order number or customer" />}>
      <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
      <ListFilter param="payment" label="Payment" options={PAYMENT_OPTIONS} />
      {customers.length > 0 ? (
        <ListFilter
          param="customer"
          label="Customer"
          options={customers.map((customer) => ({ value: customer.id, label: customer.label }))}
        />
      ) : null}
      <ListDateRange label="Ordered" />
    </ListToolbar>
  );
}

async function OrdersTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const query = parseListParams(orderQuerySchema, await searchParams);
  const result = await listOrders(query);
  const hasFilters = Boolean(
    query.q || query.status || query.payment || query.customer || query.from || query.to,
  );
  if (!result.rows.length) {
    return (
      <EmptyState
        Icon={ClipboardList}
        title={hasFilters ? 'No orders match these filters' : 'No orders yet'}
        description={
          hasFilters
            ? 'Try a different search or clear the filter.'
            : 'Create a draft order, then confirm it when stock is available.'
        }
        action={
          hasFilters ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={'/orders' as Route}>Clear filters</Link>
            </Button>
          ) : (
            <Button asChild variant="primary" size="sm">
              <Link href={'/orders/new' as Route}>New order</Link>
            </Button>
          )
        }
      />
    );
  }
  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Number</TH>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Status</TH>
                <TH>Fulfillment</TH>
                <TH numeric>Units</TH>
                <TH numeric>Total</TH>
                <TH numeric>Balance</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="tabular whitespace-nowrap">
                    <Link
                      href={`/orders/${row.id}` as Route}
                      className="text-ink hover:text-accent hover:underline"
                    >
                      {row.number}
                    </Link>
                  </TD>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {formatDate(row.orderedAt)}
                  </TD>
                  <TD className="text-ink-2">{row.customerName ?? 'Walk-in customer'}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[row.status]}>{humanise(row.status)}</Badge>
                  </TD>
                  <TD className="capitalize text-ink-3">{row.fulfillmentType ?? '—'}</TD>
                  <TD numeric className="text-ink-3">
                    {row.unitCount}
                  </TD>
                  <TD numeric>
                    <Money
                      cents={row.totalCents}
                      currency={row.currency as 'USD' | 'SRD'}
                      size="sm"
                    />
                  </TD>
                  <TD numeric>
                    {row.balanceCents > 0 ? (
                      <Money
                        cents={row.balanceCents}
                        currency={row.currency as 'USD' | 'SRD'}
                        size="sm"
                        tone="flow"
                      />
                    ) : (
                      <span className="text-[12px] text-ink-4">Settled</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <OrderActions
                      id={row.id}
                      number={row.number}
                      status={row.status}
                      totalCents={row.totalCents}
                      paidCents={row.paidCents}
                      currency={row.currency as 'USD' | 'SRD'}
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
              href={`/orders/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control"
            >
              <MobileRowHeader>
                <span>
                  <span className="tabular block text-[13px] text-ink">{row.number}</span>
                  <span className="text-[12px] text-ink-3">
                    {row.customerName ?? 'Walk-in customer'}
                  </span>
                </span>
                <Badge tone={STATUS_TONE[row.status]}>{humanise(row.status)}</Badge>
              </MobileRowHeader>
              <MobileRowMeta>
                <MobileRowMetaItem label="Date">{formatDate(row.orderedAt)}</MobileRowMetaItem>
                <MobileRowMetaItem label="Fulfillment">
                  {row.fulfillmentType ?? '—'}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Total">
                  <Money
                    cents={row.totalCents}
                    currency={row.currency as 'USD' | 'SRD'}
                    size="sm"
                  />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Units">{row.unitCount}</MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <MobileRowActions>
              <OrderActions
                id={row.id}
                number={row.number}
                status={row.status}
                totalCents={row.totalCents}
                paidCents={row.paidCents}
                currency={row.currency as 'USD' | 'SRD'}
              />
            </MobileRowActions>
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
  return (search ? `/orders?${search}` : '/orders') as Route;
}
