import { NextRequest, NextResponse } from 'next/server'

import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { allocateInvoiceNumber } from '@/lib/saleCreation'
import {
  CustomerOrderError,
  hashSourceIp,
  normalizePhone,
  parseChannel,
  parseOrderCurrency,
  parseOrderLines,
  parseOrderText,
  parsePickupDate,
  priceOrderLines,
  resolveActiveExchangeRate,
  upsertOrderClient,
} from '@/lib/customerOrders'

/**
 * Capture a webshop order.
 *
 * This is the endpoint the shop never had. Until now the cart built a WhatsApp
 * message, opened wa.me and cleared itself, so an order existed only inside a
 * chat thread: nothing to search, nothing to count, nothing to convert, and a
 * staff member retyping every line into the sales desk by hand.
 *
 * Deliberately unauthenticated — customers do not have accounts — and therefore
 * deliberately distrustful:
 *
 *  - prices come from the database, never from the request body;
 *  - the body may only carry product ids, quantities and contact details;
 *  - line count, quantity and text length are capped;
 *  - a per-caller hourly cap limits automated abuse.
 *
 * It writes **no financial row**. An order is a promise, not money: no wallet
 * moves, no ledger entry, no commission, no stock decrement. All of that
 * happens later, once and atomically, when an admin converts the order into a
 * sale through the authenticated sales path.
 */

const MAX_ORDERS_PER_IP_PER_HOUR = 10

function callerIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 })
  }

  try {
    const channel = parseChannel(body.channel)
    const currency = parseOrderCurrency(body.currency)
    const requestedLines = parseOrderLines(body.items)
    const customerName = parseOrderText(body.customerName, 120)
    const customerPhone = normalizePhone(body.customerPhone)
    const customerEmail = parseOrderText(body.customerEmail, 160)
    const customerNotes = parseOrderText(body.customerNotes, 1000)
    const pickupDate = parsePickupDate(body.pickupDate)
    const requestedLocationId = parseOrderText(body.locationId, 64)
    const sourceIpHash = hashSourceIp(callerIp(request))

    const result = await runSerializableTransaction(async (tx) => {
      if (sourceIpHash) {
        const recent = await tx.customerOrder.count({
          where: {
            sourceIpHash,
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        })
        if (recent >= MAX_ORDERS_PER_IP_PER_HOUR) {
          throw new CustomerOrderError(
            'Too many orders from this device in the last hour. Please contact the shop directly.',
            429,
          )
        }
      }

      const company = await tx.company.findFirst({ select: { id: true } })
      if (!company) {
        throw new CustomerOrderError('The shop is not configured to take orders yet.', 503)
      }

      // A pickup location is a preference, not a commitment: an unknown or
      // inactive one is dropped rather than failing the customer's order.
      let locationId: string | null = null
      if (requestedLocationId) {
        const location = await tx.location.findFirst({
          where: { id: requestedLocationId, is_active: true },
          select: { id: true },
        })
        locationId = location?.id ?? null
      }

      const exchangeRate = await resolveActiveExchangeRate(tx)
      const { lines, totalAmount } = await priceOrderLines(tx, requestedLines, currency, exchangeRate)

      const clientId = await upsertOrderClient(tx, {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        locationId,
      })

      const orderNumber = await allocateInvoiceNumber(tx, 'WEB')

      const order = await tx.customerOrder.create({
        data: {
          orderNumber,
          companyId: company.id,
          clientId,
          locationId,
          channel,
          status: 'new',
          currency,
          exchangeRate,
          totalAmount,
          customerName,
          customerPhone,
          customerEmail,
          customerNotes,
          pickupDate,
          sourceIpHash,
          items: {
            create: lines.map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
            })),
          },
        },
        select: { id: true, orderNumber: true, totalAmount: true, currency: true },
      })

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        currency: order.currency,
        totalAmount: Number(order.totalAmount),
        lines: lines.map((line) => ({
          itemId: line.itemId,
          name: line.itemName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
        })),
      }
    })

    return NextResponse.json({ order: result }, { status: 201 })
  } catch (error) {
    if (error instanceof CustomerOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Failed to capture a shop order', error)
    return NextResponse.json(
      { error: 'We could not save your order. Please send it on WhatsApp instead.' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export const dynamic = 'force-dynamic'
