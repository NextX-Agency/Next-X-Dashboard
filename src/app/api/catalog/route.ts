import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// API route to get catalog data - bypasses RLS by using Prisma
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'

    const result: Record<string, unknown> = {}

    // Run all independent queries in parallel for maximum performance
    if (type === 'all') {
      const [
        categories,
        items,
        combosRaw,
        locations,
        exchangeRate,
        banners,
        collectionsRaw,
        settings,
        stock,
      ] = await Promise.all([
        prisma.category.findMany({ orderBy: { name: 'asc' } }),
        prisma.item.findMany({
          where: { isPublic: true, is_combo: false },
          orderBy: { createdAt: 'desc' },
        }),
        // Fetch combos with their combo_items (uses named relation)
        prisma.item.findMany({
          where: { isPublic: true, is_combo: true },
          orderBy: { createdAt: 'desc' },
          include: {
            combo_items_combo_items_combo_idToitems: true,
          },
        }),
        prisma.location.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
        prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
        prisma.banner.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } }),
        // Fetch collections with their CollectionItems
        prisma.collection.findMany({
          where: { isActive: true, isFeatured: true },
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        }),
        prisma.storeSetting.findMany(),
        prisma.stock.findMany(),
      ])

      // Fetch child items for combos in one query
      const allChildItemIds = combosRaw.flatMap(
        c => c.combo_items_combo_items_combo_idToitems.map(ci => ci.item_id)
      )
      const allCollectionItemIds = collectionsRaw.flatMap(c => c.items.map(ci => ci.itemId))
      const allExtraItemIds = [...new Set([...allChildItemIds, ...allCollectionItemIds])]
      const extraItems = allExtraItemIds.length > 0
        ? await prisma.item.findMany({ where: { id: { in: allExtraItemIds } } })
        : []
      const extraItemMap = new Map(extraItems.map(i => [i.id, i]))

      result.categories = categories
      result.items = items

      // Map combo_items to expected shape (child_item / child_item_id)
      result.combos = combosRaw.map(combo => ({
        ...combo,
        combo_items: combo.combo_items_combo_items_combo_idToitems.map(ci => ({
          ...ci,
          child_item: extraItemMap.get(ci.item_id) ?? null,
          child_item_id: ci.item_id,
        })),
      }))

      result.locations = locations
      result.exchangeRate = exchangeRate
      result.banners = banners

      // Map collection items to expected shape
      result.collections = collectionsRaw.map(collection => ({
        ...collection,
        collection_items: collection.items.map(ci => ({
          ...ci,
          items: extraItemMap.get(ci.itemId) ?? null,
        })),
      }))

      // Convert settings array to object
      const settingsObj: Record<string, string> = {}
      settings.forEach(s => { settingsObj[s.key] = s.value })
      result.settings = settingsObj

      result.stock = stock

      // Cache for 60s on CDN/edge, serve stale for up to 2 minutes while revalidating
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      })
    }

    // Individual type queries (used by stock refresh etc.)
    if (type === 'categories') {
      result.categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    }

    if (type === 'items') {
      result.items = await prisma.item.findMany({
        where: { isPublic: true, is_combo: false },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (type === 'combos') {
      const combos = await prisma.item.findMany({
        where: { isPublic: true, is_combo: true },
        orderBy: { createdAt: 'desc' },
        include: {
          combo_items_combo_items_combo_idToitems: true,
        },
      })
      const childItemIds = combos.flatMap(c => c.combo_items_combo_items_combo_idToitems.map(ci => ci.item_id))
      const childItems = childItemIds.length > 0
        ? await prisma.item.findMany({ where: { id: { in: [...new Set(childItemIds)] } } })
        : []
      const childMap = new Map(childItems.map(i => [i.id, i]))
      result.combos = combos.map(combo => ({
        ...combo,
        combo_items: combo.combo_items_combo_items_combo_idToitems.map(ci => ({
          ...ci,
          child_item: childMap.get(ci.item_id) ?? null,
          child_item_id: ci.item_id,
        })),
      }))
    }

    if (type === 'locations') {
      result.locations = await prisma.location.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } })
    }

    if (type === 'exchangeRate') {
      result.exchangeRate = await prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } })
    }

    if (type === 'banners') {
      result.banners = await prisma.banner.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } })
    }

    if (type === 'collections') {
      const collections = await prisma.collection.findMany({
        where: { isActive: true, isFeatured: true },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      })
      const collectionItemIds = collections.flatMap(c => c.items.map(ci => ci.itemId))
      const collectionItemRecords = collectionItemIds.length > 0
        ? await prisma.item.findMany({ where: { id: { in: [...new Set(collectionItemIds)] } } })
        : []
      const ciMap = new Map(collectionItemRecords.map(i => [i.id, i]))
      result.collections = collections.map(collection => ({
        ...collection,
        collection_items: collection.items.map(ci => ({ ...ci, items: ciMap.get(ci.itemId) ?? null })),
      }))
    }

    if (type === 'settings') {
      const settings = await prisma.storeSetting.findMany()
      const settingsObj: Record<string, string> = {}
      settings.forEach(s => { settingsObj[s.key] = s.value })
      result.settings = settingsObj
    }

    if (type === 'stock') {
      result.stock = await prisma.stock.findMany()
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Catalog API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch catalog data' },
      { status: 500 }
    )
  }
}
