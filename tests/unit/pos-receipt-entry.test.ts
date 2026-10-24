import { describe, expect, it } from 'vitest';
import { filterProducts, groupProducts, stockBadge } from '@/lib/pos/catalog';
import { buildCodeIndex, entryCandidates, resolveEntry } from '@/lib/pos/entry';
import { describeSaleError } from '@/lib/pos/errors';
import { checkMargin, estimateCostUsd, lineMargin, marginMessage } from '@/lib/pos/margin';
import {
  buildReceiptText,
  receiptWhatsappUrl,
  whatsappDigitsForPhone,
} from '@/lib/pos/receipt';
import type { Sellable } from '@/lib/pos/types';
import { UNDO_WINDOW_MS, undoAllowed, undoMinutesLeft } from '@/lib/pos/undo';
import { QUICK_ACTIONS } from '@/lib/quick-actions';

const sellable = (patch: Partial<Sellable>): Sellable => ({
  key: 'v:a',
  kind: 'variant',
  variantId: 'a',
  bundleId: null,
  productId: 'p-a',
  name: 'KZ ZS10 Pro X',
  option: null,
  sku: 'KZ-ZS10-BLK',
  brand: 'KZ',
  category: 'In-ear monitors',
  model: null,
  attributes: [],
  listPriceCents: 4_000,
  onHand: 5,
  reserved: 0,
  valueCents: 10_000,
  referenceCostCents: 2_000,
  bundleCostCents: 0,
  image: null,
  components: [],
  ...patch,
});

const items = [
  sellable({}),
  sellable({
    key: 'v:b',
    variantId: 'b',
    productId: 'p-b',
    name: 'Essager 1m Aux',
    sku: 'ESSAGER-1M-AUX',
    brand: 'Essager',
    category: 'Cables',
    onHand: 0,
  }),
  sellable({
    key: 'v:c1',
    variantId: 'c1',
    productId: 'p-c',
    name: 'Moondrop Chu',
    option: 'Black',
    sku: '6900001',
    brand: 'Moondrop',
    category: 'In-ear monitors',
    attributes: ['Black'],
  }),
  sellable({
    key: 'v:c2',
    variantId: 'c2',
    productId: 'p-c',
    name: 'Moondrop Chu',
    option: 'Silver',
    sku: '6900002',
    brand: 'Moondrop',
    category: 'In-ear monitors',
    attributes: ['Silver'],
  }),
];

describe('barcode and SKU entry', () => {
  const index = buildCodeIndex(items);

  it('finds an exact SKU ignoring case and spaces around it', () => {
    expect(resolveEntry('  kz-zs10-blk ', index)?.sellable.key).toBe('v:a');
    expect(resolveEntry('6900002', index)?.sellable.key).toBe('v:c2');
  });

  it('finds a SKU typed without its separators', () => {
    expect(resolveEntry('essager 1m aux', index)?.sellable.key).toBe('v:b');
    expect(resolveEntry('ESSAGER1MAUX', index)?.sellable.key).toBe('v:b');
  });

  it('reads a quantity before or after the code', () => {
    expect(resolveEntry('3x KZ-ZS10-BLK', index)).toMatchObject({ quantity: 3 });
    expect(resolveEntry('3 * KZ-ZS10-BLK', index)).toMatchObject({ quantity: 3 });
    expect(resolveEntry('KZ-ZS10-BLK*4', index)).toMatchObject({ quantity: 4 });
    expect(resolveEntry('KZ-ZS10-BLK', index)).toMatchObject({ quantity: 1 });
  });

  it('tries the whole text as a code first', () => {
    const odd = sellable({ key: 'v:odd', sku: '2x4-BOARD' });
    const oddIndex = buildCodeIndex([...items, odd]);
    expect(resolveEntry('2x4-BOARD', oddIndex)).toMatchObject({ quantity: 1 });
    expect(resolveEntry('2x4-BOARD', oddIndex)?.sellable.key).toBe('v:odd');
  });

  it('answers null for an unknown code or empty text, so the box falls back to a name search', () => {
    expect(resolveEntry('NOPE-123', index)).toBeNull();
    expect(resolveEntry('   ', index)).toBeNull();
    expect(entryCandidates('')).toEqual([]);
  });

  it('does not guess when two SKUs only differ by punctuation', () => {
    const twins = buildCodeIndex([
      sellable({ key: 'v:t1', sku: 'AB-12' }),
      sellable({ key: 'v:t2', sku: 'AB_12' }),
    ]);
    expect(resolveEntry('AB-12', twins)?.sellable.key).toBe('v:t1');
    expect(resolveEntry('AB 12', twins)).toBeNull();
  });
});

