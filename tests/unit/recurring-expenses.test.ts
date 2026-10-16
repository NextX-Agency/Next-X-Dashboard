import { describe, expect, it } from 'vitest';
import {
  businessDate,
  MAX_RECURRING_CATCH_UP_PERIODS,
  nextRecurringDate,
  recurringPeriodKey,
} from '@/lib/recurring-expenses';

describe('recurring expense calendar rules', () => {
  it('clamps month ends while retaining the configured anchor day', () => {
    expect(nextRecurringDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(nextRecurringDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(nextRecurringDate('2028-02-29', 'yearly', 29)).toBe('2029-02-28');
  });

  it('advances weekly and quarterly schedules by their cadence', () => {
    expect(nextRecurringDate('2026-09-23', 'weekly', 23)).toBe('2026-09-30');
    expect(nextRecurringDate('2026-01-31', 'quarterly', 31)).toBe('2026-04-30');
  });

  it('creates unique monthly, quarterly, yearly and ISO-week period keys', () => {
    expect(recurringPeriodKey('2026-09-23', 'monthly')).toBe('2026-09');
    expect(recurringPeriodKey('2026-09-23', 'quarterly')).toBe('2026-Q3');
    expect(recurringPeriodKey('2026-09-23', 'yearly')).toBe('2026');
    expect(recurringPeriodKey('2021-01-01', 'weekly')).toBe('2020-W53');
  });

  it('caps catch-up so a long outage cannot post an unbounded number of expenses', () => {
    expect(MAX_RECURRING_CATCH_UP_PERIODS).toBe(3);
  });

  it('uses the Paramaribo business day instead of the server UTC date', () => {
    expect(businessDate(new Date('2026-09-23T02:00:00.000Z'))).toBe('2026-09-22');
  });

  it('rejects invalid dates and anchors', () => {
    expect(() => nextRecurringDate('2026-02-30', 'monthly', 1)).toThrow();
    expect(() => nextRecurringDate('2026-01-01', 'monthly', 32)).toThrow();
  });
});
