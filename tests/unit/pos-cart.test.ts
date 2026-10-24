import { describe, expect, it } from 'vitest';
import {
  addToCart,
  type Cart,
  cartBlocker,
  cartFingerprint,
  computeTotals,
  convertAmount,
  discountCents,
  emptyCart,
  listPriceIn,
  reconcileCart,
  removeLine,
  restoreLine,
  roundForCurrency,
  saleNotes,
  setCurrency,
  setLineNote,
  setOverride,
  setQuantity,
} from '@/lib/pos/cart';
import type { Sellable } from '@/lib/pos/types';

const RATE = 38_500_000; // 38.5 SRD per USD

let counter = 0;
const id = () => `id-${++counter}`;

const sellable = (patch: Partial<Sellable> = {}): Sellable => ({
  key: 'v:a',
  kind: 'variant',
  variantId: 'a',
  bundleId: null,
  productId: 'p-a',
  name: 'KZ ZS10 Pro X',
  option: 'Black',
  sku: 'KZ-ZS10-BLK',
  brand: 'KZ',
  category: 'In-ear monitors',
  model: null,
  attributes: [],
  listPriceCents: 4_000, // $40.00
  onHand: 5,
  reserved: 0,
  valueCents: 10_000, // $20.00 each
  referenceCostCents: 2_000,
  bundleCostCents: 0,
  image: null,
  components: [],
  ...patch,
});

const A = sellable();
const B = sellable({
  key: 'v:b',
  variantId: 'b',
  productId: 'p-b',
  name: 'Essager 1m Aux',
  option: null,
  sku: 'ESSAGER-1M-AUX',
  listPriceCents: 250,
  valueCents: 500,
  onHand: 5,
});
const catalog = new Map([A, B].map((item) => [item.key, item]));
const lookup = (key: string) => catalog.get(key);

describe('prices by currency', () => {
  it('shows the USD list price untouched in USD', () => {
    expect(listPriceIn(4_000, 'USD', RATE)).toBe(4_000);
  });

  it('converts to SRD and rounds to a whole dollar', () => {
    // 40.00 USD x 38.5 = 1,540.00 SRD
    expect(listPriceIn(4_000, 'SRD', RATE)).toBe(154_000);
    // 2.50 USD x 38.5 = 96.25 SRD -> 96 SRD
    expect(listPriceIn(250, 'SRD', RATE)).toBe(9_600);
  });

  it('never rounds a real price down to nothing, and leaves a zero price at zero', () => {
    expect(listPriceIn(1, 'SRD', RATE)).toBe(100);
    expect(listPriceIn(0, 'SRD', RATE)).toBe(0);
  });

  it('rounds SRD to whole dollars and USD never', () => {
    expect(roundForCurrency(12_349, 'SRD')).toBe(12_300);
    expect(roundForCurrency(12_350, 'SRD')).toBe(12_400);
    expect(roundForCurrency(12_349, 'USD')).toBe(12_349);
  });

  it('converts a typed amount between currencies at the rate', () => {
    expect(convertAmount(3_000, 'USD', 'SRD', RATE)).toBe(115_500);
    expect(convertAmount(115_500, 'SRD', 'USD', RATE)).toBe(3_000);
    expect(convertAmount(500, 'USD', 'USD', RATE)).toBe(500);
  });
});

describe('changing the cart', () => {
  it('adds an item once and raises its quantity when it is added again', () => {
    let cart = emptyCart('USD', id);
    cart = addToCart(cart, A, 1, id).cart;
    cart = addToCart(cart, A, 2, id).cart;
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.quantity).toBe(3);
  });

  it('keeps different items on different lines', () => {
    let cart = emptyCart('USD', id);
    cart = addToCart(cart, A, 1, id).cart;
    cart = addToCart(cart, B, 1, id).cart;
    expect(cart.lines.map((line) => line.sellableKey)).toEqual(['v:a', 'v:b']);
  });

  it('clamps the quantity to a sensible whole number', () => {
    let { cart, lineKey } = addToCart(emptyCart('USD', id), A, 1, id);
    cart = setQuantity(cart, lineKey, 0);
    expect(cart.lines[0]?.quantity).toBe(1);
    cart = setQuantity(cart, lineKey, 2.9);
    expect(cart.lines[0]?.quantity).toBe(2);
    cart = setQuantity(cart, lineKey, 10_000_000);
    expect(cart.lines[0]?.quantity).toBe(100_000);
  });

  it('removes a line and puts it back at the same place for Undo', () => {
    let cart = emptyCart('USD', id);
    cart = addToCart(cart, A, 1, id).cart;
    cart = addToCart(cart, B, 1, id).cart;
    const firstKey = cart.lines[0]?.key ?? '';
    const removal = removeLine(cart, firstKey);
    expect(removal.cart.lines).toHaveLength(1);
    expect(removal.index).toBe(0);
    const back = restoreLine(
      removal.cart,
      removal.removed as NonNullable<typeof removal.removed>,
      0,
    );
    expect(back.lines.map((line) => line.sellableKey)).toEqual(['v:a', 'v:b']);
    // Restoring twice does not duplicate the line.
    expect(
      restoreLine(back, removal.removed as NonNullable<typeof removal.removed>, 0).lines,
    ).toHaveLength(2);
  });

  it('removing a line that is not there changes nothing', () => {
    const cart = emptyCart('USD', id);
    expect(removeLine(cart, 'nope')).toEqual({ cart, removed: null, index: -1 });
  });

  it('carries typed prices, an amount discount and clears the wallet when the currency changes', () => {
    let { cart, lineKey } = addToCart(emptyCart('USD', id), A, 1, id);
    cart = setOverride(cart, lineKey, 3_000);
    cart = { ...cart, walletId: 'usd-cash', discount: { mode: 'amount', value: '2.00' } };
    const srd = setCurrency(cart, 'SRD', RATE);
    expect(srd.currency).toBe('SRD');
    expect(srd.walletId).toBeNull();
    expect(srd.lines[0]?.overrideCents).toBe(115_500);
    expect(srd.discount).toEqual({ mode: 'amount', value: '77.00' });
  });

  it('leaves a percent discount and list-priced lines alone on a currency change', () => {
    let { cart } = addToCart(emptyCart('USD', id), A, 1, id);
    cart = { ...cart, discount: { mode: 'percent', value: '10' } };
    const srd = setCurrency(cart, 'SRD', RATE);
    expect(srd.discount).toEqual({ mode: 'percent', value: '10' });
    expect(srd.lines[0]?.overrideCents).toBeNull();
  });
});

