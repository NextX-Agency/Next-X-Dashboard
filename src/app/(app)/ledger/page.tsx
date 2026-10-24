import { Wallet } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LedgerSheet } from '@/components/forms/ledger-sheet';
import { LedgerActions } from '@/components/forms/row-actions';
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
  THSort,
  TR,
} from '@/components/ui/table';
import { formatDate, humanise } from '@/lib/format';
import { ledgerQuerySchema, parseListParams, type RawSearchParams } from '@/lib/list-params';
import { listLedger } from '@/server/queries/lists';
import { listPrincipalOptions, listWalletOptions } from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Cash ledger' };

const CATEGORY_TONE: Record<string, 'positive' | 'negative' | 'accent' | 'neutral'> = {
  owner_contribution: 'accent',
  owner_draw: 'neutral',
  sales_receipt: 'positive',
  purchase: 'negative',
  shipping: 'negative',
  operating: 'negative',
  refund: 'neutral',
  other: 'neutral',
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_TONE).map((value) => ({
  value,
  label: humanise(value),
}));

export default function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Cash ledger"
        description="Append-only. Corrections are made with a reversing entry, never by editing history, and the running balance is computed rather than stored so it cannot go stale."
        action={
          <>
            <ExportCsvLink entity="ledger" searchParams={searchParams} />
            <Suspense
              fallback={
                <Button variant="primary" disabled>
                  Record movement
                </Button>
              }
            >
              <LedgerTrigger />
            </Suspense>
          </>
        }
      />
      <Surface className="overflow-clip">
        <Suspense fallback={<div className="h-14 border-line-subtle border-b" />}>
          <LedgerToolbar />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={5} widths={['w-20', 'w-40', 'w-16']} />}>
          <LedgerTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

const TYPE_OPTIONS = [
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Money out' },
];
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'SRD', label: 'SRD' },
];

async function LedgerToolbar() {
  const wallets = await listWalletOptions({ includeInactive: true });
  return (
    <ListToolbar search={<ListSearch placeholder="Search by description or owner" />}>
      <ListFilter param="category" label="Category" options={CATEGORY_OPTIONS} />
      <ListFilter param="type" label="Type" options={TYPE_OPTIONS} />
      <ListFilter param="currency" label="Currency" options={CURRENCY_OPTIONS} />
      {wallets.length > 0 ? (
        <ListFilter
          param="wallet"
          label="Wallet"
          options={wallets.map((wallet) => ({ value: wallet.id, label: wallet.label }))}
        />
      ) : null}
      <ListDateRange label="Moved" />
    </ListToolbar>
  );
}

async function LedgerTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(ledgerQuerySchema, raw);
  const hasFilters = Boolean(
    query.q ||
      query.category ||
      query.type ||
      query.currency ||
      query.wallet ||
      query.from ||
      query.to,
  );
  const result = await listLedger(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Wallet}
        title="No cash movements yet"
        description="Owner contributions, supplier payments and sales receipts all land here. Entries caused by a document are posted automatically from that document."
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Wallet}
        title="No entries match these filters"
        description="Try a different search or clear a filter."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/ledger">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  const nextDir = query.dir === 'asc' ? 'desc' : 'asc';

  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <THSort
                  href={buildHref({ ...query, dir: nextDir, page: 1 })}
                  active
                  dir={query.dir}
                >
                  Date
                </THSort>
                <TH>Description</TH>
                <TH>Category</TH>
                <TH>Owner</TH>
                <TH>Method</TH>
                <TH>Wallet</TH>
                <TH numeric>Amount</TH>
                <TH numeric>Balance</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {formatDate(row.occurredAt)}
                  </TD>
                  <TD className="text-ink">{row.description}</TD>
                  <TD>
                    <Badge tone={CATEGORY_TONE[row.category] ?? 'neutral'}>
                      {humanise(row.category)}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-3">{row.memberName ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-4">
                    {humanise(row.paymentMethod)}
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-3">
                    {row.walletName ?? 'Legacy'}
                  </TD>
                  <TD numeric>
                    <Money cents={row.netCents} tone="flow" size="sm" signed />
                  </TD>
                  <TD numeric className="text-ink-2">
                    <Money cents={row.balanceCents} size="sm" tone="muted" />
                  </TD>
                  <TD className="text-right">
                    {row.reversible ? (
                      <LedgerActions id={row.id} description={row.description} />
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {result.rows.map((row) => (
          <MobileRow key={row.id} interactive={false}>
            <MobileRowHeader>
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{row.description}</span>
                <span className="block text-[12px] text-ink-3">
                  {formatDate(row.occurredAt)}
                </span>
              </span>
              <Money cents={row.netCents} tone="flow" size="sm" signed className="shrink-0" />
            </MobileRowHeader>
            <MobileRowMeta>
              <MobileRowMetaItem label="Category">
                <Badge tone={CATEGORY_TONE[row.category] ?? 'neutral'}>
                  {humanise(row.category)}
                </Badge>
              </MobileRowMetaItem>
              <MobileRowMetaItem label="Owner">{row.memberName ?? '—'}</MobileRowMetaItem>
              <MobileRowMetaItem label="Method">
                {humanise(row.paymentMethod)}
              </MobileRowMetaItem>
              <MobileRowMetaItem label="Wallet">{row.walletName ?? 'Legacy'}</MobileRowMetaItem>
              <MobileRowMetaItem label="Balance">
                <Money cents={row.balanceCents} size="sm" tone="muted" />
              </MobileRowMetaItem>
            </MobileRowMeta>
            <MobileRowActions>
              {row.reversible ? (
                <LedgerActions id={row.id} description={row.description} />
              ) : null}
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
  return (search ? `/ledger?${search}` : '/ledger') as Route;
}

async function LedgerTrigger() {
  const principals = await listPrincipalOptions();
  return <LedgerSheet principals={principals} />;
}
