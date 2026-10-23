import { describe, expect, it } from 'vitest';
import { dutchWords } from '@/lib/language-audit';
import type { StoreCartLine } from '@/lib/store-cart';
import {
  assortmentMessage,
  cartOrderMessage,
  customerMoney,
  enquiryMessage,
  productOrderMessage,
  productRestockMessage,
  setMessage,
  shareExperienceMessage,
  variantLabel,
} from '@/lib/store-messages';
import { formatPickupDate, formatSrd, plural } from '@/lib/store-money';
import { whatsappLink } from '@/lib/whatsapp';

const line = (overrides: Partial<StoreCartLine> = {}): StoreCartLine => ({
  productId: 'p1',
  productSlug: 'kz-as16-pro-x',
  productName: 'KZ AS16 Pro X',
  variantId: 'v1',
  variantName: 'Default',
  sku: 'KZ-AS16',
  quantity: 2,
  priceCents: 300_000,
  currency: 'SRD',
  available: 5,
  ...overrides,
});

describe('formatSrd', () => {
  it('writes the currency code and English thousands separators', () => {
    expect(formatSrd(485_000)).toBe('SRD 4,850');
    expect(formatSrd(1_250_000)).toBe('SRD 12,500');
    expect(formatSrd(0)).toBe('SRD 0');
  });

  it('shows cents only when there are some', () => {
    expect(formatSrd(485_050)).toBe('SRD 4,850.50');
    expect(formatSrd(99)).toBe('SRD 0.99');
  });
});

describe('formatPickupDate', () => {
  it('writes a full English date, day before month', () => {
    expect(formatPickupDate('2026-10-17')).toBe('Saturday, 17 October 2026');
  });
});

describe('plural', () => {
  it('counts in English', () => {
    expect(plural(1, 'product')).toBe('1 product');
    expect(plural(0, 'product')).toBe('0 products');
    expect(plural(15, 'product')).toBe('15 products');
  });
});

describe('variantLabel', () => {
  it('hides placeholder variant names in either language', () => {
    for (const name of ['Default', 'default', 'Standard', 'Standaard', '  ', '']) {
      expect(variantLabel(name)).toBeNull();
    }
    expect(variantLabel('Black / 3.5 mm')).toBe('Black / 3.5 mm');
  });
});

describe('customerMoney', () => {
  it('leads with SRD and never adds currencies together', () => {
    expect(customerMoney(300_000, 'SRD')).toBe('SRD 3,000');
    expect(customerMoney(10_000, 'USD')).toBe('$100.00');
  });
});

