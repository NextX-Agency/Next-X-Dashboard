import type { Database } from '@/types/database.types'

type SaleRow = Database['public']['Tables']['sales']['Row']
type SaleItemRow = Database['public']['Tables']['sale_items']['Row']
type ItemRow = Database['public']['Tables']['items']['Row']
type StockRow = Database['public']['Tables']['stock']['Row']
type ExpenseRow = Database['public']['Tables']['expenses']['Row']
type ExpenseCategoryRow = Database['public']['Tables']['expense_categories']['Row']
type CommissionRow = Database['public']['Tables']['commissions']['Row']
type LocationRow = Database['public']['Tables']['locations']['Row']
type WalletRow = Database['public']['Tables']['wallets']['Row']
type WalletTransactionRow = Database['public']['Tables']['wallet_transactions']['Row']
type ReservationRow = Database['public']['Tables']['reservations']['Row']
type ComboItemRow = Database['public']['Tables']['combo_items']['Row']
type SellerRow = Database['public']['Tables']['sellers']['Row']
type CategoryRow = Database['public']['Tables']['categories']['Row']
type PurchaseOrderRow = Database['public']['Tables']['purchase_orders']['Row']
type PurchaseOrderItemRow = Database['public']['Tables']['purchase_order_items']['Row']

export type ReportSaleItem = Pick<
  SaleItemRow,
  'id' | 'sale_id' | 'item_id' | 'quantity' | 'unit_price' | 'subtotal' | 'is_custom_price' | 'original_price' | 'discount_reason' | 'created_at'
>

export interface ReportSale extends Pick<
  SaleRow,
  'id' | 'location_id' | 'seller_id' | 'wallet_id' | 'currency' | 'exchange_rate' | 'total_amount' | 'payment_method' | 'notes' | 'created_at'
> {
  sale_items?: ReportSaleItem[]
}

export type ReportItem = Pick<
  ItemRow,
  'id' | 'name' | 'brand' | 'category_id' | 'purchase_price_usd' | 'selling_price_srd' | 'selling_price_usd' | 'is_combo' | 'deleted_at'
>

export type ReportStock = Pick<StockRow, 'id' | 'item_id' | 'location_id' | 'quantity' | 'created_at' | 'updated_at'>

export type ReportExpenseCategory = Pick<ExpenseCategoryRow, 'id' | 'name' | 'created_at'>

export interface ReportExpense extends Pick<
  ExpenseRow,
  'id' | 'category_id' | 'wallet_id' | 'location_id' | 'amount' | 'currency' | 'description' | 'created_at'
> {
  expense_categories?: ReportExpenseCategory | null
}

export interface ReportCommission extends Pick<
  CommissionRow,
  'id' | 'seller_id' | 'sale_id' | 'commission_amount' | 'paid' | 'created_at' | 'location_id' | 'category_id'
> {
  sales?: {
    currency: string
  } | null
}

export type ReportLocation = Pick<LocationRow, 'id' | 'name'>

export type ReportWallet = Pick<
  WalletRow,
  'id' | 'person_name' | 'type' | 'currency' | 'balance' | 'location_id' | 'created_at' | 'updated_at'
>

export type ReportWalletTransaction = Pick<
  WalletTransactionRow,
  'id' | 'wallet_id' | 'sale_id' | 'type' | 'amount' | 'balance_before' | 'balance_after' | 'description' | 'created_at' | 'expense_id' | 'currency' | 'reference_type' | 'reference_id'
>

export interface ReportReservation extends Pick<
  ReservationRow,
  'id' | 'client_id' | 'item_id' | 'location_id' | 'quantity' | 'status' | 'notes' | 'created_at' | 'updated_at' | 'combo_id' | 'combo_price' | 'original_price'
> {
  items?: ReportItem | null
  clients?: {
    name: string
  } | null
}

export type ReportComboItem = Pick<ComboItemRow, 'id' | 'combo_id' | 'item_id' | 'quantity' | 'created_at'>

export type ReportSeller = Pick<SellerRow, 'id' | 'name' | 'commission_rate' | 'location_id'>

export type ReportCategory = Pick<CategoryRow, 'id' | 'name' | 'created_at'>

export type ReportPurchaseOrderItem = Pick<
  PurchaseOrderItemRow,
  'id' | 'order_id' | 'item_id' | 'quantity' | 'unit_cost' | 'subtotal' | 'quantity_received' | 'created_at'
>

export interface ReportPurchaseOrder extends Pick<
  PurchaseOrderRow,
  'id' | 'wallet_id' | 'location_id' | 'total_amount' | 'currency' | 'exchange_rate' | 'status' | 'created_at'
> {
  purchase_order_items?: ReportPurchaseOrderItem[]
}

export interface ReportsDataPayload {
  sales: ReportSale[]
  items: ReportItem[]
  stocks: ReportStock[]
  locations: ReportLocation[]
  expenses: ReportExpense[]
  commissions: ReportCommission[]
  wallets: ReportWallet[]
  walletTransactions: ReportWalletTransaction[]
  reservations: ReportReservation[]
  comboItems: ReportComboItem[]
  sellers: ReportSeller[]
  categories: ReportCategory[]
  purchaseOrders: ReportPurchaseOrder[]
}

export interface ReportsDataResponse {
  data: ReportsDataPayload
}