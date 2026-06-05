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
  const directPrice = currency === 'SRD' ? item.selling_price_srd : item.selling_price_usd

  if (directPrice != null && Number(directPrice) > 0) {
    return Number(directPrice)
  }

  const fallbackPrice = currency === 'SRD' ? item.selling_price_usd : item.selling_price_srd
  if (fallbackPrice == null || Number(fallbackPrice) <= 0) {
    return 0
  }

  return convertSellingPrice(Number(fallbackPrice), currency === 'SRD' ? 'USD' : 'SRD', exchangeRate)
}
