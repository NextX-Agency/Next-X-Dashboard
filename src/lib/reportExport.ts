import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { prisma } from '@/lib/prisma'

export type ReportExportPeriod = 'monthly' | 'yearly'

const DEFAULT_EXCHANGE_RATE = 40
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 36
const CONTENT_WIDTH = PAGE_WIDTH - (PAGE_MARGIN * 2)

export interface ReportExportSummary {
  totalSales: number
  totalUnitsSold: number
  totalRevenueSrd: number
  totalRevenueUsd: number
  totalCogsSrd: number
  totalCogsUsd: number
  totalGrossProfitSrd: number
  totalGrossProfitUsd: number
  totalExpensesSrd: number
  totalExpensesUsd: number
  totalCommissionsSrd: number
  totalCommissionsUsd: number
  totalNetProfitSrd: number
  totalNetProfitUsd: number
}

export interface ReportExportFinancialHealth {
  walletBalanceSrd: number
  walletBalanceUsd: number
  stockValueSrd: number
  stockValueUsd: number
  onOrderCommitmentSrd: number
  onOrderCommitmentUsd: number
  totalAssetPositionSrd: number
  totalAssetPositionUsd: number
  walletNetChangeSrd: number
  walletNetChangeUsd: number
  walletSalesCreditsSrd: number
  walletSalesCreditsUsd: number
  salesMappedToWalletsSrd: number
  salesMappedToWalletsUsd: number
  walletExpenseDebitsSrd: number
  walletExpenseDebitsUsd: number
  expensesBookedToWalletsSrd: number
  expensesBookedToWalletsUsd: number
  walletExpenseRefundsSrd: number
  walletExpenseRefundsUsd: number
  commissionPayoutsSrd: number
  commissionPayoutsUsd: number
  transferNetSrd: number
  transferNetUsd: number
  adjustmentNetSrd: number
  adjustmentNetUsd: number
  purchaseCapitalDeployedSrd: number
  purchaseCapitalDeployedUsd: number
  unmappedRevenueSrd: number
  unmappedRevenueUsd: number
  salesCreditGapSrd: number
  salesCreditGapUsd: number
  expenseDebitGapSrd: number
  expenseDebitGapUsd: number
  liquidAssetSharePct: number
  stockAssetSharePct: number
  committedAssetSharePct: number
  openOrderCount: number
  walletCount: number
  healthScore: number
  healthLabel: string
  healthSummary: string
  profitabilityScore: number
  liquidityScore: number
  reconciliationScore: number
  inventoryScore: number
  liquidityCoverage: number
  daysOfInventory: number | null
}

export interface ReportExportLocationRow {
  locationName: string
  salesCount: number
  quantitySold: number
  revenueSrd: number
  revenueUsd: number
}

export interface ReportExportPaymentRow {
  paymentMethod: string
  salesCount: number
  revenueSrd: number
  revenueUsd: number
}

export interface ReportExportItemRow {
  locationName: string
  itemName: string
  categoryName: string
  quantitySold: number
  salesCount: number
  revenueSrd: number
  revenueUsd: number
}

export interface ReportExportBranding {
  storeName: string
  storeAddress: string
  storeEmail: string
}

export interface ReportExportData {
  period: ReportExportPeriod
  periodLabel: string
  periodStart: string
  periodEnd: string
  selectedLocationName: string
  generatedAt: string
  branding: ReportExportBranding
  summary: ReportExportSummary
  financialHealth: ReportExportFinancialHealth
  locations: ReportExportLocationRow[]
  payments: ReportExportPaymentRow[]
  items: ReportExportItemRow[]
}

function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value)
}

function getBounds(period: ReportExportPeriod, now: Date) {
  if (period === 'monthly') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }

  return {
    start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
  }
}

function sanitizeFilenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'all-locations'
}

