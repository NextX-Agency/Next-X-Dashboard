import { describe, expect, it } from 'vitest';
import { defaultUnitPrice } from '@/lib/line-price';

describe('defaultUnitPrice', () => {
  const rate = 38_000_000; // 38 SRD per USD

  it('passes a USD list price through unchanged', () => {
    expect(defaultUnitPrice(649, 'USD', rate)).toBe('6.49');
  });

  it('converts the USD list price to SRD at the rate in force', () => {
    expect(defaultUnitPrice(649, 'SRD', rate)).toBe('246.62');
    expect(defaultUnitPrice(3000, 'SRD', rate)).toBe('1140.00');
  });

  it('never shows the USD figure as if it were SRD', () => {
    expect(defaultUnitPrice(649, 'SRD', rate)).not.toBe(defaultUnitPrice(649, 'USD', rate));
  });
});
