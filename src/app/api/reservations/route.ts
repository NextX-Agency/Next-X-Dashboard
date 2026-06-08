import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  ReservationsPageClient,
  ReservationsPageDataPayload,
  ReservationsPageItem,
  ReservationsPageLocation,
  ReservationsPageReservationGroup,
  ReservationsPageStats,
} from '@/types/reservations'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNullableIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
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

function mapClient(client: {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  location_id: string | null
}): ReservationsPageClient {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    notes: client.notes,
    created_at: toIsoString(client.createdAt),
    updated_at: toIsoString(client.updatedAt),
    location_id: client.location_id,
  }
}

function mapItem(item: {
  id: string
  name: string
  brand: string | null
  catalogType: string
  categoryId: string | null
  purchasePriceUsd: unknown
  sellingPriceSrd: unknown
  sellingPriceUsd: unknown
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
  description: string | null
  isPublic: boolean | null
  is_combo: boolean | null
  allow_custom_price: boolean | null
  deletedAt: Date | null
}): ReservationsPageItem {
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
}): ReservationsPageLocation {
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

function buildReservationGroups(reservations: Array<{
  id: string
  clientId: string
  itemId: string
  locationId: string
  quantity: number
  status: string
  createdAt: Date
  combo_id: string | null
  combo_price: unknown
  client: { id: string; name: string }
  item: { id: string; name: string; sellingPriceSrd: unknown | null; sellingPriceUsd: unknown | null }
  location: { id: string; name: string }
}>, exchangeRate: number | null): ReservationsPageReservationGroup[] {
  const groupedMap = new Map<string, ReservationsPageReservationGroup>()
  const comboTracker = new Map<string, Set<string>>()
  const comboPrices = new Map<string, number>()
  const comboItemsMap = new Map<string, Array<{ id: string; item_id: string; item_name: string; quantity: number }>>()

  reservations.forEach((reservation) => {
    if (reservation.combo_id) {
      if (reservation.combo_price !== null && reservation.combo_price !== undefined) {
        comboPrices.set(reservation.combo_id, toNumber(reservation.combo_price))
      }

      if (!comboItemsMap.has(reservation.combo_id)) {
        comboItemsMap.set(reservation.combo_id, [])
      }

      comboItemsMap.get(reservation.combo_id)?.push({
        id: reservation.id,
        item_id: reservation.itemId,
        item_name: reservation.item.name,
        quantity: reservation.quantity,
      })
    }
  })

  reservations.forEach((reservation) => {
    const timestamp = reservation.createdAt.getTime()
    const roundedTime = Math.floor(timestamp / (5 * 60 * 1000)) * (5 * 60 * 1000)
    const groupKey = `${reservation.clientId}-${reservation.locationId}-${roundedTime}-${reservation.status}`
    const unitPrice = getPriceInSrd(reservation.item, exchangeRate)
    const subtotal = unitPrice * reservation.quantity
    const comboId = reservation.combo_id

    if (!comboTracker.has(groupKey)) {
      comboTracker.set(groupKey, new Set())
    }

    let priceToAdd = 0
    if (comboId) {
      const trackedCombos = comboTracker.get(groupKey)
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
      unit_price: unitPrice,
      subtotal,
      combo_id: comboId,
      combo_price: reservation.combo_price === null ? null : toNumber(reservation.combo_price),
    }

    if (groupedMap.has(groupKey)) {
      const group = groupedMap.get(groupKey)
      if (!group) return

      group.items.push(groupItem)
      group.total_amount += priceToAdd

      if (comboId && !group.combos?.find((combo) => combo.combo_id === comboId)) {
        if (!group.combos) {
          group.combos = []
        }

        group.combos.push({
          combo_id: comboId,
          combo_price: comboPrices.get(comboId) ?? 0,
          items: comboItemsMap.get(comboId) ?? [],
        })
      }
      return
    }

    const nextGroup: ReservationsPageReservationGroup = {
      id: groupKey,
      client_id: reservation.clientId,
      location_id: reservation.locationId,
      client_name: reservation.client.name,
      location_name: reservation.location.name,
      created_at: reservation.createdAt.toISOString(),
      status: reservation.status,
      total_amount: priceToAdd,
      items: [groupItem],
      combos: [],
    }

    if (comboId) {
      nextGroup.combos = [{
        combo_id: comboId,
        combo_price: comboPrices.get(comboId) ?? 0,
        items: comboItemsMap.get(comboId) ?? [],
      }]
    }

    groupedMap.set(groupKey, nextGroup)
  })

  return Array.from(groupedMap.values()).sort((left, right) =>
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )
}

function buildReservationStats(
  reservations: Array<{ createdAt: Date; quantity: number; item: { sellingPriceSrd: unknown | null; sellingPriceUsd: unknown | null } }>,
  pendingCount: number,
  completedCount: number,
  todayStart: Date,
  exchangeRate: number | null,
): ReservationsPageStats {
  let todayReservations = 0
  let todayTotal = 0
  let weekTotal = 0

  reservations.forEach((reservation) => {
    const price = getPriceInSrd(reservation.item, exchangeRate)
    const subtotal = price * reservation.quantity
    weekTotal += subtotal

    if (reservation.createdAt >= todayStart) {
      todayReservations += 1
      todayTotal += subtotal
    }
  })

  return {
    todayReservations,
    todayTotal,
    weekReservations: reservations.length,
    weekTotal,
    pendingCount,
    completedCount,
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const catalogType = request.nextUrl.searchParams.get('catalogType') === 'watches' ? 'watches' : 'audio'
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)

    const [clients, items, locations, currentRate, recentReservationsRaw, statsReservations, pendingCount, completedCount] = await Promise.all([
      prisma.client.findMany({
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          location_id: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.item.findMany({
        where: { deletedAt: null, catalogType },
        select: {
          id: true,
          name: true,
          brand: true,
          catalogType: true,
          categoryId: true,
          purchasePriceUsd: true,
          sellingPriceSrd: true,
          sellingPriceUsd: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true,
          description: true,
          isPublic: true,
          is_combo: true,
          allow_custom_price: true,
          deletedAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.location.findMany({
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
          catalogType: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.exchangeRate.findFirst({
        where: { isActive: true },
        orderBy: { setAt: 'desc' },
      }),
      prisma.reservation.findMany({
        take: 20,
        where: {
          item: {
            is: { catalogType },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          clientId: true,
          itemId: true,
          locationId: true,
          quantity: true,
          status: true,
          createdAt: true,
          combo_id: true,
          combo_price: true,
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          item: {
            select: {
              id: true,
              name: true,
              sellingPriceSrd: true,
              sellingPriceUsd: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.reservation.findMany({
        where: {
          createdAt: { gte: weekStart },
          item: {
            is: { catalogType },
          },
        },
        select: {
          createdAt: true,
          quantity: true,
          item: {
            select: {
              sellingPriceSrd: true,
              sellingPriceUsd: true,
            },
          },
        },
      }),
      prisma.reservation.count({
        where: {
          status: 'pending',
          item: {
            is: { catalogType },
          },
        },
      }),
      prisma.reservation.count({
        where: {
          status: 'completed',
          item: {
            is: { catalogType },
          },
        },
      }),
    ])

    const data: ReservationsPageDataPayload = {
      clients: clients.map(mapClient),
      items: items.map(mapItem),
      locations: locations.map(mapLocation),
      recentReservations: buildReservationGroups(recentReservationsRaw, currentRate ? toNumber(currentRate.usdToSrd) : null),
      reservationStats: buildReservationStats(
        statsReservations,
        pendingCount,
        completedCount,
        todayStart,
        currentRate ? toNumber(currentRate.usdToSrd) : null,
      ),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Reservations route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
