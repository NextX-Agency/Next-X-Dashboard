import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'full'

    if (type === 'stock') {
      const stock = await prisma.stock.findMany()
      return NextResponse.json({ stock }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      })
    }

    const [categories, items, locations, exchangeRate, settings, stock] = await Promise.all([
      prisma.category.findMany({
        where: { catalogType: 'watches' },
        orderBy: { name: 'asc' },
      }),
      prisma.item.findMany({
        where: { isPublic: true, is_combo: false, deletedAt: null, catalogType: 'watches' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.location.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
      prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
      prisma.storeSetting.findMany(),
      prisma.stock.findMany(),
    ])

    const settingsMap: Record<string, string> = {}
    settings.forEach(s => { settingsMap[s.key] = s.value })

    return NextResponse.json(
      { categories, items, locations, exchangeRate, settings: settingsMap, stock },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } }
    )
  } catch (error) {
    console.error('Watches API error:', error)
    return NextResponse.json(
      { categories: [], items: [], locations: [], exchangeRate: null, settings: {}, stock: [] },
      { status: 500 }
    )
  }
}