describe('product search', () => {
  const products = groupProducts(items);

  it('groups options under their product', () => {
    expect(products).toHaveLength(3);
    const chu = products.find((product) => product.id === 'p-c');
    expect(chu?.sellables).toHaveLength(2);
    expect(chu?.onHand).toBe(10);
  });

  it('matches name, brand, SKU and option, every word', () => {
    const find = (query: string, category: string | null = null) =>
      filterProducts(products, { query, category }).map((product) => product.id);
    expect(find('moondrop')).toEqual(['p-c']);
    expect(find('silver chu')).toEqual(['p-c']);
    expect(find('6900001')).toEqual(['p-c']);
    expect(find('essager aux')).toEqual(['p-b']);
    expect(find('zzz')).toEqual([]);
  });

  it('narrows by category and puts the SKU hit first', () => {
    expect(
      filterProducts(products, { query: '', category: 'Cables' }).map((product) => product.id),
    ).toEqual(['p-b']);
    expect(filterProducts(products, { query: 'kz-zs10-blk', category: null })[0]?.id).toBe(
      'p-a',
    );
  });

  it('words stock honestly and never blocks', () => {
    expect(stockBadge(12)).toEqual({ text: '12 in stock', tone: 'ok' });
    expect(stockBadge(3)).toEqual({ text: '3 left', tone: 'low' });
    expect(stockBadge(0)).toEqual({ text: 'Out of stock', tone: 'out' });
    expect(stockBadge(-2)).toEqual({ text: 'Oversold', tone: 'over' });
  });
});

describe('margin warning', () => {
  const RATE = 38_500_000;

  it('costs units on hand at their weighted average', () => {
    // 5 on hand worth $100.00; 2 units -> $40.00
    expect(estimateCostUsd(sellable({}), 2)).toBe(4_000);
    expect(estimateCostUsd(sellable({}), 5)).toBe(10_000);
  });

  it('costs units beyond stock at the reference cost', () => {
    // 5 on hand ($100.00) + 2 more at $20.00
    expect(estimateCostUsd(sellable({}), 7)).toBe(14_000);
  });

  it('uses the reference cost when nothing is on hand, and the landed cost for a bundle', () => {
    expect(estimateCostUsd(sellable({ onHand: 0, valueCents: 0 }), 2)).toBe(4_000);
    expect(estimateCostUsd(sellable({ kind: 'bundle', bundleCostCents: 3_000 }), 2)).toBe(
      6_000,
    );
  });

  it('flags a price below cost, a thin one, and a healthy one', () => {
    expect(checkMargin({ revenueUsdCents: 1_900, costUsdCents: 2_000 }).level).toBe(
      'below-cost',
    );
    expect(checkMargin({ revenueUsdCents: 2_100, costUsdCents: 2_000 }).level).toBe('thin');
    expect(checkMargin({ revenueUsdCents: 4_000, costUsdCents: 2_000 }).level).toBe('ok');
  });

  it('says nothing when the cost is unknown', () => {
    expect(checkMargin({ revenueUsdCents: 4_000, costUsdCents: 0 }).level).toBe('unknown');
  });

  it('checks an SRD price against the USD cost at the rate', () => {
    // cost $20.00 = SRD 770.00. SRD 700 is below cost, SRD 1,540 is fine.
    const low = lineMargin({
      sellable: sellable({}),
      quantity: 1,
      unitPriceCents: 70_000,
      currency: 'SRD',
      rateMicros: RATE,
    });
    expect(low.level).toBe('below-cost');
    const fine = lineMargin({
      sellable: sellable({}),
      quantity: 1,
      unitPriceCents: 154_000,
      currency: 'SRD',
      rateMicros: RATE,
    });
    expect(fine.level).toBe('ok');
    expect(marginMessage('below-cost', 'line')).toMatch(/below cost/);
    expect(marginMessage('ok', 'line')).toBeNull();
  });
});

