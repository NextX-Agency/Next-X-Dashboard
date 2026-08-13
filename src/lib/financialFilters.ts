import type { Prisma } from '@prisma/client'

/**
 * One place that decides which financial rows count toward a derived figure.
 *
 * Two independent reasons a row must drop out:
 *
 *   - **Voided** (T-13). The sale was reversed by contra entries. It still
 *     exists, and its cash movement still shows on the ledger alongside its
 *     reversal, but it is not revenue.
 *   - **Flagged for review** (T-09). The row is known to be untrustworthy —
 *     a header with no line items, a header disagreeing with its lines, an item
 *     with no cost. Part 5's rule is to record the unknown as unknown and keep
 *     it out of every derived figure rather than guess at it.
 *
 * "Derived figure" means margin, run rate, COGS, payout base, dashboard
 * revenue — anything the business makes a decision on. It does **not** mean
 * cash. Cash is whatever moved through the wallet, and the ledger is the record
 * of that; a voided sale's money genuinely did move, and its reversal genuinely
 * moved it back.
 *
 * Import these rather than hand-writing `status: 'posted'` at each call site.
 * There are more than twenty of them, and the one that gets forgotten is the
 * one that quietly reports a voided sale as revenue.
 */

/** Sales that count as revenue. */
export const COUNTABLE_SALE = {
  status: 'posted',
  needsReview: false,
} satisfies Prisma.SaleWhereInput

/**
 * Sales whose cash actually moved. A voided sale's original movement is real —
 * it is only netted off by its reversal — so cash views keep it and pair it
 * with the contra entry instead of hiding it.
 */
export const CASH_MOVING_SALE = {} satisfies Prisma.SaleWhereInput

/** Sale lines belonging to a countable sale. */
export const COUNTABLE_SALE_ITEM = {
  sale: COUNTABLE_SALE,
} satisfies Prisma.SaleItemWhereInput

/** Expenses that count toward run rate and operating profit. */
export const COUNTABLE_EXPENSE = {
  status: 'posted',
  needsReview: false,
} satisfies Prisma.ExpenseWhereInput

/**
 * Merge the countable-sale filter into an existing `where`, keeping both.
 * Spreading is enough here because no caller sets `status` or `needsReview`
 * itself — if one ever does, it should be doing so deliberately and not via
 * this helper.
 */
export function countableSaleWhere(where: Prisma.SaleWhereInput = {}): Prisma.SaleWhereInput {
  return { ...where, ...COUNTABLE_SALE }
}

export function countableSaleItemWhere(where: Prisma.SaleItemWhereInput = {}): Prisma.SaleItemWhereInput {
  const existingSale = (where.sale ?? {}) as Prisma.SaleWhereInput
  return { ...where, sale: { ...existingSale, ...COUNTABLE_SALE } }
}

export function countableExpenseWhere(where: Prisma.ExpenseWhereInput = {}): Prisma.ExpenseWhereInput {
  return { ...where, ...COUNTABLE_EXPENSE }
}
