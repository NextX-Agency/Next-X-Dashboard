import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'
import type {
  WalletsPageDataPayload,
  WalletsPageLocation,
  WalletsPageTransaction,
  WalletsPageWallet,
} from '@/types/wallets'
import { DEFAULT_WALLET_PURPOSE, WALLET_PURPOSE_LABELS, isWalletPurpose, type WalletPurpose } from '@/types/walletPurpose'

type WalletType = 'cash' | 'bank'
type WalletCurrency = 'SRD' | 'USD'

class ApiError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const walletSelect = {
  id: true,
  personName: true,
  type: true,
  currency: true,
  balance: true,
  purpose: true,
  createdAt: true,
  updatedAt: true,
  location_id: true,
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
} satisfies Prisma.WalletSelect

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function normalizeWalletType(value: unknown): WalletType {
  if (value === 'cash' || value === 'bank') return value
  throw new ApiError('Wallet type must be cash or bank.')
}

function normalizeCurrency(value: unknown): WalletCurrency {
  if (value === 'SRD' || value === 'USD') return value
  throw new ApiError('Currency must be SRD or USD.')
}

function normalizePurpose(value: unknown): WalletPurpose {
  if (value == null || value === '') return DEFAULT_WALLET_PURPOSE
  if (isWalletPurpose(value)) return value
  throw new ApiError('Purpose must be operational, savings, or reserve.')
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new ApiError(`${field} is required.`)
}

function parseAmount(value: unknown, field: string): number {
  const amount = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'))
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(`${field} must be a positive amount or zero.`)
  }
  return Math.round(amount * 100) / 100
}

function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError
}

function walletMutationError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return jsonError(error.message, error.status)

  if (isPrismaKnownError(error)) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : String(error.meta?.target ?? '')
      if (target.includes('person_name') && !target.includes('purpose')) {
        return jsonError('The database still has the old wallet uniqueness rule. Apply the wallet purpose migration, then try again.', 409)
      }
      return jsonError('A wallet with this location, type, currency, and purpose already exists.', 409)
    }

    if (error.code === 'P2022') {
      return jsonError('The wallet database schema is not up to date. Apply the wallet purpose migration before saving wallets.', 500)
    }

    if (error.code === 'P2003') {
      return jsonError('This wallet is still linked to financial records and cannot be changed that way.', 409)
    }
  }

  console.error(fallback, error)
  return jsonError(fallback, 500)
}

function walletName(locationName: string, purpose: WalletPurpose, type: string, currency: string) {
  return `${locationName} - ${WALLET_PURPOSE_LABELS[purpose]} ${type} ${currency}`
}

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNullableIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function mapLocation(location: {
  id: string
  name: string
  address: string | null
  createdAt: Date
  updatedAt: Date
  seller_name: string | null
  seller_phone: string | null
  commission_rate: unknown
  is_active: boolean | null
}): WalletsPageLocation {
  return {
    id: location.id,
    name: location.name,
    address: location.address,
    created_at: toIsoString(location.createdAt),
    updated_at: toIsoString(location.updatedAt),
    seller_name: location.seller_name,
    seller_phone: location.seller_phone,
    commission_rate: toNumber(location.commission_rate),
    is_active: location.is_active,
  }
}

