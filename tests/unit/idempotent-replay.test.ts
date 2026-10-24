import { describe, expect, it } from 'vitest';
import {
  alreadySubmittedMessage,
  isSameSubmission,
  type ReplayDocument,
} from '@/lib/idempotent-replay';

const stored: ReplayDocument = {
  status: 'draft',
  currency: 'USD',
  customerId: 'c1',
  discountCents: 0,
  lines: [
    { ref: 'v1', quantity: 2, unitPriceCents: 1500 },
    { ref: 'v2', quantity: 1, unitPriceCents: 900 },
  ],
};

describe('isSameSubmission', () => {
  it('accepts a true repeat (double click, retry), whatever the line order', () => {
    expect(isSameSubmission(stored, { ...stored, lines: [...stored.lines].reverse() })).toBe(
      true,
    );
  });

  it('refuses "Record sale" after "Save draft" with the same key', () => {
    expect(isSameSubmission(stored, { ...stored, status: 'confirmed' })).toBe(false);
  });

  it('refuses a different sale that reuses the key', () => {
    expect(
      isSameSubmission(stored, {
        ...stored,
        lines: [{ ref: 'v3', quantity: 1, unitPriceCents: 500 }],
      }),
    ).toBe(false);
    expect(
      isSameSubmission(stored, {
        ...stored,
        lines: [
          { ref: 'v1', quantity: 3, unitPriceCents: 1500 },
          { ref: 'v2', quantity: 1, unitPriceCents: 900 },
        ],
      }),
    ).toBe(false);
    expect(isSameSubmission(stored, { ...stored, discountCents: 100 })).toBe(false);
    expect(isSameSubmission(stored, { ...stored, customerId: null })).toBe(false);
    expect(isSameSubmission(stored, { ...stored, currency: 'SRD' })).toBe(false);
  });

  it('treats a missing customer as the same as null', () => {
    expect(
      isSameSubmission({ ...stored, customerId: null }, { ...stored, customerId: undefined }),
    ).toBe(true);
  });

  it('names the document in the message', () => {
    expect(alreadySubmittedMessage('sale')).toBe(
      'This form was already submitted. Reload to record another sale.',
    );
    expect(alreadySubmittedMessage('order')).toContain('another order');
  });
});
