import { describe, expect, it } from 'vitest';
import { firstPickupDay, paramariboMinutes, sameDayPickupAllowed } from '@/lib/pickup-dates';

// Paramaribo is UTC-3 all year.
const at = (hhmmLocal: string) => {
  const [h, m] = hhmmLocal.split(':').map(Number);
  return new Date(Date.UTC(2026, 5, 15, (h ?? 0) + 3, m ?? 0));
};

describe('pickup dates', () => {
  it('reads the shop clock in Suriname time', () => {
    expect(paramariboMinutes(at('09:30'))).toBe(9 * 60 + 30);
    expect(paramariboMinutes(new Date('2026-06-15T02:00:00Z'))).toBe(23 * 60); // 23:00 the day before
  });

  it('offers today only when same-day pickup is on', () => {
    expect(
      firstPickupDay({ sameDayPickupEnabled: false, pickupCutoffTime: null }, at('08:00')),
    ).toBe('tomorrow');
    expect(
      firstPickupDay({ sameDayPickupEnabled: true, pickupCutoffTime: null }, at('08:00')),
    ).toBe('today');
  });

  it('stops offering today once the cutoff has passed', () => {
    const settings = { sameDayPickupEnabled: true, pickupCutoffTime: '15:00' };
    expect(sameDayPickupAllowed(settings, at('14:59'))).toBe(true);
    expect(sameDayPickupAllowed(settings, at('15:00'))).toBe(false);
    expect(firstPickupDay(settings, at('17:45'))).toBe('tomorrow');
  });

  it('ignores an unreadable cutoff rather than blocking pickup', () => {
    expect(
      sameDayPickupAllowed(
        { sameDayPickupEnabled: true, pickupCutoffTime: 'after lunch' },
        at('20:00'),
      ),
    ).toBe(true);
  });
});
