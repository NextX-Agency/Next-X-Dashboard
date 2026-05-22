import type { Database } from '@/types/database.types'

export type ReservationsPageClient = Database['public']['Tables']['clients']['Row']
export type ReservationsPageItem = Database['public']['Tables']['items']['Row']
export type ReservationsPageLocation = Database['public']['Tables']['locations']['Row']

export interface ReservationsPageReservationGroupItem {
  id: string
  item_id: string
  item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  combo_id?: string | null
  combo_price?: number | null
}

export interface ReservationsPageReservationGroupComboItem {
  id: string
  item_id: string
  item_name: string
  quantity: number
}

export interface ReservationsPageReservationGroupCombo {
  combo_id: string
  combo_price: number
  items: ReservationsPageReservationGroupComboItem[]
}

export interface ReservationsPageReservationGroup {
  id: string
  client_id: string
  location_id: string
  client_name: string
  location_name: string
  created_at: string
  status: string
  total_amount: number
  items: ReservationsPageReservationGroupItem[]
  combos?: ReservationsPageReservationGroupCombo[]
}

export interface ReservationsPageStats {
  todayReservations: number
  todayTotal: number
  weekReservations: number
  weekTotal: number
  pendingCount: number
  completedCount: number
}

export interface ReservationsPageDataPayload {
  clients: ReservationsPageClient[]
  items: ReservationsPageItem[]
  locations: ReservationsPageLocation[]
  recentReservations: ReservationsPageReservationGroup[]
  reservationStats: ReservationsPageStats
}

export interface ReservationsPageDataResponse {
  data: ReservationsPageDataPayload
}