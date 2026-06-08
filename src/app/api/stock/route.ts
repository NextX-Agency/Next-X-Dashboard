import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type { StockPageDataPayload, StockPageItem, StockPageLocation, StockPageRow } from '@/types/stock'
import { getLocationCatalogFilter, type PublicCatalogType } from '@/lib/locationCatalog'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const catalogType: PublicCatalogType = request.nextUrl.searchParams.get('catalogType') === 'watches' ? 'watches' : 'audio'
    const locationCatalogFilter = getLocationCatalogFilter(catalogType)

    const [items, locations, stocks] = await Promise.all([
      prisma.item.findMany({
        where: {
          deletedAt: null,
          is_combo: false,
          catalogType,
        },
        select: {
          id: true,
          name: true,
          brand: true,
          imageUrl: true,
          is_combo: true,
          deletedAt: true,
          catalogType: true,
          sellingPriceSrd: true,
          sellingPriceUsd: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.location.findMany({
        where: {
          catalogType: { in: locationCatalogFilter },
        },
        select: {
          id: true,
          name: true,
          catalogType: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.stock.findMany({
        where: {
          item: {
            is: {
              deletedAt: null,
              is_combo: false,
              catalogType,
            },
          },
          location: {
            is: {
              catalogType: { in: locationCatalogFilter },
            },
          },
        },
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
              brand: true,
              imageUrl: true,
              is_combo: true,
              deletedAt: true,
              catalogType: true,
              sellingPriceSrd: true,
              sellingPriceUsd: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              catalogType: true,
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
        brand: item.brand,
        image_url: item.imageUrl,
        is_combo: item.is_combo,
        deleted_at: item.deletedAt ? toIsoString(item.deletedAt) : null,
        catalog_type: item.catalogType,
        selling_price_srd: item.sellingPriceSrd === null ? null : Number(item.sellingPriceSrd),
        selling_price_usd: item.sellingPriceUsd === null ? null : Number(item.sellingPriceUsd),
      })),
      locations: locations.map<StockPageLocation>((location) => ({
        id: location.id,
        name: location.name,
        catalog_type: location.catalogType,
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
            brand: stock.item.brand,
            image_url: stock.item.imageUrl,
            is_combo: stock.item.is_combo,
            deleted_at: stock.item.deletedAt ? toIsoString(stock.item.deletedAt) : null,
            catalog_type: stock.item.catalogType,
            selling_price_srd: stock.item.sellingPriceSrd === null ? null : Number(stock.item.sellingPriceSrd),
            selling_price_usd: stock.item.sellingPriceUsd === null ? null : Number(stock.item.sellingPriceUsd),
          }
          : null,
        locations: stock.location
          ? {
            id: stock.location.id,
            name: stock.location.name,
            catalog_type: stock.location.catalogType,
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
