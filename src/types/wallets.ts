import type { Database } from '@/types/database.types'

type LocationRow = Database['public']['Tables']['locations']['Row']
type WalletRow = Database['public']['Tables']['wallets']['Row']
type WalletTransactionRow = Database['public']['Tables']['wallet_transactions']['Row']

export type WalletsPageLocation = Pick<
  LocationRow,
  'id' | 'name' | 'address' | 'created_at' | 'updated_at' | 'seller_name' | 'seller_phone' | 'commission_rate' | 'is_active'
>

export interface WalletsPageWallet extends Pick<
  WalletRow,
  'id' | 'person_name' | 'type' | 'currency' | 'balance' | 'created_at' | 'updated_at' | 'location_id'
> {
  locations?: WalletsPageLocation | null
}

export interface WalletsPageTransaction extends Pick<
  WalletTransactionRow,
  'id' | 'wallet_id' | 'type' | 'amount' | 'balance_before' | 'balance_after' | 'description' |
  'created_at' | 'currency' | 'reference_type' | 'reference_id'
> {
  wallets?: WalletsPageWallet | null
}

export interface WalletsPageDataPayload {
  wallets: WalletsPageWallet[]
  locations: WalletsPageLocation[]
  transactions: WalletsPageTransaction[]
}

export interface WalletsPageDataResponse {
  data: WalletsPageDataPayload
}