import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  CommissionsPageCategory,
  CommissionsPageCommission,
  CommissionsPageDataPayload,
  CommissionsPageLocation,
  CommissionsPageSale,
  CommissionsPageSeller,
  CommissionsPageSellerCategoryRate,
  CommissionsPageWallet,
} from '@/types/commissions'

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
}): CommissionsPageLocation => ({
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

const mapCategory = (category: {
  id: string
  name: string
  createdAt: Date
}): CommissionsPageCategory => ({
  id: category.id,
  name: category.name,
  created_at: toIsoString(category.createdAt),
})

const mapSale = (sale: {
  id: string
  locationId: string
  sellerId: string | null
  currency: string
  exchangeRate: unknown
  totalAmount: unknown
  paymentMethod: string | null
  notes: string | null
  createdAt: Date
  wallet_id: string | null
}): CommissionsPageSale => ({
  id: sale.id,
  location_id: sale.locationId,
  seller_id: sale.sellerId,
  currency: sale.currency,
  exchange_rate: toNumber(sale.exchangeRate),
  total_amount: toNumber(sale.totalAmount),
  payment_method: sale.paymentMethod,
  notes: sale.notes,
  created_at: toIsoString(sale.createdAt),
  wallet_id: sale.wallet_id,
})

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [commissions, locations, wallets, categories, sellers, sellerCategoryRates] = await Promise.all([
      prisma.commission.findMany({
        select: {
          id: true,
          sellerId: true,
          saleId: true,
          commissionAmount: true,
          paid: true,
          createdAt: true,
          location_id: true,
          category_id: true,
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
          sale: {
            select: {
              id: true,
              locationId: true,
              sellerId: true,
              currency: true,
              exchangeRate: true,
              totalAmount: true,
              paymentMethod: true,
              notes: true,
              createdAt: true,
              wallet_id: true,
            },
          },
          categories: {
            select: {
              id: true,
              name: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
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
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.seller.findMany({
        select: {
          id: true,
          name: true,
          commissionRate: true,
          createdAt: true,
          updatedAt: true,
          location_id: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.seller_category_rates.findMany({
        select: {
          id: true,
          seller_id: true,
          category_id: true,
          commission_rate: true,
          created_at: true,
        },
      }),
    ])

    const data: CommissionsPageDataPayload = {
      commissions: commissions.map<CommissionsPageCommission>((commission) => ({
        id: commission.id,
        seller_id: commission.sellerId,
        sale_id: commission.saleId,
        commission_amount: toNumber(commission.commissionAmount),
        paid: commission.paid,
        created_at: toIsoString(commission.createdAt),
        location_id: commission.location_id,
        category_id: commission.category_id,
        locations: commission.locations ? mapLocation(commission.locations) : null,
        sales: commission.sale ? mapSale(commission.sale) : null,
        categories: commission.categories ? mapCategory(commission.categories) : null,
      })),
      locations: locations.map(mapLocation),
      wallets: wallets.map<CommissionsPageWallet>((wallet) => ({
        id: wallet.id,
        person_name: wallet.personName,
        type: wallet.type,
        currency: wallet.currency,
        balance: toNumber(wallet.balance),
        created_at: toIsoString(wallet.createdAt),
        updated_at: toIsoString(wallet.updatedAt),
        location_id: wallet.location_id,
      })),
      categories: categories.map(mapCategory),
      sellers: sellers.map<CommissionsPageSeller>((seller) => ({
        id: seller.id,
        name: seller.name,
        commission_rate: toNumber(seller.commissionRate),
        created_at: toIsoString(seller.createdAt),
        updated_at: toIsoString(seller.updatedAt),
        location_id: seller.location_id,
      })),
      sellerCategoryRates: sellerCategoryRates.map<CommissionsPageSellerCategoryRate>((rate) => ({
        id: rate.id,
        seller_id: rate.seller_id,
        category_id: rate.category_id,
        commission_rate: toNumber(rate.commission_rate),
        created_at: rate.created_at?.toISOString() ?? null,
      })),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Commissions route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}