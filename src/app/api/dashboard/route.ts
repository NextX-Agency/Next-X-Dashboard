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
  if (previousAmount > 0) {
    return ((currentAmount - previousAmount) / previousAmount) * 100
  }

  return currentAmount > 0 ? 100 : 0
}

function getCurrency(value: string): Currency {
  return value === 'SRD' ? 'SRD' : 'USD'
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
      thisMonthSalesByCurrency,
      lastMonthSalesByCurrency,
      currentYearSales,
      recentSales,
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
    ])

    const exchangeRate = toNumber(currentRate?.usdToSrd) || DEFAULT_EXCHANGE_RATE
    const totalSales = getCurrencyTotals(totalSalesByCurrency)
    const todaysSales = getCurrencyTotals(todaysSalesByCurrency)
    const yesterdaysSales = getCurrencyTotals(yesterdaysSalesByCurrency)
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
      activeOrders,
      stockItems,
      lowStockItems,
      outOfStockItems,
      totalRevenue: toUsd(totalSales, exchangeRate),
      todaysSalesUSD: todaysSales.USD,
      todaysSalesSRD: todaysSales.SRD,
      salesTrend: getTrend(toUsd(todaysSales, exchangeRate), toUsd(yesterdaysSales, exchangeRate)),
      totalSalesTrend: getTrend(toUsd(thisMonthSales, exchangeRate), toUsd(lastMonthSales, exchangeRate)),
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