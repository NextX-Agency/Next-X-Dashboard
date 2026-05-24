import {
  EMPTY_NORMALIZED_CATALOG_DATA,
  normalizeCatalogData,
  type CatalogApiData,
  type NormalizedCatalogData,
} from '@/lib/catalogData'

export type CatalogData = CatalogApiData

const DEFAULT_CATALOG_TYPE = 'audio'

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
    const response = await fetch(`/api/catalog?type=all&catalogType=${DEFAULT_CATALOG_TYPE}`)
    
    if (!response.ok) {
      throw new Error('API request failed')
    }
    
    const data: CatalogData = await response.json()

    return normalizeCatalogData(data) as NormalizedCatalogData
  } catch (error) {
    console.error('Error fetching catalog from API:', error)
    return EMPTY_NORMALIZED_CATALOG_DATA
  }
}
