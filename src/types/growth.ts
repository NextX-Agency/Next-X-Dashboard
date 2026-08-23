/**
 * Growth signals for the operating dashboard.
 *
 * The dashboard answers "what happened this week". None of its figures tell the
 * owner where the business is actually leaking or compounding: which catalogue
 * earns its shelf space, which stock has stopped moving, whether the reservation
 * queue converts. These are the numbers a decision hangs on.
 *
 * Everything here is SRD at the rate recorded on each sale, and counts only
 * sales that pass `COUNTABLE_SALE` — the same basis the reports page uses, so
 * the two surfaces cannot disagree.
 */

export type GrowthCatalogType = 'audio' | 'watches'

export interface GrowthMonth {
  /** `YYYY-MM`. */
  monthKey: string
  label: string
  revenueSrd: number
  saleCount: number
  /** Change against the previous month, or null when there is no prior month. */
  changePct: number | null
  /** True for the month still in progress — its total is not comparable yet. */
  isPartial: boolean
}

export interface GrowthCatalog {
  catalog: GrowthCatalogType
  label: string
  revenueSrd: number
  unitsSold: number
  salesCount: number
  /** Share of trailing-window revenue, 0-100. */
  revenueSharePct: number
  stockUnits: number
  /** What the unsold stock cost, at the active rate. */
  stockCostSrd: number
  /** Share of all stock capital, 0-100. */
  capitalSharePct: number
  skusInStock: number
  /** SKUs holding stock that sold nothing inside the window. */
  stagnantSkus: number
  /**
   * Revenue earned per SRD of stock capital held. Below 1 means the catalogue
   * has not yet returned what is tied up in it over the window.
   */
  capitalTurn: number | null
}

export interface GrowthStagnantSku {
  id: string
  name: string
  catalog: string
  unitsOnHand: number
  stockCostSrd: number
  lastSoldAt: string | null
  daysSinceSale: number | null
}

export interface GrowthReservations {
  completed: number
  cancelled: number
  pending: number
  /** Completed as a share of everything that reached a decision, 0-100. */
  conversionPct: number | null
}

export interface DashboardGrowth {
  generatedAt: string
  windowDays: number
  exchangeRate: number
  months: GrowthMonth[]
  bestMonth: GrowthMonth | null
  catalogs: GrowthCatalog[]
  stagnant: GrowthStagnantSku[]
  stagnantTotalCostSrd: number
  reservations: GrowthReservations
}

export interface DashboardGrowthResponse {
  data: DashboardGrowth
}
