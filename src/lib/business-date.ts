/**
 * The business calendar.
 *
 * NextX trades in Suriname (America/Paramaribo, UTC-3, no daylight saving).
 * `new Date().toISOString().slice(0, 10)` is the UTC date, which is already
 * "tomorrow" from 21:00 local time. A sale form defaulting to that date then
 * failed server validation ("cannot be dated in the future") for every evening
 * sale. Every date a staff member sees as "today" must come from here.
 *
 * The server still reads a date input as UTC midnight of that calendar day
 * (`dateInput` in `schemas.ts`), which is never in the future relative to the
 * Paramaribo day it was derived from.
 */

export const BUSINESS_TIME_ZONE = 'America/Paramaribo';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` for the given instant on the business calendar. */
export function businessDateInput(now: Date = new Date()): string {
  const parts = formatter.formatToParts(now);
  const pick = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}
