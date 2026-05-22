import type { Database } from '@/types/database.types'

export type SalesPageItem = Database['public']['Tables']['items']['Row']
export type SalesPageLocation = Database['public']['Tables']['locations']['Row']
export type SalesPageExchangeRate = Database['public']['Tables']['exchange_rates']['Row']
export type SalesPageSale = Database['public']['Tables']['sales']['Row']
export type SalesPageSaleItemRow = Database['public']['Tables']['sale_items']['Row']

export interface SalesPageSaleItem extends SalesPageSaleItemRow {
  items?: SalesPageItem
}

export interface SalesPageRecentSale extends SalesPageSale {
  locations?: SalesPageLocation
  sale_items?: SalesPageSaleItem[]
}

export interface SalesPageStats {
  todaySales: number
  todayOrders: number
  weekSales: number
  weekOrders: number
}

export interface SalesPageDataPayload {
  items: SalesPageItem[]
  locations: SalesPageLocation[]
  currentRate: SalesPageExchangeRate | null
  recentSales: SalesPageRecentSale[]
  salesStats: SalesPageStats
}

export interface SalesPageDataResponse {
  data: SalesPageDataPayload
}