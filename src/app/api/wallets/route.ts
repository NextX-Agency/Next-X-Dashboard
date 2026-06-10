import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  WalletsPageDataPayload,
  WalletsPageLocation,
  WalletsPageTransaction,
  WalletsPageWallet,
} from '@/types/wallets'
import { DEFAULT_WALLET_PURPOSE, isWalletPurpose } from '@/types/walletPurpose'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNullableIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [wallets, locations, transactions] = await Promise.all([
      prisma.wallet.findMany({
        select: {
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
        },
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
            select: {
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
            },
          },
        },
      }),
    ])

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
    }): WalletsPageLocation => ({
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
    }): WalletsPageWallet => ({
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
    })

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
