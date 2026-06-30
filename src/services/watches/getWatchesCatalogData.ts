import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getLocationCatalogFilter } from '@/lib/locationCatalog'

const CATALOG_TYPE = 'watches'
const LOCATION_CATALOG_FILTER = getLocationCatalogFilter(CATALOG_TYPE)

type RawWatchItem = {
  id: string
  name: string
  brand: string | null
  categoryId: string | null
  category: {
    id: string
    name: string
  } | null
  imageUrl: string | null
  sellingPriceUsd: unknown | null
  sellingPriceSrd: unknown | null
  catalogType: string
  isPublic: boolean | null
}

function serializeWatchItem(item: RawWatchItem) {
  return {
    ...item,
    sellingPriceUsd: item.sellingPriceUsd == null ? null : Number(item.sellingPriceUsd),
    sellingPriceSrd: item.sellingPriceSrd == null ? null : Number(item.sellingPriceSrd),
  }
}

async function loadWatchesCatalogData(): Promise<Record<string, unknown>> {
  const watchItemSelect = {
    id: true,
    name: true,
    brand: true,
    categoryId: true,
    category: {
      select: {
        id: true,
        name: true,
      },
    },
    imageUrl: true,
    sellingPriceUsd: true,
    sellingPriceSrd: true,
    catalogType: true,
    isPublic: true,
  } as const

  const [
    items,
    exchangeRate,
    bannersRaw,
    collectionsRaw,
    settings,
    stock,
  ] = await Promise.all([
    prisma.item.findMany({
      where: { isPublic: true, is_combo: false, deletedAt: null, catalogType: CATALOG_TYPE },
      orderBy: { createdAt: 'desc' },
      select: watchItemSelect,
    }),
    prisma.exchangeRate.findFirst({
      where: { isActive: true },
      orderBy: { setAt: 'desc' },
      select: { usdToSrd: true },
    }),
    prisma.banner.findMany({
      where: { isActive: true, catalogType: CATALOG_TYPE },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        mobileImage: true,
        linkUrl: true,
        linkText: true,
        button_text: true,
      },
    }),
    prisma.collection.findMany({
      where: { isActive: true, isFeatured: true, catalogType: CATALOG_TYPE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            itemId: true,
          },
        },
      },
    }),
    prisma.storeSetting.findMany({
      select: { key: true, value: true },
    }),
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
      select: {
        itemId: true,
        quantity: true,
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
      select: watchItemSelect,
    })
    : []
  const serializedItems = items.map(serializeWatchItem)
  const collectionItemMap = new Map(collectionItems.map(item => [item.id, serializeWatchItem(item)]))
  const banners = bannersRaw.map(({ button_text, ...banner }) => ({
    ...banner,
    buttonText: button_text,
  }))

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
    items: serializedItems,
    exchangeRate: exchangeRate ? { ...exchangeRate, usdToSrd: Number(exchangeRate.usdToSrd) } : null,
    banners,
    collections,
    settings: settingsMap,
    stock,
  }
}

export const getWatchesCatalogData = unstable_cache(
  loadWatchesCatalogData,
  ['watches-catalog-data-v2'],
  { revalidate: 120, tags: ['watches-catalog'] }
)
