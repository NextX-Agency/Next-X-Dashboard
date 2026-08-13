import { Prisma } from '@prisma/client'
import { getSellingPrice, normalizeExchangeRate, roundCurrencyAmount } from '@/lib/pricing'
import type { Currency } from '@/lib/currency'

/**
 * Sale creation, extracted from the browser.
 *
 * `src/app/sales/page.tsx` used to issue ~8 sequential Supabase writes with a
 * rollback that only deleted the sale header — which is why four sale headers in
 * production have no line items, and why concurrent sales could silently
 * overwrite a wallet balance. Everything here runs inside one Serializable
 * transaction owned by the route (F-02, F-03).
 *
 * The pure functions are exported so the arithmetic can be tested without a
 * database. Nothing in this file opens a transaction or talks to Prisma
 * directly except through the client it is handed.
 */

export type SaleCurrency = Extract<Currency, 'SRD' | 'USD'>

export interface SaleLineInput {
  itemId: string
  quantity: number
  /** Only honoured when the item carries `allow_custom_price`. */
  customPrice?: number | null
  discountReason?: string | null
}

export interface SaleComboInput {
  name: string
  comboPrice: number
  items: Array<{ itemId: string; quantity: number }>
}

export interface CreateSaleInput {
  locationId: string
  currency: SaleCurrency
  paymentMethod: string
  sellerId?: string | null
  items: SaleLineInput[]
  combos: SaleComboInput[]
}

/** A resolved line ready to be written to `sale_items`. */
export interface ResolvedSaleLine {
  itemId: string
  itemName: string
  categoryId: string | null
  /** Cost at the moment of sale, frozen onto the line (T-12). */
  unitCostUsd: number
  quantity: number
  unitPrice: number
  subtotal: number
  isCustomPrice: boolean
  originalPrice: number | null
  discountReason: string | null
  /** Set for combo members, so commission is grouped per combo rather than per category. */
  comboKey: string | null
}

export class SaleValidationError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SaleValidationError(message)
}

export function parseCurrency(value: unknown): SaleCurrency {
  assert(value === 'SRD' || value === 'USD', 'Currency must be SRD or USD.')
  return value
}

export function parseQuantity(value: unknown, label = 'quantity'): number {
  const quantity = Number.parseInt(String(value ?? ''), 10)
  assert(Number.isInteger(quantity) && quantity > 0, `Each ${label} must be a whole number greater than zero.`)
  return quantity
}

export function parsePositiveAmount(value: unknown, label: string): number {
  const amount = Number(value)
  assert(Number.isFinite(amount) && amount > 0, `${label} must be a positive number.`)
  return roundCurrencyAmount(amount)
}

/**
 * Split a combo's agreed price across its member lines.
 *
 * The old client computed each member's share independently, so rounding could
 * leave the sum of the lines a cent or two away from the combo price — one of
 * the ways a sale header ends up disagreeing with its line items (T-09). The
 * final line absorbs the remainder here, so the parts always add back to the
 * whole exactly.
 */
export function splitComboPrice(comboPrice: number, quantities: number[]): number[] {
  const totalQuantity = quantities.reduce((sum, quantity) => sum + quantity, 0)
  assert(totalQuantity > 0, 'A combo needs at least one product.')

  const target = roundCurrencyAmount(comboPrice)
  const shares = quantities.map((quantity) => roundCurrencyAmount((target * quantity) / totalQuantity))
  const allocated = roundCurrencyAmount(shares.reduce((sum, share) => sum + share, 0))
  const remainder = roundCurrencyAmount(target - allocated)

  if (remainder !== 0 && shares.length > 0) {
    shares[shares.length - 1] = roundCurrencyAmount(shares[shares.length - 1] + remainder)
  }
  return shares
}

/**
 * Commission rate for a seller in a category: the category-specific rate if one
 * exists, else the seller's own rate, else the location's. Mirrors what the
 * browser used to work out across several round trips.
 */
