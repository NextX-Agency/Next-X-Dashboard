export const EXPENSE_CLASSIFICATIONS = [
  'operating',
  'inventory',
  'payroll',
  'marketing',
  'tax_fee',
  'owner_draw',
  'other',
  'unclassified',
] as const

export type ExpenseClassification = typeof EXPENSE_CLASSIFICATIONS[number]

export const EXPENSE_CLASSIFICATION_LABELS: Record<ExpenseClassification, string> = {
  operating: 'Operating cost',
  inventory: 'Inventory / stock',
  payroll: 'Payroll',
  marketing: 'Marketing',
  tax_fee: 'Tax or fee',
  owner_draw: 'Owner draw',
  other: 'Other business cost',
  unclassified: 'Needs classification',
}

export function isExpenseClassification(value: unknown): value is ExpenseClassification {
  return typeof value === 'string' && (EXPENSE_CLASSIFICATIONS as readonly string[]).includes(value)
}

export function isExcludedFromOperatingProfit(classification: string | null | undefined) {
  return classification === 'inventory' || classification === 'owner_draw'
}

/**
 * Keeps historic, not-yet-classified expenses out of operating profit only when
 * their existing category or description already identifies them as stock or a
 * personal withdrawal. New expenses must be classified at entry time.
 */
export function isExcludedExpenseFromOperatingProfit(expense: {
  classification?: string | null
  categoryName?: string | null
  description?: string | null
}): boolean {
  if (isExcludedFromOperatingProfit(expense.classification)) return true
  if (expense.classification !== 'unclassified') return false

  const categoryName = (expense.categoryName || '').toLowerCase().trim()
  const isInventoryOrPersonal =
    categoryName === 'business expense' ||
    categoryName === 'personal items' ||
    categoryName === 'personal' ||
    categoryName === 'inventory' ||
    categoryName === 'stock' ||
    categoryName === 'stock purchase' ||
    categoryName === 'purchases' ||
    categoryName === 'goods' ||
    categoryName === 'wholesale' ||
    categoryName === 'vendor' ||
    categoryName === 'cogs' ||
    categoryName === 'cost of goods sold' ||
    categoryName === 'merchandise' ||
    categoryName === 'product purchases' ||
    categoryName.includes('inventory purchase') ||
    categoryName.includes('stock order') ||
    categoryName === 'inventory shipping' ||
    categoryName === 'stock shipping' ||
    categoryName.includes('product shipping')

  const description = (expense.description || '').toLowerCase()
  const hasInventoryKeywords =
    description.includes('inventory') ||
    description.includes('stock') ||
    description.includes('wholesale') ||
    description.includes('supplier') ||
    description.includes('vendor')

  return isInventoryOrPersonal || (hasInventoryKeywords && (categoryName === 'shipping' || categoryName === 'marketing'))
}