describe('discount', () => {
  it('takes an amount as typed, never more than the total', () => {
    expect(discountCents(10_000, { mode: 'amount', value: '15' }, 'USD')).toBe(1_500);
    expect(discountCents(10_000, { mode: 'amount', value: '500' }, 'USD')).toBe(10_000);
  });

  it('takes a percent of the gross total', () => {
    expect(discountCents(10_000, { mode: 'percent', value: '10' }, 'USD')).toBe(1_000);
    expect(discountCents(9_999, { mode: 'percent', value: '12.5' }, 'USD')).toBe(1_250);
  });

  it('rounds a percent discount in SRD to a whole dollar, and in USD to the cent', () => {
    // 5% of SRD 1,847.00 = 92.35 -> 92.00
    expect(discountCents(184_700, { mode: 'percent', value: '5' }, 'SRD')).toBe(9_200);
    // 5% of $18.47 = 0.9235 -> $0.92
    expect(discountCents(1_847, { mode: 'percent', value: '5' }, 'USD')).toBe(92);
  });

  it('caps a percent at 100 and treats junk as no discount', () => {
    expect(discountCents(5_000, { mode: 'percent', value: '250' }, 'USD')).toBe(5_000);
    expect(discountCents(5_000, { mode: 'amount', value: 'abc' }, 'USD')).toBe(0);
    expect(discountCents(5_000, { mode: 'amount', value: '-4' }, 'USD')).toBe(0);
    expect(discountCents(5_000, null, 'USD')).toBe(0);
    expect(discountCents(0, { mode: 'amount', value: '4' }, 'USD')).toBe(0);
  });
});

describe('totals', () => {
  it('prices lines at the list price in the cart currency and totals them', () => {
    let cart = emptyCart('SRD', id);
    cart = addToCart(cart, A, 2, id).cart; // 2 x 1,540
    cart = addToCart(cart, B, 3, id).cart; // 3 x 96
    const totals = computeTotals(cart, lookup, RATE);
    expect(totals.lines.map((row) => row.unitCents)).toEqual([154_000, 9_600]);
    expect(totals.grossCents).toBe(2 * 154_000 + 3 * 9_600);
    expect(totals.units).toBe(5);
    expect(totals.totalCents).toBe(totals.grossCents);
  });

  it('uses a typed price instead of the list price', () => {
    let { cart, lineKey } = addToCart(emptyCart('USD', id), A, 2, id);
    cart = setOverride(cart, lineKey, 3_500);
    const totals = computeTotals(cart, lookup, RATE);
    expect(totals.grossCents).toBe(7_000);
  });

  it('subtracts the order discount from the document, not from the lines', () => {
    let { cart } = addToCart(emptyCart('USD', id), A, 1, id);
    cart = { ...cart, discount: { mode: 'amount', value: '5' } };
    const totals = computeTotals(cart, lookup, RATE);
    expect(totals.lines[0]?.lineCents).toBe(4_000);
    expect(totals.discountCents).toBe(500);
    expect(totals.totalCents).toBe(3_500);
  });

  it('estimates the cost of goods the way the server splits stock', () => {
    // 3 of 5 on hand valued at $100.00 -> $60.00
    const { cart } = addToCart(emptyCart('USD', id), A, 3, id);
    expect(computeTotals(cart, lookup, RATE).costUsdCents).toBe(6_000);
  });

  it('keeps items that left the catalogue out of the totals and reports them', () => {
    let { cart } = addToCart(emptyCart('USD', id), A, 1, id);
    cart = addToCart(cart, sellable({ key: 'v:gone' }), 1, id).cart;
    const totals = computeTotals(cart, lookup, RATE);
    expect(totals.lines).toHaveLength(1);
    expect(totals.missing).toHaveLength(1);
    expect(cartBlocker(totals)).toMatch(/no longer sold/);
    const reconciled = reconcileCart(cart, lookup);
    expect(reconciled.dropped).toBe(1);
    expect(reconciled.cart.lines).toHaveLength(1);
  });
});

