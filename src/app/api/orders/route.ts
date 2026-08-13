import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'
import type {
  OrdersPageClient,
  OrdersPageDataPayload,
  OrdersPageItem,
  OrdersPageLocation,
  OrdersPageOrderAllocation,
  OrdersPageOrder,
  OrdersPageOrderItem,
  OrdersPageWallet,
} from '@/types/orders'

type OrderStatus = 'pending' | 'ordered' | 'shipped' | 'partially_received' | 'received' | 'cancelled'
type OrderAction = 'create' | 'update' | 'status' | 'receive' | 'adjustReceipts' | 'cancel'

type OrderLineInput = {
  id?: string
  itemId: string
  quantity: number
  unitCost: number
  allocations: Array<{ locationId: string; quantity: number }>
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

function requiredId(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `${name} is required.`)
  return value.trim()
}

function optionalId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function positiveInteger(value: unknown, name: string, allowZero = false) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new ApiError(400, `${name} must be a ${allowZero ? 'non-negative' : 'positive'} whole number.`)
  }
  return parsed
}

function money(value: unknown, name: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new ApiError(400, `${name} must be a non-negative amount.`)
  return Math.round(parsed * 10000) / 10000
}

function optionalDate(value: unknown) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new ApiError(400, 'Expected arrival must be a valid date.')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Expected arrival must be a valid date.')
  return date
}

function orderStatus(value: unknown): OrderStatus {
  if (value === 'pending' || value === 'ordered' || value === 'shipped' || value === 'partially_received' || value === 'received' || value === 'cancelled') return value
  throw new ApiError(400, 'Invalid order status.')
}

function parseOrderLines(value: unknown): OrderLineInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new ApiError(400, 'Add at least one order line.')

  const itemIds = new Set<string>()
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new ApiError(400, `Order line ${index + 1} is invalid.`)
    const row = entry as Record<string, unknown>
    const itemId = requiredId(row.item_id ?? row.itemId, `Order line ${index + 1} item`)
    if (itemIds.has(itemId)) throw new ApiError(400, 'Each item can appear only once on an order.')
    itemIds.add(itemId)
    const quantity = positiveInteger(row.quantity, `Order line ${index + 1} quantity`)
    const unitCost = money(row.unit_cost ?? row.unitCost, `Order line ${index + 1} unit cost`)
    const allocationsRaw = row.allocations
    const allocationTotals = new Map<string, number>()

    if (Array.isArray(allocationsRaw)) {
      for (const allocation of allocationsRaw) {
        if (!allocation || typeof allocation !== 'object') throw new ApiError(400, `Order line ${index + 1} allocation is invalid.`)
        const allocationRow = allocation as Record<string, unknown>
        const locationId = requiredId(allocationRow.location_id ?? allocationRow.locationId, `Order line ${index + 1} allocation location`)
        const allocationQuantity = positiveInteger(allocationRow.quantity, `Order line ${index + 1} allocation quantity`, true)
        allocationTotals.set(locationId, (allocationTotals.get(locationId) ?? 0) + allocationQuantity)
      }
    }

    return {
      id: optionalId(row.id),
      itemId,
      quantity,
      unitCost,
      allocations: [...allocationTotals.entries()].map(([locationId, allocationQuantity]) => ({ locationId, quantity: allocationQuantity })),
    }
  })
}

