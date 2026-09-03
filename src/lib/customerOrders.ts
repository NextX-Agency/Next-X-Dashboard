import { createHash } from 'crypto'
import type { Prisma } from '@prisma/client'
import type { Currency } from '@/lib/currency'
import { getSellingPrice, normalizeExchangeRate, roundCurrencyAmount } from '@/lib/pricing'

type OrderTransactionClient = Prisma.TransactionClient

export class CustomerOrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export const ORDER_CHANNELS = ['webshop_audio', 'webshop_watches', 'counter'] as const
export type OrderChannel = (typeof ORDER_CHANNELS)[number]

export const ORDER_STATUSES = [
  'new',
  'confirmed',
  'reserved',
  'fulfilled',
  'invoiced',
  'cancelled',
  'expired',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * Status may only move forward. An order that has become a sale, or that was
 * cancelled, is finished: the sale is voided through the sales route, never by
 * walking this order backwards.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['reserved', 'fulfilled', 'invoiced', 'cancelled'],
  reserved: ['fulfilled', 'invoiced', 'cancelled'],
  fulfilled: ['invoiced', 'cancelled'],
  invoiced: [],
  cancelled: [],
  expired: [],
}

export function canTransition(from: string, to: OrderStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from as OrderStatus]
  return Array.isArray(allowed) && allowed.includes(to)
}

export function assertTransition(from: string, to: OrderStatus) {
  if (!canTransition(from, to)) {
    throw new CustomerOrderError(`An order that is ${from} cannot become ${to}.`, 409)
  }
}

/** A status where the order is still holding stock. */
export const STATUSES_HOLDING_STOCK: OrderStatus[] = ['confirmed', 'reserved']

// ---------------------------------------------------------------------------
// Input parsing — everything below distrusts the caller completely, because the
// shop endpoint is reachable without a session.
// ---------------------------------------------------------------------------

export const MAX_ORDER_LINES = 25
export const MAX_LINE_QUANTITY = 50

export function parseChannel(value: unknown): OrderChannel {
  if (typeof value === 'string' && (ORDER_CHANNELS as readonly string[]).includes(value)) {
    return value as OrderChannel
  }
  throw new CustomerOrderError('Unknown shop channel.')
}

export function parseOrderCurrency(value: unknown): Currency {
  if (value === 'SRD' || value === 'USD') return value
  throw new CustomerOrderError('Currency must be SRD or USD.')
}

export function parseOrderQuantity(value: unknown): number {
  const quantity = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new CustomerOrderError('Each line needs a whole quantity of at least one.')
  }
  if (quantity > MAX_LINE_QUANTITY) {
    throw new CustomerOrderError(`A single line cannot exceed ${MAX_LINE_QUANTITY} units.`)
  }
  return quantity
}

export function parseOrderText(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

/**
 * Reduce a phone number to digits so the same customer is recognised whether
 * they typed `+597 8123456`, `08123456` or `597-812-3456`. Surinamese numbers
 * are stored with the country code stripped when present.
 */
export function normalizePhone(value: unknown): string | null {
  const raw = parseOrderText(value, 40)
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('597') && digits.length > 7) digits = digits.slice(3)
  digits = digits.replace(/^0+/, '')
  return digits.length >= 6 ? digits : null
}

export function parsePickupDate(value: unknown): Date | null {
  const raw = parseOrderText(value, 32)
  if (!raw) return null
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(raw)
  if (!match) return null
  const date = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return null
  return date
}

/** A coarse, non-reversible caller fingerprint for abuse limiting. */
export function hashSourceIp(ip: string | null): string | null {
  if (!ip) return null
  return createHash('sha256').update(`nextx-shop-order:${ip}`).digest('hex').slice(0, 32)
}

export interface RequestedOrderLine {
  itemId: string
  quantity: number
}

