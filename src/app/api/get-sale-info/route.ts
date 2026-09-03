import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

/**
 * Sale header plus the location's seller, for the invoice and commission
 * surfaces.
 *
 * This route used to answer anyone who knew (or guessed) a sale UUID: it read
 * `sales` through the anon Supabase client with no session check at all, so
 * customer-facing sale totals and location data were public. It now requires an
 * authenticated admin like every other read of financial data, and goes through
 * Prisma so it is subject to the same access path as the rest of the app.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  const saleId = request.nextUrl.searchParams.get('saleId')
  if (!saleId) {
    return NextResponse.json({ error: 'Sale ID required' }, { status: 400 })
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        totalAmount: true,
        locationId: true,
        location: { select: { name: true } },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    const seller = await prisma.seller.findFirst({
      where: { location_id: sale.locationId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      sale: {
        id: sale.id,
        total_amount: Number(sale.totalAmount),
        location_id: sale.locationId,
        location_name: sale.location?.name ?? null,
      },
      seller,
    })
  } catch {
    return NextResponse.json({ error: 'Unable to load sale information.' }, { status: 500 })
  }
}
