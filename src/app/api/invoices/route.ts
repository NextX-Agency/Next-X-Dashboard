import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  InvoicesPageDataPayload,
  InvoicesPageInvoice,
  InvoicesPageLocation,
  InvoicesPageReservationGroup,
  InvoicesPageSaleInvoice,
  InvoicesPageStats,
} from '@/types/invoices'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function getPriceInSrd(
  item: { sellingPriceSrd: unknown | null; sellingPriceUsd?: unknown | null },
  exchangeRate: number | null,
): number {
  const srdPrice = toNumber(item.sellingPriceSrd)
  if (srdPrice > 0) return srdPrice

  const usdPrice = toNumber(item.sellingPriceUsd)
  if (usdPrice <= 0 || !exchangeRate || exchangeRate <= 0) return 0

  return Math.round((usdPrice * exchangeRate + Number.EPSILON) * 100) / 100
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
}): InvoicesPageLocation {
  return {
    id: location.id,
    name: location.name,
    address: location.address,
    seller_name: location.seller_name,
    seller_phone: location.seller_phone,
    commission_rate: toNumber(location.commission_rate),
    is_active: location.is_active ?? true,
    created_at: toIsoString(location.createdAt),
    updated_at: toIsoString(location.updatedAt),
  }
}

function generateSaleInvoiceNumber(sale: { id: string; createdAt: Date }): string {
  const date = sale.createdAt
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const shortId = sale.id.slice(-6)
  return `INV-${year}${month}${day}-${shortId}`
}

function buildReservationInvoices(reservations: Array<{
  id: string
  clientId: string
  itemId: string
  locationId: string
  quantity: number
  status: string
  createdAt: Date
  combo_id: string | null
  combo_price: unknown | null
  client: { id: string; name: string }
  item: { id: string; name: string; sellingPriceSrd: unknown | null; sellingPriceUsd: unknown | null }
  location: { id: string; name: string }
}>, exchangeRate: number | null): InvoicesPageReservationGroup[] {
  const groupedMap = new Map<string, InvoicesPageReservationGroup>()
  const comboTracker = new Map<string, Set<string>>()
  const comboPrices = new Map<string, number>()

  reservations.forEach((reservation) => {
    if (reservation.combo_id && reservation.combo_price !== null && reservation.combo_price !== undefined) {
      comboPrices.set(reservation.combo_id, toNumber(reservation.combo_price))
    }
  })

  reservations.forEach((reservation) => {
    const timestamp = reservation.createdAt.getTime()
    const roundedTime = Math.floor(timestamp / (5 * 60 * 1000)) * (5 * 60 * 1000)
    const groupKey = `${reservation.clientId}-${reservation.locationId}-${roundedTime}`

    if (!comboTracker.has(groupKey)) {
      comboTracker.set(groupKey, new Set())
    }

    const price = getPriceInSrd(reservation.item, exchangeRate)
    const subtotal = price * reservation.quantity
    const comboId = reservation.combo_id

    let priceToAdd = 0
    let isComboItem = false

    if (comboId) {
      const trackedCombos = comboTracker.get(groupKey)
      isComboItem = true

      if (trackedCombos && !trackedCombos.has(comboId)) {
        priceToAdd = comboPrices.get(comboId) ?? 0
        trackedCombos.add(comboId)
      }
    } else {
      priceToAdd = subtotal
    }

    const groupItem = {
      id: reservation.id,
      item_id: reservation.itemId,
      item_name: reservation.item.name,
      quantity: reservation.quantity,
      unit_price: price,
      subtotal,
      isCombo: isComboItem,
      combo_id: comboId,
      combo_price: reservation.combo_price === null ? null : toNumber(reservation.combo_price),
    }

    if (groupedMap.has(groupKey)) {
      const group = groupedMap.get(groupKey)
      if (!group) return

      group.items.push(groupItem)
      group.total_amount += priceToAdd
      return
    }

    groupedMap.set(groupKey, {
      id: groupKey,
      invoiceNumber: `RES-${toIsoString(reservation.createdAt).slice(0, 10).replace(/-/g, '')}-${groupKey.slice(-8)}`,
      client_id: reservation.clientId,
      location_id: reservation.locationId,
      client_name: reservation.client.name,
      location_name: reservation.location.name,
      created_at: toIsoString(reservation.createdAt),
      status: reservation.status,
      total_amount: priceToAdd,
      currency: 'SRD',
      type: 'reservation',
      items: [groupItem],
    })
  })

  return Array.from(groupedMap.values())
}

function buildStats(invoices: InvoicesPageInvoice[], todayStart: Date): InvoicesPageStats {
  return {
    totalSales: invoices.filter((invoice) => invoice.type === 'sale').length,
    totalReservations: invoices.filter((invoice) => invoice.type === 'reservation').length,
    todaySales: invoices.filter((invoice) => invoice.type === 'sale' && new Date(invoice.created_at) >= todayStart).length,
    todayReservations: invoices.filter((invoice) => invoice.type === 'reservation' && new Date(invoice.created_at) >= todayStart).length,
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [locations, sales, reservations, currentRate] = await prisma.$transaction([
      prisma.location.findMany({
        orderBy: { name: 'asc' },
      }),
      prisma.sale.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
        include: {
          location: true,
          saleItems: {
            orderBy: { createdAt: 'asc' },
            include: {
              item: true,
            },
          },
        },
      }),
      prisma.reservation.findMany({
        where: {
          status: { in: ['completed', 'pending'] },
        },
        take: 200,
        orderBy: { createdAt: 'desc' },
        include: {
          client: true,
          item: true,
          location: true,
        },
      }),
      prisma.exchangeRate.findFirst({
        where: { isActive: true },
        orderBy: { setAt: 'desc' },
      }),
    ])

    const saleInvoices: InvoicesPageSaleInvoice[] = sales.map((sale) => ({
      id: sale.id,
      invoiceNumber: generateSaleInvoiceNumber(sale),
      location_id: sale.locationId,
      location_name: sale.location.name,
      created_at: toIsoString(sale.createdAt),
      total_amount: toNumber(sale.totalAmount),
      currency: sale.currency as InvoicesPageSaleInvoice['currency'],
      payment_method: sale.paymentMethod,
      type: 'sale',
      items: sale.saleItems.map((item) => ({
        id: item.id,
        item_id: item.itemId,
        item_name: item.item?.name ?? 'Unknown Item',
        quantity: item.quantity,
        unit_price: toNumber(item.unitPrice),
        subtotal: toNumber(item.subtotal),
        is_custom_price: item.is_custom_price ?? false,
        original_price: item.original_price === null ? null : toNumber(item.original_price),
        discount_reason: item.discount_reason,
      })),
    }))

    const reservationInvoices = buildReservationInvoices(
      reservations,
      currentRate ? toNumber(currentRate.usdToSrd) : null,
    )
    const invoices = [...saleInvoices, ...reservationInvoices].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    )

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const data: InvoicesPageDataPayload = {
      invoices,
      locations: locations.map(mapLocation),
      stats: buildStats(invoices, todayStart),
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Invoices route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
