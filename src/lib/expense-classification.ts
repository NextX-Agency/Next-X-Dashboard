export const EXPENSE_CLASSIFICATIONS = [
  'operating',
  'inventory',
  'payroll',
  'marketing',
  'tax_fee',
  'owner_draw',
  'other',
  'unclassified',
] as const;

export type ExpenseClassification = (typeof EXPENSE_CLASSIFICATIONS)[number];

export const EXPENSE_CLASSIFICATION_LABELS: Record<ExpenseClassification, string> = {
  operating: 'Operating cost',
  inventory: 'Inventory / stock',
  payroll: 'Payroll',
  marketing: 'Marketing',
  tax_fee: 'Tax or fee',
  owner_draw: 'Owner draw',
  other: 'Other business cost',
  unclassified: 'Needs classification',
};

export function isExpenseClassification(value: unknown): value is ExpenseClassification {
  return (
    typeof value === 'string' && (EXPENSE_CLASSIFICATIONS as readonly string[]).includes(value)
  );
}

const inventoryOrPersonalCategories = new Set([
  'business expense',
  'personal items',
  'personal',
  'investment',
  'investments',
  'capital',
  'inventory',
  'stock',
  'stock purchase',
  'purchases',
  'goods',
  'wholesale',
  'vendor',
  'cogs',
  'cost of goods sold',
  'merchandise',
  'product purchases',
  'inventory shipping',
  'stock shipping',
]);

/** Keep stock purchases and owner draws out of operating profit. */
export function isExcludedExpenseFromOperatingProfit(expense: {
  classification?: string | null;
  categoryName?: string | null;
  description?: string | null;
}): boolean {
  if (expense.classification === 'inventory' || expense.classification === 'owner_draw') {
    return true;
  }
  if (expense.classification !== 'unclassified' && expense.classification !== 'other') {
    return false;
  }

  const category = (expense.categoryName ?? '').toLowerCase().trim();
  const categoryIsInventoryOrPersonal =
    inventoryOrPersonalCategories.has(category) ||
    category.includes('inventory purchase') ||
    category.includes('stock order') ||
    category.includes('product shipping');
  const description = (expense.description ?? '').toLowerCase();
  const descriptionSuggestsInventory = [
    'inventory',
    'stock',
    'wholesale',
    'supplier',
    'vendor',
  ].some((word) => description.includes(word));

  return (
    categoryIsInventoryOrPersonal ||
    (descriptionSuggestsInventory && (category === 'shipping' || category === 'marketing'))
  );
}
