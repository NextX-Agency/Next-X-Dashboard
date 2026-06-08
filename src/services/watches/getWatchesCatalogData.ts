import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getLocationCatalogFilter } from '@/lib/locationCatalog'

const CATALOG_TYPE = 'watches'
const LOCATION_CATALOG_FILTER = getLocationCatalogFilter(CATALOG_TYPE)

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

  const collectionItemIds = collectionsRaw.flatMap(collection =>
    collection.items.map(collectionItem => collectionItem.itemId)
  )
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
