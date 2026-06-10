import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

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
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError('Transfer amount must be greater than zero.')
  }
  return Math.round(amount * 100) / 100
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function handleError(error: unknown) {
  if (error instanceof ApiError) return jsonError(error.message, error.status)

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
    return jsonError('The wallet database schema is not up to date. Apply the wallet purpose migration before transferring money.', 500)
  }

  console.error('Wallet transfer route error:', error)
  return jsonError('Failed to transfer money between wallets.', 500)
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json() as Record<string, unknown>
    const fromWalletId = parseUuid(body.fromWalletId ?? body.from_wallet_id, 'fromWalletId')
    const toWalletId = parseUuid(body.toWalletId ?? body.to_wallet_id, 'toWalletId')
    const amount = parseAmount(body.amount)
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (fromWalletId === toWalletId) {
      throw new ApiError('Choose two different wallets for a transfer.')
    }

    const result = await prisma.$transaction(async (tx) => {
      const [fromWallet, toWallet] = await Promise.all([
        tx.wallet.findUnique({
          where: { id: fromWalletId },
          select: {
            id: true,
            personName: true,
            type: true,
            currency: true,
            balance: true,
            locations: { select: { name: true } },
          },
        }),
        tx.wallet.findUnique({
          where: { id: toWalletId },
          select: {
            id: true,
            personName: true,
            type: true,
            currency: true,
            balance: true,
            locations: { select: { name: true } },
          },
        }),
      ])

      if (!fromWallet || !toWallet) throw new ApiError('Invalid wallet selection.', 404)
      if (fromWallet.currency !== toWallet.currency) {
        throw new ApiError('Transfers are only allowed between wallets with the same currency.')
      }

      const fromPreviousBalance = toNumber(fromWallet.balance)
      const toPreviousBalance = toNumber(toWallet.balance)
      const fromNextBalance = Math.round((fromPreviousBalance - amount) * 100) / 100
      const toNextBalance = Math.round((toPreviousBalance + amount) * 100) / 100

      if (fromNextBalance < 0) {
        throw new ApiError('Insufficient balance in the source wallet.', 409)
      }

      const [updatedFromWallet, updatedToWallet] = await Promise.all([
        tx.wallet.update({
          where: { id: fromWalletId },
          data: { balance: fromNextBalance },
          select: { id: true, balance: true, currency: true },
        }),
        tx.wallet.update({
          where: { id: toWalletId },
          data: { balance: toNextBalance },
          select: { id: true, balance: true, currency: true },
        }),
      ])

      const fromName = fromWallet.locations?.name || fromWallet.personName
      const toName = toWallet.locations?.name || toWallet.personName

      const [debitTransaction, creditTransaction] = await Promise.all([
        tx.wallet_transactions.create({
          data: {
            wallet_id: fromWalletId,
            type: 'debit',
            amount,
            balance_before: fromPreviousBalance,
            balance_after: fromNextBalance,
            description: description || `Transfer to ${toName} - ${toWallet.type} ${toWallet.currency}`,
            reference_type: 'transfer',
            reference_id: toWalletId,
            currency: fromWallet.currency,
          },
        }),
        tx.wallet_transactions.create({
          data: {
            wallet_id: toWalletId,
            type: 'credit',
            amount,
            balance_before: toPreviousBalance,
            balance_after: toNextBalance,
            description: description || `Transfer from ${fromName} - ${fromWallet.type} ${fromWallet.currency}`,
            reference_type: 'transfer',
            reference_id: fromWalletId,
            currency: toWallet.currency,
          },
        }),
      ])

      await tx.activityLog.create({
        data: {
          action: 'transfer',
          entityType: 'wallet',
          entityId: fromWalletId,
          entityName: `${fromName} -> ${toName}`,
          details: `Transferred ${amount.toFixed(2)} ${fromWallet.currency} from ${fromName} (${fromWallet.type}) to ${toName} (${toWallet.type})`,
          userId: authResult.id,
        },
      })

      return {
        fromWallet: updatedFromWallet,
        toWallet: updatedToWallet,
        debitTransaction,
        creditTransaction,
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    return handleError(error)
  }
}
