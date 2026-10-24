import { describe, expect, it } from 'vitest';
import { invoiceStamp } from '@/components/invoice/invoice-paper';
import { netCommissionBases } from '@/lib/commission-rules';
import { isManuallyReversible } from '@/lib/finance-rules';
import { assessRateChange, RATE_SCALE } from '@/lib/fx';
import { ledgerEntrySchema, salePaymentSchema } from '@/lib/schemas';

describe('commission after returns', () => {
  const lineA = {
    id: 'a',
    categoryId: 'cat-a',
    unitPriceCents: 1000,
    quantity: 4,
    quantityReturned: 0,
    bundle: false,
  };
  const lineB = {
    id: 'b',
    categoryId: 'cat-b',
    unitPriceCents: 500,
    quantity: 2,
    quantityReturned: 0,
    bundle: false,
  };

  it('is unchanged when nothing came back', () => {
    const bases = netCommissionBases({ lines: [lineA, lineB], discountCents: 500 });
    const total = [...bases.values()].reduce((sum, group) => sum + group.basisCents, 0);
    expect(total).toBe(5000 - 500);
  });

  it('drops a group whose goods all came back and shrinks the discount with them', () => {
    const bases = netCommissionBases({
      lines: [lineA, { ...lineB, quantityReturned: 2 }],
      discountCents: 500,
    });
    expect(bases.get('category:cat-b')?.basisCents).toBe(0);
    // 4000 of 5000 stayed, so 400 of the 500 discount stays with it.
    expect(bases.get('category:cat-a')?.basisCents).toBe(4000 - 400);
  });

  it('handles a sale where everything was returned', () => {
    const bases = netCommissionBases({
      lines: [lineA, lineB].map((line) => ({ ...line, quantityReturned: line.quantity })),
      discountCents: 500,
    });
    expect([...bases.values()].every((group) => group.basisCents === 0)).toBe(true);
  });
});

describe('exchange rate sanity', () => {
  it('accepts a normal move and the very first rate', () => {
    expect(assessRateChange(38.5 * RATE_SCALE, 39 * RATE_SCALE).status).toBe('ok');
    expect(assessRateChange(null, 38.5 * RATE_SCALE).status).toBe('ok');
  });

  it('catches a decimal-point slip', () => {
    expect(assessRateChange(38.5 * RATE_SCALE, 385 * RATE_SCALE).status).toBe('large-change');
    expect(assessRateChange(38.5 * RATE_SCALE, 60 * RATE_SCALE).status).toBe('large-change');
    expect(assessRateChange(null, 3850 * RATE_SCALE).status).toBe('implausible');
    expect(assessRateChange(null, 0.385 * RATE_SCALE).status).toBe('implausible');
  });
});

describe('ledger reversals', () => {
  it('allows a hand-typed movement and legacy imports', () => {
    expect(
      isManuallyReversible({ sourceKind: 'manual', eventType: 'manual', reversalOfId: null })
        .ok,
    ).toBe(true);
    expect(
      isManuallyReversible({ sourceKind: 'manual', eventType: 'legacy', reversalOfId: null })
        .ok,
    ).toBe(true);
  });

  it('sends document-posted entries back to their document', () => {
    for (const sourceKind of ['sale', 'expense', 'purchase_order']) {
      expect(
        isManuallyReversible({ sourceKind, eventType: 'sale_payment', reversalOfId: null }).ok,
      ).toBe(false);
    }
    expect(
      isManuallyReversible({
        sourceKind: 'manual',
        eventType: 'wallet_transfer',
        reversalOfId: null,
      }).ok,
    ).toBe(false);
    expect(
      isManuallyReversible({ sourceKind: 'manual', eventType: 'manual', reversalOfId: 'x' }).ok,
    ).toBe(false);
  });
});

describe('manual cash movements', () => {
  it('only accepts capital, draws and corrections', () => {
    const base = {
      direction: 'in',
      description: 'x',
      occurredAt: '2020-01-01',
      currency: 'USD',
      amountCents: '5.00',
      paymentMethod: 'cash',
      memberId: '00000000-0000-4000-8000-000000000001',
    };
    expect(
      ledgerEntrySchema.safeParse({ ...base, category: 'owner_contribution' }).success,
    ).toBe(true);
    for (const category of ['sales_receipt', 'refund', 'purchase', 'operating', 'shipping']) {
      expect(ledgerEntrySchema.safeParse({ ...base, category }).success).toBe(false);
    }
  });

  it('refuses a payment dated in the future', () => {
    expect(
      salePaymentSchema.safeParse({
        saleId: '00000000-0000-4000-8000-000000000001',
        amountCents: '1.00',
        paymentMethod: 'cash',
        receivedAt: '2999-01-01',
      }).success,
    ).toBe(false);
  });
});

describe('invoice stamp', () => {
  it('says paid, due, void and draft without leaking anything else', () => {
    expect(invoiceStamp('confirmed', 1000, 1000).tone).toBe('paid');
    expect(invoiceStamp('confirmed', 1000, 400).tone).toBe('due');
    expect(invoiceStamp('void', 1000, 0).tone).toBe('void');
    expect(invoiceStamp('draft', 1000, undefined).tone).toBe('draft');
  });
});