export function resolveCommissionRate(
  categoryId: string | null,
  categoryRates: Map<string, number>,
  sellerRate: number,
  locationRate: number,
): number {
  if (categoryId) {
    const categoryRate = categoryRates.get(categoryId)
    if (categoryRate !== undefined) return categoryRate
  }
  if (sellerRate > 0) return sellerRate
  return locationRate
}

export interface CommissionDraft {
  categoryId: string | null
  rate: number
  amount: number
  basis: number
  label: string
}

/**
 * One commission per category for loose items, and one per combo — combos are
 * priced as a bundle, so splitting them across their members' categories would
 * invent a rate that was never agreed.
 */
export function buildCommissions(
  lines: ResolvedSaleLine[],
  categoryRates: Map<string, number>,
  sellerRate: number,
  locationRate: number,
): CommissionDraft[] {
  const drafts: CommissionDraft[] = []
  const looseByCategory = new Map<string | null, ResolvedSaleLine[]>()
  const comboGroups = new Map<string, ResolvedSaleLine[]>()

  for (const line of lines) {
    if (line.comboKey) {
      const group = comboGroups.get(line.comboKey) ?? []
      group.push(line)
      comboGroups.set(line.comboKey, group)
    } else {
      const group = looseByCategory.get(line.categoryId) ?? []
      group.push(line)
      looseByCategory.set(line.categoryId, group)
    }
  }

  for (const [categoryId, group] of looseByCategory) {
    const rate = resolveCommissionRate(categoryId, categoryRates, sellerRate, locationRate)
    const basis = roundCurrencyAmount(group.reduce((sum, line) => sum + line.subtotal, 0))
    const amount = roundCurrencyAmount(basis * (rate / 100))
    if (amount > 0) drafts.push({ categoryId, rate, amount, basis, label: 'items' })
  }

  for (const [comboKey, group] of comboGroups) {
    // The first member's category sets the rate, as the previous implementation did.
    const rate = resolveCommissionRate(group[0]?.categoryId ?? null, categoryRates, sellerRate, locationRate)
    const basis = roundCurrencyAmount(group.reduce((sum, line) => sum + line.subtotal, 0))
    const amount = roundCurrencyAmount(basis * (rate / 100))
    if (amount > 0) drafts.push({ categoryId: null, rate, amount, basis, label: `combo ${comboKey}` })
  }

  return drafts
}

type SaleTransactionClient = Prisma.TransactionClient

interface ItemRecord {
  id: string
  name: string
  categoryId: string | null
  purchasePriceUsd: Prisma.Decimal
  sellingPriceSrd: Prisma.Decimal | null
  sellingPriceUsd: Prisma.Decimal | null
  allow_custom_price: boolean | null
  is_combo: boolean | null
}

/**
 * Resolve every requested line against the database: the item must exist, be
 * sellable, have a price in the sale currency, and have enough stock at this
 * location. Prices come from the database, never from the request — the only
 * client-supplied figure accepted is a custom price on an item explicitly
 * flagged `allow_custom_price`, and then only with a reason.
 */