async function validateOrderScope(
  tx: Prisma.TransactionClient,
  input: { locationId: string; walletId: string | null; supplierId: string | null; lines: OrderLineInput[] },
) {
  const [location, wallet, supplier, items] = await Promise.all([
    tx.location.findUnique({ where: { id: input.locationId }, select: { id: true, name: true, companyId: true, is_active: true } }),
    input.walletId ? tx.wallet.findUnique({ where: { id: input.walletId }, select: { id: true, companyId: true } }) : null,
    input.supplierId ? tx.client.findUnique({ where: { id: input.supplierId }, select: { id: true } }) : null,
    tx.item.findMany({ where: { id: { in: input.lines.map((line) => line.itemId) }, deletedAt: null }, select: { id: true, name: true } }),
  ])

  if (!location || !location.is_active) throw new ApiError(404, 'The destination location is not active.')
  if (input.walletId && (!wallet || wallet.companyId !== location.companyId)) throw new ApiError(400, 'The selected wallet does not belong to the destination company.')
  if (input.supplierId && !supplier) throw new ApiError(404, 'Supplier not found.')
  if (items.length !== input.lines.length) throw new ApiError(404, 'One or more order items are unavailable.')

  const allocationLocationIds = [...new Set(input.lines.flatMap((line) => line.allocations.map((allocation) => allocation.locationId)))]
  const allocationLocations = allocationLocationIds.length === 0
    ? []
    : await tx.location.findMany({ where: { id: { in: allocationLocationIds }, is_active: true }, select: { id: true, companyId: true } })
  const allocationCompanyById = new Map(allocationLocations.map((allocationLocation) => [allocationLocation.id, allocationLocation.companyId]))

  for (const line of input.lines) {
    const allocations = line.allocations.length > 0 ? line.allocations : [{ locationId: location.id, quantity: line.quantity }]
    if (allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== line.quantity) {
      throw new ApiError(400, 'Each order line allocation must equal its ordered quantity.')
    }
    for (const allocation of allocations) {
      if (allocation.quantity === 0) continue
      if (allocationCompanyById.get(allocation.locationId) !== location.companyId && allocation.locationId !== location.id) {
        throw new ApiError(400, 'Every allocation must belong to the destination company.')
      }
    }
  }

  return { location, itemNames: new Map(items.map((item) => [item.id, item.name])) }
}

