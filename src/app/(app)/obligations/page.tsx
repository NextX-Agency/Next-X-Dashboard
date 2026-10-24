import { CircleDollarSign } from 'lucide-react';
import type { Metadata } from 'next';
import {
  FinanceObligationPaymentSheet,
  FinanceObligationSheet,
  ObligationStatus,
} from '@/components/forms/finance-obligations';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import {
  MobileList,
  MobileRow,
  MobileRowActions,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceBody } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { humanise } from '@/lib/format';
import { listFinanceObligations, listWallets } from '@/server/queries/finance';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Obligations' };

export default async function ObligationsPage() {
  const [obligations, wallets] = await Promise.all([listFinanceObligations(), listWallets()]);
  const openCount = obligations.filter(
    (row) => row.status === 'open' || row.status === 'partial',
  ).length;
  return (
    <>
      <PageHeader
        title="Obligations"
        description="Receivables and payables outside sales and purchase orders. Every settlement posts once to its wallet and the finance ledger."
        action={<FinanceObligationSheet />}
      />
      {obligations.length === 0 ? (
        <EmptyState
          Icon={CircleDollarSign}
          title="No obligations recorded"
          description="Add a bill or amount due to start tracking its outstanding balance."
        />
      ) : (
        <Surface>
          <div className="flex items-center justify-between border-line-subtle border-b px-4 py-3">
            <div>
              <h2 className="font-medium text-[13px] text-ink">
                Manual receivables and payables
              </h2>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {openCount} still open · legacy paid amounts remain opening balances
              </p>
            </div>
          </div>
          <SurfaceBody className="p-0">
            <MobileList>
              {obligations.map((row) => (
                <MobileRow key={`m-${row.id}`} interactive={false}>
                  <MobileRowHeader>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink">
                        {row.counterpartyName}
                      </span>
                      <span className="block text-[12px] text-ink-3">
                        {humanise(row.direction)} · issued {row.issuedAt.slice(0, 10)}
                      </span>
                    </span>
                    <ObligationStatus status={row.status} />
                  </MobileRowHeader>
                  <MobileRowMeta>
                    <MobileRowMetaItem label="Due">{row.dueDate ?? '—'}</MobileRowMetaItem>
                    <MobileRowMetaItem label="Original">
                      <Money
                        cents={row.originalAmountCents}
                        currency={row.currency}
                        size="sm"
                      />
                    </MobileRowMetaItem>
                    <MobileRowMetaItem label="Outstanding">
                      <Money cents={row.outstandingCents} currency={row.currency} size="sm" />
                    </MobileRowMetaItem>
                  </MobileRowMeta>
                  {row.outstandingCents > 0 && row.status !== 'cancelled' ? (
                    <MobileRowActions wide>
                      <FinanceObligationPaymentSheet obligation={row} wallets={wallets} />
                    </MobileRowActions>
                  ) : null}
                </MobileRow>
              ))}
            </MobileList>
            <TableWrap className="max-lg:hidden">
              <Table>
                <THead>
                  <tr>
                    <TH>Counterparty</TH>
                    <TH>Type</TH>
                    <TH>Status</TH>
                    <TH>Due</TH>
                    <TH numeric>Original</TH>
                    <TH numeric>Outstanding</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {obligations.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <div className="font-medium text-ink">{row.counterpartyName}</div>
                        <div className="text-[11px] text-ink-4">
                          Issued {row.issuedAt.slice(0, 10)}
                        </div>
                      </TD>
                      <TD>{humanise(row.direction)}</TD>
                      <TD>
                        <ObligationStatus status={row.status} />
                      </TD>
                      <TD>{row.dueDate ?? '—'}</TD>
                      <TD numeric>
                        <Money cents={row.originalAmountCents} currency={row.currency} />
                      </TD>
                      <TD numeric>
                        <Money cents={row.outstandingCents} currency={row.currency} />
                      </TD>
                      <TD>
                        {row.outstandingCents > 0 && row.status !== 'cancelled' ? (
                          <FinanceObligationPaymentSheet obligation={row} wallets={wallets} />
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </SurfaceBody>
        </Surface>
      )}
    </>
  );
}
