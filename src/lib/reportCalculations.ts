export type ReportCurrency = 'SRD' | 'USD'

export const DEFAULT_REPORT_EXCHANGE_RATE = 40
export const REPORT_ROUNDING_TOLERANCE = 0.05

export interface SaleFinancialItemInput {
  subtotal: unknown
  quantity: number
  /**
   * The item's cost *today*. Only a fallback — see `unitCostUsd`.
   */
  purchasePriceUsd?: unknown
  /**
   * The cost captured onto the line when the sale happened (T-12).
   *
   * This is what COGS must use. Reading `purchasePriceUsd` instead means the
   * item's current price decides the margin on every sale ever made, so
   * re-pricing a product silently rewrites history (F-01). Null only for lines
   * written before the T-12 backfill.
   */
  unitCostUsd?: unknown
  costIsEstimated?: boolean
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
  /**
   * True when any line's cost is a backfilled estimate rather than a cost
   * recorded at the time of sale. Reports covering these periods must say so
   * rather than presenting the margin as measured (R3, R7 of the audit rules).
   */
  usesEstimatedCost: boolean
  missingSaleItems: boolean
  hasMaterialTotalMismatch: boolean
  hasRoundingTotalMismatch: boolean
}

/**
 * The cost of one unit on a sale line, in USD.
 *
 * `unit_cost_usd` is the cost as it was when the sale was made. Once T-12 has
 * run, every line has one. Until then some lines fall back to the item's
 * current purchase price, which is the old (wrong) behaviour but is better than
 * reporting zero cost and a 100% margin.
 */
export function resolveUnitCostUsd(item: {
  unitCostUsd?: unknown
  purchasePriceUsd?: unknown
  item?: { purchasePriceUsd?: unknown } | null
}): number {
  if (item.unitCostUsd != null) return toReportNumber(item.unitCostUsd)
  if (item.purchasePriceUsd != null) return toReportNumber(item.purchasePriceUsd)
  return toReportNumber(item.item?.purchasePriceUsd)
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
  // Prefer the cost snapshotted onto the line. Fall back to the item's current
  // price only when the snapshot is absent, which means the T-12 backfill has
  // not run yet.
  const cogsUsd = items.reduce(
    (sum, item) => sum + (resolveUnitCostUsd(item) * item.quantity),
    0,
  )
  const usesEstimatedCost = items.some((item) => (
    item.unitCostUsd == null || item.costIsEstimated === true
  ))
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
    usesEstimatedCost,
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
