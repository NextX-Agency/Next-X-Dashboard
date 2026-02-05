// Helper function to fetch catalog data via API (uses Prisma, bypasses RLS)
// Falls back to empty arrays if API fails

export interface CatalogData {
  categories: Array<{
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }>
  items: Array<{
    id: string
    name: string
    description: string | null
    categoryId: string | null
    purchasePriceUsd: number
    sellingPriceSrd: number | null
    sellingPriceUsd: number | null
    imageUrl: string | null
    isPublic: boolean
    isCombo: boolean
    allowCustomPrice: boolean
    createdAt: string
    updatedAt: string
  }>
  combos: Array<{
    id: string
    name: string
    description: string | null
    categoryId: string | null
    purchasePriceUsd: number
    sellingPriceSrd: number | null
    sellingPriceUsd: number | null
    imageUrl: string | null
    isPublic: boolean
    isCombo: boolean
    allowCustomPrice: boolean
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

// Transform Prisma camelCase to Supabase snake_case for compatibility
function transformToSnakeCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    // Convert camelCase to snake_case
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    const value = obj[key]
    
    if (Array.isArray(value)) {
      result[snakeKey] = value.map(item => 
        typeof item === 'object' && item !== null 
          ? transformToSnakeCase(item as Record<string, unknown>)
          : item
      )
    } else if (typeof value === 'object' && value !== null) {
      result[snakeKey] = transformToSnakeCase(value as Record<string, unknown>)
    } else {
      result[snakeKey] = value
    }
  }
  return result
}

export async function fetchCatalogData(): Promise<{
  categories: unknown[]
  items: unknown[]
  combos: unknown[]
  locations: unknown[]
  exchangeRate: unknown
  banners: unknown[]
  collections: unknown[]
  settings: Record<string, string>
  stock: unknown[]
}> {
  try {
    const response = await fetch('/api/catalog?type=all')
    
    if (!response.ok) {
      throw new Error('API request failed')
    }
    
    const data: CatalogData = await response.json()
    
    // Transform data to snake_case for compatibility with existing code
    return {
      categories: data.categories?.map(c => transformToSnakeCase(c)) || [],
      items: data.items?.map(i => transformToSnakeCase(i)) || [],
      combos: data.combos?.map(c => ({
        ...transformToSnakeCase(c),
        combo_items: c.combo_items?.map(ci => transformToSnakeCase(ci))
      })) || [],
      locations: data.locations?.map(l => transformToSnakeCase(l)) || [],
      exchangeRate: data.exchangeRate ? transformToSnakeCase(data.exchangeRate) : null,
      banners: data.banners?.map(b => transformToSnakeCase(b)) || [],
      collections: data.collections?.map(c => ({
        ...transformToSnakeCase(c),
        collection_items: c.collection_items?.map(ci => transformToSnakeCase(ci))
      })) || [],
      settings: data.settings || {},
      stock: data.stock?.map(s => transformToSnakeCase(s)) || []
    }
  } catch (error) {
    console.error('Error fetching catalog from API:', error)
    // Return empty data structure
    return {
      categories: [],
      items: [],
      combos: [],
      locations: [],
      exchangeRate: null,
      banners: [],
      collections: [],
      settings: {},
      stock: []
    }
  }
}
