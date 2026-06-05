import type { Currency } from '@/lib/currency'
import { getSellingPrice } from '@/lib/pricing'

export interface WatchSellingPrices {
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
}

function toPositivePrice(value: number | null | undefined) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

export function getWatchSellingPrice(
  item: WatchSellingPrices,
  currency: Currency,
  exchangeRate: number
) {
  const sellingPriceSrd = toPositivePrice(item.sellingPriceSrd)
  const sellingPriceUsd = toPositivePrice(item.sellingPriceUsd)

  if (sellingPriceSrd == null && sellingPriceUsd == null) {
    return null
  }

  const price = getSellingPrice({
    selling_price_srd: sellingPriceSrd,
    selling_price_usd: sellingPriceUsd,
  }, currency, exchangeRate)

  return price > 0 ? price : null
}
