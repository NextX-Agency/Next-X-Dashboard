import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { prisma } from '@/lib/prisma'
import { roundCurrencyAmount } from '@/lib/pricing'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { holdStockForOrder, releaseStockForOrder } from '@/lib/customerOrders'
import { writeActivityLog } from '@/lib/serverActivityLog'
import {
  allocateInvoiceNumber,
  buildCommissions,
  parsePositiveAmount,
  parseQuantity,
  resolveExchangeRate,
  resolveSaleLines,
  SaleValidationError,
  type SaleComboInput,
  type SaleLineInput,
} from '@/lib/saleCreation'
import type {
  ReservationsPageClient,
  ReservationsPageDataPayload,
  ReservationsPageAvailability,
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

type ReservationRequestRecord = Record<string, unknown>

function asRecord(value: unknown): ReservationRequestRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ReservationRequestRecord
    : null
}

function requiredString(value: unknown, label: string): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result) throw new SaleValidationError(`${label} is required.`)
  return result
}

function parseReservationIds(value: unknown): string[] {
  const ids = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) throw new SaleValidationError('Choose at least one reservation item.')
  if (uniqueIds.length > 100) throw new SaleValidationError('A reservation checkout cannot exceed 100 items.')
  return uniqueIds
}

function parseReservationLines(value: unknown): SaleLineInput[] {
  if (!Array.isArray(value)) return []
  return value.map((line) => {
    const record = asRecord(line)
    if (!record) throw new SaleValidationError('Each reservation line must be valid.')
    return {
      itemId: requiredString(record.itemId, 'Product'),
      quantity: parseQuantity(record.quantity, 'reservation quantity'),
      customPrice: null,
      discountReason: null,
    }
  })
}

function parseReservationCombos(value: unknown): Array<SaleComboInput & { reservationComboId: string }> {
  if (!Array.isArray(value)) return []
  return value.map((combo) => {
    const record = asRecord(combo)
    if (!record) throw new SaleValidationError('Each reservation combo must be valid.')
    const members = Array.isArray(record.items) ? record.items : []
    if (members.length === 0) throw new SaleValidationError('A reservation combo needs at least one product.')

    return {
      reservationComboId: requiredString(record.id, 'Reservation combo'),
      name: typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 120) : 'Reservation combo',
      comboPrice: parsePositiveAmount(record.comboPrice, 'Reservation combo price'),
      items: members.map((member) => {
        const item = asRecord(member)
        if (!item) throw new SaleValidationError('Each reservation combo line must be valid.')
        return {
          itemId: requiredString(item.itemId, 'Combo product'),
          quantity: parseQuantity(item.quantity, 'combo quantity'),
        }
      }),
    }
  })
}

