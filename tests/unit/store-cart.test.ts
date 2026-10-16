import { describe, expect, it } from 'vitest';
import {
  addStoreCartLine,
  applyStoreCartQuote,
  parseStoreCart,
  type StoreCartLine,
  storeCartCount,
  storeCartSubtotal,
  updateStoreCartQuantity,
} from '@/lib/store-cart';

const line: StoreCartLine = {
  productId: 'product-1',
  productSlug: 'lamp',
  productName: 'Smart lamp',
  variantId: 'variant-1',
  variantName: 'Warm white',
  sku: 'LAMP-1',
  quantity: 1,
  priceCents: 1299,
  currency: 'USD',
  available: 3,
};

describe('store cart', () => {
  it('adds a variant and increments its quantity while refreshing its price', () => {
    const first = addStoreCartLine([], line);
    const second = addStoreCartLine(first.lines, { ...line, priceCents: 1399 });

    expect(first.added).toBe(true);
    expect(second.added).toBe(true);
    expect(second.lines).toEqual([{ ...line, priceCents: 1399, quantity: 2 }]);
  });

  it('refuses additions beyond available stock but preserves a changed quantity for revalidation', () => {
    const first = addStoreCartLine([], { ...line, quantity: 2 });
    const second = addStoreCartLine(first.lines, { ...line, quantity: 2, priceCents: 1499 });

    expect(second.added).toBe(false);
    expect(second.lines).toEqual([{ ...line, quantity: 2, priceCents: 1499 }]);
    expect(updateStoreCartQuantity(second.lines, line.variantId, 7)).toEqual([
      { ...line, quantity: 7, priceCents: 1499 },
    ]);
  });

  it('does not silently lower a saved quantity when adding against reduced stock', () => {
    const result = addStoreCartLine([{ ...line, quantity: 5 }], {
      ...line,
      quantity: 1,
      available: 3,
    });

    expect(result.added).toBe(false);
    expect(result.lines).toEqual([{ ...line, quantity: 5, available: 3 }]);
  });

  it('keeps different products in one cart and totals them in the storefront currency', () => {
    const secondLine: StoreCartLine = {
      ...line,
      productId: 'product-2',
      productSlug: 'switch',
      productName: 'Smart switch',
      variantId: 'variant-2',
      variantName: 'Single pack',
      sku: 'SWITCH-1',
      priceCents: 999,
    };
    const first = addStoreCartLine([], line);
    const second = addStoreCartLine(first.lines, secondLine);

    expect(second.added).toBe(true);
    expect(second.lines).toHaveLength(2);
    expect(storeCartCount(second.lines)).toBe(2);
    expect(storeCartSubtotal(second.lines, 'USD')).toBe(2298);
  });

  it('removes a line at zero and retains it when stock disappears for explicit removal', () => {
    expect(updateStoreCartQuantity([line], line.variantId, 0)).toEqual([]);
    expect(updateStoreCartQuantity([{ ...line, available: 0 }], line.variantId, 1)).toEqual([
      { ...line, available: 0 },
    ]);
  });

  it('parses local storage defensively and counts/sums only valid lines', () => {
    const parsed = parseStoreCart(JSON.stringify([line, line, { ...line, quantity: -4 }]));
    expect(parsed).toEqual([line]);
    expect(parseStoreCart('{broken')).toEqual([]);
    expect(storeCartCount(parsed)).toBe(1);
    expect(
      storeCartSubtotal([line, { ...line, variantId: 'variant-2', currency: 'SRD' }], 'USD'),
    ).toBe(1299);
  });

  it('replaces cached price and stock with a current storefront quote', () => {
    const result = applyStoreCartQuote([line], [{ ...line, priceCents: 1499, available: 2 }]);

    expect(result).toEqual({
      lines: [{ ...line, priceCents: 1499, available: 2 }],
      unavailableVariantIds: [],
    });
  });

  it('preserves requested quantity and blocks variants that are no longer public', () => {
    const result = applyStoreCartQuote([{ ...line, quantity: 2 }], []);

    expect(result).toEqual({
      lines: [{ ...line, quantity: 2, available: 0 }],
      unavailableVariantIds: [line.variantId],
    });
  });

  it('shows a current stock reduction without silently lowering the requested quantity', () => {
    const result = applyStoreCartQuote([{ ...line, quantity: 3 }], [{ ...line, available: 1 }]);

    expect(result.lines).toEqual([{ ...line, quantity: 3, available: 1 }]);
    expect(result.unavailableVariantIds).toEqual([]);
  });
});
