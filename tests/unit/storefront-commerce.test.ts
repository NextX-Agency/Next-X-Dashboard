import { describe, expect, it } from 'vitest';
import { orderSchema, storefrontProductSchema } from '@/lib/schemas';
import { availableUnits, priceListCurrencyMatches } from '@/lib/storefront-rules';

describe('storefront commerce rules', () => {
  it('centralizes available stock as on hand minus reservations and clamps oversell', () => {
    expect(availableUnits(12, 4)).toBe(8);
    expect(availableUnits(2, 5)).toBe(0);
  });

  it('requires price-list currency to match the storefront', () => {
    expect(priceListCurrencyMatches('USD', 'USD')).toBe(true);
    expect(priceListCurrencyMatches('USD', 'SRD')).toBe(false);
  });

  it('preserves channel assignment overrides and order channel context', () => {
    const storefrontId = '00000000-0000-4000-8000-000000000001';
    const productId = '00000000-0000-4000-8000-000000000002';
    const assignment = storefrontProductSchema.parse({
      storefrontId,
      productId,
      visible: true,
      titleOverride: 'Channel title',
      slugOverride: 'channel-title',
    });
    expect(assignment.titleOverride).toBe('Channel title');
    const order = orderSchema.parse({
      customerId: null,
      storefrontId,
      source: 'web',
      orderDate: '2026-09-20',
      currency: 'USD',
      paymentMethod: 'cash',
      locationId: '00000000-0000-4000-8000-000000000003',
      fulfillmentType: 'pickup',
      items: [{ variantId: productId, quantity: '1', unitPriceCents: '12.50' }],
    });
    expect(order.storefrontId).toBe(storefrontId);
    expect(order.source).toBe('web');
    expect(order.items[0]?.unitPriceCents).toBe(1250);
  });
});
