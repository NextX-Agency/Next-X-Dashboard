import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { RecurringExpenseSheet } from '@/components/forms/recurring-expense-sheet';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import {
  MobileList,
  MobileRow,
  MobileRowActions,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Money } from '@/components/ui/money';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { businessDate } from '@/lib/recurring-expenses';
import { getCurrentMember } from '@/server/auth';
import { listRecurringExpenses } from '@/server/queries/finance';
import {
  listExpenseCategoryOptions,
  listLocationOptions,
  listWalletOptions,
} from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Recurring expenses' };

type Schedule = Awaited<ReturnType<typeof listRecurringExpenses>>[number];

/** The status chip of one schedule: what needs a person, else whether it posts itself. */
function describeSchedule(schedule: Schedule, today: string) {
  const estimated = schedule.amountIsEstimated || schedule.anchorDayIsEstimated;
  const due = schedule.isActive && schedule.autoPost && schedule.nextRunOn <= today;
  const status = !schedule.isActive
    ? 'Paused'
    : schedule.lastError
      ? 'Needs attention'
      : estimated
        ? 'Review estimate'
        : due
          ? 'Due'
          : schedule.autoPost
            ? 'Auto-post'
            : 'Manual';
  const tone =
    schedule.lastError || estimated ? 'warning' : schedule.isActive ? 'positive' : 'neutral';
  return { status, tone } as const;
}

export default async function RecurringExpensesPage() {
  await connection();
  const [member, schedules, categories, locations, wallets] = await Promise.all([
    getCurrentMember(),
    listRecurringExpenses(),
    listExpenseCategoryOptions(),
    listLocationOptions(),
    listWalletOptions(),
  ]);
  const locationOptions = locations.map((location) => ({
    id: location.id,
    label: location.name,
  }));
  const today = businessDate(new Date());
  const canManage = member?.role === 'owner';

  return (
    <>
      <PageHeader
        title="Recurring expenses"
        description="Scheduled operating costs post through the expense and cash ledger. Estimated amounts and low wallet balances wait for review."
        action={
          canManage ? (
            <RecurringExpenseSheet
              categories={categories}
              locations={locationOptions}
              wallets={wallets}
            />
          ) : undefined
        }
      />
      <Surface className="overflow-clip">
        {schedules.length === 0 ? (
          <EmptyState
            Icon={CalendarClock}
            title="No recurring expenses"
            description="Add a schedule for software, rent, or another regular operating cost."
            action={
              canManage ? (
                <RecurringExpenseSheet
                  categories={categories}
                  locations={locationOptions}
                  wallets={wallets}
                />
              ) : undefined
            }
          />
        ) : (
          <>
            <MobileList>
              {schedules.map((schedule) => {
                const { status, tone } = describeSchedule(schedule, today);
                return (
                  <MobileRow key={`m-${schedule.id}`} interactive={false}>
                    <MobileRowHeader>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink">
                          {schedule.name}
                        </span>
                        <span className="block truncate text-[12px] text-ink-3">
                          {schedule.vendorName} · {schedule.categoryName ?? 'Uncategorised'}
                        </span>
                      </span>
                      <Badge tone={tone} className="shrink-0">
                        {status}
                      </Badge>
                    </MobileRowHeader>
                    {schedule.lastError ? (
                      <span className="text-[11px] text-negative">{schedule.lastError}</span>
                    ) : null}
                    <MobileRowMeta>
                      <MobileRowMetaItem label="Next run">
                        {schedule.nextRunOn}
                      </MobileRowMetaItem>
                      <MobileRowMetaItem label="Amount">
                        <Money
                          cents={schedule.amountCents}
                          currency={schedule.currency}
                          size="sm"
                        />
                      </MobileRowMetaItem>
                      <MobileRowMetaItem label="Frequency">
                        <span className="capitalize">{schedule.cadence}</span>
                      </MobileRowMetaItem>
                      <MobileRowMetaItem label="Wallet">
                        {schedule.walletName ?? 'No wallet'}
                      </MobileRowMetaItem>
                    </MobileRowMeta>
                    {canManage ? (
                      <MobileRowActions wide>
                        <RecurringExpenseSheet
                          categories={categories}
                          locations={locationOptions}
                          wallets={wallets}
                          initial={schedule}
                        />
                      </MobileRowActions>
                    ) : null}
                  </MobileRow>
                );
              })}
            </MobileList>
            <TableWrap className="max-lg:hidden">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Schedule</TH>
                    <TH>Frequency</TH>
                    <TH>Next run</TH>
                    <TH>Wallet</TH>
                    <TH numeric>Amount</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {schedules.map((schedule) => {
                    const { status, tone } = describeSchedule(schedule, today);
                    return (
                      <TR key={schedule.id}>
                        <TD>
                          <span className="block text-ink">{schedule.name}</span>
                          <span className="block text-[11px] text-ink-4">
                            {schedule.vendorName} · {schedule.categoryName ?? 'Uncategorised'}
                          </span>
                        </TD>
                        <TD className="capitalize text-ink-3">{schedule.cadence}</TD>
                        <TD className="tabular text-ink-3">{schedule.nextRunOn}</TD>
                        <TD className="text-ink-3">{schedule.walletName ?? 'No wallet'}</TD>
                        <TD numeric>
                          <Money
                            cents={schedule.amountCents}
                            currency={schedule.currency}
                            size="sm"
                          />
                        </TD>
                        <TD>
                          <div className="flex flex-col items-start gap-1">
                            <Badge tone={tone}>{status}</Badge>
                            {schedule.lastError ? (
                              <span className="max-w-56 text-[11px] text-negative">
                                {schedule.lastError}
                              </span>
                            ) : null}
                          </div>
                        </TD>
                        <TD>
                          {canManage ? (
                            <RecurringExpenseSheet
                              categories={categories}
                              locations={locationOptions}
                              wallets={wallets}
                              initial={schedule}
                            />
                          ) : null}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </>
        )}
      </Surface>
    </>
  );
}
