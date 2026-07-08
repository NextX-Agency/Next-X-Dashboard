import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

type TransactionMode = 'add' | 'remove' | 'correct'

class ApiError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new ApiError(`${field} is required.`)
}

function parseAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError('Amount must be a positive amount or zero.')
  }
  return Math.round(amount * 100) / 100
}

function parseMode(value: unknown): TransactionMode {
  if (value === 'add' || value === 'remove' || value === 'correct') return value
  throw new ApiError('Transaction type must be add, remove, or correct.')
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function handleError(error: unknown) {
  if (error instanceof ApiError) return jsonError(error.message, error.status)

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
    return jsonError('The wallet database schema is not up to date. Apply the wallet purpose migration before changing balances.', 500)
  }

  console.error('Wallet transaction route error:', error)
  return jsonError('Failed to update wallet balance.', 500)
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json() as Record<string, unknown>
    const walletId = parseUuid(body.walletId ?? body.wallet_id, 'walletId')
    const mode = parseMode(body.type)
    const amount = parseAmount(body.amount)
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (mode !== 'correct' && amount <= 0) {
      throw new ApiError('Amount must be greater than zero.', 400)
    }

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { id: walletId },
        select: {
          id: true,
          personName: true,
          type: true,
          currency: true,
          balance: true,
          locations: { select: { name: true } },
        },
      })

      if (!wallet) throw new ApiError('Wallet not found.', 404)

      const previousBalance = toNumber(wallet.balance)
      const nextBalance = mode === 'correct'
        ? amount
        : mode === 'add'
          ? Math.round((previousBalance + amount) * 100) / 100
          : Math.round((previousBalance - amount) * 100) / 100

      if (nextBalance < 0) {
        throw new ApiError('Insufficient wallet balance.', 409)
      }

      const ledgerAmount = mode === 'correct'
        ? Math.abs(Math.round((nextBalance - previousBalance) * 100) / 100)
        : amount

      const updatedWallet = await tx.wallet.update({
        where: { id: walletId },
        data: { balance: nextBalance },
        select: {
          id: true,
          balance: true,
          currency: true,
        },
      })

      const transaction = ledgerAmount === 0
        ? null
        : await tx.wallet_transactions.create({
          data: {
            wallet_id: walletId,
            type: mode === 'correct' ? 'adjustment' : mode === 'add' ? 'credit' : 'debit',
            amount: ledgerAmount,
            balance_before: previousBalance,
            balance_after: nextBalance,
            description: description || (mode === 'correct'
              ? `Balance correction to ${nextBalance.toFixed(2)} ${wallet.currency}`
              : `Manual ${mode === 'add' ? 'deposit' : 'withdrawal'}`),
            reference_type: mode === 'correct' ? 'correction' : 'manual_adjustment',
            currency: wallet.currency,
          },
        })

      await writeActivityLog({
        action: 'update',
        entityType: 'wallet',
        entityId: walletId,
        entityName: `${wallet.locations?.name || wallet.personName} - ${wallet.type} ${wallet.currency}`,
        details: mode === 'correct'
          ? `Corrected balance from ${previousBalance.toFixed(2)} ${wallet.currency} to ${nextBalance.toFixed(2)} ${wallet.currency}`
          : `${mode === 'add' ? 'Added' : 'Removed'} ${amount.toFixed(2)} ${wallet.currency}; balance is now ${nextBalance.toFixed(2)} ${wallet.currency}`,
        user: authResult,
        request,
        source: 'server',
        client: tx,
      })

      return { wallet: updatedWallet, transaction }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    return handleError(error)
  }
}