function formatMoney(value: number, currency: 'SRD' | 'USD') {
  if (currency === 'USD') {
    return `$${value.toFixed(2)}`
  }

  return `SRD ${value.toFixed(2)}`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function toUsd(amount: number, currency: string | null | undefined, rate = DEFAULT_EXCHANGE_RATE) {
  return currency === 'SRD' ? amount / rate : amount
}

function toSrd(amount: number, currency: string | null | undefined, rate = DEFAULT_EXCHANGE_RATE) {
  return currency === 'USD' ? amount * rate : amount
}

function classifyWalletTransaction(transaction: {
  sale_id: string | null
  expense_id: string | null
  reference_type: string | null
  type: string
}) {
  if (transaction.reference_type === 'commission_payout') return 'commission'
  if (transaction.reference_type === 'transfer') return 'transfer'
  if (transaction.reference_type === 'expense_refund') return 'expenseRefund'
  if (transaction.reference_type === 'expense' || transaction.expense_id) return 'expense'
  if (transaction.reference_type === 'sale_refund') return 'saleRefund'
  if (transaction.reference_type === 'adjustment' || transaction.reference_type === 'correction') return 'adjustment'
  if (transaction.sale_id) return transaction.type === 'debit' ? 'saleRefund' : 'sale'
  return 'other'
}

function buildFinancialHealthScore(input: {
  totalRevenueUsd: number
  totalNetProfitUsd: number
  totalExpensesUsd: number
  totalCommissionsUsd: number
  walletBalanceUsd: number
  openPurchaseCommitmentUsd: number
  walletNetChangeUsd: number
  salesCreditGapUsd: number
  expenseDebitGapUsd: number
  unmappedRevenueUsd: number
  walletSalesMappedUsd: number
  expensesBookedToWalletsUsd: number
  daysOfInventory: number | null
  stockValueUsd: number
}): Pick<
  ReportExportFinancialHealth,
  'healthScore' | 'healthLabel' | 'healthSummary' | 'profitabilityScore' | 'liquidityScore' | 'reconciliationScore' | 'inventoryScore' | 'liquidityCoverage' | 'daysOfInventory'
> {
  const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

  const netMarginPct = input.totalRevenueUsd > 0 ? (input.totalNetProfitUsd / input.totalRevenueUsd) * 100 : 0
  const profitabilityScore = input.totalRevenueUsd <= 0
    ? 0
    : clampScore(((netMarginPct + 15) * 3.5) + (input.totalNetProfitUsd > 0 ? 5 : 0))

  const liquidityBase = input.totalExpensesUsd + input.totalCommissionsUsd + (input.openPurchaseCommitmentUsd * 0.5)
  const liquidityCoverage = input.walletBalanceUsd / Math.max(1, liquidityBase)
  const liquidityScore = clampScore((liquidityCoverage * 75) + (input.walletNetChangeUsd >= 0 ? 5 : 0))

  const reconciliationExposure = Math.abs(input.salesCreditGapUsd) + Math.abs(input.expenseDebitGapUsd) + Math.abs(input.unmappedRevenueUsd)
  const reconciliationBase = Math.max(input.totalRevenueUsd, input.walletSalesMappedUsd, input.expensesBookedToWalletsUsd, 1)
  const reconciliationScore = clampScore(100 - ((reconciliationExposure / reconciliationBase) * 120))

  let inventoryScore = 70
  if (input.daysOfInventory === null) inventoryScore = 55
  else if (input.daysOfInventory <= 60) inventoryScore = 90
  else if (input.daysOfInventory <= 120) inventoryScore = 78
  else if (input.daysOfInventory <= 180) inventoryScore = 65
  else if (input.daysOfInventory <= 365) inventoryScore = 45
  else inventoryScore = 30

  if (input.openPurchaseCommitmentUsd > input.walletBalanceUsd && input.walletBalanceUsd > 0) {
    inventoryScore -= 10
  }
  if (input.stockValueUsd <= 0) {
    inventoryScore -= 5
  }
  inventoryScore = clampScore(inventoryScore)

  const healthScore = clampScore(
    (profitabilityScore * 0.35) +
    (liquidityScore * 0.25) +
    (reconciliationScore * 0.25) +
    (inventoryScore * 0.15)
  )

  const weakestArea = [
    { key: 'profitability', value: profitabilityScore },
    { key: 'liquidity', value: liquidityScore },
    { key: 'reconciliation', value: reconciliationScore },
    { key: 'inventory', value: inventoryScore },
  ].sort((left, right) => left.value - right.value)[0]?.key

  if (healthScore >= 85) {
    return {
      healthScore,
      healthLabel: 'Strong',
      healthSummary: 'Profitability, liquidity, and reconciliation are all working together well.',
      profitabilityScore,
      liquidityScore,
      reconciliationScore,
      inventoryScore,
      liquidityCoverage,
      daysOfInventory: input.daysOfInventory,
    }
  }

  if (healthScore >= 70) {
    return {
      healthScore,
      healthLabel: 'Healthy',
      healthSummary: weakestArea === 'liquidity'
        ? 'Business health is solid, but liquid cash cover deserves attention.'
        : 'The business is in decent shape, with one weaker area worth tightening.',
      profitabilityScore,
      liquidityScore,
      reconciliationScore,
      inventoryScore,
      liquidityCoverage,
      daysOfInventory: input.daysOfInventory,
    }
  }

  if (healthScore >= 55) {
    return {
      healthScore,
      healthLabel: 'Watch',
      healthSummary: weakestArea === 'reconciliation'
        ? 'Wallet mismatches are reducing confidence in the numbers.'
        : weakestArea === 'profitability'
          ? 'Revenue is not converting into enough net profit.'
          : weakestArea === 'inventory'
            ? 'Too much value is tied up in stock or purchase commitments.'
            : 'Liquidity is tighter than ideal against current obligations.',
      profitabilityScore,
      liquidityScore,
      reconciliationScore,
      inventoryScore,
      liquidityCoverage,
      daysOfInventory: input.daysOfInventory,
    }
  }

  return {
    healthScore,
    healthLabel: 'At Risk',
    healthSummary: weakestArea === 'reconciliation'
      ? 'The financial picture is too noisy because wallet activity does not fully line up.'
      : weakestArea === 'profitability'
        ? 'The business is not turning enough revenue into profit.'
        : weakestArea === 'inventory'
          ? 'Inventory pressure is heavy relative to current movement and cash.'
          : 'Cash cover is under pressure relative to current obligations.',
    profitabilityScore,
    liquidityScore,
    reconciliationScore,
    inventoryScore,
    liquidityCoverage,
    daysOfInventory: input.daysOfInventory,
  }
}

function truncateText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text

  let current = text
  while (current.length > 0 && font.widthOfTextAtSize(`${current}...`, size) > maxWidth) {
    current = current.slice(0, -1)
  }

  return current ? `${current}...` : ''
}

export function getReportExportFilename(data: ReportExportData) {
  return `nextx-${data.period}-report-${data.periodLabel}-${sanitizeFilenamePart(data.selectedLocationName)}.pdf`
}

