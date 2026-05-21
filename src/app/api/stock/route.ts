import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type { StockPageDataPayload, StockPageItem, StockPageLocation, StockPageRow } from '@/types/stock'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [items, locations, stocks] = await Promise.all([
      prisma.item.findMany({
        where: {
          deletedAt: null,
          is_combo: false,
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          is_combo: true,
          deletedAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.location.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.stock.findMany({
        select: {
          id: true,
          itemId: true,
          locationId: true,
          quantity: true,
          createdAt: true,
          updatedAt: true,
          item: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              is_combo: true,
              deletedAt: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { quantity: 'desc' },
      }),
    ])

    const data: StockPageDataPayload = {
      items: items.map<StockPageItem>((item) => ({
        id: item.id,
        name: item.name,
        image_url: item.imageUrl,
        is_combo: item.is_combo,
        deleted_at: item.deletedAt ? toIsoString(item.deletedAt) : null,
      })),
      locations: locations.map<StockPageLocation>((location) => ({
        id: location.id,
        name: location.name,
      })),
      stocks: stocks.map<StockPageRow>((stock) => ({
        id: stock.id,
        item_id: stock.itemId,
        location_id: stock.locationId,
        quantity: stock.quantity,
        created_at: toIsoString(stock.createdAt),
        updated_at: toIsoString(stock.updatedAt),
        items: stock.item
          ? {
            id: stock.item.id,
            name: stock.item.name,
            image_url: stock.item.imageUrl,
            is_combo: stock.item.is_combo,
            deleted_at: stock.item.deletedAt ? toIsoString(stock.item.deletedAt) : null,
          }
          : null,
        locations: stock.location
          ? {
            id: stock.location.id,
            name: stock.location.name,
          }
          : null,
      })),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Stock route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}