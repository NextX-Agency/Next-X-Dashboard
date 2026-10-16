import { eq, sql } from 'drizzle-orm';
import { normaliseToUsd } from '@/lib/fx';
import type { CurrencyCode } from '@/lib/money';
import {
  businessDate,
  MAX_RECURRING_CATCH_UP_PERIODS,
  nextRecurringDate,
  recurringPeriodKey,
} from '@/lib/recurring-expenses';
import { db } from '../db/client';
import { expenses, members, notifications, recurringExpenses, wallets } from '../db/schema';
import { postLedgerEntry, walletBalanceCents } from './posting';
import { rateForRecord, rateOn } from './rates';

type DueSchedule = {
  id: string;
  name: string;
  vendor_name: string;
  amount_cents: string;
  currency: CurrencyCode;
  cadence: 'monthly' | 'weekly' | 'quarterly' | 'yearly';
  anchor_day: number;
  wallet_id: string | null;
  location_id: string | null;
  category_id: string | null;
  next_run_on: string;
  amount_is_estimated: boolean;
  anchor_day_is_estimated: boolean;
};

export type RecurringExpenseRun = {
  posted: number;
  alreadyPosted: number;
  skipped: number;
  catchUpLimited: number;
};

const PAYMENT_METHODS = new Set(['cash', 'bank_transfer', 'card', 'other']);
const MAX_SCHEDULES_PER_RUN = 100;

function asDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

async function notifyOwners(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schedule: DueSchedule,
  periodKey: string,
  reason: string,
  detail: string,
): Promise<void> {
  const owners = await tx
    .select({ id: members.id })
    .from(members)
    .where(eq(members.role, 'owner'));
  for (const owner of owners) {
    await tx
      .insert(notifications)
      .values({
        memberId: owner.id,
        type: 'recurring_expense_review',
        title: 'Recurring expense needs attention',
        message: `${schedule.name} was not posted: ${detail}`,
        metadata: { recurringExpenseId: schedule.id, periodKey, reason },
        dedupeKey: `recurring-expense:${schedule.id}:${periodKey}:${reason}`,
      })
      .onConflictDoNothing({ target: [notifications.memberId, notifications.dedupeKey] });
  }
}

/**
 * Posts due auto-post schedules through the same expense and ledger path as a
 * manual expense. The schedule row lock serialises overlapping workers and
 * the expense partial unique index is the final exactly-once guard.
 */
