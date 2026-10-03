import { NextResponse } from 'next/server'

import { isOdooConfigured, submitOrder } from '@/lib/storefront/odoo/client'
import { parseOrder } from '@/lib/storefront/order'
import { clientKey, rateLimit } from '@/lib/storefront/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * Create a web order in Odoo. Off unless STOREFRONT_ORDERS=odoo, so production behaviour (WhatsApp hand-off)
 * does not change by deploying this code. Flow: validate -> Odoo re-checks live stock under a row lock ->
 * creates and confirms the sales order (which reserves stock) -> returns the order name.
 * The client_ref is the idempotency key: a retry or double-click returns the same order.
 */
export async function POST(request: Request) {
  if (process.env.STOREFRONT_ORDERS !== 'odoo' || !isOdooConfigured()) {
    return NextResponse.json({ ok: false, error: 'not_available', message: 'Online bestellen is nog niet beschikbaar.' }, { status: 404 })
  }
  if (!rateLimit(`order:${clientKey(request)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ ok: false, error: 'too_many_requests', message: 'Te veel pogingen. Probeer het over enkele minuten opnieuw.' }, { status: 429 })
  }

  const parsed = parseOrder(await request.json().catch(() => null))
  if ('message' in parsed) return NextResponse.json({ ok: false, error: 'invalid', message: parsed.message }, { status: 400 })

  try {
    const result = await submitOrder(parsed.order)
    if ('order_name' in result) return NextResponse.json({ ok: true, order_name: result.order_name, reused: result.reused })
    const status = result.error === 'unavailable' ? 409 : result.error === 'invalid' ? 400 : 502
    const message =
      result.error === 'unavailable'
        ? 'Een of meer producten zijn niet meer op voorraad. Pas je winkelmand aan.'
        : 'Je bestelling kon niet worden geplaatst. Probeer het opnieuw of bestel via WhatsApp.'
    return NextResponse.json({ ok: false, error: result.error, message, lines: result.lines }, { status })
  } catch (error) {
    console.error('[store/orders]', error)
    return NextResponse.json({ ok: false, error: 'upstream_unavailable', message: 'Je bestelling kon niet worden geplaatst. Probeer het opnieuw of bestel via WhatsApp.' }, { status: 502 })
  }
}