async function completeReservationSale(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  user: { id: string; email: string; name: string | null; role: string },
  reservationIds: string[],
  clientName: string,
  locationId: string,
  items: SaleLineInput[],
  combos: SaleComboInput[],
) {
  const [location, activeRate] = await Promise.all([
    tx.location.findFirst({
      where: { id: locationId, is_active: true },
      select: { id: true, name: true, companyId: true, commission_rate: true },
    }),
    tx.exchangeRate.findFirst({
      where: { isActive: true },
      orderBy: { setAt: 'desc' },
      select: { usdToSrd: true },
    }),
  ])
  if (!location) throw new SaleValidationError('That reservation location is no longer active.')

  const exchangeRate = resolveExchangeRate(activeRate?.usdToSrd)
  const wallet = await tx.wallet.findFirst({
    where: { location_id: locationId, currency: 'SRD', type: 'cash', purpose: 'operational' },
    select: { id: true, companyId: true, personName: true },
  })
  if (!wallet) {
    throw new SaleValidationError(`No operational SRD cash wallet exists for ${location.name}.`)
  }
  if (wallet.companyId !== location.companyId) {
    throw new SaleValidationError('The reservation location and its cash wallet belong to different companies.')
  }

  // Release this reservation's own hold first.
  //
  // Order matters: `resolveSaleLines` refuses to sell reserved units, and the
  // units being sold here are exactly the ones this reservation is holding. If
  // the hold were released after the lines were resolved, a fully reserved item
  // would fail its own completion. Everything is inside one Serializable
  // transaction, so the hold cannot be released without the sale being written.
  const heldReservations = await tx.reservation.findMany({
    where: { id: { in: reservationIds } },
    select: { itemId: true, quantity: true },
  })
  const heldByItemId = new Map<string, number>()
  for (const held of heldReservations) {
    heldByItemId.set(held.itemId, (heldByItemId.get(held.itemId) ?? 0) + held.quantity)
  }
  await releaseStockForOrder(
    tx,
    locationId,
    [...heldByItemId].map(([itemId, quantity]) => ({ itemId, quantity })),
  )

  const { lines, stockByItemId } = await resolveSaleLines(
    tx,
    { locationId, currency: 'SRD', paymentMethod: 'cash', items, combos },
    exchangeRate,
  )
  const totalAmount = roundCurrencyAmount(lines.reduce((sum, line) => sum + line.subtotal, 0))
  if (totalAmount <= 0) throw new SaleValidationError('A completed reservation must have a positive total.')

  const seller = await tx.seller.findFirst({
    where: { location_id: locationId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, commissionRate: true },
  })
  const correlationId = randomUUID()
  const invoiceNumber = await allocateInvoiceNumber(tx)
  const sale = await tx.sale.create({
    data: {
      companyId: location.companyId,
      locationId,
      sellerId: seller?.id ?? null,
      currency: 'SRD',
      exchangeRate: null,
      totalAmount,
      paymentMethod: 'reservation',
      wallet_id: wallet.id,
      correlationId,
      invoiceNumber,
      invoiceIsReconstructed: false,
      saleItems: {
        create: lines.map((line) => ({
          companyId: location.companyId,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          is_custom_price: line.isCustomPrice,
          original_price: line.originalPrice,
          discount_reason: line.discountReason,
          unitCostUsd: line.unitCostUsd,
          fxRateAtSale: exchangeRate,
          costIsEstimated: false,
        })),
      },
    },
    select: { id: true, createdAt: true },
  })

  const demandByItemId = new Map<string, number>()
  for (const line of lines) {
    demandByItemId.set(line.itemId, (demandByItemId.get(line.itemId) ?? 0) + line.quantity)
  }

  for (const [itemId, demand] of demandByItemId) {
    const stock = stockByItemId.get(itemId)
    if (!stock) throw new SaleValidationError('The reservation stock record no longer exists.')
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
          companyId: location.companyId,
          sellerId: seller.id,
          saleId: sale.id,
          location_id: locationId,
          category_id: draft.categoryId,
          commissionAmount: draft.amount,
          commission_rate: draft.rate,
          paid: false,
        },
      })
      commissionTotal = roundCurrencyAmount(commissionTotal + draft.amount)
    }
  }

  await markFinanceLedgerRecorded(tx)
  const creditedWallet = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: totalAmount } },
    select: { balance: true },
  })
  const balanceAfter = roundCurrencyAmount(Number(creditedWallet.balance))
  const balanceBefore = roundCurrencyAmount(balanceAfter - totalAmount)
  const walletTransaction = await tx.wallet_transactions.create({
    data: {
      companyId: location.companyId,
      wallet_id: wallet.id,
      sale_id: sale.id,
      type: 'credit',
      amount: totalAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      currency: 'SRD',
      description: `Completed reservation ${invoiceNumber}`,
      reference_type: 'sale',
      reference_id: sale.id,
    },
  })
  await recordFinanceLedgerEntry(tx, {
    companyId: location.companyId,
    walletTransactionId: walletTransaction.id,
    walletId: wallet.id,
    locationId,
    sellerId: seller?.id ?? null,
    actorUserId: user.id,
    eventType: 'sale',
    direction: 'in',
    amount: totalAmount,
    currency: 'SRD',
    sourceType: 'sale',
    sourceId: sale.id,
    correlationId,
    description: `Completed reservation for ${clientName} at ${location.name}`,
    occurredAt: sale.createdAt,
    metadata: { reservationIds, invoiceNumber, commissionTotal, paymentMethod: 'reservation' },
  })

  const statusUpdate = await tx.reservation.updateMany({
    where: { id: { in: reservationIds }, status: 'pending' },
    data: { status: 'completed' },
  })
  if (statusUpdate.count !== reservationIds.length) {
    throw new SaleValidationError('One or more reservation items were already changed. Nothing was posted.')
  }

  await writeActivityLog({
    action: 'create',
    entityType: 'sale',
    entityId: sale.id,
    entityName: invoiceNumber,
    details: `Recorded completed reservation for ${clientName}: ${totalAmount.toFixed(2)} SRD at ${location.name}.`,
    user,
    request,
    source: 'reservations-api',
    client: tx,
  })
  await writeActivityLog({
    action: 'complete',
    entityType: 'reservation',
    entityId: reservationIds[0],
    entityName: clientName,
    details: `Completed ${reservationIds.length} reservation item(s) as ${invoiceNumber}.`,
    user,
    request,
    source: 'reservations-api',
    client: tx,
  })

  return {
    invoiceNumber,
    createdAt: sale.createdAt.toISOString(),
    totalAmount,
    currency: 'SRD' as const,
    locationName: location.name,
    clientName,
    isPaid: true,
    items: lines.map((line) => ({
      name: line.itemName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      isCombo: line.comboKey !== null,
    })),
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const catalogType = request.nextUrl.searchParams.get('catalogType') === 'watches' ? 'watches' : 'audio'
    const selectedLocationId = request.nextUrl.searchParams.get('locationId') || null
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)

    const [clients, items, locations, currentRate, recentReservationsRaw, statsReservations, pendingCount, completedCount, locationStocks, locationReservations] = await Promise.all([
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
      selectedLocationId
        ? prisma.stock.findMany({
            where: { locationId: selectedLocationId },
            select: { itemId: true, quantity: true },
          })
        : Promise.resolve([]),
      selectedLocationId
        ? prisma.reservation.findMany({
            where: { locationId: selectedLocationId, status: 'pending' },
            select: { itemId: true, quantity: true },
          })
        : Promise.resolve([]),
    ])

    const availability: ReservationsPageAvailability = {
      stockByItemId: Object.fromEntries(locationStocks.map((stock) => [stock.itemId, stock.quantity])),
      pendingByItemId: locationReservations.reduce<Record<string, number>>((totals, reservation) => {
        totals[reservation.itemId] = (totals[reservation.itemId] ?? 0) + reservation.quantity
        return totals
      }, {}),
    }

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
      availability,
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

