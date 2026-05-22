import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

type ExportPeriod = 'monthly' | 'yearly'

const DEFAULT_EXCHANGE_RATE = 40

function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value)
}

function getBounds(period: ExportPeriod, now: Date) {
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

function csvEscape(value: unknown): string {
  const stringValue = value == null ? '' : String(value)
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

function buildCsv(rows: Record<string, unknown>[], headers: string[]) {
  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','))
  }

  return `\uFEFF${lines.join('\n')}`
}

function sanitizeFilenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'all-locations'
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const period = request.nextUrl.searchParams.get('period') as ExportPeriod | null
    const locationId = request.nextUrl.searchParams.get('locationId') || ''

    if (!period || !['monthly', 'yearly'].includes(period)) {
      return NextResponse.json(
        { error: 'Provide a valid export period: monthly or yearly.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const bounds = getBounds(period, now)
    const salesWhere = {
      createdAt: {
        gte: bounds.start,
        lte: bounds.end,
      },
      ...(locationId ? { locationId } : {}),
    }

    const [sales, expenses, locations] = await Promise.all([
      prisma.sale.findMany({
        where: salesWhere,
        select: {
          id: true,
          locationId: true,
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
        },
      }),
      prisma.location.findMany({
        select: { id: true, name: true },
      }),
    ])

    const saleIds = sales.map((sale) => sale.id)
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

    const locationNameById = new Map(locations.map((location) => [location.id, location.name]))
    const selectedLocationName = locationId ? locationNameById.get(locationId) || 'Unknown location' : 'All locations'
    const periodLabel = period === 'monthly'
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      : String(now.getFullYear())

    const itemRows = new Map<string, {
      locationName: string
      itemName: string
      categoryName: string
      quantitySold: number
      salesCount: number
      revenueSrd: number
      revenueUsd: number
    }>()
    const locationRows = new Map<string, { locationName: string; salesCount: number; quantitySold: number; revenueSrd: number; revenueUsd: number }>()
    const paymentRows = new Map<string, { paymentMethod: string; salesCount: number; revenueSrd: number; revenueUsd: number }>()

    let totalQuantitySold = 0
    let totalRevenueSrd = 0
    let totalRevenueUsd = 0

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

        totalQuantitySold += saleItem.quantity
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

    const generatedAt = new Date().toISOString()
    const rows: Record<string, unknown>[] = []

    const pushSummaryRow = (metric: string, value: number | string) => {
      rows.push({
        row_type: 'summary',
        report_period: period,
        period_label: periodLabel,
        period_start: bounds.start.toISOString().slice(0, 10),
        period_end: bounds.end.toISOString().slice(0, 10),
        selected_location: selectedLocationName,
        location_name: '',
        item_name: '',
        category_name: '',
        payment_method: '',
        quantity_sold: '',
        sales_count: '',
        revenue_srd: '',
        revenue_usd: '',
        avg_unit_price_srd: '',
        avg_unit_price_usd: '',
        metric,
        value,
        generated_at: generatedAt,
      })
    }

    pushSummaryRow('total_sales', sales.length)
    pushSummaryRow('total_units_sold', totalQuantitySold)
    pushSummaryRow('total_revenue_srd', totalRevenueSrd.toFixed(2))
    pushSummaryRow('total_revenue_usd', totalRevenueUsd.toFixed(2))
    pushSummaryRow('total_expenses_srd', totalExpensesSrd.toFixed(2))
    pushSummaryRow('total_expenses_usd', totalExpensesUsd.toFixed(2))
    pushSummaryRow('total_commissions_srd', totalCommissionsSrd.toFixed(2))
    pushSummaryRow('total_commissions_usd', totalCommissionsUsd.toFixed(2))

    Array.from(locationRows.values())
      .sort((left, right) => right.revenueUsd - left.revenueUsd)
      .forEach((locationRow) => {
        rows.push({
          row_type: 'location_summary',
          report_period: period,
          period_label: periodLabel,
          period_start: bounds.start.toISOString().slice(0, 10),
          period_end: bounds.end.toISOString().slice(0, 10),
          selected_location: selectedLocationName,
          location_name: locationRow.locationName,
          item_name: '',
          category_name: '',
          payment_method: '',
          quantity_sold: locationRow.quantitySold,
          sales_count: locationRow.salesCount,
          revenue_srd: locationRow.revenueSrd.toFixed(2),
          revenue_usd: locationRow.revenueUsd.toFixed(2),
          avg_unit_price_srd: locationRow.quantitySold > 0 ? (locationRow.revenueSrd / locationRow.quantitySold).toFixed(2) : '',
          avg_unit_price_usd: locationRow.quantitySold > 0 ? (locationRow.revenueUsd / locationRow.quantitySold).toFixed(2) : '',
          metric: '',
          value: '',
          generated_at: generatedAt,
        })
      })

    Array.from(paymentRows.values())
      .sort((left, right) => right.revenueUsd - left.revenueUsd)
      .forEach((paymentRow) => {
        rows.push({
          row_type: 'payment_method',
          report_period: period,
          period_label: periodLabel,
          period_start: bounds.start.toISOString().slice(0, 10),
          period_end: bounds.end.toISOString().slice(0, 10),
          selected_location: selectedLocationName,
          location_name: '',
          item_name: '',
          category_name: '',
          payment_method: paymentRow.paymentMethod,
          quantity_sold: '',
          sales_count: paymentRow.salesCount,
          revenue_srd: paymentRow.revenueSrd.toFixed(2),
          revenue_usd: paymentRow.revenueUsd.toFixed(2),
          avg_unit_price_srd: '',
          avg_unit_price_usd: '',
          metric: '',
          value: '',
          generated_at: generatedAt,
        })
      })

    Array.from(itemRows.values())
      .sort((left, right) => right.revenueUsd - left.revenueUsd)
      .forEach((itemRow) => {
        rows.push({
          row_type: 'item_sale',
          report_period: period,
          period_label: periodLabel,
          period_start: bounds.start.toISOString().slice(0, 10),
          period_end: bounds.end.toISOString().slice(0, 10),
          selected_location: selectedLocationName,
          location_name: itemRow.locationName,
          item_name: itemRow.itemName,
          category_name: itemRow.categoryName,
          payment_method: '',
          quantity_sold: itemRow.quantitySold,
          sales_count: itemRow.salesCount,
          revenue_srd: itemRow.revenueSrd.toFixed(2),
          revenue_usd: itemRow.revenueUsd.toFixed(2),
          avg_unit_price_srd: itemRow.quantitySold > 0 ? (itemRow.revenueSrd / itemRow.quantitySold).toFixed(2) : '',
          avg_unit_price_usd: itemRow.quantitySold > 0 ? (itemRow.revenueUsd / itemRow.quantitySold).toFixed(2) : '',
          metric: '',
          value: '',
          generated_at: generatedAt,
        })
      })

    const headers = [
      'row_type',
      'report_period',
      'period_label',
      'period_start',
      'period_end',
      'selected_location',
      'location_name',
      'item_name',
      'category_name',
      'payment_method',
      'quantity_sold',
      'sales_count',
      'revenue_srd',
      'revenue_usd',
      'avg_unit_price_srd',
      'avg_unit_price_usd',
      'metric',
      'value',
      'generated_at',
    ]
    const csv = buildCsv(rows, headers)
    const filename = `nextx-${period}-report-${periodLabel}-${sanitizeFilenamePart(selectedLocationName)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Report export error:', error)
    return NextResponse.json(
      { error: 'Failed to export report' },
      { status: 500 }
    )
  }
}