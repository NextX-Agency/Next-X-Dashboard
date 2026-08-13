import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { prisma } from '@/lib/prisma'
import { roundCurrencyAmount } from '@/lib/pricing'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'
import {
  buildCommissions,
  parseCurrency,
  parsePositiveAmount,
  parseQuantity,
  resolveExchangeRate,
  resolveSaleLines,
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

    const result = await runSerializableTransaction(async (tx) => {
      // Claim the ledger write before anything touches wallet_transactions, so
      // the capture trigger defers to the richer entry written below.
      await markFinanceLedgerRecorded(tx)

      const [location, activeRate] = await Promise.all([
        tx.location.findFirst({
          where: { id: locationId, is_active: true },
          select: { id: true, name: true, commission_rate: true },
        }),
        tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } }),
      ])
      if (!location) throw new SaleValidationError('That location is not available for sales.')

      const exchangeRate = resolveExchangeRate(activeRate?.usdToSrd)

      const wallet = await tx.wallet.findFirst({
        where: { location_id: locationId, currency, type: paymentMethod, purpose: 'operational' },
        select: { id: true, personName: true, currency: true, type: true },
      })
      if (!wallet) {
        throw new SaleValidationError(
          `No operational ${currency} ${paymentMethod} wallet exists for ${location.name}. Create one before selling.`,
        )
      }

      const { lines, stockByItemId } = await resolveSaleLines(
        tx,
        { locationId, currency, paymentMethod, items, combos },
        exchangeRate,
      )
      const totalAmount = roundCurrencyAmount(lines.reduce((sum, line) => sum + line.subtotal, 0))
      if (totalAmount <= 0) throw new SaleValidationError('A sale must come to more than zero.')

      // The seller must belong to this location — a commission cannot be
      // credited to someone who does not work there.
      const seller = requestedSellerId
        ? await tx.seller.findFirst({
            where: { id: requestedSellerId, location_id: locationId },
            select: { id: true, name: true, commissionRate: true },
          })
        : await tx.seller.findFirst({
            where: { location_id: locationId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, commissionRate: true },
          })
      if (requestedSellerId && !seller) {
        throw new SaleValidationError('That seller does not belong to the selected location.')
      }

      const sale = await tx.sale.create({
        data: {
          locationId,
          sellerId: seller?.id ?? null,
          currency,
          exchangeRate: currency === 'USD' ? exchangeRate : null,
          totalAmount,
          paymentMethod,
          wallet_id: wallet.id,
          saleItems: {
            create: lines.map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
              is_custom_price: line.isCustomPrice,
              original_price: line.originalPrice,
              discount_reason: line.discountReason,
            })),
          },
        },
        select: { id: true, createdAt: true },
      })

      // Atomic decrements. The old client read a quantity and wrote back
      // `quantity - n`, which loses a concurrent sale's decrement (R6).
      const demandByItemId = new Map<string, number>()
      for (const line of lines) {
        demandByItemId.set(line.itemId, (demandByItemId.get(line.itemId) ?? 0) + line.quantity)
      }
      for (const [itemId, demand] of demandByItemId) {
        const stock = stockByItemId.get(itemId)!
        await tx.stock.update({ where: { id: stock.id }, data: { quantity: { decrement: demand } } })
      }

      let commissionTotal = 0
      if (seller) {
        const categoryRateRows = await tx.seller_category_rates.findMany({
          where: { seller_id: seller.id },
          select: { category_id: true, commission_rate: true },
        })
        const categoryRates = new Map(categoryRateRows.map((row) => [row.category_id, Number(row.commission_rate)]))
        const drafts = buildCommissions(
          lines,
          categoryRates,
          Number(seller.commissionRate ?? 0),
          Number(location.commission_rate ?? 0),
        )

        for (const draft of drafts) {
          await tx.commission.create({
            data: {
              sellerId: seller.id,
              saleId: sale.id,
              location_id: locationId,
              category_id: draft.categoryId,
              commissionAmount: draft.amount,
              // The client never populated this, leaving every historical
              // commission unable to explain its own arithmetic.
              commission_rate: draft.rate,
              paid: false,
            },
          })
          commissionTotal = roundCurrencyAmount(commissionTotal + draft.amount)
        }
      }

      // Atomic increment, then read the committed balance back so the wallet
      // transaction records what actually happened rather than what the browser
      // believed the balance was at page load (F-03, R5, R6).
      const creditedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: totalAmount } },
        select: { balance: true },
      })
      const balanceAfter = roundCurrencyAmount(Number(creditedWallet.balance))
      const balanceBefore = roundCurrencyAmount(balanceAfter - totalAmount)

      const walletTransaction = await tx.wallet_transactions.create({
        data: {
          wallet_id: wallet.id,
          sale_id: sale.id,
          type: 'credit',
          amount: totalAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          currency,
          description: `Sale ${sale.id}`,
          reference_type: 'sale',
          reference_id: sale.id,
        },
      })

      await recordFinanceLedgerEntry(tx, {
        walletTransactionId: walletTransaction.id,
        walletId: wallet.id,
        locationId,
        sellerId: seller?.id ?? null,
        actorUserId: user.id,
        eventType: 'sale',
        direction: 'in',
        amount: totalAmount,
        currency,
        sourceType: 'sale',
        sourceId: sale.id,
        description: `Sale of ${lines.length} line${lines.length === 1 ? '' : 's'} at ${location.name}`,
        occurredAt: sale.createdAt,
        metadata: {
          paymentMethod,
          lineCount: lines.length,
          comboCount: combos.length,
          commissionTotal,
          exchangeRate: currency === 'USD' ? exchangeRate : null,
        },
      })

      await writeActivityLog({
        action: 'create',
        entityType: 'sale',
        entityId: sale.id,
        entityName: `Sale ${sale.id.slice(0, 8)}`,
        details: `Recorded ${totalAmount.toFixed(2)} ${currency} at ${location.name} into ${wallet.personName}`
          + `${seller ? ` · seller ${seller.name}` : ''}`
          + `${commissionTotal > 0 ? ` · commission ${commissionTotal.toFixed(2)}` : ''}`,
        user,
        request,
        source: 'sales-api',
        client: tx,
      })

      return {
        saleId: sale.id,
        createdAt: sale.createdAt.toISOString(),
        locationName: location.name,
        currency,
        paymentMethod,
        totalAmount,
        commissionTotal,
        walletName: wallet.personName,
        balanceAfter,
        sellerName: seller?.name ?? null,
        items: lines.map((line) => ({
          name: line.itemName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          originalPrice: line.originalPrice,
          discountReason: line.discountReason,
          comboKey: line.comboKey,
        })),
      }
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof SaleValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Sale creation error:', error)
    return NextResponse.json({ error: 'Unable to record the sale. Nothing was saved.' }, { status: 500 })
  }
}