export function parseOrderLines(value: unknown): RequestedOrderLine[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CustomerOrderError('Add at least one product to the order.')
  }
  if (value.length > MAX_ORDER_LINES) {
    throw new CustomerOrderError(`An order cannot hold more than ${MAX_ORDER_LINES} different products.`)
  }

  const byItem = new Map<string, number>()
  for (const entry of value) {
    const line = entry as Record<string, unknown>
    const itemId = typeof line?.itemId === 'string' ? line.itemId.trim() : ''
    if (!itemId) throw new CustomerOrderError('Every line needs a product.')
    const quantity = parseOrderQuantity(line?.quantity)
    // Merge duplicates rather than rejecting: a customer who added the same
    // product twice meant to buy more of it.
    byItem.set(itemId, Math.min((byItem.get(itemId) ?? 0) + quantity, MAX_LINE_QUANTITY))
  }

  return [...byItem.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PricedOrderLine {
  itemId: string
  itemName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

/**
 * Price the order from the database, never from the browser.
 *
 * The cart sends product ids and quantities only. Whatever price the page was
 * showing is irrelevant — a stale tab, an edited request or a changed price
 * list must not decide what the customer is charged.
 */
export async function priceOrderLines(
  tx: OrderTransactionClient,
  requested: RequestedOrderLine[],
  currency: Currency,
  exchangeRate: number,
): Promise<{ lines: PricedOrderLine[]; totalAmount: number }> {
  const itemIds = requested.map((line) => line.itemId)
  const items = await tx.item.findMany({
    where: { id: { in: itemIds }, deletedAt: null, isPublic: true },
    select: { id: true, name: true, sellingPriceSrd: true, sellingPriceUsd: true },
  })
  const itemsById = new Map(items.map((item) => [item.id, item]))

  const lines: PricedOrderLine[] = []
  for (const line of requested) {
    const item = itemsById.get(line.itemId)
    if (!item) {
      throw new CustomerOrderError('A product on this order is no longer available.', 409)
    }

    const unitPrice = getSellingPrice(
      {
        selling_price_srd: item.sellingPriceSrd === null ? null : Number(item.sellingPriceSrd),
        selling_price_usd: item.sellingPriceUsd === null ? null : Number(item.sellingPriceUsd),
      },
      currency,
      exchangeRate,
    )

    if (!(unitPrice > 0)) {
      throw new CustomerOrderError(`${item.name} has no price set. Please contact the shop.`, 409)
    }

    lines.push({
      itemId: item.id,
      itemName: item.name,
      quantity: line.quantity,
      unitPrice: roundCurrencyAmount(unitPrice),
      subtotal: roundCurrencyAmount(unitPrice * line.quantity),
    })
  }

  const totalAmount = roundCurrencyAmount(lines.reduce((sum, line) => sum + line.subtotal, 0))
  return { lines, totalAmount }
}

export async function resolveActiveExchangeRate(tx: OrderTransactionClient): Promise<number> {
  const rate = await tx.exchangeRate.findFirst({
    where: { isActive: true },
    orderBy: { setAt: 'desc' },
    select: { usdToSrd: true },
  })
  return normalizeExchangeRate(rate ? Number(rate.usdToSrd) : undefined)
}

// ---------------------------------------------------------------------------
// Customer identity
// ---------------------------------------------------------------------------

/**
 * Find the customer behind this order, or create them.
 *
 * Matching on the normalised phone number is what turns a stream of anonymous
 * webshop orders into a purchase history. When no usable phone is given the
 * order simply carries the typed name and no client link, rather than creating
 * a duplicate customer record on every order.
 */
export async function upsertOrderClient(
  tx: OrderTransactionClient,
  input: { name: string | null; phone: string | null; email: string | null; locationId: string | null },
): Promise<string | null> {
  if (!input.phone) return null

  const existing = await tx.client.findFirst({
    where: { phone: input.phone },
    select: { id: true, name: true, email: true },
  })

  if (existing) {
    // Fill blanks only. A customer who once gave their full name should not
    // lose it because a later order was placed with just a first name.
    const patch: Prisma.ClientUpdateInput = {}
    if (!existing.email && input.email) patch.email = input.email
    if (Object.keys(patch).length > 0) {
      await tx.client.update({ where: { id: existing.id }, data: patch })
    }
    return existing.id
  }

  const created = await tx.client.create({
    data: {
      name: input.name ?? `Webshop customer ${input.phone.slice(-4)}`,
      phone: input.phone,
      email: input.email,
      location_id: input.locationId,
      notes: 'Created automatically from a webshop order.',
    },
    select: { id: true },
  })
  return created.id
}

// ---------------------------------------------------------------------------
// Stock holds
// ---------------------------------------------------------------------------

export interface StockHoldLine {
  itemId: string
  quantity: number
}

/**
 * Hold stock for a confirmed order.
 *
 * Uses atomic increments under the transaction's lock so two staff confirming
 * two orders for the last unit cannot both succeed. The database's
 * `stock_reserved_not_over_quantity` constraint is the final backstop.
 */
export async function holdStockForOrder(
  tx: OrderTransactionClient,
  locationId: string,
  lines: StockHoldLine[],
) {
  for (const line of lines) {
    const stock = await tx.stock.findFirst({
      where: { itemId: line.itemId, locationId },
      select: { id: true, quantity: true, reservedQuantity: true },
    })
    if (!stock) {
      throw new CustomerOrderError('This location does not stock one of the ordered products.', 409)
    }
    const available = stock.quantity - stock.reservedQuantity
    if (available < line.quantity) {
      throw new CustomerOrderError(
        `Only ${Math.max(available, 0)} unit(s) are still available at this location.`,
        409,
      )
    }
    await tx.stock.update({
      where: { id: stock.id },
      data: { reservedQuantity: { increment: line.quantity } },
    })
  }
}

/** Give held stock back. Never lets a release drive the hold below zero. */
export async function releaseStockForOrder(
  tx: OrderTransactionClient,
  locationId: string,
  lines: StockHoldLine[],
) {
  for (const line of lines) {
    const stock = await tx.stock.findFirst({
      where: { itemId: line.itemId, locationId },
      select: { id: true, reservedQuantity: true },
    })
    if (!stock) continue
    const release = Math.min(line.quantity, stock.reservedQuantity)
    if (release <= 0) continue
    await tx.stock.update({
      where: { id: stock.id },
      data: { reservedQuantity: { decrement: release } },
    })
  }
}
