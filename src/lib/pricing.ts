import type { Currency } from '@/lib/currency'

type ItemSellingPrices = {
  selling_price_srd?: number | null
  selling_price_usd?: number | null
}

export function roundCurrencyAmount(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function formatCurrencyInputAmount(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  return roundCurrencyAmount(amount).toFixed(2)
}

export function convertSellingPrice(amount: number, fromCurrency: Currency, exchangeRate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return 0
  }

  return fromCurrency === 'USD'
    ? roundCurrencyAmount(amount * exchangeRate)
    : roundCurrencyAmount(amount / exchangeRate)
}

export function getSellingPrice(item: ItemSellingPrices, currency: Currency, exchangeRate: number): number {
  const srdPrice = item.selling_price_srd == null ? 0 : Number(item.selling_price_srd)
  const usdPrice = item.selling_price_usd == null ? 0 : Number(item.selling_price_usd)

  if (currency === 'SRD') {
    if (srdPrice > 0) return srdPrice
    return usdPrice > 0 ? convertSellingPrice(usdPrice, 'USD', exchangeRate) : 0
  }

  if (srdPrice > 0) return convertSellingPrice(srdPrice, 'SRD', exchangeRate)
  return usdPrice > 0 ? usdPrice : 0
}
