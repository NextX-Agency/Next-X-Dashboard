import { NextResponse } from 'next/server'

import { fetchAvailability, isOdooConfigured } from '@/lib/storefront/odoo/client'
import { parseLines } from '@/lib/storefront/order'
import { clientKey, rateLimit } from '@/lib/storefront/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * Live availability for the cart, read straight from Odoo (never cached). Public by design but narrow:
 * it only accepts {product_id, quantity} lines and only answers with free quantities.
 */
export async function POST(request: Request) {
  if (process.env.STOREFRONT_ORDERS !== 'odoo' || !isOdooConfigured()) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 })
  }
  if (!rateLimit(`avail:${clientKey(request)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
  }
  const body = await request.json().catch(() => null)
  const lines = parseLines((body as { lines?: unknown } | null)?.lines)
  if (!lines) return NextResponse.json({ error: 'invalid_lines' }, { status: 400 })

  try {
    return NextResponse.json(await fetchAvailability(lines), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[store/availability]', error)
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 })
  }
}