function normalizedAllocations(line: OrderLineInput, defaultLocationId: string) {
  return line.allocations.length > 0 ? line.allocations : [{ locationId: defaultLocationId, quantity: line.quantity }]
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

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value)
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [orders, items, locations, wallets, clients] = await Promise.all([
      prisma.purchaseOrder.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletId: true,
          locationId: true,
          supplier_id: true,
          totalAmount: true,
          currency: true,
          exchange_rate: true,
          status: true,
          notes: true,
          expected_arrival: true,
          createdAt: true,
          updatedAt: true,
          wallet: {
            select: {
              id: true,
              personName: true,
              type: true,
              currency: true,
              balance: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
            },
          },
          clients: {
            select: {
              id: true,
              name: true,
            },
          },
          purchase_order_items: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              order_id: true,
              itemId: true,
              quantity: true,
              unit_cost: true,
              subtotal: true,
              quantity_received: true,
              item: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  purchasePriceUsd: true,
                  sellingPriceSrd: true,
                  sellingPriceUsd: true,
                  imageUrl: true,
                  catalogType: true,
                },
              },
              allocations: {
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  orderItemId: true,
                  locationId: true,
                  quantity: true,
                  quantity_received: true,
                  createdAt: true,
                  updatedAt: true,
                  location: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.item.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          brand: true,
          purchasePriceUsd: true,
          sellingPriceSrd: true,
          sellingPriceUsd: true,
          imageUrl: true,
          catalogType: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.location.findMany({
        select: {
          id: true,
          name: true,
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
        },
        orderBy: { personName: 'asc' },
      }),
      prisma.client.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
    ])

    const data: OrdersPageDataPayload = {
      orders: orders.map<OrdersPageOrder>((order) => ({
        id: order.id,
        wallet_id: order.walletId,
        location_id: order.locationId,
        supplier_id: order.supplier_id,
        total_amount: toNumber(order.totalAmount),
        currency: order.currency,
        exchange_rate: toNullableNumber(order.exchange_rate),
        status: order.status,
        notes: order.notes,
        expected_arrival: toNullableIsoString(order.expected_arrival),
        created_at: toIsoString(order.createdAt),
        updated_at: toIsoString(order.updatedAt),
        wallets: order.wallet
          ? {
            id: order.wallet.id,
            person_name: order.wallet.personName,
            type: order.wallet.type,
            currency: order.wallet.currency,
            balance: toNumber(order.wallet.balance),
          }
          : null,
        locations: order.location
          ? {
            id: order.location.id,
            name: order.location.name,
          }
          : null,
        clients: order.clients
          ? {
            id: order.clients.id,
            name: order.clients.name,
          }
          : null,
        purchase_order_items: order.purchase_order_items.map<OrdersPageOrderItem>((item) => ({
          id: item.id,
          order_id: item.order_id,
          item_id: item.itemId,
          quantity: item.quantity,
          unit_cost: toNumber(item.unit_cost),
          subtotal: toNumber(item.subtotal),
          quantity_received: item.quantity_received,
          items: item.item
            ? {
              id: item.item.id,
              name: item.item.name,
              brand: item.item.brand,
              purchase_price_usd: toNumber(item.item.purchasePriceUsd),
              selling_price_srd: toNullableNumber(item.item.sellingPriceSrd),
              selling_price_usd: toNullableNumber(item.item.sellingPriceUsd),
              image_url: item.item.imageUrl,
              catalog_type: item.item.catalogType,
            }
            : null,
          purchase_order_allocations: item.allocations.map<OrdersPageOrderAllocation>((allocation) => ({
            id: allocation.id,
            order_item_id: allocation.orderItemId,
            location_id: allocation.locationId,
            quantity: allocation.quantity,
            quantity_received: allocation.quantity_received,
            created_at: toIsoString(allocation.createdAt),
            updated_at: toIsoString(allocation.updatedAt),
            locations: allocation.location
              ? {
                id: allocation.location.id,
                name: allocation.location.name,
              }
              : null,
          })),
        })),
      })),
      items: items.map<OrdersPageItem>((item) => ({
        id: item.id,
        name: item.name,
        brand: item.brand,
        purchase_price_usd: toNumber(item.purchasePriceUsd),
        selling_price_srd: toNullableNumber(item.sellingPriceSrd),
        selling_price_usd: toNullableNumber(item.sellingPriceUsd),
        image_url: item.imageUrl,
        catalog_type: item.catalogType,
      })),
      locations: locations.map<OrdersPageLocation>((location) => ({
        id: location.id,
        name: location.name,
      })),
      wallets: wallets.map<OrdersPageWallet>((wallet) => ({
        id: wallet.id,
        person_name: wallet.personName,
        type: wallet.type,
        currency: wallet.currency,
        balance: toNumber(wallet.balance),
      })),
      clients: clients.map<OrdersPageClient>((client) => ({
        id: client.id,
        name: client.name,
      })),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Orders route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function createOrder(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const locationId = requiredId(body.location_id, 'location_id')
  const walletId = optionalId(body.wallet_id)
  const supplierId = optionalId(body.supplier_id)
  const currency = body.currency === 'SRD' || body.currency === 'USD' ? body.currency : (() => { throw new ApiError(400, 'Currency must be SRD or USD.') })()
  const exchangeRate = body.exchange_rate == null || body.exchange_rate === '' ? null : money(body.exchange_rate, 'Exchange rate')
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 4000) : null
  const expectedArrival = optionalDate(body.expected_arrival)
  const lines = parseOrderLines(body.items)
  const scope = await validateOrderScope(tx, { locationId, walletId, supplierId, lines })
  const totalAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0)

  const order = await tx.purchaseOrder.create({
    data: {
      companyId: scope.location.companyId,
      walletId,
      locationId,
      supplier_id: supplierId,
      totalAmount,
      currency,
      exchange_rate: exchangeRate,
      status: 'pending',
      notes,
      expected_arrival: expectedArrival,
    },
    select: { id: true },
  })

  for (const line of lines) {
    const createdLine = await tx.purchaseOrderItem.create({
      data: {
        order_id: order.id,
        itemId: line.itemId,
        quantity: line.quantity,
        unit_cost: line.unitCost,
        subtotal: line.quantity * line.unitCost,
      },
      select: { id: true },
    })
    await tx.purchaseOrderAllocation.createMany({
      data: normalizedAllocations(line, locationId).map((allocation) => ({
        orderItemId: createdLine.id,
        locationId: allocation.locationId,
        quantity: allocation.quantity,
      })),
    })
    if (line.unitCost > 0) {
      await tx.item.update({ where: { id: line.itemId }, data: { purchasePriceUsd: line.unitCost } })
    }
  }

  await writeActivityLog({
    action: 'create',
    entityType: 'purchase_order',
    entityId: order.id,
    entityName: `Order #${order.id.slice(0, 8)}`,
    details: `Created purchase order for ${lines.map((line) => `${line.quantity}× ${scope.itemNames.get(line.itemId) ?? 'item'}`).join(', ')}; total ${totalAmount.toFixed(2)} ${currency}. Wallet is reference-only.`,
    user: actor,
    request,
    source: 'server',
    client: tx,
  })

  return { id: order.id }
}

