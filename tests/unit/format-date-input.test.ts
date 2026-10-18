import { describe, expect, it } from 'vitest';
import { utcDateInput } from '@/lib/format';

describe('utcDateInput', () => {
  it('reads the UTC day, not the day written in the session time zone', () => {
    // 21:00 on the 17th in Paramaribo (-03) is midnight on the 18th in UTC.
    expect(utcDateInput('2026-10-17 21:00:00-03')).toBe('2026-10-18');
    expect(utcDateInput('2026-10-18 00:00:00+00')).toBe('2026-10-18');
    expect(utcDateInput(new Date('2026-10-18T00:00:00Z'))).toBe('2026-10-18');
  });

  it('keeps the day stable when a form saves it back', () => {
    const stored = '2026-10-17 21:00:00-03';
    const asInput = utcDateInput(stored);
    expect(new Date(asInput).toISOString()).toBe(new Date(stored).toISOString());
  });

  it('returns an empty value for nothing or for text that is not a date', () => {
    expect(utcDateInput(null)).toBe('');
    expect(utcDateInput(undefined)).toBe('');
    expect(utcDateInput('not a date')).toBe('');
  });
});
