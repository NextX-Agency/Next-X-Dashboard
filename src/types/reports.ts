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
type PurchaseOrderAllocationRow = Database['public']['Tables']['purchase_order_allocations']['Row']
type PurchaseOrderItemRow = Database['public']['Tables']['purchase_order_items']['Row']

export type ReportSaleItem = Pick<
  SaleItemRow,
  'id' | 'sale_id' | 'item_id' | 'quantity' | 'unit_price' | 'subtotal' | 'is_custom_price' | 'original_price' | 'discount_reason' | 'created_at'
> & {
  /**
   * The cost captured onto the line when the sale happened (T-12). Without it
   * the report falls back to the item's purchase price *today*, so re-pricing a
   * product silently rewrites the margin on every sale ever made (F-01).
   *
   * Declared here rather than picked from `SaleItemRow` because the generated
   * `database.types.ts` predates the T-12 columns.
   */
  unit_cost_usd: number | null
  cost_is_estimated: boolean
}

export interface ReportSale extends Pick<
  SaleRow,
  'id' | 'location_id' | 'seller_id' | 'wallet_id' | 'currency' | 'exchange_rate' | 'total_amount' | 'payment_method' | 'notes' | 'created_at'
> {
  sale_items?: ReportSaleItem[]
}

export type ReportItem = Pick<
  ItemRow,
  'id' | 'name' | 'brand' | 'catalog_type' | 'category_id' | 'purchase_price_usd' | 'selling_price_srd' | 'selling_price_usd' | 'is_combo' | 'deleted_at'
>

export type ReportStock = Pick<StockRow, 'id' | 'item_id' | 'location_id' | 'quantity' | 'created_at' | 'updated_at'>

export type ReportExpenseCategory = Pick<ExpenseCategoryRow, 'id' | 'name' | 'created_at'>

export interface ReportExpense extends Pick<
  ExpenseRow,
  'id' | 'category_id' | 'wallet_id' | 'location_id' | 'amount' | 'currency' | 'description' | 'created_at'
  | 'expense_date' | 'vendor_name' | 'receipt_number' | 'classification' | 'status'
> {
  expense_categories?: ReportExpenseCategory | null
}

export interface ReportCommission extends Pick<
  CommissionRow,
  'id' | 'seller_id' | 'sale_id' | 'commission_amount' | 'paid' | 'created_at' | 'location_id' | 'category_id'
> {
  sales?: {
    currency: string
    exchange_rate: number | null
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
> & {
  purchase_order_allocations?: ReportPurchaseOrderAllocation[]
}

export interface ReportPurchaseOrderAllocation extends Pick<
  PurchaseOrderAllocationRow,
  'id' | 'order_item_id' | 'location_id' | 'quantity' | 'quantity_received' | 'created_at' | 'updated_at'
> {
  locations?: ReportLocation | null
}

export interface ReportPurchaseOrder extends Pick<
  PurchaseOrderRow,
  'id' | 'wallet_id' | 'location_id' | 'total_amount' | 'currency' | 'exchange_rate' | 'status' | 'created_at'
> {
  purchase_order_items?: ReportPurchaseOrderItem[]
}

/**
 * Revenue that exists in the books but is deliberately kept out of every
 * derived figure because the record itself is not trustworthy — a header with
 * no line items, or a header disagreeing with its lines.
 *
 * The exclusion is correct: a sale with no cost lines would report a 100%
 * margin. Hiding the exclusion is not. Without this block the reports page
 * showed revenue short by the excluded amount and gave the reader no way to
 * find out, which reads as a bad month rather than a data problem.
 */
export interface ReportExcludedRevenueGroup {
  reason: string
  saleCount: number
  totalSrd: number
  totalUsd: number
  firstSaleAt: string | null
  lastSaleAt: string | null
}

export interface ReportExcludedRevenue {
  saleCount: number
  totalSrd: number
  totalUsd: number
  groups: ReportExcludedRevenueGroup[]
}

/**
 * The rate every USD figure on the reports page is converted with, and when it
 * was set. Every dollar amount here is only as current as this rate, so the
 * page has to be able to say how old it is.
 */
export interface ReportExchangeRate {
  usdToSrd: number
  setAt: string | null
  ageDays: number | null
  isStale: boolean
}

export interface ReportsDataPayload {
  sales: ReportSale[]
  exchangeRate: ReportExchangeRate
  /** Posted sales held out of `sales` because they are flagged for review. */
  excludedRevenue: ReportExcludedRevenue
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
