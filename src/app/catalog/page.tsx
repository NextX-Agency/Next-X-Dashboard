import {
  EMPTY_NORMALIZED_CATALOG_DATA,
  normalizeCatalogData,
  type CatalogApiData,
} from '@/lib/catalogData'
import { getCatalogPageData } from '@/services/catalog/getCatalogPageData'

import { CatalogPageClient } from './CatalogPageClient'

export default async function CatalogPage() {
  try {
    const rawData = await getCatalogPageData()
    const serializedData = JSON.parse(JSON.stringify(rawData)) as CatalogApiData

    return <CatalogPageClient initialData={normalizeCatalogData(serializedData)} />
  } catch (error) {
    console.error('Failed to load catalog page data on the server:', error)
    return <CatalogPageClient initialData={EMPTY_NORMALIZED_CATALOG_DATA} />
  }
}
