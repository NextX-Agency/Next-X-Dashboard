/**
 * Inventory health: what is on the shelf, how fast it moves, and how much cash
 * is stuck in it (F-25, F-28).
 *
 * The arithmetic lives here as pure functions so it can be checked without a
 * database. The route supplies the rows; this file decides what they mean.
 */

export type InventoryStatus = 'out' | 'dead' | 'overstocked' | 'low' | 'healthy'

export interface InventoryThresholds {
  /** Sales window used to measure velocity. */
  windowDays: number
  /** Days of cover above which stock counts as overstocked. */
  overstockDays: number
  /** Days of cover below which stock counts as low. */
  lowDays: number
  /** Buffer added to trailing COGS to form the purchasing ceiling, in percent. */
  restockBufferPct: number
  /** Months of COGS the purchasing ceiling averages over. */
  cogsWindowMonths: number
}

export const DEFAULT_THRESHOLDS: InventoryThresholds = {
  windowDays: 90,
  overstockDays: 120,
  lowDays: 14,
  restockBufferPct: 15,
  cogsWindowMonths: 3,
}

/** Settings keys, so thresholds can be tuned without a deploy. */
export const THRESHOLD_SETTING_KEYS: Record<keyof InventoryThresholds, string> = {
  windowDays: 'finance.inventory.window_days',
  overstockDays: 'finance.inventory.overstock_days',
  lowDays: 'finance.inventory.low_days',
  restockBufferPct: 'finance.inventory.restock_buffer_pct',
  cogsWindowMonths: 'finance.inventory.cogs_window_months',
}

export function resolveThresholds(settings: Map<string, string>): InventoryThresholds {
  const read = (key: keyof InventoryThresholds) => {
    const raw = settings.get(THRESHOLD_SETTING_KEYS[key])
    const parsed = Number(raw)
    return raw !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLDS[key]
  }
  return {
    windowDays: read('windowDays'),
    overstockDays: read('overstockDays'),
    lowDays: read('lowDays'),
    // A zero buffer is a legitimate choice, so this one is read separately.
    restockBufferPct: (() => {
      const raw = settings.get(THRESHOLD_SETTING_KEYS.restockBufferPct)
      const parsed = Number(raw)
      return raw !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_THRESHOLDS.restockBufferPct
    })(),
    cogsWindowMonths: read('cogsWindowMonths'),
  }
}

export interface InventoryInputRow {
  itemId: string
  itemName: string
  locationId: string
  locationName: string
  quantityOnHand: number
  purchasePriceUsd: number
  unitsSoldInWindow: number
  /** T-09 flags items whose cost is unknown; their cash figures are not trustworthy. */
  needsReview?: boolean
}

