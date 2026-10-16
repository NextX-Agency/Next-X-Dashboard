export type RecurringExpenseCadence = 'monthly' | 'weekly' | 'quarterly' | 'yearly';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error('Date must use YYYY-MM-DD format.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('Date is not a valid calendar day.');
  }
  return parsed;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Advances from a scheduled occurrence while preserving the chosen day. */
export function nextRecurringDate(
  currentDate: string,
  cadence: RecurringExpenseCadence,
  anchorDay: number,
): string {
  const current = parseDate(currentDate);
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new Error('Anchor day must be between 1 and 31.');
  }

  if (cadence === 'weekly') {
    current.setUTCDate(current.getUTCDate() + 7);
    return formatDate(current);
  }

  if (cadence === 'yearly') {
    const year = current.getUTCFullYear() + 1;
    const month = current.getUTCMonth();
    const day = Math.min(anchorDay, daysInMonth(year, month));
    return formatDate(new Date(Date.UTC(year, month, day)));
  }

  const monthsToAdd = cadence === 'quarterly' ? 3 : 1;
  const monthIndex = current.getUTCFullYear() * 12 + current.getUTCMonth() + monthsToAdd;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return formatDate(new Date(Date.UTC(year, month, day)));
}

/** Stable uniqueness key for one vendor charge in one recurrence period. */
export function recurringPeriodKey(
  occurrenceDate: string,
  cadence: RecurringExpenseCadence,
): string {
  const date = parseDate(occurrenceDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (cadence === 'monthly') return `${year}-${String(month).padStart(2, '0')}`;
  if (cadence === 'quarterly') return `${year}-Q${Math.ceil(month / 3)}`;
  if (cadence === 'yearly') return String(year);

  const isoWeekDate = new Date(date);
  const isoDay = isoWeekDate.getUTCDay() || 7;
  isoWeekDate.setUTCDate(isoWeekDate.getUTCDate() + 4 - isoDay);
  const weekYear = isoWeekDate.getUTCFullYear();
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const jan4IsoDay = jan4.getUTCDay() || 7;
  const firstMonday = new Date(Date.UTC(weekYear, 0, 4 - jan4IsoDay + 1));
  const week = Math.floor((isoWeekDate.getTime() - firstMonday.getTime()) / 604_800_000) + 1;
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

export const MAX_RECURRING_CATCH_UP_PERIODS = 3;

/** The ledger uses the store's business day, regardless of the host timezone. */
export function businessDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Paramaribo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