function mapWallet(wallet: {
  id: string
  personName: string
  type: string
  currency: string
  balance: unknown
  purpose: string
  createdAt: Date
  updatedAt: Date
  location_id: string | null
  locations: {
    id: string
    name: string
    address: string | null
    createdAt: Date
    updatedAt: Date
    seller_name: string | null
    seller_phone: string | null
    commission_rate: unknown
    is_active: boolean | null
  } | null
}): WalletsPageWallet {
  return {
    id: wallet.id,
    person_name: wallet.personName,
    type: wallet.type,
    currency: wallet.currency,
    balance: toNumber(wallet.balance),
    created_at: toIsoString(wallet.createdAt),
    updated_at: toIsoString(wallet.updatedAt),
    location_id: wallet.location_id,
    purpose: isWalletPurpose(wallet.purpose) ? wallet.purpose : DEFAULT_WALLET_PURPOSE,
    locations: wallet.locations ? mapLocation(wallet.locations) : null,
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [wallets, locations, transactions] = await Promise.all([
      prisma.wallet.findMany({
        select: walletSelect,
        orderBy: { createdAt: 'asc' },
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
      prisma.wallet_transactions.findMany({
        take: 50,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          wallet_id: true,
          type: true,
          amount: true,
          balance_before: true,
          balance_after: true,
          description: true,
          created_at: true,
          currency: true,
          reference_type: true,
          reference_id: true,
          wallets: {
            select: walletSelect,
          },
        },
      }),
    ])

    const data: WalletsPageDataPayload = {
      wallets: wallets.map(mapWallet),
      locations: locations.map(mapLocation),
      transactions: transactions.map<WalletsPageTransaction>((transaction) => ({
        id: transaction.id,
        wallet_id: transaction.wallet_id,
        type: transaction.type,
        amount: toNumber(transaction.amount),
        balance_before: toNumber(transaction.balance_before),
        balance_after: toNumber(transaction.balance_after),
        description: transaction.description,
        created_at: toNullableIsoString(transaction.created_at),
        currency: transaction.currency,
        reference_type: transaction.reference_type,
        reference_id: transaction.reference_id,
        wallets: transaction.wallets ? mapWallet(transaction.wallets) : null,
      })),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Wallets route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json() as Record<string, unknown>
    const locationId = parseUuid(body.location_id, 'location_id')
    const type = normalizeWalletType(body.type)
    const currency = normalizeCurrency(body.currency)
    const purpose = normalizePurpose(body.purpose)
    const balance = parseAmount(body.balance, 'Initial balance')

    const wallet = await prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({
        where: { id: locationId },
        select: { id: true, name: true },
      })

      if (!location) throw new ApiError('Location not found.', 404)

      const existing = await tx.wallet.findFirst({
        where: {
          location_id: locationId,
          type,
          currency,
          purpose,
        },
        select: { id: true },
      })

      if (existing) {
        throw new ApiError('A wallet with this location, type, currency, and purpose already exists.', 409)
      }

      const created = await tx.wallet.create({
        data: {
          location_id: locationId,
          personName: location.name,
          type,
          currency,
          purpose,
          balance,
        },
        select: walletSelect,
      })

      if (balance > 0) {
        await tx.wallet_transactions.create({
          data: {
            wallet_id: created.id,
            type: 'adjustment',
            amount: balance,
            balance_before: 0,
            balance_after: balance,
            description: 'Opening balance',
            reference_type: 'opening_balance',
            currency,
          },
        })
      }

      await writeActivityLog({
        action: 'create',
        entityType: 'wallet',
        entityId: created.id,
        entityName: walletName(location.name, purpose, type, currency),
        details: `Created ${WALLET_PURPOSE_LABELS[purpose]} ${type} ${currency} wallet for ${location.name} with opening balance ${balance.toFixed(2)} ${currency}`,
        user: authResult,
        request,
        source: 'server',
        client: tx,
      })

      return created
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    return NextResponse.json({ data: mapWallet(wallet) }, { status: 201 })
  } catch (error) {
    return walletMutationError(error, 'Failed to save wallet.')
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json() as Record<string, unknown>
    const walletId = parseUuid(body.id, 'id')
    const locationId = parseUuid(body.location_id, 'location_id')
    const type = normalizeWalletType(body.type)
    const currency = normalizeCurrency(body.currency)
    const purpose = normalizePurpose(body.purpose)
    const balance = parseAmount(body.balance, 'Balance')

    const wallet = await prisma.$transaction(async (tx) => {
      const current = await tx.wallet.findUnique({
        where: { id: walletId },
        select: walletSelect,
      })

      if (!current) throw new ApiError('Wallet not found.', 404)

      const location = await tx.location.findUnique({
        where: { id: locationId },
        select: { id: true, name: true },
      })

      if (!location) throw new ApiError('Location not found.', 404)

      const currentPurpose = normalizePurpose(current.purpose)
      const identityChanged = current.location_id !== locationId ||
        current.type !== type ||
        current.currency !== currency ||
        currentPurpose !== purpose

      if (identityChanged) {
        const [transactionCount, salesCount, expenseCount, orderCount] = await Promise.all([
          tx.wallet_transactions.count({ where: { wallet_id: walletId } }),
          tx.sale.count({ where: { wallet_id: walletId } }),
          tx.expense.count({ where: { walletId } }),
          tx.purchaseOrder.count({ where: { walletId } }),
        ])

        if (transactionCount + salesCount + expenseCount + orderCount > 0) {
          throw new ApiError('This wallet already has financial activity. Keep its identity stable and use a transfer or balance correction instead.', 409)
        }
      }

      const existing = await tx.wallet.findFirst({
        where: {
          id: { not: walletId },
          location_id: locationId,
          type,
          currency,
          purpose,
        },
        select: { id: true },
      })

      if (existing) {
        throw new ApiError('A wallet with this location, type, currency, and purpose already exists.', 409)
      }

      const previousBalance = toNumber(current.balance)
      const updated = await tx.wallet.update({
        where: { id: walletId },
        data: {
          location_id: locationId,
          personName: location.name,
          type,
          currency,
          purpose,
          balance,
        },
        select: walletSelect,
      })

      const difference = Math.round((balance - previousBalance) * 100) / 100
      if (difference !== 0) {
        await tx.wallet_transactions.create({
          data: {
            wallet_id: walletId,
            type: 'adjustment',
            amount: Math.abs(difference),
            balance_before: previousBalance,
            balance_after: balance,
            description: `Balance correction to ${balance.toFixed(2)} ${currency}`,
            reference_type: 'wallet_edit',
            currency,
          },
        })
      }

      await writeActivityLog({
        action: 'update',
        entityType: 'wallet',
        entityId: walletId,
        entityName: walletName(location.name, purpose, type, currency),
        details: difference === 0
          ? `Updated wallet details for ${location.name}`
          : `Corrected balance from ${previousBalance.toFixed(2)} ${current.currency} to ${balance.toFixed(2)} ${currency}`,
        user: authResult,
        request,
        source: 'server',
        client: tx,
      })

      return updated
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    return NextResponse.json({ data: mapWallet(wallet) })
  } catch (error) {
    return walletMutationError(error, 'Failed to save wallet.')
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const walletId = parseUuid(request.nextUrl.searchParams.get('id'), 'id')

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { id: walletId },
        select: walletSelect,
      })

      if (!wallet) throw new ApiError('Wallet not found.', 404)

      const balance = toNumber(wallet.balance)
      if (Math.abs(balance) >= 0.01) {
        throw new ApiError('Only zero-balance wallets can be deleted. Transfer or correct the balance first.', 409)
      }

      const [transactionCount, salesCount, expenseCount, orderCount] = await Promise.all([
        tx.wallet_transactions.count({ where: { wallet_id: walletId } }),
        tx.sale.count({ where: { wallet_id: walletId } }),
        tx.expense.count({ where: { walletId } }),
        tx.purchaseOrder.count({ where: { walletId } }),
      ])

      if (transactionCount + salesCount + expenseCount + orderCount > 0) {
        throw new ApiError('This wallet has financial history and cannot be deleted. Keeping the ledger intact protects reports.', 409)
      }

      await tx.wallet.delete({ where: { id: walletId } })

      await writeActivityLog({
        action: 'delete',
        entityType: 'wallet',
        entityId: walletId,
        entityName: walletName(wallet.locations?.name || wallet.personName, normalizePurpose(wallet.purpose), wallet.type, wallet.currency),
        details: 'Deleted empty wallet with no financial history',
        user: authResult,
        request,
        source: 'server',
        client: tx,
      })
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    return NextResponse.json({ data: { id: walletId } })
  } catch (error) {
    return walletMutationError(error, 'Failed to delete wallet.')
  }
}
