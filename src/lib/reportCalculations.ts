export type ReportCurrency = 'SRD' | 'USD'

export const DEFAULT_REPORT_EXCHANGE_RATE = 40
export const REPORT_ROUNDING_TOLERANCE = 0.05

export interface SaleFinancialItemInput {
  subtotal: unknown
  quantity: number
  purchasePriceUsd?: unknown
}

export interface SaleFinancialInput {
  totalAmount: unknown
  currency: string | null | undefined
  exchangeRate?: unknown
  fallbackRate?: unknown
  items?: SaleFinancialItemInput[]
}

export interface SaleFinancials {
  currency: ReportCurrency
  exchangeRate: number
  revenueInSaleCurrency: number
  itemSubtotalInSaleCurrency: number
  saleTotalDiffInSaleCurrency: number
  revenueScale: number
  revenueUsd: number
  revenueSrd: number
  cogsUsd: number
  cogsSrd: number
  grossProfitUsd: number
  grossProfitSrd: number
  unitCount: number
  missingSaleItems: boolean
  hasMaterialTotalMismatch: boolean
  hasRoundingTotalMismatch: boolean
}

export function toReportNumber(value: unknown): number {
  if (value == null) return 0
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function normalizeReportCurrency(currency: string | null | undefined): ReportCurrency {
  return currency === 'USD' ? 'USD' : 'SRD'
}

export function getReportExchangeRate(
  exchangeRate: unknown,
  fallbackRate: unknown = DEFAULT_REPORT_EXCHANGE_RATE,
): number {
  const rate = toReportNumber(exchangeRate)
  if (rate > 0) return rate

  const fallback = toReportNumber(fallbackRate)
  return fallback > 0 ? fallback : DEFAULT_REPORT_EXCHANGE_RATE
}

export function toReportUsd(
  amount: number,
  currency: string | null | undefined,
  exchangeRate: unknown,
): number {
  const rate = getReportExchangeRate(exchangeRate)
  return normalizeReportCurrency(currency) === 'SRD' ? amount / rate : amount
}

export function toReportSrd(
  amount: number,
  currency: string | null | undefined,
  exchangeRate: unknown,
): number {
  const rate = getReportExchangeRate(exchangeRate)
  return normalizeReportCurrency(currency) === 'USD' ? amount * rate : amount
}

export function convertReportCurrency(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: ReportCurrency,
  exchangeRate: unknown,
): number {
  const sourceCurrency = normalizeReportCurrency(fromCurrency)
  if (sourceCurrency === toCurrency) return amount

  return toCurrency === 'USD'
    ? toReportUsd(amount, sourceCurrency, exchangeRate)
    : toReportSrd(amount, sourceCurrency, exchangeRate)
}

export function calculateSaleFinancials(input: SaleFinancialInput): SaleFinancials {
  const items = input.items ?? []
  const currency = normalizeReportCurrency(input.currency)
  const exchangeRate = getReportExchangeRate(input.exchangeRate, input.fallbackRate)
  const recordedSaleTotal = toReportNumber(input.totalAmount)
  const itemSubtotalInSaleCurrency = items.reduce(
    (sum, item) => sum + toReportNumber(item.subtotal),
    0,
  )
  const revenueInSaleCurrency = recordedSaleTotal !== 0
    ? recordedSaleTotal
    : itemSubtotalInSaleCurrency
  const revenueScale = itemSubtotalInSaleCurrency !== 0
    ? revenueInSaleCurrency / itemSubtotalInSaleCurrency
    : 0
  const cogsUsd = items.reduce(
    (sum, item) => sum + (toReportNumber(item.purchasePriceUsd) * item.quantity),
    0,
  )
  const revenueUsd = toReportUsd(revenueInSaleCurrency, currency, exchangeRate)
  const revenueSrd = toReportSrd(revenueInSaleCurrency, currency, exchangeRate)
  const cogsSrd = cogsUsd * exchangeRate
  const saleTotalDiffInSaleCurrency = revenueInSaleCurrency - itemSubtotalInSaleCurrency
  const absDiff = Math.abs(saleTotalDiffInSaleCurrency)

  return {
    currency,
    exchangeRate,
    revenueInSaleCurrency,
    itemSubtotalInSaleCurrency,
    saleTotalDiffInSaleCurrency,
    revenueScale,
    revenueUsd,
    revenueSrd,
    cogsUsd,
    cogsSrd,
    grossProfitUsd: revenueUsd - cogsUsd,
    grossProfitSrd: revenueSrd - cogsSrd,
    unitCount: items.reduce((sum, item) => sum + item.quantity, 0),
    missingSaleItems: items.length === 0 && Math.abs(revenueInSaleCurrency) > 0.005,
    hasMaterialTotalMismatch: absDiff > REPORT_ROUNDING_TOLERANCE,
    hasRoundingTotalMismatch: absDiff > 0.005 && absDiff <= REPORT_ROUNDING_TOLERANCE,
  }
}

export function calculateScaledLineAmount(
  lineSubtotal: unknown,
  saleFinancials: Pick<SaleFinancials, 'revenueScale'>,
): number {
  return toReportNumber(lineSubtotal) * saleFinancials.revenueScale
}
