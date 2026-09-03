import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { postSale } from '@/lib/salePosting'
import {
  parseCurrency,
  parsePositiveAmount,
  parseQuantity,
  SaleValidationError,
  type SaleComboInput,
  type SaleLineInput,
} from '@/lib/saleCreation'
import { getLocationCatalogFilter } from '@/lib/locationCatalog'
import type {
  SalesPageDataPayload,
  SalesPageExchangeRate,
  SalesPageItem,
  SalesPageLocation,
  SalesPageRecentSale,
  SalesPageSaleItem,
  SalesPageStats,
} from '@/types/sales'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNullableIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function mapItem(item: {
  id: string
  name: string
  brand: string | null
  catalogType: string
  categoryId: string | null
  purchasePriceUsd: unknown
  sellingPriceSrd: unknown | null
  sellingPriceUsd: unknown | null
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
  description: string | null
  isPublic: boolean | null
  is_combo: boolean | null
  allow_custom_price: boolean | null
  deletedAt: Date | null
}): SalesPageItem {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    catalog_type: item.catalogType,
    category_id: item.categoryId,
    purchase_price_usd: toNumber(item.purchasePriceUsd),
    selling_price_srd: item.sellingPriceSrd === null ? null : toNumber(item.sellingPriceSrd),
    selling_price_usd: item.sellingPriceUsd === null ? null : toNumber(item.sellingPriceUsd),
    image_url: item.imageUrl,
    created_at: toIsoString(item.createdAt),
    updated_at: toIsoString(item.updatedAt),
    description: item.description,
    is_public: item.isPublic,
    is_combo: item.is_combo,
    allow_custom_price: item.allow_custom_price,
    deleted_at: toNullableIsoString(item.deletedAt),
  }
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
  catalogType?: string | null
}): SalesPageLocation {
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
    catalog_type: location.catalogType ?? 'all',
  }
}

function mapExchangeRate(rate: {
  id: string
  usdToSrd: unknown
  setAt: Date
  isActive: boolean
}): SalesPageExchangeRate {
  return {
    id: rate.id,
    usd_to_srd: toNumber(rate.usdToSrd),
    set_at: toIsoString(rate.setAt),
    is_active: rate.isActive,
  }
}

function mapSaleItem(saleItem: {
  id: string
  saleId: string
  itemId: string
  quantity: number
  unitPrice: unknown
  subtotal: unknown
  createdAt: Date
  is_custom_price: boolean | null
  original_price: unknown | null
  discount_reason: string | null
  item: {
    id: string
    name: string
    brand: string | null
    catalogType: string
    categoryId: string | null
    purchasePriceUsd: unknown
    sellingPriceSrd: unknown | null
    sellingPriceUsd: unknown | null
    imageUrl: string | null
    createdAt: Date
    updatedAt: Date
    description: string | null
    isPublic: boolean | null
    is_combo: boolean | null
    allow_custom_price: boolean | null
    deletedAt: Date | null
  }
}): SalesPageSaleItem {
  return {
    id: saleItem.id,
    sale_id: saleItem.saleId,
    item_id: saleItem.itemId,
    quantity: saleItem.quantity,
    unit_price: toNumber(saleItem.unitPrice),
    subtotal: toNumber(saleItem.subtotal),
    created_at: toIsoString(saleItem.createdAt),
    is_custom_price: saleItem.is_custom_price,
    original_price: saleItem.original_price === null ? null : toNumber(saleItem.original_price),
    discount_reason: saleItem.discount_reason,
    items: mapItem(saleItem.item),
  }
}

function mapRecentSale(sale: {
  id: string
  locationId: string
  sellerId: string | null
  currency: string
  exchangeRate: unknown | null
  totalAmount: unknown
  paymentMethod: string | null
  notes: string | null
  createdAt: Date
  wallet_id: string | null
  location: {
    id: string
    name: string
    address: string | null
    createdAt: Date
    updatedAt: Date
    seller_name: string | null
    seller_phone: string | null
    commission_rate: unknown
    is_active: boolean | null
    catalogType?: string | null
  }
  saleItems: Array<{
    id: string
    saleId: string
    itemId: string
    quantity: number
    unitPrice: unknown
    subtotal: unknown
    createdAt: Date
    is_custom_price: boolean | null
    original_price: unknown | null
    discount_reason: string | null
    item: {
      id: string
      name: string
      brand: string | null
      catalogType: string
      categoryId: string | null
      purchasePriceUsd: unknown
      sellingPriceSrd: unknown | null
      sellingPriceUsd: unknown | null
      imageUrl: string | null
      createdAt: Date
      updatedAt: Date
      description: string | null
      isPublic: boolean | null
      is_combo: boolean | null
      allow_custom_price: boolean | null
      deletedAt: Date | null
    }
  }>
}): SalesPageRecentSale {
  return {
    id: sale.id,
    location_id: sale.locationId,
    seller_id: sale.sellerId,
    currency: sale.currency,
    exchange_rate: sale.exchangeRate === null ? null : toNumber(sale.exchangeRate),
    total_amount: sale.saleItems.reduce((sum, saleItem) => sum + toNumber(saleItem.subtotal), 0),
    payment_method: sale.paymentMethod,
    notes: sale.notes,
    created_at: toIsoString(sale.createdAt),
    wallet_id: sale.wallet_id,
    locations: mapLocation(sale.location),
    sale_items: sale.saleItems.map(mapSaleItem),
  }
}