/**
 * Reservation mutations deliberately share one endpoint. The browser only
 * submits an intent; stock, sales, commissions, wallet movements, the ledger,
 * and activity records are calculated and committed on the server.
 */
export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as ReservationRequestRecord
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'createClient') {
      const name = requiredString(body.name, 'Client name').slice(0, 160)
      const locationId = typeof body.locationId === 'string' && body.locationId ? body.locationId : null
      const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim().slice(0, 80) : null
      const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().slice(0, 255) : null
      const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null

      const client = await runSerializableTransaction(async (tx) => {
        if (locationId) {
          const location = await tx.location.findFirst({ where: { id: locationId, is_active: true }, select: { id: true } })
          if (!location) throw new SaleValidationError('Choose an active location for this client.')
        }
        const created = await tx.client.create({
          data: { name, phone, email, notes, location_id: locationId },
          select: { id: true, name: true },
        })
        await writeActivityLog({
          action: 'create',
          entityType: 'client',
          entityId: created.id,
          entityName: created.name,
          details: `Created client ${created.name}.`,
          user,
          request,
          source: 'reservations-api',
          client: tx,
        })
        return created
      })
      return NextResponse.json({ data: { client } }, { status: 201 })
    }

    if (action === 'create') {
      const locationId = requiredString(body.locationId, 'Location')
      const clientId = requiredString(body.clientId, 'Client')
      const items = parseReservationLines(body.items)
      const combos = parseReservationCombos(body.combos)
      const paid = body.paymentStatus === 'paid'
      if (items.length === 0 && combos.length === 0) {
        throw new SaleValidationError('Add at least one product to the reservation.')
      }

      const result = await runSerializableTransaction(async (tx) => {
        const [location, client, activeRate] = await Promise.all([
          tx.location.findFirst({ where: { id: locationId, is_active: true }, select: { id: true, name: true, companyId: true } }),
          tx.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
          tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } }),
        ])
        if (!location) throw new SaleValidationError('Choose an active reservation location.')
        if (!client) throw new SaleValidationError('Choose a valid client.')

        const { lines } = await resolveSaleLines(
          tx,
          { locationId, currency: 'SRD', paymentMethod: 'cash', items, combos },
          resolveExchangeRate(activeRate?.usdToSrd),
        )
        const combosByKey = new Map(combos.map((combo, index) => [`${index + 1}:${combo.name}`, combo]))
        const originalTotalsByCombo = new Map<string, number>()
        for (const line of lines) {
          if (!line.comboKey) continue
          originalTotalsByCombo.set(
            line.comboKey,
            roundCurrencyAmount((originalTotalsByCombo.get(line.comboKey) ?? 0) + (line.originalPrice ?? 0) * line.quantity),
          )
        }

        const createdReservations = [] as Array<{ id: string }>
        const writtenComboKeys = new Set<string>()
        for (const line of lines) {
          const combo = line.comboKey ? combosByKey.get(line.comboKey) : null
          const isFirstComboLine = Boolean(line.comboKey && !writtenComboKeys.has(line.comboKey))
          if (line.comboKey) writtenComboKeys.add(line.comboKey)
          const created = await tx.reservation.create({
            data: {
              clientId,
              itemId: line.itemId,
              locationId,
              quantity: line.quantity,
              status: 'pending',
              combo_id: combo?.reservationComboId ?? null,
              combo_price: isFirstComboLine ? combo?.comboPrice ?? null : null,
              original_price: isFirstComboLine && line.comboKey ? originalTotalsByCombo.get(line.comboKey) ?? null : null,
            },
            select: { id: true },
          })
          createdReservations.push(created)
        }

        const reservationIds = createdReservations.map((reservation) => reservation.id)

        // Hold the stock. Reservations promised units for months without ever
        // removing them from what the shop offered, so the same watch could be
        // reserved twice and sold once.
        const heldByItemId = new Map<string, number>()
        for (const line of lines) {
          heldByItemId.set(line.itemId, (heldByItemId.get(line.itemId) ?? 0) + line.quantity)
        }
        await holdStockForOrder(
          tx,
          locationId,
          [...heldByItemId].map(([itemId, quantity]) => ({ itemId, quantity })),
        )

        if (paid) {
          return completeReservationSale(tx, request, user, reservationIds, client.name, locationId, items, combos)
        }

        const totalAmount = roundCurrencyAmount(lines.reduce((sum, line) => sum + line.subtotal, 0))
        await writeActivityLog({
          action: 'create',
          entityType: 'reservation',
          entityId: reservationIds[0],
          entityName: client.name,
          details: `Created ${reservationIds.length} pending reservation item(s) at ${location.name} for ${totalAmount.toFixed(2)} SRD.`,
          user,
          request,
          source: 'reservations-api',
          client: tx,
        })
        return {
          invoiceNumber: `RES-${reservationIds[0]?.slice(0, 8) ?? 'PENDING'}`,
          createdAt: new Date().toISOString(),
          totalAmount,
          currency: 'SRD' as const,
          locationName: location.name,
          clientName: client.name,
          isPaid: false,
          items: lines.map((line) => ({
            name: line.itemName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            subtotal: line.subtotal,
            isCombo: line.comboKey !== null,
          })),
        }
      })
      return NextResponse.json({ data: result }, { status: 201 })
    }

    if (action === 'complete') {
      const reservationIds = parseReservationIds(body.reservationIds)
      const result = await runSerializableTransaction(async (tx) => {
        const reservations = await tx.reservation.findMany({
          where: { id: { in: reservationIds } },
          include: {
            client: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
          },
        })
        if (reservations.length !== reservationIds.length) throw new SaleValidationError('One or more reservation items no longer exist.')
        if (reservations.some((reservation) => reservation.status !== 'pending')) {
          throw new SaleValidationError('Only pending reservations can be completed.')
        }
        const clientId = reservations[0]?.clientId
        const locationId = reservations[0]?.locationId
        if (!clientId || !locationId || reservations.some((reservation) => reservation.clientId !== clientId || reservation.locationId !== locationId)) {
          throw new SaleValidationError('Reservation items must belong to one client and one location.')
        }

        const items = reservations
          .filter((reservation) => !reservation.combo_id)
          .map((reservation) => ({ itemId: reservation.itemId, quantity: reservation.quantity, customPrice: null, discountReason: null }))
        const comboRows = new Map<string, typeof reservations>()
        for (const reservation of reservations) {
          if (!reservation.combo_id) continue
          comboRows.set(reservation.combo_id, [...(comboRows.get(reservation.combo_id) ?? []), reservation])
        }
        const combos = Array.from(comboRows.entries()).map(([reservationComboId, rows]) => {
          const pricedRow = rows.find((row) => row.combo_price !== null)
          if (!pricedRow || Number(pricedRow.combo_price) <= 0) {
            throw new SaleValidationError('A reservation combo is missing its recorded price.')
          }
          return {
            name: `Reservation combo ${reservationComboId.slice(0, 8)}`,
            comboPrice: Number(pricedRow.combo_price),
            items: rows.map((row) => ({ itemId: row.itemId, quantity: row.quantity })),
          }
        })

        return completeReservationSale(
          tx,
          request,
          user,
          reservationIds,
          reservations[0].client.name,
          locationId,
          items,
          combos,
        )
      })
      return NextResponse.json({ data: result })
    }

    if (action === 'cancel') {
      const reservationIds = parseReservationIds(body.reservationIds)
      const result = await runSerializableTransaction(async (tx) => {
        const reservations = await tx.reservation.findMany({
          where: { id: { in: reservationIds } },
          include: { client: { select: { name: true } }, location: { select: { name: true } } },
        })
        if (reservations.length !== reservationIds.length) throw new SaleValidationError('One or more reservation items no longer exist.')
        if (reservations.some((reservation) => reservation.status !== 'pending')) {
          throw new SaleValidationError('Only pending reservations can be cancelled. Void a completed sale instead.')
        }
        const clientId = reservations[0]?.clientId
        const locationId = reservations[0]?.locationId
        if (!clientId || !locationId || reservations.some((reservation) => reservation.clientId !== clientId || reservation.locationId !== locationId)) {
          throw new SaleValidationError('Reservation items must belong to one client and one location.')
        }
        const update = await tx.reservation.updateMany({
          where: { id: { in: reservationIds }, status: 'pending' },
          data: { status: 'cancelled' },
        })
        if (update.count !== reservationIds.length) throw new SaleValidationError('A reservation changed while it was being cancelled.')

        // Give the held units back to what the shop can sell.
        const releasedByItemId = new Map<string, number>()
        for (const reservation of reservations) {
          releasedByItemId.set(
            reservation.itemId,
            (releasedByItemId.get(reservation.itemId) ?? 0) + reservation.quantity,
          )
        }
        await releaseStockForOrder(
          tx,
          locationId,
          [...releasedByItemId].map(([itemId, quantity]) => ({ itemId, quantity })),
        )

        await writeActivityLog({
          action: 'cancel',
          entityType: 'reservation',
          entityId: reservationIds[0],
          entityName: reservations[0].client.name,
          details: `Cancelled ${reservationIds.length} pending reservation item(s) at ${reservations[0].location.name}.`,
          user,
          request,
          source: 'reservations-api',
          client: tx,
        })
        return { cancelled: update.count }
      })
      return NextResponse.json({ data: result })
    }

    return NextResponse.json({ error: 'Unknown reservation action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof SaleValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Reservation mutation error:', error)
    return NextResponse.json({ error: 'Unable to save the reservation. Nothing was changed.' }, { status: 500 })
  }
}