export async function buildReportExportData(period: ReportExportPeriod, locationId: string): Promise<ReportExportData> {
  const now = new Date()
  const bounds = getBounds(period, now)
  const salesWhere = {
    createdAt: {
      gte: bounds.start,
      lte: bounds.end,
    },
    ...(locationId ? { locationId } : {}),
  }

  const [sales, expenses, locations, settings, wallets, stocks, periodPurchaseOrders, openPurchaseOrders] = await Promise.all([
    prisma.sale.findMany({
      where: salesWhere,
      select: {
        id: true,
        locationId: true,
        wallet_id: true,
        currency: true,
        exchangeRate: true,
        totalAmount: true,
        paymentMethod: true,
        createdAt: true,
        saleItems: {
          select: {
            quantity: true,
            subtotal: true,
            item: {
              select: {
                id: true,
                name: true,
                purchasePriceUsd: true,
                category: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({
      where: {
        createdAt: {
          gte: bounds.start,
          lte: bounds.end,
        },
        ...(locationId ? { location_id: locationId } : {}),
      },
      select: {
        amount: true,
        currency: true,
        walletId: true,
      },
    }),
    prisma.location.findMany({
      select: { id: true, name: true },
    }),
    prisma.storeSetting.findMany({
      where: {
        key: {
          in: ['store_name', 'store_address', 'store_email'],
        },
      },
      select: {
        key: true,
        value: true,
      },
    }),
    prisma.wallet.findMany({
      where: locationId ? { location_id: locationId } : undefined,
      select: {
        id: true,
        currency: true,
        balance: true,
      },
    }),
    prisma.stock.findMany({
      where: locationId ? { locationId } : undefined,
      select: {
        quantity: true,
        item: {
          select: {
            purchasePriceUsd: true,
          },
        },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        createdAt: {
          gte: bounds.start,
          lte: bounds.end,
        },
        ...(locationId ? { locationId } : {}),
      },
      select: {
        totalAmount: true,
        currency: true,
        exchange_rate: true,
        status: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        ...(locationId ? { locationId } : {}),
        status: {
          not: 'cancelled',
        },
      },
      select: {
        status: true,
        currency: true,
        exchange_rate: true,
        purchase_order_items: {
          select: {
            quantity: true,
            quantity_received: true,
            unit_cost: true,
          },
        },
      },
    }),
  ])

  const saleIds = sales.map((sale) => sale.id)
  const walletIds = wallets.map((wallet) => wallet.id)
  const commissions = saleIds.length > 0
    ? await prisma.commission.findMany({
        where: {
          saleId: { in: saleIds },
          ...(locationId ? { location_id: locationId } : {}),
        },
        select: {
          commissionAmount: true,
          sale: {
            select: {
              currency: true,
              exchangeRate: true,
            },
          },
        },
      })
    : []
  const walletTransactions = walletIds.length > 0
    ? await prisma.wallet_transactions.findMany({
        where: {
          wallet_id: { in: walletIds },
          created_at: {
            gte: bounds.start,
            lte: bounds.end,
          },
        },
        select: {
          wallet_id: true,
          sale_id: true,
          expense_id: true,
          reference_type: true,
          type: true,
          amount: true,
          currency: true,
        },
      })
    : []

  const locationNameById = new Map(locations.map((location) => [location.id, location.name]))
  const selectedLocationName = locationId ? locationNameById.get(locationId) || 'Unknown location' : 'All locations'
  const periodLabel = period === 'monthly'
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    : String(now.getFullYear())
  const settingsMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]))

  const itemRows = new Map<string, ReportExportItemRow>()
  const locationRows = new Map<string, ReportExportLocationRow>()
  const paymentRows = new Map<string, ReportExportPaymentRow>()
  const walletCurrencyById = new Map(wallets.map((wallet) => [wallet.id, wallet.currency]))

  let totalUnitsSold = 0
  let totalRevenueSrd = 0
  let totalRevenueUsd = 0
  let totalCogsSrd = 0
  let totalCogsUsd = 0

  for (const sale of sales) {
    const saleRate = toNumber(sale.exchangeRate) || DEFAULT_EXCHANGE_RATE
    const saleRevenueSrd = sale.currency === 'SRD' ? toNumber(sale.totalAmount) : toNumber(sale.totalAmount) * saleRate
    const saleRevenueUsd = sale.currency === 'USD' ? toNumber(sale.totalAmount) : toNumber(sale.totalAmount) / saleRate
    const locationName = locationNameById.get(sale.locationId) || 'Unknown location'
    const locationEntry = locationRows.get(sale.locationId) ?? {
      locationName,
      salesCount: 0,
      quantitySold: 0,
      revenueSrd: 0,
      revenueUsd: 0,
    }
    locationEntry.salesCount += 1
    locationEntry.revenueSrd += saleRevenueSrd
    locationEntry.revenueUsd += saleRevenueUsd

    const paymentMethod = sale.paymentMethod || 'Unknown'
    const paymentEntry = paymentRows.get(paymentMethod) ?? {
      paymentMethod,
      salesCount: 0,
      revenueSrd: 0,
      revenueUsd: 0,
    }
    paymentEntry.salesCount += 1
    paymentEntry.revenueSrd += saleRevenueSrd
    paymentEntry.revenueUsd += saleRevenueUsd

    for (const saleItem of sale.saleItems) {
      const itemName = saleItem.item?.name || 'Deleted item'
      const categoryName = saleItem.item?.category?.name || 'Uncategorized'
      const revenueSrd = sale.currency === 'SRD' ? toNumber(saleItem.subtotal) : toNumber(saleItem.subtotal) * saleRate
      const revenueUsd = sale.currency === 'USD' ? toNumber(saleItem.subtotal) : toNumber(saleItem.subtotal) / saleRate
      const rowKey = `${sale.locationId}:${saleItem.item?.id || itemName}`
      const currentItemRow = itemRows.get(rowKey) ?? {
        locationName,
        itemName,
        categoryName,
        quantitySold: 0,
        salesCount: 0,
        revenueSrd: 0,
        revenueUsd: 0,
      }

      currentItemRow.quantitySold += saleItem.quantity
      currentItemRow.salesCount += 1
      currentItemRow.revenueSrd += revenueSrd
      currentItemRow.revenueUsd += revenueUsd
      itemRows.set(rowKey, currentItemRow)

      const itemCostUsd = toNumber(saleItem.item?.purchasePriceUsd) * saleItem.quantity
      totalCogsUsd += itemCostUsd
      totalCogsSrd += itemCostUsd * saleRate

      totalUnitsSold += saleItem.quantity
      locationEntry.quantitySold += saleItem.quantity
    }

    locationRows.set(sale.locationId, locationEntry)
    paymentRows.set(paymentMethod, paymentEntry)
    totalRevenueSrd += saleRevenueSrd
    totalRevenueUsd += saleRevenueUsd
  }

  const totalExpensesSrd = expenses.reduce((sum, expense) => {
    const amount = toNumber(expense.amount)
    return sum + (expense.currency === 'SRD' ? amount : amount * DEFAULT_EXCHANGE_RATE)
  }, 0)
  const totalExpensesUsd = expenses.reduce((sum, expense) => {
    const amount = toNumber(expense.amount)
    return sum + (expense.currency === 'USD' ? amount : amount / DEFAULT_EXCHANGE_RATE)
  }, 0)

  const totalCommissionsSrd = commissions.reduce((sum, commission) => {
    const amount = toNumber(commission.commissionAmount)
    const rate = toNumber(commission.sale?.exchangeRate) || DEFAULT_EXCHANGE_RATE
    return sum + ((commission.sale?.currency || 'USD') === 'SRD' ? amount : amount * rate)
  }, 0)
  const totalCommissionsUsd = commissions.reduce((sum, commission) => {
    const amount = toNumber(commission.commissionAmount)
    const rate = toNumber(commission.sale?.exchangeRate) || DEFAULT_EXCHANGE_RATE
    return sum + ((commission.sale?.currency || 'USD') === 'USD' ? amount : amount / rate)
  }, 0)

  const totalGrossProfitSrd = totalRevenueSrd - totalCogsSrd
  const totalGrossProfitUsd = totalRevenueUsd - totalCogsUsd
  const totalNetProfitSrd = totalGrossProfitSrd - totalExpensesSrd - totalCommissionsSrd
  const totalNetProfitUsd = totalGrossProfitUsd - totalExpensesUsd - totalCommissionsUsd

  const walletBalanceSrd = wallets.reduce((sum, wallet) => sum + toSrd(toNumber(wallet.balance), wallet.currency), 0)
  const walletBalanceUsd = wallets.reduce((sum, wallet) => sum + toUsd(toNumber(wallet.balance), wallet.currency), 0)

  const stockValueUsd = stocks.reduce((sum, stock) => sum + (toNumber(stock.item?.purchasePriceUsd) * stock.quantity), 0)
  const stockValueSrd = stockValueUsd * DEFAULT_EXCHANGE_RATE
  const totalStockUnits = stocks.reduce((sum, stock) => sum + stock.quantity, 0)

  const onOrderCommitmentUsd = openPurchaseOrders.reduce((sum, order) => {
    const orderRate = toNumber(order.exchange_rate) || DEFAULT_EXCHANGE_RATE
    const remainingInOrderCurrency = order.purchase_order_items.reduce((lineSum, item) => {
      const remainingQuantity = Math.max(0, item.quantity - (item.quantity_received || 0))
      return lineSum + (remainingQuantity * toNumber(item.unit_cost))
    }, 0)
    return sum + toUsd(remainingInOrderCurrency, order.currency, orderRate)
  }, 0)
  const onOrderCommitmentSrd = openPurchaseOrders.reduce((sum, order) => {
    const orderRate = toNumber(order.exchange_rate) || DEFAULT_EXCHANGE_RATE
    const remainingInOrderCurrency = order.purchase_order_items.reduce((lineSum, item) => {
      const remainingQuantity = Math.max(0, item.quantity - (item.quantity_received || 0))
      return lineSum + (remainingQuantity * toNumber(item.unit_cost))
    }, 0)
    return sum + toSrd(remainingInOrderCurrency, order.currency, orderRate)
  }, 0)

  const purchaseCapitalDeployedUsd = periodPurchaseOrders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + toUsd(toNumber(order.totalAmount), order.currency, toNumber(order.exchange_rate) || DEFAULT_EXCHANGE_RATE), 0)
  const purchaseCapitalDeployedSrd = periodPurchaseOrders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + toSrd(toNumber(order.totalAmount), order.currency, toNumber(order.exchange_rate) || DEFAULT_EXCHANGE_RATE), 0)

  const walletSalesMappedUsd = sales.reduce((sum, sale) => {
    if (!sale.wallet_id || !walletCurrencyById.has(sale.wallet_id)) return sum
    const saleRate = toNumber(sale.exchangeRate) || DEFAULT_EXCHANGE_RATE
    return sum + toUsd(toNumber(sale.totalAmount), sale.currency, saleRate)
  }, 0)
  const walletSalesMappedSrd = sales.reduce((sum, sale) => {
    if (!sale.wallet_id || !walletCurrencyById.has(sale.wallet_id)) return sum
    const saleRate = toNumber(sale.exchangeRate) || DEFAULT_EXCHANGE_RATE
    return sum + toSrd(toNumber(sale.totalAmount), sale.currency, saleRate)
  }, 0)

  const expensesBookedToWalletsUsd = expenses.reduce((sum, expense) => {
    if (!expense.walletId || !walletCurrencyById.has(expense.walletId)) return sum
    return sum + toUsd(toNumber(expense.amount), expense.currency)
  }, 0)
  const expensesBookedToWalletsSrd = expenses.reduce((sum, expense) => {
    if (!expense.walletId || !walletCurrencyById.has(expense.walletId)) return sum
    return sum + toSrd(toNumber(expense.amount), expense.currency)
  }, 0)

  const walletMetrics = walletTransactions.reduce((summary, transaction) => {
    const currency = transaction.currency || walletCurrencyById.get(transaction.wallet_id) || 'SRD'
    const amountUsd = toUsd(toNumber(transaction.amount), currency)
    const amountSrd = toSrd(toNumber(transaction.amount), currency)
    const signedUsd = transaction.type === 'debit' ? -amountUsd : amountUsd
    const signedSrd = transaction.type === 'debit' ? -amountSrd : amountSrd
    const bucket = classifyWalletTransaction(transaction)

    if (transaction.type === 'debit') {
      summary.walletNetChangeUsd -= amountUsd
      summary.walletNetChangeSrd -= amountSrd
    } else {
      summary.walletNetChangeUsd += amountUsd
      summary.walletNetChangeSrd += amountSrd
    }

    if (bucket === 'sale') {
      summary.walletSalesCreditsUsd += amountUsd
      summary.walletSalesCreditsSrd += amountSrd
    } else if (bucket === 'saleRefund') {
      summary.walletSalesCreditsUsd -= amountUsd
      summary.walletSalesCreditsSrd -= amountSrd
    } else if (bucket === 'expense') {
      summary.walletExpenseDebitsUsd += amountUsd
      summary.walletExpenseDebitsSrd += amountSrd
    } else if (bucket === 'expenseRefund') {
      summary.walletExpenseRefundsUsd += amountUsd
      summary.walletExpenseRefundsSrd += amountSrd
    } else if (bucket === 'commission') {
      summary.commissionPayoutsUsd += amountUsd
      summary.commissionPayoutsSrd += amountSrd
    } else if (bucket === 'transfer') {
      summary.transferNetUsd += signedUsd
      summary.transferNetSrd += signedSrd
    } else if (bucket === 'adjustment') {
      summary.adjustmentNetUsd += signedUsd
      summary.adjustmentNetSrd += signedSrd
    }

    return summary
  }, {
    walletNetChangeUsd: 0,
    walletNetChangeSrd: 0,
    walletSalesCreditsUsd: 0,
    walletSalesCreditsSrd: 0,
    walletExpenseDebitsUsd: 0,
    walletExpenseDebitsSrd: 0,
    walletExpenseRefundsUsd: 0,
    walletExpenseRefundsSrd: 0,
    commissionPayoutsUsd: 0,
    commissionPayoutsSrd: 0,
    transferNetUsd: 0,
    transferNetSrd: 0,
    adjustmentNetUsd: 0,
    adjustmentNetSrd: 0,
  })

  const totalAssetPositionUsd = walletBalanceUsd + stockValueUsd + onOrderCommitmentUsd
  const totalAssetPositionSrd = walletBalanceSrd + stockValueSrd + onOrderCommitmentSrd
  const liquidAssetSharePct = totalAssetPositionUsd > 0 ? (walletBalanceUsd / totalAssetPositionUsd) * 100 : 0
  const stockAssetSharePct = totalAssetPositionUsd > 0 ? (stockValueUsd / totalAssetPositionUsd) * 100 : 0
  const committedAssetSharePct = totalAssetPositionUsd > 0 ? (onOrderCommitmentUsd / totalAssetPositionUsd) * 100 : 0
  const unmappedRevenueUsd = totalRevenueUsd - walletSalesMappedUsd
  const unmappedRevenueSrd = totalRevenueSrd - walletSalesMappedSrd
  const salesCreditGapUsd = walletMetrics.walletSalesCreditsUsd - walletSalesMappedUsd
  const salesCreditGapSrd = walletMetrics.walletSalesCreditsSrd - walletSalesMappedSrd
  const expenseDebitGapUsd = walletMetrics.walletExpenseDebitsUsd - expensesBookedToWalletsUsd
  const expenseDebitGapSrd = walletMetrics.walletExpenseDebitsSrd - expensesBookedToWalletsSrd
  const periodDays = Math.max(1, Math.ceil((bounds.end.getTime() - bounds.start.getTime()) / 86400000))
  const dailyUnitSales = totalUnitsSold / periodDays
  const daysOfInventory = dailyUnitSales > 0 ? Math.round(totalStockUnits / dailyUnitSales) : null
  const healthScore = buildFinancialHealthScore({
    totalRevenueUsd,
    totalNetProfitUsd,
    totalExpensesUsd,
    totalCommissionsUsd,
    walletBalanceUsd,
    openPurchaseCommitmentUsd: onOrderCommitmentUsd,
    walletNetChangeUsd: walletMetrics.walletNetChangeUsd,
    salesCreditGapUsd,
    expenseDebitGapUsd,
    unmappedRevenueUsd,
    walletSalesMappedUsd,
    expensesBookedToWalletsUsd,
    daysOfInventory,
    stockValueUsd,
  })

  return {
    period,
    periodLabel,
    periodStart: bounds.start.toISOString().slice(0, 10),
    periodEnd: bounds.end.toISOString().slice(0, 10),
    selectedLocationName,
    generatedAt: new Date().toISOString(),
    branding: {
      storeName: settingsMap.store_name || 'NextX',
      storeAddress: settingsMap.store_address || 'Commewijne, Noord',
      storeEmail: settingsMap.store_email || '',
    },
    summary: {
      totalSales: sales.length,
      totalUnitsSold,
      totalRevenueSrd,
      totalRevenueUsd,
      totalCogsSrd,
      totalCogsUsd,
      totalGrossProfitSrd,
      totalGrossProfitUsd,
      totalExpensesSrd,
      totalExpensesUsd,
      totalCommissionsSrd,
      totalCommissionsUsd,
      totalNetProfitSrd,
      totalNetProfitUsd,
    },
    financialHealth: {
      walletBalanceSrd,
      walletBalanceUsd,
      stockValueSrd,
      stockValueUsd,
      onOrderCommitmentSrd,
      onOrderCommitmentUsd,
      totalAssetPositionSrd,
      totalAssetPositionUsd,
      walletNetChangeSrd: walletMetrics.walletNetChangeSrd,
      walletNetChangeUsd: walletMetrics.walletNetChangeUsd,
      walletSalesCreditsSrd: walletMetrics.walletSalesCreditsSrd,
      walletSalesCreditsUsd: walletMetrics.walletSalesCreditsUsd,
      salesMappedToWalletsSrd: walletSalesMappedSrd,
      salesMappedToWalletsUsd: walletSalesMappedUsd,
      walletExpenseDebitsSrd: walletMetrics.walletExpenseDebitsSrd,
      walletExpenseDebitsUsd: walletMetrics.walletExpenseDebitsUsd,
      expensesBookedToWalletsSrd: expensesBookedToWalletsSrd,
      expensesBookedToWalletsUsd: expensesBookedToWalletsUsd,
      walletExpenseRefundsSrd: walletMetrics.walletExpenseRefundsSrd,
      walletExpenseRefundsUsd: walletMetrics.walletExpenseRefundsUsd,
      commissionPayoutsSrd: walletMetrics.commissionPayoutsSrd,
      commissionPayoutsUsd: walletMetrics.commissionPayoutsUsd,
      transferNetSrd: walletMetrics.transferNetSrd,
      transferNetUsd: walletMetrics.transferNetUsd,
      adjustmentNetSrd: walletMetrics.adjustmentNetSrd,
      adjustmentNetUsd: walletMetrics.adjustmentNetUsd,
      purchaseCapitalDeployedSrd,
      purchaseCapitalDeployedUsd,
      unmappedRevenueSrd,
      unmappedRevenueUsd,
      salesCreditGapSrd,
      salesCreditGapUsd,
      expenseDebitGapSrd,
      expenseDebitGapUsd,
      liquidAssetSharePct,
      stockAssetSharePct,
      committedAssetSharePct,
      openOrderCount: openPurchaseOrders.filter((order) => order.status !== 'received').length,
      walletCount: wallets.length,
      healthScore: healthScore.healthScore,
      healthLabel: healthScore.healthLabel,
      healthSummary: healthScore.healthSummary,
      profitabilityScore: healthScore.profitabilityScore,
      liquidityScore: healthScore.liquidityScore,
      reconciliationScore: healthScore.reconciliationScore,
      inventoryScore: healthScore.inventoryScore,
      liquidityCoverage: healthScore.liquidityCoverage,
      daysOfInventory: healthScore.daysOfInventory,
    },
    locations: Array.from(locationRows.values()).sort((left, right) => right.revenueUsd - left.revenueUsd),
    payments: Array.from(paymentRows.values()).sort((left, right) => right.revenueUsd - left.revenueUsd),
    items: Array.from(itemRows.values()).sort((left, right) => right.revenueUsd - left.revenueUsd),
  }
}

export async function buildReportPdf(data: ReportExportData) {
  const pdfDoc = await PDFDocument.create()
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const brand = rgb(0.98, 0.44, 0.08)
  const brandSoft = rgb(1, 0.95, 0.91)
  const dark = rgb(0.08, 0.11, 0.18)
  const darkMuted = rgb(0.14, 0.18, 0.27)
  const ink = rgb(0.13, 0.17, 0.24)
  const textMuted = rgb(0.36, 0.4, 0.46)
  const line = rgb(0.9, 0.91, 0.93)
  const white = rgb(0.99, 0.99, 0.99)

  const netSrd = data.summary.totalNetProfitSrd
  const netUsd = data.summary.totalNetProfitUsd
  const grossSrd = data.summary.totalGrossProfitSrd
  const grossUsd = data.summary.totalGrossProfitUsd
  const avgSaleSrd = data.summary.totalSales > 0 ? data.summary.totalRevenueSrd / data.summary.totalSales : 0
  const avgSaleUsd = data.summary.totalSales > 0 ? data.summary.totalRevenueUsd / data.summary.totalSales : 0
  const avgUnitSrd = data.summary.totalUnitsSold > 0 ? data.summary.totalRevenueSrd / data.summary.totalUnitsSold : 0
  const avgUnitUsd = data.summary.totalUnitsSold > 0 ? data.summary.totalRevenueUsd / data.summary.totalUnitsSold : 0
  const topLocation = data.locations[0] ?? null
  const topPayment = data.payments[0] ?? null
  const topItem = data.items[0] ?? null
  const scopeDescriptor = data.selectedLocationName === 'All locations' ? 'Company-wide overview' : `Focused on ${data.selectedLocationName}`

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - PAGE_MARGIN

  const drawPageChrome = (targetPage: PDFPage, sectionTitle: string, subtitle?: string) => {
    targetPage.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 56,
      width: PAGE_WIDTH,
      height: 56,
      color: dark,
    })
    targetPage.drawRectangle({
      x: PAGE_WIDTH - 148,
      y: PAGE_HEIGHT - 56,
      width: 148,
      height: 56,
      color: brand,
      opacity: 0.96,
    })
    targetPage.drawText(data.branding.storeName, {
      x: PAGE_MARGIN,
      y: PAGE_HEIGHT - 24,
      size: 15,
      font: boldFont,
      color: white,
    })
    if (subtitle) {
      targetPage.drawText(subtitle, {
        x: PAGE_MARGIN,
        y: PAGE_HEIGHT - 39,
        size: 9,
        font: regularFont,
        color: rgb(0.83, 0.86, 0.9),
      })
    }

    const titleSize = 11
    targetPage.drawText(sectionTitle, {
      x: PAGE_WIDTH - PAGE_MARGIN - boldFont.widthOfTextAtSize(sectionTitle, titleSize),
      y: PAGE_HEIGHT - 31,
      size: titleSize,
      font: boldFont,
      color: white,
    })
  }

  const addPage = (sectionTitle?: string, subtitle?: string) => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - PAGE_MARGIN

    drawPageChrome(page, sectionTitle || 'Detailed Report', subtitle || `${data.periodLabel} • ${scopeDescriptor}`)
    y = PAGE_HEIGHT - 84

    if (sectionTitle) {
      page.drawText(sectionTitle, {
        x: PAGE_MARGIN,
        y,
        size: 14,
        font: boldFont,
        color: ink,
      })
      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - 8,
        width: 48,
        height: 3,
        color: brand,
      })
      y -= 18
    }
  }

  const ensureSpace = (requiredHeight: number, sectionTitle?: string) => {
    if (y - requiredHeight < PAGE_MARGIN + 26) {
      addPage(sectionTitle, `${data.periodLabel} • ${scopeDescriptor}`)
    }
  }

  const drawTextLine = (text: string, size: number, options?: { x?: number; color?: ReturnType<typeof rgb>; font?: PDFFont }) => {
    page.drawText(text, {
      x: options?.x ?? PAGE_MARGIN,
      y,
      size,
      font: options?.font ?? regularFont,
      color: options?.color ?? textMuted,
    })
    y -= size + 5
  }

  const drawLabelValue = (x: number, topY: number, label: string, value: string, width?: number) => {
    page.drawText(label.toUpperCase(), {
      x,
      y: topY,
      size: 8,
      font: boldFont,
      color: brand,
    })
    const clipped = width ? truncateText(regularFont, value, 10, width) : value
    page.drawText(clipped, {
      x,
      y: topY - 14,
      size: 10,
      font: regularFont,
      color: ink,
    })
  }

  const drawMetricCard = (x: number, topY: number, width: number, height: number, title: string, primary: string, secondary: string, accentColor = brand) => {
    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      borderWidth: 1,
      borderColor: line,
      color: white,
    })
    page.drawRectangle({
      x,
      y: topY - 6,
      width,
      height: 6,
      color: accentColor,
    })
    page.drawText(title, {
      x: x + 14,
      y: topY - 20,
      size: 10,
      font: boldFont,
      color: ink,
    })

    page.drawText(primary, {
      x: x + 14,
      y: topY - 42,
      size: 16,
      font: boldFont,
      color: ink,
    })
    page.drawText(secondary, {
      x: x + 14,
      y: topY - 59,
      size: 9,
      font: regularFont,
      color: textMuted,
    })
  }

  const drawInsightPanel = (title: string, lines: string[]) => {
    const panelHeight = 28 + (lines.length * 14) + 16
    ensureSpace(panelHeight + 12, title)
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: y - panelHeight,
      width: CONTENT_WIDTH,
      height: panelHeight,
      color: brandSoft,
      borderWidth: 1,
      borderColor: rgb(0.99, 0.82, 0.7),
    })
    page.drawText(title, {
      x: PAGE_MARGIN + 14,
      y: y - 18,
      size: 12,
      font: boldFont,
      color: ink,
    })

    let lineY = y - 36
    lines.forEach((lineText) => {
      page.drawRectangle({
        x: PAGE_MARGIN + 14,
        y: lineY + 3,
        width: 5,
        height: 5,
        color: brand,
      })
      page.drawText(lineText, {
        x: PAGE_MARGIN + 26,
        y: lineY,
        size: 9.5,
        font: regularFont,
        color: ink,
      })
      lineY -= 14
    })

    y -= panelHeight + 14
  }

  const drawTable = (
    title: string,
    columns: Array<{ header: string; width: number; align?: 'left' | 'right' }>,
    rows: string[][],
  ) => {
    ensureSpace(70, title)
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: y - 4,
      width: CONTENT_WIDTH,
      height: 22,
      color: darkMuted,
    })
    page.drawText(title, {
      x: PAGE_MARGIN + 12,
      y: y + 2,
      size: 12,
      font: boldFont,
      color: white,
    })
    y -= 28

    const rowHeight = 20
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0)

    const drawHeader = () => {
      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - rowHeight + 6,
        width: tableWidth,
        height: rowHeight,
        color: rgb(0.96, 0.97, 0.99),
      })

      let currentX = PAGE_MARGIN
      columns.forEach((column) => {
        page.drawText(column.header, {
          x: currentX + 6,
          y: y - 8,
          size: 9,
          font: boldFont,
          color: ink,
        })
        currentX += column.width
      })
      y -= rowHeight + 4
    }

    drawHeader()

    rows.forEach((row, index) => {
      ensureSpace(28, title)
      if (y < PAGE_MARGIN + rowHeight + 8) {
        addPage(title)
        drawHeader()
      }

      if (index % 2 === 0) {
        page.drawRectangle({
          x: PAGE_MARGIN,
          y: y - rowHeight + 5,
          width: tableWidth,
          height: rowHeight,
          color: rgb(0.992, 0.994, 0.998),
        })
      }

      page.drawLine({
        start: { x: PAGE_MARGIN, y: y - rowHeight + 5 },
        end: { x: PAGE_MARGIN + tableWidth, y: y - rowHeight + 5 },
        thickness: 0.5,
        color: line,
      })

      let currentX = PAGE_MARGIN
      row.forEach((cell, cellIndex) => {
        const column = columns[cellIndex]
        const clipped = truncateText(regularFont, cell, 8.5, column.width - 12)
        const textWidth = regularFont.widthOfTextAtSize(clipped, 8.5)
        const textX = column.align === 'right'
          ? currentX + column.width - textWidth - 6
          : currentX + 6

        page.drawText(clipped, {
          x: textX,
          y: y - 8,
          size: 8.5,
          font: regularFont,
          color: rgb(0.24, 0.28, 0.34),
        })

        currentX += column.width
      })

      y -= rowHeight
    })

    y -= 18
  }

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 176,
    width: PAGE_WIDTH,
    height: 176,
    color: dark,
  })
  page.drawRectangle({
    x: PAGE_WIDTH - 196,
    y: PAGE_HEIGHT - 176,
    width: 196,
    height: 176,
    color: brand,
    opacity: 0.95,
  })
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 206,
    width: CONTENT_WIDTH - 48,
    height: 38,
    color: rgb(1, 1, 1),
    opacity: 0.05,
  })
  page.drawText(data.branding.storeName.toUpperCase(), {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 48,
    size: 10,
    font: boldFont,
    color: rgb(0.97, 0.75, 0.64),
  })
  page.drawText('Performance Report', {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 76,
    size: 24,
    font: boldFont,
    color: white,
  })
  page.drawText(`${data.period === 'monthly' ? 'Monthly' : 'Yearly'} sales, cost and performance review`, {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 98,
    size: 11,
    font: regularFont,
    color: rgb(0.88, 0.9, 0.94),
  })
  page.drawText(`Generated ${formatDateTime(data.generatedAt)}`, {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 118,
    size: 10,
    font: regularFont,
    color: rgb(0.8, 0.83, 0.88),
  })

  drawLabelValue(PAGE_MARGIN, PAGE_HEIGHT - 148, 'Scope', data.selectedLocationName, 170)
  drawLabelValue(PAGE_MARGIN + 180, PAGE_HEIGHT - 148, 'Period', `${data.periodStart} to ${data.periodEnd}`, 140)
  drawLabelValue(PAGE_MARGIN + 340, PAGE_HEIGHT - 148, 'Prepared by', data.branding.storeName, 140)

  if (data.branding.storeAddress) {
    page.drawText(data.branding.storeAddress, {
      x: PAGE_MARGIN,
      y: PAGE_HEIGHT - 168,
      size: 9,
      font: regularFont,
      color: rgb(0.83, 0.86, 0.9),
    })
  }

  if (data.branding.storeEmail) {
    page.drawText(data.branding.storeEmail, {
      x: PAGE_MARGIN + 180,
      y: PAGE_HEIGHT - 168,
      size: 9,
      font: regularFont,
      color: rgb(0.83, 0.86, 0.9),
    })
  }

  y = PAGE_HEIGHT - 220
  page.drawText('Executive Summary', {
    x: PAGE_MARGIN,
    y,
    size: 15,
    font: boldFont,
    color: ink,
  })
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: y - 8,
    width: 72,
    height: 3,
    color: brand,
  })
  y -= 24
  drawTextLine(`This ${data.period === 'monthly' ? 'monthly' : 'yearly'} report summarizes revenue, cost pressure, unit movement and top contributors for ${scopeDescriptor.toLowerCase()}.`, 9.5)
  y -= 8

  const cardWidth = (CONTENT_WIDTH - 14) / 2
  const cardHeight = 78
  ensureSpace(190)
  const cardsTop = y
  drawMetricCard(PAGE_MARGIN, cardsTop, cardWidth, cardHeight, 'Revenue', formatMoney(data.summary.totalRevenueUsd, 'USD'), `${formatMoney(data.summary.totalRevenueSrd, 'SRD')} total revenue`, brand)
  drawMetricCard(PAGE_MARGIN + cardWidth + 14, cardsTop, cardWidth, cardHeight, 'Gross Profit', formatMoney(grossUsd, 'USD'), `${formatMoney(grossSrd, 'SRD')} after stock cost`, rgb(0.11, 0.55, 0.33))
  drawMetricCard(PAGE_MARGIN, cardsTop - cardHeight - 14, cardWidth, cardHeight, 'Net Profit', formatMoney(netUsd, 'USD'), `${formatMoney(netSrd, 'SRD')} after expenses and commissions`, darkMuted)
  drawMetricCard(PAGE_MARGIN + cardWidth + 14, cardsTop - cardHeight - 14, cardWidth, cardHeight, 'Asset Position', formatMoney(data.financialHealth.totalAssetPositionUsd, 'USD'), `${formatMoney(data.financialHealth.totalAssetPositionSrd, 'SRD')} wallets + stock + on-order`, rgb(0.37, 0.24, 0.72))
  y = cardsTop - (cardHeight * 2) - 28

  drawInsightPanel('Management Snapshot', [
    `Finance health score: ${data.financialHealth.healthScore}/100 (${data.financialHealth.healthLabel}). ${data.financialHealth.healthSummary}`,
    `Profitability ${data.financialHealth.profitabilityScore}/100 • Liquidity ${data.financialHealth.liquidityScore}/100 • Reconciliation ${data.financialHealth.reconciliationScore}/100 • Inventory ${data.financialHealth.inventoryScore}/100.`,
    `Liquidity cover: ${data.financialHealth.liquidityCoverage.toFixed(2)}x against current cost pressure and open inventory commitments.`,
    data.financialHealth.daysOfInventory !== null
      ? `Inventory cover: approximately ${data.financialHealth.daysOfInventory} days at the current sell-through rate.`
      : 'Inventory cover: not enough sell-through yet to estimate days of inventory.',
  ])

  drawInsightPanel('Key Signals', [
    `Average sale value: ${formatMoney(avgSaleUsd, 'USD')} • ${formatMoney(avgSaleSrd, 'SRD')}.`,
    `Average unit revenue: ${formatMoney(avgUnitUsd, 'USD')} • ${formatMoney(avgUnitSrd, 'SRD')}.`,
    `Gross profit: ${formatMoney(grossUsd, 'USD')} • Net profit: ${formatMoney(netUsd, 'USD')}.`,
    topLocation ? `Top location: ${topLocation.locationName} with ${formatMoney(topLocation.revenueUsd, 'USD')} across ${topLocation.salesCount.toLocaleString()} sales.` : 'Top location: no sales recorded in this period.',
    topItem ? `Top item: ${topItem.itemName} (${topItem.quantitySold.toLocaleString()} units • ${formatMoney(topItem.revenueUsd, 'USD')}).` : 'Top item: no item sales recorded in this period.',
    topPayment ? `Strongest payment method: ${topPayment.paymentMethod} at ${formatMoney(topPayment.revenueUsd, 'USD')}.` : 'Payment methods: no payment mix recorded in this period.',
  ])

  drawInsightPanel('Financial Health', [
    `Wallet balance: ${formatMoney(data.financialHealth.walletBalanceUsd, 'USD')} • Stock at cost: ${formatMoney(data.financialHealth.stockValueUsd, 'USD')}.`,
    `Inventory on order: ${formatMoney(data.financialHealth.onOrderCommitmentUsd, 'USD')} across ${data.financialHealth.openOrderCount.toLocaleString()} open orders.`,
    `Tracked wallet movement this period: ${formatMoney(data.financialHealth.walletNetChangeUsd, 'USD')}.`,
    `Purchase orders funded this period: ${formatMoney(data.financialHealth.purchaseCapitalDeployedUsd, 'USD')} (capital deployment, not operating expense).`,
    `Revenue not mapped to a wallet: ${formatMoney(data.financialHealth.unmappedRevenueUsd, 'USD')}.`,
  ])

  drawInsightPanel('Report Context', [
    `Brand: ${data.branding.storeName}.`,
    `Coverage window: ${data.periodStart} through ${data.periodEnd}.`,
    `Scope: ${data.selectedLocationName}.`,
    data.branding.storeAddress ? `Address: ${data.branding.storeAddress}.` : 'Address: not configured in store settings.',
    data.branding.storeEmail ? `Contact: ${data.branding.storeEmail}.` : 'Contact: no report email configured in store settings.',
  ])

  drawTable(
    'Financial Reconciliation Snapshot',
    [
      { header: 'Metric', width: 215 },
      { header: 'USD', width: 120, align: 'right' },
      { header: 'SRD', width: 120, align: 'right' },
      { header: 'Meaning', width: 104 },
    ],
    [
      ['Revenue', formatMoney(data.summary.totalRevenueUsd, 'USD'), formatMoney(data.summary.totalRevenueSrd, 'SRD'), 'Turnover'],
      ['Cost of goods sold', formatMoney(data.summary.totalCogsUsd, 'USD'), formatMoney(data.summary.totalCogsSrd, 'SRD'), 'Stock cost used'],
      ['Gross profit', formatMoney(data.summary.totalGrossProfitUsd, 'USD'), formatMoney(data.summary.totalGrossProfitSrd, 'SRD'), 'Revenue minus COGS'],
      ['Net profit', formatMoney(data.summary.totalNetProfitUsd, 'USD'), formatMoney(data.summary.totalNetProfitSrd, 'SRD'), 'After expenses and commissions'],
      ['Wallet balance', formatMoney(data.financialHealth.walletBalanceUsd, 'USD'), formatMoney(data.financialHealth.walletBalanceSrd, 'SRD'), 'Liquid cash'],
      ['Stock at cost', formatMoney(data.financialHealth.stockValueUsd, 'USD'), formatMoney(data.financialHealth.stockValueSrd, 'SRD'), 'Inventory held'],
      ['Inventory on order', formatMoney(data.financialHealth.onOrderCommitmentUsd, 'USD'), formatMoney(data.financialHealth.onOrderCommitmentSrd, 'SRD'), 'Funded, not fully received'],
      ['Total asset position', formatMoney(data.financialHealth.totalAssetPositionUsd, 'USD'), formatMoney(data.financialHealth.totalAssetPositionSrd, 'SRD'), 'Wallets + stock + on-order'],
      ['Tracked wallet movement', formatMoney(data.financialHealth.walletNetChangeUsd, 'USD'), formatMoney(data.financialHealth.walletNetChangeSrd, 'SRD'), 'Wallet transaction delta'],
      ['Sales mapped to wallets', formatMoney(data.financialHealth.salesMappedToWalletsUsd, 'USD'), formatMoney(data.financialHealth.salesMappedToWalletsSrd, 'SRD'), 'Expected wallet sales'],
      ['Wallet sale credits', formatMoney(data.financialHealth.walletSalesCreditsUsd, 'USD'), formatMoney(data.financialHealth.walletSalesCreditsSrd, 'SRD'), 'Recorded wallet sales'],
      ['Expense booked to wallets', formatMoney(data.financialHealth.expensesBookedToWalletsUsd, 'USD'), formatMoney(data.financialHealth.expensesBookedToWalletsSrd, 'SRD'), 'Expected wallet expenses'],
      ['Wallet expense debits', formatMoney(data.financialHealth.walletExpenseDebitsUsd, 'USD'), formatMoney(data.financialHealth.walletExpenseDebitsSrd, 'SRD'), 'Recorded wallet expenses'],
      ['Purchase capital deployed', formatMoney(data.financialHealth.purchaseCapitalDeployedUsd, 'USD'), formatMoney(data.financialHealth.purchaseCapitalDeployedSrd, 'SRD'), 'Inventory funding'],
      ['Revenue not mapped', formatMoney(data.financialHealth.unmappedRevenueUsd, 'USD'), formatMoney(data.financialHealth.unmappedRevenueSrd, 'SRD'), 'Sales outside wallet map'],
    ],
  )

  drawTable(
    'Location Breakdown',
    [
      { header: 'Location', width: 200 },
      { header: 'Sales', width: 60, align: 'right' },
      { header: 'Units', width: 60, align: 'right' },
      { header: 'Revenue USD', width: 95, align: 'right' },
      { header: 'Revenue SRD', width: 105, align: 'right' },
    ],
    (data.locations.length > 0 ? data.locations : [{ locationName: 'No sales in period', salesCount: 0, quantitySold: 0, revenueUsd: 0, revenueSrd: 0 }]).map((row) => [
      row.locationName,
      row.salesCount.toLocaleString(),
      row.quantitySold.toLocaleString(),
      formatMoney(row.revenueUsd, 'USD'),
      formatMoney(row.revenueSrd, 'SRD'),
    ]),
  )

  drawTable(
    'Payment Methods',
    [
      { header: 'Method', width: 200 },
      { header: 'Sales', width: 70, align: 'right' },
      { header: 'Revenue USD', width: 110, align: 'right' },
      { header: 'Revenue SRD', width: 140, align: 'right' },
    ],
    (data.payments.length > 0 ? data.payments : [{ paymentMethod: 'No payments in period', salesCount: 0, revenueUsd: 0, revenueSrd: 0 }]).map((row) => [
      row.paymentMethod,
      row.salesCount.toLocaleString(),
      formatMoney(row.revenueUsd, 'USD'),
      formatMoney(row.revenueSrd, 'SRD'),
    ]),
  )

  drawTable(
    'Sold Items',
    [
      { header: 'Item', width: 150 },
      { header: 'Location', width: 110 },
      { header: 'Category', width: 90 },
      { header: 'Units', width: 42, align: 'right' },
      { header: 'Revenue USD', width: 62, align: 'right' },
      { header: 'Revenue SRD', width: 66, align: 'right' },
    ],
    (data.items.length > 0 ? data.items : [{ itemName: 'No item sales in period', locationName: '-', categoryName: '-', quantitySold: 0, revenueUsd: 0, revenueSrd: 0, salesCount: 0 }]).map((row) => [
      row.itemName,
      row.locationName,
      row.categoryName,
      row.quantitySold.toLocaleString(),
      formatMoney(row.revenueUsd, 'USD'),
      formatMoney(row.revenueSrd, 'SRD'),
    ]),
  )

  const pages = pdfDoc.getPages()
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: PAGE_MARGIN, y: 28 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y: 28 },
      thickness: 0.8,
      color: line,
    })

    const footerLeft = `${data.branding.storeName} • ${data.periodLabel} • ${data.selectedLocationName}`
    currentPage.drawText(truncateText(regularFont, footerLeft, 8.5, CONTENT_WIDTH - 90), {
      x: PAGE_MARGIN,
      y: 14,
      size: 8.5,
      font: regularFont,
      color: textMuted,
    })

    const pageLabel = `Page ${index + 1} of ${pages.length}`
    currentPage.drawText(pageLabel, {
      x: PAGE_WIDTH - PAGE_MARGIN - regularFont.widthOfTextAtSize(pageLabel, 8.5),
      y: 14,
      size: 8.5,
      font: boldFont,
      color: textMuted,
    })
  })

  return pdfDoc.save()
}