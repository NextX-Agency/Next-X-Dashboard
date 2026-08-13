import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { Prisma } from '@prisma/client'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'
import { isExpenseClassification } from '@/lib/expenseClassification'
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
          expenseDate: true,
          vendorName: true,
          receiptNumber: true,
          classification: true,
          status: true,
          refundedAt: true,
          refundReason: true,
          reviewedAt: true,
          reviewedByUserId: true,
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
        expense_date: expense.expenseDate?.toISOString() ?? null,
        vendor_name: expense.vendorName,
        receipt_number: expense.receiptNumber,
        classification: expense.classification,
        status: expense.status,
        refunded_at: expense.refundedAt?.toISOString() ?? null,
        refund_reason: expense.refundReason,
        reviewed_at: expense.reviewedAt?.toISOString() ?? null,
        reviewed_by_user_id: expense.reviewedByUserId,
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

function parseAmount(value: unknown) {
  const amount = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Expense amount must be greater than zero.')
  return Math.round(amount * 100) / 100
}

function parseExpenseDate(value: unknown) {
  const rawDate = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new Error('A valid expense date is required.')
  const date = new Date(`${rawDate}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawDate) throw new Error('A valid expense date is required.')
  const today = new Date()
  today.setUTCHours(23, 59, 59, 999)
  if (date > today) throw new Error('An expense cannot be dated in the future.')
  return date
}

function optionalText(value: unknown, maximumLength: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  if (text.length > maximumLength) throw new Error(`Use no more than ${maximumLength} characters.`)
  return text
}

function parseExpenseBody(body: Record<string, unknown>) {
  const locationId = typeof body.locationId === 'string' ? body.locationId : typeof body.location_id === 'string' ? body.location_id : ''
  const walletId = typeof body.walletId === 'string' ? body.walletId : typeof body.wallet_id === 'string' ? body.wallet_id : ''
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId : typeof body.category_id === 'string' ? body.category_id : null
  const currency = body.currency === 'USD' || body.currency === 'SRD' ? body.currency : null
  const description = optionalText(body.description, 500)
  const vendorName = optionalText(body.vendorName ?? body.vendor_name ?? body.vendor, 160)
  const receiptNumber = optionalText(body.receiptNumber ?? body.receipt_number, 120)
  const classification = body.classification
  const expenseDate = parseExpenseDate(body.expenseDate ?? body.expense_date)
  if (!locationId || !walletId || !currency) throw new Error('Location, wallet, and currency are required.')
  if (!vendorName) throw new Error('A supplier, payee, or counterparty is required.')
  if (!description || description.length < 3) throw new Error('Add a clear description of at least 3 characters.')
  if (!isExpenseClassification(classification) || classification === 'unclassified') {
    throw new Error('Choose the financial classification for this expense.')
  }
  return { locationId, walletId, categoryId, currency, description, vendorName, receiptNumber, classification, expenseDate }
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const amount = parseAmount(body.amount)
    const { locationId, walletId, categoryId, currency, description, vendorName, receiptNumber, classification, expenseDate } = parseExpenseBody(body)

    const expense = await prisma.$transaction(async (tx) => {
      await markFinanceLedgerRecorded(tx)
      const wallet = await tx.wallet.findFirst({
        where: { id: walletId, location_id: locationId, currency },
        select: { id: true, companyId: true, balance: true, currency: true, personName: true },
      })
      if (!wallet) throw new Error('Select a wallet belonging to the chosen location and currency.')
      if (Number(wallet.balance) < amount) throw new Error('Insufficient wallet balance.')

      const created = await tx.expense.create({
        data: {
          companyId: wallet.companyId,
          location_id: locationId, categoryId, walletId, amount, currency, description,
          expenseDate, vendorName, receiptNumber, classification,
        },
        select: { id: true, createdAt: true, expenseDate: true, category: { select: { name: true } } },
      })
      const debitedWallet = await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { decrement: amount } },
        select: { balance: true },
      })
      const after = Math.round(Number(debitedWallet.balance) * 100) / 100
      const before = Math.round((after + amount) * 100) / 100
      const walletTransaction = await tx.wallet_transactions.create({
        data: {
          companyId: wallet.companyId,
          wallet_id: walletId, expense_id: created.id, type: 'debit', amount,
          balance_before: before, balance_after: after, currency,
          description: `Expense to ${vendorName}: ${description}`,
          reference_type: 'expense', reference_id: created.id,
        },
      })
      await recordFinanceLedgerEntry(tx, {
        companyId: wallet.companyId,
        walletTransactionId: walletTransaction.id, walletId, locationId, categoryId, actorUserId: user.id,
        eventType: 'expense', direction: 'out', amount, currency: currency as 'SRD' | 'USD',
        sourceType: 'expense', sourceId: created.id, counterparty: vendorName,
        description: `${description}${receiptNumber ? ` · Receipt ${receiptNumber}` : ''}`,
        occurredAt: created.expenseDate ?? created.createdAt,
        metadata: { classification, expenseDate: expenseDate.toISOString().slice(0, 10), receiptNumber },
      })
      await writeActivityLog({
        action: 'create', entityType: 'expense', entityId: created.id, entityName: created.category?.name ?? 'Uncategorized',
        details: `Recorded ${amount.toFixed(2)} ${currency} ${classification} expense to ${vendorName} from ${wallet.personName}.`,
        user, request, source: 'expenses-api', client: tx,
      })
      return created
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({ data: expense }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record expense.' }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const expenseId = typeof body.id === 'string' ? body.id : ''
    if (!expenseId) return NextResponse.json({ error: 'Expense id is required.' }, { status: 400 })
    const amount = parseAmount(body.amount)
    const { locationId, walletId, categoryId, currency, description, vendorName, receiptNumber, classification, expenseDate } = parseExpenseBody(body)

    const expense = await prisma.$transaction(async (tx) => {
      await markFinanceLedgerRecorded(tx)
      const existing = await tx.expense.findUnique({
        where: { id: expenseId },
        select: {
          id: true, companyId: true, walletId: true, location_id: true, currency: true, amount: true, status: true,
          expenseDate: true, vendorName: true, receiptNumber: true, classification: true,
          category: { select: { name: true } },
        },
      })
      if (!existing) throw new Error('Expense not found.')
      if (existing.status === 'refunded') throw new Error('A refunded expense is locked. Record a new expense instead.')
      if (existing.walletId !== walletId || existing.location_id !== locationId || existing.currency !== currency) {
        throw new Error('Keep the original location, wallet, and currency. Record a compensating expense instead of moving history.')
      }
      if (existing.expenseDate && existing.expenseDate.toISOString().slice(0, 10) !== expenseDate.toISOString().slice(0, 10)) {
        throw new Error('The booked expense date is locked once set. Refund and record a new expense if the date is materially wrong.')
      }

      const difference = Math.round((amount - Number(existing.amount)) * 100) / 100
      const wallet = await tx.wallet.findUnique({ where: { id: walletId }, select: { companyId: true, balance: true, currency: true, personName: true } })
      if (!wallet) throw new Error('Wallet not found.')
      if (wallet.companyId !== existing.companyId) throw new Error('Expense and wallet company scopes do not match.')
      if (difference > 0 && Number(wallet.balance) < difference) throw new Error('Insufficient wallet balance for this increase.')

      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          categoryId, amount, description, expenseDate, vendorName, receiptNumber, classification,
          reviewedAt: new Date(), reviewedByUserId: user.id,
        },
        select: { id: true, category: { select: { name: true } } },
      })
      if (difference !== 0) {
        const adjustedWallet = await tx.wallet.update({
          where: { id: walletId },
          data: difference > 0 ? { balance: { decrement: difference } } : { balance: { increment: Math.abs(difference) } },
          select: { balance: true },
        })
        const after = Math.round(Number(adjustedWallet.balance) * 100) / 100
        const before = Math.round((after + difference) * 100) / 100
        const walletTransaction = await tx.wallet_transactions.create({
          data: {
            companyId: wallet.companyId,
            wallet_id: walletId, expense_id: expenseId, type: difference > 0 ? 'debit' : 'credit', amount: Math.abs(difference),
            balance_before: before, balance_after: after, currency,
            description: `Expense correction for ${vendorName}: ${description}`,
            reference_type: 'expense_correction', reference_id: expenseId,
          },
        })
        await recordFinanceLedgerEntry(tx, {
          companyId: wallet.companyId,
          walletTransactionId: walletTransaction.id, walletId, locationId, categoryId, actorUserId: user.id,
          eventType: 'expense', direction: difference > 0 ? 'out' : 'in', amount: Math.abs(difference), currency: currency as 'SRD' | 'USD',
          sourceType: 'expense_correction', sourceId: expenseId, counterparty: vendorName,
          description: `Correction from ${Number(existing.amount).toFixed(2)} to ${amount.toFixed(2)} ${currency}: ${description}`,
          metadata: {
            previousAmount: Number(existing.amount), nextAmount: amount,
            previousClassification: existing.classification, classification,
            expenseDate: expenseDate.toISOString().slice(0, 10), receiptNumber,
          },
        })
      }
      await writeActivityLog({
        action: 'update', entityType: 'expense', entityId: expenseId, entityName: updated.category?.name ?? 'Uncategorized',
        details: `Reviewed ${classification} expense to ${vendorName} at ${amount.toFixed(2)} ${currency}; any amount correction remains in the ledger.`,
        user, request, source: 'expenses-api', client: tx,
      })
      return updated
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({ data: expense })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update expense.' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const expenseId = request.nextUrl.searchParams.get('id')
    if (!expenseId) return NextResponse.json({ error: 'Expense id is required.' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      await markFinanceLedgerRecorded(tx)
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        select: {
          id: true, companyId: true, amount: true, currency: true, walletId: true, location_id: true,
          categoryId: true, description: true, status: true, expenseDate: true, vendorName: true,
          receiptNumber: true, classification: true, category: { select: { name: true } },
        },
      })
      if (!expense) throw new Error('Expense not found.')
      const amount = Number(expense.amount)
      if (expense.status === 'refunded') throw new Error('This expense has already been refunded.')
      const wallet = await tx.wallet.findUnique({ where: { id: expense.walletId }, select: { companyId: true, balance: true, currency: true, personName: true } })
      if (!wallet) throw new Error('Expense wallet not found.')
      if (wallet.companyId !== expense.companyId) throw new Error('Expense and wallet company scopes do not match.')

      const creditedWallet = await tx.wallet.update({
        where: { id: expense.walletId },
        data: { balance: { increment: amount } },
        select: { balance: true },
      })
      const after = Math.round(Number(creditedWallet.balance) * 100) / 100
      const before = Math.round((after - amount) * 100) / 100
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          status: 'refunded',
          refundedAt: new Date(),
          refundReason: 'Refunded to the source wallet; original amount retained for audit.',
          reviewedAt: new Date(),
          reviewedByUserId: user.id,
        },
      })
      const walletTransaction = await tx.wallet_transactions.create({
        data: {
          companyId: wallet.companyId,
          wallet_id: expense.walletId, expense_id: expenseId, type: 'credit', amount,
          balance_before: before, balance_after: after, currency: wallet.currency,
          description: `Expense refund from ${expense.vendorName || 'unrecorded vendor'}: ${expense.description || 'No description'}`,
          reference_type: 'expense_refund', reference_id: expenseId,
        },
      })
      await recordFinanceLedgerEntry(tx, {
        companyId: wallet.companyId,
        walletTransactionId: walletTransaction.id, walletId: expense.walletId, locationId: expense.location_id,
        categoryId: expense.categoryId, actorUserId: user.id, eventType: 'expense', direction: 'in', amount,
        currency: wallet.currency as 'SRD' | 'USD', sourceType: 'expense_refund', sourceId: expenseId,
        counterparty: expense.vendorName,
        description: `Refunded expense: ${expense.description || 'No description'}`,
        metadata: {
          classification: expense.classification,
          expenseDate: expense.expenseDate?.toISOString().slice(0, 10) ?? null,
          receiptNumber: expense.receiptNumber,
        },
      })
      await writeActivityLog({
        action: 'cancel', entityType: 'expense', entityId: expenseId, entityName: expense.category?.name ?? 'Uncategorized',
        details: `Refunded ${amount.toFixed(2)} ${wallet.currency}; the original expense amount is retained for audit.`,
        user, request, source: 'expenses-api', client: tx,
      })
      return { expenseId, refunded: amount, currency: wallet.currency }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to refund expense.' }, { status: 400 })
  }
}
