import type { Database } from '@/types/database.types'

type CommissionRow = Database['public']['Tables']['commissions']['Row']
type SaleRow = Database['public']['Tables']['sales']['Row']
type LocationRow = Database['public']['Tables']['locations']['Row']
type WalletRow = Database['public']['Tables']['wallets']['Row']
type CategoryRow = Database['public']['Tables']['categories']['Row']
type SellerRow = Database['public']['Tables']['sellers']['Row']
type SellerCategoryRateRow = Database['public']['Tables']['seller_category_rates']['Row']

export type CommissionsPageLocation = Pick<
  LocationRow,
  'id' | 'name' | 'address' | 'created_at' | 'updated_at' | 'seller_name' | 'seller_phone' | 'commission_rate' | 'is_active'
>

export type CommissionsPageCategory = Pick<CategoryRow, 'id' | 'name' | 'created_at'>

export type CommissionsPageSale = Pick<
  SaleRow,
  'id' | 'location_id' | 'seller_id' | 'currency' | 'exchange_rate' | 'total_amount' | 'payment_method' | 'notes' | 'created_at' | 'wallet_id'
>

export interface CommissionsPageCommission extends Pick<
  CommissionRow,
  'id' | 'seller_id' | 'sale_id' | 'commission_amount' | 'paid' | 'created_at' | 'location_id' | 'category_id'
> {
  locations?: CommissionsPageLocation | null
  sales?: CommissionsPageSale | null
  categories?: CommissionsPageCategory | null
}

export type CommissionsPageWallet = Pick<
  WalletRow,
  'id' | 'person_name' | 'type' | 'currency' | 'balance' | 'created_at' | 'updated_at' | 'location_id'
>

export type CommissionsPageSeller = Pick<
  SellerRow,
  'id' | 'name' | 'commission_rate' | 'created_at' | 'updated_at' | 'location_id'
>

export type CommissionsPageSellerCategoryRate = Pick<
  SellerCategoryRateRow,
  'id' | 'seller_id' | 'category_id' | 'commission_rate' | 'created_at'
>

export interface CommissionsPageDataPayload {
  commissions: CommissionsPageCommission[]
  locations: CommissionsPageLocation[]
  wallets: CommissionsPageWallet[]
  categories: CommissionsPageCategory[]
  sellers: CommissionsPageSeller[]
  sellerCategoryRates: CommissionsPageSellerCategoryRate[]
}

export interface CommissionsPageDataResponse {
  data: CommissionsPageDataPayload
}