async function updateOrder(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const orderId = requiredId(body.id, 'id')
  const locationId = requiredId(body.location_id, 'location_id')
  const walletId = optionalId(body.wallet_id)
  const supplierId = optionalId(body.supplier_id)
  const currency = body.currency === 'SRD' || body.currency === 'USD' ? body.currency : (() => { throw new ApiError(400, 'Currency must be SRD or USD.') })()
  const exchangeRate = body.exchange_rate == null || body.exchange_rate === '' ? null : money(body.exchange_rate, 'Exchange rate')
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 4000) : null
  const expectedArrival = optionalDate(body.expected_arrival)
  const lines = parseOrderLines(body.items)
  const existing = await tx.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      companyId: true,
      status: true,
      purchase_order_items: { select: { id: true, itemId: true, quantity_received: true, allocations: { select: { id: true, locationId: true, quantity_received: true } } } },
    },
  })
  if (!existing) throw new ApiError(404, 'Order not found.')
  if (existing.status !== 'pending' || existing.purchase_order_items.some((line) => line.quantity_received > 0)) {
    throw new ApiError(409, 'Only pending orders with no received stock can be edited.')
  }

  const scope = await validateOrderScope(tx, { locationId, walletId, supplierId, lines })
  if (scope.location.companyId !== existing.companyId) throw new ApiError(409, 'An order cannot be moved between companies.')

  const existingLineById = new Map(existing.purchase_order_items.map((line) => [line.id, line]))
  const submittedExistingIds = new Set(lines.flatMap((line) => line.id ? [line.id] : []))
  if (submittedExistingIds.size !== existing.purchase_order_items.length || existing.purchase_order_items.some((line) => !submittedExistingIds.has(line.id))) {
    throw new ApiError(409, 'Pending orders retain their existing line history. Adjust quantities or add lines instead of removing a line.')
  }

  for (const line of lines) {
    if (!line.id) continue
    const original = existingLineById.get(line.id)
    if (!original) throw new ApiError(400, 'An order line does not belong to this order.')
    if (original.itemId !== line.itemId) throw new ApiError(409, 'An existing order line cannot be changed to a different item.')
  }

  const totalAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0)
  await tx.purchaseOrder.update({
    where: { id: orderId },
    data: { walletId, locationId, supplier_id: supplierId, totalAmount, currency, exchange_rate: exchangeRate, notes, expected_arrival: expectedArrival },
  })

  for (const line of lines) {
    const allocations = normalizedAllocations(line, locationId)
    if (line.id) {
      await tx.purchaseOrderItem.update({
        where: { id: line.id },
        data: { quantity: line.quantity, unit_cost: line.unitCost, subtotal: line.quantity * line.unitCost },
      })
      const original = existingLineById.get(line.id)!
      const allocationsByLocation = new Map(allocations.map((allocation) => [allocation.locationId, allocation]))
      for (const allocation of original.allocations) {
        await tx.purchaseOrderAllocation.update({
          where: { id: allocation.id },
          data: { quantity: allocationsByLocation.get(allocation.locationId)?.quantity ?? 0 },
        })
        allocationsByLocation.delete(allocation.locationId)
      }
      if (allocationsByLocation.size > 0) {
        await tx.purchaseOrderAllocation.createMany({
          data: [...allocationsByLocation.values()].map((allocation) => ({ orderItemId: line.id!, locationId: allocation.locationId, quantity: allocation.quantity })),
        })
      }
    } else {
      const createdLine = await tx.purchaseOrderItem.create({
        data: { order_id: orderId, itemId: line.itemId, quantity: line.quantity, unit_cost: line.unitCost, subtotal: line.quantity * line.unitCost },
        select: { id: true },
      })
      await tx.purchaseOrderAllocation.createMany({
        data: allocations.map((allocation) => ({ orderItemId: createdLine.id, locationId: allocation.locationId, quantity: allocation.quantity })),
      })
    }
    if (line.unitCost > 0) await tx.item.update({ where: { id: line.itemId }, data: { purchasePriceUsd: line.unitCost } })
  }

  await writeActivityLog({
    action: 'update', entityType: 'purchase_order', entityId: orderId, entityName: `Order #${orderId.slice(0, 8)}`,
    details: `Updated pending purchase order; total ${totalAmount.toFixed(2)} ${currency}. Existing line and allocation history was retained.`,
    user: actor, request, source: 'server', client: tx,
  })
  return { id: orderId }
}

