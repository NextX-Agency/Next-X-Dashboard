import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { getMonthEndCloseChecklist } from '@/lib/monthEndClose'
import { prisma } from '@/lib/prisma'

function monthBounds(periodEndValue: string | null) {
  const fallback = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0))
  const raw = periodEndValue ?? fallback.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('periodEnd must use YYYY-MM-DD.')
  const end = new Date(`${raw}T00:00:00.000Z`)
  const after = new Date(end); after.setUTCDate(after.getUTCDate() + 1)
  if (Number.isNaN(end.getTime()) || after.getUTCDate() !== 1) throw new Error('periodEnd must be the final day of a calendar month.')
  return { start: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)), end }
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
    if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })
    const period = monthBounds(request.nextUrl.searchParams.get('periodEnd'))
    const checklist = await prisma.$transaction((tx) => getMonthEndCloseChecklist(tx, company.id, period.start, period.end))
    return NextResponse.json({ data: checklist }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load close checklist.' }, { status: 400 })
  }
}
