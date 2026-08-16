import { isExpenseClassification } from '@/lib/expenseClassification'

/**
 * One definition of "this expense is not fully documented", shared by the
 * review card, the review queue and the guided answer flow.
 *
 * Before this module the `/finance` card counted five fields across 85 expenses
 * and rendered four of them, so it reported 324 open checks against a book that
 * only contains 85 expenses. Two of those five were not questions at all:
 *
 * - **Date** was blank on 83 of 85 rows only because `expense_date` shipped
 *   without a backfill, while `created_at` was populated the whole time. The
 *   2026-08-16 migration filled it and flagged it. It stays in this list so a
 *   future row that somehow arrives without a date is still caught.
 * - **Receipt number** is deliberately absent. Not one expense in the book
 *   carries one, and the owner decided on 2026-08-16 that chasing a receipt
 *   number for every cash payment costs more than it is worth. The column and
 *   every stored value stay — a receipt that does exist is still recorded and
 *   shown — but a blank one is no longer treated as an open question. Adding it
 *   back here is the only change needed to reverse that.
 *
 * What remains are the four things only the owner can answer.
 */

export const DOCUMENTATION_FIELDS = ['classification', 'vendor', 'description', 'date'] as const

export type DocumentationField = typeof DOCUMENTATION_FIELDS[number]

export const DOCUMENTATION_FIELD_LABELS: Record<DocumentationField, string> = {
  classification: 'Missing classification',
  vendor: 'Missing supplier',
  description: 'Missing explanation',
  date: 'Missing date',
}

/** What the owner is actually being asked, in the guided flow. */
export const DOCUMENTATION_FIELD_QUESTIONS: Record<DocumentationField, string> = {
  classification: 'How should this be classified?',
  vendor: 'Who was this paid to?',
  description: 'What was this for?',
  date: 'When did this happen?',
}

export type DocumentableExpense = {
  status?: string | null
  classification?: string | null
  vendorName?: string | null
  description?: string | null
  expenseDate?: Date | string | null
}

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim()
}

/**
 * A refunded expense is closed history. It is never edited (R4) and so is never
 * asked about.
 */
export function isDocumentationRelevant(expense: DocumentableExpense): boolean {
  return expense.status !== 'refunded'
}

export function missingDocumentationFields(expense: DocumentableExpense): DocumentationField[] {
  const missing: DocumentationField[] = []
  if (!isExpenseClassification(expense.classification) || expense.classification === 'unclassified') {
    missing.push('classification')
  }
  if (isBlank(expense.vendorName)) missing.push('vendor')
  if (isBlank(expense.description)) missing.push('description')
  if (!expense.expenseDate) missing.push('date')
  return missing
}

export type ExpenseDocumentationSummary = {
  /**
   * The headline number: how many expenses need at least one answer. Counting
   * expenses rather than fields is what keeps it comparable to the size of the
   * book — it can never exceed the number of expenses.
   */
  expensesNeedingAttention: number
  /** Total unanswered fields across those expenses. Always >= the headline. */
  openFields: number
  byField: Record<DocumentationField, number>
  documented: number
  refunded: number
  total: number
}

export function emptyDocumentationSummary(): ExpenseDocumentationSummary {
  return {
    expensesNeedingAttention: 0,
    openFields: 0,
    byField: { classification: 0, vendor: 0, description: 0, date: 0 },
    documented: 0,
    refunded: 0,
    total: 0,
  }
}

export function summarizeExpenseDocumentation(
  expenses: readonly DocumentableExpense[],
): ExpenseDocumentationSummary {
  const summary = emptyDocumentationSummary()

  for (const expense of expenses) {
    if (!isDocumentationRelevant(expense)) {
      summary.refunded += 1
      continue
    }
    summary.total += 1
    const missing = missingDocumentationFields(expense)
    if (missing.length === 0) {
      summary.documented += 1
      continue
    }
    summary.expensesNeedingAttention += 1
    summary.openFields += missing.length
    for (const field of missing) summary.byField[field] += 1
  }

  return summary
}