async function updateOrderStatus(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  orderId: string,
  requestedStatus: OrderStatus,
) {
  const order = await tx.purchaseOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, purchase_order_items: { select: { quantity: true, quantity_received: true } } },
  })
  if (!order) throw new ApiError(404, 'Order not found.')
  if (order.status === 'cancelled' || order.status === 'received') throw new ApiError(409, 'This closed order cannot change status.')

  const allowed =
    (order.status === 'pending' && requestedStatus === 'ordered') ||
    (order.status === 'ordered' && requestedStatus === 'shipped') ||
    (requestedStatus === 'cancelled')
  if (!allowed) throw new ApiError(409, 'That status transition is not allowed. Receive stock through the receipt workflow.')

  await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: requestedStatus } })
  await writeActivityLog({
    action: requestedStatus === 'cancelled' ? 'cancel' : 'update', entityType: 'purchase_order', entityId: orderId, entityName: `Order #${orderId.slice(0, 8)}`,
    details: requestedStatus === 'cancelled'
      ? 'Cancelled purchase order. Order, receipt, and stock history were retained; wallet balance is unchanged.'
      : `Changed purchase order status from ${order.status} to ${requestedStatus}.`,
    user: actor, request, source: 'server', client: tx,
  })
  return { id: orderId, status: requestedStatus }
}

type ReceiptInput = { orderItemId: string; allocationId: string | null; locationId: string; quantity: number }

function parseReceiptInputs(value: unknown, newQuantity = false): ReceiptInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new ApiError(400, 'Provide at least one receipt line.')
  const keys = new Set<string>()
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new ApiError(400, `Receipt line ${index + 1} is invalid.`)
    const row = entry as Record<string, unknown>
    const orderItemId = requiredId(row.order_item_id ?? row.orderItemId, `Receipt line ${index + 1} order item`)
    const allocationId = optionalId(row.allocation_id ?? row.allocationId)
    const locationId = requiredId(row.location_id ?? row.locationId, `Receipt line ${index + 1} location`)
    const quantity = positiveInteger(newQuantity ? (row.new_quantity_received ?? row.quantity) : row.quantity, `Receipt line ${index + 1} quantity`, newQuantity)
    const key = `${orderItemId}:${allocationId ?? 'default'}`
    if (keys.has(key)) throw new ApiError(400, 'Each receipt line may appear only once.')
    keys.add(key)
    return { orderItemId, allocationId, locationId, quantity }
  })
}

