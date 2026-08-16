import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'
import { isExpenseClassification } from '@/lib/expenseClassification'
import {
  isDocumentationRelevant,
  missingDocumentationFields,
  summarizeExpenseDocumentation,
} from '@/lib/expenseDocumentation'

/**
 * The guided answer flow behind `/finance/review`.
 *
 * GET turns the open documentation gaps into the smallest set of questions that
 * closes them: one question per expense category for the things a whole
 * category shares (who it was paid to, what it was for), and one question per
 * expense for classification, which genuinely differs row by row — the audit's
 * own note on those nine rows is "Category mixes inventory, personal spending
 * and a subscription. Classify individually."
 *
 * POST applies an answer. Nothing here moves money: no wallet balance, wallet
 * transaction, ledger entry or amount is touched, and no row is deleted. It is
 * still a Serializable transaction with an activity-log entry, because it edits
 * financial records and the book has to be able to say who answered what.
 *
 * The matching `finance_ledger_entries` rows are deliberately left alone. They
 * are append-only by database rule (R4) and they record what was known when the
 * money moved; a supplier name supplied months later does not change that.
 */

const MAX_VENDOR_LENGTH = 160
const MAX_DESCRIPTION_LENGTH = 500
const UNCATEGORIZED = 'uncategorized'

type GroupField = 'vendor' | 'description'

function isGroupField(value: unknown): value is GroupField {
  return value === 'vendor' || value === 'description'
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

const EXPENSE_SELECTION = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  classification: true,
  vendorName: true,
  description: true,
  expenseDate: true,
  createdAt: true,
  categoryId: true,
  needsReview: true,
  reviewReason: true,
  dateIsInferred: true,
  vendorIsInferred: true,
  descriptionIsInferred: true,
  category: { select: { id: true, name: true, defaultVendorName: true, defaultDescription: true } },
} satisfies Prisma.ExpenseSelect

type LoadedExpense = Prisma.ExpenseGetPayload<{ select: typeof EXPENSE_SELECTION }>

function groupKeyFor(expense: LoadedExpense): string {
  return expense.categoryId ?? UNCATEGORIZED
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const expenses = await prisma.expense.findMany({
      select: EXPENSE_SELECTION,
      orderBy: { createdAt: 'desc' },
    })

    const summary = summarizeExpenseDocumentation(expenses)
    const open = expenses.filter(
      (expense) => isDocumentationRelevant(expense) && missingDocumentationFields(expense).length > 0,
    )

    // One grouped question per category per shared field.
    const groups = new Map<string, {
      key: string
      field: GroupField
      categoryId: string | null
      categoryName: string
      suggestion: string | null
      count: number
      totals: Map<string, number>
      earliest: Date | null
      latest: Date | null
      samples: Array<{ id: string; date: string; amount: number; currency: string; description: string | null }>
    }>()

    const individual: Array<{
      id: string
      date: string
      amount: number
      currency: string
      categoryName: string
      description: string | null
      vendorName: string | null
      reviewReason: string | null
      dateIsInferred: boolean
    }> = []

    for (const expense of open) {
      const missing = missingDocumentationFields(expense)
      const categoryName = expense.category?.name ?? 'Uncategorized'
      const occurred = expense.expenseDate ?? expense.createdAt

      for (const field of missing) {
        if (!isGroupField(field)) continue
        const key = `${groupKeyFor(expense)}:${field}`
        let group = groups.get(key)
        if (!group) {
          group = {
            key,
            field,
            categoryId: expense.categoryId,
            categoryName,
            suggestion:
              field === 'vendor'
                ? expense.category?.defaultVendorName ?? null
                : expense.category?.defaultDescription ?? null,
            count: 0,
            totals: new Map(),
            earliest: null,
            latest: null,
            samples: [],
          }
          groups.set(key, group)
        }
        group.count += 1
        group.totals.set(expense.currency, (group.totals.get(expense.currency) ?? 0) + Number(expense.amount))
        if (!group.earliest || occurred < group.earliest) group.earliest = occurred
        if (!group.latest || occurred > group.latest) group.latest = occurred
        if (group.samples.length < 5) {
          group.samples.push({
            id: expense.id,
            date: occurred.toISOString(),
            amount: Number(expense.amount),
            currency: expense.currency,
            description: expense.description,
          })
        }
      }

      if (missing.includes('classification')) {
        individual.push({
          id: expense.id,
          date: occurred.toISOString(),
          amount: Number(expense.amount),
          currency: expense.currency,
          categoryName,
          description: expense.description,
          vendorName: expense.vendorName,
          reviewReason: expense.reviewReason,
          dateIsInferred: expense.dateIsInferred,
        })
      }
    }

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        summary,
        inferred: {
          dates: expenses.filter((expense) => expense.dateIsInferred).length,
          vendors: expenses.filter((expense) => expense.vendorIsInferred).length,
          descriptions: expenses.filter((expense) => expense.descriptionIsInferred).length,
        },
        groups: [...groups.values()]
          .sort((a, b) => b.count - a.count || a.categoryName.localeCompare(b.categoryName))
          .map((group) => ({
            key: group.key,
            field: group.field,
            categoryId: group.categoryId,
            categoryName: group.categoryName,
            suggestion: group.suggestion,
            count: group.count,
            totals: [...group.totals.entries()].map(([currency, amount]) => ({ currency, amount })),
            earliest: group.earliest?.toISOString() ?? null,
            latest: group.latest?.toISOString() ?? null,
            samples: group.samples,
          })),
        individual: individual.sort((a, b) => b.date.localeCompare(a.date)),
      },
    })
  } catch (error) {
    console.error('Finance documentation error:', error)
    return NextResponse.json({ error: 'Unable to build the documentation questions.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = (await request.json()) as Record<string, unknown>
    const kind = body.kind === 'group' ? 'group' : body.kind === 'expense' ? 'expense' : null
    if (!kind) return NextResponse.json({ error: 'Specify whether this answers a group or a single expense.' }, { status: 400 })

    const result = kind === 'group'
      ? await applyGroupAnswer(body, user, request)
      : await applyExpenseAnswer(body, user, request)

    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to record that answer.' },
      { status: 400 },
    )
  }
}

