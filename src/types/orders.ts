import type { Database } from '@/types/database.types'

type ItemRow = Database['public']['Tables']['items']['Row']
type LocationRow = Database['public']['Tables']['locations']['Row']
type WalletRow = Database['public']['Tables']['wallets']['Row']
type ClientRow = Database['public']['Tables']['clients']['Row']
type PurchaseOrderRow = Database['public']['Tables']['purchase_orders']['Row']
type PurchaseOrderItemRow = Database['public']['Tables']['purchase_order_items']['Row']

export type OrdersPageItem = Pick<ItemRow, 'id' | 'name' | 'purchase_price_usd'>

export type OrdersPageLocation = Pick<LocationRow, 'id' | 'name'>

export type OrdersPageWallet = Pick<WalletRow, 'id' | 'person_name' | 'type' | 'currency' | 'balance'>

export type OrdersPageClient = Pick<ClientRow, 'id' | 'name'>

export interface OrdersPageOrderItem extends Pick<
  PurchaseOrderItemRow,
  'id' | 'order_id' | 'item_id' | 'quantity' | 'unit_cost' | 'subtotal' | 'quantity_received'
> {
  items?: OrdersPageItem | null
}

export interface OrdersPageOrder extends Pick<
  PurchaseOrderRow,
  'id' | 'wallet_id' | 'location_id' | 'supplier_id' | 'total_amount' | 'currency' |
  'exchange_rate' | 'status' | 'notes' | 'expected_arrival' | 'created_at' | 'updated_at'
> {
  wallets?: OrdersPageWallet | null
  locations?: OrdersPageLocation | null
  clients?: OrdersPageClient | null
  purchase_order_items?: OrdersPageOrderItem[]
}

export interface OrdersPageDataPayload {
  orders: OrdersPageOrder[]
  items: OrdersPageItem[]
  locations: OrdersPageLocation[]
  wallets: OrdersPageWallet[]
  clients: OrdersPageClient[]
}

export interface OrdersPageDataResponse {
  data: OrdersPageDataPayload
}