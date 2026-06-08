import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLocationCatalogFilter } from '@/lib/locationCatalog'

const CATALOG_TYPE = 'watches'
const LOCATION_CATALOG_FILTER = getLocationCatalogFilter(CATALOG_TYPE)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'full'

    if (type === 'stock') {
      const stock = await prisma.stock.findMany({
        where: {
          item: {
            catalogType: CATALOG_TYPE,
            isPublic: true,
            is_combo: false,
            deletedAt: null,
          },
          location: {
            is_active: true,
            catalogType: { in: LOCATION_CATALOG_FILTER },
          },
        },
      })
      return NextResponse.json({ stock }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      })
    }

    if (type !== 'full') {
      return NextResponse.json({ error: 'Unsupported watches payload type' }, { status: 400 })
    }

    const [categories, items, locations, exchangeRate, banners, collectionsRaw, settings, stock] = await Promise.all([
      prisma.category.findMany({
        where: { catalogType: CATALOG_TYPE },
        orderBy: { name: 'asc' },
      }),
      prisma.item.findMany({
        where: { isPublic: true, is_combo: false, deletedAt: null, catalogType: CATALOG_TYPE },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.location.findMany({
        where: { is_active: true, catalogType: { in: LOCATION_CATALOG_FILTER } },
        orderBy: { name: 'asc' },
      }),
      prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
      prisma.banner.findMany({
        where: { isActive: true, catalogType: CATALOG_TYPE },
        orderBy: { position: 'asc' },
      }),
      prisma.collection.findMany({
        where: { isActive: true, isFeatured: true, catalogType: CATALOG_TYPE },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      prisma.storeSetting.findMany(),
      prisma.stock.findMany({
        where: {
          item: {
            catalogType: CATALOG_TYPE,
            isPublic: true,
            is_combo: false,
            deletedAt: null,
          },
          location: {
            is_active: true,
            catalogType: { in: LOCATION_CATALOG_FILTER },
          },
        },
      }),
    ])

    const collectionItemIds = collectionsRaw.flatMap(collection => collection.items.map(collectionItem => collectionItem.itemId))
    const collectionItems = collectionItemIds.length > 0
      ? await prisma.item.findMany({
        where: {
          id: { in: [...new Set(collectionItemIds)] },
        catalogType: CATALOG_TYPE,
          isPublic: true,
          is_combo: false,
          deletedAt: null,
        },
      })
      : []
    const collectionItemMap = new Map(collectionItems.map(item => [item.id, item]))

    const collections = collectionsRaw
      .map(collection => ({
        ...collection,
        collection_items: collection.items
          .map(collectionItem => ({
            ...collectionItem,
            items: collectionItemMap.get(collectionItem.itemId) ?? null,
          }))
          .filter(collectionItem => collectionItem.items !== null),
      }))
      .filter(collection => collection.collection_items.length > 0)

    const settingsMap: Record<string, string> = {}
    settings.forEach(s => { settingsMap[s.key] = s.value })

    return NextResponse.json(
      { categories, items, locations, exchangeRate, banners, collections, settings: settingsMap, stock },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } }
    )
  } catch (error) {
    console.error('Watches API error:', error)
    return NextResponse.json(
      { categories: [], items: [], locations: [], exchangeRate: null, banners: [], collections: [], settings: {}, stock: [] },
      { status: 500 }
    )
  }
}