type Actor = Exclude<Awaited<ReturnType<typeof requireAdmin>>, NextResponse>

/**
 * Answers one category-wide question: "every Shipping expense without a
 * supplier went to X". Only rows that are still blank are filled, so answering
 * twice never overwrites something already recorded, and an answer given today
 * never disturbs a row someone documented by hand yesterday.
 */
async function applyGroupAnswer(body: Record<string, unknown>, user: Actor, request: NextRequest) {
  const field = body.field
  if (!isGroupField(field)) throw new Error('A group answer covers a supplier or an explanation.')

  const rawCategoryId = typeof body.categoryId === 'string' && body.categoryId !== UNCATEGORIZED ? body.categoryId : null
  const remember = body.remember === true
  const value = cleanText(body.value, field === 'vendor' ? MAX_VENDOR_LENGTH : MAX_DESCRIPTION_LENGTH)
  if (value.length < 2) throw new Error('Write at least 2 characters so the answer means something.')

  return runSerializableTransaction(async (tx) => {
    const category = rawCategoryId
      ? await tx.expenseCategory.findUnique({ where: { id: rawCategoryId }, select: { id: true, name: true } })
      : null
    if (rawCategoryId && !category) throw new Error('That expense category no longer exists.')

    // Filtered through the shared policy rather than a SQL null check, so
    // "blank" means exactly the same thing here as it does on the card that
    // counted the gap in the first place — a whitespace-only supplier included.
    const candidates = await tx.expense.findMany({
      where: { categoryId: rawCategoryId, status: { not: 'refunded' } },
      select: { id: true, status: true, classification: true, vendorName: true, description: true, expenseDate: true },
    })
    const targets = candidates.filter((candidate) => missingDocumentationFields(candidate).includes(field))

    if (targets.length === 0) throw new Error('Nothing is left to answer in that group.')

    const ids = targets.map((target) => target.id)
    await tx.expense.updateMany({
      where: { id: { in: ids } },
      data: field === 'vendor'
        ? { vendorName: value, vendorIsInferred: true }
        : { description: value, descriptionIsInferred: true },
    })

    if (remember) {
      if (!category) throw new Error('Only a real category can remember an answer for next time.')
      await tx.expenseCategory.update({
        where: { id: category.id },
        data: field === 'vendor' ? { defaultVendorName: value } : { defaultDescription: value },
      })
    }

    const closed = await markFullyDocumented(tx, ids, user.id)
    const categoryName = category?.name ?? 'Uncategorized'

    await writeActivityLog({
      action: 'update',
      entityType: 'expense',
      entityName: categoryName,
      details:
        `Answered "${field === 'vendor' ? 'who was this paid to' : 'what was this for'}" for ` +
        `${targets.length} ${categoryName} expense${targets.length === 1 ? '' : 's'}: "${value}". ` +
        `Applied as a group answer and flagged as inferred.`,
      metadata: { field, value, categoryId: rawCategoryId, expenseIds: ids, remember, fullyDocumented: closed },
      user,
      request,
      source: 'finance-documentation-api',
      client: tx,
    })

    return { updated: targets.length, fullyDocumented: closed, remembered: remember }
  })
}

