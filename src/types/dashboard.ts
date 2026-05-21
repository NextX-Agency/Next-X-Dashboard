export type DashboardActivityKind = 'sale' | 'exchange'

export type DashboardActivityColor = 'orange' | 'blue' | 'green' | 'purple'

export interface DashboardActivity {
  kind: DashboardActivityKind
  title: string
  timestamp: string
  color: DashboardActivityColor
}

export interface DashboardMetrics {
  totalSalesUSD: number
  totalSalesSRD: number
  activeOrders: number
  stockItems: number
  lowStockItems: number
  outOfStockItems: number
  totalRevenue: number
  todaysSalesUSD: number
  todaysSalesSRD: number
  salesTrend: number
  totalSalesTrend: number
  exchangeRate: number
  monthlySalesUSD: number[]
  recentActivity: DashboardActivity[]
}

export interface DashboardResponse {
  data: DashboardMetrics
}