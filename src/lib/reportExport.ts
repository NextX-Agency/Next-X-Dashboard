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

export interface ReportExportData {
  period: ReportExportPeriod
  periodLabel: string
  periodStart: string
  periodEnd: string
  selectedLocationName: string
  generatedAt: string
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

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - PAGE_MARGIN

  const addPage = (sectionTitle?: string) => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - PAGE_MARGIN

    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 46,
      width: PAGE_WIDTH,
      height: 46,
      color: rgb(0.08, 0.11, 0.18),
    })
    page.drawText('NextX Report', {
      x: PAGE_MARGIN,
      y: PAGE_HEIGHT - 28,
      size: 15,
      font: boldFont,
      color: rgb(0.98, 0.98, 0.99),
    })
    page.drawText(data.periodLabel, {
      x: PAGE_WIDTH - PAGE_MARGIN - boldFont.widthOfTextAtSize(data.periodLabel, 10),
      y: PAGE_HEIGHT - 27,
      size: 10,
      font: boldFont,
      color: rgb(0.86, 0.89, 0.94),
    })

    y = PAGE_HEIGHT - 68

    if (sectionTitle) {
      page.drawText(sectionTitle, {
        x: PAGE_MARGIN,
        y,
        size: 14,
        font: boldFont,
        color: rgb(0.13, 0.17, 0.24),
      })
      y -= 18
    }
  }

  const ensureSpace = (requiredHeight: number, sectionTitle?: string) => {
    if (y - requiredHeight < PAGE_MARGIN) {
      addPage(sectionTitle)
    }
  }

  const drawTextLine = (text: string, size: number, options?: { x?: number; color?: ReturnType<typeof rgb>; font?: PDFFont }) => {
    page.drawText(text, {
      x: options?.x ?? PAGE_MARGIN,
      y,
      size,
      font: options?.font ?? regularFont,
      color: options?.color ?? rgb(0.23, 0.27, 0.33),
    })
    y -= size + 5
  }

  const drawMetricCard = (x: number, topY: number, width: number, height: number, title: string, lines: string[]) => {
    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      borderWidth: 1,
      borderColor: rgb(0.9, 0.91, 0.93),
      color: rgb(0.98, 0.98, 0.99),
    })
    page.drawText(title, {
      x: x + 14,
      y: topY - 20,
      size: 11,
      font: boldFont,
      color: rgb(0.13, 0.17, 0.24),
    })

    let lineY = topY - 38
    for (const line of lines) {
      page.drawText(line, {
        x: x + 14,
        y: lineY,
        size: 10,
        font: regularFont,
        color: rgb(0.29, 0.34, 0.4),
      })
      lineY -= 14
    }
  }

  const drawTable = (
    title: string,
    columns: Array<{ header: string; width: number; align?: 'left' | 'right' }>,
    rows: string[][],
  ) => {
    ensureSpace(70, title)
    page.drawText(title, {
      x: PAGE_MARGIN,
      y,
      size: 14,
      font: boldFont,
      color: rgb(0.13, 0.17, 0.24),
    })
    y -= 18

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
          color: rgb(0.13, 0.17, 0.24),
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
    y: PAGE_HEIGHT - 124,
    width: PAGE_WIDTH,
    height: 124,
    color: rgb(0.08, 0.11, 0.18),
  })
  page.drawRectangle({
    x: PAGE_WIDTH - 155,
    y: PAGE_HEIGHT - 124,
    width: 155,
    height: 124,
    color: rgb(0.98, 0.44, 0.08),
    opacity: 0.9,
  })
  page.drawText('NextX Sales Report', {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 54,
    size: 22,
    font: boldFont,
    color: rgb(0.99, 0.99, 0.99),
  })
  page.drawText(`${data.period === 'monthly' ? 'Monthly' : 'Yearly'} export for ${data.selectedLocationName}`, {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 78,
    size: 11,
    font: regularFont,
    color: rgb(0.88, 0.9, 0.94),
  })
  page.drawText(`Generated ${formatDateTime(data.generatedAt)}`, {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 96,
    size: 10,
    font: regularFont,
    color: rgb(0.8, 0.83, 0.88),
  })

  y = PAGE_HEIGHT - 150
  drawTextLine(`Period: ${data.periodStart} to ${data.periodEnd}`, 10, { font: boldFont, color: rgb(0.13, 0.17, 0.24) })
  drawTextLine(`Scope: ${data.selectedLocationName}`, 10)
  y -= 10

  const cardWidth = (CONTENT_WIDTH - 14) / 2
  const cardHeight = 74
  ensureSpace(170)
  const cardsTop = y
  drawMetricCard(PAGE_MARGIN, cardsTop, cardWidth, cardHeight, 'Sales Activity', [
    `${data.summary.totalSales.toLocaleString()} total sales`,
    `${data.summary.totalUnitsSold.toLocaleString()} units sold`,
  ])
  drawMetricCard(PAGE_MARGIN + cardWidth + 14, cardsTop, cardWidth, cardHeight, 'Revenue', [
    formatMoney(data.summary.totalRevenueSrd, 'SRD'),
    formatMoney(data.summary.totalRevenueUsd, 'USD'),
  ])
  drawMetricCard(PAGE_MARGIN, cardsTop - cardHeight - 14, cardWidth, cardHeight, 'Expenses', [
    formatMoney(data.summary.totalExpensesSrd, 'SRD'),
    formatMoney(data.summary.totalExpensesUsd, 'USD'),
  ])
  drawMetricCard(PAGE_MARGIN + cardWidth + 14, cardsTop - cardHeight - 14, cardWidth, cardHeight, 'Commissions', [
    formatMoney(data.summary.totalCommissionsSrd, 'SRD'),
    formatMoney(data.summary.totalCommissionsUsd, 'USD'),
  ])
  y = cardsTop - (cardHeight * 2) - 34

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

  return pdfDoc.save()
}