/**
 * Answers one expense on its own. Classification lives here rather than in a
 * group answer because the nine open rows are a headlight, a subscription and
 * stock sitting in the same category.
 */
async function applyExpenseAnswer(body: Record<string, unknown>, user: Actor, request: NextRequest) {
  const expenseId = typeof body.expenseId === 'string' ? body.expenseId : ''
  if (!expenseId) throw new Error('An expense id is required.')

  const classification = body.classification
  const vendorName = cleanText(body.vendorName, MAX_VENDOR_LENGTH)
  const description = cleanText(body.description, MAX_DESCRIPTION_LENGTH)

  const data: Prisma.ExpenseUpdateInput = {}
  if (classification !== undefined && classification !== null && classification !== '') {
    if (!isExpenseClassification(classification) || classification === 'unclassified') {
      throw new Error('Choose a real classification.')
    }
    data.classification = classification
  }
  if (vendorName) {
    data.vendorName = vendorName
    data.vendorIsInferred = false
  }
  if (description) {
    data.description = description
    data.descriptionIsInferred = false
  }
  if (Object.keys(data).length === 0) throw new Error('Nothing was answered.')

  return runSerializableTransaction(async (tx) => {
    const existing = await tx.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, status: true, amount: true, currency: true, category: { select: { name: true } } },
    })
    if (!existing) throw new Error('Expense not found.')
    if (existing.status === 'refunded') {
      throw new Error('A refunded expense is closed history. Record a new expense instead.')
    }

    await tx.expense.update({ where: { id: expenseId }, data })
    const closed = await markFullyDocumented(tx, [expenseId], user.id)

    await writeActivityLog({
      action: 'update',
      entityType: 'expense',
      entityId: expenseId,
      entityName: existing.category?.name ?? 'Uncategorized',
      details:
        `Documented ${Number(existing.amount).toFixed(2)} ${existing.currency} expense: ` +
        [
          data.classification ? `classification ${String(data.classification)}` : null,
          vendorName ? `supplier "${vendorName}"` : null,
          description ? `explanation "${description}"` : null,
        ].filter(Boolean).join(', ') + '.',
      metadata: { expenseId, ...(data.classification ? { classification: data.classification } : {}), vendorName: vendorName || null, description: description || null },
      user,
      request,
      source: 'finance-documentation-api',
      client: tx,
    })

    return { updated: 1, fullyDocumented: closed }
  })
}

/**
 * Stamps who answered, and clears the review flag only once nothing is left
 * unanswered on that row — a partly answered expense stays in the queue.
 */
async function markFullyDocumented(
  tx: Prisma.TransactionClient,
  expenseIds: string[],
  userId: string,
): Promise<number> {
  const rows = await tx.expense.findMany({
    where: { id: { in: expenseIds } },
    select: { id: true, status: true, classification: true, vendorName: true, description: true, expenseDate: true },
  })
  const complete = rows
    .filter((row) => isDocumentationRelevant(row) && missingDocumentationFields(row).length === 0)
    .map((row) => row.id)

  if (complete.length === 0) return 0

  await tx.expense.updateMany({
    where: { id: { in: complete } },
    data: {
      needsReview: false,
      reviewReason: null,
      reviewedAt: new Date(),
      reviewedByUserId: userId,
    },
  })
  return complete.length
}