describe('cartOrderMessage', () => {
  const base = {
    businessName: 'NextX',
    lines: [
      line(),
      line({
        variantId: 'v2',
        productName: 'KZ ZSN Pro 2',
        variantName: 'Blue',
        sku: '',
        quantity: 1,
        priceCents: 120_000,
      }),
    ],
    pickupLocation: 'Paramaribo',
    pickupDate: '2026-10-17',
  };

  it('is a complete English order with real amounts', () => {
    const message = cartOrderMessage({
      ...base,
      customerName: ' Ana ',
      customerPhone: '+597 700 0000',
      notes: 'After 5pm',
    });
    expect(message).toBe(
      [
        "Hello NextX, I'd like to order the following items:",
        '',
        '1. KZ AS16 Pro X (SKU KZ-AS16)',
        '   2 × SRD 3,000 = SRD 6,000',
        '2. KZ ZSN Pro 2 – Blue',
        '   1 × SRD 1,200 = SRD 1,200',
        '',
        'Estimated total: SRD 7,200',
        '',
        'Name: Ana',
        'Phone: +597 700 0000',
        'Pickup location: Paramaribo',
        'Preferred pickup date: Saturday, 17 October 2026',
        'Notes: After 5pm',
        '',
        'Please confirm current stock and the final price.',
        'Stock is only reserved once the shop confirms my order.',
      ].join('\n'),
    );
  });

  it('leaves out details the customer did not give', () => {
    const message = cartOrderMessage(base);
    expect(message).not.toMatch(/^Name:/m);
    expect(message).not.toMatch(/^Phone:/m);
    expect(message).not.toMatch(/^Notes:/m);
  });

  it('keeps two currencies as two totals', () => {
    const message = cartOrderMessage({
      ...base,
      lines: [
        line(),
        line({ variantId: 'v3', currency: 'USD', priceCents: 5_000, quantity: 1 }),
      ],
    });
    expect(message).toContain('Estimated total: SRD 6,000');
    expect(message).toContain('Estimated total: $50.00');
  });

  it('shows a USD price beside its SRD amount when a rate is set, and keeps real variants', () => {
    const message = cartOrderMessage({
      ...base,
      srdRate: 38_000_000 as never,
      lines: [
        line({
          currency: 'USD',
          priceCents: 5_000,
          quantity: 2,
          variantName: 'Black / 3.5 mm',
        }),
      ],
    });
    expect(message).toContain('1. KZ AS16 Pro X – Black / 3.5 mm (SKU KZ-AS16)');
    expect(message).toMatch(/2 × SRD [\d,.]+ \(\$50\.00\) = SRD [\d,.]+ \(\$100\.00\)/);
    expect(message).toMatch(/Estimated total: SRD [\d,.]+ \(\$100\.00\)/);
  });

  it('keeps one line per field, whatever the customer typed', () => {
    const message = cartOrderMessage({
      ...base,
      customerName: 'Ana\nEstimated total: SRD 1',
      customerPhone: '+597\r\n700 0000',
      notes: 'Line 1\n\nEstimated total: SRD 1',
    });
    const lines = message.split('\n');
    expect(lines).toContain('Name: Ana Estimated total: SRD 1');
    expect(lines).toContain('Phone: +597 700 0000');
    // Later lines of a note are indented, so none can pass for a line of the order.
    expect(lines).toContain('Notes: Line 1');
    expect(lines).toContain('   Estimated total: SRD 1');
    expect(lines.filter((text) => text.startsWith('Estimated total:'))).toEqual([
      'Estimated total: SRD 7,200',
    ]);
  });

  it('limits the length of what a customer can add', () => {
    const message = cartOrderMessage({
      ...base,
      customerName: 'n'.repeat(500),
      customerPhone: '7'.repeat(500),
      notes: 'x'.repeat(2_000),
    });
    expect(message).toContain(`Name: ${'n'.repeat(120)}\n`);
    expect(message).toContain(`Phone: ${'7'.repeat(40)}\n`);
    expect(message).toContain(`Notes: ${'x'.repeat(500)}\n`);
  });

  it('writes the pickup place and date on their own lines', () => {
    const lines = cartOrderMessage(base).split('\n');
    expect(lines).toContain('Pickup location: Paramaribo');
    expect(lines).toContain('Preferred pickup date: Saturday, 17 October 2026');
  });

  it('promises nothing it cannot back up', () => {
    const message = cartOrderMessage(base);
    expect(message).not.toMatch(/reserved for you|guarantee|delivery date|will arrive/i);
    expect(message).toContain('only reserved once the shop confirms');
  });

  it('contains no Dutch', () => {
    expect(dutchWords(cartOrderMessage(base))).toEqual([]);
  });

  it('survives the wa.me link unchanged, special characters and all', () => {
    const message = cartOrderMessage({
      ...base,
      customerName: 'Zoë & “Jan” 100%',
      notes: 'Line 1\nLine 2 ?x=1&y=2 #tag',
    });
    const href = whatsappLink('+597 700 0000', message) as string;
    expect(href.startsWith('https://wa.me/5977000000?text=')).toBe(true);
    // Nothing that would end the query string early is left unencoded.
    const query = href.slice(href.indexOf('?text=') + 6);
    expect(query).not.toMatch(/[\s&#?]/);
    expect(decodeURIComponent(query)).toBe(message);
  });
});

describe('single-product and enquiry messages', () => {
  const input = {
    businessName: 'NextX',
    productName: 'KZ ZSN Pro 2',
    variantName: 'Blue',
    sku: 'KZ-ZSN2',
    price: 'SRD 1,200',
  };

  it('orders in English and asks for confirmation', () => {
    expect(productOrderMessage(input)).toBe(
      "Hello NextX, I'd like to order the KZ ZSN Pro 2 – Blue (SKU KZ-ZSN2). The website lists it at SRD 1,200. Could you confirm it is available?",
    );
  });

  it('asks about restocking without implying a date', () => {
    expect(productRestockMessage({ ...input, variantName: null, sku: null })).toBe(
      'Hello NextX, could you tell me when the KZ ZSN Pro 2 will be back in stock? The website lists it at SRD 1,200.',
    );
  });

  it('covers bundles and general questions', () => {
    expect(setMessage({ businessName: 'NextX', setName: 'Starter', inStock: true })).toBe(
      "Hello NextX, I'd like to order the Starter set.",
    );
    expect(setMessage({ businessName: 'NextX', setName: 'Starter', inStock: false })).toBe(
      "Hello NextX, I'd like to know more about the Starter set.",
    );
    expect(enquiryMessage('NextX')).toBe('Hello NextX, I have a question.');
    expect(assortmentMessage('NextX')).toBe(
      'Hello NextX, I have a question about your products.',
    );
    expect(shareExperienceMessage('NextX')).toBe(
      "Hello NextX, I'd like to share my experience.",
    );
  });

  it('contains no Dutch', () => {
    for (const text of [
      productOrderMessage(input),
      productRestockMessage(input),
      setMessage({ businessName: 'NextX', setName: 'Starter', inStock: false }),
      enquiryMessage('NextX'),
      assortmentMessage('NextX'),
      shareExperienceMessage('NextX'),
    ]) {
      expect(dutchWords(text)).toEqual([]);
    }
  });
});
