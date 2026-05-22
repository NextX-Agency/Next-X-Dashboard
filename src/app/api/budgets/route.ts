import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
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