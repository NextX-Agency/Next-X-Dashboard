import { getWatchesCatalogData } from '@/services/watches/getWatchesCatalogData'
import WatchesCatalogClient from './WatchesCatalogClient'

export const revalidate = 120

export default async function WatchesPage() {
  let data: Record<string, unknown>

  try {
    data = await getWatchesCatalogData()
  } catch {
    data = { categories: [], items: [], stock: [], settings: {} }
  }

  const categories = (data.categories as Array<{ id: string; name: string; catalogType: string }>) ?? []
  const items = (data.items as Array<{
    id: string
    name: string
    categoryId?: string | null
    imageUrl?: string | null
    sellingPriceUsd?: number | null
    sellingPriceSrd?: number | null
    catalogType: string
    isPublic?: boolean | null
  }>) ?? []
  const stock = (data.stock as Array<{ itemId: string; quantity: number }>) ?? []
  const settings = (data.settings as Record<string, string>) ?? {}

  return (
    <WatchesCatalogClient
      categories={categories}
      items={items}
      stock={stock}
      settings={settings}
    />
  )
}
