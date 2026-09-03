import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

/**
 * The ten most recent pending reservations, for diagnosing the reservation
 * desk.
 *
 * This route used to return customer names, phone numbers and email addresses
 * to any unauthenticated caller. It now requires an authenticated admin.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const reservations = await prisma.reservation.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        client: true,
        location: { select: { id: true, name: true } },
        item: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ reservations })
  } catch {
    return NextResponse.json({ error: 'Unable to load reservations.' }, { status: 500 })
  }
}
