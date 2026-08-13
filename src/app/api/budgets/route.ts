import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'
import type {
  BudgetsPageBudget,
  BudgetsPageBudgetCategory,
  BudgetsPageDataPayload,
  BudgetsPageExpense,
  BudgetsPageExpenseCategory,
  BudgetsPageGoal,
  BudgetsPageWallet,
} from '@/types/budgets'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toDateString(value: Date | null | undefined): string | null {
  return value ? value.toISOString().split('T')[0] : null
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [budgetCategories, expenseCategories, budgets, goals, wallets, expenses] = await Promise.all([
      prisma.budgetCategory.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          linked_expense_categories: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.expenseCategory.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.budget.findMany({
        select: {
          id: true,
          categoryId: true,
          amountAllowed: true,
          amountSpent: true,
          period: true,
          startDate: true,
          endDate: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: {
              id: true,
              name: true,
              type: true,
              linked_expense_categories: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.goal.findMany({
        select: {
          id: true,
          name: true,
          targetAmount: true,
          currentAmount: true,
          deadline: true,
          currency: true,
          walletId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.wallet.findMany({
        select: {
          id: true,
          personName: true,
          type: true,
          currency: true,
          balance: true,
          location_id: true,
          locations: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expense.findMany({
        select: {
          id: true,
          categoryId: true,
          walletId: true,
          amount: true,
          currency: true,
          description: true,
          createdAt: true,
          location_id: true,
          category: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const data: BudgetsPageDataPayload = {
      budgetCategories: budgetCategories.map<BudgetsPageBudgetCategory>((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        linked_expense_categories: category.linked_expense_categories,
        created_at: toIsoString(category.createdAt),
      })),
      expenseCategories: expenseCategories.map<BudgetsPageExpenseCategory>((category) => ({
        id: category.id,
        name: category.name,
        created_at: toIsoString(category.createdAt),
      })),
      budgets: budgets.map<BudgetsPageBudget>((budget) => ({
        id: budget.id,
        category_id: budget.categoryId,
        amount_allowed: toNumber(budget.amountAllowed),
        amount_spent: toNumber(budget.amountSpent),
        period: budget.period,
        start_date: toDateString(budget.startDate) ?? '',
        end_date: toDateString(budget.endDate),
        currency: budget.currency,
        created_at: toIsoString(budget.createdAt),
        updated_at: toIsoString(budget.updatedAt),
        budget_categories: budget.category
          ? {
            id: budget.category.id,
            name: budget.category.name,
            type: budget.category.type,
            linked_expense_categories: budget.category.linked_expense_categories,
            created_at: toIsoString(budget.category.createdAt),
          }
          : null,
      })),
      goals: goals.map<BudgetsPageGoal>((goal) => ({
        id: goal.id,
        name: goal.name,
        target_amount: toNumber(goal.targetAmount),
        current_amount: toNumber(goal.currentAmount),
        deadline: toDateString(goal.deadline),
        currency: goal.currency,
        wallet_id: goal.walletId,
        created_at: toIsoString(goal.createdAt),
        updated_at: toIsoString(goal.updatedAt),
      })),
      wallets: wallets.map<BudgetsPageWallet>((wallet) => ({
        id: wallet.id,
        person_name: wallet.personName,
        type: wallet.type,
        currency: wallet.currency,
        balance: toNumber(wallet.balance),
        location_id: wallet.location_id,
        locations: wallet.locations
          ? {
            id: wallet.locations.id,
            name: wallet.locations.name,
          }
          : null,
      })),
      expenses: expenses.map<BudgetsPageExpense>((expense) => ({
        id: expense.id,
        category_id: expense.categoryId,
        wallet_id: expense.walletId,
        amount: toNumber(expense.amount),
        currency: expense.currency,
        description: expense.description,
        created_at: toIsoString(expense.createdAt),
        location_id: expense.location_id,
        expense_categories: expense.category
          ? {
            name: expense.category.name,
          }
          : null,
      })),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Budgets route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `${name} is required.`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function amount(value: unknown, name: string) {
  const result = Number(value)
  if (!Number.isFinite(result) || result < 0) throw new ApiError(400, `${name} must be a non-negative amount.`)
  return Math.round(result * 10000) / 10000
}

function date(value: unknown, name: string, required = false) {
  if (value == null || value === '') {
    if (required) throw new ApiError(400, `${name} is required.`)
    return null
  }
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) throw new ApiError(400, `${name} must be a valid date.`)
  return new Date(value)
}

function currency(value: unknown) {
  if (value === 'SRD' || value === 'USD') return value
  throw new ApiError(400, 'Currency must be SRD or USD.')
}

function apiError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Budgets mutation error:', error)
  return NextResponse.json({ error: 'Unable to save budget data.' }, { status: 500 })
}

async function activeCompany(tx: Prisma.TransactionClient) {
  const company = await tx.company.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!company) throw new ApiError(409, 'No active company is configured.')
  return company
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request)
  if (actor instanceof NextResponse) return actor

  try {
    const body = await request.json() as Record<string, unknown>
    const action = requiredString(body.action, 'action')
    const data = await runSerializableTransaction(async (tx) => {
      if (action === 'saveCategory') {
        const id = optionalString(body.id)
        const name = requiredString(body.name, 'Category name').slice(0, 160)
        const type = requiredString(body.type, 'Category type')
        const linkedExpenseCategories = optionalString(body.linked_expense_categories)
        const category = id
          ? await tx.budgetCategory.update({ where: { id }, data: { name, type, linked_expense_categories: linkedExpenseCategories }, select: { id: true } })
          : await tx.budgetCategory.create({ data: { name, type, linked_expense_categories: linkedExpenseCategories }, select: { id: true } })
        await writeActivityLog({ action: id ? 'update' : 'create', entityType: 'budget_category', entityId: category.id, entityName: name, details: `${id ? 'Updated' : 'Created'} budget category.`, user: actor, request, source: 'server', client: tx })
        return category
      }
      if (action === 'saveBudget') {
        const id = optionalString(body.id)
        const categoryId = requiredString(body.category_id, 'Budget category')
        const amountAllowed = amount(body.amount_allowed, 'Budget amount')
        const amountSpent = amount(body.amount_spent ?? 0, 'Spent amount')
        const period = requiredString(body.period, 'Period')
        if (!['monthly', 'yearly', 'custom'].includes(period)) throw new ApiError(400, 'Invalid budget period.')
        const startDate = date(body.start_date, 'Start date', true)!
        const endDate = date(body.end_date, 'End date')
        if (endDate && endDate < startDate) throw new ApiError(400, 'End date cannot be before start date.')
        const category = await tx.budgetCategory.findUnique({ where: { id: categoryId }, select: { id: true, name: true } })
        if (!category) throw new ApiError(404, 'Budget category not found.')
        const values = { categoryId, amountAllowed, amountSpent, period, startDate, endDate, currency: currency(body.currency) }
        const budget = id
          ? await tx.budget.update({ where: { id }, data: values, select: { id: true } })
          : await tx.budget.create({ data: { companyId: (await activeCompany(tx)).id, ...values }, select: { id: true } })
        await writeActivityLog({ action: id ? 'update' : 'create', entityType: 'budget', entityId: budget.id, entityName: category.name, details: `${id ? 'Updated' : 'Created'} ${period} budget of ${amountAllowed.toFixed(2)} ${values.currency}.`, user: actor, request, source: 'server', client: tx })
        return budget
      }
      if (action === 'saveGoal') {
        const id = optionalString(body.id)
        const name = requiredString(body.name, 'Goal name').slice(0, 160)
        const targetAmount = amount(body.target_amount, 'Target amount')
        const currentAmount = amount(body.current_amount ?? 0, 'Current amount')
        const walletId = optionalString(body.wallet_id)
        if (walletId && !await tx.wallet.findUnique({ where: { id: walletId }, select: { id: true } })) throw new ApiError(404, 'Wallet not found.')
        const values = { name, targetAmount, currentAmount, deadline: date(body.deadline, 'Deadline'), currency: currency(body.currency), walletId }
        const goal = id ? await tx.goal.update({ where: { id }, data: values, select: { id: true } }) : await tx.goal.create({ data: values, select: { id: true } })
        await writeActivityLog({ action: id ? 'update' : 'create', entityType: 'goal', entityId: goal.id, entityName: name, details: `${id ? 'Updated' : 'Created'} savings goal.`, user: actor, request, source: 'server', client: tx })
        return goal
      }
      if (action === 'addGoalProgress') {
        const id = requiredString(body.id, 'Goal id')
        const progress = amount(body.amount, 'Progress amount')
        if (progress <= 0) throw new ApiError(400, 'Progress amount must be greater than zero.')
        const goal = await tx.goal.update({ where: { id }, data: { currentAmount: { increment: progress } }, select: { id: true, name: true } })
        await writeActivityLog({ action: 'update', entityType: 'goal', entityId: goal.id, entityName: goal.name, details: `Recorded ${progress.toFixed(2)} goal progress.`, user: actor, request, source: 'server', client: tx })
        return goal
      }
      if (action === 'sync') {
        const exchangeRate = await tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } })
        if (!exchangeRate) throw new ApiError(409, 'Set an active exchange rate before syncing budgets.')
        const budgets = await tx.budget.findMany({ include: { category: true } })
        let updated = 0
        for (const budget of budgets) {
          const categoryIds = (budget.category.linked_expense_categories ?? '').split(',').map((id) => id.trim()).filter(Boolean)
          const expenses = categoryIds.length === 0 ? [] : await tx.expense.findMany({ where: { categoryId: { in: categoryIds }, status: 'posted', createdAt: { gte: budget.startDate, lte: budget.endDate ?? new Date() } }, select: { amount: true, currency: true } })
          const spent = expenses.reduce((sum, expense) => sum + (expense.currency === budget.currency ? Number(expense.amount) : budget.currency === 'SRD' ? Number(expense.amount) * Number(exchangeRate.usdToSrd) : Number(expense.amount) / Number(exchangeRate.usdToSrd)), 0)
          const rounded = Math.round(spent * 100) / 100
          if (rounded !== Number(budget.amountSpent)) { await tx.budget.update({ where: { id: budget.id }, data: { amountSpent: rounded } }); updated++ }
        }
        await writeActivityLog({ action: 'update', entityType: 'budget', entityId: 'sync', entityName: 'Budget sync', details: `Synced ${updated} budget(s) from posted expenses.`, user: actor, request, source: 'server', client: tx })
        return { updated }
      }
      throw new ApiError(400, 'Unsupported budget action.')
    })
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