function buildSalesStats(
  saleItems: Array<{
    saleId: string
    createdAt: Date
    subtotal: unknown
    sale: {
      currency: string
      exchangeRate: unknown | null
    }
  }>,
  fallbackUsdToSrdRate: number | null,
  todayStart: Date,
): SalesPageStats {
  let todaySales = 0
  let weekSales = 0
  const todaySaleIds = new Set<string>()
  const weekSaleIds = new Set<string>()

  saleItems.forEach((saleItem) => {
    let convertedAmount = toNumber(saleItem.subtotal)
    const exchangeRate = saleItem.sale.exchangeRate === null
      ? fallbackUsdToSrdRate
      : toNumber(saleItem.sale.exchangeRate)

    if (saleItem.sale.currency === 'USD' && exchangeRate) {
      convertedAmount *= exchangeRate
    }

    weekSales += convertedAmount
    weekSaleIds.add(saleItem.saleId)

    if (saleItem.createdAt >= todayStart) {
      todaySales += convertedAmount
      todaySaleIds.add(saleItem.saleId)
    }
  })

  return {
    todaySales,
    todayOrders: todaySaleIds.size,
    weekSales,
    weekOrders: weekSaleIds.size,
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const catalogType = request.nextUrl.searchParams.get('catalogType') === 'watches' ? 'watches' : 'audio'
    const locationCatalogFilter = getLocationCatalogFilter(catalogType)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)

    const [items, locations, currentRate, recentSales, weekSaleItems] = await prisma.$transaction([
      prisma.item.findMany({
        where: { deletedAt: null, catalogType },
        orderBy: { name: 'asc' },
      }),
      prisma.location.findMany({
        where: { is_active: true, catalogType: { in: locationCatalogFilter } },
        orderBy: { name: 'asc' },
      }),
      prisma.exchangeRate.findFirst({
        where: { isActive: true },
        orderBy: { setAt: 'desc' },
      }),
      prisma.sale.findMany({
        take: 10,
        where: {
          saleItems: {
            some: {
              item: {
                is: { catalogType },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          location: true,
          saleItems: {
            where: {
              item: {
                is: { catalogType },
              },
            },
            orderBy: { createdAt: 'asc' },
            include: {
              item: true,
            },
          },
        },
      }),
      prisma.saleItem.findMany({
        where: {
          createdAt: {
            gte: weekStart,
          },
          item: {
            is: { catalogType },
          },
        },
        select: {
          saleId: true,
          createdAt: true,
          subtotal: true,
          sale: {
            select: {
              currency: true,
              exchangeRate: true,
            },
          },
        },
      }),
    ])

    const data: SalesPageDataPayload = {
      items: items.map(mapItem),
      locations: locations.map(mapLocation),
      currentRate: currentRate ? mapExchangeRate(currentRate) : null,
      recentSales: recentSales.map(mapRecentSale),
      salesStats: buildSalesStats(
        weekSaleItems,
        currentRate ? toNumber(currentRate.usdToSrd) : null,
        todayStart,
      ),
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Sales route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Create a sale.
 *
 * Replaces the client-side write path that lived in `src/app/sales/page.tsx`.
 * Header, line items, stock, commissions, the wallet credit, the wallet
 * transaction, the ledger entry and the activity log are one Serializable
 * transaction — all of it, or none (F-02, F-03, R7).
 */
export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const locationId = typeof body.locationId === 'string' ? body.locationId : ''
    const currency = parseCurrency(body.currency)
    const paymentMethod = body.paymentMethod === 'bank' ? 'bank' : 'cash'
    const requestedSellerId = typeof body.sellerId === 'string' && body.sellerId ? body.sellerId : null
    if (!locationId) {
      return NextResponse.json({ error: 'Choose a location for this sale.' }, { status: 400 })
    }

    const rawItems = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : []
    const rawCombos = Array.isArray(body.combos) ? body.combos as Array<Record<string, unknown>> : []

    const items: SaleLineInput[] = rawItems.map((line) => {
      const itemId = typeof line.itemId === 'string' ? line.itemId : ''
      if (!itemId) throw new SaleValidationError('Every sale line needs a product.')
      return {
        itemId,
        quantity: parseQuantity(line.quantity, 'sale quantity'),
        customPrice: line.customPrice === null || line.customPrice === undefined ? null : Number(line.customPrice),
        discountReason: typeof line.discountReason === 'string' ? line.discountReason : null,
      }
    })

    const combos: SaleComboInput[] = rawCombos.map((combo) => {
      const members = Array.isArray(combo.items) ? combo.items as Array<Record<string, unknown>> : []
      if (members.length === 0) throw new SaleValidationError('A combo needs at least one product.')
      return {
        name: typeof combo.name === 'string' && combo.name.trim() ? combo.name.trim() : 'Combo',
        comboPrice: parsePositiveAmount(combo.comboPrice, 'Combo price'),
        items: members.map((member) => {
          const itemId = typeof member.itemId === 'string' ? member.itemId : ''
          if (!itemId) throw new SaleValidationError('Every combo line needs a product.')
          return { itemId, quantity: parseQuantity(member.quantity, 'combo quantity') }
        }),
      }
    })

    if (items.length === 0 && combos.length === 0) {
      return NextResponse.json({ error: 'Add at least one product to the sale.' }, { status: 400 })
    }

    const result = await runSerializableTransaction(async (tx) =>
      postSale(
        tx,
        { locationId, currency, paymentMethod, sellerId: requestedSellerId, items, combos },
        user,
        request,
      ),
    )

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof SaleValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Sale creation error:', error)
    return NextResponse.json({ error: 'Unable to record the sale. Nothing was saved.' }, { status: 500 })
  }
}
