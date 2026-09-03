import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'
import { postSale } from '@/lib/salePosting'
import { parseCurrency, SaleValidationError } from '@/lib/saleCreation'
import {
  assertTransition,
  CustomerOrderError,
  holdStockForOrder,
  parseOrderText,
  releaseStockForOrder,
  STATUSES_HOLDING_STOCK,
  type OrderStatus,
} from '@/lib/customerOrders'

/**
 * The sales order desk.
 *
 * `/orders` used to be the *purchase* order desk, which meant the system had no
 * name for a customer's order at all — and two different things called
 * "orders" in conversation. Purchasing now lives at `/api/purchasing`; this
 * route owns customer orders: what the webshop captured, and turning one into a
 * sale without anybody retyping it.
 *
 * Money rules that hold here:
 *
 *  - Confirming an order moves no money. It only holds stock.
 *  - Converting an order writes the sale through `postSale`, the same single
 *    money path the sales desk uses, inside one Serializable transaction that
 *    also closes the order. Both, or neither.
 *  - An order is never deleted. It is cancelled with a reason, and its held
 *    stock is released.
 */

const PAGE_SIZE = 100

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(`A ${label} is required.`)
  return value.trim()
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const ORDER_INCLUDE = {
  items: {
    include: { item: { select: { id: true, name: true, brand: true, imageUrl: true } } },
    orderBy: { createdAt: 'asc' },
  },
  client: { select: { id: true, name: true, phone: true, email: true } },
  location: { select: { id: true, name: true } },
  sale: { select: { id: true, invoiceNumber: true, createdAt: true } },
} satisfies Prisma.CustomerOrderInclude

type OrderRow = Prisma.CustomerOrderGetPayload<{ include: typeof ORDER_INCLUDE }>

function mapOrder(order: OrderRow) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    channel: order.channel,
    currency: order.currency,
    exchangeRate: order.exchangeRate === null ? null : toNumber(order.exchangeRate),
    totalAmount: toNumber(order.totalAmount),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerNotes: order.customerNotes,
    pickupDate: order.pickupDate ? order.pickupDate.toISOString().slice(0, 10) : null,
    stockReserved: order.stockReserved,
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    client: order.client,
    location: order.location,
    sale: order.sale
      ? {
          id: order.sale.id,
          invoiceNumber: order.sale.invoiceNumber,
          createdAt: order.sale.createdAt.toISOString(),
        }
      : null,
    items: order.items.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      name: line.item.name,
      brand: line.item.brand,
      imageUrl: line.item.imageUrl,
      quantity: line.quantity,
      unitPrice: toNumber(line.unitPrice),
      subtotal: toNumber(line.subtotal),
    })),
  }
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const params = request.nextUrl.searchParams
    const status = parseOrderText(params.get('status'), 32)
    const channel = parseOrderText(params.get('channel'), 32)

    const where: Prisma.CustomerOrderWhereInput = {}
    if (status && status !== 'all') where.status = status
    if (channel && channel !== 'all') where.channel = channel

    const [orders, openCount, awaitingConversion] = await Promise.all([
      prisma.customerOrder.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
      }),
      prisma.customerOrder.count({ where: { status: 'new' } }),
      prisma.customerOrder.count({ where: { status: { in: STATUSES_HOLDING_STOCK } } }),
    ])

    return NextResponse.json({
      data: {
        orders: orders.map(mapOrder),
        stats: { openCount, awaitingConversion },
      },
    })
  } catch (error) {
    console.error('Order desk read failed', error)
    return NextResponse.json({ error: 'Unable to load orders.' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

async function loadOrderForWrite(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.customerOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, orderNumber: true, status: true, locationId: true, currency: true,
      clientId: true, customerName: true, customerNotes: true, stockReserved: true,
      items: { select: { itemId: true, quantity: true } },
    },
  })
  if (!order) throw new ApiError('Order not found.', 404)
  return order
}

/** Confirm an order: hold the stock, move no money. */
async function confirmOrder(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const orderId = requiredId(body.id, 'order id')
  const order = await loadOrderForWrite(tx, orderId)
  assertTransition(order.status, 'confirmed')

  const locationId = parseOrderText(body.locationId, 64) ?? order.locationId
  if (!locationId) {
    throw new ApiError('Choose the location that will fulfil this order.', 400)
  }

  if (!order.stockReserved) {
    await holdStockForOrder(tx, locationId, order.items)
  }

  await tx.customerOrder.update({
    where: { id: orderId },
    data: {
      status: 'confirmed',
      locationId,
      stockReserved: true,
      confirmedAt: new Date(),
      confirmedBy: actor.id,
    },
  })

  await writeActivityLog({
    action: 'update',
    entityType: 'customer_order',
    entityId: orderId,
    entityName: order.orderNumber,
    details: `Confirmed ${order.orderNumber} and held stock for ${order.items.length} line(s). No money moved.`,
    user: actor,
    request,
    source: 'order-desk',
    client: tx,
  })

  return { id: orderId, status: 'confirmed' }
}

