import { describe, expect, it } from 'vitest';
import { isExcludedExpenseFromOperatingProfit } from '@/lib/expense-classification';

describe('legacy expense operating-profit treatment', () => {
  it('excludes inventory and owner draws by classification', () => {
    expect(isExcludedExpenseFromOperatingProfit({ classification: 'inventory' })).toBe(true);
    expect(isExcludedExpenseFromOperatingProfit({ classification: 'owner_draw' })).toBe(true);
    expect(isExcludedExpenseFromOperatingProfit({ classification: 'payroll' })).toBe(false);
  });

  it('recognizes stock categories and inventory-coded shipping', () => {
    expect(
      isExcludedExpenseFromOperatingProfit({
        classification: 'other',
        categoryName: 'Product Shipping',
      }),
    ).toBe(true);
    expect(
      isExcludedExpenseFromOperatingProfit({
        classification: 'unclassified',
        categoryName: 'Shipping',
        description: 'Supplier delivery',
      }),
    ).toBe(true);
    expect(
      isExcludedExpenseFromOperatingProfit({
        classification: 'other',
        categoryName: 'Operating',
        description: 'Supplier delivery',
      }),
    ).toBe(false);
  });

  it('does not infer exclusions for classified operating costs', () => {
    expect(
      isExcludedExpenseFromOperatingProfit({
        classification: 'operating',
        categoryName: 'Inventory shipping',
      }),
    ).toBe(false);
  });
});
