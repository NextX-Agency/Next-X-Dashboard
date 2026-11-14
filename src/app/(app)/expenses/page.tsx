import { Coins } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ExpenseSheet } from '@/components/forms/expense-sheet';
import { ExpenseActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import { ListDateRange, ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
import { PageHeader } from '@/components/patterns/page-header';
import { BreakdownBars } from '@/components/patterns/page-lead';
import { EXPENSE_TABS, PageTabs } from '@/components/patterns/page-tabs';
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
import {
  EXPENSE_CLASSIFICATION_LABELS,
  isExpenseClassification,
} from '@/lib/expense-classification';
import { formatDate, humanise } from '@/lib/format';
import { expenseQuerySchema, parseListParams, type RawSearchParams } from '@/lib/list-params';
import { listExpenses } from '@/server/queries/lists';
import { listExpenseCategoryOptions, listWalletBalanceChoices } from '@/server/queries/pickers';
import { getExpensePulse } from '@/server/queries/summaries';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Expenses' };

export default function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Running costs only. Anything paid to get goods into stock belongs on the purchase order instead, where it becomes part of the cost of those goods."
        action={
          <>
            <ExportCsvLink entity="expenses" searchParams={searchParams} />
            <Suspense
              fallback={
                <Button variant="primary" disabled>
                  Log expense
                </Button>
              }
            >
              <ExpenseTrigger />
            </Suspense>
          </>
        }
      />
      <PageTabs label="Expense views" tabs={EXPENSE_TABS} current={'/expenses' as Route} />
      <Suspense
        fallback={
          <div className="mb-3 h-[150px] rounded-card border border-line-subtle bg-raised sm:mb-4" />
        }
      >
        <ExpensesLead />
      </Suspense>
      <Surface className="overflow-clip">
        <ListToolbar search={<ListSearch placeholder="Search by description or category" />}>
          <ListDateRange label="Spent" />
        </ListToolbar>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-20', 'w-44', 'w-16']} />}>
          <ExpensesTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

/** This month against last, and where this month's money went. */
async function ExpensesLead() {
  const pulse = await getExpensePulse();
  const delta = pulse.month.cents - pulse.lastMonth.cents;
  return (
    <Surface className="mb-3 grid gap-x-8 gap-y-4 p-4 sm:mb-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div>
        <p className="text-[12px] text-ink-3">Spent this month</p>
        <Money cents={pulse.month.cents} size="display" className="mt-1.5 block" />
        <p className="mt-2 text-[12px] text-ink-3">
          {pulse.lastMonth.cents === 0 ? (
            'Nothing recorded last month'
          ) : (
            <>
              <Money cents={Math.abs(delta)} size="sm" />{' '}
              {delta > 0 ? 'more' : delta < 0 ? 'less' : 'the same'} than last month
            </>
          )}
        </p>
        {pulse.needsReview > 0 ? (
          <p className="mt-2 text-[12px] text-accent">
            {pulse.needsReview} {pulse.needsReview === 1 ? 'entry needs' : 'entries need'}{' '}
            review
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-[12px] text-ink-3">By category, this month</p>
        <BreakdownBars rows={pulse.categories} empty="No expenses recorded this month yet." />
      </div>
    </Surface>
  );
}

async function ExpensesTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(expenseQuerySchema, raw);
  const hasFilters = Boolean(query.q || query.from || query.to);
  const [result, categories] = await Promise.all([
    listExpenses(query),
    listExpenseCategoryOptions(),
  ]);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Coins}
        title="No expenses logged"
        description="Marketing, software, transport and packaging go here. They reduce the net result on the Overview but never touch the cost of a product."
        action={
          <Suspense fallback={null}>
            <ExpenseTrigger />
          </Suspense>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Coins}
        title="No expenses match these filters"
        description="Try a different description, category or dates."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/expenses">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  const pageTotal = result.rows.reduce((sum, row) => sum + row.amountUsdCents, 0);

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
                  href={buildHref({ ...query, sort: 'date', dir: nextDir('date'), page: 1 })}
                  active={query.sort === 'date'}
                  dir={query.dir}
                >
                  Date
                </THSort>
                <TH>Description</TH>
                <TH>Category</TH>
                <TH>Method</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'amount',
                    dir: nextDir('amount'),
                    page: 1,
                  })}
                  active={query.sort === 'amount'}
                  dir={query.dir}
                  numeric
                >
                  Amount
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {formatDate(row.occurredAt)}
                  </TD>
                  <TD>
                    <span className="text-ink">{row.description}</span>
                    {row.vendorName ? (
                      <span className="mt-0.5 block text-[11px] text-ink-4">
                        {row.vendorName}
                      </span>
                    ) : null}
                    {row.receiptNumber ? (
                      <span className="mt-0.5 block text-[11px] text-ink-4">
                        Receipt ref. {row.receiptNumber}
                      </span>
                    ) : null}
                    {row.needsReview ? (
                      <span className="mt-1 block text-[11px] text-warning">
                        Review required{row.reviewReason ? `: ${row.reviewReason}` : ''}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <Badge>{row.categoryName ?? 'Uncategorised'}</Badge>
                      <Badge tone="neutral">
                        {isExpenseClassification(row.classification)
                          ? EXPENSE_CLASSIFICATION_LABELS[row.classification]
                          : 'Needs classification'}
                      </Badge>
                      {row.voidedAt ? <Badge tone="neutral">Voided</Badge> : null}
                      {row.needsReview ? <Badge tone="warning">Needs review</Badge> : null}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-4">
                    {row.walletName ?? humanise(row.paymentMethod)}
                  </TD>
                  <TD numeric>
                    <Money cents={row.amountUsdCents} size="sm" />
                  </TD>
                  <TD className="text-right">
                    <ExpenseActions
                      id={row.id}
                      description={row.description}
                      vendorName={row.vendorName}
                      classification={row.classification}
                      needsReview={row.needsReview}
                      receiptNumber={row.receiptNumber}
                      categoryId={row.categoryId}
                      occurredDate={row.occurredDate}
                      currency={row.currency as 'USD' | 'SRD'}
                      amountCents={row.amountCents}
                      amountUsdCents={row.amountUsdCents}
                      paymentMethod={row.paymentMethod}
                      notes={row.notes}
                      hasLedgerEntry={row.hasLedgerEntry}
                      hasReceipt={row.hasReceipt}
                      voidedAt={row.voidedAt}
                      categories={categories}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot className="border-line-subtle border-t bg-inset/60">
              <tr>
                <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={4}>
                  {result.rows.length} expenses, this page
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={pageTotal} size="sm" />
                </td>
                <td />
              </tr>
            </tfoot>
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
                {row.receiptNumber ? (
                  <span className="block truncate text-[11px] text-ink-4">
                    Receipt ref. {row.receiptNumber}
                  </span>
                ) : null}
                {row.vendorName ? (
                  <span className="block truncate text-[11px] text-ink-4">
                    {row.vendorName}
                  </span>
                ) : null}
                {row.needsReview ? (
                  <span className="block text-[11px] text-warning">
                    Review required{row.reviewReason ? `: ${row.reviewReason}` : ''}
                  </span>
                ) : null}
              </span>
              <Money cents={row.amountUsdCents} size="sm" className="shrink-0" />
            </MobileRowHeader>
            <MobileRowMeta>
              <MobileRowMetaItem label="Classification">
                {isExpenseClassification(row.classification)
                  ? EXPENSE_CLASSIFICATION_LABELS[row.classification]
                  : 'Needs classification'}
              </MobileRowMetaItem>
              <MobileRowMetaItem label="Category">
                {row.categoryName ?? 'Uncategorised'}
              </MobileRowMetaItem>
              <MobileRowMetaItem label="Method">
                {row.walletName ?? humanise(row.paymentMethod)}
              </MobileRowMetaItem>
            </MobileRowMeta>
            <MobileRowActions wide>
              <ExpenseActions
                id={row.id}
                description={row.description}
                vendorName={row.vendorName}
                classification={row.classification}
                needsReview={row.needsReview}
                receiptNumber={row.receiptNumber}
                categoryId={row.categoryId}
                occurredDate={row.occurredDate}
                currency={row.currency as 'USD' | 'SRD'}
                amountCents={row.amountCents}
                amountUsdCents={row.amountUsdCents}
                paymentMethod={row.paymentMethod}
                notes={row.notes}
                hasLedgerEntry={row.hasLedgerEntry}
                hasReceipt={row.hasReceipt}
                voidedAt={row.voidedAt}
                categories={categories}
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
  return (search ? `/expenses?${search}` : '/expenses') as Route;
}

/** The sheet reads the URL, so it renders behind its own boundary. */
async function ExpenseTrigger() {
  const [categories, wallets] = await Promise.all([
    listExpenseCategoryOptions(),
    listWalletBalanceChoices(),
  ]);
  return <ExpenseSheet categories={categories} wallets={wallets} />;
}
