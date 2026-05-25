import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

async function loadWatchesCatalogData(): Promise<Record<string, unknown>> {
  const [
    categories,
    items,
    locations,
    exchangeRate,
    banners,
    collectionsRaw,
    settings,
    stock,
  ] = await Promise.all([
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
    prisma.banner.findMany({
      where: { isActive: true, catalogType: 'watches' },
      orderBy: { position: 'asc' },
    }),
    prisma.collection.findMany({
      where: { isActive: true, isFeatured: true, catalogType: 'watches' },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    }),
    prisma.storeSetting.findMany(),
    prisma.stock.findMany(),
  ])

  const collectionItemIds = collectionsRaw.flatMap(collection =>
    collection.items.map(collectionItem => collectionItem.itemId)
  )
  const collectionItems = collectionItemIds.length > 0
    ? await prisma.item.findMany({
      where: { id: { in: [...new Set(collectionItemIds)] }, deletedAt: null, catalogType: 'watches' },
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
  settings.forEach(setting => {
    settingsMap[setting.key] = setting.value
  })

  return {
    categories,
    items,
    locations,
    exchangeRate,
    banners,
    collections,
    settings: settingsMap,
    stock,
  }
}

export const getWatchesCatalogData = unstable_cache(
  loadWatchesCatalogData,
  ['watches-catalog-data'],
  { revalidate: 120, tags: ['watches-catalog'] }
)
