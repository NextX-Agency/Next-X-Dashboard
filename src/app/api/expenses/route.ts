import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  ExpensesPageDataPayload,
  ExpensesPageExpense,
  ExpensesPageExpenseCategory,
  ExpensesPageLocation,
  ExpensesPageWallet,
} from '@/types/expenses'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

const mapLocation = (location: {
  id: string
  name: string
  address: string | null
  createdAt: Date
  updatedAt: Date
  seller_name: string | null
  seller_phone: string | null
  commission_rate: unknown
  is_active: boolean | null
}): ExpensesPageLocation => ({
  id: location.id,
  name: location.name,
  address: location.address,
  created_at: toIsoString(location.createdAt),
  updated_at: toIsoString(location.updatedAt),
  seller_name: location.seller_name,
  seller_phone: location.seller_phone,
  commission_rate: toNumber(location.commission_rate),
  is_active: location.is_active,
})

const mapWallet = (wallet: {
  id: string
  personName: string
  type: string
  currency: string
  balance: unknown
  createdAt: Date
  updatedAt: Date
  location_id: string | null
}): ExpensesPageWallet => ({
  id: wallet.id,
  person_name: wallet.personName,
  type: wallet.type,
  currency: wallet.currency,
  balance: toNumber(wallet.balance),
  created_at: toIsoString(wallet.createdAt),
  updated_at: toIsoString(wallet.updatedAt),
  location_id: wallet.location_id,
})

const mapCategory = (category: {
  id: string
  name: string
  createdAt: Date
}): ExpensesPageExpenseCategory => ({
  id: category.id,
  name: category.name,
  created_at: toIsoString(category.createdAt),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [categories, expenses, wallets, locations] = await Promise.all([
      prisma.expenseCategory.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
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
              id: true,
              name: true,
              createdAt: true,
            },
          },
          wallet: {
            select: {
              id: true,
              personName: true,
              type: true,
              currency: true,
              balance: true,
              createdAt: true,
              updatedAt: true,
              location_id: true,
            },
          },
          locations: {
            select: {
              id: true,
              name: true,
              address: true,
              createdAt: true,
              updatedAt: true,
              seller_name: true,
              seller_phone: true,
              commission_rate: true,
              is_active: true,
            },
          },
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
          createdAt: true,
          updatedAt: true,
          location_id: true,
        },
        orderBy: { personName: 'asc' },
      }),
      prisma.location.findMany({
        where: { is_active: true },
        select: {
          id: true,
          name: true,
          address: true,
          createdAt: true,
          updatedAt: true,
          seller_name: true,
          seller_phone: true,
          commission_rate: true,
          is_active: true,
        },
        orderBy: { name: 'asc' },
      }),
    ])

    const data: ExpensesPageDataPayload = {
      categories: categories.map(mapCategory),
      expenses: expenses.map<ExpensesPageExpense>((expense) => ({
        id: expense.id,
        category_id: expense.categoryId,
        wallet_id: expense.walletId,
        amount: toNumber(expense.amount),
        currency: expense.currency,
        description: expense.description,
        created_at: toIsoString(expense.createdAt),
        location_id: expense.location_id,
        expense_categories: expense.category ? mapCategory(expense.category) : null,
        wallets: expense.wallet ? mapWallet(expense.wallet) : null,
        locations: expense.locations ? mapLocation(expense.locations) : null,
      })),
      wallets: wallets.map(mapWallet),
      locations: locations.map(mapLocation),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Expenses route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}