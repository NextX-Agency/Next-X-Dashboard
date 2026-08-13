import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { countableSaleItemWhere } from '@/lib/financialFilters'
import { normalizeExchangeRate } from '@/lib/pricing'
import {
  buildPurchasingCeiling,
  classifyInventoryRow,
  resolveThresholds,
  summariseInventory,
  THRESHOLD_SETTING_KEYS,
  type InventoryInputRow,
} from '@/lib/inventoryHealth'

/**
 * GET /api/finance/inventory-health
 *
 * Read-only. No schema change, no writes. Answers two questions the business
 * currently cannot ask: which stock is not moving, and whether purchasing is
 * outrunning what actually sells (F-25, F-28).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const settingRows = await prisma.storeSetting.findMany({
      where: { key: { in: Object.values(THRESHOLD_SETTING_KEYS) } },
      select: { key: true, value: true },
    })
    const thresholds = resolveThresholds(new Map(settingRows.map((row) => [row.key, row.value])))

    const now = new Date()
    const windowStart = new Date(now.getTime() - thresholds.windowDays * 24 * 60 * 60 * 1000)
    const cogsWindowStart = new Date(now)
    cogsWindowStart.setMonth(cogsWindowStart.getMonth() - thresholds.cogsWindowMonths)

    const [stockRows, soldRows, activeRate, cogsSaleItems, inventorySpend] = await Promise.all([
      prisma.stock.findMany({
        where: { quantity: { gt: 0 }, item: { deletedAt: null } },
        select: {
          quantity: true,
          item: { select: { id: true, name: true, purchasePriceUsd: true } },
          location: { select: { id: true, name: true } },
        },
      }),
      prisma.saleItem.findMany({
        where: countableSaleItemWhere({ sale: { createdAt: { gte: windowStart } } }),
        select: { itemId: true, quantity: true, sale: { select: { locationId: true } } },
      }),
      prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } }),
      prisma.saleItem.findMany({
        where: countableSaleItemWhere({ sale: { createdAt: { gte: cogsWindowStart } } }),
        select: {
          quantity: true,
          unitCostUsd: true,
          item: { select: { purchasePriceUsd: true } },
          sale: { select: { exchangeRate: true } },
        },
      }),
      // Stock purchases. `classification` is the right field, but it is still
      // 100% unused across every historical expense (F-20) until T-15 backfills
      // it, so the legacy "Business Expense" category has to count too.
      // Once T-15 lands the two agree and this stays correct either way.
      prisma.expense.findMany({
        where: {
          createdAt: { gte: cogsWindowStart },
          OR: [
            { classification: 'inventory' },
            { classification: 'unclassified', category: { name: 'Business Expense' } },
          ],
        },
        select: { amount: true, currency: true },
      }),
    ])

    // Velocity is per item AND location, matching the grain of the stock row.
    // Aggregating a product's sales across branches would credit a slow branch
    // with another branch's turnover and hide dead stock sitting there.
    const soldByItemLocation = new Map<string, number>()
    for (const line of soldRows) {
      const key = `${line.itemId}:${line.sale.locationId}`
      soldByItemLocation.set(key, (soldByItemLocation.get(key) ?? 0) + line.quantity)
    }

    const inputRows: InventoryInputRow[] = stockRows.map((row) => ({
      itemId: row.item.id,
      itemName: row.item.name,
      locationId: row.location.id,
      locationName: row.location.name,
      quantityOnHand: row.quantity,
      purchasePriceUsd: Number(row.item.purchasePriceUsd),
      unitsSoldInWindow: soldByItemLocation.get(`${row.item.id}:${row.location.id}`) ?? 0,
    }))

    const rows = inputRows
      .map((row) => classifyInventoryRow(row, thresholds))
      .sort((a, b) => b.cashTiedUpUsd - a.cashTiedUpUsd)
    const totals = summariseInventory(rows)

    const fallbackRate = normalizeExchangeRate(activeRate ? Number(activeRate.usdToSrd) : undefined)
    const cogsSrd = cogsSaleItems.reduce((sum, line) => {
      const rate = line.sale.exchangeRate === null ? fallbackRate : normalizeExchangeRate(Number(line.sale.exchangeRate))
      const unitCostUsd = line.unitCostUsd == null ? Number(line.item.purchasePriceUsd) : Number(line.unitCostUsd)
      return sum + line.quantity * unitCostUsd * rate
    }, 0)
    const spendSrd = inventorySpend.reduce((sum, expense) => (
      sum + (expense.currency === 'USD' ? Number(expense.amount) * fallbackRate : Number(expense.amount))
    ), 0)

    return NextResponse.json({
      data: {
        generatedAt: now.toISOString(),
        windowStart: windowStart.toISOString(),
        thresholds,
        totals,
        purchasingCeiling: buildPurchasingCeiling(cogsSrd, spendSrd, thresholds),
        rows,
      },
    })
  } catch (error) {
    console.error('Inventory health error:', error)
    return NextResponse.json({ error: 'Unable to build inventory health.' }, { status: 500 })
  }
}
