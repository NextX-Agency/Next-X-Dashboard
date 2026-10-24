import { describe, expect, it } from 'vitest';
import { describeIssue, describeIssues } from '@/lib/form-issues';
import { saleSchema } from '@/lib/schemas';

describe('describeIssue', () => {
  it('names the line and the field a cashier has to fix', () => {
    expect(
      describeIssue({
        path: ['items', 1, 'unitPriceCents'],
        message: 'Must be more than zero',
      }),
    ).toBe('Line 2 · Unit price: Must be more than zero');
  });

  it('labels document-level fields and passes unknown ones through', () => {
    expect(describeIssue({ path: ['discountCents'], message: 'Too big' })).toBe(
      'Discount: Too big',
    );
    expect(describeIssue({ path: ['mystery'], message: 'Odd' })).toBe('Odd');
  });

  it('turns a real schema failure into readable lines, once each', () => {
    const result = saleSchema.safeParse({
      customerId: null,
      sellerId: null,
      soldAt: '2020-01-01',
      currency: 'USD',
      paymentMethod: 'cash',
      items: [
        {
          variantId: '00000000-0000-4000-8000-000000000001',
          bundleId: null,
          quantity: '0',
          unitPriceCents: '',
        },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const lines = describeIssues(result.error.issues);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.startsWith('Line 1'))).toBe(true);
    expect(new Set(lines).size).toBe(lines.length);
  });
});