async function changeStock(tx: Prisma.TransactionClient, itemId: string, locationId: string, delta: number) {
  if (delta > 0) {
    await tx.stock.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { itemId, locationId, quantity: delta },
      update: { quantity: { increment: delta } },
    })
    return
  }
  if (delta < 0) {
    const result = await tx.stock.updateMany({
      where: { itemId, locationId, quantity: { gte: Math.abs(delta) } },
      data: { quantity: { decrement: Math.abs(delta) } },
    })
    if (result.count !== 1) throw new ApiError(409, 'Stock cannot be reduced below zero. Correct stock before reducing this receipt.')
  }
}

function calculatedReceiptStatus(lines: Array<{ quantity: number; quantity_received: number }>): OrderStatus {
  if (lines.every((line) => line.quantity_received >= line.quantity)) return 'received'
  if (lines.some((line) => line.quantity_received > 0)) return 'partially_received'
  return 'shipped'
}

async function receiveOrder(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const orderId = requiredId(body.id, 'id')
  const receiptLines = parseReceiptInputs(body.items)
  const order = await tx.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, locationId: true,
      purchase_order_items: { select: { id: true, itemId: true, quantity: true, quantity_received: true, allocations: { select: { id: true, locationId: true, quantity: true, quantity_received: true } } } },
    },
  })
  if (!order) throw new ApiError(404, 'Order not found.')
  if (order.status === 'cancelled' || order.status === 'received') throw new ApiError(409, 'This order is closed and cannot receive stock.')

  const linesById = new Map(order.purchase_order_items.map((line) => [line.id, line]))
  const receivedByLine = new Map<string, number>()
  for (const receipt of receiptLines) {
    const line = linesById.get(receipt.orderItemId)
    if (!line) throw new ApiError(400, 'A receipt line does not belong to this order.')
    if (receipt.allocationId) {
      const allocation = line.allocations.find((entry) => entry.id === receipt.allocationId)
      if (!allocation || allocation.locationId !== receipt.locationId) throw new ApiError(400, 'A receipt allocation does not belong to this order line.')
      if (receipt.quantity > allocation.quantity - allocation.quantity_received) throw new ApiError(409, 'Receipt quantity exceeds the allocation remaining to receive.')
      await changeStock(tx, line.itemId, receipt.locationId, receipt.quantity)
      await tx.purchaseOrderAllocation.update({ where: { id: allocation.id }, data: { quantity_received: { increment: receipt.quantity } } })
    } else {
      if (line.allocations.length > 0 || receipt.locationId !== order.locationId) throw new ApiError(400, 'Receipt allocation details are required for this order line.')
      if (receipt.quantity > line.quantity - line.quantity_received) throw new ApiError(409, 'Receipt quantity exceeds the line remaining to receive.')
      await changeStock(tx, line.itemId, receipt.locationId, receipt.quantity)
    }
    receivedByLine.set(line.id, (receivedByLine.get(line.id) ?? 0) + receipt.quantity)
  }

  for (const [lineId, quantity] of receivedByLine) {
    await tx.purchaseOrderItem.update({ where: { id: lineId }, data: { quantity_received: { increment: quantity } } })
  }
  const refreshedLines = await tx.purchaseOrderItem.findMany({ where: { order_id: orderId }, select: { quantity: true, quantity_received: true } })
  const status = calculatedReceiptStatus(refreshedLines)
  await tx.purchaseOrder.update({ where: { id: orderId }, data: { status } })
  await writeActivityLog({
    action: 'receive', entityType: 'purchase_order', entityId: orderId, entityName: `Order #${orderId.slice(0, 8)}`,
    details: `Received ${receiptLines.map((line) => `${line.quantity} unit(s)`).join(', ')} into stock; order status is now ${status}.`,
    user: actor, request, source: 'server', client: tx,
  })
  return { id: orderId, status }
}

