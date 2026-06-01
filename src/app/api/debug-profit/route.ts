import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import {
  calculateSaleFinancials,
  calculateScaledLineAmount,
  convertReportCurrency,
} from '@/lib/reportCalculations'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = request.nextUrl
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')

  const now = new Date()
  const startDate = startParam
    ? new Date(startParam + 'T00:00:00')
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = endParam
    ? new Date(endParam + 'T23:59:59.999')
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const [sales, allCategories] = await Promise.all([
    prisma.sale.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: {
        saleItems: {
          include: {
            item: { include: { category: true } },
          },
        },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
  ])

  // ─── Per-sale diagnostics ───────────────────────────────────────────
  const saleDetails = sales.map(sale => {
    const saleFinancials = calculateSaleFinancials({
      totalAmount: sale.totalAmount,
      currency: sale.currency,
      exchangeRate: sale.exchangeRate,
      fallbackRate: 40,
      items: sale.saleItems.map(si => ({
        subtotal: si.subtotal,
        quantity: si.quantity,
        purchasePriceUsd: si.item?.purchasePriceUsd ?? 0,
      })),
    })

    const itemBreakdown = sale.saleItems.map(si => {
      const item = si.item
      const scaledLineAmount = calculateScaledLineAmount(si.subtotal, saleFinancials)
      const revenueUSD = convertReportCurrency(
        scaledLineAmount,
        sale.currency,
        'USD',
        saleFinancials.exchangeRate,
      )

      if (!item) {
        // Item was deleted — we have no cost data
        return {
          itemId: si.itemId,
          itemName: '[item deleted from database]',
          categoryId: null,
          categoryName: '[deleted]',
          quantity: si.quantity,
          unitPrice: Number(si.unitPrice),
          subtotal: Number(si.subtotal),
          purchasePriceUsd: null,
          revenueUSD,
          costUSD: null,
          profitUSD: null,
          issue: 'ITEM_DELETED' as const,
        }
      }

      const purchasePriceUsd = Number(item.purchasePriceUsd)
      const costUSD = purchasePriceUsd * si.quantity
      const profitUSD = revenueUSD - costUSD

      const issue =
        purchasePriceUsd === 0
          ? ('NO_COGS' as const)
          : !item.categoryId
          ? ('NO_CATEGORY' as const)
          : null

      return {
        itemId: si.itemId,
        itemName: item.name,
        categoryId: item.categoryId,
        categoryName: item.category?.name ?? 'Uncategorized',
        quantity: si.quantity,
        unitPrice: Number(si.unitPrice),
        subtotal: Number(si.subtotal),
        purchasePriceUsd,
        revenueUSD,
        costUSD,
        profitUSD,
        issue,
      }
    })

    const missingItems = itemBreakdown.length === 0 && Number(sale.totalAmount) > 0

    return {
      saleId: sale.id,
      date: sale.createdAt,
      totalAmount: Number(sale.totalAmount),
      recordedTotalUSD: Math.round(saleFinancials.revenueUsd * 100) / 100,
      currency: sale.currency,
      exchangeRate: saleFinancials.exchangeRate,
      locationName: sale.location?.name ?? 'Unknown',
      totalRevenueUSD: saleFinancials.revenueUsd,
      totalProfitUSD: saleFinancials.grossProfitUsd,
      grossMarginPct:
        saleFinancials.revenueUsd > 0
          ? (saleFinancials.grossProfitUsd / saleFinancials.revenueUsd) * 100
          : 0,
      missingItems,
      items: itemBreakdown,
      issues: [
        ...(missingItems
          ? [{ item: 'ALL ITEMS', issue: 'MISSING_SALE_ITEMS' as const }]
          : []),
        ...itemBreakdown
          .filter(i => i.issue)
          .map(i => ({ item: i.itemName, issue: i.issue })),
      ],
    }
  })

  // ─── Category breakdown (server-side, bypasses RLS) ────────────────
  const categoryMap = new Map<
    string,
    { categoryId: string | null; name: string; revenueUSD: number; profitUSD: number; salesCount: number }
  >()
  saleDetails.forEach(sale => {
    sale.items.forEach(si => {
      if (si.issue === 'ITEM_DELETED') return
      const key = si.categoryId ?? '__uncategorized__'
      const existing = categoryMap.get(key)
      const profit = si.profitUSD ?? 0
      if (existing) {
        existing.revenueUSD += si.revenueUSD
        existing.profitUSD += profit
        existing.salesCount++
      } else {
        categoryMap.set(key, {
          categoryId: si.categoryId,
          name: si.categoryName,
          revenueUSD: si.revenueUSD,
          profitUSD: profit,
          salesCount: 1,
        })
      }
    })
  })

  const categoryBreakdown = Array.from(categoryMap.values())
    .map(c => ({
      ...c,
      marginPct: c.revenueUSD > 0 ? (c.profitUSD / c.revenueUSD) * 100 : 0,
    }))
    .sort((a, b) => b.revenueUSD - a.revenueUSD)

  // ─── Summary ────────────────────────────────────────────────────────
  const totalRevenueUSD = saleDetails.reduce((s, sale) => s + sale.totalRevenueUSD, 0)
  const totalProfitUSD = saleDetails.reduce((s, sale) => s + sale.totalProfitUSD, 0)
  const salesWithIssues = saleDetails.filter(s => s.issues.length > 0)
  const deletedItems = saleDetails.flatMap(s => s.items.filter(i => i.issue === 'ITEM_DELETED'))
  const noCOGSItems = saleDetails.flatMap(s => s.items.filter(i => i.issue === 'NO_COGS'))
  const noCategoryItems = saleDetails.flatMap(s => s.items.filter(i => i.issue === 'NO_CATEGORY'))
  const salesMissingItems = saleDetails.filter(s => s.missingItems)

  return NextResponse.json({
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: {
      totalSales: saleDetails.length,
      totalRevenueUSD: Math.round(totalRevenueUSD * 100) / 100,
      totalProfitUSD: Math.round(totalProfitUSD * 100) / 100,
      grossMarginPct:
        totalRevenueUSD > 0
          ? Math.round((totalProfitUSD / totalRevenueUSD) * 10000) / 100
          : 0,
      salesWithIssues: salesWithIssues.length,
      issueCount: {
        missingSaleItems: salesMissingItems.length,
        deletedItems: deletedItems.length,
        noCOGS: noCOGSItems.length,
        noCategory: noCategoryItems.length,
      },
      salesMissingItems: salesMissingItems.map(s => ({
        saleId: s.saleId,
        date: s.date,
        locationName: s.locationName,
        currency: s.currency,
        recordedTotal: s.totalAmount,
        recordedTotalUSD: s.recordedTotalUSD,
      })),
    },
    categoryBreakdown,
    allCategories: allCategories.map(c => ({ id: c.id, name: c.name })),
    sales: saleDetails,
  })
}
