import 'server-only'

import { unstable_cache } from 'next/cache'

import { prisma } from '@/lib/prisma'

const CATALOG_TYPE = 'audio'

async function loadCatalogPageData(): Promise<Record<string, unknown>> {
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
    prisma.category.findMany({
      where: { catalogType: CATALOG_TYPE },
      orderBy: { name: 'asc' },
    }),
    prisma.item.findMany({
      where: { isPublic: true, is_combo: false, deletedAt: null, catalogType: CATALOG_TYPE },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.item.findMany({
      where: { isPublic: true, is_combo: true, deletedAt: null, catalogType: CATALOG_TYPE },
      orderBy: { createdAt: 'desc' },
      include: {
        combo_items_combo_items_combo_idToitems: true,
      },
    }),
    prisma.location.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
    prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
    prisma.banner.findMany({ where: { isActive: true, catalogType: CATALOG_TYPE }, orderBy: { position: 'asc' } }),
    prisma.collection.findMany({
      where: { isActive: true, isFeatured: true, catalogType: CATALOG_TYPE },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    }),
    prisma.storeSetting.findMany(),
    prisma.stock.findMany(),
  ])

  const allChildItemIds = combosRaw.flatMap(
    combo => combo.combo_items_combo_items_combo_idToitems.map(comboItem => comboItem.item_id)
  )
  const allCollectionItemIds = collectionsRaw.flatMap(collection =>
    collection.items.map(collectionItem => collectionItem.itemId)
  )
  const allExtraItemIds = [...new Set([...allChildItemIds, ...allCollectionItemIds])]
  const extraItems = allExtraItemIds.length > 0
    ? await prisma.item.findMany({
      where: { id: { in: allExtraItemIds }, deletedAt: null, catalogType: CATALOG_TYPE },
    })
    : []
  const extraItemMap = new Map(extraItems.map(item => [item.id, item]))

  const filteredCollections = collectionsRaw
    .map(collection => ({
      ...collection,
      collection_items: collection.items
        .map(collectionItem => ({
          ...collectionItem,
          items: extraItemMap.get(collectionItem.itemId) ?? null,
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
    combos: combosRaw.map(combo => ({
      ...combo,
      combo_items: combo.combo_items_combo_items_combo_idToitems.map(comboItem => ({
        ...comboItem,
        child_item: extraItemMap.get(comboItem.item_id) ?? null,
        child_item_id: comboItem.item_id,
      })),
    })),
    locations,
    exchangeRate,
    banners,
    collections: filteredCollections,
    settings: settingsMap,
    stock,
  }
}

export const getCatalogPageData = unstable_cache(loadCatalogPageData, ['catalog-page-data'], {
  revalidate: 60,
  tags: ['catalog'],
})