describe('receipt text', () => {
  const base = {
    businessName: 'NextX',
    number: 'V00123',
    dateLabel: '24 Oct 2026',
    currency: 'SRD' as const,
    lines: [
      {
        name: 'KZ ZS10 Pro X',
        option: 'Black',
        quantity: 2,
        unitCents: 154_000,
        lineCents: 308_000,
      },
      { name: 'Essager 1m Aux', quantity: 1, unitCents: 9_600, lineCents: 9_600 },
    ],
    discountCents: 8_000,
    totalCents: 309_600,
    paidCents: 309_600,
    paidWith: 'Cash',
  };

  it('lists the items, the total, what was paid and the balance', () => {
    const text = buildReceiptText({ ...base, changeCents: 10_400, customerName: 'Anna' });
    expect(text).toBe(
      [
        'NextX - Receipt V00123',
        '24 Oct 2026',
        'Customer: Anna',
        '',
        '2 x KZ ZS10 Pro X (Black) @ SRD 1,540: SRD 3,080',
        'Essager 1m Aux: SRD 96',
        '',
        'Discount: -SRD 80',
        'Total: SRD 3,096',
        'Paid: SRD 3,096 (Cash)',
        'Change: SRD 104',
        'Balance: 0 - paid in full',
        '',
        'Thank you!',
      ].join('\n'),
    );
  });

  it('shows what is still owed on a part payment', () => {
    const text = buildReceiptText({ ...base, discountCents: 0, paidCents: 100_000 });
    expect(text).toContain('Paid: SRD 1,000 (Cash)');
    expect(text).toContain('Balance to pay: SRD 2,096');
    expect(text).not.toContain('Discount');
  });

  it('writes USD with two decimals and carries the invoice link when there is one', () => {
    const text = buildReceiptText({
      ...base,
      currency: 'USD',
      lines: [{ name: 'Cable', quantity: 1, unitCents: 1_250, lineCents: 1_250 }],
      discountCents: 0,
      totalCents: 1_250,
      paidCents: 1_250,
      invoiceUrl: 'https://example.test/d/invoice/abc',
    });
    expect(text).toContain('Total: $12.50');
    expect(text).toContain('Invoice: https://example.test/d/invoice/abc');
  });

  it('contains no emoji', () => {
    expect(buildReceiptText(base)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('WhatsApp link', () => {
  it('turns a local seven-digit number into an international one', () => {
    expect(whatsappDigitsForPhone('812 3456')).toBe('5978123456');
    expect(whatsappDigitsForPhone('+597 812-3456')).toBe('5978123456');
    expect(whatsappDigitsForPhone('00597 8123456')).toBe('5978123456');
  });

  it('has no number for junk or nothing', () => {
    expect(whatsappDigitsForPhone('call me')).toBeNull();
    expect(whatsappDigitsForPhone('')).toBeNull();
    expect(whatsappDigitsForPhone(null)).toBeNull();
  });

  it('addresses the customer when the number is known and opens the picker when not', () => {
    expect(receiptWhatsappUrl('Hi there', '8123456')).toBe(
      'https://wa.me/5978123456?text=Hi%20there',
    );
    expect(receiptWhatsappUrl('Hi there', null)).toBe('https://wa.me/?text=Hi%20there');
  });
});

describe('undo window', () => {
  const t0 = 1_000_000;
  const owner = { memberId: 'm1', memberRole: 'owner', createdById: 'm2' };
  const seller = { memberId: 'm2', memberRole: 'staff', createdById: 'm2' };
  const other = { memberId: 'm3', memberRole: 'staff', createdById: 'm2' };

  it('lets the seller undo within ten minutes', () => {
    expect(undoAllowed({ createdAtMs: t0, nowMs: t0 + 60_000, ...seller })).toEqual({
      ok: true,
    });
    expect(undoAllowed({ createdAtMs: t0, nowMs: t0 + UNDO_WINDOW_MS, ...seller }).ok).toBe(
      true,
    );
  });

  it('closes after ten minutes, for everyone', () => {
    expect(undoAllowed({ createdAtMs: t0, nowMs: t0 + UNDO_WINDOW_MS + 1, ...seller }).ok).toBe(
      false,
    );
    expect(undoAllowed({ createdAtMs: t0, nowMs: t0 + UNDO_WINDOW_MS + 1, ...owner }).ok).toBe(
      false,
    );
  });

  it('lets the owner undo anyone sale, but not another staff member', () => {
    expect(undoAllowed({ createdAtMs: t0, nowMs: t0 + 1_000, ...owner }).ok).toBe(true);
    const refusal = undoAllowed({ createdAtMs: t0, nowMs: t0 + 1_000, ...other });
    expect(refusal.ok).toBe(false);
  });

  it('counts the minutes left', () => {
    expect(undoMinutesLeft(t0, t0)).toBe(10);
    expect(undoMinutesLeft(t0, t0 + 9 * 60_000 + 1)).toBe(1);
    expect(undoMinutesLeft(t0, t0 + UNDO_WINDOW_MS)).toBe(0);
    expect(undoMinutesLeft(t0, t0 + UNDO_WINDOW_MS + 5)).toBe(0);
  });
});

describe('sale refusals in words', () => {
  it('recognises the reserved-stock refusal', () => {
    const error = describeSaleError(
      'This sale would use stock reserved for open orders, so a confirmed order could no longer be completed. X',
    );
    expect(error.kind).toBe('reserved');
    expect(error.hint).toMatch(/owner/);
  });

  it('recognises a missing exchange rate', () => {
    const error = describeSaleError(
      'No exchange rate has been set. Add one in Settings before recording SRD amounts.',
    );
    expect(error.kind).toBe('rate');
    expect(error.message).toMatch(/SRD/);
  });

  it('recognises a wallet in the wrong currency', () => {
    const error = describeSaleError(
      'Cash holds USD, but this sale is in SRD. Choose a SRD wallet.',
    );
    expect(error.kind).toBe('wallet');
  });

  it('passes anything else through, and never returns an empty message', () => {
    expect(describeSaleError('Something odd.').message).toBe('Something odd.');
    expect(describeSaleError(undefined).message.length).toBeGreaterThan(0);
  });
});

describe('the + New menu', () => {
  it('lists the five starting points with a link each', () => {
    expect(QUICK_ACTIONS.map((action) => action.id)).toEqual([
      'quick-sale',
      'new-sale',
      'add-stock',
      'add-expense',
      'add-customer',
    ]);
    for (const action of QUICK_ACTIONS) {
      expect(String(action.href).startsWith('/')).toBe(true);
      expect(action.label.length).toBeGreaterThan(0);
    }
    expect(String(QUICK_ACTIONS[0]?.href)).toBe('/pos');
  });
});