async function adjustReceipts(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const orderId = requiredId(body.id, 'id')
  const receiptLines = parseReceiptInputs(body.items, true)
  const order = await tx.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, locationId: true,
      purchase_order_items: { select: { id: true, itemId: true, quantity: true, quantity_received: true, allocations: { select: { id: true, locationId: true, quantity: true, quantity_received: true } } } },
    },
  })
  if (!order) throw new ApiError(404, 'Order not found.')
  if (order.status === 'cancelled') throw new ApiError(409, 'Cancelled orders retain their receipt history and cannot be adjusted.')

  const linesById = new Map(order.purchase_order_items.map((line) => [line.id, line]))
  const touchedLineIds = new Set<string>()
  for (const receipt of receiptLines) {
    const line = linesById.get(receipt.orderItemId)
    if (!line) throw new ApiError(400, 'A receipt line does not belong to this order.')
    if (receipt.allocationId) {
      const allocation = line.allocations.find((entry) => entry.id === receipt.allocationId)
      if (!allocation || allocation.locationId !== receipt.locationId) throw new ApiError(400, 'A receipt allocation does not belong to this order line.')
      if (receipt.quantity > allocation.quantity) throw new ApiError(409, 'Receipt quantity cannot exceed its ordered allocation.')
      const delta = receipt.quantity - allocation.quantity_received
      await changeStock(tx, line.itemId, receipt.locationId, delta)
      await tx.purchaseOrderAllocation.update({ where: { id: allocation.id }, data: { quantity_received: receipt.quantity } })
    } else {
      if (line.allocations.length > 0 || receipt.locationId !== order.locationId) throw new ApiError(400, 'Receipt allocation details are required for this order line.')
      if (receipt.quantity > line.quantity) throw new ApiError(409, 'Receipt quantity cannot exceed the ordered quantity.')
      const delta = receipt.quantity - line.quantity_received
      await changeStock(tx, line.itemId, receipt.locationId, delta)
      await tx.purchaseOrderItem.update({ where: { id: line.id }, data: { quantity_received: receipt.quantity } })
    }
    touchedLineIds.add(line.id)
  }

  for (const lineId of touchedLineIds) {
    const original = linesById.get(lineId)!
    if (original.allocations.length === 0) continue
    const allocations = await tx.purchaseOrderAllocation.findMany({ where: { orderItemId: lineId }, select: { quantity_received: true } })
    await tx.purchaseOrderItem.update({ where: { id: lineId }, data: { quantity_received: allocations.reduce((sum, allocation) => sum + allocation.quantity_received, 0) } })
  }

  const refreshedLines = await tx.purchaseOrderItem.findMany({ where: { order_id: orderId }, select: { quantity: true, quantity_received: true } })
  const status = calculatedReceiptStatus(refreshedLines)
  await tx.purchaseOrder.update({ where: { id: orderId }, data: { status } })
  await writeActivityLog({
    action: 'update', entityType: 'purchase_order', entityId: orderId, entityName: `Order #${orderId.slice(0, 8)}`,
    details: `Adjusted immutable receipt quantities without deleting stock rows; order status is now ${status}.`,
    user: actor, request, source: 'server', client: tx,
  })
  return { id: orderId, status }
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request)
  if (actor instanceof NextResponse) return actor

  try {
    const body = await request.json() as Record<string, unknown>
    const action = body.action as OrderAction
    const data = await runSerializableTransaction(async (tx) => {
      if (action === 'create') return createOrder(tx, request, actor, body)
      if (action === 'update') return updateOrder(tx, request, actor, body)
      if (action === 'receive') return receiveOrder(tx, request, actor, body)
      if (action === 'adjustReceipts') return adjustReceipts(tx, request, actor, body)
      if (action === 'status' || action === 'cancel') {
        const orderId = requiredId(body.id, 'id')
        return updateOrderStatus(tx, request, actor, orderId, action === 'cancel' ? 'cancelled' : orderStatus(body.status))
      }
      throw new ApiError(400, 'Unsupported order action.')
    })
    return NextResponse.json({ data })
  } catch (error) {
    return errorResponse(error, 'Unable to save the purchase order.')
  }
}
