import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  DashboardGrowth,
  GrowthCatalog,
  GrowthCatalogType,
  GrowthMonth,
  GrowthStagnantSku,
} from '@/types/growth'

const DEFAULT_EXCHANGE_RATE = 40

/** Trailing window every catalogue and stagnation figure is measured over. */
const WINDOW_DAYS = 90

/** How many stalled SKUs the dashboard lists before linking out to stock. */
const STAGNANT_LIMIT = 6

const MONTHS_SHOWN = 6

const CATALOG_LABELS: Record<GrowthCatalogType, string> = {
  audio: 'Audio',
  watches: 'Watches',
}

function toNum(value: unknown): number {
  if (value == null) return 0
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0
}

type MonthRow = { month_key: string; revenue_srd: unknown; sale_count: unknown }
type CatalogRevenueRow = {
  catalog_type: string
  revenue_srd: unknown
  units_sold: unknown
  sales_count: unknown
  skus_sold: unknown
}
type CatalogStockRow = {
  catalog_type: string
  stock_units: unknown
  stock_cost_srd: unknown
  skus_in_stock: unknown
}
type StagnantRow = {
  id: string
  name: string
  catalog_type: string
  units_on_hand: unknown
  stock_cost_srd: unknown
  last_sold_at: Date | null
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const activeRate = await prisma.exchangeRate.findFirst({
      where: { isActive: true },
      orderBy: { setAt: 'desc' },
    })
    const exchangeRate = toNum(activeRate?.usdToSrd) || DEFAULT_EXCHANGE_RATE

    // Every revenue figure below converts a USD sale at the rate recorded on
    // that sale, falling back to the active rate. Converting historic sales at
    // today's rate restates months that are already closed.
    const saleRateSql = Prisma.sql`coalesce(s.exchange_rate, ${exchangeRate}::numeric)`
    const saleRevenueSql = Prisma.sql`
      case when s.currency = 'USD' then s.total_amount * ${saleRateSql} else s.total_amount end
    `
    // Matches COUNTABLE_SALE. A sale flagged for review has an untrustworthy
    // record and must not move a growth signal.
    const countable = Prisma.sql`s.status = 'posted' and s.needs_review = false`

    const [monthRows, catalogRevenueRows, catalogStockRows, stagnantRows, reservationRows] =
      await Promise.all([
        prisma.$queryRaw<MonthRow[]>(Prisma.sql`
          select to_char(s.created_at, 'YYYY-MM') as month_key,
                 sum(${saleRevenueSql}) as revenue_srd,
                 count(*) as sale_count
          from sales s
          where ${countable}
            and s.created_at >= date_trunc('month', now()) - make_interval(months => ${MONTHS_SHOWN - 1})
          group by 1
          order by 1
        `),

        prisma.$queryRaw<CatalogRevenueRow[]>(Prisma.sql`
          select i.catalog_type,
                 sum(case when s.currency = 'USD' then si.subtotal * ${saleRateSql} else si.subtotal end) as revenue_srd,
                 sum(si.quantity) as units_sold,
                 count(distinct s.id) as sales_count,
                 count(distinct i.id) as skus_sold
          from sale_items si
          join sales s on s.id = si.sale_id
          join items i on i.id = si.item_id
          where ${countable}
            and s.created_at >= now() - make_interval(days => ${WINDOW_DAYS})
          group by 1
        `),

        prisma.$queryRaw<CatalogStockRow[]>(Prisma.sql`
          select i.catalog_type,
                 sum(st.quantity) as stock_units,
                 sum(st.quantity * i.purchase_price_usd) * ${exchangeRate}::numeric as stock_cost_srd,
                 count(distinct i.id) filter (where st.quantity > 0) as skus_in_stock
          from stock st
          join items i on i.id = st.item_id
          where i.deleted_at is null
          group by 1
        `),

        prisma.$queryRaw<StagnantRow[]>(Prisma.sql`
          with on_hand as (
            select i.id, i.name, i.catalog_type,
                   sum(st.quantity) as units_on_hand,
                   sum(st.quantity * i.purchase_price_usd) * ${exchangeRate}::numeric as stock_cost_srd
            from stock st
            join items i on i.id = st.item_id
            where i.deleted_at is null
            group by i.id, i.name, i.catalog_type
            having sum(st.quantity) > 0
          ),
          last_sale as (
            select si.item_id, max(s.created_at) as last_sold_at
            from sale_items si
            join sales s on s.id = si.sale_id
            where ${countable}
            group by si.item_id
          )
          select on_hand.id, on_hand.name, on_hand.catalog_type,
                 on_hand.units_on_hand, on_hand.stock_cost_srd,
                 last_sale.last_sold_at
          from on_hand
          left join last_sale on last_sale.item_id = on_hand.id
          where last_sale.last_sold_at is null
             or last_sale.last_sold_at < now() - make_interval(days => ${WINDOW_DAYS})
          order by on_hand.stock_cost_srd desc
        `),

        prisma.reservation.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
      ])

    // ── Months ───────────────────────────────────────────────
    const currentMonthKey = new Date().toISOString().slice(0, 7)
    const months: GrowthMonth[] = monthRows.map((row, index) => {
      const revenueSrd = toNum(row.revenue_srd)
      const previous = index > 0 ? toNum(monthRows[index - 1].revenue_srd) : null
      const [year, month] = row.month_key.split('-')
      return {
        monthKey: row.month_key,
        label: new Date(Number(year), Number(month) - 1, 1)
          .toLocaleDateString('en-US', { month: 'short' }),
        revenueSrd,
        saleCount: toNum(row.sale_count),
        changePct: previous && previous !== 0
          ? ((revenueSrd - previous) / Math.abs(previous)) * 100
          : null,
        isPartial: row.month_key === currentMonthKey,
      }
    })

    // A month still running is not a data point to be beaten — comparing a
    // 23-day month against a full one reads as a collapse that has not happened.
    const completeMonths = months.filter((month) => !month.isPartial)
    const bestMonth = completeMonths.reduce<GrowthMonth | null>(
      (best, month) => (best === null || month.revenueSrd > best.revenueSrd ? month : best),
      null,
    )

    // ── Catalogues ───────────────────────────────────────────
    const revenueByCatalog = new Map(catalogRevenueRows.map((row) => [row.catalog_type, row]))
    const stockByCatalog = new Map(catalogStockRows.map((row) => [row.catalog_type, row]))

    const stagnantByCatalog = new Map<string, number>()
    for (const row of stagnantRows) {
      stagnantByCatalog.set(row.catalog_type, (stagnantByCatalog.get(row.catalog_type) ?? 0) + 1)
    }

    const catalogKeys = [...new Set([
      ...catalogRevenueRows.map((row) => row.catalog_type),
      ...catalogStockRows.map((row) => row.catalog_type),
    ])].filter((key): key is GrowthCatalogType => key === 'audio' || key === 'watches')

    const totalRevenue = catalogRevenueRows.reduce((sum, row) => sum + toNum(row.revenue_srd), 0)
    const totalCapital = catalogStockRows.reduce((sum, row) => sum + toNum(row.stock_cost_srd), 0)

    const catalogs: GrowthCatalog[] = catalogKeys.map((catalog) => {
      const revenueRow = revenueByCatalog.get(catalog)
      const stockRow = stockByCatalog.get(catalog)
      const revenueSrd = toNum(revenueRow?.revenue_srd)
      const stockCostSrd = toNum(stockRow?.stock_cost_srd)

      return {
        catalog,
        label: CATALOG_LABELS[catalog],
        revenueSrd,
        unitsSold: toNum(revenueRow?.units_sold),
        salesCount: toNum(revenueRow?.sales_count),
        revenueSharePct: share(revenueSrd, totalRevenue),
        stockUnits: toNum(stockRow?.stock_units),
        stockCostSrd,
        capitalSharePct: share(stockCostSrd, totalCapital),
        skusInStock: toNum(stockRow?.skus_in_stock),
        stagnantSkus: stagnantByCatalog.get(catalog) ?? 0,
        capitalTurn: stockCostSrd > 0 ? revenueSrd / stockCostSrd : null,
      }
    }).sort((left, right) => right.revenueSrd - left.revenueSrd)

    // ── Stalled stock ────────────────────────────────────────
    const now = Date.now()
    const stagnant: GrowthStagnantSku[] = stagnantRows.slice(0, STAGNANT_LIMIT).map((row) => ({
      id: row.id,
      name: row.name,
      catalog: row.catalog_type,
      unitsOnHand: toNum(row.units_on_hand),
      stockCostSrd: toNum(row.stock_cost_srd),
      lastSoldAt: row.last_sold_at ? row.last_sold_at.toISOString() : null,
      daysSinceSale: row.last_sold_at
        ? Math.floor((now - row.last_sold_at.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    }))

    const stagnantTotalCostSrd = stagnantRows.reduce((sum, row) => sum + toNum(row.stock_cost_srd), 0)

    // ── Reservations ─────────────────────────────────────────
    const reservationCount = (status: string) =>
      reservationRows.find((row) => row.status === status)?._count._all ?? 0
    const completed = reservationCount('completed')
    const cancelled = reservationCount('cancelled')
    const pending = reservationCount('pending') + reservationCount('confirmed')
    const decided = completed + cancelled

    const growth: DashboardGrowth = {
      generatedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      exchangeRate,
      months,
      bestMonth,
      catalogs,
      stagnant,
      stagnantTotalCostSrd,
      reservations: {
        completed,
        cancelled,
        pending,
        conversionPct: decided > 0 ? (completed / decided) * 100 : null,
      },
    }

    return NextResponse.json({ data: growth }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Dashboard growth route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
