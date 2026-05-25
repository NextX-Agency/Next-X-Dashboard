export interface CatalogApiData {
  categories: Array<{
    id: string
    name: string
    catalogType: string
    createdAt: string
    updatedAt: string
  }>
  items: Array<{
    id: string
    name: string
    brand: string | null
    description: string | null
    categoryId: string | null
    purchasePriceUsd: number
    sellingPriceSrd: number | null
    sellingPriceUsd: number | null
    imageUrl: string | null
    isPublic: boolean
    isCombo: boolean
    allowCustomPrice: boolean
    catalogType: string
    createdAt: string
    updatedAt: string
  }>
  combos: Array<{
    id: string
    name: string
    brand: string | null
    description: string | null
    categoryId: string | null
    purchasePriceUsd: number
    sellingPriceSrd: number | null
    sellingPriceUsd: number | null
    imageUrl: string | null
    isPublic: boolean
    isCombo: boolean
    allowCustomPrice: boolean
    catalogType: string
    createdAt: string
    updatedAt: string
    combo_items?: Array<{
      id: string
      comboId: string
      itemId: string
      quantity: number
      child_item?: unknown
      child_item_id: string
    }>
  }>
  locations: Array<{
    id: string
    name: string
    address: string | null
    isActive: boolean
  }>
  exchangeRate: {
    id: string
    usdToSrd: number
    isActive: boolean
  } | null
  banners: Array<{
    id: string
    title: string
    subtitle: string | null
    catalogType: string
    imageUrl: string
    mobileImage: string | null
    linkUrl: string | null
    linkText: string | null
    buttonText: string | null
    isActive: boolean
    position: number
  }>
  collections: Array<{
    id: string
    name: string
    slug: string
    description: string | null
    catalogType: string
    imageUrl: string | null
    isActive: boolean
    isFeatured: boolean
    collection_items?: Array<{
      id: string
      collectionId: string
      itemId: string
      items?: unknown
    }>
  }>
  settings: Record<string, string>
  stock: Array<{
    id: string
    itemId: string
    locationId: string
    quantity: number
  }>
}

export interface NormalizedCatalogData {
  categories: unknown[]
  items: unknown[]
  combos: unknown[]
  locations: unknown[]
  exchangeRate: unknown
  banners: unknown[]
  collections: unknown[]
  settings: Record<string, string>
  stock: unknown[]
}

export const EMPTY_NORMALIZED_CATALOG_DATA: NormalizedCatalogData = {
  categories: [],
  items: [],
  combos: [],
  locations: [],
  exchangeRate: null,
  banners: [],
  collections: [],
  settings: {},
  stock: [],
}

function transformToSnakeCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    const value = obj[key]

    if (Array.isArray(value)) {
      result[snakeKey] = value.map(item =>
        typeof item === 'object' && item !== null
          ? transformToSnakeCase(item as Record<string, unknown>)
          : item
      )
      continue
    }

    if (typeof value === 'object' && value !== null) {
      result[snakeKey] = transformToSnakeCase(value as Record<string, unknown>)
      continue
    }

    result[snakeKey] = value
  }

  return result
}

export function normalizeCatalogData(data: CatalogApiData): NormalizedCatalogData {
  return {
    categories: data.categories?.map(category => transformToSnakeCase(category)) || [],
    items: data.items?.map(item => transformToSnakeCase(item)) || [],
    combos: data.combos?.map(combo => ({
      ...transformToSnakeCase(combo),
      combo_items: combo.combo_items?.map(comboItem => transformToSnakeCase(comboItem)),
    })) || [],
    locations: data.locations?.map(location => transformToSnakeCase(location)) || [],
    exchangeRate: data.exchangeRate ? transformToSnakeCase(data.exchangeRate) : null,
    banners: data.banners?.map(banner => transformToSnakeCase(banner)) || [],
    collections: data.collections?.map(collection => ({
      ...transformToSnakeCase(collection),
      collection_items: collection.collection_items?.map(collectionItem => transformToSnakeCase(collectionItem)),
    })) || [],
    settings: data.settings || {},
    stock: data.stock?.map(stockItem => transformToSnakeCase(stockItem)) || [],
  }
}