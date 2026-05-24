import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { formatCurrency, type Currency } from '@/lib/currency'
import { prisma } from '@/lib/prisma'
import { STOCK_THRESHOLDS } from '@/lib/stockUtils'
import type { DashboardActivity, DashboardMetrics } from '@/types/dashboard'

const DEFAULT_EXCHANGE_RATE = 40

type SalesGroup = {
  currency: string
  _sum: {
    totalAmount: unknown
  }
}

type CurrencyTotals = {
  USD: number
  SRD: number
}

type ProfitSale = {
  id: string
  currency: string
  exchangeRate: unknown
  totalAmount: unknown
  saleItems: Array<{
    quantity: number
    item: {
      purchasePriceUsd: unknown
    } | null
  }>
}

type ProfitExpense = {
  amount: unknown
  currency: string
  description: string | null
  category: {
    name: string
  } | null
}

type ProfitCommission = {
  commissionAmount: unknown
  sale: {
    currency: string
    exchangeRate: unknown
  } | null
}

function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value)
}

function getCurrencyTotals(groups: SalesGroup[]): CurrencyTotals {
  return groups.reduce<CurrencyTotals>((totals, group) => {
    const currency = group.currency === 'SRD' ? 'SRD' : 'USD'
    totals[currency] += toNumber(group._sum.totalAmount)
    return totals
  }, { USD: 0, SRD: 0 })
}

function toUsd(total: CurrencyTotals, exchangeRate: number): number {
  return total.USD + (total.SRD / exchangeRate)
}

function getTrend(currentAmount: number, previousAmount: number): number {
  if (previousAmount !== 0) {
    return ((currentAmount - previousAmount) / Math.abs(previousAmount)) * 100
  }

  if (currentAmount > 0) return 100
  if (currentAmount < 0) return -100
  return 0
}

function getCurrency(value: string): Currency {
  return value === 'SRD' ? 'SRD' : 'USD'
}

function toUsdAmount(amount: unknown, currency: string, exchangeRate: number): number {
  const numericAmount = toNumber(amount)
  return currency === 'SRD' ? numericAmount / exchangeRate : numericAmount
}

function isInventoryExpense(expense: ProfitExpense): boolean {
  const categoryName = (expense.category?.name || '').toLowerCase().trim()
  const isInventory =
    categoryName === 'business expense' ||
    categoryName === 'personal items' ||
    categoryName === 'personal' ||
    categoryName === 'inventory' ||
    categoryName === 'stock' ||
    categoryName === 'stock purchase' ||
    categoryName === 'purchases' ||
    categoryName === 'goods' ||
    categoryName === 'wholesale' ||
    categoryName === 'vendor' ||
    categoryName === 'cogs' ||
    categoryName === 'cost of goods sold' ||
    categoryName === 'merchandise' ||
    categoryName === 'product purchases' ||
    categoryName.includes('inventory purchase') ||
    categoryName.includes('stock order') ||
    categoryName === 'inventory shipping' ||
    categoryName === 'stock shipping' ||
    categoryName.includes('product shipping')

  const description = (expense.description || '').toLowerCase()
  const hasInventoryKeywords = description.includes('inventory') ||
    description.includes('stock') ||
    description.includes('wholesale') ||
    description.includes('supplier') ||
    description.includes('vendor')

  return isInventory || (hasInventoryKeywords && (categoryName === 'shipping' || categoryName === 'marketing'))
}

function calculateGrossProfitUsd(
  sales: ProfitSale[],
  exchangeRate: number,
): number {
  const revenueUsd = sales.reduce((sum, sale) => {
    const saleRate = toNumber(sale.exchangeRate) || exchangeRate
    return sum + toUsdAmount(sale.totalAmount, sale.currency, saleRate)
  }, 0)

  const cogsUsd = sales.reduce((sum, sale) => sum + sale.saleItems.reduce((saleItemSum, saleItem) => (
    saleItemSum + (toNumber(saleItem.item?.purchasePriceUsd) * saleItem.quantity)
  ), 0), 0)

  return revenueUsd - cogsUsd
}