describe('what stops a sale', () => {
  const totalsFor = (cart: Cart) => computeTotals(cart, lookup, RATE);

  it('needs something in the cart', () => {
    expect(cartBlocker(totalsFor(emptyCart('USD', id)))).toMatch(/Add something/);
  });

  it('names the item that has no price', () => {
    const free = sellable({ key: 'v:free', name: 'Free sample', listPriceCents: 0 });
    const withFree = new Map([...catalog, [free.key, free]]);
    const cart = addToCart(emptyCart('USD', id), free, 1, id).cart;
    const totals = computeTotals(cart, (key) => withFree.get(key), RATE);
    expect(cartBlocker(totals)).toBe('Set a price for Free sample.');
  });

  it('accepts a normal cart', () => {
    const cart = addToCart(emptyCart('USD', id), A, 1, id).cart;
    expect(cartBlocker(totalsFor(cart))).toBeNull();
  });
});

describe('sale notes and fingerprint', () => {
  it('puts line notes under their product, then the order note', () => {
    let { cart, lineKey } = addToCart(emptyCart('USD', id), A, 1, id);
    cart = setLineNote(cart, lineKey, 'left earbud scratched');
    cart = { ...cart, note: 'Collect Friday' };
    expect(saleNotes(cart, computeTotals(cart, lookup, RATE))).toBe(
      'KZ ZS10 Pro X: left earbud scratched\nCollect Friday',
    );
  });

  it('has no notes when none were typed', () => {
    const cart = addToCart(emptyCart('USD', id), A, 1, id).cart;
    expect(saleNotes(cart, computeTotals(cart, lookup, RATE))).toBeUndefined();
  });

  it('changes when the quantity, price or customer changes', () => {
    let { cart, lineKey } = addToCart(emptyCart('USD', id), A, 1, id);
    const before = cartFingerprint(cart, computeTotals(cart, lookup, RATE));
    const more = setQuantity(cart, lineKey, 2);
    expect(cartFingerprint(more, computeTotals(more, lookup, RATE))).not.toBe(before);
    const cheaper = setOverride(cart, lineKey, 3_000);
    expect(cartFingerprint(cheaper, computeTotals(cheaper, lookup, RATE))).not.toBe(before);
    cart = { ...cart, customerId: 'c1' };
    expect(cartFingerprint(cart, computeTotals(cart, lookup, RATE))).not.toBe(before);
  });
});

describe('ids and sellers', () => {
  it('makes valid v4 uuids even without randomUUID', async () => {
    const { newUuid } = await import('@/lib/pos/cart');
    const original = globalThis.crypto.randomUUID;
    try {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: undefined,
        configurable: true,
      });
      const value = newUuid();
      expect(value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });

  it('picks the seller whose name is the signed-in member, else the remembered one, else the only one', async () => {
    const { pickDefaultSeller } = await import('@/lib/pos/seller');
    const sellers = [
      { id: 's1', label: 'Leonardo Ranoesendjojo', active: true },
      { id: 's2', label: 'Youri', active: true },
      { id: 's3', label: 'Old seller', active: false },
    ];
    expect(pickDefaultSeller(sellers, '  leonardo  ranoesendjojo ', null)).toBe('s1');
    expect(pickDefaultSeller(sellers, 'Someone else', 's2')).toBe('s2');
    expect(pickDefaultSeller(sellers, 'Someone else', 's3')).toBeNull();
    expect(pickDefaultSeller(sellers, 'Someone else', null)).toBeNull();
    expect(
      pickDefaultSeller([sellers[1] as (typeof sellers)[number]], 'Someone else', null),
    ).toBe('s2');
    expect(pickDefaultSeller([], 'Someone', null)).toBeNull();
  });
});

describe('merging a restored cart', () => {
  it('adds what was tapped before the saved cart came back', async () => {
    const { mergeCarts } = await import('@/lib/pos/cart');
    const saved = addToCart(emptyCart('USD', id), A, 2, id).cart;
    let tapped = addToCart(emptyCart('USD', id), A, 1, id).cart;
    tapped = addToCart(tapped, B, 1, id).cart;
    const merged = mergeCarts(saved, tapped, id);
    expect(merged.lines.map((line) => [line.sellableKey, line.quantity])).toEqual([
      ['v:a', 3],
      ['v:b', 1],
    ]);
    expect(merged.idempotencyKey).toBe(saved.idempotencyKey);
  });
});
