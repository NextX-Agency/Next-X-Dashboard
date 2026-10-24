import { describe, expect, it } from 'vitest';
import { businessDateInput } from '@/lib/business-date';
import { dateInput, saleSchema } from '@/lib/schemas';

describe('businessDateInput', () => {
  it('uses the Paramaribo calendar, not UTC', () => {
    // 22:30 in Paramaribo on 22 October is already 23 October in UTC.
    expect(businessDateInput(new Date('2026-10-23T01:30:00.000Z'))).toBe('2026-10-22');
    expect(businessDateInput(new Date('2026-10-23T03:00:00.000Z'))).toBe('2026-10-23');
  });

  it('never produces a date the server rejects as future', () => {
    // The evening sale that used to fail: 21:30 local, 00:30 UTC next day.
    const now = new Date('2026-10-23T00:30:00.000Z');
    const parsed = dateInput.parse(businessDateInput(now));
    expect(parsed.getTime()).toBeLessThanOrEqual(now.getTime());
  });
});

describe('sale schema', () => {
  const item = {
    variantId: '00000000-0000-4000-8000-000000000001',
    bundleId: null,
    quantity: '2',
    unitPriceCents: '10.00',
  };
  const base = {
    customerId: null,
    sellerId: null,
    soldAt: '2020-01-01',
    currency: 'USD',
    paymentMethod: 'cash',
    items: [item],
  };

  it('accepts an ordinary sale and parses money exactly', () => {
    const parsed = saleSchema.parse(base);
    expect(parsed.items[0]?.unitPriceCents).toBe(1000);
    expect(parsed.confirm).toBe(true);
  });

  it('rejects absurd quantities and prices instead of reaching the database', () => {
    expect(
      saleSchema.safeParse({ ...base, items: [{ ...item, quantity: '1000000000' }] }).success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ ...base, items: [{ ...item, unitPriceCents: '99999999999' }] })
        .success,
    ).toBe(false);
  });

  it('rejects fractional units and a zero price', () => {
    expect(
      saleSchema.safeParse({ ...base, items: [{ ...item, quantity: '1.5' }] }).success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ ...base, items: [{ ...item, unitPriceCents: '0' }] }).success,
    ).toBe(false);
  });

  it('rejects a discount larger than the items', () => {
    expect(saleSchema.safeParse({ ...base, discountCents: '25.00' }).success).toBe(false);
    expect(saleSchema.safeParse({ ...base, discountCents: '20.00' }).success).toBe(true);
  });

  it('carries a retry key and wallet through untouched', () => {
    const parsed = saleSchema.parse({
      ...base,
      idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
      walletId: '00000000-0000-4000-8000-0000000000bb',
    });
    expect(parsed.idempotencyKey).toBe('00000000-0000-4000-8000-0000000000aa');
    expect(parsed.walletId).toBe('00000000-0000-4000-8000-0000000000bb');
  });
});