function calculateNetProfitUsd(
  sales: ProfitSale[],
  expenses: ProfitExpense[],
  commissions: ProfitCommission[],
  exchangeRate: number,
): number {
  const grossProfitUsd = calculateGrossProfitUsd(sales, exchangeRate)

  const operatingExpensesUsd = expenses
    .filter((expense) => !isInventoryExpense(expense))
    .reduce((sum, expense) => sum + toUsdAmount(expense.amount, expense.currency, exchangeRate), 0)

  const commissionsUsd = commissions.reduce((sum, commission) => {
    const commissionCurrency = commission.sale?.currency || 'USD'
    const commissionRate = toNumber(commission.sale?.exchangeRate) || exchangeRate
    return sum + toUsdAmount(commission.commissionAmount, commissionCurrency, commissionRate)
  }, 0)

  return grossProfitUsd - operatingExpensesUsd - commissionsUsd
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)

    const day = now.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0, 0)
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(thisWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1)

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    const currentYearStart = new Date(now.getFullYear(), 0, 1)
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1)

    const [
      currentRate,
      activeOrders,
      stockItems,
      stockByItem,
      totalSalesByCurrency,
      todaysSalesByCurrency,
      yesterdaysSalesByCurrency,
      thisWeekSalesByCurrency,
      lastWeekSalesByCurrency,
      thisMonthSalesByCurrency,
      lastMonthSalesByCurrency,
      currentYearSales,
      recentSales,
      thisWeekProfitSales,
      lastWeekProfitSales,
      thisWeekExpenses,
      lastWeekExpenses,
    ] = await Promise.all([
      prisma.exchangeRate.findFirst({
        where: { isActive: true },
        orderBy: { setAt: 'desc' },
      }),
      prisma.reservation.count({
        where: { status: 'pending' },
      }),
      prisma.stock.count({
        where: { quantity: { gt: 0 } },
      }),
      prisma.stock.groupBy({
        by: ['itemId'],
        _sum: { quantity: true },
      }),
      prisma.sale.groupBy({
        by: ['currency'],
        _sum: { totalAmount: true },
      }),
      prisma.sale.groupBy({
        by: ['currency'],
        where: { createdAt: { gte: todayStart } },
        _sum: { totalAmount: true },
      }),
      prisma.sale.groupBy({
        by: ['currency'],
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
        _sum: { totalAmount: true },
      }),
      prisma.sale.groupBy({
        by: ['currency'],
        where: { createdAt: { gte: thisWeekStart } },
        _sum: { totalAmount: true },
      }),
      prisma.sale.groupBy({
        by: ['currency'],
        where: { createdAt: { gte: lastWeekStart, lte: lastWeekEnd } },
        _sum: { totalAmount: true },
      }),
      prisma.sale.groupBy({
        by: ['currency'],
        where: { createdAt: { gte: thisMonthStart } },
        _sum: { totalAmount: true },
      }),
      prisma.sale.groupBy({
        by: ['currency'],
        where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { totalAmount: true },
      }),
      prisma.sale.findMany({
        where: { createdAt: { gte: currentYearStart, lt: nextYearStart } },
        select: {
          createdAt: true,
          currency: true,
          totalAmount: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sale.findMany({
        select: {
          createdAt: true,
          currency: true,
          totalAmount: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      prisma.sale.findMany({
        where: { createdAt: { gte: thisWeekStart } },
        select: {
          id: true,
          currency: true,
          exchangeRate: true,
          totalAmount: true,
          saleItems: {
            select: {
              quantity: true,
              item: {
                select: {
                  purchasePriceUsd: true,
                },
              },
            },
          },
        },
      }),
      prisma.sale.findMany({
        where: { createdAt: { gte: lastWeekStart, lte: lastWeekEnd } },
        select: {
          id: true,
          currency: true,
          exchangeRate: true,
          totalAmount: true,
          saleItems: {
            select: {
              quantity: true,
              item: {
                select: {
                  purchasePriceUsd: true,
                },
              },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: { createdAt: { gte: thisWeekStart } },
        select: {
          amount: true,
          currency: true,
          description: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: { createdAt: { gte: lastWeekStart, lte: lastWeekEnd } },
        select: {
          amount: true,
          currency: true,
          description: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      }),
    ])

    const exchangeRate = toNumber(currentRate?.usdToSrd) || DEFAULT_EXCHANGE_RATE
    const totalSales = getCurrencyTotals(totalSalesByCurrency)
    const todaysSales = getCurrencyTotals(todaysSalesByCurrency)
    const yesterdaysSales = getCurrencyTotals(yesterdaysSalesByCurrency)
    const thisWeekSales = getCurrencyTotals(thisWeekSalesByCurrency)
    const lastWeekSales = getCurrencyTotals(lastWeekSalesByCurrency)
    const thisMonthSales = getCurrencyTotals(thisMonthSalesByCurrency)
    const lastMonthSales = getCurrencyTotals(lastMonthSalesByCurrency)

    const monthlySalesUSD = Array.from({ length: 12 }, () => 0)
    for (const sale of currentYearSales) {
      const monthIndex = sale.createdAt.getMonth()
      const amount = toNumber(sale.totalAmount)
      monthlySalesUSD[monthIndex] += sale.currency === 'SRD'
        ? amount / exchangeRate
        : amount
    }

    const [thisWeekCommissions, lastWeekCommissions] = await Promise.all([
      thisWeekProfitSales.length > 0
        ? prisma.commission.findMany({
            where: { saleId: { in: thisWeekProfitSales.map((sale) => sale.id) } },
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
        : Promise.resolve([]),
      lastWeekProfitSales.length > 0
        ? prisma.commission.findMany({
            where: { saleId: { in: lastWeekProfitSales.map((sale) => sale.id) } },
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
        : Promise.resolve([]),
    ])

    const weeklyGrossProfitUSD = calculateGrossProfitUsd(
      thisWeekProfitSales,
      exchangeRate,
    )
    const lastWeekGrossProfitUSD = calculateGrossProfitUsd(
      lastWeekProfitSales,
      exchangeRate,
    )
    const weeklyNetProfitUSD = calculateNetProfitUsd(
      thisWeekProfitSales,
      thisWeekExpenses,
      thisWeekCommissions,
      exchangeRate,
    )
    const lastWeekNetProfitUSD = calculateNetProfitUsd(
      lastWeekProfitSales,
      lastWeekExpenses,
      lastWeekCommissions,
      exchangeRate,
    )

    const lowStockItems = stockByItem.filter(({ _sum }) => {
      const quantity = _sum.quantity ?? 0
      return quantity <= STOCK_THRESHOLDS.LOW_STOCK && quantity > STOCK_THRESHOLDS.OUT_OF_STOCK
    }).length

    const outOfStockItems = stockByItem.filter(({ _sum }) => {
      const quantity = _sum.quantity ?? 0
      return quantity <= STOCK_THRESHOLDS.OUT_OF_STOCK
    }).length

    const activity: DashboardActivity[] = [
      ...recentSales.map((sale) => ({
        kind: 'sale' as const,
        title: `New sale - ${formatCurrency(toNumber(sale.totalAmount), getCurrency(sale.currency))}`,
        timestamp: sale.createdAt.toISOString(),
        color: 'orange' as const,
      })),
      ...(currentRate ? [{
        kind: 'exchange' as const,
        title: `Exchange rate: 1 USD = ${exchangeRate} SRD`,
        timestamp: currentRate.setAt.toISOString(),
        color: 'green' as const,
      }] : []),
    ]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 4)

    const dashboardMetrics: DashboardMetrics = {
      totalSalesUSD: totalSales.USD,
      totalSalesSRD: totalSales.SRD,
      weeklySalesUSD: thisWeekSales.USD,
      weeklySalesSRD: thisWeekSales.SRD,
      activeOrders,
      stockItems,
      lowStockItems,
      outOfStockItems,
      totalRevenue: toUsd(totalSales, exchangeRate),
      todaysSalesUSD: todaysSales.USD,
      todaysSalesSRD: todaysSales.SRD,
      salesTrend: getTrend(toUsd(todaysSales, exchangeRate), toUsd(yesterdaysSales, exchangeRate)),
      totalSalesTrend: getTrend(toUsd(thisMonthSales, exchangeRate), toUsd(lastMonthSales, exchangeRate)),
      weeklySalesTrend: getTrend(toUsd(thisWeekSales, exchangeRate), toUsd(lastWeekSales, exchangeRate)),
      weeklyGrossProfitUSD,
      weeklyGrossProfitTrend: getTrend(weeklyGrossProfitUSD, lastWeekGrossProfitUSD),
      weeklyNetProfitUSD,
      weeklyNetProfitTrend: getTrend(weeklyNetProfitUSD, lastWeekNetProfitUSD),
      exchangeRate,
      monthlySalesUSD,
      recentActivity: activity,
    }

    return NextResponse.json({ data: dashboardMetrics }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Dashboard metrics route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}