export async function resolveSaleLines(
  tx: SaleTransactionClient,
  input: CreateSaleInput,
  exchangeRate: number,
): Promise<{ lines: ResolvedSaleLine[]; stockByItemId: Map<string, { id: string; quantity: number }> }> {
  const requestedIds = [
    ...input.items.map((line) => line.itemId),
    ...input.combos.flatMap((combo) => combo.items.map((line) => line.itemId)),
  ]
  assert(requestedIds.length > 0, 'A sale needs at least one product.')

  const uniqueIds = [...new Set(requestedIds)]
  const [items, stocks] = await Promise.all([
    tx.item.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: {
        id: true, name: true, categoryId: true, sellingPriceSrd: true,
        sellingPriceUsd: true, allow_custom_price: true, is_combo: true,
        purchasePriceUsd: true,
      },
    }),
    tx.stock.findMany({
      where: { locationId: input.locationId, itemId: { in: uniqueIds } },
      select: { id: true, itemId: true, quantity: true },
    }),
  ])

  const itemsById = new Map<string, ItemRecord>(items.map((item) => [item.id, item]))
  const stockByItemId = new Map(stocks.map((stock) => [stock.itemId, { id: stock.id, quantity: stock.quantity }]))
  const lines: ResolvedSaleLine[] = []

  const priceOf = (item: ItemRecord) => getSellingPrice(
    {
      selling_price_srd: item.sellingPriceSrd === null ? null : Number(item.sellingPriceSrd),
      selling_price_usd: item.sellingPriceUsd === null ? null : Number(item.sellingPriceUsd),
    },
    input.currency,
    exchangeRate,
  )

  for (const requested of input.items) {
    const item = itemsById.get(requested.itemId)
    assert(item, 'One or more selected products are unavailable.')
    assert(!item.is_combo, `${item.name} is a combo product and cannot be sold as a loose line.`)

    const listPrice = priceOf(item)
    const hasCustomPrice = requested.customPrice !== undefined && requested.customPrice !== null
    if (hasCustomPrice) {
      assert(item.allow_custom_price === true, `${item.name} does not allow a custom price.`)
    }
    const unitPrice = hasCustomPrice ? parsePositiveAmount(requested.customPrice, `Custom price for ${item.name}`) : listPrice
    assert(unitPrice > 0, `${item.name} has no valid ${input.currency} selling price.`)

    const discountReason = typeof requested.discountReason === 'string' ? requested.discountReason.trim() : ''
    if (hasCustomPrice && unitPrice !== listPrice) {
      assert(discountReason.length >= 3, `Give a reason for the changed price on ${item.name}.`)
    }

    lines.push({
      itemId: item.id,
      itemName: item.name,
      categoryId: item.categoryId,
      unitCostUsd: Number(item.purchasePriceUsd),
      quantity: requested.quantity,
      unitPrice,
      subtotal: roundCurrencyAmount(unitPrice * requested.quantity),
      isCustomPrice: hasCustomPrice,
      originalPrice: hasCustomPrice ? listPrice : null,
      discountReason: hasCustomPrice ? discountReason || null : null,
      comboKey: null,
    })
  }

  input.combos.forEach((combo, index) => {
    assert(combo.items.length > 0, 'A combo needs at least one product.')
    const comboKey = `${index + 1}:${combo.name}`
    const shares = splitComboPrice(combo.comboPrice, combo.items.map((line) => line.quantity))

    combo.items.forEach((member, memberIndex) => {
      const item = itemsById.get(member.itemId)
      assert(item, 'One or more combo products are unavailable.')
      const subtotal = shares[memberIndex]
      lines.push({
        itemId: item.id,
        itemName: item.name,
        categoryId: item.categoryId,
        unitCostUsd: Number(item.purchasePriceUsd),
        quantity: member.quantity,
        unitPrice: roundCurrencyAmount(subtotal / member.quantity),
        subtotal,
        isCustomPrice: true,
        originalPrice: priceOf(item) || null,
        discountReason: `Part of combo: ${combo.name}`,
        comboKey,
      })
    })
  })

  // Stock is checked against the total demand per item, not per line: the same
  // product can appear both loose and inside a combo.
  const demandByItemId = new Map<string, number>()
  for (const line of lines) {
    demandByItemId.set(line.itemId, (demandByItemId.get(line.itemId) ?? 0) + line.quantity)
  }
  for (const [itemId, demand] of demandByItemId) {
    const stock = stockByItemId.get(itemId)
    const name = itemsById.get(itemId)?.name ?? 'A product'
    assert(stock, `${name} is not stocked at this location.`)
    assert(stock.quantity >= demand, `${name} does not have enough stock (${stock.quantity} on hand, ${demand} requested).`)
  }

  return { lines, stockByItemId }
}

export function resolveExchangeRate(rate: unknown): number {
  return normalizeExchangeRate(rate === null || rate === undefined ? undefined : Number(rate))
}
