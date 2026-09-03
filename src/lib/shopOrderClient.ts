import type { Currency } from '@/lib/currency'

/**
 * Browser-side helper for persisting a webshop order before handing the
 * customer to WhatsApp.
 *
 * Kept separate from `src/lib/customerOrders.ts` because that module is server
 * code and imports `node:crypto`; importing it from a catalog page would drag
 * Node built-ins into the shop bundle.
 */

export type ShopOrderChannel = 'webshop_audio' | 'webshop_watches'

export interface ShopOrderLineInput {
  itemId: string
  quantity: number
}

export interface ShopOrderRequest {
  channel: ShopOrderChannel
  currency: Currency
  items: ShopOrderLineInput[]
  locationId?: string | null
  pickupDate?: string | null
  customerName?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  customerNotes?: string | null
}

export interface ShopOrderResult {
  /** The order number to quote, or null when the order could not be saved. */
  orderNumber: string | null
  /** Set when the order was not persisted, so the caller can say so. */
  error: string | null
}

/**
 * Persist the order, then let the caller open WhatsApp.
 *
 * A failure here never blocks the customer: the caller still opens WhatsApp so
 * the sale is not lost to our own outage. The returned `error` lets the message
 * say the order was not recorded, so staff know to check it manually rather
 * than assuming an order number will be waiting in the desk.
 */
export async function submitShopOrder(request: ShopOrderRequest): Promise<ShopOrderResult> {
  try {
    const response = await fetch('/api/shop/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    const payload = (await response.json().catch(() => null)) as
      | { order?: { orderNumber?: string }; error?: string }
      | null

    if (!response.ok) {
      return { orderNumber: null, error: payload?.error ?? 'The order could not be saved.' }
    }

    const orderNumber = payload?.order?.orderNumber
    if (!orderNumber) {
      return { orderNumber: null, error: 'The order could not be saved.' }
    }

    return { orderNumber, error: null }
  } catch {
    return { orderNumber: null, error: 'The order could not be saved.' }
  }
}

/**
 * The line the WhatsApp message opens with, so the customer and the shop are
 * talking about the same order in the order desk.
 */
export function orderReferenceLine(result: ShopOrderResult, locale: 'nl' | 'en' = 'en'): string {
  if (result.orderNumber) {
    return locale === 'nl'
      ? `Bestelnummer: ${result.orderNumber}\n\n`
      : `Order number: ${result.orderNumber}\n\n`
  }
  return locale === 'nl'
    ? 'Let op: deze bestelling is nog niet in het systeem opgeslagen.\n\n'
    : 'Note: this order was not saved in our system yet.\n\n'
}