/** Cancel an order and give its held stock back. Never deletes. */
async function cancelOrder(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const orderId = requiredId(body.id, 'order id')
  const reason = parseOrderText(body.reason, 500)
  if (!reason || reason.length < 3) {
    throw new ApiError('Give a reason for cancelling this order (at least 3 characters).', 400)
  }

  const order = await loadOrderForWrite(tx, orderId)
  assertTransition(order.status, 'cancelled')

  if (order.stockReserved && order.locationId) {
    await releaseStockForOrder(tx, order.locationId, order.items)
  }

  await tx.customerOrder.update({
    where: { id: orderId },
    data: {
      status: 'cancelled',
      stockReserved: false,
      cancelledAt: new Date(),
      cancelledBy: actor.id,
      cancelReason: reason,
    },
  })

  await writeActivityLog({
    action: 'update',
    entityType: 'customer_order',
    entityId: orderId,
    entityName: order.orderNumber,
    details: `Cancelled ${order.orderNumber}: ${reason}. Held stock was released; the order is retained.`,
    user: actor,
    request,
    source: 'order-desk',
    client: tx,
  })

  return { id: orderId, status: 'cancelled' }
}

/**
 * Turn the order into a posted sale — the step that used to be a human
 * retyping a WhatsApp message into the sales desk.
 *
 * The stock hold is released first so `postSale`'s own decrement sees the real
 * availability; both happen inside this one Serializable transaction, so the
 * hold can never be released without the sale being written.
 */
async function convertOrder(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const orderId = requiredId(body.id, 'order id')
  const order = await loadOrderForWrite(tx, orderId)
  assertTransition(order.status, 'invoiced')

  const locationId = parseOrderText(body.locationId, 64) ?? order.locationId
  if (!locationId) throw new ApiError('Choose the location that fulfilled this order.', 400)

  const paymentMethod = body.paymentMethod === 'bank' ? 'bank' : 'cash'
  const sellerId = parseOrderText(body.sellerId, 64)

  if (order.stockReserved) {
    await releaseStockForOrder(tx, order.locationId ?? locationId, order.items)
  }

  const sale = await postSale(
    tx,
    {
      locationId,
      currency: parseCurrency(order.currency),
      paymentMethod,
      sellerId,
      items: order.items.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
      combos: [],
      clientId: order.clientId,
      notes: `Converted from customer order ${order.orderNumber}`,
    },
    actor,
    request,
    'order-desk',
  )

  await tx.customerOrder.update({
    where: { id: orderId },
    data: { status: 'invoiced', locationId, stockReserved: false, saleId: sale.saleId },
  })

  await writeActivityLog({
    action: 'update',
    entityType: 'customer_order',
    entityId: orderId,
    entityName: order.orderNumber,
    details: `Converted ${order.orderNumber} into sale ${sale.invoiceNumber} without retyping any line.`,
    user: actor,
    request,
    source: 'order-desk',
    client: tx,
  })

  return { id: orderId, status: 'invoiced', sale }
}

/** Move an order along its lifecycle without money or stock consequences. */
async function updateOrderStatus(
  tx: Prisma.TransactionClient,
  request: NextRequest,
  actor: { id: string; email: string; name: string | null; role: string },
  body: Record<string, unknown>,
) {
  const orderId = requiredId(body.id, 'order id')
  const requested = parseOrderText(body.status, 32) as OrderStatus | null
  if (requested !== 'reserved' && requested !== 'fulfilled' && requested !== 'expired') {
    throw new ApiError('Only reserved, fulfilled and expired can be set directly.', 400)
  }

  const order = await loadOrderForWrite(tx, orderId)
  assertTransition(order.status, requested)

  // An expiring order was never fulfilled, so anything it held goes back.
  if (requested === 'expired' && order.stockReserved && order.locationId) {
    await releaseStockForOrder(tx, order.locationId, order.items)
  }

  await tx.customerOrder.update({
    where: { id: orderId },
    data: {
      status: requested,
      ...(requested === 'expired' ? { stockReserved: false } : {}),
    },
  })

  await writeActivityLog({
    action: 'update',
    entityType: 'customer_order',
    entityId: orderId,
    entityName: order.orderNumber,
    details: `Order ${order.orderNumber} is now ${requested}.`,
    user: actor,
    request,
    source: 'order-desk',
    client: tx,
  })

  return { id: orderId, status: requested }
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''

  try {
    const result = await runSerializableTransaction(async (tx) => {
      if (action === 'confirm') return confirmOrder(tx, request, user, body)
      if (action === 'cancel') return cancelOrder(tx, request, user, body)
      if (action === 'convert') return convertOrder(tx, request, user, body)
      if (action === 'status') return updateOrderStatus(tx, request, user, body)
      throw new ApiError(`Unknown order action: ${action || '(none)'}`, 400)
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof CustomerOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof SaleValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Order desk write failed', error)
    return NextResponse.json({ error: 'Nothing was changed.' }, { status: 500 })
  }
}