export async function runDueRecurringExpenses(now = new Date()): Promise<RecurringExpenseRun> {
  const today = businessDate(now);
  return db.transaction(async (tx) => {
    const schedules = await tx.execute<DueSchedule>(sql`
      SELECT id, name, vendor_name, amount_cents::text, currency::text, cadence::text,
             anchor_day, wallet_id, location_id, category_id, next_run_on::text,
             amount_is_estimated, anchor_day_is_estimated
        FROM recurring_expenses
       WHERE is_active = true AND auto_post = true AND next_run_on <= ${today}::date
       ORDER BY next_run_on, id
       LIMIT ${MAX_SCHEDULES_PER_RUN}
       FOR UPDATE SKIP LOCKED
    `);

    const result: RecurringExpenseRun = {
      posted: 0,
      alreadyPosted: 0,
      skipped: 0,
      catchUpLimited: 0,
    };
    const nowAt = now;

    for (const schedule of schedules) {
      let nextRunOn = asDateString(schedule.next_run_on);
      let lastPostedAt: Date | undefined;
      let lastError: string | null = null;
      let attempted = 0;

      while (nextRunOn <= today && attempted < MAX_RECURRING_CATCH_UP_PERIODS) {
        attempted += 1;
        const periodKey = recurringPeriodKey(nextRunOn, schedule.cadence);

        if (schedule.amount_is_estimated || schedule.anchor_day_is_estimated) {
          const reason = schedule.amount_is_estimated ? 'estimated_amount' : 'estimated_date';
          const detail = schedule.amount_is_estimated
            ? 'the amount is still marked as an estimate; confirm it in the schedule first.'
            : 'the billing day is still marked as an estimate; confirm it in the schedule first.';
          lastError = detail;
          result.skipped += 1;
          await notifyOwners(tx, schedule, periodKey, reason, detail);
          break;
        }

        const [existingExpense] = await tx
          .select({ id: expenses.id })
          .from(expenses)
          .where(
            sql`${expenses.recurringExpenseId} = ${schedule.id}
              AND ${expenses.periodKey} = ${periodKey}`,
          )
          .limit(1);
        if (existingExpense) {
          result.alreadyPosted += 1;
          nextRunOn = nextRecurringDate(nextRunOn, schedule.cadence, schedule.anchor_day);
          continue;
        }

        if (!schedule.wallet_id) {
          const detail = 'no wallet is assigned.';
          lastError = detail;
          result.skipped += 1;
          await notifyOwners(tx, schedule, periodKey, 'missing_wallet', detail);
          break;
        }

        await tx.execute(
          sql`SELECT id FROM wallets WHERE id = ${schedule.wallet_id} FOR UPDATE`,
        );
        const [wallet] = await tx
          .select({ currency: wallets.currency, kind: wallets.kind, active: wallets.active })
          .from(wallets)
          .where(eq(wallets.id, schedule.wallet_id))
          .limit(1);
        if (!wallet?.active || wallet.currency !== schedule.currency) {
          const detail = !wallet?.active
            ? 'the assigned wallet is missing or inactive.'
            : 'the assigned wallet currency no longer matches the schedule.';
          lastError = detail;
          result.skipped += 1;
          await notifyOwners(tx, schedule, periodKey, 'invalid_wallet', detail);
          break;
        }

        const amountCents = Number(schedule.amount_cents);
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
          throw new Error(`Recurring schedule ${schedule.id} has an invalid amount.`);
        }
        const balance = await walletBalanceCents(tx, schedule.wallet_id);
        if (balance < amountCents) {
          const detail = 'the assigned wallet balance is too low; no cash entry was created.';
          lastError = detail;
          result.skipped += 1;
          await notifyOwners(tx, schedule, periodKey, 'insufficient_balance', detail);
          break;
        }

        const occurredAt = new Date(`${nextRunOn}T00:00:00.000Z`);
        let rateMicros: number;
        try {
          rateMicros =
            schedule.currency === 'SRD'
              ? await rateOn(occurredAt, tx)
              : await rateForRecord(occurredAt, tx);
        } catch {
          const detail = 'no usable exchange rate is available for the scheduled date.';
          lastError = detail;
          result.skipped += 1;
          await notifyOwners(tx, schedule, periodKey, 'missing_exchange_rate', detail);
          break;
        }

        const description = `${schedule.name} — ${schedule.vendor_name}`;
        const [expense] = await tx
          .insert(expenses)
          .values({
            description,
            categoryId: schedule.category_id,
            recurringExpenseId: schedule.id,
            periodKey,
            currency: schedule.currency,
            fxRateMicros: rateMicros,
            amountCents,
            amountUsdCents: normaliseToUsd(amountCents, schedule.currency, rateMicros),
            paymentMethod: PAYMENT_METHODS.has(wallet.kind)
              ? (wallet.kind as 'cash' | 'bank_transfer' | 'card' | 'other')
              : 'other',
            walletId: schedule.wallet_id,
            locationId: schedule.location_id,
            occurredAt,
            notes: `Automatically posted for period ${periodKey}.`,
            createdById: null,
          })
          .onConflictDoNothing()
          .returning({ id: expenses.id });

        if (!expense) {
          result.alreadyPosted += 1;
        } else {
          await postLedgerEntry(tx, {
            direction: 'out',
            category: 'operating',
            description,
            currency: schedule.currency,
            rateMicros,
            amountCents,
            paymentMethod: PAYMENT_METHODS.has(wallet.kind)
              ? (wallet.kind as 'cash' | 'bank_transfer' | 'card' | 'other')
              : 'other',
            occurredAt,
            memberId: null,
            sourceKind: 'expense',
            sourceId: expense.id,
            walletId: schedule.wallet_id,
            locationId: schedule.location_id,
            eventType: 'expense_recurring',
            notes: `Recurring schedule ${schedule.id}; period ${periodKey}.`,
          });
          result.posted += 1;
          lastPostedAt = nowAt;
        }

        nextRunOn = nextRecurringDate(nextRunOn, schedule.cadence, schedule.anchor_day);
      }

      if (nextRunOn <= today && attempted >= MAX_RECURRING_CATCH_UP_PERIODS && !lastError) {
        lastError =
          'Catch-up limit reached; remaining due periods will be processed by the next run.';
        result.catchUpLimited += 1;
      }

      await tx
        .update(recurringExpenses)
        .set({
          nextRunOn,
          lastPostedAt: lastPostedAt ?? undefined,
          lastAttemptAt: nowAt,
          lastError,
          updatedAt: nowAt,
        })
        .where(eq(recurringExpenses.id, schedule.id));
    }

    return result;
  });
}
