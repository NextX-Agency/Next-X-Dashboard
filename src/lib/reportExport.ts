import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { prisma } from '@/lib/prisma'

export type ReportExportPeriod = 'monthly' | 'yearly'
export type ReportExportFormat = 'csv' | 'pdf'

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
  totalExpensesSrd: number
  totalExpensesUsd: number
  totalCommissionsSrd: number
  totalCommissionsUsd: number
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

function csvEscape(value: unknown): string {
  const stringValue = value == null ? '' : String(value)
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

function truncateText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text

  let current = text
  while (current.length > 0 && font.widthOfTextAtSize(`${current}...`, size) > maxWidth) {
    current = current.slice(0, -1)
  }

  return current ? `${current}...` : ''
}

export function getReportExportFilename(data: ReportExportData, format: ReportExportFormat) {
  return `nextx-${data.period}-report-${data.periodLabel}-${sanitizeFilenamePart(data.selectedLocationName)}.${format}`
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

  const [sales, expenses, locations, settings] = await Promise.all([
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
  const settingsMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]))

  const itemRows = new Map<string, ReportExportItemRow>()
  const locationRows = new Map<string, ReportExportLocationRow>()
  const paymentRows = new Map<string, ReportExportPaymentRow>()

  let totalUnitsSold = 0
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
      totalExpensesSrd,
      totalExpensesUsd,
      totalCommissionsSrd,
      totalCommissionsUsd,
    },
    locations: Array.from(locationRows.values()).sort((left, right) => right.revenueUsd - left.revenueUsd),
    payments: Array.from(paymentRows.values()).sort((left, right) => right.revenueUsd - left.revenueUsd),
    items: Array.from(itemRows.values()).sort((left, right) => right.revenueUsd - left.revenueUsd),
  }
}

export function buildReportCsv(data: ReportExportData) {
  const rows: Record<string, unknown>[] = []

  const pushSummaryRow = (metric: string, value: number | string) => {
    rows.push({
      row_type: 'summary',
      report_period: data.period,
      period_label: data.periodLabel,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      selected_location: data.selectedLocationName,
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
      generated_at: data.generatedAt,
    })
  }

  pushSummaryRow('total_sales', data.summary.totalSales)
  pushSummaryRow('total_units_sold', data.summary.totalUnitsSold)
  pushSummaryRow('total_revenue_srd', data.summary.totalRevenueSrd.toFixed(2))
  pushSummaryRow('total_revenue_usd', data.summary.totalRevenueUsd.toFixed(2))
  pushSummaryRow('total_expenses_srd', data.summary.totalExpensesSrd.toFixed(2))
  pushSummaryRow('total_expenses_usd', data.summary.totalExpensesUsd.toFixed(2))
  pushSummaryRow('total_commissions_srd', data.summary.totalCommissionsSrd.toFixed(2))
  pushSummaryRow('total_commissions_usd', data.summary.totalCommissionsUsd.toFixed(2))

  data.locations.forEach((locationRow) => {
    rows.push({
      row_type: 'location_summary',
      report_period: data.period,
      period_label: data.periodLabel,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      selected_location: data.selectedLocationName,
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
      generated_at: data.generatedAt,
    })
  })

  data.payments.forEach((paymentRow) => {
    rows.push({
      row_type: 'payment_method',
      report_period: data.period,
      period_label: data.periodLabel,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      selected_location: data.selectedLocationName,
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
      generated_at: data.generatedAt,
    })
  })

  data.items.forEach((itemRow) => {
    rows.push({
      row_type: 'item_sale',
      report_period: data.period,
      period_label: data.periodLabel,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      selected_location: data.selectedLocationName,
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
      generated_at: data.generatedAt,
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

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','))
  }

  return `\uFEFF${lines.join('\n')}`
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

  const netSrd = data.summary.totalRevenueSrd - data.summary.totalExpensesSrd - data.summary.totalCommissionsSrd
  const netUsd = data.summary.totalRevenueUsd - data.summary.totalExpensesUsd - data.summary.totalCommissionsUsd
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
  drawMetricCard(PAGE_MARGIN + cardWidth + 14, cardsTop, cardWidth, cardHeight, 'Net Position', formatMoney(netUsd, 'USD'), `${formatMoney(netSrd, 'SRD')} after expenses and commissions`, darkMuted)
  drawMetricCard(PAGE_MARGIN, cardsTop - cardHeight - 14, cardWidth, cardHeight, 'Sales Activity', `${data.summary.totalSales.toLocaleString()} sales`, `${data.summary.totalUnitsSold.toLocaleString()} units sold in this period`, rgb(0.11, 0.55, 0.33))
  drawMetricCard(PAGE_MARGIN + cardWidth + 14, cardsTop - cardHeight - 14, cardWidth, cardHeight, 'Cost Pressure', formatMoney(data.summary.totalExpensesUsd + data.summary.totalCommissionsUsd, 'USD'), `${formatMoney(data.summary.totalExpensesUsd, 'USD')} expenses • ${formatMoney(data.summary.totalCommissionsUsd, 'USD')} commissions`, rgb(0.62, 0.2, 0.2))
  y = cardsTop - (cardHeight * 2) - 28

  drawInsightPanel('Key Signals', [
    `Average sale value: ${formatMoney(avgSaleUsd, 'USD')} • ${formatMoney(avgSaleSrd, 'SRD')}.`,
    `Average unit revenue: ${formatMoney(avgUnitUsd, 'USD')} • ${formatMoney(avgUnitSrd, 'SRD')}.`,
    topLocation ? `Top location: ${topLocation.locationName} with ${formatMoney(topLocation.revenueUsd, 'USD')} across ${topLocation.salesCount.toLocaleString()} sales.` : 'Top location: no sales recorded in this period.',
    topItem ? `Top item: ${topItem.itemName} (${topItem.quantitySold.toLocaleString()} units • ${formatMoney(topItem.revenueUsd, 'USD')}).` : 'Top item: no item sales recorded in this period.',
    topPayment ? `Strongest payment method: ${topPayment.paymentMethod} at ${formatMoney(topPayment.revenueUsd, 'USD')}.` : 'Payment methods: no payment mix recorded in this period.',
  ])

  drawInsightPanel('Report Context', [
    `Brand: ${data.branding.storeName}.`,
    `Coverage window: ${data.periodStart} through ${data.periodEnd}.`,
    `Scope: ${data.selectedLocationName}.`,
    data.branding.storeAddress ? `Address: ${data.branding.storeAddress}.` : 'Address: not configured in store settings.',
    data.branding.storeEmail ? `Contact: ${data.branding.storeEmail}.` : 'Contact: no report email configured in store settings.',
  ])

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