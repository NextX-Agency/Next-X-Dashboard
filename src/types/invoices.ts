import type { Currency } from '@/lib/currency'
import type { Database } from '@/types/database.types'

export type InvoicesPageLocation = Database['public']['Tables']['locations']['Row']

export interface InvoicesPageSaleInvoiceItem {
  id: string
  item_id: string
  item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  is_custom_price?: boolean
  original_price?: number | null
  discount_reason?: string | null
}

export interface InvoicesPageReservationGroupItem {
  id: string
  item_id: string
  item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  isCombo?: boolean
  combo_id?: string | null
  combo_price?: number | null
}

export interface InvoicesPageReservationGroup {
  id: string
  invoiceNumber: string
  client_id: string
  location_id: string
  client_name: string
  location_name: string
  created_at: string
  status: string
  total_amount: number
  currency: Currency
  type: 'reservation'
  items: InvoicesPageReservationGroupItem[]
}

export interface InvoicesPageSaleInvoice {
  id: string
  invoiceNumber: string
  location_id: string
  location_name: string
  created_at: string
  total_amount: number
  currency: Currency
  payment_method: string | null
  type: 'sale'
  items: InvoicesPageSaleInvoiceItem[]
}

export type InvoicesPageInvoice = InvoicesPageReservationGroup | InvoicesPageSaleInvoice

export interface InvoicesPageStats {
  totalSales: number
  totalReservations: number
  todaySales: number
  todayReservations: number
}

export interface InvoicesPageDataPayload {
  invoices: InvoicesPageInvoice[]
  locations: InvoicesPageLocation[]
  stats: InvoicesPageStats
}

export interface InvoicesPageDataResponse {
  data: InvoicesPageDataPayload
}