export interface InventoryHealthRow extends InventoryInputRow {
  dailyVelocity: number
  /** Null when nothing has sold — dividing by zero velocity has no meaning. */
  daysOfCover: number | null
  cashTiedUpUsd: number
  excessUnits: number
  excessCashUsd: number
  status: InventoryStatus
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function classifyInventoryRow(row: InventoryInputRow, thresholds: InventoryThresholds): InventoryHealthRow {
  const quantityOnHand = Number(row.quantityOnHand) || 0
  const purchasePriceUsd = Number(row.purchasePriceUsd) || 0
  const dailyVelocity = Number(row.unitsSoldInWindow) / thresholds.windowDays
  const daysOfCover = dailyVelocity > 0 ? quantityOnHand / dailyVelocity : null

  let status: InventoryStatus
  if (quantityOnHand <= 0) status = 'out'
  else if (dailyVelocity === 0) status = 'dead'
  else if (daysOfCover !== null && daysOfCover > thresholds.overstockDays) status = 'overstocked'
  else if (daysOfCover !== null && daysOfCover < thresholds.lowDays) status = 'low'
  else status = 'healthy'

  // Dead stock is excess in full. Overstock is only excess in its tail: keeping
  // `overstockDays` of cover is deliberate, everything beyond it is not.
  let excessUnits = 0
  if (status === 'dead') excessUnits = quantityOnHand
  else if (status === 'overstocked') {
    excessUnits = Math.max(quantityOnHand - Math.ceil(dailyVelocity * thresholds.overstockDays), 0)
  }

  return {
    ...row,
    dailyVelocity,
    daysOfCover,
    cashTiedUpUsd: round2(quantityOnHand * purchasePriceUsd),
    excessUnits,
    excessCashUsd: round2(excessUnits * purchasePriceUsd),
    status,
  }
}

export interface InventoryHealthTotals {
  rows: number
  cashTiedUpUsd: number
  deadCashUsd: number
  overstockedCashUsd: number
  /**
   * Cash sitting in stock that is either dead or overstocked — the money the
   * business could get back by clearing it.
   *
   * Note this is the full carrying value of those rows, not `excessCashUsd`.
   * The two answer different questions: releasable is "how much is parked in
   * lines that are not working", excess is "how many units beyond a sensible
   * cover should be cleared". Both are reported.
   */
  releasableCashUsd: number
  excessCashUsd: number
  byStatus: Record<InventoryStatus, { rows: number; cashTiedUpUsd: number; excessCashUsd: number }>
}

export function summariseInventory(rows: InventoryHealthRow[]): InventoryHealthTotals {
  const byStatus = {
    out: { rows: 0, cashTiedUpUsd: 0, excessCashUsd: 0 },
    dead: { rows: 0, cashTiedUpUsd: 0, excessCashUsd: 0 },
    overstocked: { rows: 0, cashTiedUpUsd: 0, excessCashUsd: 0 },
    low: { rows: 0, cashTiedUpUsd: 0, excessCashUsd: 0 },
    healthy: { rows: 0, cashTiedUpUsd: 0, excessCashUsd: 0 },
  } satisfies InventoryHealthTotals['byStatus']

  for (const row of rows) {
    const bucket = byStatus[row.status]
    bucket.rows += 1
    bucket.cashTiedUpUsd = round2(bucket.cashTiedUpUsd + row.cashTiedUpUsd)
    bucket.excessCashUsd = round2(bucket.excessCashUsd + row.excessCashUsd)
  }

  return {
    rows: rows.length,
    cashTiedUpUsd: round2(rows.reduce((sum, row) => sum + row.cashTiedUpUsd, 0)),
    deadCashUsd: byStatus.dead.cashTiedUpUsd,
    overstockedCashUsd: byStatus.overstocked.cashTiedUpUsd,
    releasableCashUsd: round2(byStatus.dead.cashTiedUpUsd + byStatus.overstocked.cashTiedUpUsd),
    excessCashUsd: round2(rows.reduce((sum, row) => sum + row.excessCashUsd, 0)),
    byStatus,
  }
}

export interface PurchasingCeiling {
  windowMonths: number
  bufferPct: number
  /** Average monthly cost of goods actually sold in the window, in SRD. */
  monthlyCogsSrd: number
  /** monthlyCogsSrd × (1 + bufferPct/100). Stock purchases should stay under this. */
  monthlyCeilingSrd: number
  /** Average monthly spend on stock purchases in the same window, in SRD. */
  monthlySpendSrd: number
  /** Positive means overspending against the ceiling. */
  monthlyOverspendSrd: number
}

export function buildPurchasingCeiling(
  cogsSrdInWindow: number,
  spendSrdInWindow: number,
  thresholds: InventoryThresholds,
): PurchasingCeiling {
  const months = Math.max(thresholds.cogsWindowMonths, 1)
  const monthlyCogsSrd = round2(cogsSrdInWindow / months)
  const monthlyCeilingSrd = round2(monthlyCogsSrd * (1 + thresholds.restockBufferPct / 100))
  const monthlySpendSrd = round2(spendSrdInWindow / months)
  return {
    windowMonths: months,
    bufferPct: thresholds.restockBufferPct,
    monthlyCogsSrd,
    monthlyCeilingSrd,
    monthlySpendSrd,
    monthlyOverspendSrd: round2(monthlySpendSrd - monthlyCeilingSrd),
  }
}
