import { getWatchesCatalogData } from '@/services/watches/getWatchesCatalogData'
import WatchesCatalogClient from './WatchesCatalogClient'

export const revalidate = 120

export default async function WatchesPage() {
  let data: Record<string, unknown>

  try {
    data = await getWatchesCatalogData()
  } catch {
    data = { items: [], stock: [], settings: {}, banners: [], collections: [] }
  }

  const items = (data.items as Array<{
    id: string
    name: string
    brand?: string | null
    categoryId?: string | null
    imageUrl?: string | null
    sellingPriceUsd?: number | null
    sellingPriceSrd?: number | null
    catalogType: string
    isPublic?: boolean | null
  }>) ?? []
  const stock = (data.stock as Array<{ itemId: string; quantity: number }>) ?? []
  const banners = (data.banners as Array<{
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    mobileImage?: string | null
    linkUrl?: string | null
    linkText?: string | null
    buttonText?: string | null
  }>) ?? []
  const collections = (data.collections as Array<{
    id: string
    name: string
    slug: string
    description?: string | null
    imageUrl?: string | null
    collection_items?: Array<{
      id: string
      itemId: string
      items?: {
        id: string
        name: string
        brand?: string | null
        categoryId?: string | null
        imageUrl?: string | null
        sellingPriceUsd?: number | null
        sellingPriceSrd?: number | null
        catalogType: string
        isPublic?: boolean | null
      } | null
    }>
  }>) ?? []
  const settings = (data.settings as Record<string, string>) ?? {}
  const rawExchangeRate = (data.exchangeRate as {
    usdToSrd?: number | string | null
    usd_to_srd?: number | string | null
  } | null) ?? null
  const exchangeRateValue = rawExchangeRate?.usdToSrd ?? rawExchangeRate?.usd_to_srd
  const initialExchangeRate = exchangeRateValue == null ? null : Number(exchangeRateValue)

  return (
    <WatchesCatalogClient
      items={items}
      stock={stock}
      banners={banners}
      collections={collections}
      settings={settings}
      initialExchangeRate={Number.isFinite(initialExchangeRate) ? initialExchangeRate : null}
    />
  )
}
